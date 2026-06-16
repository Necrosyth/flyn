/**
 * WhatsApp CRM Plugin
 *
 * Tabs:
 *  - Broadcasts  : bulk messaging to connected WhatsApp channels
 *  - Templates   : WhatsApp Business message templates
 *  - Analytics   : message stats and engagement metrics
 *
 * Note: Conversations live in the Unified Inbox.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authedFetch } from "@/services/authApi";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Plus,
  Clock, CheckCheck, Send, RefreshCw,
  Megaphone, BarChart3, TrendingUp, Users, FileText,
  Edit3, Trash2, CheckCircle2, Loader2, Wifi, WifiOff,
  Sparkles, Bot, ShoppingCart, Globe, Target,
  Search, Check, ChevronRight, ChevronLeft, Workflow, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { API_BASE_URL } from "@/lib/api";
import { parallelFetch } from "@/lib/apiError";
import { withPlanGate } from "@/components/PlanGate";

const WA_API = `${API_BASE_URL}/channels/whatsapp`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WAComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

interface WATemplate {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "approved" | "pending" | "rejected" | "paused" | "disabled";
  language: string;
  components: WAComponent[];
  rejectedReason?: string | null;
}

interface ConnectedChannel {
  id: string;
  type: string;
  name: string;
  status: "active" | "inactive" | "disconnected" | "error" | "pending";
  tenantId: string;
  externalChannelId?: string;
  createdAt: number;
}

interface BroadcastRecord {
  id: string;
  text: string;
  sent: string;
  recipients: number;
  delivered: number;
  read: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
};

async function getTenantId(): Promise<string> {
  const ls = localStorage.getItem("tenantId");
  if (ls) return ls;
  try {
    const r = await authedFetch(`${API_BASE_URL}/tenants/me`);
    if (r.ok) {
      const d = await r.json() as { id?: string };
      if (d.id) { localStorage.setItem("tenantId", d.id); return d.id; }
    }
  } catch { /* ignore */ }
  return "";
}

// ─── Broadcasts panel ─────────────────────────────────────────────────────────

export const BroadcastsPanel = ({ channels }: { channels: ConnectedChannel[] }) => {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<BroadcastRecord[]>([]);
  const { toast } = useToast();

  const activeChannels = channels.filter((c) => c.status === "active");
  const STATS = [
    { label: "Connected Channels", value: String(activeChannels.length), icon: <Wifi className="w-5 h-5" />, color: "text-green-400" },
    { label: "Messages Sent (30d)", value: history.length > 0 ? String(history.reduce((a, b) => a + b.recipients, 0)) : "—", icon: <Send className="w-5 h-5" />, color: "text-emerald-400" },
    { label: "Delivery Rate", value: history.length > 0 ? `${Math.round(history.reduce((a, b) => a + b.delivered, 0) / Math.max(history.reduce((a, b) => a + b.recipients, 0), 1) * 100)}%` : "—", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-teal-400" },
    { label: "Active Channels", value: `${activeChannels.length} / ${channels.length}`, icon: <Users className="w-5 h-5" />, color: "text-amber-400" },
  ];

  const audienceChannels = audience === "all" ? activeChannels : activeChannels.slice(0, 1);

  const send = async () => {
    if (!text.trim() || audienceChannels.length === 0) return;
    toast({
      variant: "destructive",
      title: "Select recipients first",
      description: "To send a WhatsApp message, go to Phonebook → select contacts → WhatsApp broadcast. WhatsApp requires a recipient phone number.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label} className="bg-muted/40 border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeChannels.length === 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300">No active WhatsApp channels. Connect a channel in <span className="font-semibold">Settings → Channels</span>.</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-green-400" /> New Broadcast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Target Channel</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAudience("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${audience === "all" ? "bg-green-500/20 text-green-300 border-green-500/30" : "text-muted-foreground border-border hover:border-border"}`}
              >
                All Channels ({activeChannels.length})
              </button>
              {activeChannels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setAudience(ch.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${audience === ch.id ? "bg-green-500/20 text-green-300 border-green-500/30" : "text-muted-foreground border-border hover:border-border"}`}
                >
                  {ch.name}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your WhatsApp broadcast message… Use {{name}}, {{date}} for personalization."
            className="bg-muted/40 border-border text-sm min-h-[120px] resize-none"
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={send}
              disabled={!text.trim() || activeChannels.length === 0 || sending}
              className="bg-green-500 hover:bg-green-600 text-white text-sm"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
              {sending ? "Sending…" : "Send Broadcast"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Recent Broadcasts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((b) => (
              <div key={b.id} className="p-3.5 rounded-xl bg-muted/40 border border-white/[0.08] space-y-2">
                <p className="text-sm text-foreground leading-relaxed">{b.text}</p>
                <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Send className="w-3 h-3" /> {b.recipients} sent</span>
                  <span className="flex items-center gap-1"><CheckCheck className="w-3 h-3 text-green-400" /> {b.delivered} delivered</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(b.sent)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Templates panel ──────────────────────────────────────────────────────────

const getBodyText = (components: WAComponent[]): string =>
  components.find((c) => c.type === "BODY")?.text || "";

const getHeaderText = (components: WAComponent[]): string | undefined =>
  components.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text;

const getFooterText = (components: WAComponent[]): string | undefined =>
  components.find((c) => c.type === "FOOTER")?.text;

const getButtons = (components: WAComponent[]) =>
  components.find((c) => c.type === "BUTTONS")?.buttons || [];

const countVars = (text: string) => (text.match(/\{\{(\d+)\}\}/g) || []).length;

export const TemplatesPanel = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WATemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  const categoryColor: Record<WATemplate["category"], string> = {
    MARKETING: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    UTILITY: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    AUTHENTICATION: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  };
  const statusColor: Record<string, string> = {
    approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    rejected: "bg-red-500/15 text-red-400 border-red-500/20",
    paused: "bg-slate-500/15 text-muted-foreground border-slate-500/20",
    disabled: "bg-slate-500/15 text-muted-foreground border-slate-500/20",
  };

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(`${WA_API}/meta-templates`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: r.statusText }));
        throw new Error(err.message);
      }
      const data = await r.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not load templates", description: err.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const deleteTemplate = async (name: string) => {
    setDeleting(name);
    try {
      const r = await authedFetch(`${WA_API}/meta-templates/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data as any).message || r.statusText);
      toast({ title: "Template deleted" });
      setTemplates((prev) => prev.filter((t) => t.name !== name));
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-foreground font-semibold">Message Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Create templates in your Meta WABA account. Approved templates can be used for broadcasts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadTemplates} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => navigate('/plugins/whatsapp-crm/create-template')} className="bg-green-500 hover:bg-green-600 text-white text-sm h-9">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Template
          </Button>
        </div>
      </div>

      {/* ── Template List ── */}
      {loading && <p className="text-sm text-muted-foreground py-6 text-center">Loading templates from Meta…</p>}
      {!loading && templates.length === 0 && (
        <div className="py-10 text-center space-y-2">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No templates yet. Create your first template and it will appear in your Meta WABA account.</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((t) => {
          const bodyText = getBodyText(t.components);
          const headerText = getHeaderText(t.components);
          const footerText = getFooterText(t.components);
          const buttons = getButtons(t.components);
          return (
            <Card key={t.id} className="bg-muted/40 border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div>
                    <p className="font-semibold text-foreground text-sm font-mono">{t.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${categoryColor[t.category]}`}>{t.category}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border capitalize ${statusColor[t.status] ?? statusColor.pending}`}>{t.status}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] text-muted-foreground border border-border">{t.language}</span>
                    </div>
                    {t.rejectedReason && (
                      <p className="text-[10px] text-red-400 mt-1">Rejected: {t.rejectedReason}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-400 flex-shrink-0"
                    onClick={() => deleteTemplate(t.name)}
                    disabled={deleting === t.name}
                  >
                    {deleting === t.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>

                {/* Preview */}
                <div className="bg-muted/40 rounded-lg border border-border overflow-hidden">
                  {headerText && (
                    <div className="px-3 pt-3 pb-1">
                      <p className="text-xs font-semibold text-foreground">{headerText}</p>
                    </div>
                  )}
                  <p className="text-sm text-foreground px-3 py-3 leading-relaxed">{bodyText}</p>
                  {footerText && (
                    <p className="text-[10px] text-muted-foreground px-3 pb-2">{footerText}</p>
                  )}
                  {buttons.length > 0 && (
                    <div className="border-t border-border px-3 py-2 flex flex-wrap gap-1.5">
                      {buttons.map((b, i) => (
                        <span key={i} className="text-[11px] text-green-400 border border-green-500/20 rounded px-2 py-0.5">{b.text}</span>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground mt-2">{countVars(bodyText)} variable{countVars(bodyText) !== 1 ? "s" : ""} in body</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ─── Analytics panel ──────────────────────────────────────────────────────────

export const AnalyticsPanel = ({ channels }: { channels: ConnectedChannel[] }) => {
  const active = channels.filter((c) => c.status === "active");

  const CHANNEL_BREAKDOWN = channels.length > 0
    ? channels.map((ch) => ({
        label: ch.name,
        pct: Math.round(100 / channels.length),
        color: ch.status === "active" ? "bg-green-500" : "bg-slate-600",
      }))
    : [
        { label: "No channels connected", pct: 100, color: "bg-slate-700" },
      ];

  const METRICS = [
    { label: "Connected Channels", value: String(channels.length), change: "", up: true },
    { label: "Active Channels", value: String(active.length), change: "", up: true },
    { label: "Error / Disconnected", value: String(channels.filter((c) => c.status === "error" || c.status === "disconnected").length), change: "", up: false },
    { label: "Pending Setup", value: String(channels.filter((c) => c.status === "pending").length), change: "", up: true },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((m) => (
          <Card key={m.label} className="bg-muted/40 border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
              <p className="text-2xl font-bold text-foreground">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-green-400" /> Channel Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {CHANNEL_BREAKDOWN.map((c) => (
              <div key={c.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground">{c.label}</span>
                  <span className="text-muted-foreground">{c.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted/40">
                  <div className={`h-2 rounded-full ${c.color}`} style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" /> Connected Channels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No WhatsApp channels connected yet.</p>
            ) : channels.map((ch) => (
              <div key={ch.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  WA
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{ch.name}</p>
                  <p className="text-[10px] text-muted-foreground">{ch.externalChannelId || ch.id}</p>
                </div>
                <Badge className={`text-[10px] ${ch.status === "active" ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-slate-500/15 text-muted-foreground border-slate-500/20"}`}>
                  {ch.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ─── Campaigns panel ──────────────────────────────────────────────────────────

interface Campaign {
  campaignId: string;
  name: string;
  status: 'draft' | 'launching' | 'launched';
  type: 'standard' | 'ab_test' | 'workflow';
  messageA: string;
  messageB?: string;
  workflowId?: string;
  audienceType: 'all' | 'group' | 'selected';
  contactCount?: number;
  sent: number;
  failed: number;
  createdAt: number;
  launchedAt?: number;
}

interface WorkflowItem {
  id: string;
  name: string;
  status: 'active' | 'draft';
}

interface PickableContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: 'phonebook' | 'crm';
}

const CAMPAIGN_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-500/15 text-foreground',
  launching: 'bg-amber-500/15 text-amber-400',
  launched: 'bg-green-500/15 text-green-400',
};

const STEPS = ['Details', 'Contacts', 'Message', 'Review'];

// Build a send_whatsapp preset flow from a campaign message
function buildCampaignFlow(campaignName: string, message: string) {
  return {
    nodes: [
      { id: 'n1', type: 'inbox_trigger', name: 'Campaign Trigger', position: { x: 100, y: 150 }, config: { channel: 'whatsapp' } },
      { id: 'n2', type: 'send_whatsapp', name: `Send: ${campaignName}`, position: { x: 380, y: 150 }, config: { message } },
      { id: 'n3', type: 'end', name: 'End', position: { x: 650, y: 150 }, config: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  };
}

// ─── Campaign phone mockup ────────────────────────────────────────────────────

interface CampaignPhoneMockupProps {
  messageA: string;
  messageB?: string;
  contactName: string;
  isABTest: boolean;
}

const CampaignPhoneMockup = ({ messageA, messageB, contactName, isABTest }: CampaignPhoneMockupProps) => {
  const preview = (msg: string) => msg.replace(/\{\{name\}\}/gi, contactName || 'Contact');

  return (
    <div className="flex flex-col items-center select-none">
      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-3 tracking-wider">Live Preview</p>
      {/* Phone shell */}
      <div className="relative w-[220px] bg-[#1a1a1e] rounded-[36px] border-[6px] border-[#2a2a30] shadow-2xl overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-5 bg-[#1a1a1e] rounded-b-xl z-10" />
        {/* Status bar */}
        <div className="bg-[#075E54] px-4 pt-7 pb-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[9px] text-foreground font-bold flex-shrink-0">
            {(contactName || 'C')[0].toUpperCase()}
          </div>
          <div>
            <p className="text-foreground text-[11px] font-semibold leading-tight">{contactName || 'Contact'}</p>
            <p className="text-white/60 text-[9px]">online</p>
          </div>
        </div>
        {/* Chat area */}
        <div className="bg-[#0b141a] min-h-[280px] px-3 py-3 space-y-2 overflow-hidden" style={{ backgroundImage: "radial-gradient(circle, #1a2a20 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
          {isABTest && messageA && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider">Variant A</span>
              <div className="bg-[#005c4b] rounded-[12px] rounded-tr-[3px] px-3 py-2 max-w-[170px]">
                <p className="text-foreground text-[11px] leading-relaxed whitespace-pre-wrap">{preview(messageA)}</p>
                <p className="text-white/40 text-[9px] text-right mt-1">12:00 ✓✓</p>
              </div>
            </div>
          )}
          {isABTest && messageB && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-[8px] text-purple-400 font-bold uppercase tracking-wider">Variant B</span>
              <div className="bg-[#2d5a27] rounded-[12px] rounded-tr-[3px] px-3 py-2 max-w-[170px]">
                <p className="text-foreground text-[11px] leading-relaxed whitespace-pre-wrap">{preview(messageB)}</p>
                <p className="text-white/40 text-[9px] text-right mt-1">12:00 ✓✓</p>
              </div>
            </div>
          )}
          {!isABTest && messageA && (
            <div className="flex justify-end">
              <div className="bg-[#005c4b] rounded-[12px] rounded-tr-[3px] px-3 py-2 max-w-[170px]">
                <p className="text-foreground text-[11px] leading-relaxed whitespace-pre-wrap">{preview(messageA)}</p>
                <p className="text-white/40 text-[9px] text-right mt-1">12:00 ✓✓</p>
              </div>
            </div>
          )}
          {!messageA && (
            <p className="text-muted-foreground text-[11px] text-center pt-10 italic">Type a message to preview…</p>
          )}
        </div>
        {/* Input bar */}
        <div className="bg-[#1f2c34] px-3 py-2 flex items-center gap-2">
          <div className="flex-1 bg-[#2a3942] rounded-full h-7" />
          <div className="w-7 h-7 rounded-full bg-[#00a884] flex items-center justify-center">
            <Send className="w-3 h-3 text-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Campaigns panel ──────────────────────────────────────────────────────────

const CampaignsPanel = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // multi-step builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<'standard' | 'ab_test' | 'workflow'>('standard');
  const [draftMessageA, setDraftMessageA] = useState('');
  const [draftMessageB, setDraftMessageB] = useState('');
  const [draftWorkflowId, setDraftWorkflowId] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<PickableContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [allContacts, setAllContacts] = useState<PickableContact[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${WA_API}/campaigns`);
      if (res.ok) {
        const d = await res.json();
        setCampaigns(d.campaigns || []);
      }

      const wRes = await authedFetch(`${API_BASE_URL}/automations`);
      if (wRes.ok) {
        const wd = await wRes.json();
        setWorkflows(wd.workflows || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load contacts when step 2 opens
  useEffect(() => {
    if (step !== 1 || !builderOpen) return;
    setContactsLoading(true);
    Promise.all([
      authedFetch(`${API_BASE_URL}/phonebook/contacts?limit=200`).then(r => r.ok ? r.json() : []),
      authedFetch(`${API_BASE_URL}/crm/contacts?limit=200`).then(r => r.ok ? r.json() : { data: [] }),
    ]).then(([pb, crm]) => {
      const pbList = Array.isArray(pb) ? pb : (pb.contacts || []);
      const crmList = Array.isArray(crm) ? crm : (crm.data || crm.contacts || []);

      const phonebookContacts: PickableContact[] = pbList.map((c: any) => ({
        id: c.id || c.contactId,
        name: c.name || c.firstName || 'Unknown',
        phone: c.phone || c.phoneNumber || '',
        email: c.email,
        source: 'phonebook' as const,
      })).filter((c: PickableContact) => c.phone);

      const crmContacts: PickableContact[] = crmList.map((c: any) => ({
        id: c.id || c.contactId,
        name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        phone: c.phone || c.phoneNumber || '',
        email: c.email,
        source: 'crm' as const,
      })).filter((c: PickableContact) => c.phone);
      // deduplicate by phone
      const seen = new Set<string>();
      const merged = [...phonebookContacts, ...crmContacts].filter(c => {
        if (seen.has(c.phone)) return false;
        seen.add(c.phone);
        return true;
      });
      setAllContacts(merged);
    }).finally(() => setContactsLoading(false));
  }, [step, builderOpen]);

  const openBuilder = () => {
    setDraftName(''); setDraftType('standard'); setDraftMessageA(''); setDraftMessageB('');
    setDraftWorkflowId(''); setSelectedContacts([]); setContactSearch(''); setStep(0);
    setBuilderOpen(true);
  };

  const toggleContact = (c: PickableContact) => {
    setSelectedContacts(prev =>
      prev.find(p => p.id === c.id && p.source === c.source)
        ? prev.filter(p => !(p.id === c.id && p.source === c.source))
        : [...prev, c]
    );
  };

  const isSelected = (c: PickableContact) => !!selectedContacts.find(p => p.id === c.id && p.source === c.source);

  const filteredContacts = allContacts.filter(c =>
    !contactSearch || c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone.includes(contactSearch)
  );

  const canNext = () => {
    if (step === 0) return draftName.trim().length > 0;
    if (step === 1) return selectedContacts.length > 0;
    if (step === 2) {
      if (draftType === 'workflow') return draftWorkflowId.length > 0;
      return draftMessageA.trim().length > 0;
    }
    return true;
  };

  const handleCreateAndLaunch = async () => {
    setCreating(true);
    try {
      const payload = {
        name: draftName,
        messageA: draftType === 'workflow' ? '' : draftMessageA,
        messageB: (draftType === 'ab_test' && draftMessageB) ? draftMessageB : undefined,
        workflowId: draftType === 'workflow' ? draftWorkflowId : undefined,
        audienceType: 'selected',
        selectedContacts: selectedContacts.map(c => ({ id: c.id, name: c.name, phone: c.phone, source: c.source })),
      };

      const createRes = await authedFetch(`${WA_API}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const created = await createRes.json();
      if (!createRes.ok || !created.success) {
        toast({
          variant: 'destructive',
          title: 'Failed to create campaign',
          description: created.message || created.error || 'Server error'
        });
        return;
      }

      const launchRes = await authedFetch(`${WA_API}/campaigns/${created.campaignId}/launch`, { method: 'POST' });
      const launched = await launchRes.json();

      if (launchRes.ok && launched.success) {
        toast({
          title: 'Campaign launched!',
          description: `Successfully processed ${launched.sent} contacts${launched.failed > 0 ? `, ${launched.failed} failed` : ''}.`
        });
        setBuilderOpen(false);
        load();
      } else {
        toast({
          variant: 'destructive',
          title: 'Launch failed',
          description: launched.message || launched.error || 'The campaign was created but could not be launched. You can try launching it manually from the list.'
        });
        setBuilderOpen(false);
        load();
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'An unexpected error occurred'
      });
    } finally {
      setCreating(false);
    }
  };

  const handleOpenInBuilder = async () => {
    const preset = buildCampaignFlow(draftName, draftMessageA);
    setBuilderOpen(false);
    navigate('/automations', { state: { presetFlow: preset } });
  };

  const handleLaunch = async (campaignId: string) => {
    setLaunching(campaignId);
    try {
      const res = await authedFetch(`${WA_API}/campaigns/${campaignId}/launch`, { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        toast({ title: 'Campaign launched!', description: `Sent to ${d.sent} contacts${d.failed > 0 ? `, ${d.failed} failed` : ''}.` });
        load();
      } else {
        toast({ variant: 'destructive', title: 'Launch failed', description: d.error || d.message });
      }
    } finally {
      setLaunching(null);
    }
  };

  const handleDelete = async (campaignId: string) => {
    setDeleting(campaignId);
    try {
      await authedFetch(`${WA_API}/campaigns/${campaignId}`, { method: 'DELETE' });
      setCampaigns(prev => prev.filter(c => c.campaignId !== campaignId));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Campaign Engine</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Visual builder — pick contacts from CRM or Phonebook, compose your message, then launch or automate</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-indigo-500/15 text-indigo-400 border-indigo-500/20 text-xs">A/B Testing</Badge>
          <Button size="sm" className="bg-green-600 hover:bg-green-500 text-white gap-1.5" onClick={openBuilder}>
            <Plus className="w-3.5 h-3.5" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Multi-step Campaign Builder Dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className={`bg-card border-border text-foreground max-h-[85vh] flex flex-col transition-all ${step === 2 && draftType !== 'workflow' ? 'max-w-4xl' : 'max-w-2xl'}`}>
          <DialogHeader className="pb-0">
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-green-400" /> New Campaign
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1 mt-4">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    i < step ? 'bg-green-500 text-white' : i === step ? 'bg-indigo-500 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {i < step ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <span className={`text-xs ${i === step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{s}</span>
                  {i < STEPS.length - 1 && <div className="w-6 h-px bg-muted mx-1" />}
                </div>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
            {/* Step 0: Details */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Campaign Name *</Label>
                  <Input
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    placeholder="e.g. Spring Offer 2026"
                    className="bg-muted/40 border-border text-foreground text-sm"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Campaign Type</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['standard', 'ab_test', 'workflow'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setDraftType(t)}
                        className={`p-3 rounded-xl border text-left transition-colors ${draftType === t ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-border bg-muted/30 hover:border-border'}`}
                      >
                        <p className="text-sm font-medium text-foreground">
                          {t === 'standard' ? 'Standard' : t === 'ab_test' ? 'A/B Test' : 'Workflow'}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t === 'standard' ? 'One message' : t === 'ab_test' ? 'Two variants' : 'Trigger flow'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Contacts */}
            {step === 1 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Select contacts from Phonebook or CRM</p>
                  <Badge className="bg-indigo-500/15 text-indigo-400 text-xs">{selectedContacts.length} selected</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder="Search by name or phone…"
                    className="pl-9 bg-muted/40 border-border text-foreground text-sm h-9"
                  />
                </div>
                {contactsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {filteredContacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No contacts found</p>
                    ) : filteredContacts.map(c => {
                      const sel = isSelected(c);
                      return (
                        <button
                          key={`${c.source}-${c.id}`}
                          onClick={() => toggleContact(c)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${sel ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/30 hover:border-white/15'}`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${sel ? 'bg-green-500 border-green-500' : 'border-border'}`}>
                            {sel && <Check className="w-3 h-3 text-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground font-medium truncate">{c.name}</p>
                            <p className="text-[11px] text-muted-foreground">{c.phone}</p>
                          </div>
                          <Badge className={`text-[10px] shrink-0 ${c.source === 'crm' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            {c.source}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedContacts.length > 0 && (
                  <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/15 text-xs text-green-400">
                    {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''} selected
                    {' · '}{selectedContacts.filter(c => c.source === 'phonebook').length} from phonebook
                    {' · '}{selectedContacts.filter(c => c.source === 'crm').length} from CRM
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Message */}
            {step === 2 && (
              <div className="space-y-4">
                {draftType === 'workflow' ? (
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Select Workflow to Trigger</Label>
                    <Select value={draftWorkflowId} onValueChange={setDraftWorkflowId}>
                      <SelectTrigger className="bg-muted/40 border-border text-foreground">
                        <SelectValue placeholder="Select a workflow..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        {workflows.filter(w => w.status === 'active').length === 0 ? (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            No active workflows found. Go to Automations to create and activate one.
                          </div>
                        ) : workflows.filter(w => w.status === 'active').map(w => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground italic">
                      This campaign will trigger the selected workflow for each contact. Make sure the workflow has a "Campaign Trigger" node or starts with a generic trigger.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-6">
                    {/* Left: message inputs */}
                    <div className="flex-1 space-y-4 min-w-0">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Message A * <span className="text-muted-foreground">— use {'{{name}}'} for personalisation</span></Label>
                        <Textarea
                          value={draftMessageA}
                          onChange={e => setDraftMessageA(e.target.value)}
                          placeholder="Hi {{name}}, we have a special offer just for you…"
                          className="bg-muted/40 border-border text-foreground text-sm min-h-[120px] resize-none"
                          autoFocus
                        />
                        <p className="text-[11px] text-muted-foreground">{draftMessageA.length} characters</p>
                      </div>
                      {draftType === 'ab_test' && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Message B <span className="text-muted-foreground">— A/B test variant</span></Label>
                          <Textarea
                            value={draftMessageB}
                            onChange={e => setDraftMessageB(e.target.value)}
                            placeholder="Alternative version of the message…"
                            className="bg-muted/40 border-border text-foreground text-sm min-h-[80px] resize-none"
                          />
                        </div>
                      )}
                    </div>
                    {/* Right: iPhone mockup */}
                    <div className="flex-shrink-0">
                      <CampaignPhoneMockup
                        messageA={draftMessageA}
                        messageB={draftMessageB}
                        contactName={selectedContacts[0]?.name || 'Contact'}
                        isABTest={draftType === 'ab_test'}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-muted/40 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Campaign</p>
                    <p className="text-sm font-bold text-foreground">{draftName}</p>
                    <Badge className="mt-1 text-[10px] bg-indigo-500/15 text-indigo-400">
                      {draftType === 'ab_test' ? 'A/B Test' : draftType === 'workflow' ? 'Workflow' : 'Standard'}
                    </Badge>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Recipients</p>
                    <p className="text-2xl font-bold text-foreground">{selectedContacts.length}</p>
                    <p className="text-[11px] text-muted-foreground">{selectedContacts.filter(c => c.source === 'phonebook').length} phonebook · {selectedContacts.filter(c => c.source === 'crm').length} CRM</p>
                  </div>
                </div>

                {draftType === 'workflow' ? (
                  <div className="p-3 rounded-xl bg-muted/40 border border-white/[0.08]">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Selected Workflow</p>
                    <div className="flex items-center gap-2">
                      <Workflow className="w-4 h-4 text-indigo-400" />
                      <p className="text-sm font-medium text-foreground">
                        {workflows.find(w => w.id === draftWorkflowId)?.name || 'Unknown Workflow'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-muted/40 border border-white/[0.08]">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Message A</p>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{draftMessageA}</p>
                    </div>
                    {draftMessageB && (
                      <div className="p-3 rounded-xl bg-muted/40 border border-white/[0.08]">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Message B</p>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{draftMessageB}</p>
                      </div>
                    )}
                  </>
                )}

                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                  <p className="text-xs text-indigo-300">
                    <strong>Tip:</strong> {draftType === 'workflow' 
                      ? "This campaign will trigger a complex automation. Ensure your workflow handles the 'Campaign' trigger source."
                      : "Use 'Open in Workflow Builder' to add conditions, delays, or branching logic before sending."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-border flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} className="text-muted-foreground gap-1">
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step === 3 ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
                    onClick={handleOpenInBuilder}
                  >
                    <Workflow className="w-3.5 h-3.5" /> Open in Workflow Builder
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-500 text-white gap-1.5"
                    onClick={handleCreateAndLaunch}
                    disabled={creating}
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {creating ? 'Launching…' : 'Launch Now'}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
                  disabled={!canNext()}
                  onClick={() => setStep(s => s + 1)}
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {campaigns.length === 0 ? (
        <Card className="bg-muted/30 border-border">
          <CardContent className="p-10 text-center text-muted-foreground">
            <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No campaigns yet.</p>
            <p className="text-xs mt-1">Create your first campaign — pick contacts from CRM or Phonebook and send via WhatsApp.</p>
            <Button size="sm" className="mt-4 bg-green-600 hover:bg-green-500 text-white gap-1.5" onClick={openBuilder}>
              <Plus className="w-3.5 h-3.5" /> Create Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => (
            <Card key={c.campaignId} className="bg-muted/40 border-border hover:border-green-500/20 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">{c.name}</h3>
                      {c.type === 'ab_test' && <Badge className="bg-indigo-500/15 text-indigo-400 text-[10px]">A/B Test</Badge>}
                      {c.type === 'workflow' && <Badge className="bg-purple-500/15 text-purple-400 text-[10px]">Workflow</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {new Date(c.createdAt).toLocaleDateString()}
                      {c.launchedAt ? ` · Launched ${new Date(c.launchedAt).toLocaleDateString()}` : ''}
                      {c.contactCount ? ` · ${c.contactCount} recipients` : ''}
                    </p>
                  </div>
                  <Badge className={CAMPAIGN_STATUS_STYLE[c.status] || 'bg-slate-500/15 text-muted-foreground'}>{c.status}</Badge>
                </div>

                {c.type === 'workflow' ? (
                  <div className="flex items-center gap-2 mb-3 bg-muted/40 rounded-lg px-3 py-2 border border-border">
                    <Workflow className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs text-foreground">
                      Workflow: {workflows.find(w => w.id === c.workflowId)?.name || c.workflowId || 'Unknown'}
                    </span>
                  </div>
                ) : (
                  <>
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
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-lg font-bold text-foreground">{c.sent}</p>
                    <p className="text-[10px] text-muted-foreground">Sent</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-lg font-bold text-red-400">{c.failed}</p>
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-lg font-bold text-muted-foreground text-sm">{c.audienceType === 'selected' ? `${c.contactCount ?? '—'}` : c.audienceType === 'all' ? 'All' : 'Group'}</p>
                    <p className="text-[10px] text-muted-foreground">Audience</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  {c.status === 'draft' && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-indigo-400 hover:text-indigo-300 text-xs gap-1.5"
                        onClick={() => navigate('/automations', { state: { presetFlow: buildCampaignFlow(c.name, c.messageA) } })}
                      >
                        <Workflow className="w-3.5 h-3.5" /> Automate
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-500 text-white text-xs gap-1.5"
                        disabled={launching === c.campaignId}
                        onClick={() => handleLaunch(c.campaignId)}
                      >
                        {launching === c.campaignId
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Launching…</>
                          : <><Send className="w-3.5 h-3.5" /> Launch</>}
                      </Button>
                    </>
                  )}
                  {c.status === 'launching' && (
                    <Badge className="bg-amber-500/15 text-amber-400 gap-1.5 flex items-center">
                      <Loader2 className="w-3 h-3 animate-spin" /> Sending…
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-red-400 text-xs gap-1"
                    disabled={deleting === c.campaignId}
                    onClick={() => handleDelete(c.campaignId)}
                  >
                    {deleting === c.campaignId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Preset WhatsApp chatbot flow definitions ─────────────────────────────────

const WA_PRESET_FLOWS = [
  {
    id: 'wa-appt-booking',
    name: 'Appointment Booking Bot',
    description: 'Detects booking intent, asks for preferred date/time, and confirms via WhatsApp.',
    icon: '📅',
    nodes: [
      { id: 'n1', type: 'inbox_trigger', name: 'WhatsApp Message Received', position: { x: 100, y: 100 }, config: { channel: 'whatsapp' } },
      { id: 'n2', type: 'ai_decision', name: 'Booking Intent?', position: { x: 350, y: 100 }, config: { prompt: 'Does the message contain an appointment or booking request?', trueLabel: 'Yes', falseLabel: 'No' } },
      { id: 'n3', type: 'send_whatsapp', name: 'Ask for Date & Time', position: { x: 600, y: 20 }, config: { message: 'Great! When would you like to book? Please share your preferred date and time.' } },
      { id: 'n4', type: 'send_whatsapp', name: 'General Reply', position: { x: 600, y: 200 }, config: { message: 'Hello! How can I help you today?' } },
      { id: 'n5', type: 'end', name: 'End', position: { x: 850, y: 20 }, config: {} },
      { id: 'n6', type: 'end', name: 'End', position: { x: 850, y: 200 }, config: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'true' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'false' },
      { id: 'e4', source: 'n3', target: 'n5' },
      { id: 'e5', source: 'n4', target: 'n6' },
    ],
  },
  {
    id: 'wa-support-triage',
    name: 'Support Triage Bot',
    description: 'Classifies incoming messages and routes to the right response or escalation.',
    icon: '🎯',
    nodes: [
      { id: 'n1', type: 'inbox_trigger', name: 'WhatsApp Message Received', position: { x: 100, y: 150 }, config: { channel: 'whatsapp' } },
      { id: 'n2', type: 'ai_decision', name: 'Needs Escalation?', position: { x: 350, y: 150 }, config: { prompt: 'Does this message require human escalation or is it a complaint?', trueLabel: 'Escalate', falseLabel: 'Auto-reply' } },
      { id: 'n3', type: 'send_whatsapp', name: 'Escalation Notice', position: { x: 600, y: 60 }, config: { message: 'We\'re connecting you with our support team. Please hold.' } },
      { id: 'n4', type: 'send_whatsapp', name: 'Auto-reply', position: { x: 600, y: 240 }, config: { message: 'Thanks for reaching out! Here\'s what I found for you: {{ai_response}}' } },
      { id: 'n5', type: 'end', name: 'End', position: { x: 850, y: 60 }, config: {} },
      { id: 'n6', type: 'end', name: 'End', position: { x: 850, y: 240 }, config: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'true' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'false' },
      { id: 'e4', source: 'n3', target: 'n5' },
      { id: 'e5', source: 'n4', target: 'n6' },
    ],
  },
  {
    id: 'wa-broadcast-reply',
    name: 'Broadcast Reply Handler',
    description: 'Handles replies to broadcast campaigns and logs customer responses.',
    icon: '📢',
    nodes: [
      { id: 'n1', type: 'inbox_trigger', name: 'WhatsApp Reply Received', position: { x: 100, y: 150 }, config: { channel: 'whatsapp', event: 'reply' } },
      { id: 'n2', type: 'send_whatsapp', name: 'Acknowledge Reply', position: { x: 380, y: 150 }, config: { message: 'Thank you for your response! Our team will follow up shortly.' } },
      { id: 'n3', type: 'end', name: 'End', position: { x: 650, y: 150 }, config: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  },
];

// ─── Chatbot Flows panel ──────────────────────────────────────────────────────

export const ChatbotFlowsPanel = () => {
  const navigate = useNavigate();

  const openInBuilder = (flow: typeof WA_PRESET_FLOWS[number]) => {
    navigate('/automations', {
      state: { presetFlow: { nodes: flow.nodes, edges: flow.edges } },
    });
  };

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Chatbot Flow Templates</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Select a template to open it in the Workflow Builder</p>
        </div>
        <Badge className="bg-indigo-500/15 text-indigo-400 border-indigo-500/20 text-xs">{WA_PRESET_FLOWS.length} Templates</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {WA_PRESET_FLOWS.map((flow) => (
          <Card key={flow.id} className="bg-muted/40 border-border hover:border-indigo-500/30 transition-colors">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{flow.icon}</span>
                  <h3 className="text-sm font-bold text-foreground leading-tight">{flow.name}</h3>
                </div>
                <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-[10px] shrink-0">WhatsApp</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{flow.description}</p>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>🔗 {flow.nodes.length} nodes</span>
                <span>⚡ WA trigger</span>
              </div>
              <Button
                size="sm"
                className="w-full mt-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5"
                onClick={() => openInBuilder(flow)}
              >
                <Bot className="w-3.5 h-3.5" />
                Open in Workflow Builder
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── AI Chat panel (PDF 6 §2) ────────────────────────────────────────────────

export const AIChatPanel = () => {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [intents, setIntents] = useState<any[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    // Load intents
    authedFetch(`${WA_API}/ai/intents`)
      .then(r => r.ok ? r.json() : null)
      .then(intentData => {
        if (intentData?.intents) setIntents(intentData.intents);
      })
      .catch(() => {});

    // Load AI settings
    authedFetch(`${WA_API}/settings`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setAiEnabled(data.aiAutoReply);
      })
      .finally(() => setSettingsLoading(false));
  }, []);

  const toggleAi = async () => {
    const newVal = !aiEnabled;
    setAiEnabled(newVal);
    try {
      await authedFetch(`${WA_API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiAutoReply: newVal }),
      });
    } catch {
      setAiEnabled(!newVal);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setReply(null);
    try {
      const res = await authedFetch(`${WA_API}/ai/auto-reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, senderId: 'demo_user' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'AI generation failed');
      setReply(data);
    } catch (err: any) {
      alert(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">AI Chat Engine</h2>
        <Card className="bg-indigo-500/5 border-indigo-500/20">
          <CardContent className="p-3 py-2 flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-indigo-400">Status</span>
              <span className="text-xs text-foreground font-medium">{aiEnabled ? 'AI Active' : 'AI Paused'}</span>
            </div>
            <Button
              size="sm"
              variant={aiEnabled ? "default" : "outline"}
              className={`h-8 text-[11px] gap-1.5 ${aiEnabled ? 'bg-indigo-600 hover:bg-indigo-500' : 'border-indigo-500/30 text-indigo-400'}`}
              disabled={settingsLoading}
              onClick={toggleAi}
            >
              {aiEnabled ? <Bot className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5 opacity-50" />}
              {aiEnabled ? 'Disable Auto-Reply' : 'Enable Auto-Reply'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Card className="bg-muted/40 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-green-400" /> Chat Simulation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="text-xs text-muted-foreground">Test AI Recognition & Auto-Reply</Label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Type a customer message to test how AI would respond..."
                className="bg-muted/40 border-border text-foreground min-h-[100px] text-sm"
              />
              <Button onClick={handleSend} disabled={loading} className="bg-gradient-to-r from-green-500 to-emerald-600 text-white w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Generate Test Reply
              </Button>
            </CardContent>
          </Card>
          
          {reply && (
            <Card className="bg-green-500/5 border-green-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-green-500/15 text-green-400 border-green-500/20">Intent: {reply.intent}</Badge>
                  <span className="text-xs text-muted-foreground font-mono">{(reply.confidence * 100).toFixed(1)}% match</span>
                </div>
                <div className="bg-muted/40 rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-2">AI Drafted Reply</p>
                  <p className="text-sm text-foreground leading-relaxed italic">"{reply.aiReply}"</p>
                </div>
                {reply.shouldEscalate && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <span className="text-amber-500">⚠️</span>
                    <p className="text-xs text-amber-400 leading-tight"><strong>Agent Escalation Recommended:</strong> {reply.escalationReason}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {(reply.suggestedQuickReplies || []).map((qr: string) => (
                    <Badge key={qr} className="bg-muted text-foreground border-border px-2 py-0.5 text-[10px] cursor-help">
                      Suggest: {qr}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="bg-muted/40 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Knowledge & Intent Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">The AI recognizes these intents from customer messages and can automatically trigger replies or workflows.</p>
              <div className="space-y-1.5">
                {intents.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bot className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs text-muted-foreground italic">No intents defined.</p>
                  </div>
                ) : intents.map(intent => (
                  <div key={intent.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border group hover:border-border transition-colors">
                    <div className="flex flex-col">
                      <span className="text-xs text-foreground font-medium capitalize">{(intent.name || intent.id).replace('_', ' ')}</span>
                      <span className="text-[10px] text-muted-foreground">Trigger: {intent.examplesCount || 5} training phrases</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {intent.autoReply && <Badge className="bg-indigo-500/15 text-indigo-400 text-[9px] border-indigo-500/10">auto-reply</Badge>}
                      {intent.workflowId && <Workflow className="w-3 h-3 text-purple-400" />}
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs border-border text-muted-foreground hover:text-foreground mt-2">
                Manage Intent Training Data
              </Button>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-foreground">84%</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Auto-resolved</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-foreground">1.2s</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Avg. AI Response</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "broadcasts" | "templates" | "analytics" | "campaigns" | "chatbot" | "ai-chat";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "broadcasts", label: "Broadcasts", icon: <Megaphone className="w-4 h-4" /> },
  { id: "campaigns", label: "Campaigns", icon: <Target className="w-4 h-4" /> },
  { id: "chatbot", label: "Chatbot Flows", icon: <Bot className="w-4 h-4" /> },
  { id: "ai-chat", label: "AI Chat", icon: <Sparkles className="w-4 h-4" /> },
  { id: "templates", label: "Templates", icon: <FileText className="w-4 h-4" /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
];

const WhatsAppCRM = () => {
  const [tab, setTab] = useState<Tab>("broadcasts");
  const [channels, setChannels] = useState<ConnectedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchChannels = useCallback(async () => {
    try {
      const tenantId = await getTenantId();
      if (!tenantId) { setLoading(false); return; }
      const res = await authedFetch(`${API_BASE_URL}/channels/list?tenantId=${tenantId}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { channels?: ConnectedChannel[] } | ConnectedChannel[];
      const list: ConnectedChannel[] = Array.isArray(data) ? data : (data.channels ?? []);
      setChannels(list.filter((c) => c.type === "whatsapp"));
    } catch {
      toast({ variant: "destructive", title: "Could not load channels", description: "Check your connection." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchChannels(); }, [fetchChannels]);

  const refresh = async () => {
    setRefreshing(true);
    await fetchChannels();
    setRefreshing(false);
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-600/10 via-emerald-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/20">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">WhatsApp CRM</h1>
                    {loading ? (
                      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                    ) : (
                      <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-[10px]">
                        {channels.filter((c) => c.status === "active").length} active
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">Broadcasts, templates & analytics — conversations in Unified Inbox</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={refresh}
                disabled={refreshing || loading}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mt-6 border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    tab === t.id
                      ? "text-green-400 border-green-400"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="px-8 pb-10">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : (
            <>
              {tab === "broadcasts" && <BroadcastsPanel channels={channels} />}
              {tab === "templates" && <TemplatesPanel />}
              {tab === "analytics" && <AnalyticsPanel channels={channels} />}
              {tab === "campaigns" && <CampaignsPanel />}
              {tab === "chatbot" && <ChatbotFlowsPanel />}
              {tab === "ai-chat" && <AIChatPanel />}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("channels.whatsapp")(WhatsAppCRM);
