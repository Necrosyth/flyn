import { useState, useEffect, useRef, useCallback } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Inbox,
  LayoutDashboard,
  Users,
  Calendar,
  Church,
  Briefcase,
  GraduationCap,
  Bot,
  GitBranch,
  Settings,
  ChevronLeft,
  LogOut,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Send,
  Code2,
  Megaphone,
  PenTool,
  Share2,
  Phone,
  PhoneIncoming,
  BookOpen,
  Receipt,
  ShieldCheck,
  Search,
  X,
  CheckSquare,
  Files as FilesIcon,
  Globe,
  Layout,
  Globe2,
  TrendingUp,
  Type,
  FileText,
  DollarSign,
  Boxes,
  Database,
  CreditCard,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuleAccess } from "@/services/team";
import { useBranding } from "@/contexts/BrandingContext";
import { usePlan, FeatureKey, AppKey } from "@/contexts/PlanContext";
import { useUsage, UsageMetricKey, USAGE_THRESHOLDS } from "@/contexts/UsageContext";
import { useNotifications } from "@/contexts/NotificationContext";
import FlynLogo from "@/components/FlynLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SIDEBAR_ANIMATION = {
  expanded: 264,
  collapsed: 72,
  duration: 0.18,
  ease: [0.4, 0, 0.2, 1] as const,
};

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  path: string;
  badge?: number;
  featureKey?: FeatureKey;
  appKey?: string;
  usageMetric?: UsageMetricKey;
  /** Per-member module permission key — item is hidden when access is "none". */
  moduleKey?: keyof ModuleAccess;
}

interface NavGroup {
  labelKey?: string;
  /** Override rendered label — skips translation lookup */
  label?: string;
  items: NavItem[];
  defaultOpen?: boolean;
  ownerOnly?: boolean;
  /** When true, section header is static (not a collapse toggle) */
  notCollapsible?: boolean;
}

const navGroups: NavGroup[] = [
  {
    labelKey: "sidebar.communication",
    items: [
      { icon: Inbox, labelKey: "sidebar.inbox", path: "/inbox", featureKey: "channels.inbox", usageMetric: "messages.sent", moduleKey: "unified_inbox" as const },
      { icon: Phone, labelKey: "sidebar.dialer", path: "/dialer", featureKey: "telephony.ui", moduleKey: "telephony" as const },
    ],
    defaultOpen: true,
  },
  {
    label: "Website",
    labelKey: "sidebar.website",
    items: [
      { icon: Layout, labelKey: "Website Builder", path: "/website-builder", featureKey: "website.builder" },
      { icon: Globe2, labelKey: "Domains", path: "/domains", featureKey: "branding.custom_domain", moduleKey: "custom_domains" as const },
    ],
    defaultOpen: true,
  },
  {
    labelKey: "sidebar.modules",
    notCollapsible: true,
    items: [
      { icon: LayoutDashboard, labelKey: "sidebar.dashboard", path: "/dashboard", moduleKey: "dashboard" as const },
      { icon: Users, labelKey: "sidebar.crm", path: "/dashboard/crm", featureKey: "crm.contacts", moduleKey: "crm" as const },
      { icon: BookOpen, labelKey: "sidebar.phonebook", path: "/phonebook", featureKey: "modules.phonebook", moduleKey: "phonebook" as const },
      { icon: Calendar, labelKey: "sidebar.events", path: "/dashboard/events", featureKey: "modules.events", appKey: "events" },
      { icon: Briefcase, labelKey: "sidebar.hr", path: "/dashboard/hr", featureKey: "modules.hr", appKey: "hr" },
      { icon: Church, labelKey: "sidebar.church", path: "/dashboard/church", appKey: "church" },
      { icon: GraduationCap, labelKey: "sidebar.coaches", path: "/dashboard/coaches", appKey: "coaches" },
      { icon: Briefcase, labelKey: "sidebar.freelancers", path: "/dashboard/freelancers", featureKey: "modules.freelancers", appKey: "freelancers" },
      { icon: Receipt, labelKey: "sidebar.accounting", path: "/dashboard/accounting", featureKey: "modules.accounting" },
      { icon: PenTool, labelKey: "Contracts", path: "/dashboard/contracts", featureKey: "modules.contracts", moduleKey: "contracts" as const },
      { icon: Calendar, labelKey: "sidebar.calendars", path: "/dashboard/calendars", featureKey: "calendar.sync", moduleKey: "calendar" as const },
    ],
    defaultOpen: true,
  },
  {
    labelKey: "sidebar.intelligence",
    items: [
      { icon: Bot, labelKey: "sidebar.aiAgents", path: "/ai-agents", featureKey: "ai.agent.builder", usageMetric: "ai.tokens", moduleKey: "ai_agents" as const },
      { icon: GitBranch, labelKey: "sidebar.automations", path: "/automations", featureKey: "automation.publish", moduleKey: "automations" as const },
      { icon: Megaphone, labelKey: "Campaign Manager", path: "/campaigns" },
      { icon: PenTool, labelKey: "sidebar.aiContent", path: "/ai/content", featureKey: "ai.content" },
      { icon: Share2, labelKey: "sidebar.aiSocial", path: "/ai/social", featureKey: "ai.social" },
      { icon: PhoneIncoming, labelKey: "sidebar.aiFrontDesk", path: "/ai/frontdesk", featureKey: "ai.frontdesk" },
    ],
    defaultOpen: true,
  },
  {
    labelKey: "sidebar.resources",
    items: [
      { icon: CheckSquare, labelKey: "sidebar.tasks", path: "/tasks", moduleKey: "tasks" as const },
      { icon: FilesIcon, labelKey: "sidebar.files", path: "/files" },
    ],
    defaultOpen: true,
  },
  {
    labelKey: "sidebar.documentation",
    items: [
      { icon: BookOpen, labelKey: "sidebar.knowledge", path: "/knowledge" },
      { icon: Code2, labelKey: "sidebar.developerPortal", path: "/settings/developer", featureKey: "api.keys.issue", moduleKey: "api_access" as const },
    ],
    defaultOpen: false,
  },
  {
    labelKey: "Owner Dashboard",
    ownerOnly: true,
    items: [
      { icon: TrendingUp, labelKey: "Sales & Revenue", path: "/admin?tab=sales" },
      { icon: MessageCircle, labelKey: "Chatbot", path: "/admin?tab=chatbot-admin" },
      { icon: Inbox, labelKey: "Contact Forms", path: "/admin?tab=submissions" },
      { icon: Phone, labelKey: "Voice Provisioning", path: "/admin?tab=voice-provisioning" },
      { icon: Type, labelKey: "Hero", path: "/admin?tab=hero" },
      { icon: FileText, labelKey: "Branding", path: "/admin?tab=branding" },
      { icon: DollarSign, labelKey: "Pricing", path: "/admin?tab=pricing" },
      { icon: Boxes, labelKey: "Modules", path: "/admin?tab=modules" },
      { icon: Phone, labelKey: "Contact", path: "/admin?tab=contact" },
      { icon: FileText, labelKey: "Pages", path: "/admin?tab=pages" },
      { icon: Bot, labelKey: "robots.txt", path: "/admin?tab=robots" },
      { icon: CreditCard, labelKey: "API Keys", path: "/admin?tab=stripe" },
      { icon: Database, labelKey: "Firebase", path: "/admin?tab=firebase" },
    ],
    defaultOpen: true,
  },
];

interface AppSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
}

const AppSidebar = ({ isCollapsed, onToggle, className }: AppSidebarProps) => {
  const location = useLocation();
  const { logout, user, isFlynAdmin, canAccessModule } = useAuth();
  const { branding } = useBranding();
  const { isEntitled, isSandboxMode, getRequiredPlanForFeature, currentPlan, isAppSelected, getPlanInfo } = usePlan();
  const { getUsagePercentage, getThresholdStatus } = useUsage();
  const { notify, getUnreadCount, notifications } = useNotifications();
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();

  // Hover-to-expand state — sidebar expands as overlay when hovered
  const [isHovering, setIsHovering] = useState(false);
  // Effective collapsed: only collapse when both "pinned-closed" and not hovered
  const effectiveCollapsed = isCollapsed && !isHovering;

  const [expandedGroups, setExpandedGroups] = useState<string[]>(
    navGroups.filter(g => g.defaultOpen).map(g => g.labelKey || "")
  );
  const [lastSyncedAgo, setLastSyncedAgo] = useState("just now");
  const [shakingItem, setShakingItem] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNavGroups = navGroups.filter(group => !group.ownerOnly || isFlynAdmin).map(group => ({
    ...group,
    items: group.items.filter(item => {
      // Per-member module permission: hide items the member has no access to.
      if (item.moduleKey && !canAccessModule(item.moduleKey)) return false;
      if (item.appKey && !isAppSelected(item.appKey as AppKey)) return false;
      // Plan entitlement: hide items the user's plan doesn't include.
      if (item.featureKey && !isEntitled(item.featureKey)) return false;
      const label = item.labelKey ? t(item.labelKey).toLowerCase() : "";
      const path = item.path.toLowerCase();
      const query = searchQuery.toLowerCase();
      return label.includes(query) || path.includes(query);
    })
  })).filter(group => group.items.length > 0);

  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedGroups(filteredNavGroups.map(g => g.labelKey || ""));
    }
  }, [searchQuery]);

  // Auto-expand the group that contains the current route — once, and only if the
  // user hasn't already collapsed it. Done via state (not a render-time override) so
  // the chevron can still collapse it afterwards.
  useEffect(() => {
    const activeGroup = navGroups.find(g => g.items.some(i => location.pathname === i.path));
    if (activeGroup?.labelKey) {
      setExpandedGroups(prev => prev.includes(activeGroup.labelKey!) ? prev : [...prev, activeGroup.labelKey!]);
    }
  }, [location.pathname]);

  const hasOccasion = notifications.some(
    n => n.template.eventType.startsWith("occasion.") && !n.dismissed && !n.readAt
  );

  const navRef = useRef<HTMLElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 8);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  }, []);

  useEffect(() => {
    const timer = setTimeout(updateScrollIndicators, 50);
    return () => clearTimeout(timer);
  }, [expandedGroups, effectiveCollapsed, updateScrollIndicators]);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - start) / 1000);
      if (seconds < 60) setLastSyncedAgo(`${seconds}s`);
      else setLastSyncedAgo(`${Math.floor(seconds / 60)}m`);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggle]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartXRef.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartXRef.current === null) return;
      const delta = e.changedTouches[0].clientX - touchStartXRef.current;
      touchStartXRef.current = null;
      if (delta > 60 && isCollapsed) onToggle();
      else if (delta < -60 && !isCollapsed) onToggle();
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isCollapsed, onToggle]);

  const toggleGroup = (labelKey: string) => {
    setExpandedGroups(prev =>
      prev.includes(labelKey)
        ? prev.filter(l => l !== labelKey)
        : [...prev, labelKey]
    );
  };

  const getBadgeInfo = (item: NavItem) => {
    if (item.usageMetric) {
      const threshold = getThresholdStatus(item.usageMetric);
      if (threshold === "LIMIT" || threshold === "CRITICAL") {
        return { type: "warning" as const, icon: AlertCircle, threshold };
      }
    }
    if (item.path === "/inbox") {
      const unread = getUnreadCount();
      if (unread > 0) return { type: "count" as const, count: unread };
      return null;
    }
    if (item.badge) {
      return { type: "count" as const, count: item.badge };
    }
    return null;
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: effectiveCollapsed ? SIDEBAR_ANIMATION.collapsed : SIDEBAR_ANIMATION.expanded }}
      transition={{
        duration: prefersReducedMotion ? 0 : SIDEBAR_ANIMATION.duration,
        ease: SIDEBAR_ANIMATION.ease,
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={cn(
        "h-screen bg-sidebar flex-col border-r border-sidebar-border fixed left-0 top-0 z-50 hidden lg:flex",
        className
      )}
    >
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-sidebar-border">
        <AnimatePresence mode="wait">
          {!effectiveCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: prefersReducedMotion ? 0 : 0.08 } }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 relative"
            >
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.appName} className="h-8 object-contain" />
              ) : (
                <FlynLogo size="md" showText={true} customText={branding.logoText} variant="white" />
              )}
              {hasOccasion && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                  title="You have a celebration notification"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {effectiveCollapsed && (
          branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.appName} className="h-6 object-contain" />
          ) : (
            <FlynLogo size="sm" showText={false} variant="white" />
          )
        )}

        <button
          onClick={onToggle}
          className={cn(
            "p-2 rounded-lg hover:bg-sidebar-accent transition-all duration-90 text-sidebar-foreground",
            "hover:scale-105"
          )}
          title={isCollapsed ? "Pin sidebar open (⌘\\)" : "Collapse sidebar (⌘\\)"}
        >
          <motion.div
            animate={{ rotate: effectiveCollapsed ? 180 : 0 }}
            transition={{ duration: 0.14 }}
          >
            <ChevronLeft className="h-5 w-5" />
          </motion.div>
        </button>
      </div>

      {/* Search */}
      <AnimatePresence>
        {!effectiveCollapsed && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-3 py-3 border-b border-sidebar-border/30"
          >
            <div className="relative group/search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 group-focus-within/search:text-primary transition-colors" />
              <input
                type="text"
                placeholder={t("sidebar.searchPlaceholder") || "Search features..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full bg-sidebar-accent/40 border border-sidebar-border/50 rounded-full py-1.5 pl-9 pr-8 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/25",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all",
                  "hover:bg-sidebar-accent/60"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/30 hover:text-sidebar-foreground p-1 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex-1 relative min-h-0">
        {canScrollUp && !effectiveCollapsed && (
          <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
            <div className="h-8 bg-gradient-to-b from-sidebar to-transparent" />
            <div className="absolute top-1 left-0 right-0 flex justify-center pointer-events-auto">
              <button
                onClick={() => navRef.current?.scrollBy({ top: -80, behavior: "smooth" })}
                className="flex items-center justify-center w-5 h-5 rounded-full bg-sidebar-accent/80 hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <nav
          ref={navRef}
          className="h-full overflow-y-auto overscroll-contain py-3 px-2 scroll-smooth"
          onWheel={(e) => e.stopPropagation()}
          onScroll={updateScrollIndicators}
        >
          {filteredNavGroups.map((group) => {
            const isExpanded = expandedGroups.includes(group.labelKey || "");
            const sectionLabel = group.label ?? (group.labelKey ? t(group.labelKey) : "");

            return (
              <div key={group.labelKey} className="mb-1">
                {/* Group header */}
                {sectionLabel && !effectiveCollapsed && (
                  group.notCollapsible ? (
                    // Static, non-collapsible header
                    <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
                      <span>{sectionLabel}</span>
                    </div>
                  ) : (
                    // Collapsible header
                    <button
                      onClick={() => toggleGroup(group.labelKey!)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider hover:text-sidebar-foreground transition-colors"
                    >
                      <span>{sectionLabel}</span>
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.14 }}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </motion.div>
                    </button>
                  )
                )}

                {/* Group items.
                    NOTE: hasActiveItem must NOT force the group open here — that made the
                    group containing the current page (e.g. Communication on /inbox)
                    impossible to collapse. Active groups are auto-expanded once via state
                    (see effect below), so the chevron toggle still works. */}
                <AnimatePresence initial={false}>
                  {(effectiveCollapsed || isExpanded || group.notCollapsible) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0.8 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0.8 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
                      className="space-y-0 overflow-hidden"
                    >
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        const badgeInfo = getBadgeInfo(item);

                        const NavContent = (
                          <motion.div
                            animate={(!prefersReducedMotion && shakingItem === item.path)
                              ? { x: [0, -3, 3, -3, 3, 0] }
                              : { x: 0 }
                            }
                            transition={{ duration: 0.12 }}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-120 group relative text-sm",
                              isActive
                                ? "bg-gradient-to-r from-primary/8 to-primary/4 border-l-[3px] border-primary"
                                : "hover:bg-sidebar-accent"
                            )}
                          >
                            <div className={cn(
                              "relative transition-transform duration-90",
                              !effectiveCollapsed && "group-hover:scale-105"
                            )}>
                              <Icon className={cn(
                                "h-4 w-4 flex-shrink-0 text-sidebar-foreground",
                                isActive && "text-primary"
                              )} />
                            </div>

                            <AnimatePresence mode="wait">
                              {!effectiveCollapsed && (
                                <motion.span
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0, transition: { delay: prefersReducedMotion ? 0 : 0.08 } }}
                                  exit={{ opacity: 0, x: -10 }}
                                  className={cn(
                                    "font-medium whitespace-nowrap overflow-hidden flex-1 text-sidebar-foreground",
                                    isActive && "text-primary font-semibold"
                                  )}
                                >
                                  {t(item.labelKey)}
                                </motion.span>
                              )}
                            </AnimatePresence>

                            {badgeInfo && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className={cn(
                                  "flex items-center justify-center text-xs font-bold rounded-full",
                                  effectiveCollapsed ? "absolute -top-1 -right-1 w-5 h-5" : "ml-auto",
                                  badgeInfo.type === "locked" && "bg-muted text-muted-foreground",
                                  badgeInfo.type === "warning" && badgeInfo.threshold === "LIMIT" && "bg-destructive text-destructive-foreground",
                                  badgeInfo.type === "warning" && badgeInfo.threshold === "CRITICAL" && "bg-amber-500 text-white",
                                  badgeInfo.type === "count" && "bg-accent text-accent-foreground px-1.5 min-w-[20px]"
                                )}
                              >
                                {badgeInfo.type === "locked" && <Lock className="h-3 w-3" />}
                                {badgeInfo.type === "warning" && <AlertCircle className="h-3 w-3" />}
                                {badgeInfo.type === "count" && badgeInfo.count}
                              </motion.div>
                            )}
                          </motion.div>
                        );

                        const handleLockedClick = (e: React.MouseEvent) => {
                          if (isLocked) {
                            e.preventDefault();
                            setShakingItem(item.path);
                            setTimeout(() => setShakingItem(null), 300);
                            notify("feature.locked.click", {
                              plan: getRequiredPlanForFeature(item.featureKey!),
                            });
                          }
                        };

                        if (effectiveCollapsed) {
                          return (
                            <Tooltip key={item.path} delayDuration={300}>
                              <TooltipTrigger asChild>
                                <RouterNavLink to={item.path} className="block" onClick={handleLockedClick}>
                                  {NavContent}
                                </RouterNavLink>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="flex flex-col gap-1">
                                <span className="font-medium">{t(item.labelKey)}</span>
                                {isLocked && (
                                  <span className="text-xs text-muted-foreground">
                                    {t("sidebar.availableOn", { plan: getRequiredPlanForFeature(item.featureKey!) })}
                                  </span>
                                )}
                                {item.usageMetric && !isLocked && (
                                  <span className="text-xs text-muted-foreground">
                                    {t("sidebar.used", { percent: getUsagePercentage(item.usageMetric) })}
                                  </span>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          );
                        }

                        return (
                          <RouterNavLink key={item.path} to={item.path} className="block" onClick={handleLockedClick}>
                            {NavContent}
                          </RouterNavLink>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {canScrollDown && !effectiveCollapsed && (
          <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
            <div className="h-8 bg-gradient-to-t from-sidebar to-transparent" />
            <div className="absolute bottom-1 left-0 right-0 flex justify-center pointer-events-auto">
              <button
                onClick={() => navRef.current?.scrollBy({ top: 80, behavior: "smooth" })}
                className="flex items-center justify-center w-5 h-5 rounded-full bg-sidebar-accent/80 hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        {!effectiveCollapsed && (
          <div className="px-3 py-2 mb-2 rounded-lg bg-sidebar-accent/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-sidebar-foreground/60">{t("sidebar.currentPlan")}</span>
              <span className="text-xs font-semibold text-primary">{getPlanInfo(currentPlan).name}</span>
            </div>
            {isSandboxMode() && (
              <p className="text-xs text-sidebar-foreground/40 mt-1">
                {t("sidebar.exploreModeActive")}
              </p>
            )}
          </div>
        )}

        <RouterNavLink
          to="/settings"
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm",
            location.pathname === "/settings"
              ? "bg-gradient-to-r from-primary/8 to-primary/4 border-l-[3px] border-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Settings className="h-4 w-4" />
          {!effectiveCollapsed && <span className="font-medium">{t("sidebar.settings")}</span>}
        </RouterNavLink>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive transition-colors text-sm"
        >
          <LogOut className="h-4 w-4" />
          {!effectiveCollapsed && <span className="font-medium">{t("sidebar.logout")}</span>}
        </button>

        {!effectiveCollapsed && (
          <div className="px-3 py-2 space-y-1">
            <div className="flex items-center gap-2 text-xs text-sidebar-foreground/40">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full bg-emerald-500",
                !prefersReducedMotion && "animate-pulse"
              )} />
              <span>{t("sidebar.lastSynced", { time: lastSyncedAgo })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/25">
              <ShieldCheck className="h-3 w-3 shrink-0" />
              <span>SOC-2 Ready</span>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
};

export default AppSidebar;
