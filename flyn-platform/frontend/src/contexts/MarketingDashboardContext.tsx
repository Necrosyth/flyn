import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ==========================================
// FIREBASE DATABASE PLACEHOLDER
// This context will be connected to Firebase later.
// All CRUD operations here are currently using mock data.
// Replace the mock implementations with Firebase calls when ready.
// ==========================================

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  source: "whatsapp" | "email" | "webchat" | "forms" | "api" | "referral";
  status: "new" | "contacted" | "qualified" | "trial" | "activated" | "paid" | "lost";
  assignedTo?: string;
  score: number;
  createdAt: string;
  lastActivity: string;
  notes?: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: "whatsapp" | "email" | "sms" | "social";
  status: "draft" | "scheduled" | "active" | "paused" | "completed";
  templateId?: string;
  targetCount: number;
  sentCount: number;
  openRate: number;
  responseRate: number;
  createdAt: string;
  scheduledAt?: string;
}

export interface OnboardingChecklist {
  productId: string;
  productName: string;
  steps: {
    id: string;
    label: string;
    completed: boolean;
  }[];
  activationRate: number;
}

export interface ContentAsset {
  id: string;
  name: string;
  type: "pitch-deck" | "one-pager" | "video" | "faq" | "pricing" | "case-study";
  url: string;
  version: string;
  downloads: number;
  lastUpdated: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: "admin" | "marketer" | "sales" | "partner";
  avatar?: string;
  metrics: {
    leadsContacted: number;
    trialsActivated: number;
    paidConversions: number;
    revenueInfluenced: number;
  };
}

export interface FunnelMetrics {
  leads: number;
  trials: number;
  activated: number;
  paid: number;
  conversionRate: number;
}

interface MarketingDashboardContextType {
  // Leads
  leads: Lead[];
  addLead: (lead: Omit<Lead, "id" | "createdAt" | "lastActivity">) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;

  // Campaigns
  campaigns: Campaign[];
  addCampaign: (campaign: Omit<Campaign, "id" | "createdAt">) => void;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;

  // Onboarding
  onboardingChecklists: OnboardingChecklist[];
  updateOnboardingStep: (productId: string, stepId: string, completed: boolean) => void;

  // Content
  contentAssets: ContentAsset[];
  addContentAsset: (asset: Omit<ContentAsset, "id" | "downloads" | "lastUpdated">) => void;

  // Team
  teamMembers: TeamMember[];

  // Funnel
  funnelMetrics: FunnelMetrics;

  // AI Recommendations
  aiRecommendations: Array<{
    id: string;
    type: "lead-score" | "outreach-time" | "follow-up" | "upgrade";
    message: string;
    leadId?: string;
    priority: "high" | "medium" | "low";
  }>;

  // State
  isLoading: boolean;
  refreshData: () => Promise<void>;
}

const MarketingDashboardContext = createContext<MarketingDashboardContextType | undefined>(undefined);

// Mock data generators
function generateMockLeads(): Lead[] {
  const sources: Lead["source"][] = ["whatsapp", "email", "webchat", "forms", "api", "referral"];
  const statuses: Lead["status"][] = ["new", "contacted", "qualified", "trial", "activated", "paid", "lost"];
  const names = [
    "John Smith", "Maria Garcia", "David Chen", "Sarah Johnson", "Michael Brown",
    "Emily Davis", "James Wilson", "Lisa Anderson", "Robert Taylor", "Jennifer Martinez"
  ];

  return names.map((name, i) => ({
    id: `lead-${i + 1}`,
    name,
    email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    phone: `+1555${String(1000000 + i).slice(1)}`,
    company: ["Acme Corp", "TechStart", "GlobalInc", "LocalBiz", "StartupXYZ"][i % 5],
    source: sources[i % sources.length],
    status: statuses[i % statuses.length],
    assignedTo: ["tm-1", "tm-2", "tm-3"][i % 3],
    score: Math.floor(Math.random() * 50) + 50,
    createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

function generateMockCampaigns(): Campaign[] {
  return [
    {
      id: "camp-1",
      name: "WhatsApp Welcome Series",
      type: "whatsapp",
      status: "active",
      targetCount: 500,
      sentCount: 423,
      openRate: 89,
      responseRate: 34,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "camp-2",
      name: "Trial Activation Email",
      type: "email",
      status: "active",
      targetCount: 200,
      sentCount: 200,
      openRate: 45,
      responseRate: 12,
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "camp-3",
      name: "Enterprise Demo Outreach",
      type: "email",
      status: "scheduled",
      targetCount: 50,
      sentCount: 0,
      openRate: 0,
      responseRate: 0,
      createdAt: new Date().toISOString(),
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

function generateMockOnboarding(): OnboardingChecklist[] {
  return [
    {
      productId: "whatsapp-crm",
      productName: "WhatsApp CRM",
      steps: [
        { id: "1", label: "Connect WhatsApp Business", completed: true },
        { id: "2", label: "Import contacts", completed: true },
        { id: "3", label: "Send first message", completed: false },
        { id: "4", label: "Set up automation", completed: false },
      ],
      activationRate: 68,
    },
    {
      productId: "events",
      productName: "Events & Ticketing",
      steps: [
        { id: "1", label: "Create first event", completed: true },
        { id: "2", label: "Configure ticketing", completed: true },
        { id: "3", label: "Share event link", completed: true },
        { id: "4", label: "First ticket sale", completed: false },
      ],
      activationRate: 82,
    },
    {
      productId: "church",
      productName: "Church Management",
      steps: [
        { id: "1", label: "Add church profile", completed: true },
        { id: "2", label: "Import members", completed: false },
        { id: "3", label: "Set up giving", completed: false },
        { id: "4", label: "First donation", completed: false },
      ],
      activationRate: 45,
    },
  ];
}

function generateMockContent(): ContentAsset[] {
  return [
    { id: "1", name: "FLYN AI Sales Deck", type: "pitch-deck", url: "/assets/deck.pdf", version: "2.4", downloads: 234, lastUpdated: "2026-01-15" },
    { id: "2", name: "WhatsApp CRM One-Pager", type: "one-pager", url: "/assets/whatsapp.pdf", version: "1.2", downloads: 156, lastUpdated: "2026-01-20" },
    { id: "3", name: "Platform Demo Video", type: "video", url: "/assets/demo.mp4", version: "3.0", downloads: 89, lastUpdated: "2026-01-10" },
    { id: "4", name: "Pricing FAQ", type: "faq", url: "/assets/faq.pdf", version: "1.5", downloads: 312, lastUpdated: "2026-01-25" },
    { id: "5", name: "Enterprise Case Study", type: "case-study", url: "/assets/case.pdf", version: "1.0", downloads: 67, lastUpdated: "2026-01-18" },
  ];
}

function generateMockTeam(): TeamMember[] {
  return [
    {
      id: "tm-1",
      name: "Alice Johnson",
      role: "marketer",
      metrics: { leadsContacted: 145, trialsActivated: 34, paidConversions: 12, revenueInfluenced: 24500 },
    },
    {
      id: "tm-2",
      name: "Bob Williams",
      role: "sales",
      metrics: { leadsContacted: 89, trialsActivated: 28, paidConversions: 18, revenueInfluenced: 42000 },
    },
    {
      id: "tm-3",
      name: "Carol Davis",
      role: "marketer",
      metrics: { leadsContacted: 167, trialsActivated: 41, paidConversions: 15, revenueInfluenced: 31200 },
    },
  ];
}

export function MarketingDashboardProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [onboardingChecklists, setOnboardingChecklists] = useState<OnboardingChecklist[]>(generateMockOnboarding());
  const [contentAssets, setContentAssets] = useState<ContentAsset[]>([]);
  const [teamMembers] = useState<TeamMember[]>(generateMockTeam());
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to Leads
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      setLeads(data.length > 0 ? data : generateMockLeads());
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Subscribe to Campaigns
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "campaigns"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign));
      setCampaigns(data.length > 0 ? data : generateMockCampaigns());
    });
    return () => unsub();
  }, []);

  // Subscribe to Content Assets
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "content_assets"), orderBy("lastUpdated", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContentAsset));
      setContentAssets(data.length > 0 ? data : generateMockContent());
    });
    return () => unsub();
  }, []);

  const funnelMetrics: FunnelMetrics = {
    leads: leads.length,
    trials: leads.filter(l => ["trial", "activated", "paid"].includes(l.status)).length,
    activated: leads.filter(l => ["activated", "paid"].includes(l.status)).length,
    paid: leads.filter(l => l.status === "paid").length,
    conversionRate: Math.round((leads.filter(l => l.status === "paid").length / leads.length) * 100),
  };

  const aiRecommendations = [
    { id: "ai-1", type: "lead-score" as const, message: "John Smith has high engagement - schedule a demo call", leadId: "lead-1", priority: "high" as const },
    { id: "ai-2", type: "outreach-time" as const, message: "Best time to contact Maria Garcia: 2-4 PM EST", leadId: "lead-2", priority: "medium" as const },
    { id: "ai-3", type: "follow-up" as const, message: "David Chen hasn't responded in 5 days - send follow-up", leadId: "lead-3", priority: "high" as const },
    { id: "ai-4", type: "upgrade" as const, message: "TechStart is ready for Pro plan upgrade based on usage", priority: "medium" as const },
  ];

  const addLead = useCallback(async (lead: Omit<Lead, "id" | "createdAt" | "lastActivity">) => {
    if (db) {
      await addDoc(collection(db, "leads"), {
        ...lead,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
      return;
    }
    const newLead: Lead = {
      ...lead,
      id: `lead-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    setLeads(prev => [newLead, ...prev]);
  }, []);

  const updateLead = useCallback(async (id: string, updates: Partial<Lead>) => {
    if (db) {
      await updateDoc(doc(db, "leads", id), {
        ...updates,
        lastActivity: new Date().toISOString()
      });
      return;
    }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates, lastActivity: new Date().toISOString() } : l));
  }, []);

  const deleteLead = useCallback(async (id: string) => {
    if (db) {
      await deleteDoc(doc(db, "leads", id));
      return;
    }
    setLeads(prev => prev.filter(l => l.id !== id));
  }, []);

  const addCampaign = useCallback(async (campaign: Omit<Campaign, "id" | "createdAt">) => {
    if (db) {
      await addDoc(collection(db, "campaigns"), {
        ...campaign,
        createdAt: new Date().toISOString()
      });
      return;
    }
    const newCampaign: Campaign = {
      ...campaign,
      id: `camp-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setCampaigns(prev => [newCampaign, ...prev]);
  }, []);

  const updateCampaign = useCallback((id: string, updates: Partial<Campaign>) => {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const updateOnboardingStep = useCallback((productId: string, stepId: string, completed: boolean) => {
    setOnboardingChecklists(prev => prev.map(checklist => {
      if (checklist.productId === productId) {
        return {
          ...checklist,
          steps: checklist.steps.map(step => step.id === stepId ? { ...step, completed } : step),
        };
      }
      return checklist;
    }));
  }, []);

  const addContentAsset = useCallback((asset: Omit<ContentAsset, "id" | "downloads" | "lastUpdated">) => {
    const newAsset: ContentAsset = {
      ...asset,
      id: `asset-${Date.now()}`,
      downloads: 0,
      lastUpdated: new Date().toISOString().split("T")[0],
    };
    setContentAssets(prev => [newAsset, ...prev]);
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    // ==========================================
    // FIREBASE: Replace with Firebase fetch
    // const leadsSnapshot = await firebase.firestore().collection('leads').get()
    // setLeads(leadsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    // ==========================================
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsLoading(false);
  }, []);

  return (
    <MarketingDashboardContext.Provider
      value={{
        leads,
        addLead,
        updateLead,
        deleteLead,
        campaigns,
        addCampaign,
        updateCampaign,
        onboardingChecklists,
        updateOnboardingStep,
        contentAssets,
        addContentAsset,
        teamMembers,
        funnelMetrics,
        aiRecommendations,
        isLoading,
        refreshData,
      }}
    >
      {children}
    </MarketingDashboardContext.Provider>
  );
}

export function useMarketingDashboard() {
  const context = useContext(MarketingDashboardContext);
  if (!context) {
    throw new Error("useMarketingDashboard must be used within MarketingDashboardProvider");
  }
  return context;
}
