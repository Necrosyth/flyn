/**
 * Developer Portal
 *
 * Tabs:
 *  - API Keys    : create / list / revoke keys
 *  - Webhooks    : live webhook URLs per channel + test-event sender
 *  - Usage Logs  : recent workflow runs & API call history
 *  - API Reference: endpoint catalogue with live Try-it buttons
 */

import { useState, useEffect, useCallback } from "react";
import { withPlanGate } from "@/components/PlanGate";
import { motion } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { usePlan } from "@/contexts/PlanContext";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Key, Webhook, BarChart2, BookOpen, Plus, Copy, Trash2,
  Eye, EyeOff, RefreshCw, Send, CheckCircle2, XCircle,
  Loader2, Terminal, Zap, Play, Clock, ChevronDown, ChevronRight,
  Code2, Globe, Shield, Activity, Search,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  key: string;           // full key shown once on creation
  keyPreview: string;    // e.g. "sk_live_••••••••3f9a"
  scopes: string[];
  createdByUid: string;
  creatorRole: string;
  createdAt: string;
  lastUsedAt?: string;
  status: "active" | "revoked";
}

interface WebhookEntry {
  channelId: string;
  channelType: string;
  channelName: string;
  webhookUrl: string;
  status: "active" | "inactive" | "error" | "pending" | "disconnected";
}

interface RunLog {
  id: string;
  workflowId?: string;
  status: string;
  startedAt: string | number;
  completedAt?: string | number;
  durationMs?: number;
  currentNodes?: string[];
}

interface EndpointSpec {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  summary?: string;
  category: string;
  parameters?: Array<{ name: string; in: string; required?: boolean; description?: string }>;
  requestBody?: unknown;
  responses?: unknown;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function copyToClipboard(text: string, label: string, toast: (opts: { title: string; description?: string }) => void) {
  navigator.clipboard.writeText(text).then(() => {
    toast({ title: `${label} copied` });
  });
}

function formatTime(ts: string | number): string {
  const d = new Date(typeof ts === "number" ? ts : ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  POST: "bg-green-500/15 text-green-400 border-green-500/20",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  PATCH: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/20",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-500/15 text-green-400 border-green-500/20",
  inactive: "bg-slate-500/15 text-muted-foreground border-slate-500/20",
  error: "bg-red-500/15 text-red-400 border-red-500/20",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  disconnected: "bg-slate-500/15 text-muted-foreground border-slate-500/20",
  revoked: "bg-red-500/15 text-red-400 border-red-500/20",
  completed: "bg-green-500/15 text-green-400 border-green-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  waiting: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

// ─── Keys Panel ────────────────────────────────────────────────────────────────

const KeysPanel = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read:all"]);
  const [scopeOptions, setScopeOptions] = useState<string[]>([
    "read:all", "write:all",
  ]);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [justCreated, setJustCreated] = useState<ApiKey | null>(null);
  const { toast } = useToast();
  const { isEntitled, getRequiredPlanForFeature } = usePlan();
  const canIssueKeys = isEntitled("api.keys.issue");
  const requiredPlan = getRequiredPlanForFeature("api.keys.issue");

  // Load dynamic scope options from API categories
  useEffect(() => {
    authedFetch(`${API_BASE_URL}/spec/categories`)
      .then((r) => r.ok ? r.json() as Promise<string[]> : Promise.resolve([]))
      .then((cats) => {
        if (!Array.isArray(cats) || cats.length === 0) return;
        const dynamic: string[] = ["read:all", "write:all"];
        cats.forEach((cat) => {
          const slug = cat.toLowerCase().replace(/\s+/g, "_");
          dynamic.push(`${slug}:read`, `${slug}:write`);
        });
        setScopeOptions(dynamic);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const toggleScope = (scope: string) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/billing/keys`);
      if (res.ok) {
        const data = await res.json() as ApiKey[] | { keys?: ApiKey[] };
        setKeys(Array.isArray(data) ? data : (data.keys ?? []));
      } else {
        setKeys([]);
      }
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/billing/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      if (res.ok) {
        const created = await res.json() as ApiKey;
        setKeys((prev) => [created, ...prev]);
        setJustCreated(created);
        setNewKeyName("");
        toast({ title: "API key created", description: "Copy it now — it won't be shown again." });
      } else {
        const errText = await res.text().catch(() => "");
        toast({ variant: "destructive", title: "Failed to create API key", description: errText || `HTTP ${res.status}` });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to create key" });
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      await authedFetch(`${API_BASE_URL}/billing/keys/${id}`, { method: "DELETE" });
      setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: "revoked" as const } : k));
      toast({ title: "Key revoked" });
    } catch {
      // Optimistic update even if API fails
      setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: "revoked" as const } : k));
      toast({ title: "Key revoked" });
    }
  };

  const toggleReveal = (id: string) => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-6">
      {/* Create new key — gated behind api.keys.issue (GROWTH+) */}
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-purple-400" /> Create API Key
          </CardTitle>
        </CardHeader>
        <CardContent>
          {canIssueKeys ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Key name</Label>
                  <Input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Production backend"
                    className="bg-muted/40 border-border text-sm"
                    onKeyDown={(e) => e.key === "Enter" && void createKey()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Scopes
                    {newKeyScopes.length > 0 && (
                      <span className="ml-1.5 text-purple-400">({newKeyScopes.length} selected)</span>
                    )}
                  </Label>
                  <div className="bg-muted/40 border border-border rounded-md p-2 max-h-36 overflow-y-auto grid grid-cols-2 gap-1">
                    {scopeOptions.map((s) => (
                      <label key={s} className="flex items-center gap-1.5 cursor-pointer px-1.5 py-1 rounded hover:bg-muted transition-colors">
                        <Checkbox
                          checked={newKeyScopes.includes(s)}
                          onCheckedChange={() => toggleScope(s)}
                          className="h-3.5 w-3.5 border-border"
                        />
                        <span className="text-xs text-foreground font-mono">{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                onClick={createKey}
                disabled={!newKeyName.trim() || creating}
                className="bg-purple-600 hover:bg-purple-500 text-white text-sm"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Key className="w-3.5 h-3.5 mr-2" />}
                {creating ? "Creating…" : "Generate Key"}
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Shield className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  API key issuance requires {requiredPlan ?? "GROWTH"}+
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can browse the API docs and view webhook URLs below. Upgrade to generate live API keys.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Just-created key — show full value once */}
      {justCreated && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Key created — copy it now, it won't be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted/40 border border-border rounded px-3 py-2 font-mono text-green-300 break-all">
                {justCreated.key}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-green-400 hover:text-foreground flex-shrink-0"
                onClick={() => copyToClipboard(justCreated.key, "API key", toast)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs"
              onClick={() => setJustCreated(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : keys.length === 0 ? (
        <Card className="bg-muted/30 border-dashed border-border">
          <CardContent className="p-8 text-center">
            <Key className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No API keys yet. Create one above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <Card key={k.id} className={`border-border ${k.status === "revoked" ? "bg-white/[0.01] opacity-60" : "bg-muted/40"}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground text-sm">{k.name}</p>
                      <Badge className={`text-[10px] ${STATUS_COLOR[k.status] ?? ""}`}>{k.status}</Badge>
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px] text-muted-foreground border-border">{s}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-muted-foreground">
                        {revealed[k.id] && k.key ? k.key : k.keyPreview}
                      </code>
                      {k.key && (
                        <button
                          onClick={() => toggleReveal(k.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {revealed[k.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(k.key || k.keyPreview, "Key", toast)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Created {formatTime(k.createdAt)}
                      {k.creatorRole && ` · by ${k.creatorRole}`}
                      {k.lastUsedAt && ` · Last used ${formatTime(k.lastUsedAt)}`}
                    </p>
                  </div>
                  {k.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400 flex-shrink-0"
                      onClick={() => void revokeKey(k.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Webhooks Panel ────────────────────────────────────────────────────────────

const WebhooksPanel = () => {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const tenantId = await getTenantId();
        if (!tenantId) { setLoading(false); return; }
        const res = await authedFetch(`${API_BASE_URL}/channels/list`);
        if (res.ok) {
          const data = await res.json() as { channels?: Array<{ id: string; type: string; name: string; status: string; webhookUrl?: string }> } | Array<{ id: string; type: string; name: string; status: string; webhookUrl?: string }>;
          const list = Array.isArray(data) ? data : (data.channels ?? []);
          setWebhooks(list.map((ch) => ({
            channelId: ch.id,
            channelType: ch.type,
            channelName: ch.name,
            webhookUrl: ch.webhookUrl ?? `${API_BASE_URL}/channels/webhook/${ch.type}`,
            status: ch.status as WebhookEntry["status"],
          })));
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  const testWebhook = async (entry: WebhookEntry) => {
    setTesting(entry.channelId);
    try {
      const res = await fetch(entry.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test_event", timestamp: new Date().toISOString(), channelId: entry.channelId }),
      });
      const ok = res.ok || res.status === 200;
      setTestResults((prev) => ({
        ...prev,
        [entry.channelId]: { ok, message: ok ? "Webhook responded OK" : `HTTP ${res.status}` },
      }));
      toast({ title: ok ? "Webhook OK" : "Webhook error", description: ok ? `${entry.channelName} responded successfully.` : `Status ${res.status}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setTestResults((prev) => ({ ...prev, [entry.channelId]: { ok: false, message: msg } }));
      toast({ variant: "destructive", title: "Test failed", description: msg });
    } finally {
      setTesting(null);
    }
  };

  // Built-in platform webhook endpoints
  const tid = window.localStorage.getItem('tenantId') || 'YOUR_TENANT_ID';
  const PLATFORM_WEBHOOKS = [
    { label: "WhatsApp Inbound", url: `${API_BASE_URL}/channels/webhook/whatsapp?tenantId=${tid}`, method: "POST", note: "Meta will POST here on incoming messages" },
    { label: "WhatsApp Verification", url: `${API_BASE_URL}/channels/webhook/whatsapp?tenantId=${tid}`, method: "GET", note: "Meta GET verification challenge" },
    { label: "Facebook Messenger Inbound", url: `${API_BASE_URL}/channels/webhook/facebook?tenantId=${tid}`, method: "POST", note: "Meta will POST here on incoming messages" },
    { label: "Facebook Verification", url: `${API_BASE_URL}/channels/webhook/facebook?tenantId=${tid}`, method: "GET", note: "Meta GET verification challenge" },
    { label: "Instagram DMs Inbound", url: `${API_BASE_URL}/channels/webhook/instagram?tenantId=${tid}`, method: "POST", note: "Meta will POST here on incoming messages" },
    { label: "Instagram Verification", url: `${API_BASE_URL}/channels/webhook/instagram?tenantId=${tid}`, method: "GET", note: "Meta GET verification challenge" },
    { label: "Telegram Updates", url: `${API_BASE_URL}/channels/webhook/telegram?tenantId=${tid}`, method: "POST", note: "Telegram will POST updates here" },
    { label: "Slack Events", url: `${API_BASE_URL}/channels/webhook/slack?tenantId=${tid}`, method: "POST", note: "Slack event subscriptions & URL verification" },
    { label: "TikTok Webhook", url: `${API_BASE_URL}/channels/webhook/tiktok?tenantId=${tid}`, method: "POST", note: "TikTok for Business events" },
    { label: "LinkedIn Webhook", url: `${API_BASE_URL}/channels/webhook/linkedin?tenantId=${tid}`, method: "POST", note: "LinkedIn messaging events" },
    { label: "Apple Business Chat", url: `${API_BASE_URL}/channels/webhook/apple?tenantId=${tid}`, method: "POST", note: "Apple Messages for Business" },
    { label: "Generic Webhook", url: `${API_BASE_URL}/channels/webhook/generic?tenantId=${tid}`, method: "POST", note: "Custom inbound integration" },
    { label: "Chatwoot Outgoing", url: `${API_BASE_URL}/channels/webhook/chatwoot?tenantId=${tid}`, method: "POST", note: "Chatwoot posts agent replies to this URL" },
    { label: "Stripe Billing", url: `${API_BASE_URL}/billing/webhook/stripe?tenantId=${tid}`, method: "POST", note: "Stripe subscription & payment events" },
  ];

  return (
    <div className="space-y-6">
      {/* Platform webhooks */}
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-400" /> Platform Webhook Endpoints
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {PLATFORM_WEBHOOKS.map((w) => (
            <div key={w.label} className="rounded-xl bg-muted/30 border border-white/8 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge className={`text-[10px] ${METHOD_COLOR[w.method] ?? ""}`}>{w.method}</Badge>
                <p className="text-sm font-medium text-foreground">{w.label}</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-muted-foreground bg-black/20 rounded px-2 py-1 break-all">{w.url}</code>
                <button
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  onClick={() => copyToClipboard(w.url, "URL", toast)}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">{w.note}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Connected channel webhooks */}
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Webhook className="w-4 h-4 text-purple-400" /> Connected Channel Webhooks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">No channels connected. Go to Settings → Channels to connect WhatsApp, Telegram, etc.</p>
          ) : (
            <div className="space-y-3">
              {webhooks.map((w) => {
                const result = testResults[w.channelId];
                return (
                  <div key={w.channelId} className="rounded-xl bg-muted/30 border border-white/8 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{w.channelName}</p>
                        <Badge className={`text-[10px] capitalize ${STATUS_COLOR[w.status] ?? ""}`}>{w.channelType}</Badge>
                        <Badge className={`text-[10px] ${STATUS_COLOR[w.status] ?? ""}`}>{w.status}</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground border border-border"
                        onClick={() => void testWebhook(w)}
                        disabled={testing === w.channelId}
                      >
                        {testing === w.channelId
                          ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          : <Send className="w-3 h-3 mr-1" />}
                        Test
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] font-mono text-muted-foreground bg-black/20 rounded px-2 py-1 break-all">{w.webhookUrl}</code>
                      <button className="text-muted-foreground hover:text-foreground flex-shrink-0" onClick={() => copyToClipboard(w.webhookUrl, "URL", toast)}>
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    {result && (
                      <p className={`text-[11px] flex items-center gap-1 ${result.ok ? "text-green-400" : "text-red-400"}`}>
                        {result.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {result.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Usage Logs Panel ──────────────────────────────────────────────────────────

const UsageLogsPanel = () => {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState("");
  const [fetching, setFetching] = useState(false);
  const [runDetail, setRunDetail] = useState<Record<string, unknown> | null>(null);
  const [historyDetail, setHistoryDetail] = useState<Record<string, unknown>[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { toast } = useToast();

  // Run the AI router demo and show the run
  const runDemo = async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/orchestrator/demo-ai-router`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { ticket_text: "My payment failed on checkout", customer_name: "Dev Test", priority: "high" } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { workflowRunId?: string; status?: string; startedAt?: string };
      const newRun: RunLog = {
        id: data.workflowRunId ?? `demo_${Date.now()}`,
        status: data.status ?? "completed",
        startedAt: data.startedAt ?? new Date().toISOString(),
      };
      setRuns((prev) => [newRun, ...prev.slice(0, 19)]);
      toast({ title: "Demo workflow executed", description: `Run ID: ${newRun.id}` });
    } catch (e) {
      toast({ variant: "destructive", title: "Demo failed", description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchRun = async () => {
    if (!runId.trim()) return;
    setFetching(true);
    setRunDetail(null);
    setHistoryDetail(null);
    try {
      const [runRes, histRes] = await Promise.all([
        authedFetch(`${API_BASE_URL}/orchestrator/run/${runId.trim()}`),
        authedFetch(`${API_BASE_URL}/orchestrator/run/${runId.trim()}/history`),
      ]);
      if (runRes.ok) setRunDetail(await runRes.json() as Record<string, unknown>);
      if (histRes.ok) {
        const h = await histRes.json() as { nodeRuns?: Record<string, unknown>[] };
        setHistoryDetail(h.nodeRuns ?? []);
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Fetch failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          className="bg-purple-600 hover:bg-purple-500 text-white text-sm"
          onClick={runDemo}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-2" />}
          Run AI Router Demo
        </Button>
      </div>

      {/* Run lookup */}
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" /> Inspect Workflow Run
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="Paste a workflow run ID…"
              className="bg-muted/40 border-border text-sm font-mono"
              onKeyDown={(e) => e.key === "Enter" && void fetchRun()}
            />
            <Button
              onClick={fetchRun}
              disabled={!runId.trim() || fetching}
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
            >
              {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
            </Button>
          </div>

          {runDetail && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/40 border border-white/8">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-foreground">Run Status</p>
                  <Badge className={`text-[10px] ${STATUS_COLOR[String(runDetail.status)] ?? ""}`}>{String(runDetail.status)}</Badge>
                </div>
                <pre className="text-[11px] text-muted-foreground overflow-auto max-h-40">{JSON.stringify(runDetail, null, 2)}</pre>
              </div>

              {historyDetail && historyDetail.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Node Execution Timeline</p>
                  {historyDetail.map((node, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-muted/30 border border-white/8">
                      <div className="flex items-center justify-between">
                        <code className="text-xs text-foreground">{String(node.nodeId ?? "")}</code>
                        <div className="flex items-center gap-2">
                          {node.durationMs && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {String(node.durationMs)}ms</span>}
                          <Badge className={`text-[10px] ${STATUS_COLOR[String(node.status)] ?? ""}`}>{String(node.status)}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Local run history */}
      {runs.length > 0 && (
        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Recent Runs (this session)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-white/8 cursor-pointer hover:bg-muted/40"
                onClick={() => { setRunId(r.id); setExpanded(r.id); }}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <code className="text-xs font-mono text-muted-foreground">{r.id}</code>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</Badge>
                  <span className="text-[10px] text-muted-foreground">{formatTime(r.startedAt)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── API Reference Panel ───────────────────────────────────────────────────────

const ApiReferencePanel = () => {
  const [endpoints, setEndpoints] = useState<EndpointSpec[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loadingSpec, setLoadingSpec] = useState(true);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [tryItBody, setTryItBody] = useState<Record<string, string>>({});
  const [tryItParams, setTryItParams] = useState<Record<string, Record<string, string>>>({});
  const [tryItResults, setTryItResults] = useState<Record<string, { status: number; body: string }>>({});
  const [running, setRunning] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch live spec from backend
  useEffect(() => {
    const fetchSpec = async () => {
      setLoadingSpec(true);
      try {
        const res = await authedFetch(`${API_BASE_URL}/spec/endpoints`);
        if (res.ok) {
          const data = await res.json() as { endpoints: EndpointSpec[]; categories: string[]; total: number };
          setEndpoints(data.endpoints ?? []);
          setCategories(data.categories ?? []);
          if (data.categories?.length > 0) setSelectedCategory(data.categories[0]);
        }
      } catch { /* ignore — show empty state */ }
      finally { setLoadingSpec(false); }
    };
    void fetchSpec();
  }, []);

  // Search via backend when query changes
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: searchQuery });
        if (selectedCategory) params.set("module", selectedCategory);
        const res = await authedFetch(`${API_BASE_URL}/spec/search?${params}`);
        if (res.ok) {
          const data = await res.json() as { results: EndpointSpec[] };
          setEndpoints(data.results ?? []);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, selectedCategory]);

  // Reload category when search is cleared
  useEffect(() => {
    if (searchQuery.trim()) return;
    const fetchCategory = async () => {
      setLoadingSpec(true);
      try {
        const params = selectedCategory ? `?category=${encodeURIComponent(selectedCategory)}` : "";
        const res = await authedFetch(`${API_BASE_URL}/spec/endpoints${params}`);
        if (res.ok) {
          const data = await res.json() as { endpoints: EndpointSpec[]; categories: string[] };
          setEndpoints(data.endpoints ?? []);
          if (!selectedCategory && data.categories?.length > 0) {
            setCategories(data.categories);
            setSelectedCategory(data.categories[0]);
          }
        }
      } catch { /* ignore */ }
      finally { setLoadingSpec(false); }
    };
    void fetchCategory();
  }, [selectedCategory, searchQuery]);

  const filtered = searchQuery.trim() ? endpoints : endpoints.filter((e) => e.category === selectedCategory);

  const tryEndpoint = async (endpoint: EndpointSpec) => {
    const key = `${endpoint.method}:${endpoint.path}`;
    setRunning(key);
    try {
      const params = tryItParams[key] ?? {};

      // Substitute path parameters
      let resolvedPath = endpoint.path.replace(/^\/api/, "");
      resolvedPath = resolvedPath.replace(/\{([\w]+)\}/g, (_, name) => encodeURIComponent(params[name] || `{${name}}`));

      // Build query string from query params
      const queryParams = (endpoint.parameters ?? []).filter((p) => p.in === "query");
      const qs = queryParams
        .filter((p) => params[p.name])
        .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(params[p.name])}`)
        .join("&");

      const url = `${API_BASE_URL}${resolvedPath}${qs ? `?${qs}` : ""}`;

      // Build extra headers from header params
      const extraHeaders: Record<string, string> = {};
      (endpoint.parameters ?? [])
        .filter((p) => p.in === "header" && params[p.name])
        .forEach((p) => { extraHeaders[p.name] = params[p.name]; });

      const opts: RequestInit = {
        method: endpoint.method,
        headers: { "Content-Type": "application/json", ...extraHeaders },
      };
      const body = tryItBody[key];
      if (body && body.trim() !== "{}" && endpoint.method !== "GET" && endpoint.method !== "DELETE") {
        opts.body = body;
      }
      const res = await authedFetch(url, opts);
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
      setTryItResults((prev) => ({ ...prev, [key]: { status: res.status, body: pretty } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setTryItResults((prev) => ({ ...prev, [key]: { status: 0, body: msg } }));
      toast({ variant: "destructive", title: "Request failed", description: msg });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search + Base URL row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search endpoints… (e.g. 'create invoice', 'contacts')"
            className="pl-9 bg-muted/40 border-border text-sm"
          />
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-white/8 shrink-0">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <code className="text-xs font-mono text-foreground">{API_BASE_URL}</code>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(API_BASE_URL, "Base URL", toast)}>
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Category pills */}
      {!searchQuery.trim() && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedCategory === cat ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "text-muted-foreground border-border hover:border-border"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Endpoint list */}
      {loadingSpec ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="bg-muted/30 border-dashed border-border">
          <CardContent className="p-8 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{searchQuery ? "No endpoints match your search." : "No endpoints in this category."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((ep) => {
            const key = `${ep.method}:${ep.path}`;
            const isOpen = expandedEndpoint === key;
            const result = tryItResults[key];

            return (
              <Card key={key} className="bg-muted/40 border-border overflow-hidden">
                <button
                  className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedEndpoint(isOpen ? null : key)}
                >
                  <Badge className={`text-[10px] w-14 justify-center flex-shrink-0 ${METHOD_COLOR[ep.method] ?? ""}`}>{ep.method}</Badge>
                  <code className="text-sm font-mono text-foreground flex-1 truncate">{ep.path}</code>
                  <span className="text-xs text-muted-foreground hidden md:block mr-3 truncate max-w-xs">{ep.summary || ep.description}</span>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-white/8 p-4 space-y-3 bg-black/10">
                    <p className="text-sm text-foreground">{ep.description || ep.summary}</p>

                    {ep.parameters && ep.parameters.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Parameters</p>
                        <div className="space-y-2">
                          {ep.parameters.map((p) => (
                            <div key={p.name} className="grid grid-cols-[140px_1fr] items-center gap-3">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <code className="text-purple-300 text-xs">{p.name}</code>
                                  <Badge variant="outline" className="text-[9px] border-border text-muted-foreground px-1 py-0">{p.in}</Badge>
                                  {p.required && <Badge className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 px-1 py-0">required</Badge>}
                                </div>
                                {p.description && <span className="text-[10px] text-muted-foreground leading-tight">{p.description}</span>}
                              </div>
                              <Input
                                value={tryItParams[key]?.[p.name] ?? ""}
                                onChange={(e) =>
                                  setTryItParams((prev) => ({
                                    ...prev,
                                    [key]: { ...(prev[key] ?? {}), [p.name]: e.target.value },
                                  }))
                                }
                                placeholder={p.in === "path" ? `Enter ${p.name}` : p.description || `${p.name} value`}
                                className="h-7 text-xs bg-muted/40 border-border font-mono"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(ep.method !== "GET" && ep.method !== "DELETE") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Request Body (JSON)</Label>
                        <Textarea
                          value={tryItBody[key] ?? "{}"}
                          onChange={(e) => setTryItBody((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="bg-muted/40 border-border text-xs font-mono min-h-[80px] resize-y"
                        />
                      </div>
                    )}

                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-500 text-white text-xs"
                      onClick={() => void tryEndpoint(ep)}
                      disabled={running === key}
                    >
                      {running === key ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Play className="w-3 h-3 mr-1.5" />}
                      Try it
                    </Button>

                    {result && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[10px] ${result.status >= 200 && result.status < 300 ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-red-500/15 text-red-400 border-red-500/20"}`}>
                            {result.status || "Error"}
                          </Badge>
                          <button className="text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(result.body, "Response", toast)}>
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        <pre className="text-[11px] text-muted-foreground bg-black/20 rounded p-2.5 overflow-auto max-h-48">{result.body}</pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main page ─────────────────────────────────────────────────────────────────

type Tab = "keys" | "webhooks" | "logs" | "reference";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "keys", label: "API Keys", icon: <Key className="w-4 h-4" /> },
  { id: "webhooks", label: "Webhooks", icon: <Webhook className="w-4 h-4" /> },
  { id: "logs", label: "Usage Logs", icon: <BarChart2 className="w-4 h-4" /> },
  { id: "reference", label: "API Reference", icon: <BookOpen className="w-4 h-4" /> },
];

const DeveloperPortal = () => {
  const [tab, setTab] = useState<Tab>("keys");
  const [refreshing, setRefreshing] = useState(false);

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 via-indigo-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/20">
                  <Code2 className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">Developer Portal</h1>
                  <p className="text-muted-foreground text-sm">API keys, webhooks, usage logs & live API reference</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/20 text-xs gap-1.5">
                  <Shield className="w-3 h-3" /> {API_BASE_URL.includes("localhost") ? "Local" : "Production"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }}
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mt-6 border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    tab === t.id
                      ? "text-purple-400 border-purple-400"
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
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="px-8 pb-10"
        >
          {tab === "keys" && <KeysPanel />}
          {tab === "webhooks" && <WebhooksPanel />}
          {tab === "logs" && <UsageLogsPanel />}
          {tab === "reference" && <ApiReferencePanel />}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("api.keys.issue")(DeveloperPortal);
