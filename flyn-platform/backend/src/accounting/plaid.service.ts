/**
 * Plaid Service — Production Bank Connectivity
 * Endpoints: https://production.plaid.com
 * Stores access_token per tenant in tenant.integrations.plaid
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { TenantsService } from '../tenants/tenants.service';

const getPlaidBase = () => {
  const env = process.env.PLAID_ENV || 'production';
  return `https://${env}.plaid.com`;
};

@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);

  constructor(private readonly tenantsService: TenantsService) {}

  private get clientId() { return process.env.PLAID_CLIENT_ID ?? ''; }
  private get secret() { return process.env.PLAID_SECRET ?? ''; }
  private get authHeaders() {
    return {
      'PLAID-CLIENT-ID': this.clientId,
      'PLAID-SECRET': this.secret,
      'Content-Type': 'application/json',
      'Plaid-Version': '2020-09-14',
    };
  }

  private async getTenantPlaid(tenantId: string): Promise<any> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    // plaidConnection is a dedicated object field; fall back to legacy integrations.plaid
    return (tenant as any).plaidConnection ?? (tenant as any).integrations?.plaid ?? null;
  }

  private async savePlaidData(tenantId: string, data: any) {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const existing = (tenant as any).plaidConnection ?? {};
    await this.tenantsService.updateTenant(tenantId, {
      plaidConnection: { ...existing, ...data },
    } as any);
  }

  // ── Step 1: Create Link Token ──────────────────────────────────────────────

  async createLinkToken(tenantId: string, userId?: string): Promise<{ link_token: string; expiration: string }> {
    if (!this.clientId || !this.secret) {
      throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set in environment.');
    }

    const envProducts = process.env.PLAID_PRODUCTS;
    const products = envProducts
      ? envProducts.split(',').map(p => p.trim())
      : ['auth', 'identity'];

    const envCountries = process.env.PLAID_COUNTRY_CODES;
    const countryCodes = envCountries
      ? envCountries.split(',').map(c => c.trim().toUpperCase())
      : ['US', 'CA'];

    const payload: any = {
      client_id: this.clientId,
      secret: this.secret,
      client_name: 'Flyn Finance',
      user: { client_user_id: userId ?? tenantId },
      products: products,
      country_codes: countryCodes,
      language: 'en',
    };
    if (process.env.PLAID_WEBHOOK_URL) payload.webhook = process.env.PLAID_WEBHOOK_URL;

    this.logger.log(`[plaid] createLinkToken tenant=${tenantId} env=${process.env.PLAID_ENV || 'production'} products=[${products.join(',')}] countries=[${countryCodes.join(',')}]`);
    try {
      const res = await axios.post(`${getPlaidBase()}/link/token/create`, payload, { headers: this.authHeaders });
      this.logger.log(`[plaid] createLinkToken OK tenant=${tenantId} request_id=${res.data.request_id}`);
      return { link_token: res.data.link_token, expiration: res.data.expiration };
    } catch (err: any) {
      const e = err?.response?.data ?? {};
      this.logger.error(`[plaid] createLinkToken FAILED tenant=${tenantId} type=${e.error_type} code=${e.error_code} msg=${e.error_message ?? err.message} request_id=${e.request_id}`);
      throw new Error(e.error_message ?? err.message ?? 'Plaid link token creation failed');
    }
  }

  // ── Step 2: Exchange Public Token ──────────────────────────────────────────

  async exchangePublicToken(tenantId: string, publicToken: string, metadata?: any): Promise<{ itemId: string; accessToken: string; accountsVerified: number }> {
    const institutionName = metadata?.institution?.name ?? 'Bank';
    const institutionId = metadata?.institution?.institution_id ?? '';
    this.logger.log(`[plaid] exchange START tenant=${tenantId} institution=${institutionName} publicToken=${publicToken?.slice(0, 12)}…`);

    // Step 1 — exchange public_token for a permanent access_token
    let access_token: string, item_id: string;
    try {
      const res = await axios.post(`${getPlaidBase()}/item/public_token/exchange`, {
        client_id: this.clientId,
        secret: this.secret,
        public_token: publicToken,
      }, { headers: this.authHeaders });
      access_token = res.data.access_token;
      item_id = res.data.item_id;
      this.logger.log(`[plaid] exchange token OK tenant=${tenantId} item_id=${item_id} request_id=${res.data.request_id}`);
    } catch (err: any) {
      const e = err?.response?.data ?? {};
      this.logger.error(`[plaid] exchange FAILED tenant=${tenantId} type=${e.error_type} code=${e.error_code} msg=${e.error_message ?? err.message} request_id=${e.request_id}`);
      throw new Error(e.error_message ?? err.message ?? 'Plaid token exchange failed');
    }

    // Step 2 — VERIFY the connection actually works by pulling accounts. This is the
    // source of truth: if accounts come back, the bank is genuinely connected.
    let accountsVerified = 0;
    try {
      const acctRes = await axios.post(`${getPlaidBase()}/accounts/get`, {
        client_id: this.clientId,
        secret: this.secret,
        access_token,
      }, { headers: this.authHeaders });
      accountsVerified = (acctRes.data.accounts ?? []).length;
      this.logger.log(`[plaid] exchange VERIFIED tenant=${tenantId} accounts=${accountsVerified}`);
    } catch (err: any) {
      const e = err?.response?.data ?? {};
      this.logger.warn(`[plaid] exchange verify (accounts/get) failed tenant=${tenantId} code=${e.error_code} msg=${e.error_message ?? err.message} — saving as connected anyway`);
    }

    // Step 3 — persist. Save even if verify count is 0 (token is valid; accounts may lag),
    // but record the verified count + timestamp so the UI can show real connection state.
    await this.savePlaidData(tenantId, {
      accessToken: access_token,
      itemId: item_id,
      institutionName,
      institutionId,
      connectedAt: Date.now(),
      lastVerifiedAt: Date.now(),
      accountsCount: accountsVerified,
      status: 'connected',
    });

    this.logger.log(`[plaid] connected tenant=${tenantId}: ${institutionName} (${item_id}), ${accountsVerified} account(s)`);
    return { itemId: item_id, accessToken: access_token, accountsVerified };
  }

  // ── Get Accounts ───────────────────────────────────────────────────────────

  async getAccounts(tenantId: string): Promise<any[]> {
    const plaid = await this.getTenantPlaid(tenantId);
    if (!plaid?.accessToken) return [];

    try {
      const res = await axios.post(`${getPlaidBase()}/accounts/get`, {
        client_id: this.clientId,
        secret: this.secret,
        access_token: plaid.accessToken,
      }, { headers: this.authHeaders });

      return (res.data.accounts ?? []).map((a: any) => ({
        id: a.account_id,
        name: a.name,
        officialName: a.official_name,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        balanceCurrent: a.balances?.current ?? 0,
        balanceAvailable: a.balances?.available ?? null,
        balanceLimit: a.balances?.limit ?? null,
        currency: a.balances?.iso_currency_code ?? 'USD',
        institutionName: plaid.institutionName,
      }));
    } catch (err: any) {
      this.logger.warn(`Plaid getAccounts error: ${err?.response?.data?.error_message ?? err.message}`);
      return [];
    }
  }

  // ── Get Balances (real-time) ───────────────────────────────────────────────

  async getBalances(tenantId: string): Promise<any[]> {
    const plaid = await this.getTenantPlaid(tenantId);
    if (!plaid?.accessToken) return [];

    try {
      const res = await axios.post(`${getPlaidBase()}/accounts/balance/get`, {
        client_id: this.clientId,
        secret: this.secret,
        access_token: plaid.accessToken,
      }, { headers: this.authHeaders });

      return (res.data.accounts ?? []).map((a: any) => ({
        id: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        balanceCurrent: a.balances?.current ?? 0,
        balanceAvailable: a.balances?.available ?? null,
        currency: a.balances?.iso_currency_code ?? 'USD',
        institutionName: plaid.institutionName,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (err: any) {
      this.logger.warn(`Plaid getBalances error: ${err?.response?.data?.error_message ?? err.message}`);
      return [];
    }
  }

  // ── Get Transactions (sync cursor-based) ──────────────────────────────────

  async getTransactions(tenantId: string, startDate?: string, endDate?: string): Promise<{ transactions: any[]; total: number }> {
    const plaid = await this.getTenantPlaid(tenantId);
    if (!plaid?.accessToken) return { transactions: [], total: 0 };

    const end = endDate ?? new Date().toISOString().slice(0, 10);
    const start = startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const res = await axios.post(`${getPlaidBase()}/transactions/get`, {
        client_id: this.clientId,
        secret: this.secret,
        access_token: plaid.accessToken,
        start_date: start,
        end_date: end,
        options: { count: 500, offset: 0 },
      }, { headers: this.authHeaders });

      const transactions = (res.data.transactions ?? []).map((t: any) => ({
        id: t.transaction_id,
        accountId: t.account_id,
        date: t.date,
        name: t.name,
        merchantName: t.merchant_name,
        amount: t.amount,
        currency: t.iso_currency_code ?? 'USD',
        category: t.category?.[0] ?? 'Other',
        categoryDetail: t.category?.join(' > ') ?? '',
        pending: t.pending,
        paymentChannel: t.payment_channel,
        logoUrl: t.logo_url,
      }));

      return { transactions, total: res.data.total_transactions ?? transactions.length };
    } catch (err: any) {
      this.logger.warn(`Plaid getTransactions error: ${err?.response?.data?.error_message ?? err.message}`);
      return { transactions: [], total: 0 };
    }
  }

  // ── Disconnect (remove item) ───────────────────────────────────────────────

  async disconnect(tenantId: string): Promise<{ removed: boolean }> {
    const plaid = await this.getTenantPlaid(tenantId);
    if (!plaid?.accessToken) return { removed: false };

    try {
      await axios.post(`${getPlaidBase()}/item/remove`, {
        client_id: this.clientId,
        secret: this.secret,
        access_token: plaid.accessToken,
      }, { headers: this.authHeaders });
    } catch (err: any) {
      this.logger.warn(`Plaid item remove error (still clearing locally): ${err?.response?.data?.error_message ?? err.message}`);
    }

    await this.savePlaidData(tenantId, { accessToken: null, itemId: null, status: 'disconnected' });
    return { removed: true };
  }

  // ── Get Connection Status ──────────────────────────────────────────────────

  async getStatus(tenantId: string): Promise<{ connected: boolean; institutionName?: string; connectedAt?: number; itemId?: string; accountsCount?: number; needsReconnect?: boolean; error?: string }> {
    const plaid = await this.getTenantPlaid(tenantId);
    if (!plaid?.accessToken || plaid.status !== 'connected') {
      return { connected: false };
    }

    // Live verification — confirm the access token still works with Plaid.
    // This is what makes the status trustworthy instead of just "we saved a flag once".
    try {
      const res = await axios.post(`${getPlaidBase()}/accounts/get`, {
        client_id: this.clientId,
        secret: this.secret,
        access_token: plaid.accessToken,
      }, { headers: this.authHeaders });
      const accountsCount = (res.data.accounts ?? []).length;
      // Refresh the verified marker so we know status was confirmed live
      this.savePlaidData(tenantId, { lastVerifiedAt: Date.now(), accountsCount }).catch(() => {});
      return {
        connected: true,
        institutionName: plaid.institutionName,
        connectedAt: plaid.connectedAt,
        itemId: plaid.itemId,
        accountsCount,
      };
    } catch (err: any) {
      const e = err?.response?.data ?? {};
      const code = e.error_code as string | undefined;
      // ITEM_LOGIN_REQUIRED / INVALID_ACCESS_TOKEN → the link is broken, user must reconnect
      const broken = code === 'ITEM_LOGIN_REQUIRED' || code === 'INVALID_ACCESS_TOKEN' || code === 'ITEM_NOT_FOUND';
      this.logger.warn(`[plaid] getStatus live-check failed tenant=${tenantId} code=${code} msg=${e.error_message ?? err.message}`);
      if (broken) {
        this.savePlaidData(tenantId, { status: 'needs_reconnect' }).catch(() => {});
        return { connected: false, needsReconnect: true, institutionName: plaid.institutionName, error: e.error_message ?? 'Bank connection expired — please reconnect.' };
      }
      // Transient Plaid/network error — keep showing connected (don't scare the user), but report it
      return {
        connected: true,
        institutionName: plaid.institutionName,
        connectedAt: plaid.connectedAt,
        itemId: plaid.itemId,
        accountsCount: plaid.accountsCount,
        error: e.error_message ?? err.message,
      };
    }
  }

  // ── Webhook Handler ────────────────────────────────────────────────────────

  async handleWebhook(body: any): Promise<void> {
    const { webhook_type, webhook_code, item_id } = body;
    this.logger.log(`Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);
    // Future: trigger transaction sync when TRANSACTIONS/DEFAULT_UPDATE fires
  }
}
