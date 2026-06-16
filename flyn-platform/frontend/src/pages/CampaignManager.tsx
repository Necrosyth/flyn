/**
 * Campaign Manager — unified multi-channel hub.
 *
 * Top-level channel switcher (WhatsApp · Telegram · Email · Call). Each channel
 * exposes its own sub-tabs:
 *   WhatsApp → Campaigns · Broadcasts · Templates · Chatbot Flows · AI Chat · Analytics
 *   Telegram → Campaigns · Channels · Broadcasts · Bot Commands · Chatbot Flows · AI Chat · Analytics
 *   Email    → Campaigns · Analytics
 *   Call     → Campaigns · Call Center · Analytics
 *
 * The WhatsApp/Telegram panels are reused from their original plugin pages
 * (now exported as a panel library). The unified Campaigns panel is shared by
 * all four channels and talks to /api/campaigns.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentStore } from "@/hooks/useAgentStore";
import { campaignsApi, renderEmailHtml, resolveEmailHtml, type Campaign, type CampaignChannel, type CampaignContact, type EmailTemplate, type EmailBrandingPreview } from "@/services/campaigns";
import { mailboxesService, type TenantMailbox } from "@/services/mailboxes";
import { useBranding } from "@/contexts/BrandingContext";
import { EmailTemplateBuilder, EMPTY_TEMPLATE, type EmailTemplateDraft } from "@/components/campaigns/EmailTemplateBuilder";
import { EmailTemplatesPanel } from "@/components/campaigns/EmailTemplatesPanel";
import { EMAIL_LIBRARY, libraryTemplateToDraft, LIBRARY_COUNT, LIBRARY_INDUSTRIES, LIBRARY_USE_CASES } from "@/data/emailLibrary";
import { LeadScoringPanel, ActivityPanel } from "@/pages/campaign/CampaignLeadTools";
import {
  MessageCircle, Send, Mail, Phone, Plus, Search, Check, ChevronLeft, ChevronRight,
  Loader2, Trash2, Target, AlertTriangle, PhoneCall, Megaphone, FileText, Bot,
  Sparkles, BarChart3, Wifi, Terminal, CheckCircle2, TrendingUp, LibraryBig,
} from "lucide-react";

// Reuse the rich WhatsApp panels
import {
  BroadcastsPanel as WABroadcasts,
  TemplatesPanel as WATemplates,
  ChatbotFlowsPanel as WAChatbot,
  AIChatPanel as WAAIChat,
  AnalyticsPanel as WAAnalytics,
} from "@/pages/WhatsAppCRM";
// Reuse the rich Telegram panels
import {
  ChannelsPanel as TGChannels,
  BroadcastsPanel as TGBroadcasts,
  BotCommandsPanel as TGBotCommands,
  ChatbotFlowsPanel as TGChatbot,
  AIChatPanel as TGAIChat,
  AnalyticsPanel as TGAnalytics,
} from "@/pages/TelegramPlugin";

interface ConnectedChannel {
  id: string;
  type: string;
  name: string;
  status: "active" | "inactive" | "disconnected" | "error" | "pending";
  tenantId: string;
  externalChannelId?: string;
  createdAt: number;
}

// ─── Channel config ─────────────────────────────────────────────────────────

type ContactMode = "phone" | "email" | "telegram";

interface ChannelMeta {
  id: CampaignChannel;
  label: string;
  icon: React.ReactNode;
  accent: string;
  activeBg: string;
  contactMode: ContactMode;
  needsSubject: boolean;
}

const CHANNELS: ChannelMeta[] = [
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" />, accent: "text-green-400", activeBg: "bg-green-500/20 text-green-300 border-green-500/40", contactMode: "phone", needsSubject: false },
  { id: "telegram", label: "Telegram", icon: <Send className="w-4 h-4" />, accent: "text-sky-400", activeBg: "bg-sky-500/20 text-sky-300 border-sky-500/40", contactMode: "telegram", needsSubject: false },
  { id: "email", label: "Email", icon: <Mail className="w-4 h-4" />, accent: "text-rose-400", activeBg: "bg-rose-500/20 text-rose-300 border-rose-500/40", contactMode: "email", needsSubject: true },
  { id: "call", label: "Call", icon: <Phone className="w-4 h-4" />, accent: "text-violet-400", activeBg: "bg-violet-500/20 text-violet-300 border-violet-500/40", contactMode: "phone", needsSubject: false },
];

// Per-channel sub-tabs
const CHANNEL_TABS: Record<CampaignChannel, { id: string; label: string; icon: React.ReactNode }[]> = {
  whatsapp: [
    { id: "campaigns", label: "Campaigns", icon: <Target className="w-3.5 h-3.5" /> },
    { id: "broadcasts", label: "Broadcasts", icon: <Megaphone className="w-3.5 h-3.5" /> },
    { id: "templates", label: "Templates", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "chatbot", label: "Chatbot Flows", icon: <Bot className="w-3.5 h-3.5" /> },
    { id: "ai-chat", label: "AI Chat", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ],
  telegram: [
    { id: "campaigns", label: "Campaigns", icon: <Target className="w-3.5 h-3.5" /> },
    { id: "channels", label: "Channels", icon: <Wifi className="w-3.5 h-3.5" /> },
    { id: "broadcasts", label: "Broadcasts", icon: <Megaphone className="w-3.5 h-3.5" /> },
    { id: "commands", label: "Bot Commands", icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: "chatbot", label: "Chatbot Flows", icon: <Bot className="w-3.5 h-3.5" /> },
    { id: "ai-chat", label: "AI Chat", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ],
  email: [
    { id: "campaigns", label: "Campaigns", icon: <Target className="w-3.5 h-3.5" /> },
    { id: "templates", label: "Templates", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ],
  call: [
    { id: "campaigns", label: "Campaigns", icon: <Target className="w-3.5 h-3.5" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ],
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-500/15 text-foreground",
  launching: "bg-amber-500/15 text-amber-400",
  launched: "bg-green-500/15 text-green-400",
};

const stepsFor = (channel: CampaignChannel): string[] =>
  channel === "call" ? ["Details", "Contacts", "Agent", "Review"]
    : channel === "email" ? ["Details", "Contacts", "Design", "Review"]
    : ["Details", "Contacts", "Message", "Review"];

// ─── Campaign builder wizard (shared across channels) ─────────────────────────

interface CampaignBuilderProps {
  channel: ChannelMeta;
  open: boolean;
  onClose: () => void;
  onLaunched: () => void;
}

const CampaignBuilder = ({ channel, open, onClose, onLaunched }: CampaignBuilderProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { agents, fetchAgents } = useAgentStore();
  const { branding } = useBranding();
  const tenantId = user?.organizationId || localStorage.getItem("tenantId") || "";

  // Tenant branding for ACCURATE template previews (header logo + footer) — resolves exactly as the
  // backend applies it at send. NOT passed to the stored/sent emailHtml (line ~284): that keeps the
  // {{brand_logo}} seam + default footer so the backend brands it authoritatively per recipient.
  const previewBranding: EmailBrandingPreview = useMemo(
    () => ({
      footerText: branding.emailFooterText,
      showPoweredBy: branding.showPoweredBy,
      logoMode: branding.emailLogoMode,
      logoUrl: branding.logoUrl,
      logoText: branding.appName || branding.logoText,
    }),
    [branding.emailFooterText, branding.showPoweredBy, branding.emailLogoMode, branding.logoUrl, branding.appName, branding.logoText],
  );

  const STEPS = stepsFor(channel.id);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [type, setType] = useState<"standard" | "ab_test">("standard");
  const [messageA, setMessageA] = useState("");
  const [messageB, setMessageB] = useState("");
  const [agentId, setAgentId] = useState("");
  const [search, setSearch] = useState("");
  const [allContacts, setAllContacts] = useState<CampaignContact[]>([]);
  const [selected, setSelected] = useState<CampaignContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  // Active mailboxes this user may send email campaigns FROM (mine() → active only).
  const [activeMailboxes, setActiveMailboxes] = useState<TenantMailbox[]>([]);
  const [selectedMailboxId, setSelectedMailboxId] = useState("");

  // Email-specific: live template builder + saved templates
  const [emailDraft, setEmailDraft] = useState<EmailTemplateDraft>(EMPTY_TEMPLATE);
  const [savedTemplates, setSavedTemplates] = useState<EmailTemplate[]>([]);
  // Built-in library picker for the Design step (feeds the SAME emailDraft the wizard already uses).
  const [showLibrary, setShowLibrary] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  const [libIndustry, setLibIndustry] = useState("all");
  const [libUseCase, setLibUseCase] = useState("all");
  const libFiltered = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    return EMAIL_LIBRARY.filter((t) => {
      if (libIndustry !== "all" && t.industry !== libIndustry) return false;
      if (libUseCase !== "all" && t.category !== libUseCase) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.industry.toLowerCase().includes(q)
      );
    });
  }, [libQuery, libIndustry, libUseCase]);

  useEffect(() => {
    if (open) {
      setStep(0); setName(""); setType("standard"); setMessageA(""); setMessageB("");
      setAgentId(""); setSearch(""); setSelected([]); setEmailDraft(EMPTY_TEMPLATE);
    }
  }, [open]);

  useEffect(() => {
    if (open && channel.id === "call" && tenantId) fetchAgents(tenantId);
    if (open && channel.id === "email") {
      campaignsApi.listEmailTemplates().then(setSavedTemplates).catch(() => {});
      // Load active mailboxes for the "Send from" selector. Silent on failure (falls back to BYO-SMTP).
      mailboxesService.mine()
        .then((all) => setActiveMailboxes(all.filter((m) => m.status === "active")))
        .catch(() => setActiveMailboxes([]));
    }
  }, [open, channel.id, tenantId, fetchAgents]);

  const contactKey = (c: CampaignContact) =>
    channel.contactMode === "telegram" ? `tg-${c.telegramId}` : `${c.source}-${c.id}-${c.phone || c.email}`;

  useEffect(() => {
    if (step !== 1 || !open) return;
    setContactsLoading(true);

    const loadPhoneOrEmail = async () => {
      const [pb, crm] = await Promise.all([
        authedFetch(`${API_BASE_URL}/phonebook/contacts?limit=300`).then(r => r.ok ? r.json() : []).catch(() => []),
        authedFetch(`${API_BASE_URL}/crm/contacts?limit=300`).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
      ]);
      const pbList = Array.isArray(pb) ? pb : (pb.contacts || []);
      const crmList = Array.isArray(crm) ? crm : (crm.data || crm.contacts || []);
      const needEmail = channel.contactMode === "email";

      const map = (list: any[], source: "phonebook" | "crm"): CampaignContact[] =>
        list.map((c: any) => ({
          id: c.id || c.contactId,
          name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unknown",
          phone: c.phone || c.phoneNumber || "",
          email: c.email || "",
          source,
        })).filter((c: CampaignContact) => needEmail ? !!c.email : !!c.phone);

      const merged = [...map(pbList, "phonebook"), ...map(crmList, "crm")];
      const seen = new Set<string>();
      const deduped = merged.filter((c) => {
        const k = needEmail ? (c.email || "") : (c.phone || "");
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setAllContacts(deduped);
    };

    const loadTelegram = async () => {
      const res = await authedFetch(`${API_BASE_URL}/channels/telegram/subscribers`)
        .then(r => r.ok ? r.json() : { subscribers: [] }).catch(() => ({ subscribers: [] }));
      const subs: CampaignContact[] = (res.subscribers || []).map((s: any) => ({
        telegramId: s.telegramId, channelId: s.channelId, name: s.name || s.telegramId, source: "telegram" as const,
      }));
      setAllContacts(subs);
    };

    (channel.contactMode === "telegram" ? loadTelegram() : loadPhoneOrEmail())
      .finally(() => setContactsLoading(false));
  }, [step, open, channel.contactMode]);

  const isSelected = (c: CampaignContact) => selected.some((s) => contactKey(s) === contactKey(c));
  const toggle = (c: CampaignContact) =>
    setSelected((prev) => isSelected(c) ? prev.filter((s) => contactKey(s) !== contactKey(c)) : [...prev, c]);

  const filtered = allContacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.email || "").toLowerCase().includes(q);
  });

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return selected.length > 0;
    if (step === 2) {
      if (channel.id === "call") return true;
      if (channel.id === "email") return emailDraft.subject.trim().length > 0 && emailDraft.body.trim().length > 0;
      return messageA.trim().length > 0;
    }
    return true;
  };

  const loadTemplateIntoDraft = (t: EmailTemplate) =>
    setEmailDraft({
      name: t.name, subject: t.subject, preheader: t.preheader || "", body: t.body,
      buttonLabel: t.buttonLabel || "", buttonUrl: t.buttonUrl || "", accent: t.accent || "#7C6FF7",
      // Carry rich HTML through so a library/rich template sends + previews verbatim.
      ...(t.html ? { html: t.html } : {}),
    });

  const handleLaunch = async () => {
    setCreating(true);
    try {
      const isEmail = channel.id === "email";
      const created = await campaignsApi.create({
        name,
        channel: channel.id,
        messageA: channel.id === "call" ? "" : isEmail ? emailDraft.body : messageA,
        messageB: !isEmail && type === "ab_test" && messageB.trim() ? messageB : undefined,
        subject: isEmail ? emailDraft.subject : undefined,
        emailHtml: isEmail ? resolveEmailHtml(emailDraft) : undefined,
        agentId: channel.id === "call" && agentId ? agentId : undefined,
        mailboxId: isEmail && selectedMailboxId ? selectedMailboxId : undefined,
        selectedContacts: selected,
      });
      if (!created.success || !created.campaignId) {
        toast({ variant: "destructive", title: "Could not create campaign", description: created.message || "Server error" });
        return;
      }
      const launched = await campaignsApi.launch(created.campaignId);
      if (launched.success) {
        toast({
          title: channel.id === "call" ? "Call campaign launched!" : "Campaign launched!",
          description: `${launched.sent} ${channel.id === "call" ? "calls placed" : "sent"}${launched.failed > 0 ? `, ${launched.failed} failed` : ""}.`,
        });
      } else {
        toast({ variant: "destructive", title: "Launch failed", description: launched.error || launched.message || "Created but could not launch." });
      }
      onClose();
      onLaunched();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Unexpected error" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`bg-card border-border text-foreground max-h-[88vh] flex flex-col ${channel.id === "email" && step === 2 ? "max-w-4xl" : "max-w-2xl"}`}>
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <span className={channel.accent}>{channel.icon}</span>
            New {channel.label} Campaign
          </DialogTitle>
          <div className="flex items-center gap-1 mt-4">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  i < step ? "bg-green-500 text-white" : i === step ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-xs ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-muted mx-1" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Campaign Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Offer 2026"
                  className="bg-muted/40 border-border text-foreground text-sm" autoFocus />
              </div>
              {(channel.id === "whatsapp" || channel.id === "telegram") && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Campaign Type</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["standard", "ab_test"] as const).map((t) => (
                      <button key={t} onClick={() => setType(t)}
                        className={`p-3 rounded-xl border text-left transition-colors ${type === t ? "border-indigo-500/50 bg-indigo-500/10" : "border-border bg-muted/30 hover:border-border"}`}>
                        <p className="text-sm font-medium text-foreground">{t === "standard" ? "Standard" : "A/B Test"}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t === "standard" ? "One message" : "Two variants, split 50/50"}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {channel.id === "call" && (
                <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 flex items-start gap-2">
                  <PhoneCall className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-violet-200 leading-relaxed">
                    Pick contacts from your <strong>CRM &amp; Phonebook</strong>, choose an <strong>AI agent</strong>, and Flyn places a <strong>real outbound AI voice call</strong> to each one through your connected Twilio number.
                  </p>
                </div>
              )}
              {channel.id === "email" && (
                <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-start gap-2">
                  <Mail className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-rose-200 leading-relaxed">
                    Pick contacts from your <strong>CRM &amp; Phonebook</strong>, then design the email with a <strong>live preview</strong> (or load a saved template). {"{{name}}"} personalises each send.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {channel.contactMode === "telegram" ? "Select bot subscribers" :
                   channel.contactMode === "email" ? "Select contacts with an email address" :
                   "Select contacts with a phone number"}
                </p>
                <Badge className="bg-indigo-500/15 text-indigo-400 text-xs">{selected.length} selected</Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
                  className="pl-9 bg-muted/40 border-border text-foreground text-sm h-9" />
              </div>
              {contactsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {channel.contactMode === "telegram" ? "No bot subscribers yet — users must message your bot first."
                        : channel.contactMode === "email" ? "No contacts with an email address found."
                          : "No contacts with a phone number found."}
                    </p>
                  ) : filtered.map((c) => {
                    const sel = isSelected(c);
                    return (
                      <button key={contactKey(c)} onClick={() => toggle(c)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${sel ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/30 hover:border-white/15"}`}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${sel ? "bg-green-500 border-green-500" : "border-border"}`}>
                          {sel && <Check className="w-3 h-3 text-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {channel.contactMode === "email" ? c.email :
                             channel.contactMode === "telegram" ? `Telegram · ${c.telegramId}` : c.phone}
                          </p>
                        </div>
                        {c.source && c.source !== "telegram" && (
                          <Badge className={`text-[10px] shrink-0 ${c.source === "crm" ? "bg-purple-500/15 text-purple-400" : "bg-blue-500/15 text-blue-400"}`}>{c.source}</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {channel.id === "call" ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 flex items-start gap-2">
                    <PhoneCall className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-violet-200 leading-relaxed">The AI agent handles the conversation on each call. Pick which agent should run this campaign.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">AI Agent</Label>
                    <Select value={agentId} onValueChange={setAgentId}>
                      <SelectTrigger className="bg-muted/40 border-border text-foreground"><SelectValue placeholder="Generic AI (no specific agent)" /></SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        {agents.length === 0 ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">No agents — a generic AI will be used.</div>
                        ) : agents.map((a: any) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : channel.id === "email" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {savedTemplates.length > 0 && (
                      <>
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Start from template</Label>
                        <Select onValueChange={(id) => { const t = savedTemplates.find((x) => x.id === id); if (t) loadTemplateIntoDraft(t); }}>
                          <SelectTrigger className="bg-muted/40 border-border text-foreground h-8 text-xs w-[200px]"><SelectValue placeholder="Blank — design from scratch" /></SelectTrigger>
                          <SelectContent className="bg-card border-border text-foreground">
                            {savedTemplates.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                    {/* Browse the built-in library → picks into the SAME emailDraft (no new send path) */}
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                      onClick={() => { setLibQuery(""); setShowLibrary(true); }}>
                      <LibraryBig className="w-3.5 h-3.5" /> Browse library ({LIBRARY_COUNT})
                    </Button>
                  </div>
                  <EmailTemplateBuilder
                    draft={emailDraft}
                    onChange={(p) => setEmailDraft((d) => ({ ...d, ...p }))}
                    showName={false}
                    previewName={selected[0]?.name?.split(" ")[0] || "Alex"}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Message A * <span className="text-muted-foreground">— use {"{{name}}"} for personalisation</span></Label>
                    <Textarea value={messageA} onChange={(e) => setMessageA(e.target.value)}
                      placeholder="Hi {{name}}, we have a special offer just for you…"
                      className="bg-muted/40 border-border text-foreground text-sm min-h-[120px] resize-none" autoFocus />
                    <p className="text-[11px] text-muted-foreground">{messageA.length} characters</p>
                  </div>
                  {type === "ab_test" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Message B <span className="text-muted-foreground">— A/B variant</span></Label>
                      <Textarea value={messageB} onChange={(e) => setMessageB(e.target.value)}
                        placeholder="Alternative version of the message…"
                        className="bg-muted/40 border-border text-foreground text-sm min-h-[80px] resize-none" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Campaign</p>
                  <p className="text-sm font-bold text-foreground">{name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge className={`text-[10px] ${channel.activeBg}`}>{channel.label}</Badge>
                    {(channel.id === "whatsapp" || channel.id === "telegram") && <Badge className="text-[10px] bg-indigo-500/15 text-indigo-400">{type === "ab_test" ? "A/B Test" : "Standard"}</Badge>}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Recipients</p>
                  <p className="text-2xl font-bold text-foreground">{selected.length}</p>
                </div>
              </div>
              {channel.id === "call" ? (
                <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Agent</p>
                  <p className="text-sm text-foreground">{agents.find((a: any) => a.id === agentId)?.name || "Generic AI"}</p>
                  <p className="text-[11px] text-violet-300 mt-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> {selected.length} real outbound call{selected.length !== 1 ? "s" : ""} will be placed on launch.
                  </p>
                </div>
              ) : channel.id === "email" ? (
                <>
                  <div className="p-3 rounded-xl bg-muted/40 border border-white/[0.08]">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Subject</p>
                    <p className="text-xs text-foreground">{emailDraft.subject}</p>
                  </div>
                  {/* Send from — only shown when the user has ≥1 active mailbox. Defaults to BYO-SMTP. */}
                  <div className="p-3 rounded-xl bg-muted/40 border border-white/[0.08]">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Send from</p>
                    {activeMailboxes.length > 0 ? (
                      <select
                        value={selectedMailboxId}
                        onChange={(e) => setSelectedMailboxId(e.target.value)}
                        className="w-full bg-transparent text-xs text-foreground outline-none border border-border/60 rounded-lg px-2 py-1.5 focus:border-primary/60 transition-colors"
                      >
                        <option value="">Connected account (BYO-SMTP / default)</option>
                        {activeMailboxes.map((m) => (
                          <option key={m.id} value={m.id}>{m.address}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Connected account — add an active mailbox in Settings → White Label → Email to send from a custom address.
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border overflow-hidden bg-[#f4f4f7]">
                    <iframe title="Email review" sandbox="" className="w-full h-[320px] bg-white"
                      srcDoc={resolveEmailHtml({ ...emailDraft, body: emailDraft.body.replace(/\{\{\s*name\s*\}\}/gi, selected[0]?.name?.split(" ")[0] || "Alex"), html: emailDraft.html ? emailDraft.html.replace(/\{\{\s*name\s*\}\}/gi, selected[0]?.name?.split(" ")[0] || "Alex") : undefined }, previewBranding)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-muted/40 border border-white/[0.08]">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Message A</p>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{messageA}</p>
                  </div>
                  {type === "ab_test" && messageB && (
                    <div className="p-3 rounded-xl bg-muted/40 border border-white/[0.08]">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Message B</p>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{messageB}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-border flex-row justify-between gap-2">
          <div>
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} className="text-muted-foreground gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </Button>
            )}
          </div>
          <div>
            {step === 3 ? (
              <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white gap-1.5" onClick={handleLaunch} disabled={creating}>
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : channel.id === "call" ? <PhoneCall className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                {creating ? "Launching…" : channel.id === "call" ? "Place Calls" : "Launch Now"}
              </Button>
            ) : (
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Built-in library picker — feeds the SAME emailDraft the wizard already uses ── */}
    <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
      <DialogContent className="bg-[#111214] border-white/10 text-white max-w-5xl h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header — fixed */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 shrink-0 space-y-3">
          <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
            <LibraryBig className="w-4 h-4 text-rose-400" /> Template Library
            <span className="text-xs font-normal text-slate-500">{libFiltered.length} of {LIBRARY_COUNT}</span>
          </DialogTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <Input value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="Search templates…"
                className="pl-8 bg-white/5 border-white/10 text-white text-sm h-9" autoFocus />
            </div>
            <select value={libIndustry} onChange={(e) => setLibIndustry(e.target.value)}
              className="h-9 rounded-md bg-white/5 border border-white/10 text-white text-sm px-2.5 outline-none focus:border-rose-400/50 cursor-pointer">
              <option value="all">All industries</option>
              {LIBRARY_INDUSTRIES.map((i) => <option key={i} value={i} className="bg-[#111214]">{i}</option>)}
            </select>
            <select value={libUseCase} onChange={(e) => setLibUseCase(e.target.value)}
              className="h-9 rounded-md bg-white/5 border border-white/10 text-white text-sm px-2.5 outline-none focus:border-rose-400/50 cursor-pointer">
              <option value="all">All use cases</option>
              {LIBRARY_USE_CASES.map((c) => <option key={c} value={c} className="bg-[#111214]">{c}</option>)}
            </select>
          </div>
        </DialogHeader>

        {/* Scrollable body — scroll container and grid are SEPARATE elements */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">
          {libFiltered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-16">
              <Search className="w-8 h-8 text-slate-600" />
              <p className="text-sm text-slate-400">No templates match your filters</p>
              <button type="button" onClick={() => { setLibQuery(""); setLibIndustry("all"); setLibUseCase("all"); }}
                className="text-xs font-semibold text-rose-400 hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {libFiltered.map((t) => (
                <button key={t.id} type="button"
                  onClick={() => { setEmailDraft(libraryTemplateToDraft(t)); setShowLibrary(false); }}
                  className="group text-left rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col hover:border-rose-400/60 hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all duration-150 shadow-sm hover:shadow-rose-500/10 hover:shadow-lg">
                  <div className="h-44 bg-[#f4f4f7] overflow-hidden relative shrink-0 border-b border-white/5">
                    <iframe title={t.name} srcDoc={resolveEmailHtml(libraryTemplateToDraft(t), previewBranding)} sandbox="" tabIndex={-1}
                      className="w-[250%] h-[250%] origin-top-left pointer-events-none" style={{ transform: "scale(0.4)" }} />
                    {t.kind === "rich" && (
                      <span className="absolute top-2 right-2 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/90 text-white shadow">Rich</span>
                    )}
                    <span className="absolute inset-0 bg-rose-500/0 group-hover:bg-rose-500/5 transition-colors" />
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.industry} · {t.category}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

// ─── Unified Campaigns panel (per channel) ────────────────────────────────────

const UnifiedCampaignsPanel = ({ channelMeta }: { channelMeta: ChannelMeta }) => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCampaigns(await campaignsApi.list(channelMeta.id)); }
    finally { setLoading(false); }
  }, [channelMeta.id]);

  useEffect(() => { void load(); }, [load]);

  const handleLaunch = async (id: string) => {
    setLaunching(id);
    try {
      const r = await campaignsApi.launch(id);
      if (r.success) { toast({ title: "Campaign launched!", description: `${r.sent} sent${r.failed > 0 ? `, ${r.failed} failed` : ""}.` }); void load(); }
      else toast({ variant: "destructive", title: "Launch failed", description: r.error || r.message });
    } finally { setLaunching(null); }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try { await campaignsApi.remove(id); setCampaigns((prev) => prev.filter((c) => c.campaignId !== id)); }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">{channelMeta.label} Campaigns</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {channelMeta.id === "call" ? "Place outbound AI voice calls to a chosen list of contacts" : `Pick contacts, compose your message, and launch via ${channelMeta.label}`}
          </p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5" onClick={() => setBuilderOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> New Campaign
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : campaigns.length === 0 ? (
        <Card className="bg-muted/30 border-border">
          <CardContent className="p-10 text-center text-muted-foreground">
            <div className="flex justify-center mb-3 opacity-30">{channelMeta.icon}</div>
            <p className="text-sm">No {channelMeta.label} campaigns yet.</p>
            <Button size="sm" className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5" onClick={() => setBuilderOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Create Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => (
            <Card key={c.campaignId} className="bg-muted/40 border-border hover:border-indigo-500/20 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">{c.name}</h3>
                      {c.type === "ab_test" && <Badge className="bg-indigo-500/15 text-indigo-400 text-[10px]">A/B Test</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {new Date(c.createdAt).toLocaleDateString()}
                      {c.launchedAt ? ` · Launched ${new Date(c.launchedAt).toLocaleDateString()}` : ""}
                      {` · ${c.contactCount} recipients`}
                    </p>
                  </div>
                  <Badge className={STATUS_STYLE[c.status] || "bg-slate-500/15 text-muted-foreground"}>{c.status}</Badge>
                </div>

                {c.channel === "call" ? (
                  <div className="flex items-center gap-2 mb-3 bg-muted/40 rounded-lg px-3 py-2 border border-border">
                    <PhoneCall className="w-3.5 h-3.5 text-violet-400" /><span className="text-xs text-foreground">Outbound AI voice calls</span>
                  </div>
                ) : (
                  <>
                    {c.subject && <p className="text-xs text-muted-foreground mb-1.5"><span className="uppercase font-bold text-[10px] mr-2">Subject:</span>{c.subject}</p>}
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2 bg-muted/40 rounded-lg px-3 py-2">
                      <span className="text-muted-foreground text-[10px] uppercase font-bold mr-2">A:</span>{c.messageA}
                    </p>
                    {c.messageB && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 bg-muted/40 rounded-lg px-3 py-2">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold mr-2">B:</span>{c.messageB}
                      </p>
                    )}
                  </>
                )}

                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                  <div className="p-2 rounded-lg bg-muted/40"><p className="text-lg font-bold text-foreground">{c.sent}</p><p className="text-[10px] text-muted-foreground">{c.channel === "call" ? "Calls" : "Sent"}</p></div>
                  <div className="p-2 rounded-lg bg-muted/40"><p className="text-lg font-bold text-red-400">{c.failed}</p><p className="text-[10px] text-muted-foreground">Failed</p></div>
                  <div className="p-2 rounded-lg bg-muted/40"><p className="text-lg font-bold text-muted-foreground">{c.contactCount}</p><p className="text-[10px] text-muted-foreground">Audience</p></div>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  {c.status === "draft" && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white text-xs gap-1.5" disabled={launching === c.campaignId} onClick={() => handleLaunch(c.campaignId)}>
                      {launching === c.campaignId ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Launching…</> : c.channel === "call" ? <><PhoneCall className="w-3.5 h-3.5" /> Place Calls</> : <><Send className="w-3.5 h-3.5" /> Launch</>}
                    </Button>
                  )}
                  {c.status === "launching" && <Badge className="bg-amber-500/15 text-amber-400 gap-1.5 flex items-center"><Loader2 className="w-3 h-3 animate-spin" /> Sending…</Badge>}
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-400 text-xs gap-1" disabled={deleting === c.campaignId} onClick={() => handleDelete(c.campaignId)}>
                    {deleting === c.campaignId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CampaignBuilder channel={channelMeta} open={builderOpen} onClose={() => setBuilderOpen(false)} onLaunched={load} />
    </div>
  );
};

// ─── Generic campaign analytics (Email & Call) ────────────────────────────────

const CampaignAnalyticsPanel = ({ channel }: { channel: CampaignChannel }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    campaignsApi.list(channel).then(setCampaigns).finally(() => setLoading(false));
  }, [channel]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const launched = campaigns.filter((c) => c.status === "launched");
  const totalSent = campaigns.reduce((s, c) => s + (c.sent || 0), 0);
  const totalFailed = campaigns.reduce((s, c) => s + (c.failed || 0), 0);
  const totalRecipients = campaigns.reduce((s, c) => s + (c.contactCount || 0), 0);
  const successRate = totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0;
  const isCall = channel === "call";

  const METRICS = [
    { label: "Total Campaigns", value: String(campaigns.length), icon: <Target className="w-5 h-5" />, color: "text-indigo-400" },
    { label: "Launched", value: String(launched.length), icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-400" },
    { label: isCall ? "Calls Placed" : "Messages Sent", value: String(totalSent), icon: <Send className="w-5 h-5" />, color: "text-emerald-400" },
    { label: isCall ? "Connect Rate" : "Success Rate", value: `${successRate}%`, icon: <TrendingUp className="w-5 h-5" />, color: "text-amber-400" },
  ];

  return (
    <div className="space-y-6 pt-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((m) => (
          <Card key={m.label} className="bg-muted/40 border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${m.color}`}>{m.icon}</div>
              <div><p className="text-lg font-bold text-foreground">{m.value}</p><p className="text-[11px] text-muted-foreground">{m.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/40 border-border">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-400" /> Campaign Performance</h3>
          {launched.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">No launched campaigns yet. Launch one to see performance here.</p>
          ) : (
            <div className="space-y-3">
              {launched.map((c) => {
                const rate = (c.sent + c.failed) > 0 ? Math.round((c.sent / (c.sent + c.failed)) * 100) : 0;
                return (
                  <div key={c.campaignId}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground">{c.name}</span>
                      <span className="text-muted-foreground">{c.sent}/{c.sent + c.failed} · {rate}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/40"><div className="h-2 rounded-full bg-green-500" style={{ width: `${rate}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-4">{totalRecipients} total recipients across all {channel} campaigns · {totalFailed} failed</p>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const CampaignManager = () => {
  const { toast } = useToast();
  const [activeChannel, setActiveChannel] = useState<CampaignChannel>("whatsapp");
  const [activeTab, setActiveTab] = useState<string>("campaigns");
  const [view, setView] = useState<"campaigns" | "leads" | "activity">("campaigns");
  const [allChannels, setAllChannels] = useState<ConnectedChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  const channelMeta = CHANNELS.find((c) => c.id === activeChannel)!;
  const tabs = CHANNEL_TABS[activeChannel];

  // Reset to first tab when switching channel
  useEffect(() => { setActiveTab(tabs[0].id); }, [activeChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch connected channels (for WhatsApp/Telegram panels)
  useEffect(() => {
    const run = async () => {
      try {
        const tid = localStorage.getItem("tenantId") || "";
        const res = await authedFetch(`${API_BASE_URL}/channels/list${tid ? `?tenantId=${tid}` : ""}`);
        if (res.ok) {
          const data = await res.json();
          const list: ConnectedChannel[] = Array.isArray(data) ? data : (data.channels ?? []);
          setAllChannels(list);
        }
      } catch { /* non-fatal */ }
      finally { setChannelsLoading(false); }
    };
    void run();
  }, []);

  const waChannels = allChannels.filter((c) => c.type === "whatsapp");
  const tgChannels = allChannels.filter((c) => c.type === "telegram");

  const renderTab = () => {
    if (activeTab === "campaigns") return <UnifiedCampaignsPanel channelMeta={channelMeta} />;

    if (activeChannel === "whatsapp") {
      switch (activeTab) {
        case "broadcasts": return <WABroadcasts channels={waChannels} />;
        case "templates":  return <WATemplates />;
        case "chatbot":    return <WAChatbot />;
        case "ai-chat":    return <WAAIChat />;
        case "analytics":  return <WAAnalytics channels={waChannels} />;
      }
    }
    if (activeChannel === "telegram") {
      switch (activeTab) {
        case "channels":   return <TGChannels channels={tgChannels} loading={channelsLoading} />;
        case "broadcasts": return <TGBroadcasts channels={tgChannels} />;
        case "commands":   return <TGBotCommands channels={tgChannels} />;
        case "chatbot":    return <TGChatbot />;
        case "ai-chat":    return <TGAIChat />;
        case "analytics":  return <TGAnalytics channels={tgChannels} />;
      }
    }
    if (activeChannel === "email") {
      if (activeTab === "templates") return <EmailTemplatesPanel />;
      if (activeTab === "analytics") return <CampaignAnalyticsPanel channel="email" />;
    }
    if (activeChannel === "call" && activeTab === "analytics") return <CampaignAnalyticsPanel channel="call" />;

    return <UnifiedCampaignsPanel channelMeta={channelMeta} />;
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-purple-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Campaign Manager</h1>
                <p className="text-muted-foreground text-sm">WhatsApp, Telegram, Email & Call — campaigns, broadcasts, templates, bots & analytics in one place</p>
              </div>
            </div>

            {/* Top-level view switcher: Campaigns · Lead Scoring · Activity */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {([["campaigns","Campaigns",<Megaphone className="w-3.5 h-3.5" key="m" />],["leads","Lead Scoring",<Target className="w-3.5 h-3.5" key="t" />],["activity","Activity",<BarChart3 className="w-3.5 h-3.5" key="b" />]] as const).map(([id,label,icon])=>(
                <button key={id} onClick={() => setView(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    view === id ? "bg-indigo-600 text-white border-indigo-600" : "text-muted-foreground border-border hover:text-foreground bg-muted/30"
                  }`}>
                  {icon}{label}
                </button>
              ))}
            </div>

            {view === "campaigns" && (<>
            {/* Channel switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              {CHANNELS.map((c) => (
                <button key={c.id} onClick={() => setActiveChannel(c.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    activeChannel === c.id ? c.activeBg : "text-muted-foreground border-border hover:border-border bg-muted/30"
                  }`}>
                  {c.icon}{c.label}
                </button>
              ))}
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 mt-5 border-b border-border overflow-x-auto">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                    activeTab === t.id ? `${channelMeta.accent} border-current` : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            </>)}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-8 pb-10">
          {view === "campaigns" ? renderTab() : view === "leads" ? <LeadScoringPanel /> : <ActivityPanel />}
        </div>
      </div>
    </AppLayout>
  );
};

export default CampaignManager;
