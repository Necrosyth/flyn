import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { LandingContentProvider } from "@/contexts/LandingContentContext";
import { SalesAnalyticsProvider } from "@/contexts/SalesAnalyticsContext";
import { useAuth } from "@/contexts/AuthContext";
import { teamService, type TeamMemberPermissions } from "@/services/team";
import { HeroEditor } from "@/components/admin/HeroEditor";
import { BrandingEditor } from "@/components/admin/BrandingEditor";
import { PricingEditor } from "@/components/admin/PricingEditor";
import { ModulesEditor } from "@/components/admin/ModulesEditor";
import { ContactEditor } from "@/components/admin/ContactEditor";
import { PublicPagesEditor } from "@/components/admin/PublicPagesEditor";
import { RobotsTxtEditor } from "@/components/admin/RobotsTxtEditor";
import { SalesRevenueDashboard } from "@/components/admin/SalesRevenueDashboard";
import StripeSettings from "@/components/admin/StripeSettings";
import VoiceProvisioningAdmin from "@/components/admin/VoiceProvisioningAdmin";
import ChatbotAdminPage from "./ChatbotAdminPage";
import ContactSubmissionsPage from "./ContactSubmissionsPage";
import {
  LayoutDashboard,
  Type,
  DollarSign,
  Boxes,
  Phone,
  CreditCard,
  TrendingUp,
  FileText,
  Bot,
  Database,
  MessageCircle,
  Inbox,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FIREBASE_PROJECT = "flyn-94396";

const FIREBASE_LINKS = [
  { label: "Firestore Database", description: "Browse and edit all collections", url: `https://console.firebase.google.com/project/${FIREBASE_PROJECT}/firestore/data`, color: "text-orange-500", bg: "bg-orange-500/10" },
  { label: "Authentication", description: "Manage users and sign-in methods", url: `https://console.firebase.google.com/project/${FIREBASE_PROJECT}/authentication/users`, color: "text-blue-500", bg: "bg-blue-500/10" },
  { label: "Rules", description: "Firestore security rules editor", url: `https://console.firebase.google.com/project/${FIREBASE_PROJECT}/firestore/rules`, color: "text-red-500", bg: "bg-red-500/10" },
];

function FirebasePanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Firebase Console</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Quick access to all Firebase services for project <code className="text-xs bg-muted px-1 py-0.5 rounded">{FIREBASE_PROJECT}</code></p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FIREBASE_LINKS.map((link) => (
          <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
            className="group rounded-xl border border-border bg-card p-5 flex items-start gap-4 hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className={`w-10 h-10 rounded-lg ${link.bg} flex items-center justify-center shrink-0`}>
              <Database className={`w-5 h-5 ${link.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm text-foreground">{link.label}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar nav definition ───────────────────────────────────────────────────

interface NavItem { id: string; label: string; icon: React.ElementType }
interface NavSection { label: string; items: NavItem[]; defaultOpen?: boolean }

// ─── Collapsible sidebar section ─────────────────────────────────────────────

function SidebarSection({
  section, activeTab, onSelect,
}: { section: NavSection; activeTab: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(section.defaultOpen !== false);
  const isActive = section.items.some(i => i.id === activeTab);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2 py-1 mb-0.5 group"
      >
        <span className={cn(
          "text-[10px] font-semibold uppercase tracking-widest transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}>
          {section.label}
        </span>
        {open
          ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-0.5">
          {section.items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left",
                activeTab === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LandingAdmin = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam || "sales";
  const { user } = useAuth();
  const [staffPerms, setStaffPerms] = useState<TeamMemberPermissions | null>(null);

  // Platform owners (role==="owner") have full access; invited staff are gated by permissions.
  const isOwner = user?.role === "owner";

  useEffect(() => {
    if (isOwner) return; // owners don't need permission lookup
    teamService.listMembers().then(members => {
      const me = members.find(m => m.uid === user?.id);
      if (me?.permissions) setStaffPerms(me.permissions);
    }).catch(() => {});
  }, [isOwner, user?.id]);

  const canSeeAnalytics = isOwner || (staffPerms?.ownerDashboardAnalytics ?? false);
  const canSeeContent   = isOwner || (staffPerms?.ownerDashboardContent ?? false);
  const canSeePricing   = isOwner || (staffPerms?.ownerDashboardPricing ?? false);
  // Platform/chatbot/firebase/api keys: visible to owners + anyone with at least one permission
  const canSeePlatform  = isOwner || canSeeAnalytics || canSeeContent || canSeePricing;

  const allNavSections: NavSection[] = [
    {
      label: "Analytics",
      defaultOpen: true,
      items: [
        { id: "sales", label: "Sales & Revenue", icon: TrendingUp },
      ],
    },
    {
      label: "Platform",
      defaultOpen: true,
      items: [
        { id: "chatbot-admin", label: "Chatbot", icon: MessageCircle },
        { id: "submissions", label: "Contact Forms", icon: Inbox },
        { id: "voice-provisioning", label: "Voice Provisioning", icon: Phone },
        { id: "firebase", label: "Firebase", icon: Database },
      ],
    },
    {
      label: "Website Settings",
      defaultOpen: false,
      items: [
        { id: "hero", label: "Hero", icon: Type },
        { id: "branding", label: "Branding", icon: FileText },
        { id: "pricing", label: "Pricing", icon: DollarSign },
        { id: "modules", label: "Modules", icon: Boxes },
        { id: "contact", label: "Contact", icon: Phone },
        { id: "pages", label: "Pages", icon: FileText },
        { id: "robots", label: "robots.txt", icon: Bot },
        { id: "stripe", label: "API Keys", icon: CreditCard },
      ],
    },
  ];

  // Filter sections/items based on permissions
  const ANALYTICS_IDS = new Set(["sales"]);
  const CONTENT_IDS   = new Set(["hero", "branding", "modules", "contact", "pages", "robots", "stripe", "chatbot-admin", "submissions", "voice-provisioning", "firebase"]);
  const PRICING_IDS   = new Set(["pricing"]);

  const canSeeTab = (id: string) => {
    if (isOwner) return true;
    if (ANALYTICS_IDS.has(id)) return canSeeAnalytics;
    if (PRICING_IDS.has(id)) return canSeePricing;
    if (CONTENT_IDS.has(id)) return canSeeContent;
    return false;
  };

  const navSections: NavSection[] = allNavSections
    .map(section => ({ ...section, items: section.items.filter(item => canSeeTab(item.id)) }))
    .filter(section => section.items.length > 0);

  // Auto-select first visible tab when permissions load for staff members
  useEffect(() => {
    if (isOwner) return;
    const firstVisible = navSections.flatMap(s => s.items)[0]?.id;
    if (firstVisible && !canSeeTab(activeTab) && !tabParam) {
      setSearchParams({ tab: firstVisible });
    }
  }, [staffPerms, canSeeTab, activeTab, tabParam, setSearchParams]);

  const renderContent = () => {
    switch (activeTab) {
      case "sales":        return <SalesRevenueDashboard />;
      case "chatbot-admin": return <ChatbotAdminPage />;
      case "submissions":  return <ContactSubmissionsPage />;
      case "voice-provisioning": return <VoiceProvisioningAdmin />;
      case "firebase":     return <FirebasePanel />;
      case "hero":         return <HeroEditor />;
      case "branding":     return <BrandingEditor />;
      case "pricing":      return <PricingEditor />;
      case "modules":      return <ModulesEditor />;
      case "contact":      return <ContactEditor />;
      case "pages":        return <PublicPagesEditor />;
      case "robots":       return <RobotsTxtEditor />;
      case "stripe":       return <StripeSettings />;
      default:             return null;
    }
  };

  const activeLabel = navSections.flatMap(s => s.items).find(i => i.id === activeTab)?.label ?? "";
  const ActiveIcon  = navSections.flatMap(s => s.items).find(i => i.id === activeTab)?.icon ?? LayoutDashboard;

  return (
    <LandingContentProvider>
      <SalesAnalyticsProvider>
          <AppLayout>
            {/* ── Content (sidebar navigation now in left AppSidebar) ── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
              {/* Content header */}
              <div className="h-12 px-6 border-b border-border flex items-center gap-3 shrink-0 bg-background/80 backdrop-blur sticky top-0 z-10">
                <ActiveIcon className="w-4 h-4 text-primary shrink-0" />
                <h1 className="font-semibold text-sm">{activeLabel}</h1>
              </div>

              {/* Page content */}
              <div className="flex-1 p-6">
                {renderContent()}
              </div>
            </div>
          </AppLayout>
      </SalesAnalyticsProvider>
    </LandingContentProvider>
  );
};

export default LandingAdmin;
