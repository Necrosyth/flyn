import {
  Users, TrendingUp, Clock, DollarSign, Calendar, Briefcase,
  UserCheck, FileText, Target, Heart, Building, GraduationCap,
  Mail, Phone, Sparkles, UserPlus, Download, Send, MessageSquare,
  BarChart3, BookOpen, Activity, CheckCircle, AlertTriangle,
  Receipt, Wallet, PieChart, CreditCard, ArrowUpRight, ArrowDownRight, Globe,
  Plus, Search, Trash2, ShieldCheck, Lock, Share2, Zap, RefreshCw,
  Music, Video, Mic, Building2, Clipboard, Kanban
} from "lucide-react";
import type { KPI } from "./KPIStrip";
import type { ActionItem } from "./ActionBar";
import type { AIInsight } from "./AIInsightPanel";
import type { SystemEvent } from "./SystemFeed";
import type { TableColumn } from "./EnhancedDataTable";
import { TFunction } from "i18next";

import type { HealthStatus } from "./HealthStatusChip";
import type { DashboardRole } from "./RoleVisibility";

// ============= Base Module Configuration Interface =============
export interface ModuleConfig {
  id: string;
  title: string;
  description: string;
  /** Layer 1: KPIs (3-6 required) */
  kpis: KPI[];
  /** KPIs that require financial visibility (Founder/Admin only) */
  financialKPIIds?: string[];
  /** Layer 2: Actions */
  primaryAction: ActionItem;
  secondaryActions?: ActionItem[];
  aiActions?: ActionItem[];
  /** Use Add/Invite toggle instead of simple primary action */
  useAddInviteToggle?: boolean;
  /** Entity type for Add/Invite toggle */
  addInviteEntityType?: "member" | "guest" | "attendee";
  /** Layer 3: Table configuration */
  tableTitle?: string;
  columns: TableColumn<Record<string, unknown>>[];
  tableData: unknown[];
  /** Show health status chips in table */
  showHealthStatus?: boolean;
  /** Support tabbed profile view (Coaches) */
  supportsTabbedProfile?: boolean;
  /** Layer 4: Analytics charts */
  analytics?: {
    id: string;
    title: string;
    type: "bar" | "progress" | "donut";
    data: { label: string; value: number }[];
  }[];
  /** Layer 5: AI Insights */
  aiInsights?: AIInsight[];
  /** Layer 6: System events */
  systemEvents?: SystemEvent[];
  /** Multi-campus/tenant support */
  supportsMultiCampus?: boolean;
  /** Default campuses for multi-campus modules */
  campuses?: Array<{
    id: string;
    name: string;
    location?: string;
    memberCount?: number;
  }>;
  /** Role-based visibility overrides */
  roleVisibility?: Partial<Record<DashboardRole, {
    hiddenKPIIds?: string[];
    hideAnalytics?: boolean;
    hideAIInsights?: boolean;
  }>>;
  /** Collapse AI actions into a single dropdown menu (for modules with many AI tools) */
  collapseAIActions?: boolean;
  /** Collapse secondary actions into a single dropdown menu */
  collapseSecondaryActions?: boolean;
}

// ============= CRM Module =============
export const getCrmConfig = (t: TFunction): ModuleConfig => ({
  id: "crm",
  title: t("moduleConfig.crm.title"),
  description: t("moduleConfig.crm.description"),
  kpis: [
    { id: "leads", label: t("moduleConfig.crm.kpis.leads"), value: "0", icon: Users, gradient: "from-primary to-flyn-purple-deep" },
    { id: "qualified", label: t("moduleConfig.crm.kpis.qualified"), value: "0", icon: Target, trend: { value: "Awaiting leads", positive: true }, gradient: "from-flyn-cyan to-primary" },
    { id: "deals", label: t("moduleConfig.crm.kpis.deals"), value: "$0", icon: DollarSign, gradient: "from-status-active to-flyn-cyan" },
    { id: "conversion", label: t("moduleConfig.crm.kpis.conversion"), value: "0%", icon: TrendingUp, gradient: "from-primary to-flyn-cyan" },
  ],
  primaryAction: { id: "add-lead", label: t("moduleConfig.crm.actions.addLead"), icon: UserPlus },
  secondaryActions: [
    { id: "import", label: t("moduleConfig.crm.actions.import"), icon: Download },
  ],
  aiActions: [
    { id: "crm-score", label: "AI Lead Scoring", icon: Target },
    { id: "crm-forecast", label: "Revenue Forecast", icon: TrendingUp },
    { id: "crm-merge", label: "Merge Duplicate Profiles", icon: Sparkles },
    { id: "crm-campaign", label: "Omnichannel Campaign Sync", icon: Send },
    { id: "crm-ai-pipeline", label: "AI Smart Pipeline", icon: Zap },
    { id: "crm-upsell", label: "Predictive Upsell", icon: DollarSign },
  ],
  collapseAIActions: true,
  tableTitle: t("moduleConfig.crm.table.title"),
  columns: [
    { key: "name", label: t("moduleConfig.crm.table.columns.name"), sortable: true },
    { key: "status", label: t("moduleConfig.crm.table.columns.status"), sortable: true },
    { key: "company", label: t("moduleConfig.crm.table.columns.company"), sortable: true },
    { key: "email", label: t("moduleConfig.crm.table.columns.email") },
    { key: "lastContact", label: t("moduleConfig.crm.table.columns.lastContact"), sortable: true },
  ],
  tableData: [],
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= HR Module =============
export const getHrConfig = (t: TFunction): ModuleConfig => ({
  id: "hr",
  title: t("moduleConfig.hr.title"),
  description: t("moduleConfig.hr.description"),
  kpis: [
    { id: "employees", label: t("moduleConfig.hr.kpis.employees"), value: "0", icon: Users, gradient: "from-primary to-flyn-purple-deep" },
    { id: "attendance", label: t("moduleConfig.hr.kpis.attendance"), value: "0%", icon: UserCheck, gradient: "from-flyn-cyan to-primary" },
    { id: "leave", label: t("moduleConfig.hr.kpis.leave"), value: "0", icon: Clock, gradient: "from-status-pending to-flyn-cyan" },
    { id: "positions", label: t("moduleConfig.hr.kpis.positions"), value: "0", icon: Briefcase, gradient: "from-status-active to-primary" },
  ],
  primaryAction: { id: "add-employee", label: t("moduleConfig.hr.actions.addEmployee"), icon: UserPlus },
  secondaryActions: [
    { id: "payroll", label: t("moduleConfig.hr.actions.payroll"), icon: DollarSign },
    { id: "hr-leave-request", label: "Request Leave", icon: Clock },
    { id: "hr-remote", label: "Remote Team Timezones", icon: Globe },
    { id: "ai-schedule", label: "Schedule Interview", icon: Calendar },
    { id: "hr-skills", label: "Skills Heatmap", icon: BarChart3 },
    { id: "hr-pipeline", label: "Candidate Pipeline", icon: Kanban },
  ],
  collapseSecondaryActions: true,
  aiActions: [
    { id: "hr-assistant", label: "Ask HR AI", icon: MessageSquare },
    { id: "hr-workforce", label: "Workforce Analysis", icon: Activity },
    { id: "hr-jd", label: "AI JD Generator", icon: FileText },
    { id: "hr-cv", label: "Parse CV / Talent", icon: Search },
    { id: "hr-pulse", label: "AI Pulse Survey", icon: Heart },
    { id: "hr-onboarding", label: "AI Onboarding Assistant", icon: Zap },
    { id: "hr-policy-docs", label: "HR Policy Library", icon: BookOpen },
  ],
  collapseAIActions: true,
  tableTitle: t("moduleConfig.hr.table.title"),
  columns: [
    { key: "name", label: t("moduleConfig.hr.table.columns.employee"), sortable: true },
    { key: "department", label: t("moduleConfig.hr.table.columns.department"), sortable: true },
    { key: "status", label: t("moduleConfig.hr.table.columns.status"), sortable: true },
    { key: "role", label: t("moduleConfig.hr.table.columns.role") },
    { key: "email", label: "Email" },
    { key: "salary", label: "Salary" },
    { key: "employmentType", label: "Type" },
    { key: "startDate", label: "Join Date", sortable: true },
  ],
  tableData: [],
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= Events Module =============
// Focus: Conversion funnel and real-time registration tracking
export const getEventsConfig = (t: TFunction): ModuleConfig => ({
  id: "events",
  title: t("moduleConfig.events.title"),
  description: t("moduleConfig.events.description"),
  kpis: [
    { id: "registrations", label: t("moduleConfig.events.kpis.registrations"), value: "0", icon: Users, gradient: "from-primary to-flyn-purple-deep" },
    { id: "conversion", label: t("moduleConfig.events.kpis.conversion"), value: "0%", icon: TrendingUp, trend: { value: "Awaiting registrations", positive: true }, gradient: "from-flyn-cyan to-primary" },
    { id: "revenue", label: t("moduleConfig.events.kpis.revenue"), value: "$0", icon: DollarSign, gradient: "from-status-active to-flyn-cyan" },
    { id: "checkedin", label: t("moduleConfig.events.kpis.checkedIn"), value: "0", icon: CheckCircle, gradient: "from-flyn-purple-deep to-primary", onClick: () => console.log("Open rapid check-in") },
    { id: "waitlist", label: "Waitlisted", value: "0", icon: Clock, gradient: "from-amber-500 to-orange-500" },
    { id: "tickets", label: "Tickets Sold", value: "0", icon: Receipt, gradient: "from-emerald-500 to-teal-500" },
  ],
  financialKPIIds: ["revenue"],
  primaryAction: { id: "create-event", label: t("moduleConfig.events.actions.createEvent"), icon: Calendar },
  useAddInviteToggle: true,
  addInviteEntityType: "guest",
  secondaryActions: [
    { id: "manage-guests", label: "Manage Guests", icon: Users },
    { id: "invite", label: t("moduleConfig.events.actions.inviteGuests"), icon: Send },
    { id: "export", label: t("moduleConfig.events.actions.exportList"), icon: Download },
    { id: "qr-checkin", label: "QR Check-In", icon: CheckCircle },
    { id: "calendar-sync", label: "Calendar Sync", icon: Calendar },
  ],
  aiActions: [
    { id: "events-draft", label: t("moduleConfig.events.actions.draftDescription"), icon: FileText },
    { id: "events-invites", label: "AI Personalized Invites", icon: Send },
    { id: "events-timing", label: "Predict Best Send Time", icon: Clock },
    { id: "events-sync", label: "Sync Guests to CRM", icon: RefreshCw },
    { id: "events-nudge", label: "Auto RSVP Nudge", icon: Zap },
  ],
  collapseAIActions: true,
  collapseSecondaryActions: true,
  tableTitle: t("moduleConfig.events.table.title"),
  columns: [
    { key: "name", label: t("moduleConfig.events.table.columns.eventName"), sortable: true },
    { key: "dateTime", label: t("moduleConfig.events.table.columns.dateTime"), sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "capacityStatus", label: t("moduleConfig.events.table.columns.capacity"), sortable: true },
    { key: "visibility", label: t("moduleConfig.events.table.columns.visibility"), sortable: true },
    { key: "actions", label: "Check-In" },
  ],
  tableData: [],
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= Church Module =============
// Focus: Member Engagement Hub (not just backend CRM)
export const getChurchConfig = (t: TFunction): ModuleConfig => ({
  id: "church",
  title: t("moduleConfig.church.title"),
  description: t("moduleConfig.church.description"),
  kpis: [
    { id: "members", label: t("moduleConfig.church.kpis.members"), value: "0", icon: Users, gradient: "from-primary to-flyn-purple-deep", onClick: () => console.log("View members") },
    { id: "attendance", label: t("moduleConfig.church.kpis.attendance"), value: "0%", icon: Heart, trend: { value: "Awaiting data", positive: true }, gradient: "from-flyn-cyan to-primary", onClick: () => console.log("Open check-in") },
    { id: "donations", label: t("moduleConfig.church.kpis.donations"), value: "$0", icon: DollarSign, trend: { value: "Real-time", positive: true }, gradient: "from-status-active to-flyn-cyan" },
    { id: "engagement", label: t("moduleConfig.church.kpis.engagement"), value: "0%", icon: Activity, gradient: "from-flyn-purple-deep to-primary" },
    { id: "volunteers", label: "Volunteers Scheduled", value: "0", icon: UserCheck, trend: { value: "None scheduled", positive: true }, gradient: "from-emerald-500 to-teal-500" },
    { id: "smallGroups", label: "Active Small Groups", value: "0", icon: Users, gradient: "from-indigo-500 to-purple-500" },
  ],
  financialKPIIds: ["donations"],
  primaryAction: { id: "add-member", label: t("moduleConfig.church.actions.addMember"), icon: UserPlus },
  useAddInviteToggle: true,
  addInviteEntityType: "member",
  secondaryActions: [
    { id: "broadcast", label: t("moduleConfig.church.actions.broadcast"), icon: Send },
    { id: "create-event", label: t("moduleConfig.church.actions.createEvent"), icon: Calendar },
    { id: "donations", label: "Donations & eGiving", icon: DollarSign },
    { id: "services-planning", label: "Worship Planning", icon: Music },
    { id: "sermon-library", label: "Sermon Library", icon: Video },
    { id: "church-form", label: "Form Builder", icon: FileText },
    { id: "small-groups", label: "Small Groups", icon: Users },
    { id: "facility-booking", label: "Facility Booking", icon: Building2 },
    { id: "volunteer-schedule", label: "Volunteer Scheduler", icon: UserCheck },
    { id: "qr-checkin", label: "QR Check-In", icon: CheckCircle },
    { id: "prayer-requests", label: "Prayer Requests", icon: Heart },
    { id: "member-directory", label: "Member Directory", icon: Search },
    { id: "calendar-sync", label: "Calendar Sync", icon: Calendar },
    { id: "church-cms", label: "Church Website CMS", icon: Globe },
  ],
  aiActions: [
    { id: "ai-engagement", label: t("moduleConfig.church.actions.engagementReport"), icon: BarChart3 },
    { id: "ai-church-agent", label: "AI Church Assistant", icon: Sparkles },
    { id: "ai-followup", label: "AI Follow-Up Automations", icon: Sparkles },
    { id: "ai-giving", label: "Giving Capacity Predictor", icon: Sparkles },
    { id: "ai-inactive", label: "Re-Engage Inactive Members", icon: Sparkles },
    { id: "ai-care", label: "Pastoral Care Alerts", icon: Sparkles },
    { id: "ai-recruit-vol", label: "Auto-Assign Volunteers", icon: Sparkles },
  ],
  collapseAIActions: true,
  collapseSecondaryActions: true,
  tableTitle: t("moduleConfig.church.table.title"),
  columns: [
    { key: "name", label: t("moduleConfig.church.table.columns.name"), sortable: true },
    { key: "status", label: t("moduleConfig.church.table.columns.status"), sortable: true },
    { key: "discipleshipStage", label: t("moduleConfig.church.table.columns.discipleship"), sortable: true },
    { key: "ministryTier", label: t("moduleConfig.church.table.columns.ministryTier"), sortable: true },
    { key: "lastAttendance", label: t("moduleConfig.church.table.columns.lastAttendance"), sortable: true },
    { key: "givingCapacity", label: t("moduleConfig.church.table.columns.givingScore"), sortable: true },
  ],
  tableData: [],
  supportsMultiCampus: true,
  campuses: [],
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= Coaches Module =============
// Focus: Coaching Operating System - Revenue, Retention, Session Management
export const getCoachesConfig = (t: TFunction): ModuleConfig => ({
  id: "coaches",
  title: t("moduleConfig.coaches.title"),
  description: t("moduleConfig.coaches.description"),
  kpis: [
    { id: "clients", label: t("moduleConfig.coaches.kpis.clients"), value: "0", icon: Users, gradient: "from-primary to-flyn-purple-deep" },
    { id: "sessions", label: t("moduleConfig.coaches.kpis.sessions"), value: "0", icon: Calendar, trend: { value: "MTD", positive: true }, gradient: "from-flyn-cyan to-primary" },
    { id: "revenue", label: t("moduleConfig.coaches.kpis.revenue"), value: "$0", icon: DollarSign, gradient: "from-status-active to-flyn-cyan" },
    { id: "health", label: t("moduleConfig.coaches.kpis.health"), value: "0", icon: Activity, gradient: "from-flyn-purple-deep to-primary" },
    { id: "completion", label: "Program Completion", value: "0%", icon: CheckCircle, gradient: "from-emerald-500 to-teal-500" },
    { id: "noshow", label: "No-Show Rate", value: "0%", icon: AlertTriangle, gradient: "from-amber-500 to-orange-500" },
  ],
  primaryAction: { id: "create-program", label: t("moduleConfig.coaches.actions.createProgram"), icon: BookOpen },
  secondaryActions: [
    { id: "book-session", label: t("moduleConfig.coaches.actions.bookSession"), icon: Calendar },
    { id: "message-client", label: t("moduleConfig.coaches.actions.messageClient"), icon: MessageSquare },
    { id: "view-programs", label: "View Programs", icon: BookOpen },
    { id: "resource-library", label: "Resource Library", icon: FileText },
    { id: "coach-marketplace", label: "Coach Marketplace", icon: Globe },
    { id: "calendar-sync", label: "Calendar Sync", icon: Calendar },
  ],
  aiActions: [
    { id: "ai-balance", label: t("moduleConfig.coaches.actions.workloadBalancing"), icon: Sparkles },
    { id: "ai-session-summary", label: "AI Session Summary", icon: Sparkles },
    { id: "ai-churn", label: "Churn Prediction", icon: Sparkles },
    { id: "ai-match", label: "Coach-Client AI Match", icon: Sparkles },
    { id: "ai-next-action", label: "Best Next Action", icon: Sparkles },
    { id: "ai-intake", label: "Auto-Send Intake Form", icon: Sparkles },
    { id: "ai-capacity", label: "Capacity Optimization", icon: Sparkles },
  ],
  collapseAIActions: true,
  collapseSecondaryActions: true,
  tableTitle: t("moduleConfig.coaches.table.title"),
  showHealthStatus: true,
  supportsTabbedProfile: true,
  columns: [
    { key: "name", label: t("moduleConfig.coaches.table.columns.coachName"), sortable: true },
    { key: "healthStatus", label: t("moduleConfig.coaches.table.columns.health"), sortable: true },
    { key: "activePrograms", label: t("moduleConfig.coaches.table.columns.activePrograms"), sortable: true },
    { key: "successProbability", label: t("moduleConfig.coaches.table.columns.successProb"), sortable: true },
    { key: "nextSession", label: t("moduleConfig.coaches.table.columns.nextSession"), sortable: true },
  ],
  tableData: [],
  financialKPIIds: ["revenue"],
  roleVisibility: {
    agent: { hiddenKPIIds: ["revenue", "health"], hideAnalytics: true, hideAIInsights: true },
  },
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= Freelancers Module =============
export const getFreelancersConfig = (t: TFunction): ModuleConfig => ({
  id: "freelancers",
  title: t("moduleConfig.freelancers.title"),
  description: t("moduleConfig.freelancers.description"),
  kpis: [
    { id: "projects", label: t("moduleConfig.freelancers.kpis.projects"), value: "0", icon: Briefcase, gradient: "from-primary to-flyn-purple-deep" },
    { id: "clients", label: t("moduleConfig.freelancers.kpis.clients"), value: "0", icon: Users, gradient: "from-flyn-cyan to-primary" },
    { id: "revenue", label: t("moduleConfig.freelancers.kpis.revenue"), value: "$0", icon: DollarSign, gradient: "from-status-active to-flyn-cyan" },
    { id: "invoices", label: t("moduleConfig.freelancers.kpis.invoices"), value: "0", icon: FileText, gradient: "from-status-pending to-primary" },
  ],
  primaryAction: { id: "new-project", label: t("moduleConfig.freelancers.actions.newProject"), icon: Briefcase },
  secondaryActions: [
    { id: "invoice", label: t("moduleConfig.freelancers.actions.createInvoice"), icon: FileText },
  ],
  aiActions: [
    { id: "ai-estimate", label: t("moduleConfig.freelancers.actions.aiEstimate"), icon: Sparkles },
    { id: "freelance-risk", label: "AI Risk Analysis", icon: AlertTriangle },
    { id: "freelance-match", label: "AI Talent Match", icon: Target },
    { id: "freelance-dispute", label: "File Dispute", icon: ShieldCheck },
    { id: "freelance-ai-reply", label: "AI Reply", icon: MessageSquare },
  ],
  collapseAIActions: true,
  tableTitle: t("moduleConfig.freelancers.table.title"),
  columns: [
    { key: "name", label: t("moduleConfig.freelancers.table.columns.project"), sortable: true },
    { key: "client", label: t("moduleConfig.freelancers.table.columns.client"), sortable: true },
    { key: "status", label: t("moduleConfig.freelancers.table.columns.status"), sortable: true },
    { key: "budget", label: t("moduleConfig.freelancers.table.columns.budget"), sortable: true },
    { key: "deadline", label: t("moduleConfig.freelancers.table.columns.deadline"), sortable: true },
  ],
  tableData: [],
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= Accounting Module =============
// The financial backbone connecting CRM, HR, Events, Coaches, Freelancers, Telephony & Church
export const getAccountingConfig = (t: TFunction): ModuleConfig => ({
  id: "accounting",
  title: t("moduleConfig.accounting.title"),
  description: t("moduleConfig.accounting.description"),
  kpis: [
    { id: "revenue", label: t("moduleConfig.accounting.kpis.revenue"), value: "$0", icon: DollarSign, trend: { value: "Real-time", positive: true }, gradient: "from-emerald-500 to-teal-500" },
    { id: "outstanding", label: t("moduleConfig.accounting.kpis.outstanding"), value: "$0", icon: Receipt, trend: { value: "Awaiting invoices", positive: false }, gradient: "from-amber-500 to-orange-500" },
    { id: "expenses", label: t("moduleConfig.accounting.kpis.expenses"), value: "$0", icon: ArrowDownRight, gradient: "from-rose-500 to-pink-500" },
    { id: "netProfit", label: t("moduleConfig.accounting.kpis.netProfit"), value: "$0", icon: TrendingUp, gradient: "from-primary to-flyn-purple-deep" },
  ],
  financialKPIIds: ["revenue", "outstanding", "expenses", "netProfit"],
  primaryAction: { id: "new-invoice", label: t("moduleConfig.accounting.actions.newInvoice"), icon: FileText },
  collapseSecondaryActions: true,
  secondaryActions: [
    { id: "new-expense", label: t("moduleConfig.accounting.actions.newExpense"), icon: Receipt },
    { id: "new-vendor-bill", label: "New Vendor Bill", icon: FileText },
    { id: "bulk-payment", label: "Bulk Payment", icon: Wallet },
    { id: "run-payroll", label: "Run Payroll", icon: DollarSign },
    { id: "tax-summary", label: "Tax Summary Report", icon: PieChart },
    { id: "tax-codes", label: "Tax Codes", icon: PieChart },
    { id: "audit-trail", label: "Audit Trail", icon: Activity },
    { id: "bank-reconcile", label: "Bank Reconciliation", icon: CreditCard },
    { id: "plaid-connect", label: "Connect Bank (Plaid)", icon: Building2 },
    { id: "subscriptions", label: "Subscriptions", icon: RefreshCw },
    { id: "coupons", label: "Coupons & Discounts", icon: Receipt },
    { id: "stripe", label: "Stripe Payments", icon: CreditCard },
    { id: "integrations", label: "Integrations", icon: Globe },
    { id: "entities", label: "Legal Entities", icon: Building },
    { id: "permissions", label: "Roles & Permissions", icon: ShieldCheck },
  ],
  collapseAIActions: true,
  aiActions: [
    { id: "ai-invoice", label: t("moduleConfig.accounting.actions.aiInvoice"), icon: Sparkles },
    { id: "ai-expense-scan", label: "AI Receipt Scan (OCR)", icon: Sparkles },
    { id: "ai-cash-forecast", label: "Cash Flow Forecast", icon: TrendingUp },
    { id: "ai-dunning", label: "Smart Dunning Sequences", icon: Zap },
    { id: "ai-churn", label: "Churn Analytics", icon: BarChart3 },
    { id: "ai-sync", label: "Sync Integrations", icon: RefreshCw },
  ],
  tableTitle: t("moduleConfig.accounting.table.title"),
  columns: [
    { key: "invoice", label: t("moduleConfig.accounting.table.columns.invoice"), sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "client", label: t("moduleConfig.accounting.table.columns.client"), sortable: true },
    { key: "amount", label: t("moduleConfig.accounting.table.columns.amount"), sortable: true },
    { key: "currency", label: "Currency", sortable: true },
    { key: "status", label: t("moduleConfig.accounting.table.columns.status"), sortable: true },
    { key: "dueDate", label: t("moduleConfig.accounting.table.columns.dueDate"), sortable: true },
    { key: "module", label: t("moduleConfig.accounting.table.columns.source"), sortable: true },
    { key: "actions", label: t("moduleConfig.accounting.table.columns.actions") || "Actions" },
  ],
  tableData: [],
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= Contracts Module =============
// Focus: Contract lifecycle, eSignatures, audit trail. Cross-module connector.
export const getContractsConfig = (t: TFunction): ModuleConfig => ({
  id: "contracts",
  title: "Contracts & eSignatures",
  description: "Create, send, and track contract signatures across all modules",
  kpis: [
    { id: "total", label: "Total Contracts", value: "0", icon: FileText, gradient: "from-primary to-flyn-purple-deep" },
    { id: "pending", label: "Awaiting Signature", value: "0", icon: Clock, gradient: "from-amber-500 to-orange-500" },
    { id: "signed", label: "Fully Signed", value: "0", icon: CheckCircle, gradient: "from-emerald-500 to-teal-500" },
    { id: "drafts", label: "Drafts", value: "0", icon: FileText, gradient: "from-slate-500 to-slate-600" },
  ],
  primaryAction: { id: "create-contract", label: "New Contract", icon: FileText },
  secondaryActions: [
    { id: "export", label: "Export", icon: Download },
  ],
  aiActions: [
    { id: "ai-contract-gen", label: "AI Generate Contract", icon: Sparkles },
    { id: "contract-audit", label: "View Audit Trail", icon: Activity },
    { id: "contract-encrypt", label: "Verify Integrity (AES)", icon: Lock },
    { id: "contract-signed-url", label: "Generate Secure URL", icon: Share2 },
    { id: "contract-multi-signer", label: "Multi-Signer Setup", icon: Users },
    { id: "contract-template", label: "Use Template", icon: FileText },
  ],
  collapseAIActions: true,
  tableTitle: "Contract Records",
  columns: [
    { key: "title", label: "Contract Title", sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "status", label: "Status", sortable: true },
    { key: "sourceModule", label: "Source", sortable: true },
    { key: "actions", label: "Signatures" },
  ],
  tableData: [],
  analytics: [],
  aiInsights: [],
  systemEvents: [],
});

// ============= Module Registry =============
export const moduleRegistry: Record<string, (t: TFunction) => ModuleConfig> = {
  crm: getCrmConfig,
  hr: getHrConfig,
  events: getEventsConfig,
  church: getChurchConfig,
  coaches: getCoachesConfig,
  freelancers: getFreelancersConfig,
  accounting: getAccountingConfig,
  contracts: getContractsConfig,
  "ai-marketing": (t: TFunction) => ({
    id: "ai-marketing",
    title: "AI Marketing Agent",
    description: "Lead scoring, drip sequences, and automated campaign management",
    kpis: [
      { id: "leadsScored", label: "Leads Scored", value: "0", icon: Target, gradient: "from-rose-500 to-pink-500" },
      { id: "hotLeads", label: "Hot Leads", value: "0", icon: Zap, gradient: "from-amber-500 to-orange-500" },
      { id: "conversions", label: "Conversions", value: "0", icon: CheckCircle, gradient: "from-emerald-500 to-teal-500" },
      { id: "campaignsSent", label: "Campaigns Sent", value: "0", icon: Send, gradient: "from-blue-500 to-indigo-500" },
    ],
    primaryAction: { id: "crm-ai-pipeline", label: "Run Smart Pipeline", icon: Zap },
    aiActions: [
      { id: "crm-score", label: "AI Lead Scoring", icon: Target },
      { id: "crm-upsell", label: "Predictive Upsell", icon: DollarSign },
      { id: "crm-campaign", label: "Campaign Orchestrator", icon: Send },
    ],
    columns: [
      { key: "action", label: "Action", sortable: true },
      { key: "detail", label: "Detail", sortable: true },
      { key: "outcome", label: "Outcome", sortable: true },
      { key: "timestamp", label: "Timestamp", sortable: true },
    ],
    tableData: [],
  }),
  "ai-content": (t: TFunction) => ({
    id: "ai-content",
    title: "AI Content Creator",
    description: "Automated content calendar, blog post generation, and A/B variant testing",
    kpis: [
      { id: "piecesCreated", label: "Pieces Created", value: "0", icon: FileText, gradient: "from-blue-500 to-indigo-500" },
      { id: "calendarDays", label: "Planned Days", value: "0", icon: Calendar, gradient: "from-emerald-500 to-teal-500" },
      { id: "faqsWritten", label: "FAQs Written", value: "0", icon: MessageSquare, gradient: "from-amber-500 to-orange-500" },
    ],
    primaryAction: { id: "generate-calendar", label: "Generate 30-Day Calendar", icon: Calendar },
    aiActions: [
      { id: "generate-blog", label: "Write Blog Outline", icon: FileText },
      { id: "generate-caption", label: "Create Social Caption", icon: Sparkles },
    ],
    columns: [
      { key: "title", label: "Title", sortable: true },
      { key: "contentType", label: "Type", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "createdAt", label: "Created At", sortable: true },
    ],
    tableData: [],
  }),
  "ai-social": (t: TFunction) => ({
    id: "ai-social",
    title: "AI Social Manager",
    description: "Social media post scheduling, sentiment analysis, and trend alerts",
    kpis: [
      { id: "postsPublished", label: "Published", value: "0", icon: Globe, gradient: "from-emerald-500 to-teal-500" },
      { id: "postsScheduled", label: "Scheduled", value: "0", icon: Clock, gradient: "from-blue-500 to-indigo-500" },
      { id: "sentimentAlerts", label: "Sentiment Flags", value: "0", icon: AlertTriangle, gradient: "from-rose-500 to-pink-500" },
    ],
    primaryAction: { id: "schedule-post", label: "Schedule New Post", icon: Plus },
    aiActions: [
      { id: "analyze-sentiment", label: "Analyze Sentiment", icon: Activity },
      { id: "trend-alert", label: "Generate Trend Alert", icon: Zap },
    ],
    columns: [
      { key: "platform", label: "Platform", sortable: true },
      { key: "caption", label: "Caption", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "scheduledAt", label: "Scheduled At", sortable: true },
    ],
    tableData: [],
  }),
  "ai-frontdesk": (t: TFunction) => ({
    id: "ai-frontdesk",
    title: "AI Front Desk",
    description: "Automated FAQ handling, booking management, and case escalation",
    kpis: [
      { id: "casesResolved", label: "Cases Resolved", value: "0", icon: CheckCircle, gradient: "from-emerald-500 to-teal-500" },
      { id: "casesEscalated", label: "Escalated", value: "0", icon: AlertTriangle, gradient: "from-rose-500 to-pink-500" },
      { id: "bookingsCreated", label: "Bookings", value: "0", icon: Calendar, gradient: "from-blue-500 to-indigo-500" },
    ],
    primaryAction: { id: "add-faq", label: "Add Knowledge FAQ", icon: Plus },
    aiActions: [
      { id: "resolve-case", label: "Resolve Open Cases", icon: CheckCircle },
      { id: "view-bookings", label: "View Bookings", icon: Calendar },
    ],
    columns: [
      { key: "summary", label: "Summary", sortable: true },
      { key: "caseType", label: "Type", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "createdAt", label: "Created", sortable: true },
    ],
    tableData: [],
  }),
};

export const getModuleConfig = (moduleId: string, t: TFunction): ModuleConfig => {
  const configGetter = moduleRegistry[moduleId] || getCrmConfig;
  return configGetter(t);
};
