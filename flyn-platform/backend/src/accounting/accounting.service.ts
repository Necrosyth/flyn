/**
 * Accounting Service — NocoBase Backend
 *
 * Persistent storage via the shared NocoBaseService.
 * Falls back to in-memory arrays when NocoBase is unavailable.
 *
 * Collections:
 *   flyn_accounting_invoices  — Invoice / billing records
 *   flyn_accounting_expenses  — Expense records
 */

import { Injectable, Logger, Inject, forwardRef, Optional, ConflictException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Invoice, Expense, InvoiceStatus, CreditNote, FX_RATES, PartialPayment, InvoiceLineItem, RecurringConfig, VendorBill, VendorBillStatus, GATEWAY_REGISTRY, PaymentGateway, ReconciliationEntry, BulkPaymentBatch, BulkPaymentEntry, BulkPaymentFormat, DEFAULT_DUNNING_STEPS, DunningStep, TAX_CODE_LIBRARY, TaxCode, TaxType, AuditEntry, AuditAction, ArchivedDocument, RETENTION_RULES, ReceiptScan, ExpenseApproval, MileageEntry, MILEAGE_RATES, PettyCashEntry, DonorFund, EXPENSE_CATEGORIES, PayrollRun, PayrollEntry, PayrollDeduction, PAYROLL_DEDUCTIONS, EOSBCalculation, ProfitAndLoss, CashFlowForecast, ARAgingBucket, BankAccount, BankTransaction, IntercompanyTransfer, SubscriptionPlan, Subscription, Coupon, ProrationResult, ChurnMetrics, DEFAULT_LOCALIZED_PRICES, WebhookEndpoint, WebhookEvent, IntegrationSync, ExternalSyncConfig, AccountingRole, AccountingPermission, ROLE_PERMISSIONS, ApprovalChain, LegalEntity, AccountantInvite, ExportLog, COUNTRY_DATA_REGION, COUNTRY_CONFIGS, CountryConfig } from './accounting.types';
import { NocoBaseService } from '../nocobase/nocobase.service';
import { FirebaseService } from '../firebase/firebase.service';
import { TenantsService } from '../tenants/tenants.service';
import { MailService } from '../mail/mail.service';
import { ChannelsService } from '../channels/channels.service';
import { InvoicePDFService } from './invoice-pdf.service';
import { StripeService } from './stripe.service';
import { XeroSyncService } from './xero-sync.service';
import { QuickBooksSyncService } from './quickbooks-sync.service';
import { CrmService } from '../crm/crm.service';
import { HRService } from '../hr/hr.service';
import { PhonebookService } from '../phonebook/phonebook.service';

const COL_INVOICES = 'flyn_accounting_invoices';
const COL_EXPENSES = 'flyn_accounting_expenses';

// ── In-memory fallback ────────────────────────────────────────────────────────
const _invoices: Invoice[] = [];
const _expenses: Expense[] = [];
const _creditNotes: CreditNote[] = [];
const _vendorBills: VendorBill[] = [];
const _reconciliation: ReconciliationEntry[] = [];
const _bulkPayments: BulkPaymentBatch[] = [];
const _auditTrail: AuditEntry[] = [];
const _archivedDocs: ArchivedDocument[] = [];
const _receiptScans: ReceiptScan[] = [];
const _expenseApprovals: ExpenseApproval[] = [];
const _mileageEntries: MileageEntry[] = [];
const _pettyCash: PettyCashEntry[] = [];
let _pettyCashBalance = 0;
const _donorFunds: DonorFund[] = [];
const _payrollRuns: PayrollRun[] = [];
const _bankAccounts: BankAccount[] = [];
const _bankTransactions: BankTransaction[] = [];
const _intercompanyTransfers: IntercompanyTransfer[] = [];
const _subscriptionPlans: SubscriptionPlan[] = [];
const _subscriptions: Subscription[] = [];
const _coupons: Coupon[] = [];
const _webhooks: WebhookEndpoint[] = [];
const _customTaxCodes: TaxCode[] = [];
const _integrationSyncs: IntegrationSync[] = [];
const _externalSyncs: ExternalSyncConfig[] = [];
const _approvalChains: ApprovalChain[] = [];
const _legalEntities: LegalEntity[] = [];
const _accountantInvites: AccountantInvite[] = [];
const _exportLogs: ExportLog[] = [];
function mkId() { return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// ── Duplicate detection helpers ───────────────────────────────────────────────
function norm(v: unknown): string { return String(v ?? '').trim().toLowerCase(); }
function isDuplicateInvoice(data: Partial<any>, existing: any[]): boolean {
  return existing.some(inv =>
    norm(inv.client) === norm(data.client) &&
    norm(inv.amount) === norm(data.amount) &&
    norm(inv.currency) === norm(data.currency) &&
    norm(inv.type) === norm(data.type) &&
    norm(inv.dueDate) === norm(data.dueDate) &&
    norm(inv.description) === norm(data.description) &&
    norm(inv.clientEmail) === norm(data.clientEmail) &&
    norm(inv.clientCountry) === norm(data.clientCountry) &&
    norm(inv.module) === norm(data.module) &&
    JSON.stringify(inv.lineItems ?? []) === JSON.stringify(data.lineItems ?? [])
  );
}
function isDuplicateExpense(data: Partial<any>, existing: any[]): boolean {
  return existing.some(exp =>
    norm(exp.description) === norm(data.description) &&
    norm(exp.amount) === norm(data.amount) &&
    norm(exp.currency) === norm(data.currency) &&
    norm(exp.category) === norm(data.category) &&
    norm(exp.date) === norm(data.date) &&
    norm(exp.merchant) === norm(data.merchant) &&
    norm(exp.employee) === norm(data.employee) &&
    norm(exp.paymentMethod ?? (data as any).paymentMethod) === norm((data as any).paymentMethod) &&
    norm(exp.notes) === norm(data.notes)
  );
}
function isDuplicateVendorBill(data: Partial<any>, existing: any[]): boolean {
  return existing.some(bill =>
    norm(bill.vendor) === norm(data.vendor) &&
    norm(bill.vendorEmail) === norm(data.vendorEmail) &&
    norm(bill.amount) === norm(data.amount) &&
    norm(bill.currency) === norm(data.currency) &&
    norm(bill.dueDate) === norm(data.dueDate) &&
    norm(bill.description) === norm(data.description) &&
    norm(bill.category) === norm(data.category) &&
    norm(bill.reference) === norm(data.reference) &&
    norm(bill.paymentMethod) === norm(data.paymentMethod)
  );
}
let _invoiceSeq = 100;
let _creditSeq = 100;
function nextInvoiceNumber(prefix = 'INV'): string {
  return `${prefix}-${new Date().getFullYear()}-${String(++_invoiceSeq).padStart(3, '0')}`;
}
function nextCreditNoteNumber(): string {
  return `CN-${new Date().getFullYear()}-${String(++_creditSeq).padStart(3, '0')}`;
}

// ── FX Conversion ─────────────────────────────────────────────────────────────
function convertCurrency(amount: number, from: string, to: string): number {
  const fromRate = FX_RATES[from] ?? 1;
  const toRate = FX_RATES[to] ?? 1;
  return (amount / fromRate) * toRate;
}

// ── Line Item Calculator ──────────────────────────────────────────────────────
function calculateLineItems(items: InvoiceLineItem[]): { subtotal: number; totalDiscount: number; totalTax: number; grandTotal: number } {
  let subtotal = 0, totalDiscount = 0, totalTax = 0;
  for (const item of items) {
    const lineSubtotal = item.quantity * item.unitPrice;
    const discountAmt = lineSubtotal * ((item.discount ?? 0) / 100);
    const afterDiscount = lineSubtotal - discountAmt;
    const taxAmt = afterDiscount * ((item.taxRate ?? 0) / 100);
    subtotal += lineSubtotal;
    totalDiscount += discountAmt;
    totalTax += taxAmt;
    item.total = afterDiscount + taxAmt;
  }
  return { subtotal, totalDiscount, totalTax, grandTotal: subtotal - totalDiscount + totalTax };
}

// ── Payment Link Generator ────────────────────────────────────────────────────
function generatePaymentLink(invoiceId: string, _currency: string, tenantId?: string): string {
  const base = process.env.PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const path = `/api/accounting/public/invoices/${invoiceId}/pay`;
  return tenantId ? `${base}${path}?tenant=${tenantId}` : `${base}${path}`;
}

// ── Region Detection ──────────────────────────────────────────────────────────
function detectRegion(currency: string): 'US' | 'ME' | 'AF' | 'AS' {
  if (['AED', 'SAR', 'EGP', 'JOD'].includes(currency)) return 'ME';
  if (['GHS', 'KES', 'ZAR'].includes(currency)) return 'AF';
  if (['INR', 'PHP', 'PKR', 'IDR', 'MYR'].includes(currency)) return 'AS';
  return 'US';
}

function mapInvoice(r: any): Invoice {
  return {
    _id: String(r.id ?? r._id ?? mkId()),
    invoice: r.invoice ?? r.invoice_number ?? nextInvoiceNumber(),
    type: r.type ?? 'standard',
    client: r.client ?? '',
    clientEmail: r.clientEmail ?? r.client_email,
    clientPhone: r.clientPhone ?? r.client_phone,
    clientCountry: r.clientCountry ?? r.client_country,
    amount: r.amount ?? '0',
    status: (r.status ?? 'draft') as InvoiceStatus,
    dueDate: r.dueDate ?? r.due_date ?? '',
    module: r.module ?? r.source_module ?? 'Other',
    description: r.description,
    currency: r.currency ?? 'USD',
    baseCurrencyAmount: r.baseCurrencyAmount,
    language: r.language ?? 'en',
    taxAmount: r.taxAmount ?? r.tax_amount,
    taxCode: r.taxCode ?? r.tax_code ?? undefined,
    taxRate: r.taxRate ?? r.tax_rate ?? undefined,
    paymentTerms: r.paymentTerms ?? r.payment_terms ?? undefined,
    taxId: r.taxId ?? r.tax_id ?? undefined,
    lineItems: r.lineItems ?? [],
    subtotal: r.subtotal,
    totalDiscount: r.totalDiscount,
    totalTax: r.totalTax,
    compliance: r.compliance && Object.keys(r.compliance).length > 0
      ? r.compliance
      : (() => {
        const region = r.compliance_region ?? r.region ?? 'US';
        const taxId = r.tax_id ?? r.taxId ?? undefined;
        return {
          region,
          ...(taxId ? { taxId, ...(region === 'US' ? { ein: taxId } : {}) } : {}),
          isRTL: region === 'ME',
        };
      })(),
    recurring: r.recurring ?? (r.recurring_config ? (() => { try { return JSON.parse(r.recurring_config); } catch { return undefined; } })() : undefined) ?? (r.type === 'recurring' ? (() => {
      const today = new Date().toISOString().slice(0, 10);
      const due = r.due_date ?? r.dueDate ?? today;
      const next = new Date(due); next.setMonth(next.getMonth() + 1);
      return { frequency: 'monthly', startDate: due, nextRunDate: next.toISOString().slice(0, 10), autoSend: false, remindersEnabled: false };
    })() : undefined),
    paymentLink: r.paymentLink,
    paymentMethod: r.paymentMethod,
    partialPayments: r.partialPayments ?? (r.partial_payments ? (() => { try { return JSON.parse(r.partial_payments); } catch { return []; } })() : []),
    outstandingBalance: r.outstandingBalance ?? r.outstanding_balance ?? r.amount ?? '0',
    linkedCreditNotes: r.linkedCreditNotes ?? [],
    linkedCreditNoteTotal: r.linkedCreditNoteTotal ?? r.linked_credit_note_total ?? undefined,
    linkedToInvoice: r.linkedToInvoice ?? r.linked_to_invoice ?? undefined,
    linkedToInvoiceId: r.linkedToInvoiceId ?? r.linked_to_invoice_id ?? undefined,
    isProForma: r.isProForma ?? false,
    customsReference: r.customsReference,
    xeroSynced: r.xero_synced ?? r.xeroSynced ?? false,
    xeroSyncedAt: r.xero_synced_at ? new Date(r.xero_synced_at) : undefined,
    qboSynced: r.qbo_synced ?? r.qboSynced ?? false,
    qboSyncedAt: r.qbo_synced_at ? new Date(r.qbo_synced_at) : undefined,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
  };
}

function mapExpense(r: any): Expense {
  return {
    _id: String(r.id ?? r._id ?? mkId()),
    description: r.description ?? '',
    amount: r.amount ?? '0',
    currency: r.currency ?? 'USD',
    category: r.category ?? 'General',
    date: r.date ?? new Date().toISOString().slice(0, 10),
    status: (r.status ?? 'pending') as Expense['status'],
    employee: r.employee,
    receipt: r.receipt,
    merchant: r.merchant,
    taxId: r.taxId ?? r.tax_id,
    notes: r.notes,
    paymentMethod: r.paymentMethod ?? r.payment_method,
    source: r.source,
    storageDestination: r.storageDestination ?? r.storage_destination,
    tenant_id: r.tenant_id,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
  };
}

// ── Parse numeric amount from string like "$5,000" or "5000" ─────────────────
function parseAmount(s: string): number {
  return parseFloat(String(s).replace(/[^0-9.\-]/g, '')) || 0;
}

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private readonly nc: NocoBaseService,
    private readonly firebase: FirebaseService,
    private readonly xeroSync: XeroSyncService,
    private readonly qboSync: QuickBooksSyncService,
    private readonly tenantsService: TenantsService,
    private readonly mailService: MailService,
    private readonly channelsService: ChannelsService,
    private readonly invoicePdf: InvoicePDFService,
    @Inject(forwardRef(() => StripeService))
    private readonly stripeService: StripeService,
    @Optional()
    @Inject(forwardRef(() => CrmService))
    private readonly crmService: CrmService | null,
    private readonly moduleRef: ModuleRef,
  ) {
    const publicUrl = process.env.PUBLIC_BACKEND_URL ?? '';
    if (!publicUrl || publicUrl.includes('localhost') || publicUrl.includes('127.0.0.1')) {
      this.logger.warn(
        `⚠️  PUBLIC_BACKEND_URL="${publicUrl || '(unset)'}" — payment links embedded in invoices and WhatsApp messages will point to localhost. Set PUBLIC_BACKEND_URL=https://api.myflynai.com in your production environment.`,
      );
    }
  }

  async findTenantByStripeAccountId(stripeUserId: string) {
    return this.tenantsService.findByStripeAccountId(stripeUserId);
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async getInvoiceById(id: string, tenantId?: string): Promise<Invoice | null> {
    if (!this.nc.isConnected) {
      return _invoices.find(i => i._id === id) ?? null;
    }
    try {
      const res = await this.nc.get<any>(COL_INVOICES, id);
      if (res && (!tenantId || res.tenant_id === tenantId)) {
        return mapInvoice(res);
      }
      return null;
    } catch {
      return null;
    }
  }

  async getInvoices(params: {
    search?: string;
    status?: string;
    module?: string;
    limit?: number;
    tenantId?: string;
  } = {}): Promise<{ data: Invoice[]; total: number }> {
    if (!this.nc.isConnected) {
      let list = [..._invoices];
      if (params.search) list = list.filter(i => i.client.toLowerCase().includes(params.search!.toLowerCase()) || i.invoice.toLowerCase().includes(params.search!.toLowerCase()));
      if (params.status) list = list.filter(i => i.status === params.status);
      if (params.module) list = list.filter(i => i.module === params.module);
      return { data: list.slice(0, params.limit ?? 100), total: list.length };
    }
    try {
      const filter: Record<string, unknown> = {};
      if (params.status) filter['status'] = params.status;
      if (params.module) filter['source_module'] = params.module;
      if (params.tenantId) filter['tenant_id'] = params.tenantId;
      const result = await this.nc.list<any>(COL_INVOICES, { pageSize: params.limit ?? 100, filter });
      const rawRows: any[] = result?.data ?? [];
      const data = rawRows.map(mapInvoice);

      // Backfill recurring_config for recurring invoices that were saved without it
      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        if (raw.type === 'recurring' && !raw.recurring_config && data[i].recurring) {
          this.nc.update(COL_INVOICES, String(raw.id ?? raw._id), {
            recurring_config: JSON.stringify(data[i].recurring),
          }).catch(() => { /* best-effort */ });
        }
      }

      const searched = params.search
        ? data.filter(i => i.client.toLowerCase().includes(params.search!.toLowerCase()) || i.invoice.toLowerCase().includes(params.search!.toLowerCase()))
        : data;
      return { data: searched, total: searched.length };
    } catch (err) {
      this.logger.warn(`getInvoices fallback: ${(err as Error).message}`);
      return { data: [], total: 0 };
    }
  }

  async createInvoice(data: Partial<Invoice>, tenantId?: string): Promise<Invoice> {
    if (isDuplicateInvoice(data, _invoices)) {
      throw new ConflictException('A duplicate invoice with identical fields already exists. Change at least one field to create a new invoice.');
    }
    const isProForma = data.isProForma || data.type === 'proforma';
    const prefix = isProForma ? 'PF' : 'INV';
    const invoiceNumber = data.invoice ?? nextInvoiceNumber(prefix);
    const currency = data.currency ?? 'USD';
    const region = detectRegion(currency);

    // Calculate line items if provided
    let computedAmount = data.amount ?? '0';
    let subtotal = '0', totalDiscount = '0', totalTax = '0';
    if (data.lineItems && data.lineItems.length > 0) {
      const calc = calculateLineItems(data.lineItems);
      computedAmount = calc.grandTotal.toFixed(2);
      subtotal = calc.subtotal.toFixed(2);
      totalDiscount = calc.totalDiscount.toFixed(2);
      totalTax = calc.totalTax.toFixed(2);
    } else {
      // No line items — apply taxRate or pre-supplied taxAmount to base amount
      const base = parseFloat(data.amount ?? '0');
      const taxRate = parseFloat((data as any).taxRate ?? '0');
      const preTax = parseFloat(data.taxAmount ?? '0');
      const tax = taxRate > 0 ? parseFloat((base * taxRate / 100).toFixed(2)) : preTax;
      if (tax > 0) {
        subtotal = base.toFixed(2);
        totalTax = tax.toFixed(2);
        computedAmount = (base + tax).toFixed(2);
      }
    }

    let appliedCoupon = null;
    if ((data as any).couponCode) {
      const couponRes = await this.applyCoupon((data as any).couponCode, parseFloat(computedAmount), tenantId, data.clientCountry, true);
      if (couponRes.valid) {
        computedAmount = couponRes.discountedAmount.toFixed(2);
        totalDiscount = (parseFloat(totalDiscount) + couponRes.discount).toFixed(2);
        appliedCoupon = (data as any).couponCode;
      }
    }

    // FX conversion to base currency (USD)
    const baseCurrencyAmount = currency !== 'USD'
      ? convertCurrency(parseAmount(computedAmount), currency, 'USD').toFixed(2)
      : computedAmount;

    // Auto-detect language from country/currency
    const language = data.language
      ?? (['AED', 'SAR', 'EGP', 'JOD'].includes(currency) ? 'ar'
        : ['GHS'].includes(currency) ? 'en'
          : ['KES'].includes(currency) ? 'sw'
            : ['INR'].includes(currency) ? 'hi'
              : ['IDR', 'MYR'].includes(currency) ? 'id'
                : 'en');

    // Build compliance from region + incoming data
    const rawTaxId = (data as any).taxId;
    const compliance = {
      region,
      ...(data.compliance ?? {}),
      ...(rawTaxId ? { taxId: rawTaxId, ...(region === 'US' ? { ein: rawTaxId } : {}) } : {}),
      isRTL: region === 'ME',
    };

    // Default payment terms for US
    if (region === 'US' && !compliance.paymentTerms) {
      compliance.paymentTerms = 'NET_30';
    }

    const id = mkId();
    const inv: Invoice = {
      _id: id,
      invoice: invoiceNumber,
      type: data.type ?? (isProForma ? 'proforma' : 'standard'),
      client: data.client ?? 'Unknown',
      clientEmail: data.clientEmail,
      clientPhone: data.clientPhone,
      clientCountry: data.clientCountry,
      amount: computedAmount,
      status: data.status ?? 'draft',
      dueDate: data.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      module: data.module ?? 'Other',
      description: data.description,
      currency,
      baseCurrencyAmount,
      language,
      taxAmount: totalTax !== '0' ? totalTax : (data.taxAmount ?? '0'),
      taxCode: data.taxCode,
      taxRate: (data as any).taxRate,
      paymentTerms: data.paymentTerms,
      taxId: rawTaxId,
      lineItems: data.lineItems ?? [],
      subtotal,
      totalDiscount,
      totalTax,
      compliance,
      recurring: data.recurring,
      paymentLink: generatePaymentLink(id, currency, tenantId),
      paymentMethod: data.paymentMethod,
      partialPayments: [],
      outstandingBalance: computedAmount,
      linkedCreditNotes: [],
      isProForma,
      customsReference: data.customsReference,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.nc.isConnected) {
      _invoices.unshift(inv);
      this.addAuditEntry('invoice', inv._id, 'create', tenantId ?? 'system', inv.client, undefined, tenantId);
      if (tenantId) {
        this.syncToExternal(inv, tenantId);
      }
      return inv;
    }
    try {
      const raw = await this.nc.create(COL_INVOICES, {
        invoice: invoiceNumber, type: inv.type, client: inv.client,
        amount: inv.amount, status: inv.status, due_date: inv.dueDate,
        source_module: inv.module, description: inv.description,
        currency, tax_amount: inv.taxAmount, client_email: inv.clientEmail,
        client_phone: inv.clientPhone, client_country: inv.clientCountry,
        language, base_currency_amount: baseCurrencyAmount,
        subtotal: inv.subtotal, total_discount: inv.totalDiscount, total_tax: inv.totalTax,
        tax_code: inv.taxCode ?? null, tax_rate: inv.taxRate ?? null, payment_terms: inv.paymentTerms ?? null,
        tax_id: inv.compliance?.taxId ?? null,
        compliance_region: inv.compliance?.region ?? null,
        tenant_id: tenantId,
        outstanding_balance: inv.outstandingBalance ?? inv.amount,
        recurring_config: inv.recurring ? JSON.stringify(inv.recurring) : null,
      });
      // Preserve compliance and lineItems from the built invoice (NocoBase row has no JSON columns for these).
      // Regenerate paymentLink with the real DB-assigned ID (NocoBase may assign a different UUID than the temp mem_ id).
      const created = {
        ...mapInvoice(raw ?? inv),
        compliance: inv.compliance, lineItems: inv.lineItems,
        // Preserve form fields NocoBase may not echo back, so the row round-trips on edit.
        taxCode: inv.taxCode, taxRate: inv.taxRate, paymentTerms: inv.paymentTerms, taxId: inv.taxId,
      };
      created.paymentLink = generatePaymentLink(created._id, inv.currency ?? '', tenantId);
      this.addAuditEntry('invoice', created._id, 'create', tenantId ?? 'system', created.client, undefined, tenantId);

      // Trigger external sync if tenantId provided
      if (tenantId) {
        this.syncToExternal(created, tenantId);
      }

      return created;
    } catch (err) {
      this.logger.warn(`createInvoice fallback: ${(err as Error).message}`);
      _invoices.unshift(inv);
      this.addAuditEntry('invoice', inv._id, 'create', tenantId ?? 'system', inv.client, undefined, tenantId);
      if (tenantId) {
        this.syncToExternal(inv, tenantId);
      }
      return inv;
    }
  }

  /** Background helper to push to connected accounting platforms */
  private async syncToExternal(invoice: Invoice, tenantId: string) {
    const now = new Date().toISOString();

    // 1. Try Xero — pushInvoice never throws; it returns { success }. Only mark
    //    synced when it ACTUALLY landed in Xero, otherwise a failed/disconnected
    //    push would falsely flag the invoice and Push All would skip it forever.
    try {
      const xr = await this.xeroSync.pushInvoice(tenantId, invoice);
      if (xr?.success) await this.persistSyncStatus(invoice._id, { xero_synced: true, xero_synced_at: now });
      else if (xr?.error) this.logger.warn(`Xero auto-sync skipped for ${invoice.invoice}: ${xr.error}`);
    } catch (e) {
      this.logger.warn(`Xero push failed for tenant ${tenantId}: ${e}`);
    }

    // 2. Try QuickBooks — same contract: only flag on a real success.
    try {
      const qr = await this.qboSync.pushInvoice(tenantId, invoice);
      if (qr?.success) await this.persistSyncStatus(invoice._id, { qbo_synced: true, qbo_synced_at: now });
      else if (qr?.error) this.logger.warn(`QuickBooks auto-sync skipped for ${invoice.invoice}: ${qr.error}`);
    } catch (e) {
      this.logger.warn(`QuickBooks push failed for tenant ${tenantId}: ${e}`);
    }

    // 3. Cross-module sync — route the client creation to the appropriate module service
    try {
      await this.syncInvoiceToModule(invoice, tenantId);
    } catch (e) {
      this.logger.warn(`Module sync failed for invoice ${invoice.invoice}: ${e}`);
    }
  }

  /** Called by the controller after a successful manual push to mark sync done */
  async markExternalSync(invoiceId: string, platform: 'xero' | 'qbo') {
    const now = new Date().toISOString();
    const fields = platform === 'xero'
      ? { xero_synced: true, xero_synced_at: now }
      : { qbo_synced: true, qbo_synced_at: now };
    await this.persistSyncStatus(invoiceId, fields);
  }

  /** Write sync flags directly to NocoBase — does NOT trigger syncToExternal to avoid loops */
  private async persistSyncStatus(id: string, fields: Record<string, unknown>) {
    try {
      if (this.nc.isConnected) {
        await this.nc.update(COL_INVOICES, id, fields);
      } else {
        const inv = _invoices.find(i => i._id === id);
        if (inv) {
          if ('xero_synced' in fields) { (inv as any).xeroSynced = fields.xero_synced; (inv as any).xeroSyncedAt = new Date(fields.xero_synced_at as string); }
          if ('qbo_synced' in fields) { (inv as any).qboSynced = fields.qbo_synced; (inv as any).qboSyncedAt = new Date(fields.qbo_synced_at as string); }
        }
      }
    } catch (e) {
      this.logger.warn(`persistSyncStatus failed for ${id}: ${e}`);
    }
  }

  /** Upsert a contact/employee/etc when an invoice is created/updated based on its module */
  private async syncInvoiceToModule(invoice: Invoice, tenantId: string): Promise<void> {
    if (!invoice.client || invoice.type === 'credit_note') return;

    const moduleName = (invoice.module || 'CRM').toLowerCase();

    try {
      if (moduleName === 'crm' || moduleName === 'other') {
        // Use the injected this.crmService — moduleRef.get with a string token never
        // finds class providers; the class reference IS the injection token.
        const crmService = this.crmService;
        if (crmService) {
          // Look up by email first, then fall back to exact name match
          let existing: any = null;
          if (invoice.clientEmail) {
            const byEmail = await crmService.getContacts({ search: invoice.clientEmail, limit: 10 }, tenantId);
            existing = byEmail.data.find(
              (c: any) => (c.email ?? '').toLowerCase() === invoice.clientEmail!.toLowerCase(),
            );
          }
          if (!existing) {
            const byName = await crmService.getContacts({ search: invoice.client, limit: 10 }, tenantId);
            existing = byName.data.find(
              (c: any) => c.name.toLowerCase() === invoice.client.toLowerCase(),
            );
          }

          let contact: any = null;
          if (existing) {
            // Update existing contact
            const currentIds: string[] = (existing.customFields?.invoicedIds as string[] | undefined) ?? [];
            const currentAmount = parseFloat((existing.customFields?.invoicedAmount as string | undefined) ?? '0');
            const newIds = currentIds.includes(invoice.invoice) ? currentIds : [...currentIds, invoice.invoice];
            const newAmount = (currentAmount + parseFloat(invoice.amount ?? '0')).toFixed(2);

            const currentTags: string[] = existing.tags ?? [];
            const tags = currentTags.includes('invoiced') ? currentTags : [...currentTags, 'invoiced'];

            contact = await crmService.updateContact(
              String(existing._id || existing.id),
              {
                status: 'customer',
                tags,
                customFields: {
                  ...existing.customFields,
                  invoicedIds: newIds,
                  invoicedAmount: newAmount,
                },
              },
              tenantId,
            );
            this.logger.log(`CRM: updated contact ${existing.name} with invoice ${invoice.invoice}`);
          } else {
            // Create new contact
            contact = await crmService.createContact(
              {
                name: invoice.client,
                email: invoice.clientEmail ?? undefined,
                phone: invoice.clientPhone ?? undefined,
                status: 'customer',
                tags: ['invoiced'],
                customFields: {
                  invoicedIds: [invoice.invoice],
                  invoicedAmount: parseFloat(invoice.amount ?? '0').toFixed(2),
                },
              } as any,
              tenantId,
            );
            this.logger.log(`CRM: created contact for ${invoice.client} from invoice ${invoice.invoice}`);
          }

          if (contact) {
            await crmService.createActivity({
              type: 'note',
              description: `Invoice ${invoice.invoice} for ${invoice.amount} ${invoice.currency ?? 'USD'} created`,
              contactId: String(contact._id || contact.id),
              actor: 'Accounting',
            });
          }
        } else {
          this.logger.warn(`syncInvoiceToModule: CrmService not available for tenant ${tenantId}`);
        }
      } else if (moduleName === 'hr') {
        const hrService = this.moduleRef.get(HRService, { strict: false });
        if (hrService) {
          await hrService.createEmployee({
            name: invoice.client,
            email: invoice.clientEmail ?? undefined,
            phone: invoice.clientPhone ?? undefined,
            tenantId,
          });
          this.logger.log(`HR: created employee ${invoice.client} from invoice ${invoice.invoice}`);
        }
      } else if (moduleName === 'phonebook') {
        const phonebookService = this.moduleRef.get(PhonebookService, { strict: false });
        if (phonebookService) {
          await phonebookService.createContact(tenantId, {
            name: invoice.client,
            email: invoice.clientEmail ?? undefined,
            phone: invoice.clientPhone ?? undefined,
          });
          this.logger.log(`Phonebook: created contact ${invoice.client} from invoice ${invoice.invoice}`);
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to sync invoice ${invoice.invoice} to module ${moduleName}: ${(e as Error).message}`);
    }
  }

  /** Backfill: sync all existing invoice clients to CRM as contacts */
  async syncAllInvoicesToCrm(tenantId: string): Promise<{ synced: number; errors: number }> {
    if (!this.crmService) return { synced: 0, errors: 0 };
    const { data: invoices } = await this.getInvoices({ limit: 10000, tenantId });
    let synced = 0, errors = 0;
    for (const inv of invoices) {
      if (!inv.client || inv.type === 'credit_note') continue;
      try {
        await this.syncInvoiceToModule(inv, tenantId);
        synced++;
      } catch {
        errors++;
      }
    }
    return { synced, errors };
  }

  async updateInvoice(id: string, data: Partial<Invoice>, tenantId?: string): Promise<Invoice | null> {
    if (!this.nc.isConnected) {
      const idx = _invoices.findIndex(i => i._id === id);
      if (idx === -1) return null;
      const old = _invoices[idx];
      const updated = { ...old, ...data, updatedAt: new Date() };

      if (data.partialPayments) {
        const totalPaid = data.partialPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const totalAmount = parseFloat(updated.amount);
        updated.outstandingBalance = (totalAmount - totalPaid).toFixed(2);
        if (totalPaid >= totalAmount) updated.status = 'paid';
      }

      _invoices[idx] = updated;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (data.status && data.status !== old.status) changes.status = { from: old.status, to: data.status };
      if (data.amount && data.amount !== old.amount) changes.amount = { from: old.amount, to: data.amount };
      this.addAuditEntry('invoice', id, 'update', tenantId ?? 'system', updated.client, Object.keys(changes).length ? changes : undefined, tenantId);
      return _invoices[idx];
    }
    try {
      // Persist the editable fields as sent. NOTE: we intentionally do NOT recompute
      // tax totals here — the edit form prefills `amount` with the gross total, so
      // recomputing would double-apply the tax on every save. Totals are computed at
      // create time; an amount edit just stores the new figure (pre-existing behaviour).
      const taxRateStr = (data as any).taxRate;
      const raw = await this.nc.update(COL_INVOICES, id, {
        ...(data.status && { status: data.status }),
        ...(data.amount && { amount: data.amount }),
        ...(data.dueDate && { due_date: data.dueDate }),
        ...(data.clientEmail && { client_email: data.clientEmail }),
        ...(data.client && { client: data.client }),
        ...(data.clientPhone && { client_phone: data.clientPhone }),
        ...(data.currency && { currency: data.currency }),
        ...(data.module && { source_module: data.module }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.language && { language: data.language }),
        ...(data.type && { type: data.type }),
        ...(data.taxCode !== undefined && { tax_code: data.taxCode }),
        ...(taxRateStr !== undefined && { tax_rate: taxRateStr }),
        ...(data.paymentTerms !== undefined && { payment_terms: data.paymentTerms }),
        ...((data as any).taxId !== undefined && { tax_id: (data as any).taxId }),
      });
      const updated = raw ? mapInvoice(raw) : null;
      if (updated) {
        this.addAuditEntry('invoice', id, 'update', tenantId ?? 'system', updated.client, undefined, tenantId);
        if (tenantId) this.syncToExternal(updated, tenantId);
      }
      return updated;
    } catch { return null; }
  }

  async deleteInvoice(id: string, tenantId?: string): Promise<boolean> {
    if (!this.nc.isConnected) {
      const inv = _invoices.find(i => i._id === id);
      const idx = _invoices.findIndex(i => i._id === id);
      if (idx !== -1) {
        _invoices.splice(idx, 1);
        this.addAuditEntry('invoice', id, 'delete', tenantId ?? 'system', inv?.client ?? 'Unknown', undefined, tenantId);
      }
      return true;
    }
    try {
      const success = await this.nc.destroy(COL_INVOICES, id);
      if (success) this.addAuditEntry('invoice', id, 'delete', tenantId ?? 'system', 'system', undefined, tenantId);
      return success;
    } catch { return false; }
  }

  // ── Expenses ──────────────────────────────────────────────────────────────

  async getExpenses(params: { limit?: number; category?: string; tenantId?: string } = {}): Promise<Expense[]> {
    if (!this.nc.isConnected) {
      let list = [..._expenses];
      if (params.category) list = list.filter(e => e.category === params.category);
      return list.slice(0, params.limit ?? 100);
    }
    try {
      const filter: Record<string, unknown> = {};
      if (params.category) filter['category'] = params.category;
      if (params.tenantId) filter['tenant_id'] = params.tenantId;
      const result = await this.nc.list<any>(COL_EXPENSES, { pageSize: params.limit ?? 100, filter });
      return (result?.data ?? []).map(mapExpense);
    } catch { return []; }
  }

  async createExpense(data: Partial<Expense>, tenantId?: string): Promise<Expense> {
    if (isDuplicateExpense(data, _expenses)) {
      throw new ConflictException('A duplicate expense with identical fields already exists. Change at least one field to create a new expense.');
    }
    if (!this.nc.isConnected) {
      const exp: Expense = {
        _id: mkId(),
        description: data.description ?? '',
        amount: data.amount ?? '0',
        currency: data.currency ?? 'USD',
        category: data.category ?? 'General',
        date: data.date ?? new Date().toISOString().slice(0, 10),
        status: data.status ?? 'pending',
        employee: data.employee,
        receipt: data.receipt,
        merchant: data.merchant,
        taxId: data.taxId,
        notes: data.notes,
        paymentMethod: (data as any).paymentMethod,
        source: (data as any).source,
        storageDestination: (data as any).storageDestination,
        tenant_id: tenantId,
        createdAt: new Date()
      };
      _expenses.unshift(exp);
      this.addAuditEntry('expense', exp._id, 'create', tenantId ?? 'system', exp.employee ?? 'system', undefined, tenantId);
      return exp;
    }
    try {
      const raw = await this.nc.create(COL_EXPENSES, {
        description: data.description ?? '',
        amount: data.amount ?? '0',
        category: data.category ?? 'General',
        date: data.date ?? new Date().toISOString().slice(0, 10),
        status: data.status ?? 'pending',
        employee: data.employee ?? null,
        merchant: data.merchant ?? null,
        tax_id: data.taxId ?? null,
        currency: data.currency ?? 'USD',
        tenant_id: tenantId,
      });
      const exp = mapExpense(raw ?? data);
      this.addAuditEntry('expense', exp._id, 'create', tenantId ?? 'system', exp.employee ?? 'system', undefined, tenantId);
      return exp;
    } catch (err) {
      this.logger.warn(`createExpense fallback: ${(err as Error).message}`);
      const exp: Expense = { _id: mkId(), description: data.description ?? '', amount: data.amount ?? '0', category: data.category ?? 'General', date: data.date ?? new Date().toISOString().slice(0, 10), status: data.status ?? 'pending', tenant_id: tenantId, createdAt: new Date() };
      _expenses.unshift(exp);
      this.addAuditEntry('expense', exp._id, 'create', tenantId ?? 'system', 'system', undefined, tenantId);
      return exp;
    }
  }

  async updateExpense(id: string, data: Partial<Expense>, tenantId?: string): Promise<Expense | null> {
    if (!this.nc.isConnected) {
      const idx = _expenses.findIndex(e => e._id === id);
      if (idx !== -1) { _expenses[idx] = { ..._expenses[idx], ...data }; return _expenses[idx]; }
      return null;
    }
    try {
      const raw = await this.nc.update(COL_EXPENSES, id, {
        description: data.description,
        amount: data.amount,
        category: data.category,
        date: data.date,
        status: data.status,
        employee: data.employee ?? null,
        merchant: data.merchant ?? null,
        tax_id: data.taxId ?? null,
        currency: data.currency,
        notes: data.notes ?? null,
      });
      return mapExpense(raw ?? { ...data, _id: id });
    } catch { return null; }
  }

  async deleteExpense(id: string, tenantId?: string): Promise<boolean> {
    if (!this.nc.isConnected) {
      const exp = _expenses.find(e => e._id === id);
      const idx = _expenses.findIndex(e => e._id === id);
      if (idx !== -1) {
        _expenses.splice(idx, 1);
        this.addAuditEntry('expense', id, 'delete', tenantId ?? 'system', exp?.employee ?? 'system', undefined, tenantId);
      }
      return true;
    }
    try {
      const success = await this.nc.destroy(COL_EXPENSES, id);
      if (success) this.addAuditEntry('expense', id, 'delete', tenantId ?? 'system', 'system', undefined, tenantId);
      return success;
    } catch { return false; }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(tenantId?: string) {
    const [{ data: invoices }, expenses] = await Promise.all([
      this.getInvoices({ limit: 10000, tenantId }),
      this.getExpenses({ limit: 10000, tenantId }),
    ]);

    const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseAmount(i.amount), 0);
    const outstanding = invoices.filter(i => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + parseAmount(i.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + parseAmount(e.amount), 0);
    const netProfit = totalRevenue - totalExpenses;

    const revenueByModule: Record<string, number> = {};
    for (const inv of invoices.filter(i => i.status === 'paid')) {
      revenueByModule[inv.module] = (revenueByModule[inv.module] ?? 0) + parseAmount(inv.amount);
    }

    return {
      totalRevenue,
      outstanding,
      totalExpenses,
      netProfit,
      invoiceCount: invoices.length,
      paidInvoices: invoices.filter(i => i.status === 'paid').length,
      overdueInvoices: invoices.filter(i => i.status === 'overdue').length,
      pendingInvoices: invoices.filter(i => i.status === 'pending').length,
      draftInvoices: invoices.filter(i => i.status === 'draft').length,
      revenueByModule,
      mrr: totalRevenue / 12,
      arr: totalRevenue,
    };
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getAnalytics(_range = '30d', tenantId?: string) {
    const [{ data: invoices }, expenses] = await Promise.all([
      this.getInvoices({ limit: 10000, tenantId }),
      this.getExpenses({ limit: 10000, tenantId }),
    ]);

    // Revenue by status
    const statusCounts: Record<string, number> = {};
    for (const inv of invoices) {
      statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;
    }

    // Revenue by source module
    const revenueByModule: Record<string, number> = {};
    for (const inv of invoices.filter(i => i.status === 'paid')) {
      revenueByModule[inv.module] = (revenueByModule[inv.module] ?? 0) + parseAmount(inv.amount);
    }

    // Expense by category
    const expenseByCategory: Record<string, number> = {};
    for (const exp of expenses) {
      expenseByCategory[exp.category] = (expenseByCategory[exp.category] ?? 0) + parseAmount(exp.amount);
    }

    const statusChart = {
      id: 'invoice-status',
      title: 'Invoices by Status',
      type: 'bar' as const,
      data: Object.entries(statusCounts).length > 0
        ? Object.entries(statusCounts).map(([label, value]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), value }))
        : [{ label: 'No invoices', value: 0 }],
    };

    const moduleChart = {
      id: 'revenue-by-module',
      title: 'Revenue by Module',
      type: 'donut' as const,
      data: Object.entries(revenueByModule).length > 0
        ? Object.entries(revenueByModule).map(([label, value]) => ({ label, value: Math.round(value) }))
        : [{ label: 'No revenue', value: 0 }],
    };

    const expenseChart = {
      id: 'expense-categories',
      title: 'Expenses by Category',
      type: 'progress' as const,
      data: Object.entries(expenseByCategory).length > 0
        ? Object.entries(expenseByCategory).map(([label, value]) => ({ label, value: Math.round(value) }))
        : [{ label: 'No expenses', value: 0 }],
    };

    return { charts: [statusChart, moduleChart, expenseChart] };
  }

  // ── Insights ──────────────────────────────────────────────────────────────

  async getInsights(tenantId?: string) {
    const [{ data: invoices }, expenses] = await Promise.all([
      this.getInvoices({ limit: 10000, tenantId }),
      this.getExpenses({ limit: 10000, tenantId }),
    ]);

    const insights: Array<{ id: string; title: string; description: string; type: string; priority?: string; actionLabel?: string }> = [];

    const overdue = invoices.filter(i => i.status === 'overdue');
    if (overdue.length > 0) {
      const total = overdue.reduce((s, i) => s + parseAmount(i.amount), 0);
      insights.push({
        id: 'overdue',
        title: `${overdue.length} Overdue Invoice${overdue.length > 1 ? 's' : ''}`,
        description: `$${total.toLocaleString()} outstanding past due date. Follow up immediately to protect cash flow.`,
        type: 'warning',
        priority: 'high',
        actionLabel: 'Review Overdue',
      });
    }

    const pendingExpenses = expenses.filter(e => e.status === 'pending');
    if (pendingExpenses.length > 0) {
      insights.push({
        id: 'pending-expenses',
        title: `${pendingExpenses.length} Expense${pendingExpenses.length > 1 ? 's' : ''} Awaiting Approval`,
        description: `${pendingExpenses.length} expense report${pendingExpenses.length > 1 ? 's need' : ' needs'} your review before they can be reimbursed.`,
        type: 'suggestion',
        priority: 'medium',
        actionLabel: 'Review Expenses',
      });
    }

    const paid = invoices.filter(i => i.status === 'paid');
    const outstanding = invoices.filter(i => i.status === 'pending' || i.status === 'overdue');
    if (outstanding.length > 0 && paid.length > 0) {
      const paidRevenue = paid.reduce((s, i) => s + parseAmount(i.amount), 0);
      const outstandingRevenue = outstanding.reduce((s, i) => s + parseAmount(i.amount), 0);
      const pct = Math.round((outstandingRevenue / (paidRevenue + outstandingRevenue)) * 100);
      insights.push({
        id: 'cash-flow',
        title: `${pct}% of Revenue Still Outstanding`,
        description: `$${outstandingRevenue.toLocaleString()} in open invoices. Consider offering early-payment discounts to improve cash flow.`,
        type: 'trend',
        priority: pct > 50 ? 'high' : 'low',
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: 'default',
        title: 'Create Your First Invoice',
        description: 'Add invoices to track revenue across all FLYN modules — CRM, Events, HR, Coaches, and more.',
        type: 'suggestion',
      });
    }

    return { insights };
  }

  // ── Credit Notes ──────────────────────────────────────────────────────────

  async createCreditNote(data: { originalInvoiceId: string; amount: string; reason: string; lineItems?: InvoiceLineItem[] }, tenantId?: string): Promise<CreditNote> {
    // Fetch the original invoice (NocoBase or in-memory)
    let invoice: Invoice | undefined;
    if (this.nc.isConnected) {
      try {
        const raw = await this.nc.get(COL_INVOICES, data.originalInvoiceId);
        if (raw) invoice = mapInvoice(raw);
      } catch { /* fall through */ }
    }
    if (!invoice) invoice = _invoices.find(i => i._id === data.originalInvoiceId);

    const cnNumber = nextCreditNoteNumber();
    const cn: CreditNote = {
      _id: mkId(),
      creditNoteNumber: cnNumber,
      originalInvoiceId: data.originalInvoiceId,
      originalInvoiceNumber: invoice?.invoice ?? 'N/A',
      client: invoice?.client ?? 'Unknown',
      amount: data.amount,
      currency: invoice?.currency ?? 'USD',
      reason: data.reason,
      status: 'issued',
      lineItems: data.lineItems,
      compliance: invoice?.compliance,
      createdAt: new Date(),
    };

    if (this.nc.isConnected) {
      try {
        // Resolve tenantId: use passed param, or read from the original invoice row
        const effectiveTenantId = tenantId ?? (invoice as any)?.tenant_id ?? null;

        // Save the credit note as an invoice row so it appears in the invoices list
        const created = await this.nc.create(COL_INVOICES, {
          invoice: cnNumber,
          type: 'credit_note',
          client: cn.client,
          amount: cn.amount,
          status: 'applied',
          due_date: new Date().toISOString().slice(0, 10),
          source_module: invoice?.module ?? 'Other',
          description: `Credit note against ${invoice?.invoice ?? data.originalInvoiceId}: ${data.reason}`,
          currency: cn.currency,
          linked_to_invoice: invoice?.invoice ?? '',
          linked_to_invoice_id: data.originalInvoiceId,
          outstanding_balance: '0',
          tenant_id: effectiveTenantId,
        });
        if (created && (created as any).id) cn._id = String((created as any).id);

        // Update the original invoice: track credit note total and reduce outstanding balance
        const prevTotal = parseFloat(String(invoice?.linkedCreditNoteTotal ?? '0')) || 0;
        const newTotal = (prevTotal + parseAmount(data.amount)).toFixed(2);
        const currentOutstanding = parseAmount(invoice?.outstandingBalance ?? invoice?.amount ?? '0');
        const newOutstanding = Math.max(0, currentOutstanding - parseAmount(data.amount)).toFixed(2);
        await this.nc.update(COL_INVOICES, data.originalInvoiceId, {
          linked_credit_note_total: newTotal,
          outstanding_balance: newOutstanding,
        });
      } catch (e) {
        this.logger.warn(`createCreditNote NocoBase save failed: ${e}`);
      }
    } else {
      _creditNotes.unshift(cn);
      // Link to original invoice and adjust balance
      if (invoice) {
        invoice.linkedCreditNotes = [...(invoice.linkedCreditNotes ?? []), cn._id];
        const outstanding = parseAmount(invoice.outstandingBalance ?? invoice.amount) - parseAmount(data.amount);
        invoice.outstandingBalance = Math.max(0, outstanding).toFixed(2);
        if (outstanding <= 0) invoice.status = 'paid';
      }
    }

    this.addAuditEntry('credit_note', cn._id, 'create', tenantId ?? 'system', cn.client, { originalInvoice: { from: data.originalInvoiceId, to: cn.creditNoteNumber } }, tenantId);
    return cn;
  }

  async getCreditNotes(): Promise<CreditNote[]> {
    return [..._creditNotes];
  }

  // ── Partial Payments ──────────────────────────────────────────────────────

  async addPartialPayment(invoiceId: string, payment: Omit<PartialPayment, 'id'>, tenantId?: string): Promise<Invoice | null> {
    const entry: PartialPayment = { id: mkId(), ...payment };

    if (this.nc.isConnected) {
      try {
        // Fetch current invoice from NocoBase
        const raw = await this.nc.get(COL_INVOICES, invoiceId);
        if (!raw) return null;
        const inv = mapInvoice(raw);

        // Idempotency: Stripe retries webhooks (and multiple destinations may deliver the same
        // event), so skip if this exact payment reference was already recorded — otherwise the
        // invoice would be double-counted and could go past paid.
        const existing = inv.partialPayments ?? [];
        if (payment.reference && existing.some(p => p.reference === payment.reference)) {
          this.logger.log(`addPartialPayment: reference ${payment.reference} already recorded for ${invoiceId} — skipping`);
          return inv;
        }

        const payments = [...existing, entry];
        const totalPaid = payments.reduce((s, p) => s + parseAmount(p.amount), 0);
        const totalAmount = parseAmount(inv.amount);
        const outstanding = Math.max(0, totalAmount - totalPaid).toFixed(2);
        const newStatus: InvoiceStatus = totalPaid >= totalAmount ? 'paid' : 'partially_paid';

        await this.nc.update(COL_INVOICES, invoiceId, {
          status: newStatus,
          outstanding_balance: outstanding,
          partial_payments: JSON.stringify(payments),
        });

        this.addAuditEntry('payment', invoiceId, 'payment', tenantId ?? 'system', inv.client, { amount: { from: inv.outstandingBalance, to: outstanding } }, tenantId);
        return { ...inv, partialPayments: payments, outstandingBalance: outstanding, status: newStatus, updatedAt: new Date() };
      } catch (e) {
        this.logger.warn(`addPartialPayment NocoBase failed for ${invoiceId}: ${e}`);
        return null;
      }
    }

    // In-memory fallback
    const idx = _invoices.findIndex(i => i._id === invoiceId);
    if (idx === -1) return null;

    const inv = _invoices[idx];
    // Idempotency: skip if this payment reference was already recorded (webhook retries).
    if (payment.reference && (inv.partialPayments ?? []).some(p => p.reference === payment.reference)) {
      this.logger.log(`addPartialPayment: reference ${payment.reference} already recorded for ${invoiceId} — skipping`);
      return inv;
    }
    inv.partialPayments = [...(inv.partialPayments ?? []), entry];
    const totalPaid = inv.partialPayments.reduce((s, p) => s + parseAmount(p.amount), 0);
    const totalAmount = parseAmount(inv.amount);
    inv.outstandingBalance = Math.max(0, totalAmount - totalPaid).toFixed(2);
    inv.status = totalPaid >= totalAmount ? 'paid' : 'partially_paid';
    inv.updatedAt = new Date();
    this.addAuditEntry('payment', invoiceId, 'payment', tenantId ?? 'system', inv.client, { amount: { from: undefined, to: entry.amount } }, tenantId);
    return inv;
  }

  // ── Recurring Invoices ────────────────────────────────────────────────────

  async processRecurringInvoices(): Promise<{ generated: number; invoices: Invoice[] }> {
    const today = new Date().toISOString().slice(0, 10);
    const generated: Invoice[] = [];

    for (const inv of _invoices) {
      if (!inv.recurring || inv.recurring.nextRunDate > today) continue;
      if (inv.recurring.endDate && inv.recurring.endDate < today) continue;

      const newInv = await this.createInvoice({
        ...inv,
        _id: undefined as any,
        invoice: undefined,
        status: inv.recurring.autoSend ? 'pending' : 'draft',
        dueDate: undefined,
        partialPayments: [],
        outstandingBalance: undefined,
      });
      generated.push(newInv);

      // Advance next run date
      const next = new Date(inv.recurring.nextRunDate);
      switch (inv.recurring.frequency) {
        case 'weekly': next.setDate(next.getDate() + 7); break;
        case 'monthly': next.setMonth(next.getMonth() + 1); break;
        case 'quarterly': next.setMonth(next.getMonth() + 3); break;
        case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
      }
      inv.recurring.nextRunDate = next.toISOString().slice(0, 10);
      inv.recurring.occurrencesGenerated = (inv.recurring.occurrencesGenerated ?? 0) + 1;
    }

    return { generated: generated.length, invoices: generated };
  }

  // ── FX Conversion ─────────────────────────────────────────────────────────

  convertAmount(amount: number, from: string, to: string): { converted: number; rate: number; from: string; to: string } {
    const converted = convertCurrency(amount, from, to);
    const rate = (FX_RATES[to] ?? 1) / (FX_RATES[from] ?? 1);
    return { converted: Math.round(converted * 100) / 100, rate: Math.round(rate * 10000) / 10000, from, to };
  }

  // ── Pro Forma Invoice ─────────────────────────────────────────────────────

  async createProFormaInvoice(data: Partial<Invoice> & { customsReference?: string }): Promise<Invoice> {
    return this.createInvoice({
      ...data,
      type: 'proforma',
      isProForma: true,
      customsReference: data.customsReference,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: PAYMENTS & COLLECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Smart Gateway Routing ───────────────────────────────────────────────

  getGatewaysForCountry(countryCode: string): PaymentGateway[] {
    const cc = countryCode.toUpperCase();
    return GATEWAY_REGISTRY
      .filter(g => g.enabled && g.countries.includes(cc))
      .sort((a, b) => a.priority - b.priority);
  }

  routePayment(countryCode: string, method?: string): { primary: PaymentGateway | null; fallback: PaymentGateway | null } {
    let gateways = this.getGatewaysForCountry(countryCode);
    if (method) {
      gateways = gateways.filter(g => g.supportedMethods.includes(method as any));
    }
    return { primary: gateways[0] ?? null, fallback: gateways[1] ?? null };
  }

  // ── Auto-Reconciliation ─────────────────────────────────────────────────

  async reconcilePayment(payment: { amount: string; date: string; reference: string; method: string }, tenantId?: string): Promise<ReconciliationEntry> {
    const payAmt = parseAmount(payment.amount);

    // Try exact match on amount + partial match on reference
    let bestMatch: Invoice | undefined;
    let confidence = 0;

    // In a real app, we'd query NocoBase with a tenant_id filter here.
    // For now, we'll filter the local array by tenantId if provided.
    const relevantInvoices = tenantId ? _invoices.filter(i => i.tenant_id === tenantId) : _invoices;

    for (const inv of relevantInvoices) {
      if (inv.status === 'paid') continue;
      const invAmt = parseAmount(inv.outstandingBalance ?? inv.amount);
      if (Math.abs(invAmt - payAmt) < 0.01) {
        // Exact amount match
        const refMatch = inv.client.toLowerCase().includes(payment.reference.toLowerCase()) || inv.invoice.toLowerCase().includes(payment.reference.toLowerCase());
        if (refMatch) { bestMatch = inv; confidence = 95; break; }
        if (!bestMatch || confidence < 70) { bestMatch = inv; confidence = 70; }
      } else if (Math.abs(invAmt - payAmt) / invAmt < 0.05) {
        // Within 5% — partial match
        if (!bestMatch) { bestMatch = inv; confidence = 40; }
      }
    }

    const entry: ReconciliationEntry = {
      _id: mkId(),
      paymentAmount: payment.amount,
      paymentDate: payment.date,
      paymentReference: payment.reference,
      paymentMethod: payment.method as any,
      matchedInvoiceId: bestMatch?._id,
      matchedInvoiceNumber: bestMatch?.invoice,
      status: confidence >= 80 ? 'matched' : confidence >= 40 ? 'partial_match' : 'unmatched',
      confidence,
      createdAt: new Date(),
    };
    _reconciliation.unshift(entry);

    // Auto-apply if high confidence
    if (bestMatch && confidence >= 80) {
      await this.addPartialPayment(bestMatch._id, {
        date: payment.date,
        amount: payment.amount,
        method: payment.method as any,
        reference: payment.reference,
      });
      entry.status = 'matched';
    }

    this.addAuditEntry('payment', entry._id, 'payment', 'system', 'Auto-Reconciliation');
    return entry;
  }

  async getReconciliationEntries(status?: string): Promise<ReconciliationEntry[]> {
    if (status) return _reconciliation.filter(r => r.status === status);
    return [..._reconciliation];
  }

  // ── Dunning Management ──────────────────────────────────────────────────

  async processDunning(): Promise<{ actions: Array<{ invoiceId: string; client: string; step: DunningStep; daysOverdue: number }> }> {
    const today = new Date();
    const actions: Array<{ invoiceId: string; client: string; step: DunningStep; daysOverdue: number }> = [];

    for (const inv of _invoices) {
      if (inv.status !== 'overdue' && inv.status !== 'pending') continue;
      const due = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
      if (daysOverdue <= 0) continue;

      // Find the appropriate dunning step
      const step = [...DEFAULT_DUNNING_STEPS]
        .reverse()
        .find(s => daysOverdue >= s.daysOverdue);

      if (step) {
        actions.push({ invoiceId: inv._id, client: inv.client, step, daysOverdue });
        if (inv.status !== 'overdue') inv.status = 'overdue';
      }
    }

    return { actions };
  }

  // ── Vendor Bills (Accounts Payable) ─────────────────────────────────────

  async getVendorBills(params: { status?: string; limit?: number } = {}): Promise<VendorBill[]> {
    let list = [..._vendorBills];
    if (params.status) list = list.filter(b => b.status === params.status);
    return list.slice(0, params.limit ?? 100);
  }

  async createVendorBill(data: Partial<VendorBill>): Promise<VendorBill> {
    if (isDuplicateVendorBill(data, _vendorBills)) {
      throw new ConflictException('A duplicate vendor bill with identical fields already exists. Change at least one field to create a new bill.');
    }
    const bill: VendorBill = {
      _id: mkId(),
      vendor: data.vendor ?? 'Unknown Vendor',
      vendorEmail: data.vendorEmail,
      amount: data.amount ?? '0',
      currency: data.currency ?? 'USD',
      dueDate: data.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      description: data.description ?? '',
      category: data.category ?? 'General',
      status: data.status ?? 'draft',
      paymentMethod: data.paymentMethod,
      paymentTerms: data.paymentTerms,
      taxCode: data.taxCode,
      taxRate: data.taxRate,
      taxId: data.taxId,
      reference: data.reference,
      createdAt: new Date(),
    };
    _vendorBills.unshift(bill);
    this.addAuditEntry('vendor_bill', bill._id, 'create', 'system', 'System');
    return bill;
  }

  async updateVendorBill(id: string, data: Partial<VendorBill>): Promise<VendorBill | null> {
    const idx = _vendorBills.findIndex(b => b._id === id);
    if (idx === -1) return null;
    const old = { ..._vendorBills[idx] };
    _vendorBills[idx] = { ..._vendorBills[idx], ...data };
    this.addAuditEntry('vendor_bill', id, 'update', 'system', 'System', { status: { from: old.status, to: data.status } });
    return _vendorBills[idx];
  }

  async approveVendorBill(id: string, approver: string): Promise<VendorBill | null> {
    return this.updateVendorBill(id, { status: 'approved', approvedBy: approver });
  }

  async deleteVendorBill(id: string): Promise<boolean> {
    const idx = _vendorBills.findIndex(b => b._id === id);
    if (idx === -1) return false;
    _vendorBills.splice(idx, 1);
    return true;
  }

  // ── Bulk Payments ───────────────────────────────────────────────────────

  async createBulkPayment(data: { entries: BulkPaymentEntry[]; format: BulkPaymentFormat; currency: string }): Promise<BulkPaymentBatch> {
    const totalAmount = data.entries.reduce((s, e) => s + parseAmount(e.amount), 0);
    const batch: BulkPaymentBatch = {
      _id: mkId(),
      format: data.format,
      entries: data.entries,
      totalAmount: totalAmount.toFixed(2),
      currency: data.currency,
      status: 'draft',
      createdAt: new Date(),
    };
    _bulkPayments.unshift(batch);
    this.addAuditEntry('bulk_payment', batch._id, 'create', 'system', 'System');
    return batch;
  }

  async getBulkPayments(): Promise<BulkPaymentBatch[]> {
    return [..._bulkPayments];
  }

  async approveBulkPayment(id: string): Promise<BulkPaymentBatch | null> {
    const idx = _bulkPayments.findIndex(b => b._id === id);
    if (idx === -1) return null;
    _bulkPayments[idx].status = 'approved';
    this.addAuditEntry('bulk_payment', id, 'approve', 'system', 'System');
    return _bulkPayments[idx];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: TAX & COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Tax Code Library ────────────────────────────────────────────────────

  async getTaxCodesForCountry(countryCode: string, tenantId?: string): Promise<TaxCode[]> {
    const all = await this.getAllTaxCodes(tenantId);
    return all.filter(t => t.country === countryCode.toUpperCase());
  }

  getDefaultTaxCode(countryCode: string): TaxCode | undefined {
    // Always resolve against system library — custom codes don't override defaults
    return TAX_CODE_LIBRARY.find(t => t.country === countryCode.toUpperCase() && t.isDefault);
  }

  async getAllTaxCodes(tenantId?: string): Promise<TaxCode[]> {
    // System codes: add a display `code` field (e.g. 'US_SALES' → 'US-SALES') and mark isCustom: false
    const systemCodes: TaxCode[] = TAX_CODE_LIBRARY.map(tc => ({
      ...tc,
      code: tc.id.replace(/_/g, '-'),
      isCustom: false,
    }));

    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const snap = await db.collection('tax_codes').where('tenantId', '==', tenantId).get();
        const customCodes: TaxCode[] = snap.docs.map(d => {
          const data = d.data();
          return { ...data, _id: d.id, id: d.id, isCustom: true } as unknown as TaxCode;
        });
        return [...systemCodes, ...customCodes];
      } catch (err) {
        this.logger.warn(`Firestore getAllTaxCodes failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }

    const customFallback = _customTaxCodes.map(tc => ({ ...tc, isCustom: true }));
    return [...systemCodes, ...customFallback];
  }

  async createCustomTaxCode(data: Partial<TaxCode> & { country: string; type: TaxType; rate: number }, tenantId?: string): Promise<TaxCode> {
    // Frontend sends 'code' as the user-visible identifier; backend stores it as both name and code
    const codeLabel: string = (data as any).code ?? data.name ?? `CUSTOM-${Date.now()}`;
    const tc: TaxCode = {
      id: mkId(),
      code: codeLabel,
      country: data.country.toUpperCase(),
      name: codeLabel,
      type: data.type,
      rate: data.rate,
      description: data.description ?? `Custom tax code for ${data.country}`,
      isDefault: data.isDefault ?? false,
      isCustom: true,
    };

    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        await db.collection('tax_codes').doc(tc.id).set({
          ...tc,
          tenantId,
          createdAt: new Date().toISOString(),
        });
        this.logger.log(`Tax code ${tc.code} saved to Firestore for tenant ${tenantId}`);
        return tc;
      } catch (err) {
        this.logger.warn(`Firestore createCustomTaxCode failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }

    _customTaxCodes.push(tc);
    return tc;
  }

  // ── Audit Trail ─────────────────────────────────────────────────────────

  addAuditEntry(entityType: AuditEntry['entityType'], entityId: string, action: AuditAction, userId: string, userName: string, changes?: Record<string, { from: unknown; to: unknown }>, tenantId?: string) {
    const entry: AuditEntry = {
      _id: mkId(),
      entityType, entityId, action, userId, userName, changes,
      timestamp: new Date(),
    };
    _auditTrail.unshift(entry);

    // Fire-and-forget Firestore persistence
    const db = this.firebase.firestore();
    if (db) {
      db.collection('audit_trail').doc(entry._id).set({
        ...entry,
        tenantId: tenantId ?? null,
        timestamp: entry.timestamp.toISOString(),
      }).catch(err => this.logger.warn(`Firestore audit save failed for ${entityId}: ${err?.message}`));
    }

    return entry;
  }

  async getAuditTrail(params: { entityId?: string; entityType?: string; limit?: number; tenantId?: string } = {}): Promise<AuditEntry[]> {
    const db = this.firebase.firestore();
    if (db) {
      try {
        // Fetch more than needed so we can filter client-side without composite index
        let query: any = db.collection('audit_trail').orderBy('timestamp', 'desc').limit((params.limit ?? 200) * 4);
        if (params.tenantId) query = query.where('tenantId', '==', params.tenantId);
        const snap = await query.get();
        let entries: AuditEntry[] = snap.docs.map((d: any) => {
          const data = d.data();
          return { ...data, _id: d.id, timestamp: new Date(data.timestamp) } as AuditEntry;
        });
        if (params.entityId) entries = entries.filter(a => a.entityId === params.entityId);
        if (params.entityType) entries = entries.filter(a => a.entityType === params.entityType);
        return entries.slice(0, params.limit ?? 200);
      } catch (err) {
        this.logger.warn(`Firestore getAuditTrail failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    let list = [..._auditTrail];
    if (params.entityId) list = list.filter(a => a.entityId === params.entityId);
    if (params.entityType) list = list.filter(a => a.entityType === params.entityType);
    return list.slice(0, params.limit ?? 200);
  }

  // ── Document Retention ──────────────────────────────────────────────────

  archiveDocument(doc: { documentType: ArchivedDocument['documentType']; documentId: string; title: string; country: string; searchTags?: string[] }): ArchivedDocument {
    const retentionYears = RETENTION_RULES[doc.country.toUpperCase()] ?? 7;
    const archiveDate = new Date();
    const expiryDate = new Date(archiveDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + retentionYears);

    const archived: ArchivedDocument = {
      _id: mkId(),
      documentType: doc.documentType,
      documentId: doc.documentId,
      title: doc.title,
      country: doc.country.toUpperCase(),
      retentionYears,
      archiveDate,
      expiryDate,
      searchTags: doc.searchTags ?? [],
    };
    _archivedDocs.unshift(archived);
    this.addAuditEntry('invoice', doc.documentId, 'archive', 'system', 'Auto-Archive');
    return archived;
  }

  getArchivedDocuments(params: { search?: string; documentType?: string; limit?: number } = {}): ArchivedDocument[] {
    let list = [..._archivedDocs];
    if (params.documentType) list = list.filter(d => d.documentType === params.documentType);
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(d => d.title.toLowerCase().includes(q) || d.searchTags.some(t => t.toLowerCase().includes(q)));
    }
    return list.slice(0, params.limit ?? 100);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: EXPENSE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  private extractReceiptFromText(scan: ReceiptScan, text: string): void {
    const amountMatch = text.match(/(?:total|amount|charged|due|paid)[^\d]*\$?\s*(\d+(?:[.,]\d{1,2})?)/i)
      ?? text.match(/\$\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:USD|EUR|GBP|AED|SAR|INR)/i)
      ?? text.match(/(\d{1,6}(?:\.\d{1,2})?)/);
    if (amountMatch) scan.amount = (amountMatch[1] ?? amountMatch[2] ?? amountMatch[0]).replace(',', '.');

    const currMatch = text.match(/\b(USD|EUR|GBP|AED|SAR|INR|GHS|KES|ZAR|MYR|PHP|IDR)\b/i);
    if (currMatch) scan.currency = currMatch[1].toUpperCase();

    const KNOWN = ['Amazon', 'Walmart', 'Target', 'Costco', 'Uber', 'Lyft', 'Airbnb', 'Google', 'Apple', 'Microsoft', 'Adobe', 'Shopify', 'Stripe', 'Notion', 'Slack', 'Zoom', 'Dropbox', 'Netflix', 'Spotify', 'Office Depot', 'Staples'];
    const found = KNOWN.find(v => text.toLowerCase().includes(v.toLowerCase()));
    if (found) {
      scan.vendor = found;
    } else {
      const capMatch = text.match(/\b([A-Z][a-zA-Z0-9&.'-]{2,}(?:\s+[A-Z][a-zA-Z0-9&.'-]{2,})?)\b/);
      if (capMatch) scan.vendor = capMatch[1];
    }

    const isoDate = text.match(/(\d{4}-\d{2}-\d{2})/);
    const mdy = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    const monthYear = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
    const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    if (isoDate) {
      scan.date = isoDate[1];
    } else if (monthYear) {
      scan.date = `${monthYear[3]}-${MONTHS[monthYear[1].slice(0, 3).toLowerCase()]}-${monthYear[2].padStart(2, '0')}`;
    } else if (mdy) {
      const yr = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
      scan.date = `${yr}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
    }

    const CAT_MAP: [string, string[]][] = [
      ['Office Supplies', ['office', 'supplies', 'stationery', 'paper', 'pen', 'ink', 'printer', 'toner']],
      ['Travel', ['travel', 'flight', 'airline', 'hotel', 'motel', 'uber', 'lyft', 'taxi', 'airbnb', 'train', 'bus', 'transport', 'fuel', 'gas', 'ground transportation']],
      ['Meals & Entertainment', ['food', 'meal', 'restaurant', 'lunch', 'dinner', 'breakfast', 'coffee', 'cafe', 'catering', 'snack', 'uber eats', 'doordash', 'grubhub']],
      ['Software', ['software', 'subscription', 'saas', 'app', 'license', 'plugin', 'tool', 'platform', 'api', 'microsoft 365', 'google workspace']],
      ['Hardware', ['hardware', 'computer', 'laptop', 'monitor', 'phone', 'device', 'cable', 'keyboard', 'mouse']],
      ['Marketing', ['marketing', 'ads', 'advertising', 'campaign', 'social media', 'promotion', 'seo', 'ppc']],
      ['Utilities', ['electricity', 'water', 'internet', 'phone bill', 'utility', 'broadband', 'mobile']],
      ['Professional Services', ['consulting', 'legal', 'accounting', 'lawyer', 'audit', 'contractor', 'freelancer']],
      ['Payroll', ['salary', 'payroll', 'wage', 'bonus', 'stipend', 'commission']],
    ];
    const lower = text.toLowerCase();
    for (const [cat, kws] of CAT_MAP) {
      if (kws.some(k => lower.includes(k))) { scan.category = cat; break; }
    }
  }

  private parseGeminiReceiptJson(text: string): Partial<ReceiptScan> {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    try { return JSON.parse(jsonMatch[1] ?? jsonMatch[0]); } catch { return {}; }
  }

  private async extractReceiptWithGemini(imageBase64: string, mediaType: string): Promise<Partial<ReceiptScan>> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return {};
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `You are a receipt/invoice data extractor. Analyze this document and return ONLY a JSON object with these fields (omit fields not found):
{
  "vendor": "string — business name on the receipt",
  "amount": "string — total amount paid (digits only, e.g. '24.50')",
  "currency": "string — 3-letter ISO code (default USD)",
  "date": "string — YYYY-MM-DD format",
  "category": "one of: Travel | Meals & Entertainment | Office Supplies | Software | Hardware | Marketing | Utilities | Professional Services | Other",
  "taxAmount": "string — tax charged if shown",
  "description": "string — one-line summary of what was purchased",
  "lineItems": [{"name":"string","qty":"number","unitPrice":"string"}]
}
Respond with ONLY the JSON object, no markdown, no explanation.`;
      const result = await model.generateContent([
        { inlineData: { mimeType: mediaType as any, data: imageBase64 } },
        prompt,
      ]);
      return this.parseGeminiReceiptJson(result.response.text());
    } catch {
      return {};
    }
  }

  private async extractReceiptTextWithGemini(rawText: string): Promise<Partial<ReceiptScan>> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return {};
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `Extract receipt/expense data from the text below. Return ONLY a JSON object (no markdown) with: vendor, amount (string), currency (3-letter, default USD), date (YYYY-MM-DD), category (Travel/Meals & Entertainment/Office Supplies/Software/Hardware/Marketing/Utilities/Professional Services/Other), taxAmount (string), description (brief summary), lineItems (array of {name,qty,unitPrice}).

Text: ${rawText}`;
      const result = await model.generateContent(prompt);
      return this.parseGeminiReceiptJson(result.response.text());
    } catch {
      return {};
    }
  }

  async scanReceipt(data: { vendor?: string; amount?: string; date?: string; rawText?: string; imageBase64?: string; mediaType?: string }): Promise<ReceiptScan> {
    const scan: ReceiptScan = {
      _id: mkId(),
      vendor: data.vendor ?? 'Unknown Vendor',
      amount: data.amount ?? '0',
      currency: 'USD',
      date: data.date ?? new Date().toISOString().slice(0, 10),
      category: 'Other',
      confidence: 60,
      rawText: data.rawText,
      status: 'pending_review',
      createdAt: new Date(),
    };

    const applyExtracted = (extracted: Partial<ReceiptScan>) => {
      if (extracted.vendor) scan.vendor = extracted.vendor;
      if (extracted.amount) scan.amount = String(extracted.amount);
      if (extracted.currency) scan.currency = extracted.currency;
      if (extracted.date) scan.date = extracted.date;
      if (extracted.category) scan.category = extracted.category;
      if (extracted.taxAmount != null) scan.taxAmount = Number(extracted.taxAmount);
      if (extracted.description) scan.description = extracted.description;
      if (extracted.lineItems?.length) scan.lineItems = extracted.lineItems;
    };

    if (data.imageBase64) {
      const extracted = await this.extractReceiptWithGemini(data.imageBase64, data.mediaType ?? 'image/jpeg');
      applyExtracted(extracted);
      scan.confidence = scan.vendor !== 'Unknown Vendor' ? 92 : 70;
    } else if (data.rawText) {
      const extracted = await this.extractReceiptTextWithGemini(data.rawText);
      if (extracted.vendor || extracted.amount) {
        applyExtracted(extracted);
        scan.confidence = 90;
      } else {
        this.extractReceiptFromText(scan, data.rawText);
        scan.confidence = 82;
      }
    }

    _receiptScans.unshift(scan);
    return scan;
  }

  async getReceiptScans(status?: string): Promise<ReceiptScan[]> {
    return status ? _receiptScans.filter(s => s.status === status) : [..._receiptScans];
  }

  async approveReceiptScan(scanId: string): Promise<Expense | null> {
    const scan = _receiptScans.find(s => s._id === scanId);
    if (!scan) return null;
    scan.status = 'approved';
    const expense = await this.createExpense({ description: `Receipt: ${scan.vendor}`, amount: scan.amount, category: scan.category, date: scan.date });
    scan.expenseId = (expense as any)._id || (expense as any).id;
    return expense;
  }

  getExpenseCategories(memberType?: string): string[] {
    return EXPENSE_CATEGORIES[memberType ?? 'default'] ?? EXPENSE_CATEGORIES.default;
  }

  async submitExpenseForApproval(expenseId: string, approver: string): Promise<ExpenseApproval> {
    const approval: ExpenseApproval = { _id: mkId(), expenseId, level: 1, approver, status: 'pending', timestamp: new Date() };
    _expenseApprovals.unshift(approval);
    return approval;
  }

  async approveExpense(approvalId: string, comments?: string): Promise<ExpenseApproval | null> {
    const a = _expenseApprovals.find(x => x._id === approvalId);
    if (!a) return null;
    a.status = 'approved';
    a.comments = comments;
    this.addAuditEntry('expense', a.expenseId, 'approve', a.approver, a.approver);
    return a;
  }

  async getExpenseApprovals(status?: string): Promise<ExpenseApproval[]> {
    return status ? _expenseApprovals.filter(a => a.status === status) : [..._expenseApprovals];
  }

  async addMileageEntry(data: { employeeId: string; employee: string; distance: number; purpose: string; country: string; date?: string }): Promise<MileageEntry> {
    const rateInfo = MILEAGE_RATES[data.country] ?? { rate: 0.50, unit: 'km' as const };
    const entry: MileageEntry = {
      _id: mkId(), employeeId: data.employeeId, employee: data.employee,
      date: data.date ?? new Date().toISOString().slice(0, 10),
      distance: data.distance, unit: rateInfo.unit, rate: rateInfo.rate,
      totalAmount: data.distance * rateInfo.rate, purpose: data.purpose,
      country: data.country, createdAt: new Date(),
    };
    _mileageEntries.unshift(entry);
    return entry;
  }

  async getMileageEntries(employeeId?: string): Promise<MileageEntry[]> {
    return employeeId ? _mileageEntries.filter(m => m.employeeId === employeeId) : [..._mileageEntries];
  }

  async addPettyCashEntry(data: { type: 'withdrawal' | 'replenishment' | 'expense'; amount: string; currency: string; description: string; approvedBy?: string }): Promise<PettyCashEntry> {
    const amt = parseAmount(data.amount);
    if (data.type === 'replenishment') _pettyCashBalance += amt;
    else _pettyCashBalance -= amt;
    const entry: PettyCashEntry = { _id: mkId(), ...data, balance: _pettyCashBalance.toFixed(2), createdAt: new Date() };
    _pettyCash.unshift(entry);
    return entry;
  }

  getPettyCashEntries(): PettyCashEntry[] { return [..._pettyCash]; }
  getPettyCashBalance(): { balance: number; currency: string } { return { balance: _pettyCashBalance, currency: 'USD' }; }

  async createDonorFund(data: Partial<DonorFund>): Promise<DonorFund> {
    const fund: DonorFund = {
      _id: mkId(), donorName: data.donorName ?? 'Anonymous', grantCode: data.grantCode ?? `GR-${Date.now()}`,
      totalAmount: data.totalAmount ?? '0', currency: data.currency ?? 'USD',
      usedAmount: '0', remainingAmount: data.totalAmount ?? '0',
      purpose: data.purpose ?? '', restrictions: data.restrictions,
      expiryDate: data.expiryDate, linkedExpenseIds: [], createdAt: new Date(),
    };
    _donorFunds.unshift(fund);
    return fund;
  }

  async getDonorFunds(): Promise<DonorFund[]> { return [..._donorFunds]; }

  async chargeExpenseToDonorFund(fundId: string, expenseId: string, amount: string): Promise<DonorFund | null> {
    const fund = _donorFunds.find(f => f._id === fundId);
    if (!fund) return null;
    const amt = parseAmount(amount);
    fund.usedAmount = (parseAmount(fund.usedAmount) + amt).toFixed(2);
    fund.remainingAmount = (parseAmount(fund.totalAmount) - parseAmount(fund.usedAmount)).toFixed(2);
    fund.linkedExpenseIds.push(expenseId);
    return fund;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: PAYROLL MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async runPayrollAdvanced(data: { period: string; country: string; currency: string; frequency?: string; employees: Array<{ id: string; name: string; department?: string; grossSalary: number; overtimeHours?: number; unpaidLeaveDays?: number }> }): Promise<PayrollRun> {
    const deductions = PAYROLL_DEDUCTIONS[data.country] ?? [];
    const entries: PayrollEntry[] = [];
    let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerCost = 0;

    for (const emp of data.employees) {
      let gross = emp.grossSalary;
      // Overtime (1.5x hourly rate, assume 22 working days, 8hrs/day)
      const overtimeAmt = emp.overtimeHours ? (gross / (22 * 8)) * 1.5 * emp.overtimeHours : 0;
      gross += overtimeAmt;
      // Leave deduction
      const leaveDeduction = emp.unpaidLeaveDays ? (emp.grossSalary / 22) * emp.unpaidLeaveDays : 0;
      gross -= leaveDeduction;

      const empDeductions: Array<{ name: string; amount: number }> = [];
      const empContributions: Array<{ name: string; amount: number }> = [];
      let totalDed = 0, totalEmpCost = 0;

      for (const ded of deductions) {
        const amt = ded.fixedAmount ?? (ded.rate ? gross * (ded.rate / 100) : 0);
        empDeductions.push({ name: ded.name, amount: Math.round(amt * 100) / 100 });
        totalDed += amt;
        if (ded.employerContribution) {
          const ec = ded.fixedAmount ? (ded.employerContribution ?? 0) : gross * ((ded.employerContribution ?? 0) / 100);
          empContributions.push({ name: `${ded.name} (Employer)`, amount: Math.round(ec * 100) / 100 });
          totalEmpCost += ec;
        }
      }

      const netPay = gross - totalDed;
      entries.push({
        employeeId: emp.id, employeeName: emp.name, department: emp.department,
        grossSalary: Math.round(gross * 100) / 100,
        deductions: empDeductions, totalDeductions: Math.round(totalDed * 100) / 100,
        netPay: Math.round(netPay * 100) / 100,
        employerContributions: empContributions,
        totalEmployerCost: Math.round((gross + totalEmpCost) * 100) / 100,
        overtimeHours: emp.overtimeHours, overtimeAmount: Math.round(overtimeAmt * 100) / 100,
        unpaidLeaveDays: emp.unpaidLeaveDays, leaveDeduction: Math.round(leaveDeduction * 100) / 100,
      });

      totalGross += gross; totalDeductions += totalDed; totalNet += netPay; totalEmployerCost += gross + totalEmpCost;
    }

    const run: PayrollRun = {
      _id: mkId(), period: data.period, frequency: (data.frequency as any) ?? 'monthly',
      country: data.country, currency: data.currency, status: 'completed',
      employees: entries, totalGross: Math.round(totalGross * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
      processedAt: new Date(), createdAt: new Date(),
    };
    _payrollRuns.unshift(run);
    this.addAuditEntry('payment', run._id, 'create', 'system', 'Payroll Engine');
    return run;
  }

  async getPayrollRuns(): Promise<PayrollRun[]> { return [..._payrollRuns]; }

  getPayrollDeductions(country: string): PayrollDeduction[] { return PAYROLL_DEDUCTIONS[country] ?? []; }

  calculateEOSB(data: { employeeName: string; country: string; startDate: string; lastSalary: number; currency: string }): EOSBCalculation {
    const start = new Date(data.startDate);
    const years = (Date.now() - start.getTime()) / (365.25 * 86400000);
    let gratuity = 0, formula = '';

    if (data.country === 'AE') {
      // UAE Labour Law: 21 days salary per year (first 5), 30 days per year (after 5)
      const basicDaily = data.lastSalary / 30;
      if (years <= 5) { gratuity = basicDaily * 21 * years; formula = '21 days × years × daily salary'; }
      else { gratuity = (basicDaily * 21 * 5) + (basicDaily * 30 * (years - 5)); formula = '21 days × 5 + 30 days × remaining'; }
    } else if (data.country === 'SA') {
      const basicDaily = data.lastSalary / 30;
      if (years <= 5) { gratuity = basicDaily * 15 * years; formula = '15 days × years × daily salary'; }
      else { gratuity = (basicDaily * 15 * 5) + (basicDaily * 30 * (years - 5)); formula = '15 days × 5 + 30 days × remaining'; }
    } else if (data.country === 'IN') {
      gratuity = (data.lastSalary * 15 * years) / 26; formula = '(Salary × 15 × years) / 26';
    } else {
      gratuity = data.lastSalary * years * 0.5; formula = '50% of monthly salary × years';
    }

    return {
      employeeId: mkId(), employeeName: data.employeeName, country: data.country,
      startDate: data.startDate, endDate: new Date().toISOString().slice(0, 10),
      yearsOfService: Math.round(years * 10) / 10, lastSalary: data.lastSalary,
      currency: data.currency, gratuityAmount: Math.round(gratuity * 100) / 100, formula,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: FINANCIAL REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  async generateProfitAndLoss(period?: string, currency?: string): Promise<ProfitAndLoss> {
    const { data: invoices } = await this.getInvoices({ limit: 10000 });
    const expenses = await this.getExpenses({ limit: 10000 });
    const cur = currency ?? 'USD';

    const incomeByModule: Record<string, number> = {};
    const incomeByCategory: Record<string, number> = {};
    let totalIncome = 0;

    for (const inv of invoices) {
      if (inv.status !== 'paid') continue;
      const amt = parseAmount(inv.amount);
      const converted = inv.currency !== cur ? convertCurrency(amt, inv.currency ?? 'USD', cur) : amt;
      totalIncome += converted;
      incomeByModule[inv.module] = (incomeByModule[inv.module] ?? 0) + converted;
      incomeByCategory['Revenue'] = (incomeByCategory['Revenue'] ?? 0) + converted;
    }

    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    for (const exp of (expenses as any[]).map ? expenses as Expense[] : []) {
      const amt = parseAmount(exp.amount);
      totalExpenses += amt;
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] ?? 0) + amt;
    }

    return {
      period: period ?? new Date().toISOString().slice(0, 7), currency: cur,
      totalIncome: Math.round(totalIncome * 100) / 100,
      incomeByCategory, incomeByModule,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      expensesByCategory,
      grossProfit: Math.round((totalIncome - totalExpenses) * 100) / 100,
      netProfit: Math.round((totalIncome - totalExpenses) * 100) / 100,
      taxExpense: 0,
    };
  }

  async generateCashFlowForecast(currency?: string): Promise<CashFlowForecast> {
    const { data: invoices } = await this.getInvoices({ limit: 10000 });
    const expenses = await this.getExpenses({ limit: 10000 });
    const today = new Date();
    const cur = currency ?? 'USD';
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Build 12 monthly buckets (current month + next 11)
    const forecast = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

      // Inflows: unpaid invoices whose dueDate falls in this month (or overdue falling in month 0)
      let inflow = 0;
      for (const inv of invoices) {
        if (inv.status === 'paid' || inv.status === 'cancelled') continue;
        const dueMonth = (inv.dueDate ?? '').slice(0, 7);
        // Overdue invoices count in the current month (i === 0)
        const isOverdue = inv.dueDate < today.toISOString().slice(0, 10);
        if (dueMonth === monthKey || (i === 0 && isOverdue)) {
          inflow += parseAmount(inv.outstandingBalance ?? inv.amount);
        }
      }

      // Outflows: vendor bills + expenses (use their date as proxy for due)
      let outflow = 0;
      for (const bill of _vendorBills) {
        if (bill.status === 'paid') continue;
        const billMonth = (bill.dueDate ?? '').slice(0, 7);
        if (billMonth === monthKey) outflow += parseAmount(bill.amount);
      }
      for (const exp of expenses) {
        const expMonth = (exp.date ?? '').slice(0, 7);
        // Count expenses that are pending/approved in this month
        if (expMonth === monthKey && exp.status !== 'rejected') {
          outflow += parseAmount(exp.amount);
        }
      }

      const net = Math.round((inflow - outflow) * 100) / 100;
      return {
        month: label,
        monthKey,
        inflow: Math.round(inflow * 100) / 100,
        outflow: Math.round(outflow * 100) / 100,
        net,
        // Legacy fields for backwards compat
        period: monthKey,
        expectedInflows: Math.round(inflow * 100) / 100,
        expectedOutflows: Math.round(outflow * 100) / 100,
        projectedBalance: net,
      };
    });

    return { asOfDate: today.toISOString().slice(0, 10), currency: cur, currentBalance: 0, forecast };
  }

  async generateAINarrative(prompt: string): Promise<{ response: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { response: '' };
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const modelName of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return { response: result.response.text().trim() };
      } catch (err) {
        this.logger.warn(`Gemini (${modelName}) failed: ${(err as Error).message}`);
      }
    }
    return { response: '' };
  }

  async generateARAgingReport(): Promise<ARAgingBucket[]> {
    const { data: invoices } = await this.getInvoices({ limit: 10000 });
    const today = new Date();
    const buckets: Record<string, ARAgingBucket> = {
      '0-30': { range: '0-30', count: 0, totalAmount: 0, invoices: [] },
      '31-60': { range: '31-60', count: 0, totalAmount: 0, invoices: [] },
      '61-90': { range: '61-90', count: 0, totalAmount: 0, invoices: [] },
      '90+': { range: '90+', count: 0, totalAmount: 0, invoices: [] },
    };

    for (const inv of invoices) {
      // Only include sent/overdue/partial invoices — skip draft, credit_note, applied, pro_forma, cancelled, paid
      const skipStatuses = ['paid', 'cancelled', 'draft', 'applied', 'void', 'pro_forma'];
      if (skipStatuses.includes(inv.status)) continue;
      if (inv.type === 'credit_note' || inv.type === 'proforma') continue;
      const due = new Date(inv.dueDate);
      // Only include if actually past due date
      if (due >= today) continue;
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
      if (daysOverdue <= 0) continue;
      const amt = parseAmount(inv.outstandingBalance ?? inv.amount);
      if (amt <= 0) continue;
      const key = daysOverdue <= 30 ? '0-30' : daysOverdue <= 60 ? '31-60' : daysOverdue <= 90 ? '61-90' : '90+';
      buckets[key].count++;
      buckets[key].totalAmount += amt;
      buckets[key].invoices.push({ invoiceId: inv._id, invoiceNumber: inv.invoice, client: inv.client, amount: amt, daysOverdue });
    }

    return Object.values(buckets);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: BANK & ACCOUNT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async createBankAccount(data: Partial<BankAccount>): Promise<BankAccount> {
    const account: BankAccount = {
      _id: mkId(), accountName: data.accountName ?? 'Primary Account',
      bankName: data.bankName ?? 'Bank', accountNumber: data.accountNumber,
      iban: data.iban, type: data.type ?? 'checking',
      currency: data.currency ?? 'USD', balance: data.balance ?? '0',
      country: data.country ?? 'US', isDefault: data.isDefault ?? _bankAccounts.length === 0,
      createdAt: new Date(),
    };
    _bankAccounts.unshift(account);
    return account;
  }

  async getBankAccounts(): Promise<BankAccount[]> { return [..._bankAccounts]; }

  async addBankTransaction(data: Partial<BankTransaction>, tenantId?: string): Promise<BankTransaction> {
    const txn: BankTransaction = {
      _id: mkId(), accountId: data.accountId ?? '',
      date: data.date ?? new Date().toISOString().slice(0, 10),
      description: data.description ?? '', amount: data.amount ?? '0',
      type: data.type ?? 'debit', category: data.category,
      reference: data.reference, reconciled: false, tenant_id: tenantId, createdAt: new Date(),
    };
    _bankTransactions.unshift(txn);

    // Update account balance
    const account = _bankAccounts.find(a => a._id === data.accountId);
    if (account) {
      const bal = parseAmount(account.balance);
      account.balance = (txn.type === 'credit' ? bal + parseAmount(txn.amount) : bal - parseAmount(txn.amount)).toFixed(2);
    }
    return txn;
  }

  async getBankTransactions(accountId?: string, reconciled?: boolean): Promise<BankTransaction[]> {
    let list = [..._bankTransactions];
    if (accountId) list = list.filter(t => t.accountId === accountId);
    if (reconciled !== undefined) list = list.filter(t => t.reconciled === reconciled);
    return list;
  }

  async reconcileBankTransaction(txnId: string, invoiceId?: string, expenseId?: string): Promise<BankTransaction | null> {
    const txn = _bankTransactions.find(t => t._id === txnId);
    if (!txn) return null;
    txn.reconciled = true;
    txn.matchedInvoiceId = invoiceId;
    txn.matchedExpenseId = expenseId;
    return txn;
  }

  async createIntercompanyTransfer(data: { fromAccountId: string; toAccountId: string; amount: string; currency: string; description: string }): Promise<IntercompanyTransfer> {
    const transfer: IntercompanyTransfer = {
      _id: mkId(), ...data, date: new Date().toISOString().slice(0, 10), status: 'completed', createdAt: new Date(),
    };
    _intercompanyTransfers.unshift(transfer);

    // Debit from, credit to
    await this.addBankTransaction({ accountId: data.fromAccountId, amount: data.amount, type: 'debit', description: `Transfer: ${data.description}`, reference: transfer._id });
    await this.addBankTransaction({ accountId: data.toAccountId, amount: data.amount, type: 'credit', description: `Transfer: ${data.description}`, reference: transfer._id });
    return transfer;
  }

  async getIntercompanyTransfers(): Promise<IntercompanyTransfer[]> { return [..._intercompanyTransfers]; }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: SUBSCRIPTIONS & RECURRING REVENUE
  // ═══════════════════════════════════════════════════════════════════════════

  async createSubscriptionPlan(data: Partial<SubscriptionPlan>, tenantId?: string): Promise<SubscriptionPlan> {
    const basePriceUSD = (data as any).price ?? data.basePriceUSD ?? 10;
    const localizedPrices = data.localizedPrices ?? Object.entries(DEFAULT_LOCALIZED_PRICES).map(([country, info]) => ({
      country, currency: info.currency, amount: Math.round(basePriceUSD * info.multiplier * 100) / 100,
    }));
    const plan: SubscriptionPlan = {
      _id: mkId(), name: data.name ?? 'Basic Plan', description: data.description ?? '',
      basePriceUSD, localizedPrices, billingCycle: (data as any).frequency ?? data.billingCycle ?? 'monthly',
      features: data.features ?? [], isActive: true, createdAt: new Date(),
    };

    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        await db.collection('subscription_plans').doc(plan._id).set({
          ...plan, tenantId,
          price: basePriceUSD,
          currency: (data as any).currency ?? 'USD',
          frequency: plan.billingCycle,
          trialDays: (data as any).trialDays ?? 0,
          createdAt: plan.createdAt.toISOString(),
        });
        this.logger.log(`SubscriptionPlan ${plan.name} saved to Firestore for tenant ${tenantId}`);
        return plan;
      } catch (err) {
        this.logger.warn(`Firestore createSubscriptionPlan failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }

    _subscriptionPlans.unshift(plan);
    return plan;
  }

  async getSubscriptionPlans(tenantId?: string): Promise<SubscriptionPlan[]> {
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const snap = await db.collection('subscription_plans').where('tenantId', '==', tenantId).get();
        return snap.docs
          .map(d => {
            const data = d.data();
            return { ...data, _id: d.id, createdAt: new Date(data.createdAt) } as SubscriptionPlan;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (err) {
        this.logger.warn(`Firestore getSubscriptionPlans failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    return [..._subscriptionPlans];
  }

  getLocalizedPrice(planId: string, country: string): { currency: string; amount: number } | null {
    const plan = _subscriptionPlans.find(p => p._id === planId);
    if (!plan) return null;
    const lp = plan.localizedPrices.find(p => p.country === country);
    if (lp) return { currency: lp.currency, amount: lp.amount };
    const info = DEFAULT_LOCALIZED_PRICES[country];
    if (info) return { currency: info.currency, amount: Math.round(plan.basePriceUSD * info.multiplier * 100) / 100 };
    return { currency: 'USD', amount: plan.basePriceUSD };
  }

  async createSubscription(data: { memberId: string; memberName: string; planId: string; country: string }, tenantId?: string): Promise<Subscription> {
    const plans = await this.getSubscriptionPlans(tenantId);
    const plan = plans.find(p => p._id === data.planId) ?? _subscriptionPlans.find(p => p._id === data.planId);
    const price = this.getLocalizedPrice(data.planId, data.country);
    const now = new Date();
    const end = new Date(now); end.setMonth(end.getMonth() + 1);
    const sub: Subscription = {
      _id: mkId(), memberId: data.memberId, memberName: data.memberName,
      planId: data.planId, planName: plan?.name ?? 'Unknown',
      country: data.country, currency: price?.currency ?? 'USD', amount: price?.amount ?? 0,
      status: 'active', currentPeriodStart: now.toISOString().slice(0, 10),
      currentPeriodEnd: end.toISOString().slice(0, 10), createdAt: now,
    };

    // Always keep in-memory copy so churn metrics can find it even if Firestore is unavailable
    _subscriptions.unshift(sub);

    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        await db.collection('subscriptions').doc(sub._id).set({
          ...sub, tenantId, createdAt: now.toISOString(),
        });
        this.logger.log(`Subscription for ${sub.memberName} saved to Firestore for tenant ${tenantId}`);
      } catch (err) {
        this.logger.warn(`Firestore createSubscription failed: ${(err as Error).message}; in-memory copy retained`);
      }
    }

    this.fireWebhook('subscription.created', sub);
    return sub;
  }

  async getSubscriptions(status?: string, tenantId?: string): Promise<Subscription[]> {
    const mem = status ? _subscriptions.filter(s => s.status === status) : [..._subscriptions];
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        let query: any = db.collection('subscriptions').where('tenantId', '==', tenantId);
        if (status) query = query.where('status', '==', status);
        const snap = await query.get();
        const firestoreSubs = snap.docs.map(d => {
          const data = d.data();
          return { ...data, _id: d.id, createdAt: new Date(data.createdAt) } as Subscription;
        });
        // Merge: Firestore is authoritative for records it has; in-memory fills gaps
        const firestoreIds = new Set(firestoreSubs.map(s => s._id));
        const memOnly = mem.filter(s => !firestoreIds.has(s._id));
        return [...firestoreSubs, ...memOnly].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (err) {
        this.logger.warn(`Firestore getSubscriptions failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    return mem;
  }

  async cancelSubscription(id: string, tenantId?: string): Promise<Subscription | null> {
    const cancelledAt = new Date().toISOString();
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const ref = db.collection('subscriptions').doc(id);
        const doc = await ref.get();
        if (!doc.exists || doc.data()?.tenantId !== tenantId) return null;
        await ref.update({ status: 'cancelled', cancelledAt });
        const sub = { ...doc.data(), _id: id, status: 'cancelled' as const, cancelledAt, createdAt: new Date(doc.data()!.createdAt) } as Subscription;
        this.fireWebhook('subscription.cancelled', sub);
        return sub;
      } catch (err) {
        this.logger.warn(`Firestore cancelSubscription failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    const sub = _subscriptions.find(s => s._id === id);
    if (!sub) return null;
    sub.status = 'cancelled'; sub.cancelledAt = cancelledAt;
    this.fireWebhook('subscription.cancelled', sub);
    return sub;
  }

  calculateProration(data: { currentAmount: number; newAmount: number; periodEnd: string }): ProrationResult {
    const now = new Date(); const end = new Date(data.periodEnd);
    const totalDays = 30; const daysRemaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 86400000));
    const creditAmount = Math.round((data.currentAmount / totalDays) * daysRemaining * 100) / 100;
    const chargeAmount = Math.round((data.newAmount / totalDays) * daysRemaining * 100) / 100;
    return { originalAmount: data.currentAmount, newAmount: data.newAmount, daysRemaining, totalDays, creditAmount, chargeAmount, netCharge: Math.round((chargeAmount - creditAmount) * 100) / 100 };
  }

  async createCoupon(data: Partial<Coupon>, tenantId?: string): Promise<Coupon> {
    const coupon: Coupon = {
      _id: mkId(), code: data.code ?? `PROMO${Date.now()}`, type: data.type ?? 'percentage',
      value: data.value ?? 10, currency: data.currency, regionalValues: data.regionalValues,
      maxUses: data.maxUses ?? 100, currentUses: 0, expiresAt: data.expiresAt,
      applicablePlans: data.applicablePlans, applicableCountries: data.applicableCountries,
      isActive: true, createdAt: new Date(),
    };

    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        await db.collection('coupons').doc(coupon._id).set({ ...coupon, tenantId, createdAt: new Date().toISOString() });
        this.logger.log(`Coupon ${coupon.code} saved to Firestore for tenant ${tenantId}`);
        return coupon;
      } catch (err) {
        this.logger.warn(`Firestore createCoupon failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }

    _coupons.unshift(coupon);
    return coupon;
  }

  async getCoupons(tenantId?: string): Promise<Coupon[]> {
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const snap = await db.collection('coupons').where('tenantId', '==', tenantId).get();
        return snap.docs
          .map(d => {
            const data = d.data();
            return {
              _id: d.id, code: data.code, type: data.type, value: data.value,
              currency: data.currency, regionalValues: data.regionalValues,
              maxUses: data.maxUses, currentUses: data.currentUses, expiresAt: data.expiresAt,
              applicablePlans: data.applicablePlans, applicableCountries: data.applicableCountries,
              isActive: data.isActive, createdAt: new Date(data.createdAt),
            } as Coupon;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (err) {
        this.logger.warn(`Firestore getCoupons failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    return tenantId ? _coupons.filter(c => (c as any).tenantId === tenantId || !(c as any).tenantId) : [..._coupons];
  }

  async deactivateCoupon(id: string, tenantId?: string): Promise<Coupon | null> {
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const ref = db.collection('coupons').doc(id);
        const doc = await ref.get();
        if (!doc.exists || doc.data()?.tenantId !== tenantId) return null;
        await ref.update({ isActive: false });
        return { ...doc.data(), _id: id, isActive: false } as Coupon;
      } catch (err) {
        this.logger.warn(`Firestore deactivateCoupon failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    const c = _coupons.find(x => x._id === id);
    if (!c) return null;
    c.isActive = false;
    return c;
  }

  async applyCoupon(code: string, amount: number, tenantId?: string, country?: string, redeem: boolean = false): Promise<{ discountedAmount: number; discount: number; valid: boolean; reason?: string }> {
    let coupon: Coupon | undefined;

    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const snap = await db.collection('coupons')
          .where('tenantId', '==', tenantId)
          .where('code', '==', code)
          .where('isActive', '==', true)
          .get();
        if (!snap.empty) {
          const d = snap.docs[0].data();
          coupon = { ...d, _id: snap.docs[0].id, createdAt: new Date(d.createdAt) } as Coupon;
        }
      } catch (err) {
        this.logger.warn(`Firestore applyCoupon lookup failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }

    if (!coupon) coupon = _coupons.find(c => c.code === code && c.isActive && (!tenantId || (c as any).tenantId === tenantId || !(c as any).tenantId));
    if (!coupon) return { discountedAmount: amount, discount: 0, valid: false, reason: 'Invalid code' };
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return { discountedAmount: amount, discount: 0, valid: false, reason: 'Expired' };
    if (coupon.currentUses >= coupon.maxUses) return { discountedAmount: amount, discount: 0, valid: false, reason: 'Max uses reached' };
    if (coupon.applicableCountries?.length && country && !coupon.applicableCountries.includes(country)) return { discountedAmount: amount, discount: 0, valid: false, reason: 'Not available in your region' };

    let discount = 0;
    if (coupon.type === 'percentage') discount = amount * (coupon.value / 100);
    else if (coupon.type === 'fixed') discount = coupon.value;
    else if (coupon.type === 'regional' && coupon.regionalValues) {
      const rv = coupon.regionalValues.find(r => r.country === country);
      discount = rv?.amount ?? coupon.value;
    }

    if (redeem) {
      const newUses = coupon.currentUses + 1;
      if (db && tenantId) {
        try {
          await db.collection('coupons').doc(coupon._id).update({ currentUses: newUses });
        } catch (err) {
          this.logger.warn(`Firestore applyCoupon increment failed: ${(err as Error).message}`);
        }
      } else {
        coupon.currentUses = newUses;
      }
    }

    return { discountedAmount: Math.round((amount - discount) * 100) / 100, discount: Math.round(discount * 100) / 100, valid: true };
  }

  async getChurnMetrics(tenantId?: string): Promise<ChurnMetrics> {
    // Pull real data from Firestore (falls back to in-memory if Firestore unavailable)
    const allSubs = await this.getSubscriptions(undefined, tenantId);
    const active = allSubs.filter(s => s.status === 'active');
    const cancelled = allSubs.filter(s => s.status === 'cancelled');
    const pastDue = allSubs.filter(s => s.status === 'past_due');

    const mrr = active.reduce((s, sub) => s + (sub.amount ?? 0), 0);

    // ── byPlan / byRegion with real per-plan churn rates ──────────────────────
    const byPlan: Record<string, { count: number; mrr: number; churnRate: number }> = {};
    const byRegion: Record<string, { count: number; mrr: number; churnRate: number }> = {};

    for (const sub of active) {
      const plan = sub.planName || 'Unknown';
      if (!byPlan[plan]) byPlan[plan] = { count: 0, mrr: 0, churnRate: 0 };
      byPlan[plan].count++; byPlan[plan].mrr += sub.amount ?? 0;
      const region = sub.country || 'Unknown';
      if (!byRegion[region]) byRegion[region] = { count: 0, mrr: 0, churnRate: 0 };
      byRegion[region].count++; byRegion[region].mrr += sub.amount ?? 0;
    }
    // Count cancellations per plan/region and compute churn rates
    for (const sub of cancelled) {
      const plan = sub.planName || 'Unknown';
      if (!byPlan[plan]) byPlan[plan] = { count: 0, mrr: 0, churnRate: 0 };
      const region = sub.country || 'Unknown';
      if (!byRegion[region]) byRegion[region] = { count: 0, mrr: 0, churnRate: 0 };
    }
    for (const key of Object.keys(byPlan)) {
      const planCancelled = cancelled.filter(s => (s.planName || 'Unknown') === key).length;
      const planTotal = byPlan[key].count + planCancelled;
      byPlan[key].churnRate = planTotal > 0 ? Math.round((planCancelled / planTotal) * 10000) / 100 : 0;
    }
    for (const key of Object.keys(byRegion)) {
      const regionCancelled = cancelled.filter(s => (s.country || 'Unknown') === key).length;
      const regionTotal = byRegion[key].count + regionCancelled;
      byRegion[key].churnRate = regionTotal > 0 ? Math.round((regionCancelled / regionTotal) * 10000) / 100 : 0;
    }

    // ── At-risk client engine ─────────────────────────────────────────────────
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const atRiskClients = [...active, ...pastDue]
      .map(sub => {
        const failedPayments = sub.status === 'past_due' ? 1 : 0;
        const supportTickets = cancelled.filter(c => c.memberId === sub.memberId).length;
        const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
        const contractExpiring = periodEnd ? (periodEnd.getTime() - now.getTime()) < thirtyDaysMs && periodEnd > now : false;
        const riskSignals = (failedPayments > 0 ? 1 : 0) + (supportTickets > 0 ? 1 : 0) + (contractExpiring ? 1 : 0);
        if (riskSignals === 0) return null;
        const riskLevel: 'high' | 'medium' | 'low' = riskSignals >= 2 ? 'high' : failedPayments > 0 ? 'high' : 'medium';
        return {
          memberId: sub.memberId,
          name: sub.memberName,
          lastActive: sub.currentPeriodEnd,
          riskScore: riskLevel === 'high' ? 'High Risk' : 'Medium Risk',
          riskLevel,
          riskFactors: { failedPayments, supportTickets, contractExpiring },
        };
      })
      .filter(Boolean) as any[];

    // ── 24-month churn trend ──────────────────────────────────────────────────
    const TREND_MONTHS = 24;
    const churnTrend: number[] = Array(TREND_MONTHS).fill(0);
    for (const sub of cancelled) {
      if (sub.cancelledAt) {
        const cancelDate = new Date(sub.cancelledAt);
        const monthsAgo = (now.getFullYear() - cancelDate.getFullYear()) * 12 + (now.getMonth() - cancelDate.getMonth());
        if (monthsAgo >= 0 && monthsAgo < TREND_MONTHS) churnTrend[TREND_MONTHS - 1 - monthsAgo]++;
      }
    }

    // ── Correct churn rate: cancelled / (active + cancelled) ─────────────────
    const totalKnown = active.length + cancelled.length + pastDue.length;
    const churnRate = totalKnown > 0
      ? Math.round((cancelled.length / totalKnown) * 10000) / 100
      : 0;

    // ── True LTV: ARPU / monthly_churn_rate (SaaS formula) ────────────────────
    const arpu = active.length > 0 ? mrr / active.length : 0;
    const monthlyChurnRate = churnRate / 100;
    // If churnRate is 0 (no cancellations), cap LTV at 24 months of ARPU
    const ltv = arpu > 0
      ? (monthlyChurnRate > 0 ? Math.round((arpu / monthlyChurnRate) * 100) / 100 : Math.round(arpu * 24 * 100) / 100)
      : 0;

    // ── newSubscribers: check both month AND year ─────────────────────────────
    const newSubscribers = active.filter(s => {
      const d = new Date(s.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    return {
      period: now.toISOString().slice(0, 7),
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      totalSubscribers: active.length,
      newSubscribers,
      churnedSubscribers: cancelled.length,
      churnRate,
      ltv,
      atRiskClients,
      churnTrend,
      byPlan,
      byRegion,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: INTEGRATIONS & FLYN AI ECOSYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  async registerWebhook(data: { url: string; events: WebhookEvent[]; secret?: string }): Promise<WebhookEndpoint> {
    const wh: WebhookEndpoint = { _id: mkId(), url: data.url, events: data.events, secret: data.secret ?? mkId(), isActive: true, failureCount: 0, createdAt: new Date() };
    _webhooks.unshift(wh); return wh;
  }

  async getWebhooks(): Promise<WebhookEndpoint[]> { return [..._webhooks]; }

  async deleteWebhook(id: string): Promise<boolean> { const idx = _webhooks.findIndex(w => w._id === id); if (idx === -1) return false; _webhooks.splice(idx, 1); return true; }

  private async fireWebhook(event: WebhookEvent, payload: unknown) {
    for (const wh of _webhooks) {
      if (!wh.isActive || !wh.events.includes(event)) continue;
      this.logger.log(`[Webhook] Firing ${event} to ${wh.url}`);
      wh.lastTriggeredAt = new Date();
      // In production: HTTP POST to wh.url with HMAC signature
    }
  }

  async syncFromIntegration(data: { source: IntegrationSync['source']; eventType: string; sourceId: string; data: Record<string, unknown> }): Promise<IntegrationSync> {
    // Keep source as-is (both 'freelance' and 'freelancers' are valid in the union type)
    const normalised = { ...data } as typeof data & { source: IntegrationSync['source'] };
    const sync: IntegrationSync = { _id: mkId(), ...normalised, accountingEntityType: 'invoice', status: 'pending', timestamp: new Date() };
    const isManual = normalised.eventType === 'manual_sync';

    try {
      // ── CRM ──────────────────────────────────────────────────────────────────
      if (normalised.source === 'crm') {
        if (!isManual) {
          const inv = await this.createInvoice({ client: String(normalised.data.clientName ?? 'CRM Client'), amount: String(normalised.data.dealValue ?? '0'), module: 'CRM', description: `Deal: ${normalised.data.dealName}` });
          sync.accountingEntityId = (inv as any)._id;
        }
        sync.status = 'synced'; sync.accountingEntityType = 'invoice';

      // ── Events ───────────────────────────────────────────────────────────────
      } else if (normalised.source === 'events') {
        if (!isManual) {
          const inv = await this.createInvoice({ client: String(normalised.data.attendeeName ?? 'Event Attendee'), amount: String(normalised.data.ticketPrice ?? '0'), module: 'Events', description: `Event: ${normalised.data.eventName}` });
          sync.accountingEntityId = (inv as any)._id;
        }
        sync.status = 'synced'; sync.accountingEntityType = 'invoice';

      // ── Coaches ──────────────────────────────────────────────────────────────
      } else if (normalised.source === 'coaches') {
        if (!isManual) {
          const inv = await this.createInvoice({ client: String(normalised.data.clientName ?? 'Coaching Client'), amount: String(normalised.data.sessionRate ?? '0'), module: 'Coaches', description: `Session: ${normalised.data.sessionDate}` });
          sync.accountingEntityId = (inv as any)._id;
        }
        sync.status = 'synced'; sync.accountingEntityType = 'invoice';

      // ── Freelancers ──────────────────────────────────────────────────────────
      } else if (normalised.source === 'freelancers' || normalised.source === 'freelance') {
        if (!isManual) {
          const inv = await this.createInvoice({ client: String(normalised.data.clientName ?? 'Freelance Client'), amount: String(normalised.data.milestoneAmount ?? '0'), module: 'Freelancers', description: `Milestone: ${normalised.data.milestoneName}` });
          sync.accountingEntityId = (inv as any)._id;
        }
        sync.status = 'synced'; sync.accountingEntityType = 'invoice';

      // ── HR / Payroll ─────────────────────────────────────────────────────────
      // For manual sync: walk all payroll runs and create an expense for each
      // run that hasn't already been synced (no matching expense description).
      } else if (normalised.source === 'hr') {
        if (isManual) {
          const alreadySynced = new Set(
            _expenses
              .filter(e => e.category === 'Payroll' && e.description?.startsWith('Payroll sync:'))
              .map(e => e.description)
          );
          let synced = 0;
          for (const run of _payrollRuns) {
            const desc = `Payroll sync: ${run.period ?? run._id}`;
            if (!alreadySynced.has(desc)) {
              try {
                await this.createExpense({
                  description: desc,
                  amount: String(run.totalNet ?? run.totalGross ?? '0'),
                  currency: run.currency ?? 'USD',
                  category: 'Payroll',
                  date: run.processedAt ? new Date(run.processedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                  status: 'approved',
                  employee: 'payroll-engine',
                });
                synced++;
              } catch { /* skip duplicates */ }
            }
          }
          sync.accountingEntityType = 'expense';
          sync.data = { ...sync.data, syncedRuns: synced };
        }
        sync.status = 'synced';

      // ── Church ───────────────────────────────────────────────────────────────
      } else if ((normalised.source as string) === 'church') {
        sync.status = 'synced'; sync.accountingEntityType = 'invoice';

      // ── Telephony ────────────────────────────────────────────────────────────
      } else if (normalised.source === 'telephony' && normalised.eventType === 'call.completed') {
        const exp = await this.createExpense({ description: `Call cost: ${normalised.data.callDuration}min`, amount: String(normalised.data.callCost ?? '0'), category: 'Telephony' });
        sync.accountingEntityType = 'expense'; sync.accountingEntityId = (exp as any)._id; sync.status = 'synced';

      // ── Shopify / Zapier ─────────────────────────────────────────────────────
      } else if ((normalised.source === 'shopify' || normalised.source === 'zapier') && normalised.eventType === 'order.created') {
        const inv = await this.createInvoice({ client: String(normalised.data.customerName ?? 'External Customer'), amount: String(normalised.data.orderTotal ?? '0'), module: 'External', description: `Order: ${normalised.data.orderId}` });
        sync.accountingEntityId = (inv as any)._id; sync.status = 'synced';

      } else {
        sync.status = 'synced';
      }
    } catch (e) { sync.status = 'failed'; sync.error = String(e); }

    _integrationSyncs.unshift(sync);
    return sync;
  }

  async getIntegrationSyncs(source?: string): Promise<IntegrationSync[]> {
    return source ? _integrationSyncs.filter(s => s.source === source) : [..._integrationSyncs];
  }

  async configureExternalSync(data: Partial<ExternalSyncConfig>): Promise<ExternalSyncConfig> {
    const config: ExternalSyncConfig = { _id: mkId(), provider: data.provider ?? 'xero', apiKey: data.apiKey, tenantId: data.tenantId, syncDirection: data.syncDirection ?? 'bidirectional', isActive: true, createdAt: new Date() };
    _externalSyncs.unshift(config); return config;
  }

  async getExternalSyncs(): Promise<ExternalSyncConfig[]> { return [..._externalSyncs]; }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: ROLES, PERMISSIONS & MULTI-ENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  getPermissionsForRole(role: AccountingRole): AccountingPermission[] { return ROLE_PERMISSIONS[role] ?? []; }

  checkPermission(role: AccountingRole, permission: AccountingPermission): boolean { return ROLE_PERMISSIONS[role]?.includes(permission) ?? false; }

  async createApprovalChain(data: Partial<ApprovalChain>): Promise<ApprovalChain> {
    const chain: ApprovalChain = { _id: mkId(), entityType: data.entityType ?? 'invoice', thresholdAmount: data.thresholdAmount ?? 5000, currency: data.currency ?? 'USD', requiredApprovers: data.requiredApprovers ?? [], isActive: true };
    _approvalChains.unshift(chain); return chain;
  }

  async getApprovalChains(): Promise<ApprovalChain[]> { return [..._approvalChains]; }

  checkApprovalRequired(entityType: string, amount: number): { required: boolean; approvers: Array<{ userId: string; userName: string; role: string }> } {
    const chain = _approvalChains.find(c => c.isActive && c.entityType === entityType && amount >= c.thresholdAmount);
    return chain ? { required: true, approvers: chain.requiredApprovers } : { required: false, approvers: [] };
  }

  async createLegalEntity(data: Partial<LegalEntity>, tenantId?: string): Promise<LegalEntity> {
    const entity: LegalEntity = {
      _id: mkId(), name: data.name ?? 'New Entity', country: data.country ?? 'US',
      // Normalise: frontend sends baseCurrency, backend type uses currency
      currency: (data as any).baseCurrency ?? data.currency ?? 'USD',
      registrationNumber: data.registrationNumber ?? '',
      taxId: data.taxId ?? '', address: data.address ?? '',
      isParent: data.isParent ?? _legalEntities.length === 0, parentEntityId: data.parentEntityId,
      createdAt: new Date(),
    };

    // Persist to Firestore when available
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const ref = db.collection('legal_entities').doc(entity._id);
        await ref.set({ ...entity, tenantId, createdAt: new Date().toISOString() });
        this.logger.log(`Legal entity ${entity.name} saved to Firestore for tenant ${tenantId}`);
        return entity;
      } catch (err) {
        this.logger.warn(`Firestore createLegalEntity failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }

    // In-memory fallback
    _legalEntities.unshift(entity);
    return entity;
  }

  async getLegalEntities(tenantId?: string): Promise<LegalEntity[]> {
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        // No orderBy — composite indexes require manual Firebase Console setup.
        // Sort in-memory after fetch instead.
        const snap = await db.collection('legal_entities')
          .where('tenantId', '==', tenantId)
          .get();
        return snap.docs
          .map(d => {
            const data = d.data();
            return {
              _id: d.id,
              name: data.name, country: data.country, currency: data.currency,
              registrationNumber: data.registrationNumber, taxId: data.taxId,
              address: data.address, isParent: data.isParent, parentEntityId: data.parentEntityId,
              defaultTaxCode: data.defaultTaxCode,
              createdAt: new Date(data.createdAt),
            } as LegalEntity;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch (err) {
        this.logger.warn(`Firestore getLegalEntities failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    return tenantId ? _legalEntities.filter(e => (e as any).tenantId === tenantId || !(e as any).tenantId) : [..._legalEntities];
  }

  async deleteLegalEntity(id: string, tenantId?: string): Promise<boolean> {
    const db = this.firebase.firestore();
    if (db && tenantId) {
      try {
        const ref = db.collection('legal_entities').doc(id);
        const doc = await ref.get();
        if (!doc.exists || doc.data()?.tenantId !== tenantId) return false;
        await ref.delete();
        return true;
      } catch (err) {
        this.logger.warn(`Firestore deleteLegalEntity failed: ${(err as Error).message}; using in-memory fallback`);
      }
    }
    const idx = _legalEntities.findIndex(e => e._id === id);
    if (idx === -1) return false;
    _legalEntities.splice(idx, 1);
    return true;
  }

  async inviteAccountant(data: { email: string; name: string; accessLevel?: string; entityIds?: string[]; expiresAt?: string }): Promise<AccountantInvite> {
    const invite: AccountantInvite = {
      _id: mkId(), email: data.email, name: data.name,
      accessLevel: (data.accessLevel as any) ?? 'read_only',
      entityIds: data.entityIds ?? _legalEntities.map(e => e._id),
      expiresAt: data.expiresAt ?? new Date(Date.now() + 30 * 86400000).toISOString(),
      isActive: true, createdAt: new Date(),
    };
    _accountantInvites.unshift(invite); return invite;
  }

  async getAccountantInvites(): Promise<AccountantInvite[]> { return [..._accountantInvites]; }

  async revokeAccountantInvite(id: string): Promise<boolean> {
    const inv = _accountantInvites.find(i => i._id === id);
    if (!inv) return false; inv.isActive = false; return true;
  }

  logExport(data: { userId: string; userName: string; exportType: string; entityType: string; recordCount: number; ipAddress?: string }): ExportLog {
    const log: ExportLog = { _id: mkId(), ...data, timestamp: new Date() };
    _exportLogs.unshift(log);
    this.addAuditEntry('invoice', log._id, 'export', data.userId, data.userName);
    return log;
  }

  getExportLogs(userId?: string): ExportLog[] {
    return userId ? _exportLogs.filter(l => l.userId === userId) : [..._exportLogs];
  }

  // ── Country-Config Layer ────────────────────────────────────────────────

  getCountryConfig(countryCode: string): CountryConfig | null { return COUNTRY_CONFIGS[countryCode.toUpperCase()] ?? null; }

  getAllCountryConfigs(): Record<string, CountryConfig> { return { ...COUNTRY_CONFIGS }; }

  getDataRegion(countryCode: string): string { return COUNTRY_DATA_REGION[countryCode.toUpperCase()] ?? 'us-east'; }

  // ── Communication & Payments ───────────────────────────────────────────────

  /**
   * Dispatches an invoice to a client via Email & WhatsApp.
   */
  async sendInvoice(invoiceId: string, tenantId: string): Promise<{ success: boolean; message: string; emailSent: boolean; whatsappSent: boolean }> {
    const invoice = await this.getInvoiceById(invoiceId, tenantId);
    if (!invoice) throw new Error('Invoice not found');

    const tenant = await this.tenantsService.getTenant(tenantId);

    // Strip literal "undefined" / "null" strings that can end up in Firestore
    const clean = (v: string | null | undefined): string =>
      (!v || v.trim() === 'undefined' || v.trim() === 'null' || v.trim() === '') ? '' : v.trim();

    const companyName =
      clean((tenant as any)?.workspaceName) ||
      clean(tenant?.name) ||
      clean((tenant as any)?.businessName) ||
      clean((tenant as any)?.companyName) ||
      'FLYN';

    const html = this.invoicePdf.generateHTML(invoice, {
      companyName,
      companyAddress: clean(tenant?.companyAddress),
      companyEmail: clean(tenant?.companyEmail) || clean((tenant as any)?.email) || '',
      logoUrl: clean(tenant?.logoUrl),
    });

    let emailSent = false;
    let whatsappSent = false;
    const errors: string[] = [];

    // 2. Send Email — isolated so a WhatsApp failure won't block it
    if (invoice.clientEmail) {
      if (!process.env.SMTP_USER) {
        const msg = 'Email skipped: SMTP_USER not configured in environment. Add SMTP_HOST/PORT/USER/PASS/FROM to .env.';
        this.logger.warn(msg);
        errors.push(msg);
      } else {
        try {
          await this.mailService.sendEmail({
            to: invoice.clientEmail,
            subject: `Invoice ${invoice.invoice} from ${companyName}`,
            html,
          });
          emailSent = true;
          this.logger.log(`Invoice ${invoice.invoice} sent via email to ${invoice.clientEmail}`);
        } catch (err: any) {
          const msg = `Email failed: ${err?.message}`;
          this.logger.error(msg);
          errors.push(msg);
        }
      }
    } else {
      errors.push('Email skipped: no clientEmail on invoice');
    }

    // 3. Send WhatsApp — isolated so an email failure won't block it
    if (invoice.clientPhone) {
      try {
        await this.channelsService.broadcastWhatsApp(
          tenantId,
          [{ phone: invoice.clientPhone!, name: invoice.client }],
          `Hello ${invoice.client}, your invoice ${invoice.invoice} for ${invoice.amount} ${invoice.currency} is ready. View and pay here: ${this.getPublicInvoiceUrl(invoiceId, tenantId)}`,
        );
        whatsappSent = true;
        this.logger.log(`Invoice ${invoice.invoice} sent via WhatsApp to ${invoice.clientPhone}`);
      } catch (err: any) {
        const msg = `WhatsApp failed: ${err?.message}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    } else {
      errors.push('WhatsApp skipped: no clientPhone on invoice');
    }

    if (!emailSent && !whatsappSent) {
      throw new Error(`Invoice send failed — ${errors.join('; ')}`);
    }

    const channels = [emailSent && 'Email', whatsappSent && 'WhatsApp'].filter(Boolean).join(' & ');
    return { success: true, message: `Invoice dispatched via ${channels}`, emailSent, whatsappSent };
  }

  /**
   * Generates a Stripe Checkout session for an invoice.
   */
  async createInvoiceCheckout(invoiceId: string, tenantId: string, baseUrl: string, amountOverride?: number): Promise<{ url: string }> {
    const invoice = await this.getInvoiceById(invoiceId, tenantId);
    if (!invoice) throw new Error('Invoice not found');

    // If a partial amount override is provided, use it directly
    let amountCents: number;
    if (amountOverride && amountOverride > 0) {
      amountCents = Math.round(amountOverride * 100);
    } else {
      // Compute the true chargeable total. For invoices created without line items,
      // invoice.amount may be the pre-tax subtotal while tax sits in taxAmount.
      const subtotalVal = parseFloat(invoice.subtotal ?? '0');
      const base = subtotalVal > 0 ? subtotalVal : parseFloat(invoice.amount ?? '0');
      const discountVal = parseFloat(invoice.totalDiscount ?? '0');
      const taxVal = parseFloat(invoice.totalTax ?? '0') || parseFloat(invoice.taxAmount ?? '0');
      const trueTotal = base - discountVal + taxVal;
      amountCents = Math.round(trueTotal * 100);
    }

    const session = await this.stripeService.createCheckoutSession({
      amountCents,
      currency: invoice.currency ?? 'USD',
      // Use the DB id (not the human number) so the payment_intent.succeeded webhook can
      // reconcile + auto-mark the invoice paid via addPartialPayment (which looks up by _id).
      invoiceId: invoice._id ?? invoiceId,
      invoiceNumber: invoice.invoice,
      customerEmail: invoice.clientEmail,
      successUrl: `${baseUrl}/dashboard/accounting?payment_success=true&invoice=${invoiceId}`,
      cancelUrl: `${baseUrl}/dashboard/accounting?payment_cancelled=true&invoice=${invoiceId}`,
    }, tenantId);

    return { url: session.url! };
  }

  /** Helper to find a tenant's Stripe Account ID (Connect) */
  async findTenantStripeAccountId(tenantId: string): Promise<string | undefined> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    return tenant.integrations?.accounting?.stripe?.stripeUserId;
  }

  /** Generates the customer-facing payment URL for an invoice. */
  private getPublicInvoiceUrl(invoiceId: string, tenantId: string): string {
    return generatePaymentLink(invoiceId, '', tenantId);
  }
}
