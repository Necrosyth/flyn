/**
 * XeroSyncService
 *
 * Handles bi-directional synchronization between Flyn Accounting and Xero.
 *
 * Flow:
 *   pushInvoice()   — Flyn Invoice → Xero Invoice
 *   pullPayments()  — Xero Payments → Flyn Reconciliation
 *   refreshToken()  — Auto-refresh access token before expiry
 *   mapAccount()    — Map Flyn categories to Xero Chart of Account codes
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { TenantsService } from '../tenants/tenants.service';
import { Invoice } from './accounting.types';

// Xero account code mappings (configurable per tenant/org)
export const DEFAULT_XERO_ACCOUNT_MAP: Record<string, string> = {
  'CRM':         '200',   // Sales
  'HR':          '477',   // Wages & Salaries
  'Events':      '260',   // Other Revenue
  'Church':      '260',   // Other Revenue
  'Coaches':     '200',   // Sales
  'Freelancer':  '200',   // Sales
  'eSIM':        '200',   // Sales
  'General':     '400',   // General Expenses
  'Payroll':     '477',   // Wages & Salaries
  'Software':    '489',   // Software Subscriptions
  'Marketing':   '492',   // Marketing & Advertising
  'Travel':      '493',   // Travel & Accommodation
  'Utilities':   '470',   // Light, Power, Heating
  'Other':       '260',   // Other Revenue/Expense
};

export interface XeroSyncResult {
  success: boolean;
  xeroId?: string;
  error?: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
}

export interface XeroPayment {
  paymentId: string;
  invoiceId: string;
  amount: number;
  date: string;
  reference: string;
}

@Injectable()
export class XeroSyncService {
  private readonly logger = new Logger(XeroSyncService.name);
  private readonly XERO_BASE = 'https://api.xero.com/api.xro/2.0';
  private readonly TOKEN_URL = 'https://identity.xero.com/connect/token';

  constructor(private readonly tenantsService: TenantsService) {}

  // ── Token Management ─────────────────────────────────────────────────────

  private async getValidTokens(tenantId: string): Promise<{ accessToken: string; xeroTenantId: string } | null> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const xero = tenant?.integrations?.accounting?.xero;

    if (!xero?.accessToken) {
      this.logger.warn(`Xero not connected for tenant: ${tenantId}`);
      return null;
    }

    // Refresh if token expires within 5 minutes
    if (xero.expiryDate - Date.now() < 5 * 60 * 1000) {
      return this.refreshToken(tenantId, xero.refreshToken, xero.xeroTenantId);
    }

    return { accessToken: xero.accessToken, xeroTenantId: xero.xeroTenantId };
  }

  private async refreshToken(tenantId: string, refreshToken: string, xeroTenantId: string): Promise<{ accessToken: string; xeroTenantId: string } | null> {
    try {
      const authHeader = Buffer.from(
        `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
      ).toString('base64');

      const response = await axios.post(this.TOKEN_URL,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        { headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token: new_refresh, expires_in } = response.data;
      const expiryDate = Date.now() + expires_in * 1000;

      // Persist updated tokens
      const tenant = await this.tenantsService.getTenant(tenantId);
      const integrations = tenant.integrations || {};
      integrations.accounting = {
        ...integrations.accounting,
        xero: { accessToken: access_token, refreshToken: new_refresh, expiryDate, xeroTenantId, connectedAt: integrations.accounting?.xero?.connectedAt ?? Date.now() }
      };
      await this.tenantsService.updateTenant(tenantId, { integrations });

      this.logger.log(`Xero token refreshed for tenant: ${tenantId}`);
      return { accessToken: access_token, xeroTenantId };
    } catch (err: any) {
      this.logger.error(`Xero token refresh failed for tenant ${tenantId}: ${err?.message}`);
      return null;
    }
  }

  // ── Invoice Sync (Flyn → Xero) ──────────────────────────────────────────

  async pushInvoice(tenantId: string, invoice: Invoice, accountMap?: Record<string, string>): Promise<XeroSyncResult> {
    const tokens = await this.getValidTokens(tenantId);
    if (!tokens) return { success: false, error: 'Xero not connected', action: 'failed' };

    const map = { ...DEFAULT_XERO_ACCOUNT_MAP, ...(accountMap ?? {}) };
    const accountCode = map[invoice.module] ?? map['Other'];

    const xeroInvoice = {
      Type: invoice.isProForma ? 'ACCREC' : 'ACCREC',
      Contact: {
        // Xero requires a non-empty contact name; fall back so the push never fails on a blank client
        Name: (invoice.client && invoice.client.trim()) || `Customer (${invoice.invoice})`,
        EmailAddress: invoice.clientEmail ?? undefined,
      },
      LineItems: invoice.lineItems && invoice.lineItems.length > 0
        ? invoice.lineItems.map(li => ({
            Description: li.description,
            Quantity: li.quantity,
            UnitAmount: li.unitPrice,
            DiscountRate: li.discount,
            TaxAmount: li.taxRate ? (li.unitPrice * li.quantity * (li.taxRate / 100)) : 0,
            AccountCode: accountCode,
          }))
        : [(() => {
            // No line items: the form captured amount + (tax code / manual tax rate). Itemise
            // the tax so Xero shows it instead of burying it in the line total. We send the
            // PRE-TAX subtotal as UnitAmount and an explicit TaxAmount override (same pattern the
            // line-items branch uses) — total = subtotal + tax = the gross amount, so the invoice
            // total is preserved even though Xero orgs use their own TaxType codes.
            const totalTaxNum = parseFloat(invoice.totalTax ?? '0');
            const subtotalNum = parseFloat(invoice.subtotal ?? '0');
            if (totalTaxNum > 0 && subtotalNum > 0) {
              return {
                Description: invoice.description ?? `Invoice ${invoice.invoice}`,
                Quantity: 1,
                UnitAmount: subtotalNum,
                TaxAmount: totalTaxNum,
                AccountCode: accountCode,
              };
            }
            return {
              Description: invoice.description ?? `Invoice ${invoice.invoice}`,
              Quantity: 1,
              UnitAmount: parseFloat(invoice.amount),
              AccountCode: accountCode,
            };
          })()],
      // Tax is supplied as explicit per-line TaxAmount overrides, so amounts are tax-exclusive.
      LineAmountTypes: 'Exclusive',
      Date: (invoice.createdAt ? new Date(invoice.createdAt) : new Date()).toISOString().slice(0, 10),
      // Xero requires YYYY-MM-DD; pass through only if it parses, else omit (DueDate is optional)
      DueDate: this.toXeroDate(invoice.dueDate),
      InvoiceNumber: invoice.invoice,
      Reference: invoice._id,
      CurrencyCode: invoice.currency || 'USD',
      // SUBMITTED is only valid with approval workflow — AUTHORISED works for all org types
      Status: invoice.status === 'draft' ? 'DRAFT' : 'AUTHORISED',
    };

    const headers = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'xero-tenant-id': tokens.xeroTenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const postInvoice = async (payload: any) =>
      axios.post(`${this.XERO_BASE}/Invoices`, { Invoices: [payload] }, { headers });

    try {
      let response;
      try {
        response = await postInvoice(xeroInvoice);
      } catch (err: any) {
        // Org not subscribed to the invoice's currency (multi-currency is a paid Xero add-on).
        // Retry without CurrencyCode so Xero falls back to the organisation's base currency.
        const msg = this.extractXeroError(err);
        if (/not subscribed to currency/i.test(msg) && xeroInvoice.CurrencyCode) {
          this.logger.warn(`Xero: org not subscribed to ${xeroInvoice.CurrencyCode} for ${invoice.invoice} — retrying in org base currency`);
          const { CurrencyCode, ...withoutCurrency } = xeroInvoice;
          response = await postInvoice(withoutCurrency);
        } else {
          throw err;
        }
      }

      const created = response.data?.Invoices?.[0];
      if (!created) return { success: false, error: 'No invoice returned by Xero', action: 'failed' };

      this.logger.log(`Invoice ${invoice.invoice} pushed to Xero: ${created.InvoiceID}`);
      return { success: true, xeroId: created.InvoiceID, action: 'created' };
    } catch (err: any) {
      const msg = this.extractXeroError(err);
      this.logger.error(`Xero pushInvoice failed for ${invoice.invoice}: ${msg}`);
      return { success: false, error: msg, action: 'failed' };
    }
  }

  /**
   * Xero returns a generic top-level "A validation exception occurred" Message, but the
   * actual reason lives in Elements[].ValidationErrors[] (and per-line-item). Dig it out
   * so the user sees WHY (e.g. "Account code 200 ... is not a valid code", "Invoice not
   * saved, see ValidationErrors", date/contact problems) instead of a useless generic line.
   */
  /** Normalise a date to Xero's YYYY-MM-DD, or undefined if it can't be parsed (field is optional). */
  private toXeroDate(d: string | undefined | null): string | undefined {
    if (!d) return undefined;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
  }

  private extractXeroError(err: any): string {
    const data = err?.response?.data;
    if (!data) return err?.message ?? 'Unknown Xero error';
    const messages: string[] = [];
    for (const el of data.Elements ?? []) {
      for (const ve of el.ValidationErrors ?? []) if (ve.Message) messages.push(ve.Message);
      for (const li of el.LineItems ?? []) {
        for (const ve of li.ValidationErrors ?? []) if (ve.Message) messages.push(ve.Message);
      }
    }
    if (messages.length) return messages.join('; ');
    return data.Message ?? err?.message ?? 'Unknown Xero error';
  }

  // ── Payment Pull (Xero → Flyn) ──────────────────────────────────────────

  async pullPayments(tenantId: string, since?: Date): Promise<XeroPayment[]> {
    const tokens = await this.getValidTokens(tenantId);
    if (!tokens) return [];

    try {
      const ifModifiedSince = (since ?? new Date(Date.now() - 7 * 86400000)).toISOString();

      const response = await axios.get(`${this.XERO_BASE}/Payments`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'xero-tenant-id': tokens.xeroTenantId,
          'If-Modified-Since': ifModifiedSince,
          Accept: 'application/json',
        },
        params: { where: 'Status!="DELETED"' },
      });

      const payments: XeroPayment[] = (response.data?.Payments ?? []).map((p: any) => ({
        paymentId: p.PaymentID,
        invoiceId: p.Invoice?.InvoiceID ?? '',
        amount: p.Amount,
        date: p.Date?.slice(0, 10) ?? '',
        reference: p.Reference ?? '',
      }));

      this.logger.log(`Pulled ${payments.length} payments from Xero for tenant: ${tenantId}`);
      return payments;
    } catch (err: any) {
      this.logger.error(`Xero pullPayments failed: ${err?.message}`);
      return [];
    }
  }

  // ── Contact Sync (Flyn CRM → Xero) ─────────────────────────────────────

  async pushContact(tenantId: string, contact: { name: string; email?: string; phone?: string; taxNumber?: string }): Promise<string | null> {
    const tokens = await this.getValidTokens(tenantId);
    if (!tokens) return null;

    try {
      const response = await axios.post(
        `${this.XERO_BASE}/Contacts`,
        {
          Contacts: [{
            Name: contact.name,
            EmailAddress: contact.email,
            Phones: contact.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: contact.phone }] : [],
            TaxNumber: contact.taxNumber,
          }]
        },
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'xero-tenant-id': tokens.xeroTenantId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      return response.data?.Contacts?.[0]?.ContactID ?? null;
    } catch (err: any) {
      this.logger.error(`Xero pushContact failed: ${err?.message}`);
      return null;
    }
  }

  // ── Account Map Config (per-tenant) ─────────────────────────────────────

  async getXeroAccounts(tenantId: string): Promise<Array<{ code: string; name: string; type: string }>> {
    const tokens = await this.getValidTokens(tenantId);
    if (!tokens) return [];

    try {
      const response = await axios.get(`${this.XERO_BASE}/Accounts`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'xero-tenant-id': tokens.xeroTenantId,
          Accept: 'application/json',
        },
      });

      return (response.data?.Accounts ?? [])
        .filter((a: any) => a.Status === 'ACTIVE')
        .map((a: any) => ({ code: a.Code, name: a.Name, type: a.Type }));
    } catch (err: any) {
      this.logger.error(`Xero getAccounts failed: ${err?.message}`);
      return [];
    }
  }

  // ── Bulk Push (all un-synced invoices) ──────────────────────────────────

  async pushAllInvoices(tenantId: string, invoices: Invoice[], accountMap?: Record<string, string>, force = false): Promise<{ pushed: number; failed: number; errors: string[]; syncedIds: string[] }> {
    let pushed = 0; let failed = 0; const errors: string[] = []; const syncedIds: string[] = [];
    for (const inv of invoices) {
      if (!force && (inv as any).xeroSynced) continue; // already synced — skip (unless force re-push)
      const result = await this.pushInvoice(tenantId, inv, accountMap);
      if (result.success) { pushed++; syncedIds.push(inv._id); }
      else { failed++; if (result.error) errors.push(`${inv.invoice}: ${result.error}`); }
    }
    return { pushed, failed, errors, syncedIds };
  }

  async disconnect(tenantId: string): Promise<{ success: boolean }> {
    try {
      const tenant = await this.tenantsService.getTenant(tenantId);
      const integrations = tenant?.integrations ?? {};
      if (integrations.accounting?.xero) {
        integrations.accounting = { ...integrations.accounting, xero: undefined as any };
        delete integrations.accounting.xero;
        await this.tenantsService.updateTenant(tenantId, { integrations });
      }
      this.logger.log(`Xero disconnected for tenant: ${tenantId}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Xero disconnect failed for tenant ${tenantId}: ${err?.message}`);
      return { success: false };
    }
  }

  async getConnectionStatus(tenantId: string): Promise<{ connected: boolean; connectedAt?: number; xeroTenantId?: string; tokenExpiresAt?: Date; tokenExpired?: boolean }> {
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const xero = tenant?.integrations?.accounting?.xero;
    if (!xero?.accessToken) return { connected: false };

    const tokenExpired = xero.expiryDate ? xero.expiryDate < Date.now() : false;

    // Token expired with no refresh token → disconnected
    if (tokenExpired && !xero.refreshToken) {
      return { connected: false, connectedAt: xero.connectedAt, xeroTenantId: xero.xeroTenantId, tokenExpired: true };
    }

    // Token expired but we have a refresh token — attempt refresh to confirm it still works
    if (tokenExpired && xero.refreshToken) {
      const refreshed = await this.refreshToken(tenantId, xero.refreshToken, xero.xeroTenantId);
      return {
        connected: !!refreshed,
        connectedAt: xero.connectedAt,
        xeroTenantId: xero.xeroTenantId,
        tokenExpiresAt: xero.expiryDate ? new Date(xero.expiryDate) : undefined,
        tokenExpired: !refreshed,
      };
    }

    return {
      connected: true,
      connectedAt: xero.connectedAt,
      xeroTenantId: xero.xeroTenantId,
      tokenExpiresAt: xero.expiryDate ? new Date(xero.expiryDate) : undefined,
      tokenExpired: false,
    };
  }
}
