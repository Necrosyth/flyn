import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { NocoBaseService } from '../nocobase/nocobase.service';
import { jlog } from '../common/structured-log';

/**
 * Shared grounding for AI agents (voice, inbox draft, smart-agents).
 *
 * Fetches the REAL business identity and the REAL record of the person being contacted, so an
 * agent never has to invent who it represents, who it's talking to, or what they owe. This is
 * the fix for agents reading template placeholders aloud ("[Customer's Name]", "[Amount]") and
 * hallucinating facts ("45 days overdue") — the model is starved of real data otherwise.
 *
 * Design notes:
 *  - Every external read is wrapped in try/catch + a per-read timeout. A failure on any single
 *    field degrades to null/[] — it NEVER throws and NEVER stalls a live phone call.
 *  - Invoices live in NocoBase (collection `flyn_accounting_invoices`), not Firestore, so they
 *    are read via NocoBaseService (a @Global leaf — no module cycle, unlike AccountingService
 *    which depends on ChannelsService).
 */

export interface AgentGroundingOverdueInvoice {
  invoiceNumber: string;
  outstandingBalance: string; // formatted with a currency symbol
  dueDate: string;            // human-readable
  daysOverdue: number;
}

export interface AgentGrounding {
  businessName: string;
  contactName: string | null;
  contactCompany: string | null;
  contactTags: string[];
  overdueInvoices: AgentGroundingOverdueInvoice[];
}

const INVOICES_COLLECTION = 'flyn_accounting_invoices';
const READ_TIMEOUT_MS = 1_800;

@Injectable()
export class AgentGroundingService {
  private readonly logger = new Logger(AgentGroundingService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly nocobase: NocoBaseService,
  ) {}

  private withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), READ_TIMEOUT_MS)),
    ]);
  }

  /** Last 10 digits — loose phone match across +91 / 91 / 10-digit storage formats. */
  private last10(raw: string): string {
    return (raw || '').replace(/\D/g, '').slice(-10);
  }

  private currencyForCountry(country?: string): string {
    const c = (country || '').toUpperCase();
    if (c === 'IN' || c === 'INDIA') return '₹';
    if (c === 'GB' || c === 'UK') return '£';
    if (c === 'EU' || ['DE', 'FR', 'ES', 'IT', 'NL'].includes(c)) return '€';
    return '$';
  }

  private formatAmount(raw: unknown, country?: string): string {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    // Already has a non-alphanumeric currency marker → leave as-is.
    if (/[₹$£€]/.test(s)) return s;
    return `${this.currencyForCountry(country)}${s}`;
  }

  private daysBetween(dueDate: string): number {
    const due = new Date(dueDate).getTime();
    if (Number.isNaN(due)) return 0;
    return Math.max(0, Math.floor((Date.now() - due) / 86_400_000));
  }

  /**
   * Resolve the full grounding for a tenant + the phone number being contacted.
   * Always resolves (never rejects); missing data → null / empty array.
   */
  async buildGrounding(tenantId: string, counterpartyPhone: string | null): Promise<AgentGrounding> {
    const db = this.firebase.firestore();
    const phone10 = counterpartyPhone ? this.last10(counterpartyPhone) : '';

    const [tenantRes, contactRes, invoiceRes] = await Promise.allSettled([
      // 1) Business identity
      this.withTimeout(db.collection('tenants').doc(tenantId).get(), 'tenant'),
      // 2) The person being contacted — CRM contact by phone (bounded scan, match last-10)
      phone10
        ? this.withTimeout(db.collection('tenants').doc(tenantId).collection('crmContacts').limit(500).get(), 'crmContacts')
        : Promise.resolve(null),
      // 3) Their real overdue invoices (NocoBase). Skipped when NocoBase isn't connected.
      phone10 && this.nocobase.isConnected
        ? this.withTimeout(
            this.nocobase.list<any>(INVOICES_COLLECTION, { pageSize: 200, filter: { status: 'overdue', tenant_id: tenantId } }),
            'invoices',
          )
        : Promise.resolve(null),
    ]);

    // Business name
    let businessName = 'our team';
    if (tenantRes.status === 'fulfilled' && (tenantRes.value as any)?.exists) {
      const d = (tenantRes.value as any).data() || {};
      businessName = d.businessName || d.companyName || d.name || businessName;
    } else if (tenantRes.status === 'rejected') {
      this.logger.warn(jlog({ event: 'grounding_tenant_read_failed', tenantId, error: (tenantRes.reason as Error)?.message }));
    }

    // Contact
    let contactName: string | null = null;
    let contactCompany: string | null = null;
    let contactTags: string[] = [];
    if (phone10 && contactRes.status === 'fulfilled' && (contactRes.value as any)?.docs) {
      for (const doc of (contactRes.value as any).docs) {
        const c = doc.data() || {};
        if (this.last10(String(c.phone || '')) === phone10) {
          contactName = (c.name as string) || null;
          contactCompany = (c.company as string) || null;
          contactTags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
          break;
        }
      }
    } else if (contactRes.status === 'rejected') {
      this.logger.warn(jlog({ event: 'grounding_contact_read_failed', tenantId, error: (contactRes.reason as Error)?.message }));
    }

    // Overdue invoices for this contact (match by clientPhone last-10)
    const overdueInvoices: AgentGroundingOverdueInvoice[] = [];
    if (phone10 && invoiceRes.status === 'fulfilled' && invoiceRes.value) {
      const rows: any[] = (invoiceRes.value as any).data ?? [];
      for (const r of rows) {
        const cp = this.last10(String(r.clientPhone ?? r.client_phone ?? ''));
        if (cp && cp !== phone10) continue; // wrong customer
        if (!cp) continue;                  // no phone on the invoice → can't safely attribute
        const dueDate = String(r.dueDate ?? r.due_date ?? '');
        overdueInvoices.push({
          invoiceNumber: String(r.invoice ?? r.invoiceNumber ?? ''),
          outstandingBalance: this.formatAmount(
            r.outstandingBalance ?? r.outstanding_balance ?? r.amount,
            r.clientCountry ?? r.client_country,
          ),
          dueDate,
          daysOverdue: this.daysBetween(dueDate),
        });
      }
    } else if (invoiceRes.status === 'rejected') {
      this.logger.warn(jlog({ event: 'grounding_invoice_read_failed', tenantId, error: (invoiceRes.reason as Error)?.message }));
    }

    return { businessName, contactName, contactCompany, contactTags, overdueInvoices };
  }

  /**
   * Substitute the common template placeholders in an agent's system prompt with real values,
   * then wrap it with a VERIFIED CONTEXT header and a hard anti-hallucination guardrail.
   * Returns the final, ready-to-send system prompt.
   */
  applyGrounding(systemPrompt: string, g: AgentGrounding): string {
    const firstInvoice = g.overdueInvoices[0];
    const amount = firstInvoice?.outstandingBalance || '';
    const days = firstInvoice ? String(firstInvoice.daysOverdue) : '';

    let p = systemPrompt || '';
    // Business identity placeholders
    p = p.replace(/\[Company Name\]|\[SaaS Company Name\]|\[Business Name\]|\{\{businessName\}\}/gi, g.businessName);
    // Customer identity
    p = g.contactName
      ? p.replace(/\[Customer'?s? Name\]|\[Client Name\]|\[Name\]/gi, g.contactName)
      : p.replace(/\s*\[Customer'?s? Name\]|\s*\[Client Name\]|\s*\[Name\]/gi, '');
    p = g.contactCompany
      ? p.replace(/\[Customer'?s? Company Name\]|\[Company\]/gi, g.contactCompany)
      : p.replace(/\s*from\s*\[Customer'?s? Company Name\]|\s*\[Customer'?s? Company Name\]|\s*\[Company\]/gi, '');
    // Amount
    p = amount
      ? p.replace(/\[Amount\]/gi, amount)
      : p.replace(/\[Amount\]/gi, 'the outstanding amount');
    // Days overdue — replace "[N] days", "[days]", and the literal hardcoded "45 days" template value
    if (days) {
      p = p.replace(/\[\s*X\s*\]\s*days|\[\s*days\s*\]\s*(overdue)?|\[\s*\d+\s*\]\s*days/gi, `${days} days`);
      p = p.replace(/\b45 days\b/g, `${days} days`);
    } else {
      p = p.replace(/\[\s*X\s*\]\s*days( overdue)?|\[\s*days\s*\]( overdue)?|\[\s*\d+\s*\]\s*days( overdue)?/gi, 'the overdue period');
    }
    // Any remaining unfilled placeholder → strip brackets, keep neutral wording.
    p = p.replace(/\[([^\]]+)\]/g, '$1');

    const ctxLines: string[] = [
      '=== VERIFIED CONTEXT — use ONLY these facts ===',
      `You represent: ${g.businessName}`,
      `You are speaking with: ${g.contactName || 'the account holder'}${g.contactCompany ? `, from ${g.contactCompany}` : ''}`,
    ];
    if (g.contactTags.length) ctxLines.push(`Customer labels: ${g.contactTags.join(', ')}`);
    if (g.overdueInvoices.length) {
      ctxLines.push('Outstanding (verified):');
      for (const inv of g.overdueInvoices.slice(0, 3)) {
        ctxLines.push(
          `  - Invoice ${inv.invoiceNumber || '(no number)'}: ${inv.outstandingBalance || 'amount unknown'}` +
            `${inv.daysOverdue ? `, ${inv.daysOverdue} days overdue` : ''}${inv.dueDate ? ` (due ${inv.dueDate})` : ''}`,
        );
      }
    } else {
      ctxLines.push('No confirmed overdue invoices in the system — do NOT state any amount; ask the customer to confirm.');
    }
    ctxLines.push('=== END CONTEXT ===');

    const guardrail = [
      '=== HARD RULES ===',
      'Use ONLY the verified context above. NEVER invent amounts, balances, due dates, days overdue, names, or company names.',
      'If a value is not in the context, do not state it — ask the customer or say you will check and follow up.',
      'Any [bracketed] text that remains is an unfilled placeholder — never read it aloud.',
      'Keep every response to 1-2 sentences. This is a phone call.',
    ].join('\n');

    return `${ctxLines.join('\n')}\n\n${p}\n\n${guardrail}`;
  }
}
