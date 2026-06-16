import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

export type DomainOwnershipStatus = "pending" | "verified";
export type DomainSendingStatus = "none" | "pending" | "verified";

export interface DomainDnsRecord {
  key: string;
  type: "CNAME" | "TXT" | "MX";
  host: string;
  value: string;
  label: string;
  verified: boolean;
}

export interface TenantEmailDomain {
  id: string;
  tenantId: string;
  domain: string;
  verifyToken: string;
  status: DomainOwnershipStatus;
  verifiedAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  sendingStatus: DomainSendingStatus;
  brevoDomainId?: string;
  sendingRecords?: DomainDnsRecord[];
  sendingCheckedAt?: number;
  sendingVerifiedAt?: number;
}

export interface DomainVerifyRecord {
  type: "TXT";
  host: string;
  value: string;
}

export interface VerifyResult {
  domain: TenantEmailDomain;
  verified: boolean;
  reason?: string;
}

export interface SendingAuthResult {
  domain: TenantEmailDomain;
  records: DomainDnsRecord[];
}

export interface SendingVerifyResult {
  domain: TenantEmailDomain;
  records: DomainDnsRecord[];
  authenticated: boolean;
  reason?: string;
  activated: { activated: number; addresses: string[] };
}

const base = `${API_BASE_URL}/email-domains`;

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  try { return JSON.parse(text)?.message || text || resp.statusText; }
  catch { return text || resp.statusText; }
}

export const emailDomainsService = {
  async list(): Promise<TenantEmailDomain[]> {
    const resp = await authedFetch(base);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async add(domain: string): Promise<{ domain: TenantEmailDomain; record: DomainVerifyRecord }> {
    const resp = await authedFetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async verify(id: string): Promise<VerifyResult> {
    const resp = await authedFetch(`${base}/${encodeURIComponent(id)}/verify`, { method: "POST" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  /** Start Brevo sending authentication — returns the DKIM/brevo-code/DMARC records to publish. */
  async authenticateSending(id: string): Promise<SendingAuthResult> {
    const resp = await authedFetch(`${base}/${encodeURIComponent(id)}/authenticate-sending`, { method: "POST" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  /** Re-check Brevo authentication; on success the domain's mailboxes go active. */
  async verifySending(id: string): Promise<SendingVerifyResult> {
    const resp = await authedFetch(`${base}/${encodeURIComponent(id)}/verify-sending`, { method: "POST" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async remove(id: string): Promise<{ success: boolean }> {
    const resp = await authedFetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },
};
