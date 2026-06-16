import { useState, ReactNode, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SandboxBanner, OccasionBanner, NotificationModal, EmailVerificationBanner, UsageWarningBanner } from "@/components/Banners";
import { UsageMeter } from "@/components/UsageMeter";
import { usePlan } from "@/contexts/PlanContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useNotifications, NotificationEventType } from "@/contexts/NotificationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { useTenantPlan } from "@/contexts/TenantPlanContext";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Menu, ChevronDown, User, Zap, Globe, LayoutDashboard, MessageSquare, Bot, Settings as SettingsIcon, X } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import FlynLogo from "@/components/FlynLogo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AppLayoutProps {
  children: ReactNode;
}

const OCCASION_META_KEY = 'flyn_occasion_meta';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const AppLayout = ({ children }: AppLayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('flyn_settings_prefs') || '{}');
      return !!prefs.ap_collapsedSidebar;
    } catch { return true; }
  });
  const [isMobile, setIsMobile] = useState(false);

  const { currentPlan, isSandboxMode, getPlanInfo } = usePlan();
  const { branding } = useBranding();
  const { user, logout } = useAuth();
  const { notify } = useNotifications();
  const { balance } = useWallet();
  const { tenantPlan, loading: planLoading } = useTenantPlan();
  const occasionsChecked = useRef(false);

  const planInfo = getPlanInfo(currentPlan);

  // ── Occasion check — runs once per session after auth ──────────────────────
  useEffect(() => {
    if (!user || occasionsChecked.current) return;
    const sessionKey = "flyn_occasions_checked";
    if (sessionStorage.getItem(sessionKey)) {
      occasionsChecked.current = true;
      return;
    }
    const check = async () => {
      try {
        const meta: Record<string, { shownAt?: number; dismissCount?: number }> =
          JSON.parse(localStorage.getItem(OCCASION_META_KEY) || '{}');
        const now = Date.now();

        // Max 1 celebration per week across all occasion types
        const lastShownAny = Object.values(meta).reduce((max, m) => Math.max(max, m.shownAt || 0), 0);
        if (lastShownAny && now - lastShownAny < ONE_WEEK_MS) {
          sessionStorage.setItem(sessionKey, "1");
          occasionsChecked.current = true;
          return;
        }

        const res = await authedFetch(`${API_BASE_URL}/occasions/check`);
        if (!res.ok) return;
        const events = await res.json() as Array<{ type: string; data: Record<string, string | number> }>;

        for (const evt of events) {
          const m = meta[evt.type] || {};
          if ((m.dismissCount || 0) >= 3) continue; // Auto-muted after 3 dismissals
          if (m.shownAt && now - m.shownAt < ONE_DAY_MS) continue; // 24h de-dup
          notify(evt.type as NotificationEventType, evt.data);
          meta[evt.type] = { ...m, shownAt: now };
          localStorage.setItem(OCCASION_META_KEY, JSON.stringify(meta));
          break; // Show at most one occasion per check (enforces max 1/week)
        }

        sessionStorage.setItem(sessionKey, "1");
        occasionsChecked.current = true;
      } catch {
        // Non-critical — silently ignore
      }
    };
    void check();
  }, [user, notify]);

  // Sync sidebar state when the "Default Collapsed Sidebar" pref is toggled in Settings
  useEffect(() => {
    const handler = (e: Event) => {
      const collapsed = (e as CustomEvent<{ collapsed: boolean }>).detail.collapsed;
      setSidebarCollapsed(!!collapsed);
    };
    window.addEventListener('flyn-sidebar-pref-change', handler);
    return () => window.removeEventListener('flyn-sidebar-pref-change', handler);
  }, []);

  // Auto-collapse on mobile (< 1100px per sidebar spec)
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1100;
      setIsMobile(mobile);
      if (mobile) setSidebarCollapsed(true);
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Global Banners */}
      <div className="flex flex-1">
        <AppSidebar
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        
        <motion.div
          initial={false}
          animate={{ marginLeft: isMobile ? 0 : sidebarCollapsed ? 72 : 264 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="flex-1 flex flex-col min-h-screen min-w-0"
        >
          {/* Global Banners */}
          <AnimatePresence mode="sync">
            <EmailVerificationBanner key="email-verify" />
            <SandboxBanner key="sandbox" />
            <UsageWarningBanner key="usage-warning" />
            <OccasionBanner key="occasion" />
          </AnimatePresence>

          {/* Top Header Bar */}
          <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex items-center justify-between px-4 gap-4">
            {/* Left side - Mobile menu + breadcrumb area */}
            <div className="flex items-center gap-3">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
            </div>
            
            {/* Right side - Usage, Notifications, User */}
            <div className="flex items-center gap-2">
              {/* Plan badge */}
              <Badge
                variant={isSandboxMode() ? "secondary" : "default"}
                className={cn(
                  "text-xs font-medium hidden sm:inline-flex",
                  !isSandboxMode() && "bg-gradient-to-r from-primary to-accent text-white"
                )}
              >
                {isSandboxMode() ? "Explore Mode" : planInfo.name}
              </Badge>

              {/* Usage quick view */}
              {!isSandboxMode() && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="hidden sm:inline text-xs">Usage</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="end">
                    <div className="space-y-4">
                      <h4 className="font-medium text-sm">This Month's Usage</h4>
                      <div className="space-y-3">
                        <UsageMeter metricKey="messages.sent" compact />
                        <UsageMeter metricKey="calls.minutes" compact />
                        <UsageMeter metricKey="ai.tokens" compact />
                      </div>
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <Link to="/settings/billing">View All Usage</Link>
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Wallet Balance */}
              {balance && (
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link to="/settings/billing">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="hidden sm:inline text-xs font-medium">{balance.balance} credits</span>
                  </Link>
                </Button>
              )}


              {/* Language Switcher */}
              <div className="hidden sm:block">
                <LanguageSwitcher variant="page" />
              </div>

              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Notifications */}
              <NotificationBell />
              
              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="hidden md:inline text-sm font-medium">
                      {user?.name}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive">
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          
          {/* Main Content */}
          <main className={cn(
            "flex-1 p-4 sm:p-6 overflow-x-hidden min-w-0",
            isMobile && "pb-24" // Extra padding for bottom nav
          )}>
            {children}
          </main>

          {/* Bottom Navigation (Mobile Only) */}
          {isMobile && (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border px-2 py-2 flex items-center justify-around safe-area-pb shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
              <Link to="/dashboard" className="flex flex-col items-center gap-1 p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                <LayoutDashboard className="h-5 w-5" />
                <span className="text-[10px] font-medium">Dashboard</span>
              </Link>
              <Link to="/inbox" className="flex flex-col items-center gap-1 p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                <MessageSquare className="h-5 w-5" />
                <span className="text-[10px] font-medium">Inbox</span>
              </Link>
              <Link to="/ai-agents" className="flex flex-col items-center gap-1 p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                <Bot className="h-5 w-5" />
                <span className="text-[10px] font-medium">AI Agents</span>
              </Link>
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="flex flex-col items-center gap-1 p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors"
              >
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </div>
          )}

          {/* Full-Screen Mobile Menu Overlay */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-0 z-[60] bg-background lg:hidden"
              >
                <div className="flex flex-col h-full">
                  <div className="h-14 px-4 border-b border-border flex items-center justify-between bg-background/95 backdrop-blur-md sticky top-0">
                     <FlynLogo size="md" />
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setMobileMenuOpen(false)}
                        className="rounded-full"
                      >
                        <X className="w-6 h-6" />
                     </Button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pt-4 pb-20">
                    <AppSidebar 
                      isCollapsed={false} 
                      onToggle={() => setMobileMenuOpen(false)} 
                      className="!flex" 
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <NotificationModal />
    </div>
  );
};

export default AppLayout;
