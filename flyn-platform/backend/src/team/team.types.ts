export type TeamRole = 'admin' | 'manager' | 'agent';

/**
 * Legacy role-based permissions — deprecated in favor of moduleAccess
 */
export type TeamMemberPermissions = {
  accessCRM: boolean;
  manageUsers: boolean;
  editSettings: boolean;
  // Owner Dashboard access — only meaningful for FLYN platform org members
  ownerDashboardAnalytics?: boolean;  // Sales & Revenue tab
  ownerDashboardContent?: boolean;    // Landing page content editors
  ownerDashboardPricing?: boolean;    // Pricing editor
};

/**
 * Module-level access: each module can be 'full', 'readonly', or 'none'
 */
export type ModuleAccessLevel = 'full' | 'readonly' | 'none';

export type ModuleAccess = {
  // Core Modules
  crm?: ModuleAccessLevel;
  unified_inbox?: ModuleAccessLevel;
  phonebook?: ModuleAccessLevel;
  dashboard?: ModuleAccessLevel;

  // Communication Channels
  whatsapp?: ModuleAccessLevel;
  telegram?: ModuleAccessLevel;
  email?: ModuleAccessLevel;

  // AI Features
  ai_agents?: ModuleAccessLevel;
  ai_summaries?: ModuleAccessLevel;
  ai_sentiment?: ModuleAccessLevel;

  // Automation & Workflows
  workflows?: ModuleAccessLevel;
  automations?: ModuleAccessLevel;

  // Platform & Integrations
  api_access?: ModuleAccessLevel;
  white_label?: ModuleAccessLevel;
  custom_domains?: ModuleAccessLevel;

  // Telephony
  telephony?: ModuleAccessLevel;
  ivr?: ModuleAccessLevel;

  // Other
  tasks?: ModuleAccessLevel;
  calendar?: ModuleAccessLevel;
  contracts?: ModuleAccessLevel;
  branding?: ModuleAccessLevel;
};

export type TeamMemberRecord = {
  uid: string;
  tenantId: string;
  email: string;
  name?: string;
  role: TeamRole;
  team?: string;

  // Legacy: kept for backward compatibility
  permissions?: TeamMemberPermissions;

  // New: module-level access control
  moduleAccess?: ModuleAccess;

  createdAt: number;
  updatedAt: number;
};
