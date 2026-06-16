import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

export type MailboxStatus = "pending" | "active";

export interface TenantMailbox {
  id: string;
  tenantId: string;
  address: string;       // marketing@apple.com
  localPart: string;     // marketing
  domain: string;        // apple.com
  teams: string[];       // team labels with access (dynamic)
  uids: string[];        // specific member uids with access
  status: MailboxStatus; // 'pending' until domain authenticated, then 'active'
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  /** Where Brevo delivers inbound replies — mail.<domain>. Derived server-side. */
  receivingAddress?: string;
}

const base = `${API_BASE_URL}/mailboxes`;

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  try { return JSON.parse(text)?.message || text || resp.statusText; }
  catch { return text || resp.statusText; }
}

export const mailboxesService = {
  /** Admin/owner — every mailbox in the org. */
  async list(): Promise<TenantMailbox[]> {
    const resp = await authedFetch(base);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  /** Any member — the mailboxes THEY may use (inbox filter + outbox From-picker). */
  async mine(): Promise<TenantMailbox[]> {
    const resp = await authedFetch(`${base}/mine`);
    if (!resp.ok) return [];
    return resp.json();
  },

  async create(address: string): Promise<TenantMailbox> {
    const resp = await authedFetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  /** Set the full access set from the Link picker (replaces prior linkage). */
  async link(id: string, access: { teams: string[]; uids: string[] }): Promise<TenantMailbox> {
    const resp = await authedFetch(`${base}/${encodeURIComponent(id)}/link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(access),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async remove(id: string): Promise<{ success: boolean }> {
    const resp = await authedFetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  /** Delete all mailboxes on domains the tenant hasn't verified-owned (junk from before the gate). */
  async cleanupOrphans(): Promise<{ deleted: number; addresses: string[] }> {
    const resp = await authedFetch(`${base}/orphans`, { method: "DELETE" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },
};
