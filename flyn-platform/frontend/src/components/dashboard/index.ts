// Dashboard components barrel export

// Layout
export { DashboardLayout } from "./DashboardLayout";

// Layer 1: KPI Strip
export { KPIStrip } from "./KPIStrip";
export type { KPI } from "./KPIStrip";

// Layer 2: Action Bar
export { ActionBar } from "./ActionBar";
export type { ActionItem } from "./ActionBar";

// Layer 3: Data Tables
export { EnhancedDataTable } from "./EnhancedDataTable";
export type { TableColumn, SavedView, BulkAction } from "./EnhancedDataTable";
export { DataTable, renderStatusBadge } from "./DataTable";
export type { Column, DataTableProps } from "./DataTable";

// Layer 4: Analytics
export { AnalyticsPanel } from "./AnalyticsPanel";
export { SimpleBarChart, ProgressRing } from "./SimpleChart";

// Layer 5: AI Insights
export { AIInsightPanel } from "./AIInsightPanel";
export type { AIInsight } from "./AIInsightPanel";

// Layer 6: Activity & System Feed
export { SystemFeed } from "./SystemFeed";
export type { SystemEvent } from "./SystemFeed";
export { ActivityFeed } from "./ActivityFeed";
export type { Activity } from "./ActivityFeed";

// New Dashboard Enhancements
export { CoachProfileTabs } from "./CoachProfileTabs";
export type { CoachData } from "./CoachProfileTabs";
export { AddInviteToggle, CheckInLink } from "./AddInviteToggle";
export { CampusScopeSelector, demoCampuses } from "./CampusScopeSelector";
export type { Campus } from "./CampusScopeSelector";
export { RoleProvider, RoleGate, RoleSwitcher, useRole, ROLE_CONFIGS } from "./RoleVisibility";
export type { DashboardRole } from "./RoleVisibility";
export { DemoDataBadge, CappedStateBanner, DisabledActionButton } from "./DemoDataBadge";
export { HealthStatusChip, HealthStatusDot, renderHealthStatus } from "./HealthStatusChip";
export type { HealthStatus } from "./HealthStatusChip";

// Supporting Components
export { StatCard, FeaturedStat } from "./StatCard";
export { TeamMemberCard, TeamList } from "./TeamMemberCard";
export { NoticeCard, NoticeList } from "./NoticeCard";
export { ContactCard, ContactInfoPanel } from "./ContactCard";

// Configuration
export { moduleRegistry, getModuleConfig } from "./moduleConfig";
export type { ModuleConfig } from "./moduleConfig";
