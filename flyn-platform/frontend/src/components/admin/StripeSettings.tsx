import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import {
  Loader2, Copy, Check, ExternalLink, RefreshCw, Key,
  Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntegrationKeys { [key: string]: string }

interface IntegrationState {
  enabled: boolean;
  keys: IntegrationKeys;
}

type AllSettings = Record<string, IntegrationState>;

// ── Integration catalogue ─────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
}

interface WebhookDef {
  label: string;
  path: string;
}

interface IntegrationDef {
  id: string;
  name: string;
  abbr: string;
  color: string;
  category: string;
  categoryLabel: string;
  subtitle: string;
  fields: FieldDef[];
  webhook?: WebhookDef;
  docsUrl?: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  // ── Payments ──
  {
    id: "stripe", name: "Stripe", abbr: "S", color: "bg-violet-600",
    category: "payments", categoryLabel: "PAYMENTS · GLOBAL",
    subtitle: "Payments & subscriptions",
    fields: [
      { key: "publicKey", label: "STRIPE_PUBLIC_KEY", placeholder: "pk_live_…", required: true },
      { key: "secretKey", label: "STRIPE_SECRET_KEY", placeholder: "sk_live_…", required: true },
      { key: "webhookSecret", label: "STRIPE_WEBHOOK_SECRET", placeholder: "whsec_…" },
    ],
    webhook: { label: "Webhook URL", path: "/api/billing/webhooks/stripe" },
    docsUrl: "https://stripe.com/docs",
  },
  {
    id: "tap", name: "Tap Payments", abbr: "Tp", color: "bg-blue-600",
    category: "payments", categoryLabel: "PAYMENTS · UAE",
    subtitle: "MENA region payments",
    fields: [
      { key: "publicKeyLive", label: "TAP_PUBLIC_KEY_LIVE", placeholder: "pk_live_tap_…", required: true },
      { key: "secretKeyLive", label: "TAP_SECRET_KEY_LIVE", placeholder: "sk_live_tap_…", required: true },
      { key: "publicKeyTest", label: "TAP_PUBLIC_KEY_TEST", placeholder: "pk_test_tap_…" },
      { key: "secretKeyTest", label: "TAP_SECRET_KEY_TEST", placeholder: "sk_test_tap_…" },
      { key: "merchantId", label: "TAP_MERCHANT_ID", placeholder: "merchant_…" },
      { key: "webhookSecret", label: "TAP_WEBHOOK_SECRET", placeholder: "whs_tap_…" },
    ],
    webhook: { label: "Webhook URL", path: "/api/billing/webhooks/tap" },
    docsUrl: "https://developers.tap.company",
  },
  // ── Communication ──
  {
    id: "twilio", name: "Twilio", abbr: "Tw", color: "bg-red-600",
    category: "communication", categoryLabel: "SMS · VOICE · WHATSAPP",
    subtitle: "Messaging & voice",
    fields: [
      { key: "accountSid", label: "TWILIO_ACCOUNT_SID", placeholder: "AC…", required: true },
      { key: "authToken", label: "TWILIO_AUTH_TOKEN", placeholder: "…", required: true },
      { key: "phoneNumber", label: "TWILIO_PHONE_NUMBER", placeholder: "+1 415 555 0100" },
    ],
    docsUrl: "https://www.twilio.com/docs",
  },
  {
    id: "sendgrid", name: "SendGrid", abbr: "SG", color: "bg-sky-600",
    category: "communication", categoryLabel: "EMAIL · TRANSACTIONAL",
    subtitle: "Transactional email",
    fields: [
      { key: "apiKey", label: "SENDGRID_API_KEY", placeholder: "SG.…", required: true },
      { key: "fromEmail", label: "SENDGRID_FROM_EMAIL", placeholder: "noreply@…" },
      { key: "fromName", label: "SENDGRID_FROM_NAME", placeholder: "Flyn Platform" },
    ],
    docsUrl: "https://docs.sendgrid.com",
  },
  {
    id: "brevo", name: "Brevo (SMTP)", abbr: "Bv", color: "bg-teal-600",
    category: "communication", categoryLabel: "EMAIL · SMTP · REPLIES",
    subtitle: "Contact form & chatbot replies sent from your own email via Brevo SMTP",
    fields: [
      { key: "smtpUser", label: "SMTP Login (your Brevo email)", placeholder: "you@yourcompany.com", required: true },
      { key: "smtpKey", label: "SMTP API Key", placeholder: "xsmtp-…", required: true, sensitive: true },
      { key: "fromEmail", label: "From Email", placeholder: "support@yourcompany.com" },
      { key: "fromName", label: "From Name", placeholder: "Your Company Support" },
    ],
    docsUrl: "https://help.brevo.com/hc/en-us/articles/209462285",
  },
  {
    id: "whatsapp", name: "WhatsApp Business", abbr: "WA", color: "bg-green-600",
    category: "communication", categoryLabel: "MESSAGING · META API",
    subtitle: "WhatsApp Cloud API",
    fields: [
      { key: "token", label: "WHATSAPP_TOKEN", placeholder: "EAABs…", required: true },
      { key: "phoneId", label: "WHATSAPP_PHONE_ID", placeholder: "107…" },
      { key: "businessId", label: "WHATSAPP_BUSINESS_ID", placeholder: "200…" },
      { key: "verifyToken", label: "WHATSAPP_VERIFY_TOKEN", placeholder: "flyn_wh_…" },
    ],
    webhook: { label: "Webhook URL", path: "/api/webhooks/whatsapp" },
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
  },
  // ── Auth & Social ──
  {
    id: "google", name: "Google OAuth", abbr: "G", color: "bg-blue-500",
    category: "auth", categoryLabel: "AUTH · SSO",
    subtitle: "Sign-in with Google",
    fields: [
      { key: "clientId", label: "GOOGLE_CLIENT_ID", placeholder: "…apps.googleusercontent.com", required: true },
      { key: "clientSecret", label: "GOOGLE_CLIENT_SECRET", placeholder: "GOCSPX-…", required: true },
      { key: "callbackUrl", label: "GOOGLE_CALLBACK_URL", placeholder: ".../auth/google/callback" },
    ],
    docsUrl: "https://developers.google.com/identity",
  },
  {
    id: "facebook", name: "Facebook / Meta", abbr: "Fb", color: "bg-blue-700",
    category: "auth", categoryLabel: "AUTH · ADS · SOCIAL",
    subtitle: "Facebook Login & Meta APIs",
    fields: [
      { key: "appId", label: "FACEBOOK_APP_ID", placeholder: "…", required: true },
      { key: "appSecret", label: "FACEBOOK_APP_SECRET", placeholder: "…", required: true },
      { key: "callbackUrl", label: "FACEBOOK_CALLBACK_URL", placeholder: ".../auth/facebook/callback" },
    ],
    docsUrl: "https://developers.facebook.com",
  },
  // ── AI & ML ──
  {
    id: "openai", name: "OpenAI", abbr: "AI", color: "bg-emerald-600",
    category: "ai", categoryLabel: "AI · GPT · EMBEDDINGS",
    subtitle: "GPT, embeddings & more",
    fields: [
      { key: "apiKey", label: "OPENAI_API_KEY", placeholder: "sk-proj-…", required: true },
      { key: "orgId", label: "OPENAI_ORG_ID", placeholder: "org-…" },
      { key: "model", label: "OPENAI_MODEL", placeholder: "gpt-4o" },
    ],
    docsUrl: "https://platform.openai.com/docs",
  },
  // ── Storage ──
  {
    id: "aws", name: "AWS S3", abbr: "S3", color: "bg-orange-600",
    category: "storage", categoryLabel: "STORAGE · CDN · FILES",
    subtitle: "Object storage & CDN",
    fields: [
      { key: "accessKey", label: "AWS_ACCESS_KEY_ID", placeholder: "AKIA…", required: true },
      { key: "secretKey", label: "AWS_SECRET_ACCESS_KEY", placeholder: "…", required: true },
      { key: "bucket", label: "AWS_BUCKET_NAME", placeholder: "flyn-prod-uploads" },
      { key: "region", label: "AWS_REGION", placeholder: "us-east-1" },
    ],
    docsUrl: "https://docs.aws.amazon.com/s3",
  },
  // ── Maps ──
  {
    id: "googlemaps", name: "Google Maps", abbr: "Gm", color: "bg-green-500",
    category: "maps", categoryLabel: "MAPS · GEOCODING · PLACES",
    subtitle: "Maps, geocoding & places",
    fields: [
      { key: "apiKey", label: "GOOGLE_MAPS_API_KEY", placeholder: "AIzaSy…", required: true },
      { key: "mapId", label: "GOOGLE_MAPS_MAP_ID", placeholder: "…" },
    ],
    docsUrl: "https://developers.google.com/maps",
  },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "communication", label: "Communication" },
  { id: "auth", label: "Auth & Social" },
  { id: "ai", label: "AI & ML" },
  { id: "storage", label: "Storage" },
  { id: "maps", label: "Maps & Location" },
];

const CATEGORY_LABELS: Record<string, string> = {
  payments: "PAYMENTS",
  communication: "COMMUNICATION",
  auth: "AUTH & SOCIAL",
  ai: "AI & ML",
  storage: "STORAGE",
  maps: "MAPS & LOCATION",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mask(val: string): string {
  if (!val) return "";
  if (val.length <= 8) return val.slice(0, 2) + "•".repeat(6);
  return val.slice(0, 6) + "•".repeat(Math.min(val.length - 6, 10));
}

function getStatus(integ: IntegrationDef, state: IntegrationState): "connected" | "inactive" | "attention" | "new" {
  if (!state.enabled) {
    const hasAny = Object.values(state.keys).some(v => v.trim());
    return hasAny ? "inactive" : "new";
  }
  const required = integ.fields.filter(f => f.required);
  const allFilled = required.every(f => state.keys[f.key]?.trim());
  return allFilled ? "connected" : "attention";
}

const STATUS_STYLES: Record<string, string> = {
  connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  attention: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  new: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  connected: "● Connected",
  inactive: "○ Inactive",
  attention: "⚠ Needs attention",
  new: "✦ New",
};

// ── Key field row ─────────────────────────────────────────────────────────────

function KeyRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] font-mono text-muted-foreground w-44 shrink-0 truncate">{label}</span>
      <span className="text-[11px] text-muted-foreground mx-1">–</span>
      <div className="flex-1 relative">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          type={reveal ? "text" : "password"}
          placeholder={reveal ? "Enter value…" : "•".repeat(8)}
          className="h-7 text-[11px] font-mono pr-7 bg-background/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/40"
        />
        <button
          type="button"
          onClick={() => setReveal(r => !r)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {reveal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({ integ, state, onToggle, onKeyChange, onSave, saving }: {
  integ: IntegrationDef;
  state: IntegrationState;
  onToggle: (enabled: boolean) => void;
  onKeyChange: (key: string, val: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const status = getStatus(integ, state);

  const copyWebhook = () => {
    if (!integ.webhook) return;
    navigator.clipboard.writeText(`${window.location.origin}${integ.webhook.path}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${integ.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
            {integ.abbr}
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{integ.name}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{integ.categoryLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Badge className={cn("text-[10px] px-2 py-0 border", STATUS_STYLES[status])}>
            {STATUS_LABELS[status]}
          </Badge>
          <Switch
            checked={state.enabled}
            onCheckedChange={onToggle}
            className="scale-90"
          />
        </div>
      </div>

      {/* Key fields */}
      <div className="px-4 py-2">
        {integ.fields.map(field => (
          <KeyRow
            key={field.key}
            label={field.label}
            value={state.keys[field.key] ?? ""}
            onChange={val => onKeyChange(field.key, val)}
          />
        ))}

        {/* Webhook URL */}
        {integ.webhook && (
          <div className="flex items-center gap-2 mt-2 py-1.5">
            <span className="text-[10px] text-muted-foreground font-mono flex-1 truncate">
              {integ.webhook.label}: <span className="text-foreground/60">{`...${integ.webhook.path}`}</span>
            </span>
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={copyWebhook}>
              {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-background/20">
        {integ.docsUrl ? (
          <a href={integ.docsUrl} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-primary hover:underline flex items-center gap-1">
            <ExternalLink className="w-3 h-3" /> Docs
          </a>
        ) : <span />}
        <Button
          size="sm"
          className="h-7 text-xs flyn-button-gradient px-4"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const StripeSettings = () => {
  const [settings, setSettings] = useState<AllSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [lastSynced, setLastSynced] = useState<string>("—");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/admin/system-settings`);
      if (res.ok) {
        const data = await res.json();
        const next: AllSettings = {};
        for (const integ of INTEGRATIONS) {
          const saved = data[integ.id] ?? {};
          const keys: IntegrationKeys = {};
          for (const f of integ.fields) keys[f.key] = saved.keys?.[f.key] ?? saved[f.key] ?? "";
          next[integ.id] = { enabled: saved.enabled ?? saved.isEnabled ?? false, keys };
        }
        setSettings(next);
        if (data.updatedAt) {
          const d = new Date(data.updatedAt);
          const diff = Math.round((Date.now() - d.getTime()) / 60000);
          setLastSynced(diff < 60 ? `${diff}m ago` : d.toLocaleDateString());
        }
      }
    } catch { /* keep defaults */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getState = (id: string): IntegrationState =>
    settings[id] ?? { enabled: false, keys: {} };

  const handleToggle = (id: string, enabled: boolean) =>
    setSettings(prev => ({ ...prev, [id]: { ...getState(id), enabled } }));

  const handleKeyChange = (id: string, key: string, val: string) =>
    setSettings(prev => ({
      ...prev,
      [id]: { ...getState(id), keys: { ...getState(id).keys, [key]: val } },
    }));

  const handleSave = async (id: string) => {
    setSavingId(id);
    try {
      const res = await authedFetch(`${API_BASE_URL}/admin/system-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [id]: getState(id), updatedAt: Date.now() }),
      });
      if (!res.ok) throw new Error("Failed");
      setLastSynced("just now");
      toast({ title: "Saved", description: `${INTEGRATIONS.find(i => i.id === id)?.name} settings updated.` });
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Could not update settings." });
    } finally { setSavingId(null); }
  };

  // Stats
  const allStates = INTEGRATIONS.map(i => ({ integ: i, state: getState(i.id) }));
  const connected = allStates.filter(({ integ, state }) => getStatus(integ, state) === "connected").length;
  const attention = allStates.filter(({ integ, state }) => getStatus(integ, state) === "attention").length;
  const inactive = allStates.filter(({ integ, state }) => getStatus(integ, state) === "inactive").length;

  const filtered = activeCategory === "all"
    ? INTEGRATIONS
    : INTEGRATIONS.filter(i => i.category === activeCategory);

  const groupedByCategory = CATEGORIES.filter(c => c.id !== "all").map(c => ({
    ...c,
    items: filtered.filter(i => i.category === c.id),
  })).filter(g => g.items.length > 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            API Integrations
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            All third-party API keys and .env variables — managed in one place
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-1.5 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total integrations", value: INTEGRATIONS.length, sub: "across all categories", color: "text-foreground" },
          { label: "Connected", value: connected, sub: "live & active", color: "text-emerald-400" },
          { label: "Needs attention", value: attention, sub: "key expiring / missing", color: "text-amber-400" },
          { label: "Inactive", value: inactive, sub: "not yet configured", color: "text-zinc-400" },
          { label: "Last synced", value: lastSynced, sub: "auto-refresh off", color: "text-foreground" },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-border bg-card/50 px-4 py-3">
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{stat.label}</p>
            <p className="text-[10px] text-muted-foreground">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              activeCategory === cat.id
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-muted-foreground border-border hover:text-foreground hover:bg-accent",
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Integration cards grouped by category */}
      {activeCategory === "all" ? (
        groupedByCategory.map(group => (
          <div key={group.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                🔸 {CATEGORY_LABELS[group.id]}
              </span>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.items.map(integ => (
                <IntegrationCard
                  key={integ.id}
                  integ={integ}
                  state={getState(integ.id)}
                  onToggle={v => handleToggle(integ.id, v)}
                  onKeyChange={(k, v) => handleKeyChange(integ.id, k, v)}
                  onSave={() => handleSave(integ.id)}
                  saving={savingId === integ.id}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(integ => (
            <IntegrationCard
              key={integ.id}
              integ={integ}
              state={getState(integ.id)}
              onToggle={v => handleToggle(integ.id, v)}
              onKeyChange={(k, v) => handleKeyChange(integ.id, k, v)}
              onSave={() => handleSave(integ.id)}
              saving={savingId === integ.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default StripeSettings;
