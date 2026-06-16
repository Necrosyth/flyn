import { useState, useRef, useEffect, useCallback } from "react";
import { withPlanGate } from "@/components/PlanGate";
import { motion } from "framer-motion";
import {
  Palette, Image, Type, Globe, Mail, RotateCcw, Eye,
  Upload, Check, Sparkles, Link, Bot, MessageCircle,
  Users, CreditCard, Plus, Trash2, Lock, Building2,
  Loader2, RefreshCw, AlertCircle, CheckCircle2, Clock, Copy, X,
} from "lucide-react";
import {
  addCustomHostname, listCustomHostnames, deleteCustomHostname,
  getCustomHostnameStatus, type CustomHostname,
} from "@/services/domainApi";
import { useTranslation } from "react-i18next";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MailboxManager } from "@/components/mailboxes/MailboxManager";
import { EmailDomainManager } from "@/components/mailboxes/EmailDomainManager";
import { useBranding } from "@/contexts/BrandingContext";
import { usePlan } from "@/contexts/PlanContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Static data ─────────────────────────────────────────────────────────────

const colorPresets = [
  { name: "Flyn Purple",   primary: "252 85% 60%", accent: "187 85% 53%" },
  { name: "Ocean Blue",    primary: "210 100% 50%", accent: "180 100% 40%" },
  { name: "Forest Green",  primary: "142 70% 45%",  accent: "160 60% 50%" },
  { name: "Sunset Orange", primary: "25 95% 55%",   accent: "45 100% 50%" },
  { name: "Rose Pink",     primary: "340 80% 55%",  accent: "320 70% 60%" },
  { name: "Midnight",      primary: "240 50% 50%",  accent: "260 60% 55%" },
];

const fontOptions = [
  "Inter", "Roboto", "Open Sans", "Lato",
  "Poppins", "Montserrat", "Source Sans Pro", "Nunito",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const hslToHex = (hsl: string) => {
  const [h, s, l] = hsl.split(" ").map((v, i) =>
    i === 0 ? parseFloat(v) : parseFloat(v.replace("%", ""))
  );
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const hexToHsl = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

// Reusable upload zone
const UploadZone = ({
  url, onUpload, onRemove, label, height = "p-8",
}: {
  url: string | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove?: () => void;
  label: string;
  height?: string;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-lg ${height} text-center cursor-pointer hover:border-primary/50 transition-colors`}
        onClick={() => ref.current?.click()}
      >
        {url ? (
          <img src={url} alt="preview" className="max-h-16 mx-auto object-contain" />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-1">
            <Upload className="h-6 w-6" />
            <p className="text-xs">{label}</p>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onUpload} />
      {url && onRemove && (
        <Button variant="outline" size="sm" onClick={onRemove}>Remove</Button>
      )}
    </div>
  );
};

// Enterprise gate banner
const EnterpriseBanner = ({ feature, plan }: { feature: string; plan: string | null }) => (
  <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
    <Lock className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
    <div>
      <p className="text-sm font-medium text-amber-300">{feature} requires {plan ?? "ENTERPRISE"}+</p>
      <p className="text-xs text-muted-foreground mt-1">Upgrade your plan to unlock this feature.</p>
    </div>
  </div>
);

// ─── Sub-account row ─────────────────────────────────────────────────────────

interface SubAccount {
  id: string;
  name: string;
  domain: string;
  plan: string;
  status: "active" | "suspended";
}


// ─── Main component ───────────────────────────────────────────────────────────

const WhiteLabel = () => {
  const { branding, updateBranding, resetBranding, isCustomized } = useBranding();
  const { tenant } = useAuth();
  const [previewMode, setPreviewMode] = useState(false);
  // Bumped when a domain is added/verified/removed so the mailbox create-dropdown refreshes.
  const [domainsVersion, setDomainsVersion] = useState(0);
  const { t } = useTranslation();
  const { isEntitled, getRequiredPlanForFeature } = usePlan();

  // Entitlements
  const canCustomDomain    = isEntitled("branding.custom_domain");
  const canFullWhiteLabel  = isEntitled("branding.full_white_label");
  const canReseller        = isEntitled("reseller.mode");
  const canSubAccounts     = isEntitled("reseller.sub_accounts");
  const canBillingPass     = isEntitled("reseller.billing_passthrough");
  const customDomainPlan   = getRequiredPlanForFeature("branding.custom_domain");
  const fullWhiteLabelPlan = getRequiredPlanForFeature("branding.full_white_label");
  const resellerPlan       = getRequiredPlanForFeature("reseller.mode");

  // Custom domain connector state
  const [customHostnames, setCustomHostnames] = useState<CustomHostname[]>([]);
  const [newHostname, setNewHostname] = useState("");
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainAdding, setDomainAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [copiedVal, setCopiedVal] = useState<string | null>(null);

  const loadHostnames = useCallback(async () => {
    setDomainLoading(true);
    try {
      const list = await listCustomHostnames();
      setCustomHostnames(list);
    } catch { /* ignore */ }
    finally { setDomainLoading(false); }
  }, []);

  useEffect(() => { loadHostnames(); }, [loadHostnames]);

  const handleAddHostname = async () => {
    const h = newHostname.trim().toLowerCase();
    if (!h) return;
    setDomainAdding(true);
    try {
      const created = await addCustomHostname(h);
      setCustomHostnames(prev => [...prev, created]);
      setNewHostname("");
      toast.success(`${h} added — configure the DNS records below to verify.`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to add domain");
    } finally { setDomainAdding(false); }
  };

  const handleDeleteHostname = async (id: string) => {
    try {
      await deleteCustomHostname(id);
      setCustomHostnames(prev => prev.filter(h => h.id !== id));
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete domain");
    }
  };

  const handleRefreshStatus = async (id: string) => {
    setRefreshingId(id);
    try {
      const updated = await getCustomHostnameStatus(id);
      setCustomHostnames(prev => prev.map(h => h.id === id ? updated : h));
    } catch { /* ignore */ }
    finally { setRefreshingId(null); }
  };

  const copyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val).then(() => {
      setCopiedVal(val);
      setTimeout(() => setCopiedVal(null), 2000);
    });
  };

  // Reseller local state
  const [resellerMode, setResellerMode] = useState(false);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDomain, setNewClientDomain] = useState("");
  const [billingPassthrough, setBillingPassthrough] = useState(false);
  const [markupPercent, setMarkupPercent] = useState("20");

  const makeUploadHandler = (field: keyof typeof branding) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        updateBranding({ [field]: ev.target?.result as string });
        toast.success("Image uploaded");
      };
      reader.readAsDataURL(file);
    };

  const handleReset = () => {
    resetBranding();
    toast.success(t("whiteLabel.brandingReset"));
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              {t("whiteLabel.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{t("whiteLabel.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            {isCustomized && (
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("common.reset")}
              </Button>
            )}
            <Button
              variant={previewMode ? "default" : "outline"}
              onClick={() => setPreviewMode(!previewMode)}
            >
              <Eye className="h-4 w-4 mr-2" />
              {previewMode ? t("whiteLabel.exitPreview") : t("whiteLabel.preview")}
            </Button>
          </div>
        </motion.div>

        <Tabs defaultValue="branding" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="branding">{t("whiteLabel.branding")}</TabsTrigger>
            <TabsTrigger value="colors">{t("whiteLabel.colors")}</TabsTrigger>
            <TabsTrigger value="domain">{t("whiteLabel.domain")}</TabsTrigger>
            <TabsTrigger value="email">{t("whiteLabel.email")}</TabsTrigger>
            <TabsTrigger value="reseller" className="relative">
              Reseller
              {!canReseller && <Lock className="h-2.5 w-2.5 absolute top-1 right-1 text-muted-foreground" />}
            </TabsTrigger>
          </TabsList>

          {/* ── Branding Tab ───────────────────────────────────────────────── */}
          <TabsContent value="branding" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">

              {/* Logo — Light */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Logo — Light version
                  </CardTitle>
                  <CardDescription>Used on dark backgrounds and the main sidebar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <UploadZone
                    url={branding.logoUrl}
                    onUpload={makeUploadHandler("logoUrl")}
                    onRemove={() => updateBranding({ logoUrl: null })}
                    label={t("whiteLabel.clickToUploadLogo")}
                  />
                </CardContent>
              </Card>

              {/* Logo — Dark */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Logo — Dark version
                  </CardTitle>
                  <CardDescription>Used on light backgrounds and email headers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <UploadZone
                    url={branding.logoDarkUrl}
                    onUpload={makeUploadHandler("logoDarkUrl")}
                    onRemove={() => updateBranding({ logoDarkUrl: null })}
                    label="Click to upload dark logo"
                  />
                </CardContent>
              </Card>

              {/* App identity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Type className="h-5 w-5" />
                    {t("whiteLabel.appIdentity")}
                  </CardTitle>
                  <CardDescription>{t("whiteLabel.appIdentityDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t("whiteLabel.appName")}</Label>
                    <Input
                      value={branding.appName}
                      onChange={(e) => updateBranding({ appName: e.target.value })}
                      placeholder="My Business"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("whiteLabel.logoText")}</Label>
                    <Input
                      value={branding.logoText}
                      onChange={(e) => updateBranding({ logoText: e.target.value })}
                      placeholder="Company Name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("whiteLabel.fontFamily")}</Label>
                    <select
                      value={branding.fontFamily}
                      onChange={(e) => updateBranding({ fontFamily: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-background text-sm"
                    >
                      {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Favicon */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    {t("whiteLabel.favicon")}
                  </CardTitle>
                  <CardDescription>{t("whiteLabel.faviconDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <UploadZone
                    url={branding.faviconUrl}
                    onUpload={makeUploadHandler("faviconUrl")}
                    onRemove={() => updateBranding({ faviconUrl: null })}
                    label={t("whiteLabel.uploadFavicon")}
                    height="p-5"
                  />
                </CardContent>
              </Card>

              {/* Login page background */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Login Page Background
                  </CardTitle>
                  <CardDescription>Custom background image shown on the login screen</CardDescription>
                </CardHeader>
                <CardContent>
                  <UploadZone
                    url={branding.loginBgUrl}
                    onUpload={makeUploadHandler("loginBgUrl")}
                    onRemove={() => updateBranding({ loginBgUrl: null })}
                    label="Click to upload background image"
                    height="p-6"
                  />
                </CardContent>
              </Card>

              {/* Powered By */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("whiteLabel.visibility")}</CardTitle>
                  <CardDescription>{t("whiteLabel.visibilityDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label className={`font-medium ${!canFullWhiteLabel ? "text-muted-foreground" : ""}`}>
                        {t("whiteLabel.showPoweredBy")}
                      </Label>
                      <p className="text-sm text-muted-foreground">{t("whiteLabel.showPoweredByDesc")}</p>
                      {!canFullWhiteLabel && (
                        <p className="text-xs text-amber-500/80 mt-1">
                          Requires {fullWhiteLabelPlan ?? "ENTERPRISE"}+ to hide branding
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={branding.showPoweredBy}
                      disabled={!canFullWhiteLabel}
                      onCheckedChange={(v) => canFullWhiteLabel && updateBranding({ showPoweredBy: v })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Colors Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="colors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  {t("whiteLabel.colorPresets")}
                </CardTitle>
                <CardDescription>{t("whiteLabel.colorPresetsDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => updateBranding({ primaryColor: preset.primary, accentColor: preset.accent })}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        branding.primaryColor === preset.primary
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div
                        className="h-8 w-full rounded-md mb-2"
                        style={{ background: `linear-gradient(135deg, hsl(${preset.primary}) 0%, hsl(${preset.accent}) 100%)` }}
                      />
                      <p className="text-xs font-medium truncate">{preset.name}</p>
                    </button>
                  ))}
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { label: t("whiteLabel.primaryColor"), key: "primaryColor" as const },
                    { label: t("whiteLabel.accentColor"),  key: "accentColor"  as const },
                    { label: t("whiteLabel.sidebarBackground"), key: "sidebarBgColor" as const },
                  ].map(({ label, key }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={hslToHex(branding[key] as string)}
                          onChange={(e) => updateBranding({ [key]: hexToHsl(e.target.value) })}
                          className="h-10 w-14 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={branding[key] as string}
                          onChange={(e) => updateBranding({ [key]: e.target.value })}
                          className="flex-1 font-mono text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Live Preview */}
            <Card>
              <CardHeader><CardTitle className="text-lg">{t("whiteLabel.livePreview")}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Button className="w-full">{t("whiteLabel.primaryButton")}</Button>
                    <Button variant="outline" className="w-full">{t("whiteLabel.secondaryButton")}</Button>
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                      <p className="text-sm font-medium text-primary">{t("whiteLabel.highlightedCard")}</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg text-white" style={{ background: `hsl(${branding.sidebarBgColor})` }}>
                    <p className="text-sm font-medium mb-2">{t("whiteLabel.sidebarPreview")}</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-white/10">
                        <div className="h-4 w-4 rounded bg-white/30" />
                        <span className="text-sm">{t("sidebar.dashboard")}</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-lg">
                        <div className="h-4 w-4 rounded bg-white/30" />
                        <span className="text-sm opacity-70">{t("sidebar.inbox")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Domain Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="domain" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  {t("whiteLabel.customDomain")}
                </CardTitle>
                <CardDescription>{t("whiteLabel.customDomainDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!canCustomDomain ? (
                  <EnterpriseBanner feature="Custom domains" plan={customDomainPlan} />
                ) : (
                  <>
                    {/* Add new domain */}
                    <div className="flex gap-2">
                      <Input
                        value={newHostname}
                        onChange={e => setNewHostname(e.target.value)}
                        placeholder="app.yourdomain.com"
                        onKeyDown={e => e.key === "Enter" && handleAddHostname()}
                        className="flex-1"
                      />
                      <Button onClick={handleAddHostname} disabled={domainAdding || !newHostname.trim()}>
                        {domainAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                        Connect
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">Enter your domain, then configure the DNS records shown below.</p>

                    {/* Existing hostnames */}
                    {domainLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                      </div>
                    ) : customHostnames.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No custom domains connected yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {customHostnames.map(ch => (
                          <div key={ch.id} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {ch.status === "active"
                                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  : ch.status === "blocked"
                                  ? <AlertCircle className="h-4 w-4 text-destructive" />
                                  : <Clock className="h-4 w-4 text-amber-500 animate-pulse" />}
                                <span className="font-mono text-sm font-medium">{ch.hostname}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${
                                  ch.status === "active" ? "bg-green-500/10 text-green-600 border-green-500/20" :
                                  ch.status === "blocked" ? "bg-destructive/10 text-destructive border-destructive/20" :
                                  "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                }`}>{ch.status}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => handleRefreshStatus(ch.id)}
                                  disabled={refreshingId === ch.id}
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 ${refreshingId === ch.id ? "animate-spin" : ""}`} />
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => handleDeleteHostname(ch.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            {(ch.status !== "active" || ch.ssl?.status !== "active") && ch.verificationRecords.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">DNS Records to configure</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ch.ssl?.status === "active" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>SSL: {ch.ssl?.status === "active" ? "active" : "pending"}</span>
                                </div>
                                {ch.verificationRecords.map((rec, i) => (
                                  <div key={i} className="text-xs rounded bg-background border p-2 space-y-1">
                                    {[
                                      { label: "Type",  val: rec.type },
                                      { label: "Name",  val: rec.name },
                                      { label: "Value", val: rec.value },
                                    ].map(({ label, val }) => (
                                      <div key={label} className="flex justify-between items-center gap-2">
                                        <span className="text-muted-foreground w-10 shrink-0">{label}</span>
                                        <span className="font-mono flex-1 break-all">{val}</span>
                                        <button onClick={() => copyToClipboard(val)} className="shrink-0 text-muted-foreground hover:text-foreground">
                                          {copiedVal === val ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                  Add these records at your DNS provider, then click the refresh button to re-check status.
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Legal URLs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  Legal URLs
                </CardTitle>
                <CardDescription>Custom links shown in login pages, emails, and the chat widget footer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Terms of Service URL</Label>
                  <Input
                    value={branding.termsUrl}
                    onChange={(e) => updateBranding({ termsUrl: e.target.value })}
                    placeholder="https://yourcompany.com/terms"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Privacy Policy URL</Label>
                  <Input
                    value={branding.privacyUrl}
                    onChange={(e) => updateBranding({ privacyUrl: e.target.value })}
                    placeholder="https://yourcompany.com/privacy"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default FLYN.AI legal pages.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Email Tab ──────────────────────────────────────────────────── */}
          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  {t("whiteLabel.emailBranding")}
                </CardTitle>
                <CardDescription>{t("whiteLabel.emailBrandingDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("whiteLabel.fromName")}</Label>
                    <Input
                      value={branding.emailFromName}
                      onChange={(e) => updateBranding({ emailFromName: e.target.value })}
                      placeholder="Your Company"
                    />
                    <p className="text-xs text-muted-foreground">{t("whiteLabel.fromNameDesc")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reply-to email</Label>
                    <Input
                      value={branding.customEmailDomain}
                      onChange={(e) => updateBranding({ customEmailDomain: e.target.value })}
                      placeholder="noreply@yourcompany.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used as the Reply-To on your outbound emails. To send <em>from</em> your own
                      domain, connect that domain's mailbox under Settings → Channels → Email — its
                      SPF/DKIM authenticate your sends.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("whiteLabel.emailFooter")}</Label>
                  <Input
                    value={branding.emailFooterText}
                    onChange={(e) => updateBranding({ emailFooterText: e.target.value })}
                    placeholder="Powered by Your Company"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Email Logo</Label>
                  <Select
                    value={branding.emailLogoMode || 'logo'}
                    onValueChange={(v) => {
                      const mode = v as 'logo' | 'name';
                      updateBranding({ emailLogoMode: mode });
                      // Also sync to occasions prefs so the email service picks it up
                      authedFetch(`${API_BASE_URL}/occasions/prefs`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ logoMode: mode }),
                      }).catch(() => {});
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="logo">Show Organization Logo</SelectItem>
                      <SelectItem value="name">Show Name Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Controls whether your logo image or company name appears at the top of emails. Upload your logo in the Branding tab.</p>
                </div>

                {/* Email Preview */}
                <div className="p-4 rounded-lg border bg-white dark:bg-gray-900">
                  <p className="text-sm font-medium mb-3">{t("whiteLabel.emailPreview")}</p>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="p-4 bg-muted/30 border-b flex items-center gap-3">
                      {(branding.emailLogoMode !== 'name') && branding.logoUrl ? (
                        <img src={branding.logoUrl} alt="Logo" className="h-6" />
                      ) : (
                        <span className="font-bold text-primary">{branding.logoText}</span>
                      )}
                    </div>
                    <div className="p-4 text-sm">
                      <p className="text-muted-foreground mb-2">{t("whiteLabel.emailHello")}</p>
                      <p className="text-muted-foreground mb-4">{t("whiteLabel.emailPreviewText")}</p>
                      <Button size="sm">{t("whiteLabel.callToAction")}</Button>
                    </div>
                    <div className="p-3 bg-muted/30 border-t text-center text-xs text-muted-foreground">
                      {branding.emailFooterText}
                      {branding.termsUrl && (
                        <> · <a href={branding.termsUrl} className="underline" target="_blank" rel="noreferrer">Terms</a></>
                      )}
                      {branding.privacyUrl && (
                        <> · <a href={branding.privacyUrl} className="underline" target="_blank" rel="noreferrer">Privacy</a></>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Your domains — add + DNS-verify ownership (gates mailbox creation) */}
            <EmailDomainManager onDomainsChange={() => setDomainsVersion((v) => v + 1)} />

            {/* Team mailboxes — create on a verified domain + link to teams/people */}
            <MailboxManager refreshSignal={domainsVersion} />
          </TabsContent>

          {/* ── Reseller Tab ───────────────────────────────────────────────── */}
          <TabsContent value="reseller" className="space-y-4">
            {!canReseller ? (
              <Card>
                <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
                  <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Building2 className="h-7 w-7 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Reseller Mode</p>
                    <p className="text-muted-foreground text-sm mt-1 max-w-md">
                      Manage multiple client workspaces under your brand. Requires {resellerPlan ?? "ENTERPRISE"}+.
                    </p>
                  </div>
                  <EnterpriseBanner feature="Reseller mode" plan={resellerPlan} />
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Reseller mode toggle */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Reseller Mode
                    </CardTitle>
                    <CardDescription>Manage client workspaces under your brand with isolated data and billing</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="font-medium">Enable Reseller Mode</Label>
                        <p className="text-sm text-muted-foreground">Activates the client workspace management panel below</p>
                      </div>
                      <Switch checked={resellerMode} onCheckedChange={setResellerMode} />
                    </div>
                  </CardContent>
                </Card>

                {/* Chatbot identity */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Bot className="h-5 w-5" />
                      Chatbot Identity
                    </CardTitle>
                    <CardDescription>The name and avatar your AI assistant uses across all channels</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4 items-start">
                      <div className="space-y-1.5">
                        <Label>Chatbot Name</Label>
                        <Input
                          value={branding.chatbotName}
                          onChange={(e) => updateBranding({ chatbotName: e.target.value })}
                          placeholder="Aria, Nova, Max…"
                        />
                      </div>
                      <div>
                        <Label className="block mb-1.5">Chatbot Avatar</Label>
                        <UploadZone
                          url={branding.chatbotAvatarUrl}
                          onUpload={makeUploadHandler("chatbotAvatarUrl")}
                          onRemove={() => updateBranding({ chatbotAvatarUrl: null })}
                          label="Upload avatar (square, min 128×128)"
                          height="p-4"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* WhatsApp business profile */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageCircle className="h-5 w-5" />
                      WhatsApp Business Profile
                    </CardTitle>
                    <CardDescription>Shown as the sender name in WhatsApp conversations</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>WhatsApp Business Name</Label>
                      <Input
                        value={branding.whatsappBusinessName}
                        onChange={(e) => updateBranding({ whatsappBusinessName: e.target.value })}
                        placeholder="Your Company Support"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must match the name registered with Meta's WhatsApp Business API.
                    </p>
                  </CardContent>
                </Card>

                {/* Sub-accounts */}
                {canSubAccounts && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Client Workspaces
                      </CardTitle>
                      <CardDescription>Each client gets an isolated workspace with your branding applied</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Add new client */}
                      <div className="flex gap-2">
                        <Input
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          placeholder="Client name"
                          className="flex-1"
                        />
                        <Input
                          value={newClientDomain}
                          onChange={(e) => setNewClientDomain(e.target.value)}
                          placeholder="client.yourdomain.com"
                          className="flex-1"
                        />
                        <Button
                          className="shrink-0"
                          onClick={() => {
                            if (!newClientName.trim()) return;
                            toast.success(`Workspace created for ${newClientName}`);
                            setNewClientName(""); setNewClientDomain("");
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                      </div>

                      {/* Sub-account list */}
                      <div className="space-y-2">
                        {subAccounts.map((acc) => (
                          <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {acc.name[0]}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{acc.name}</p>
                                <p className="text-xs text-muted-foreground">{acc.domain}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{acc.plan}</Badge>
                              <Badge
                                className={`text-xs ${acc.status === "active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-muted text-muted-foreground"}`}
                                variant="outline"
                              >
                                {acc.status}
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Billing passthrough */}
                {canBillingPass && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Billing Passthrough
                      </CardTitle>
                      <CardDescription>Charge clients directly and apply a markup on top of FLYN's base rate</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="font-medium">Enable billing passthrough</Label>
                          <p className="text-sm text-muted-foreground">Clients are billed separately through your Stripe account</p>
                        </div>
                        <Switch checked={billingPassthrough} onCheckedChange={setBillingPassthrough} />
                      </div>
                      {billingPassthrough && (
                        <div className="space-y-1.5 pt-2 border-t border-border/40">
                          <Label>Markup percentage (%)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number" min={0} max={200}
                              value={markupPercent}
                              onChange={(e) => setMarkupPercent(e.target.value)}
                              className="w-28"
                            />
                            <span className="text-sm text-muted-foreground">
                              e.g. base $60/mo → client billed ${(60 * (1 + Number(markupPercent) / 100)).toFixed(0)}/mo
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            FLYN charges you the base plan rate. You charge your client the marked-up amount via Stripe Connect.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Save indicator */}
        {isCustomized && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg"
          >
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">{t("whiteLabel.changesSaved")}</span>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
};

export default withPlanGate("branding.full_white_label")(WhiteLabel);
