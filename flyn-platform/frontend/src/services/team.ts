import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

export type TeamRole = "admin" | "manager" | "agent";

export type TeamMemberPermissions = {
  accessCRM: boolean;
  manageUsers: boolean;
  editSettings: boolean;
  // Owner Dashboard — FLYN platform org members only
  ownerDashboardAnalytics?: boolean;
  ownerDashboardContent?: boolean;
  ownerDashboardPricing?: boolean;
};

export type ModuleAccessLevel = "full" | "readonly" | "none";

export type ModuleAccess = {
  crm?: ModuleAccessLevel;
  unified_inbox?: ModuleAccessLevel;
  phonebook?: ModuleAccessLevel;
  dashboard?: ModuleAccessLevel;
  whatsapp?: ModuleAccessLevel;
  telegram?: ModuleAccessLevel;
  email?: ModuleAccessLevel;
  ai_agents?: ModuleAccessLevel;
  ai_summaries?: ModuleAccessLevel;
  ai_sentiment?: ModuleAccessLevel;
  workflows?: ModuleAccessLevel;
  automations?: ModuleAccessLevel;
  api_access?: ModuleAccessLevel;
  white_label?: ModuleAccessLevel;
  custom_domains?: ModuleAccessLevel;
  telephony?: ModuleAccessLevel;
  ivr?: ModuleAccessLevel;
  tasks?: ModuleAccessLevel;
  calendar?: ModuleAccessLevel;
  contracts?: ModuleAccessLevel;
  branding?: ModuleAccessLevel;
};

export type PendingInvite = {
  code: string;
  email: string;
  role: TeamRole;
  createdAt: number;
};

export type TeamMemberRecord = {
  uid: string;
  tenantId: string;
  email: string;
  name?: string;
  role: TeamRole;
  team?: string;
  permissions?: TeamMemberPermissions;
  moduleAccess?: ModuleAccess;
  createdAt: number;
  updatedAt: number;
};

const base = `${API_BASE_URL}/team`;

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  return text || resp.statusText;
}

export const teamService = {
  async listMembers(): Promise<TeamMemberRecord[]> {
    const resp = await authedFetch(`${base}/members`);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  /** Caller's own role + module access (for gating). Fails soft to owner/full. */
  async getMyAccess(): Promise<{ role: TeamRole; moduleAccess: ModuleAccess }> {
    try {
      const resp = await authedFetch(`${base}/me/access`);
      if (!resp.ok) return { role: "owner", moduleAccess: {} };
      return resp.json();
    } catch {
      return { role: "owner", moduleAccess: {} };
    }
  },

  async inviteMember(input: { email: string; role: TeamRole; team?: string }): Promise<{ email: string; role: TeamRole; tenantId: string; inviteCode: string }> {
    const resp = await authedFetch(`${base}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async updateMember(uid: string, input: { role?: TeamRole; team?: string | null; permissions?: Partial<TeamMemberPermissions> }): Promise<TeamMemberRecord> {
    const resp = await authedFetch(`${base}/members/${encodeURIComponent(uid)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async removeMember(uid: string): Promise<{ ok: true }> {
    const resp = await authedFetch(`${base}/members/${encodeURIComponent(uid)}`, {
      method: "DELETE",
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async listPendingInvites(): Promise<PendingInvite[]> {
    const resp = await authedFetch(`${base}/invites`);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async revokeInvite(code: string): Promise<{ ok: true }> {
    const resp = await authedFetch(`${base}/invite/${encodeURIComponent(code)}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async updateMemberModuleAccess(uid: string, moduleAccess: Partial<ModuleAccess>): Promise<TeamMemberRecord> {
    const resp = await authedFetch(`${base}/members/${encodeURIComponent(uid)}/module-access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleAccess }),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },
};
