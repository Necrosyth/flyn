import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { auth } from "@/lib/firebase";
import { disableDemoMode, enableDemoMode, getDemoTenant, getDemoUser, isDemoModeEnabled } from "@/lib/demo-mode";
import { tenantsService, type Tenant } from "@/services/tenants";
import { teamService, type ModuleAccess, type ModuleAccessLevel } from "@/services/team";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getIdTokenResult,
  updateProfile as fbUpdateProfile,
  updateEmail as fbUpdateEmail,
  updatePassword as fbUpdatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User as FirebaseUser
} from "firebase/auth";

const AUTH_TIMEOUT_MS = 15000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

interface User {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "manager" | "agent";
  organizationId: string;
  plan?: string;
  emailVerified?: boolean;
  phoneNumber?: string | null;
}

interface AuthContextType {
  user: User | null;
  fbUser: FirebaseUser | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isAuthInitializing: boolean;
  /** True while the tenant doc is being fetched after login (prevents premature onboarding gate checks). */
  isTenantFetching: boolean;
  /** True only for members of the FLYN platform org (isFlynPlatform=true on their tenant). */
  isFlynAdmin: boolean;
  /** Per-module access for the logged-in member (owner/admin always 'full'). */
  moduleLevel: (key: keyof ModuleAccess) => ModuleAccessLevel;
  canAccessModule: (key: keyof ModuleAccess) => boolean;
  /** True once the member's module access has been fetched (owner/admin don't need it). */
  accessLoaded: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateUserProfile: (data: { name?: string; email?: string }) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isAuthInitializing, setIsAuthInitializing] = useState(true);
  const [isTenantFetching, setIsTenantFetching] = useState(false);
  const [moduleAccess, setModuleAccess] = useState<ModuleAccess | null>(null);
  const [accessLoaded, setAccessLoaded] = useState(false);
  // Persists across renders — guards against Firebase token refreshes
  // re-setting isAuthInitializing=true and unmounting the whole page.
  const hasInitialized = useRef(false);
  const demoMode = isDemoModeEnabled();

  const syncDemoState = () => {
    setFbUser(null);
    setUser(getDemoUser());
    setTenant(getDemoTenant());
    setModuleAccess({} as ModuleAccess);
    setAccessLoaded(true);
    setIsTenantFetching(false);
    setIsAuthInitializing(false);
  };

  const refreshUser = async () => {
    if (isDemoModeEnabled()) {
      syncDemoState();
      return;
    }
    const current = auth?.currentUser;
    if (current) {
      await current.reload();
      setFbUser(current);
      setUser((prev) => prev ? { ...prev, emailVerified: current.emailVerified } : null);
    }
    // Always attempt to refresh tenant data — works for both Firebase Auth
    // and dev-token bypass (where auth?.currentUser is null)
    try {
      const tenantData = await tenantsService.getMe();
      setTenant(tenantData);
    } catch {
      // Intentionally ignore tenant fetch failures during refresh
    }
  };

  // Subscribe to Firebase auth state
  useEffect(() => {
    if (demoMode) {
      syncDemoState();
      return;
    }
    if (!auth) {
      setUser(null);
      setFbUser(null);
      setIsAuthInitializing(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setFbUser(firebaseUser);
      if (!firebaseUser) {
        // DEV-only: synthesize user from a manually pasted _devToken JWT so
        // localhost testing works without completing MFA.
        if (import.meta.env.DEV) {
          const raw = localStorage.getItem('_devToken');
          if (raw) {
            try {
              // JWT uses base64url — replace url-safe chars before atob
              const payload = JSON.parse(atob(raw.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
              const roleRaw = payload.role as string | undefined;
              const role: User['role'] =
                roleRaw === 'owner' || roleRaw === 'admin' || roleRaw === 'manager' || roleRaw === 'agent'
                  ? roleRaw
                  : 'admin';
              const synthetic: User = {
                id: (payload.user_id as string) || (payload.sub as string) || 'dev-user',
                email: (payload.email as string) || '',
                name: (payload.name as string) || (payload.email as string)?.split('@')[0] || 'Dev User',
                role,
                organizationId: (payload.organization_id as string) || '',
                plan: typeof payload.plan === 'string' ? payload.plan : undefined,
                emailVerified: (payload.email_verified as boolean) ?? true,
                phoneNumber: null,
              };
              setUser(synthetic);
              // Fetch tenant data for dev-token bypass users too
              try {
                const tenantData = await tenantsService.getMe();
                setTenant(tenantData);
              } catch {
                // Tenant not found yet — will be created during onboarding
              }
              setIsAuthInitializing(false);
              return;
            } catch {
              // Invalid token — fall through to null user
            }
          }
        }
        setUser(null);
        setIsAuthInitializing(false);
        return;
      }

      // Only block rendering on the very first load — token refreshes must not
      // set this to true again or ProtectedRoute returns null and unmounts everything.
      if (!hasInitialized.current) setIsAuthInitializing(true);
      
      try {
        let token = await withTimeout(
          getIdTokenResult(firebaseUser, false),
          AUTH_TIMEOUT_MS,
          "Timed out while reading auth token"
        );
        
        if (!token.claims.organization_id) {
          try {
            token = await withTimeout(
              getIdTokenResult(firebaseUser, true),
              AUTH_TIMEOUT_MS,
              "Timed out while refreshing auth token"
            );
          } catch {
            // keep original token if refresh fails
          }
        }
        
        const claims = isRecord(token.claims) ? token.claims : {};
        const roleRaw = claims.role;
        const role = roleRaw === "owner" || roleRaw === "admin" || roleRaw === "manager" || roleRaw === "agent" ? roleRaw : undefined;
        const orgRaw = claims.organization_id;
        const organizationId = typeof orgRaw === "string" ? orgRaw : "";
        
        const mapped: User = {
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split("@")[0] : "User"),
          role: role || "admin",
          organizationId,
          plan: typeof claims.plan === "string" ? claims.plan : undefined,
          emailVerified: firebaseUser.emailVerified,
          phoneNumber: firebaseUser.phoneNumber,
        };
        setUser(mapped);

        // Fetch tenant data
        setIsTenantFetching(true);
        try {
          const tenantData = await tenantsService.getMe();
          setTenant(tenantData);
          // Restore the local flag so ProtectedRoute lets re-logged-in users through.
          if (tenantData.onboardingComplete) {
            localStorage.setItem("flyn_onboarding_complete", "true");
          }
          // Load this member's module access for client-side gating (non-blocking).
          teamService.getMyAccess()
            .then((a) => setModuleAccess(a.moduleAccess ?? {}))
            .catch(() => setModuleAccess({}))
            .finally(() => setAccessLoaded(true));
        } catch (err) {
          console.warn("Failed to fetch tenant data:", err);
        } finally {
          setIsTenantFetching(false);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        hasInitialized.current = true;
        setIsAuthInitializing(false);
      }
    });
    return () => unsub();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      if (demoMode) {
        enableDemoMode();
        syncDemoState();
        return true;
      }
      if (!auth) return false;
      const cred = await withTimeout(
        signInWithEmailAndPassword(auth, email, password),
        AUTH_TIMEOUT_MS,
        "Timed out while signing in"
      );
      
      const token = await withTimeout(
        getIdTokenResult(cred.user, false),
        AUTH_TIMEOUT_MS,
        "Timed out while loading auth claims"
      );
      
      const claims = isRecord(token.claims) ? token.claims : {};
      const roleRaw = claims.role;
      const role = roleRaw === "owner" || roleRaw === "admin" || roleRaw === "manager" || roleRaw === "agent" ? roleRaw : undefined;
      const orgRaw = claims.organization_id;
      const organizationId = typeof orgRaw === "string" ? orgRaw : "";
      
      const mapped: User = {
        id: cred.user.uid,
        email: cred.user.email || email,
        name: cred.user.displayName || email.split("@")[0],
        role: role || "admin",
        organizationId,
        plan: typeof claims.plan === "string" ? claims.plan : undefined,
        emailVerified: cred.user.emailVerified,
        phoneNumber: cred.user.phoneNumber,
      };
      
      setFbUser(cred.user);
      setUser(mapped);
      return true;
    } catch (err: any) {
      if (err.code === "auth/multi-factor-auth-required") {
        throw err;
      }
      return false;
    }
  };

  const logout = () => {
    if (demoMode) {
      disableDemoMode();
      setUser(null);
      setFbUser(null);
      setTenant(null);
      setModuleAccess(null);
      setAccessLoaded(false);
      setIsTenantFetching(false);
      setIsAuthInitializing(false);
      localStorage.removeItem("flyn_onboarding_complete");
      return;
    }
    setUser(null);
    setFbUser(null);
    setTenant(null);
    localStorage.removeItem("flyn_onboarding_complete");
    if (!auth) return;
    signOut(auth).catch(() => {});
  };

  const updateUserProfile = async (data: { name?: string; email?: string }): Promise<boolean> => {
    try {
      if (demoMode) {
        setUser((prev) => prev ? {
          ...prev,
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
        } : prev);
        return true;
      }
      const current = auth?.currentUser;
      if (!current) return false;
      if (data.name !== undefined) {
        await fbUpdateProfile(current, { displayName: data.name });
      }
      if (data.email !== undefined && data.email !== current.email) {
        await fbUpdateEmail(current, data.email);
      }
      // Update local state immediately
      setUser((prev) => prev ? {
        ...prev,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
      } : null);
      setFbUser(current);
      return true;
    } catch {
      return false;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      if (demoMode) return true;
      const current = auth?.currentUser;
      if (!current || !current.email) return false;
      const credential = EmailAuthProvider.credential(current.email, currentPassword);
      await reauthenticateWithCredential(current, credential);
      await fbUpdatePassword(current, newPassword);
      return true;
    } catch {
      return false;
    }
  };

  // Owner/admin always have full access. For invited members (manager/agent), access
  // is DENY-BY-DEFAULT: an unset module = "none" — matching what the Team management UI
  // shows (member.moduleAccess?.[m] || "none"). The owner must explicitly grant Full/Read.
  // (While member access is still loading, treat as undefined → none, so we never flash
  // a module the member shouldn't see.)
  const moduleLevel = (key: keyof ModuleAccess): ModuleAccessLevel => {
    if (user?.role === "owner" || user?.role === "admin") return "full";
    return (moduleAccess?.[key] as ModuleAccessLevel | undefined) ?? "none";
  };
  const canAccessModule = (key: keyof ModuleAccess): boolean => moduleLevel(key) !== "none";

  return (
    <AuthContext.Provider
      value={{
        user,
        fbUser,
        tenant,
        isAuthenticated: !!user,
        isAuthInitializing,
        isTenantFetching,
        isFlynAdmin: tenant?.isFlynPlatform === true,
        moduleLevel,
        canAccessModule,
        accessLoaded,
        login,
        logout,
        updateUserProfile,
        changePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const useHasRole = (...roles: Array<User["role"]>): boolean => {
  const { user } = useAuth();
  if (!user) return false;
  return roles.includes(user.role);
};
