import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

export type NotificationPrefs = {
  newLead?: boolean;
  missedCall?: boolean;
  leadNotContacted?: boolean;
  whatsappFailed?: boolean;
  appointmentBooked?: boolean;
  appointmentCancelled?: boolean;
  dealStageChanged?: boolean;
  newContact?: boolean;
  workflowError?: boolean;
  integrationDisconnected?: boolean;
  lowCredits?: boolean;
  paymentFailed?: boolean;
  newTeamMember?: boolean;
  apiKeyUnknownIP?: boolean;
  ch_email?: boolean;
  ch_sms?: boolean;
  ch_whatsapp?: boolean;
  ch_inapp?: boolean;
  ch_slack?: boolean;
  frequency?: string;
  quietFrom?: string;
  quietUntil?: string;
};

export type AiConfig = {
  model?: string;
  tone?: string;
  language?: string;
  responseLength?: string;
  confidenceThreshold?: string;
  systemPrompt?: string;
  profanityFilter?: boolean;
  abTesting?: boolean;
  voiceProvider?: 'twilio' | 'vapi';
  chatbotAgent?: string;
};

export type AutomationLimits = {
  dailyCallCap?: string;
  msgRateLimit?: string;
  retryCount?: string;
  retryInterval?: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  autoPauseOnError?: boolean;
  duplicateDetect?: boolean;
};

export type Tenant = {
  id: string;
  name: string;
  domain?: string | null;
  createdAt?: number;
  updatedAt?: number;
  workspaceName?: string | null;
  timezone?: string | null;
  industry?: string | null;
  integrations?: string[] | null;
  aiAgents?: string[] | null;
  // Profile fields
  phone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  userTimezone?: string | null;
  timeFormat?: string | null;
  currency?: string | null;
  signature?: string | null;
  // Workspace fields
  teamSize?: string | null;
  workspaceCurrency?: string | null;
  supportEmail?: string | null;
  // Structured settings
  notificationPrefs?: NotificationPrefs | null;
  aiConfig?: AiConfig | null;
  automationLimits?: AutomationLimits | null;
  // Onboarding & Branding
  onboardingComplete?: boolean;
  logoUrl?: string | null;
  companyStartDate?: string | null;
  companyAddress?: string | null;
  companyEmail?: string | null;
  // User profile
  profilePictureUrl?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  // Location
  country?: string | null;
  // Trusted IPs that have been verified and are allowed to bypass IP check
  verifiedIps?: string[];
  // When false, IP verification is disabled for this tenant
  ipVerificationEnabled?: boolean;
  // Notify-only on unknown IP (no block)
  newIpAlertEnabled?: boolean;
  // Exact IPs or CIDR ranges that always bypass the IP check
  ipWhitelist?: string[];
  // Set to true on the FLYN platform org's tenant doc only.
  // Gates access to the Owner Dashboard (/admin/landing).
  isFlynPlatform?: boolean;
};

const base = `${API_BASE_URL}/tenants`;

async function parseError(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  return text || resp.statusText;
}

export const tenantsService = {
  async getMe(): Promise<Tenant> {
    const resp = await authedFetch(`${base}/me`);
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async patchMe(patch: Partial<Omit<Tenant, "id">>): Promise<Tenant> {
    const resp = await authedFetch(`${base}/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  /** True MFA enrollment from the server (not the stale client fbUser). */
  async getMfaStatus(): Promise<{ enrolled: boolean }> {
    try {
      const resp = await authedFetch(`${base}/me/mfa-status`);
      if (!resp.ok) return { enrolled: false };
      return resp.json();
    } catch {
      return { enrolled: false };
    }
  },

  /** Server-side disable — clears ALL Firebase MFA factors via Admin SDK. */
  async disableMfa(): Promise<{ disabled: boolean }> {
    const resp = await authedFetch(`${base}/me/disable-mfa`, { method: "POST" });
    if (!resp.ok) throw new Error(await parseError(resp));
    return resp.json();
  },

  async exportMe(): Promise<void> {
    const resp = await authedFetch(`${base}/me/export`);
    if (!resp.ok) throw new Error(await parseError(resp));
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flyn-workspace-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async deleteMe(): Promise<void> {
    const resp = await authedFetch(`${base}/me`, { method: "DELETE" });
    if (!resp.ok) throw new Error(await parseError(resp));
  },
};
