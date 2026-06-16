import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuleAccess } from "@/services/team";

/**
 * Blocks a route when the logged-in member's access to `module` is "none".
 * Owner/admin always pass. Unset access defaults to allowed (see AuthContext).
 * Use to enforce the per-member module permissions set in Team management.
 */
export const RequireModule = ({ module, children }: { module: keyof ModuleAccess; children: React.ReactNode }) => {
  const { isAuthInitializing, isTenantFetching, canAccessModule, accessLoaded, user } = useAuth();
  const isPrivileged = user?.role === "owner" || user?.role === "admin";
  // Wait until access is resolved so we don't wrongly redirect a member who
  // actually has access (their moduleAccess loads just after the tenant fetch).
  if (isAuthInitializing || isTenantFetching) return null;
  if (!isPrivileged && !accessLoaded) return null;
  if (!canAccessModule(module)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};
