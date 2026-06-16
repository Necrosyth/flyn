/**
 * QuickBooksSyncService
 *
 * Handles bi-directional synchronization between Flyn Accounting and QuickBooks Online.
 *
 * Flow:
 *   pushInvoice()   — Flyn Invoice → QBO Invoice
 *   pullPayments()  — QBO Payments → Flyn Reconciliation
 *   refreshToken()  — Auto-refresh access token before expiry
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { TenantsService } from '../tenants/tenants.service';
import { Invoice } from './accounting.types';

export interface QBOSyncResult {
  success: boolean;
  qboId?: string;
  error?: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
}

// Default QBO Item mapping (Flyn Module → QBO Income Account)
export const DEFAULT_QBO_ACCOUNT_MAP: Record<string, string> = {
  'CRM':        'Services',
  'HR':         'Payroll Expenses',
  'Events':     'Event Revenue',
  'Church':     'Contributions',
  'Coaches':    'Coaching Revenue',
  'Freelancer': 'Freelance Revenue',
  'General':    'General Revenue',
};

@Injectable()
export class QuickBooksSyncService {
  private readonly logger = new Logger(QuickBooksSyncService.name);
  private readonly QBO_BASE_PROD = 'https://quickbooks.api.intuit.com/v3/company';
  private readonly QBO_BASE_SAND = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
  private readonly TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  // QBO rotates the refresh token on every refresh and invalidates the previous one.
  // Two concurrent refreshes with the same token → one wins, the other gets invalid_grant
  // and can permanently break the connection. Serialise refreshes per tenant to prevent that.
  private readonly refreshLocks = new Map<string, Promise<{ accessToken: string; realmId: string } | null>>();

  constructor(private readonly tenantsService: TenantsService) {
    if (process.env.QUICKBOOKS_MODE !== 'production') {
      this.logger.warn('⚠️  QUICKBOOKS_MODE is not "production" — all QBO API calls go to the SANDBOX. Real client data will NOT sync. Set QUICKBOOKS_MODE=production on the server.');
    }
  }

  private get qboBase(): string {
    return process.env.QUICKBOOKS_MODE === 'production' ? this.QBO_BASE_PROD : this.QBO_BASE_SAND;
  }

  // ── Token Management ─────────────────────────────────────────────────────

  private async getValidTokens(tenantId: string): Promise<{ accessToken: string; realmId: string } | null> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const qbo = tenant?.integrations?.accounting?.quickbooks;

    if (!qbo?.accessToken) {
      this.logger.warn(`QuickBooks not connected for tenant: ${tenantId}`);
      return null;
    }

    if (qbo.expiryDate - Date.now() < 5 * 60 * 1000) {
      return this.refreshToken(tenantId, qbo.refreshToken, qbo.realmId);
    }

    return { accessToken: qbo.accessToken, realmId: qbo.realmId };
  }

  private async refreshToken(tenantId: string, refreshToken: string, realmId: string): Promise<{ accessToken: string; realmId: string } | null> {
    // Dedupe concurrent refreshes for the same tenant (see refreshLocks comment).
    const inflight = this.refreshLocks.get(tenantId);
    if (inflight) return inflight;
    const p = this.doRefresh(tenantId, refreshToken, realmId).finally(() => this.refreshLocks.delete(tenantId));
    this.refreshLocks.set(tenantId, p);
    return p;
  }

  private async doRefresh(tenantId: string, refreshToken: string, realmId: string): Promise<{ accessToken: string; realmId: string } | null> {
    try {
      const authHeader = Buffer.from(
        `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
      ).toString('base64');

      const response = await axios.post(this.TOKEN_URL,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        { headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }
      );

      const { access_token, refresh_token: new_refresh, expires_in } = response.data;
      const expiryDate = Date.now() + expires_in * 1000;

      const tenant = await this.tenantsService.getTenant(tenantId);
      const integrations = tenant.integrations || {};
      integrations.accounting = {
        ...integrations.accounting,
        // clear any prior needsReconnect flag on a successful refresh
        quickbooks: { accessToken: access_token, refreshToken: new_refresh, expiryDate, realmId, connectedAt: integrations.accounting?.quickbooks?.connectedAt ?? Date.now(), needsReconnect: false }
      };
      await this.tenantsService.updateTenant(tenantId, { integrations });

      this.logger.log(`[qbo] token refreshed for tenant ${tenantId} (expires in ${expires_in}s)`);
      return { accessToken: access_token, realmId };
    } catch (err: any) {
      const data = err?.response?.data;
      const code = data?.error;
      const status = err?.response?.status;
      this.logger.error(`[qbo] token refresh FAILED tenant=${tenantId} status=${status} error=${code} desc=${data?.error_description ?? err?.message}`);
      // invalid_grant = the refresh token is expired/revoked → genuinely needs a manual reconnect.
      // Any other error (network, Intuit 5xx, rate limit) is TRANSIENT — do NOT mark disconnected,
      // the stored tokens are still valid and the next attempt will likely succeed.
      if (code === 'invalid_grant') {
        await this.markNeedsReconnect(tenantId).catch(() => {});
      }
      return null;
    }
  }

  /** Flag the QBO connection as needing a manual reconnect (refresh token dead). */
  private async markNeedsReconnect(tenantId: string): Promise<void> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const integrations = tenant.integrations || {};
    if (!integrations.accounting?.quickbooks) return;
    integrations.accounting = {
      ...integrations.accounting,
      quickbooks: { ...integrations.accounting.quickbooks, needsReconnect: true },
    };
    await this.tenantsService.updateTenant(tenantId, { integrations });
    this.logger.warn(`[qbo] tenant ${tenantId} marked needsReconnect (refresh token invalid_grant)`);
  }

  // ── Invoice Sync (Flyn → QuickBooks) ────────────────────────────────────

  async pushInvoice(tenantId: string, invoice: Invoice): Promise<QBOSyncResult> {
    const tokens = await this.getValidTokens(tenantId);
    if (!tokens) return { success: false, error: 'QuickBooks not connected', action: 'failed' };

    try {
      // Idempotency: if an invoice with this DocNumber already exists in QBO, don't
      // create a duplicate. This makes re-pushing (and bulk Push All) safe and lets
      // us re-confirm the sync flag for invoices that were already pushed.
      const existingId = await this.findInvoiceIdByDocNumber(tokens, invoice.invoice);
      if (existingId) {
        this.logger.log(`Invoice ${invoice.invoice} already in QBO: ${existingId} — skipping create`);
        return { success: true, qboId: existingId, action: 'skipped' };
      }

      // First ensure the customer exists in QBO
      const customerId = await this.findOrCreateCustomer(tokens, invoice.client, invoice.clientEmail);
      if (!customerId) return { success: false, error: 'Failed to resolve QBO Customer', action: 'failed' };

      // Resolve a valid item ID — use a "Services" item so QBO doesn't reject value:'1'
      const serviceItemId = await this.findOrCreateServiceItem(tokens);

      // No line items: itemise the tax (from the form's tax code / manual rate) so QBO shows it.
      // We bill the PRE-TAX subtotal on the line and pass the tax via TxnTaxDetail.TotalTax with
      // GlobalTaxCalculation=TaxExcluded (the documented approach for non-US companies), so
      // subtotal + tax = the gross amount and the invoice total is preserved.
      const totalTaxNum = parseFloat(invoice.totalTax ?? '0');
      const subtotalNum = parseFloat(invoice.subtotal ?? '0');
      const itemiseTax = (!invoice.lineItems || invoice.lineItems.length === 0) && totalTaxNum > 0 && subtotalNum > 0;
      const fallbackLineAmount = itemiseTax ? subtotalNum : (parseFloat(invoice.amount) || 0);

      const qboInvoice: Record<string, any> = {
        Line: invoice.lineItems && invoice.lineItems.length > 0
          ? invoice.lineItems.map(li => ({
              DetailType: 'SalesItemLineDetail',
              Amount: li.total ?? li.unitPrice * li.quantity,
              SalesItemLineDetail: {
                ItemRef: { name: li.description, value: serviceItemId },
                Qty: li.quantity,
                UnitPrice: li.unitPrice,
              },
            }))
          : [{
              DetailType: 'SalesItemLineDetail',
              Amount: fallbackLineAmount,
              SalesItemLineDetail: {
                ItemRef: { name: invoice.description ?? `Invoice ${invoice.invoice}`, value: serviceItemId },
                Qty: 1,
                UnitPrice: fallbackLineAmount,
              },
            }],
        CustomerRef: { value: customerId },
        DocNumber: invoice.invoice,
        TxnDate: (invoice.createdAt ? new Date(invoice.createdAt) : new Date()).toISOString().slice(0, 10),
        DueDate: invoice.dueDate || undefined,
        CurrencyRef: { value: invoice.currency || 'USD' },
      };

      if (itemiseTax) {
        // Note: US companies on Automated Sales Tax recompute tax from tax codes and may ignore
        // a manual TotalTax; this branch is correct for non-US locales (UAE/India/etc.).
        qboInvoice.GlobalTaxCalculation = 'TaxExcluded';
        qboInvoice.TxnTaxDetail = { TotalTax: totalTaxNum };
      }

      const response = await axios.post(
        `${this.qboBase}/${tokens.realmId}/invoice`,
        qboInvoice,
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          params: { minorversion: 65 },
        }
      );

      const created = response.data?.Invoice;
      if (!created) return { success: false, error: 'No invoice returned by QBO', action: 'failed' };

      this.logger.log(`Invoice ${invoice.invoice} pushed to QBO: ${created.Id}`);
      return { success: true, qboId: created.Id, action: 'created' };
    } catch (err: any) {
      const msg = err?.response?.data?.Fault?.Error?.[0]?.Message ?? err?.message;
      this.logger.error(`QBO pushInvoice failed: ${msg}`);
      return { success: false, error: msg, action: 'failed' };
    }
  }

  // ── Invoice Lookup (idempotency) ─────────────────────────────────────────

  /** Returns the QBO Invoice Id for a given Flyn DocNumber, or null if not present. */
  private async findInvoiceIdByDocNumber(
    tokens: { accessToken: string; realmId: string },
    docNumber: string,
  ): Promise<string | null> {
    if (!docNumber) return null;
    try {
      const query = `SELECT Id FROM Invoice WHERE DocNumber = '${docNumber.replace(/'/g, "\\'")}' MAXRESULTS 1`;
      const resp = await axios.get(`${this.qboBase}/${tokens.realmId}/query`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
        params: { query, minorversion: 65 },
      });
      return resp.data?.QueryResponse?.Invoice?.[0]?.Id ?? null;
    } catch (err: any) {
      // On lookup failure, fall through to create — a duplicate is better than a silent drop.
      this.logger.warn(`QBO findInvoiceIdByDocNumber failed for ${docNumber}: ${err?.message}`);
      return null;
    }
  }

  // ── Service Item Lookup / Creation ──────────────────────────────────────

  private async findOrCreateServiceItem(tokens: { accessToken: string; realmId: string }): Promise<string> {
    try {
      const query = `SELECT * FROM Item WHERE Type = 'Service' AND Name = 'Services' MAXRESULTS 1`;
      const resp = await axios.get(`${this.qboBase}/${tokens.realmId}/query`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
        params: { query, minorversion: 65 },
      });
      const existing = resp.data?.QueryResponse?.Item?.[0];
      if (existing) return existing.Id;

      // Create a generic "Services" item
      const createResp = await axios.post(
        `${this.qboBase}/${tokens.realmId}/item`,
        { Name: 'Services', Type: 'Service', IncomeAccountRef: { value: '1', name: 'Services' } },
        { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, params: { minorversion: 65 } }
      );
      return createResp.data?.Item?.Id ?? '1';
    } catch {
      return '1'; // Last resort fallback
    }
  }

  // ── Customer Lookup / Creation ───────────────────────────────────────────

  private async findOrCreateCustomer(tokens: { accessToken: string; realmId: string }, name: string, email?: string): Promise<string | null> {
    try {
      const query = `SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`;
      const searchResp = await axios.get(`${this.qboBase}/${tokens.realmId}/query`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
        params: { query, minorversion: 65 },
      });

      const existing = searchResp.data?.QueryResponse?.Customer?.[0];
      if (existing) return existing.Id;

      const createResp = await axios.post(
        `${this.qboBase}/${tokens.realmId}/customer`,
        { DisplayName: name, PrimaryEmailAddr: email ? { Address: email } : undefined },
        { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, params: { minorversion: 65 } }
      );

      return createResp.data?.Customer?.Id ?? null;
    } catch (err: any) {
      this.logger.error(`QBO findOrCreateCustomer failed: ${err?.message}`);
      return null;
    }
  }

  // ── Payment Pull (QBO → Flyn) ────────────────────────────────────────────

  async pullPayments(tenantId: string, since?: Date): Promise<Array<{ id: string; amount: number; date: string; invoiceId: string }>> {
    const tokens = await this.getValidTokens(tenantId);
    if (!tokens) return [];

    try {
      const sinceDate = (since ?? new Date(Date.now() - 7 * 86400000)).toISOString().slice(0, 10);
      const query = `SELECT * FROM Payment WHERE TxnDate >= '${sinceDate}' MAXRESULTS 200`;

      const response = await axios.get(`${this.qboBase}/${tokens.realmId}/query`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
        params: { query, minorversion: 65 },
      });

      const payments = (response.data?.QueryResponse?.Payment ?? []).map((p: any) => ({
        id: p.Id,
        amount: p.TotalAmt,
        date: p.TxnDate,
        invoiceId: p.Line?.[0]?.LinkedTxn?.[0]?.TxnId ?? '',
      }));

      this.logger.log(`Pulled ${payments.length} payments from QBO for tenant: ${tenantId}`);
      return payments;
    } catch (err: any) {
      this.logger.error(`QBO pullPayments failed: ${err?.message}`);
      return [];
    }
  }

  // ── Bulk Push (all un-synced invoices) ──────────────────────────────────

  async pushAllInvoices(tenantId: string, invoices: Invoice[], _force = false): Promise<{ pushed: number; failed: number; skipped: number; errors: string[]; syncedIds: string[] }> {
    let pushed = 0; let failed = 0; let skipped = 0; const errors: string[] = []; const syncedIds: string[] = [];
    // NOTE: we no longer skip on the local `qboSynced` flag. That flag can be a
    // false positive (e.g. an auto-sync on create that ran before QBO was connected),
    // which previously stranded invoices — they showed "synced" but were never in QBO
    // and Push All refused to retry them. pushInvoice is now idempotent (it checks QBO
    // for an existing DocNumber), so attempting every invoice is safe and self-healing.
    for (const inv of invoices) {
      const result = await this.pushInvoice(tenantId, inv);
      if (result.success) {
        // 'created' = newly pushed, 'skipped' = already in QBO. Both mean it's now
        // confirmed present, so re-affirm the sync flag via syncedIds in either case.
        if (result.action === 'skipped') skipped++; else pushed++;
        syncedIds.push(inv._id);
      } else {
        failed++;
        if (result.error) errors.push(`${inv.invoice}: ${result.error}`);
      }
    }
    return { pushed, failed, skipped, errors, syncedIds };
  }

  async disconnect(tenantId: string): Promise<{ success: boolean }> {
    try {
      const tenant = await this.tenantsService.getTenant(tenantId);
      const integrations = tenant?.integrations ?? {};
      if (integrations.accounting?.quickbooks) {
        integrations.accounting = { ...integrations.accounting, quickbooks: undefined as any };
        delete integrations.accounting.quickbooks;
        await this.tenantsService.updateTenant(tenantId, { integrations });
      }
      this.logger.log(`QuickBooks disconnected for tenant: ${tenantId}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`QuickBooks disconnect failed for tenant ${tenantId}: ${err?.message}`);
      return { success: false };
    }
  }

  async getConnectionStatus(tenantId: string): Promise<{ connected: boolean; realmId?: string; connectedAt?: number; tokenExpired?: boolean; needsReconnect?: boolean }> {
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const qbo = tenant?.integrations?.accounting?.quickbooks;
    if (!qbo?.accessToken) return { connected: false };

    const tokenExpired = qbo.expiryDate ? qbo.expiryDate < Date.now() : false;

    // A still-valid access token means we're connected RIGHT NOW — return connected even if a
    // stale needsReconnect flag lingers (e.g. a fresh reconnect after a prior refresh hiccup).
    // needsReconnect only matters when the token is expired and we'd have to use the refresh token.
    if (!tokenExpired) {
      return { connected: true, realmId: qbo.realmId, connectedAt: qbo.connectedAt, tokenExpired: false };
    }

    // Token expired + a prior refresh got invalid_grant → the refresh token is dead, manual reconnect required.
    if (qbo.needsReconnect) {
      return { connected: false, realmId: qbo.realmId, connectedAt: qbo.connectedAt, needsReconnect: true };
    }

    // Token expired and there's no refresh token → not usable.
    if (!qbo.refreshToken) {
      return { connected: false, realmId: qbo.realmId, connectedAt: qbo.connectedAt, tokenExpired: true };
    }

    // Token expired but we have a refresh token → try to refresh.
    {
      const refreshed = await this.refreshToken(tenantId, qbo.refreshToken, qbo.realmId);
      if (refreshed) return { connected: true, realmId: qbo.realmId, connectedAt: qbo.connectedAt, tokenExpired: false };
      // Refresh failed. Re-read to see if it was a genuine invalid_grant (needsReconnect set)
      // vs a transient error — only the former should report disconnected.
      const fresh = await this.tenantsService.getTenant(tenantId).catch(() => null);
      const needsReconnect = !!fresh?.integrations?.accounting?.quickbooks?.needsReconnect;
      if (needsReconnect) return { connected: false, realmId: qbo.realmId, connectedAt: qbo.connectedAt, needsReconnect: true };
      // Transient failure — stay "connected" so a blip doesn't show a phantom disconnect.
      return { connected: true, realmId: qbo.realmId, connectedAt: qbo.connectedAt, tokenExpired: true };
    }

    return { connected: true, realmId: qbo.realmId, connectedAt: qbo.connectedAt, tokenExpired: false };
  }
}
