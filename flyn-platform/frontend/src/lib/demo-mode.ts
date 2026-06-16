import type { Tenant } from "@/services/tenants";
import type { AppKey } from "@/contexts/PlanContext";

export const DEMO_AUTH_TOKEN = "flyn-demo-token";
const DEMO_MODE_STORAGE_KEY = "flyn_demo_mode";

export const isDemoModeEnabled = (): boolean => {
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  try {
    return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const enableDemoMode = (): void => {
  try {
    window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, "true");
  } catch {
    // ignore
  }
};

export const disableDemoMode = (): void => {
  try {
    window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const getDemoTenant = (): Tenant => ({
  id: "demo-org",
  name: "Flyn Demo Workspace",
  domain: "demo.myflynai.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  workspaceName: "Flyn Demo",
  timezone: "Asia/Kolkata",
  industry: "Technology",
  integrations: [],
  aiAgents: ["crm", "events", "hr", "church", "coaches", "freelancers", "whatsapp_crm", "telephony", "channels"] satisfies AppKey[],
  onboardingComplete: true,
  isFlynPlatform: true,
  ipVerificationEnabled: false,
  newIpAlertEnabled: false,
  verifiedIps: [],
  ipWhitelist: ["127.0.0.1", "::1"],
});

export const getDemoUser = () => ({
  id: "demo-user",
  email: "demo@flyn.local",
  name: "Demo Admin",
  role: "owner" as const,
  organizationId: "demo-org",
  plan: "enterprise",
  emailVerified: true,
  phoneNumber: null,
});
