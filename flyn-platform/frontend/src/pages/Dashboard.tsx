import { useEffect, useState } from "react";
import { authedFetch } from '@/services/authApi';
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Inbox,
  Phone,
  Users,
  Calendar,
  Church,
  Briefcase,
  GraduationCap,
  Bot,
  GitBranch,
  TrendingUp,
  MessageSquare,
  Clock,
  Zap,
  Lock,
  BookOpen,
  Receipt,
  Megaphone,
  Sparkles,
  Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { usePlan } from "@/contexts/PlanContext";
import { useUsage } from "@/contexts/UsageContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { UsageMeter } from "@/components/UsageMeter";
import { API_BASE_URL } from "@/lib/api";

interface StatItem {
  value: string;
  trend: string;
}

interface DashboardStats {
  activeConversations: StatItem;
  callsToday: StatItem;
  automationsRun: StatItem;
  responseTime: StatItem;
}

const Dashboard = () => {
  const { isSandboxMode, currentPlan, isAppSelected } = usePlan();
  const { notify } = useNotifications();
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const headers: Record<string, string> = {};
        if (tenantId) headers["x-tenant-id"] = tenantId;

        const res = await authedFetch(`${API_BASE_URL}/dashboard/stats`);
        if (res.ok) {
          setStats(await res.json());
        }
      } catch (err) {
        console.warn("Failed to load dashboard stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statsData = [
    { labelKey: "dashboard.stats.activeConversations", value: stats?.activeConversations.value ?? "—", icon: MessageSquare, trend: stats?.activeConversations.trend ?? "0%" },
    { labelKey: "dashboard.stats.callsToday", value: stats?.callsToday.value ?? "—", icon: Phone, trend: stats?.callsToday.trend ?? "0%" },
    { labelKey: "dashboard.stats.automationsRun", value: stats?.automationsRun.value ?? "—", icon: Zap, trend: stats?.automationsRun.trend ?? "0%" },
    { labelKey: "dashboard.stats.responseTime", value: stats?.responseTime.value ?? "—", icon: Clock, trend: stats?.responseTime.trend ?? "—" },
  ];

  // All possible module cards — filtered by onboarding selection
  const allModuleCards = [
    {
      appKey: "crm" as const,
      icon: Users,
      titleKey: "dashboard.modules.crm",
      descKey: "dashboard.modules.crmDesc",
      path: "/dashboard/crm",
      color: "from-violet-500 to-purple-600",
      alwaysShow: true,
    },
    {
      appKey: "events" as const,
      icon: Calendar,
      titleKey: "dashboard.modules.events",
      descKey: "dashboard.modules.eventsDesc",
      path: "/dashboard/events",
      color: "from-blue-500 to-cyan-500",
    },
    {
      appKey: "hr" as const,
      icon: Briefcase,
      titleKey: "dashboard.modules.hr",
      descKey: "dashboard.modules.hrDesc",
      path: "/dashboard/hr",
      color: "from-emerald-500 to-teal-500",
    },
    {
      appKey: "church" as const,
      icon: Church,
      titleKey: "dashboard.modules.church",
      descKey: "dashboard.modules.churchDesc",
      path: "/dashboard/church",
      color: "from-amber-500 to-orange-500",
    },
    {
      appKey: "coaches" as const,
      icon: GraduationCap,
      titleKey: "dashboard.modules.coaches",
      descKey: "dashboard.modules.coachesDesc",
      path: "/dashboard/coaches",
      color: "from-pink-500 to-rose-500",
    },
    {
      appKey: "freelancers" as const,
      icon: Briefcase,
      titleKey: "dashboard.modules.freelancers",
      descKey: "dashboard.modules.freelancersDesc",
      path: "/dashboard/freelancers",
      color: "from-indigo-500 to-violet-500",
    },
    {
      appKey: "ai-marketing" as any,
      icon: Megaphone,
      titleKey: "Marketing Agent",
      descKey: "Lead scoring & drip sync",
      path: "/ai/marketing",
      color: "from-rose-500 to-pink-600",
    },
    {
      appKey: "ai-content" as any,
      icon: Sparkles,
      titleKey: "Content Creator",
      descKey: "Calendar & blog generation",
      path: "/ai/content",
      color: "from-blue-500 to-indigo-600",
    },
    {
      appKey: "ai-social" as any,
      icon: Globe,
      titleKey: "Social Manager",
      descKey: "Scheduling & sentiment",
      path: "/ai/social",
      color: "from-emerald-500 to-teal-600",
    },
    {
      appKey: "ai-frontdesk" as any,
      icon: Bot,
      titleKey: "Front Desk",
      descKey: "FAQs & bookings",
      path: "/ai/frontdesk",
      color: "from-amber-500 to-orange-600",
    },
  ];

  // Accounting is always visible — it's the financial backbone for all modules
  const accountingCard = {
    icon: Receipt,
    titleKey: "dashboard.modules.accounting",
    descKey: "dashboard.modules.accountingDesc",
    path: "/dashboard/accounting",
    color: "from-emerald-500 to-teal-600",
  };

  // Filter by onboarding-selected apps; CRM always shown
  const moduleCards = allModuleCards.filter(m => m.alwaysShow || isAppSelected(m.appKey));

  // Plugin cards — always visible
  const pluginCards = [
    {
      icon: Phone,
      title: "Telephony (IVR)",
      desc: "AI phone calls & voice agents",
      path: "/dialer",
      color: "from-sky-500 to-blue-600",
      comingSoon: false,
    },
    {
      icon: GitBranch,
      title: "Automations",
      desc: "Visual workflow builder",
      path: "/automations",
      color: "from-indigo-500 to-purple-600",
      comingSoon: false,
    },
    {
      icon: Bot,
      title: "Voice Agents",
      desc: "Vapi voice assistant setup",
      path: "/ai-agents",
      color: "from-violet-500 to-fuchsia-600",
      comingSoon: false,
    },
  ];

  const quickActions = [
    { icon: Inbox, labelKey: "dashboard.quickActions.openInbox", path: "/inbox", primary: true },
    { icon: Phone, labelKey: "dashboard.quickActions.startCall", path: "/dialer", primary: true },
    { icon: Bot, labelKey: "dashboard.quickActions.aiAgents", path: "/ai-agents" },
    { icon: GitBranch, labelKey: "dashboard.quickActions.automations", path: "/automations" },
    { icon: MessageSquare, labelKey: "dashboard.quickActions.whatsappCrm", path: "/plugins/whatsapp-crm" },
  ];

  // Trigger welcome notification on first visit
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem("flyn_welcome_shown");
    if (!hasSeenWelcome) {
      notify("account.created");
      localStorage.setItem("flyn_welcome_shown", "true");
    }
  }, [notify]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("dashboard.title")}</h1>
            <p className="text-muted-foreground mt-1">
              {isSandboxMode()
                ? t("dashboard.sandboxSubtitle")
                : t("dashboard.welcomeSubtitle")}
            </p>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-3"
        >
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.path}
                to={action.path}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-medium transition-all duration-200 ${action.primary
                  ? "flyn-button-gradient"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  } text-sm`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(action.labelKey)}
              </Link>
            );
          })}
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {statsData.map((stat, index) => {
            const Icon = stat.icon;
            const trendColor = stat.trend.startsWith("+")
              ? "text-status-active"
              : stat.trend.startsWith("-") && stat.labelKey === "dashboard.stats.responseTime"
                ? "text-status-active"
                : "text-destructive";

            return (
              <motion.div
                key={stat.labelKey}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + index * 0.05 }}
              >
                <Card className="flyn-card border-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t(stat.labelKey)}</p>
                        {statsLoading ? (
                          <div className="h-7 w-12 mt-1 rounded bg-muted animate-pulse" />
                        ) : (
                          <p className="text-2xl font-bold mt-1 tracking-tight">{stat.value}</p>
                        )}
                      </div>
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 mt-2.5 text-xs ${trendColor}`}>
                      <TrendingUp className="h-3 w-3" />
                      <span className="font-semibold">{stat.trend}</span>
                      <span className="text-muted-foreground/60">{t("common.vsLastWeek")}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Module Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-lg font-semibold mb-3">{t("dashboard.yourApps")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {moduleCards.map((module, index) => {
              const Icon = module.icon;
              return (
                <motion.div
                  key={module.titleKey}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + index * 0.05 }}
                >
                  <Link to={module.path}>
                    <Card className="flyn-card border-0 group cursor-pointer overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2.5 rounded-lg bg-gradient-to-br ${module.color} text-white shadow-md`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                              {t(module.titleKey)}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {t(module.descKey)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}

            {/* Accounting card — always visible, financial backbone for all modules */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + moduleCards.length * 0.05 }}
            >
              <Link to={accountingCard.path}>
                <Card className="flyn-card border-0 group cursor-pointer overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-lg bg-gradient-to-br ${accountingCard.color} text-white shadow-md`}>
                        <accountingCard.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                          {t(accountingCard.titleKey)}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t(accountingCard.descKey)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Plugin cards — Telephony */}
            {pluginCards.map((plugin, index) => {
              const Icon = plugin.icon;
              return (
                <motion.div
                  key={plugin.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + (moduleCards.length + 1 + index) * 0.05 }}
                >
                  <Link to={plugin.path}>
                    <Card className="flyn-card border-0 group cursor-pointer overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2.5 rounded-lg bg-gradient-to-br ${plugin.color} text-white shadow-md`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                              {plugin.title}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{plugin.desc}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Usage Overview (only for paid plans) */}
        {!isSandboxMode() && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <h2 className="text-xl font-semibold mb-4">{t("dashboard.usageThisMonth")}</h2>
            <Card className="flyn-card border-0">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <UsageMeter metricKey="messages.sent" />
                  <UsageMeter metricKey="calls.minutes" />
                  <UsageMeter metricKey="ai.tokens" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;
