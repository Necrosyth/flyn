import { ReactNode, createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

// ============= Role Types =============
export type DashboardRole = "founder" | "manager" | "agent";

interface RoleConfig {
  /** Show financial KPIs (Revenue, etc.) */
  showFinancialKPIs: boolean;
  /** Show system health in KPI strip */
  showSystemHealth: boolean;
  /** Show contextual analytics (Layer 4) */
  showAnalytics: boolean;
  /** Show AI insights panel (Layer 5) */
  showAIInsights: boolean;
  /** Show full table or filtered to team/assigned */
  tableScope: "full" | "team" | "assigned";
  /** Allow bulk actions */
  allowBulkActions: boolean;
  /** Show global scope selector */
  showScopeSelector: boolean;
}

// ============= Role Configurations =============
export const ROLE_CONFIGS: Record<DashboardRole, RoleConfig> = {
  founder: {
    showFinancialKPIs: true,
    showSystemHealth: true,
    showAnalytics: true,
    showAIInsights: true,
    tableScope: "full",
    allowBulkActions: true,
    showScopeSelector: true,
  },
  manager: {
    showFinancialKPIs: false,
    showSystemHealth: false,
    showAnalytics: true,
    showAIInsights: true,
    tableScope: "team",
    allowBulkActions: true,
    showScopeSelector: true,
  },
  agent: {
    showFinancialKPIs: false,
    showSystemHealth: false,
    showAnalytics: false,
    showAIInsights: false,
    tableScope: "assigned",
    allowBulkActions: false,
    showScopeSelector: false,
  },
};

// ============= Context =============
interface RoleContextType {
  role: DashboardRole;
  setRole: (role: DashboardRole) => void;
  config: RoleConfig;
  isEntitled: (permission: keyof RoleConfig) => boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children, defaultRole = "founder" }: { children: ReactNode; defaultRole?: DashboardRole }) {
  const [role, setRole] = useState<DashboardRole>(defaultRole);
  const config = ROLE_CONFIGS[role];

  const isEntitled = (permission: keyof RoleConfig): boolean => {
    const value = config[permission];
    return value === true || value === "full";
  };

  return (
    <RoleContext.Provider value={{ role, setRole, config, isEntitled }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    // Return default founder config if not wrapped in provider
    return {
      role: "founder" as DashboardRole,
      setRole: () => {},
      config: ROLE_CONFIGS.founder,
      isEntitled: () => true,
    };
  }
  return context;
}

// ============= Visibility Components =============
interface RoleGateProps {
  /** Required permission to show children */
  requires: keyof RoleConfig;
  /** Content to show if entitled */
  children: ReactNode;
  /** Fallback content if not entitled */
  fallback?: ReactNode;
}

/**
 * RoleGate - Conditionally renders content based on role permissions
 */
export function RoleGate({ requires, children, fallback }: RoleGateProps) {
  const { isEntitled } = useRole();

  if (isEntitled(requires)) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
}

// ============= Demo Role Switcher (for testing) =============
interface RoleSwitcherProps {
  className?: string;
}

export function RoleSwitcher({ className }: RoleSwitcherProps) {
  const { role, setRole } = useRole();

  const roles: { id: DashboardRole; label: string }[] = [
    { id: "founder", label: "Founder/Admin" },
    { id: "manager", label: "Manager" },
    { id: "agent", label: "Agent/Staff" },
  ];

  return (
    <div className={cn("flex items-center gap-2 p-2 bg-muted/50 rounded-lg", className)}>
      <span className="text-xs text-muted-foreground">Role:</span>
      {roles.map((r) => (
        <button
          key={r.id}
          onClick={() => setRole(r.id)}
          className={cn(
            "px-3 py-1 text-xs rounded-md transition-colors",
            role === r.id
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
