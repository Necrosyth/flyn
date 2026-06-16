/**
 * Church CMS — Section-based website editor
 *
 * Lets a church admin customise their public-facing page without touching code.
 * Sections: Logo · Hero · About · Sermon layout · Contact · Scripture · Social · CTA
 */

import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { churchService } from "@/services/church.service";
import {
  Loader2, Save, Eye, EyeOff, Globe, Image, BookOpen, Phone,
  Facebook, Instagram, Youtube, Palette, AlignLeft, AlignCenter,
  RefreshCw, CheckCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CMSConfig {
  logoUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  aboutText: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  featuredScripture: string;
  sermonLayout: "grid" | "list";
  socialLinks: { facebook: string; instagram: string; youtube: string };
  theme: "dark" | "light";
  accentColor: string;
}

const DEFAULT_CONFIG: CMSConfig = {
  logoUrl: "",
  heroTitle: "Welcome to Our Church Family",
  heroSubtitle: "A place of worship, community, and growth.",
  heroImageUrl: "",
  aboutText: "We are a vibrant community of believers committed to living out the Gospel in everyday life.",
  primaryCtaLabel: "Join Us This Sunday",
  primaryCtaUrl: "",
  contactEmail: "",
  contactPhone: "",
  contactAddress: "",
  featuredScripture: "For I know the plans I have for you — Jeremiah 29:11",
  sermonLayout: "grid",
  socialLinks: { facebook: "", instagram: "", youtube: "" },
  theme: "dark",
  accentColor: "#10B981",
};

// ─── Preview Component ────────────────────────────────────────────────────────

const CMSPreview = ({ config }: { config: CMSConfig }) => {
  const isDark = config.theme === "dark";
  const bg = isDark ? "bg-[#0f1117]" : "bg-white";
  const text = isDark ? "text-foreground" : "text-gray-900";
  const sub = isDark ? "text-muted-foreground" : "text-muted-foreground";

  return (
    <div className={`rounded-2xl overflow-hidden border border-border shadow-2xl text-[13px] ${bg}`}>
      {/* Nav */}
      <div className={`flex items-center justify-between px-6 py-3 border-b ${isDark ? "border-border" : "border-gray-200"}`}>
        {config.logoUrl ? (
          <img src={config.logoUrl} alt="Logo" className="h-7 object-contain" />
        ) : (
          <div className="h-7 w-24 rounded-lg" style={{ backgroundColor: config.accentColor + "33" }}>
            <div className="h-full flex items-center justify-center text-[10px] font-bold" style={{ color: config.accentColor }}>CHURCH LOGO</div>
          </div>
        )}
        <div style={{ backgroundColor: config.accentColor }} className="px-3 py-1 rounded-full text-foreground text-[11px] font-semibold">
          {config.primaryCtaLabel || "Join Us"}
        </div>
      </div>

      {/* Hero */}
      <div
        className={`relative px-8 py-10 text-center ${config.heroImageUrl ? "bg-cover bg-center" : isDark ? "bg-gradient-to-br from-emerald-900/20 to-transparent" : "bg-gradient-to-br from-emerald-50 to-white"}`}
        style={config.heroImageUrl ? { backgroundImage: `url(${config.heroImageUrl})` } : {}}
      >
        {config.heroImageUrl && <div className="absolute inset-0 bg-black/50 rounded-none" />}
        <div className="relative">
          <h1 className={`text-xl font-bold mb-2 ${config.heroImageUrl ? "text-foreground" : text}`}>{config.heroTitle}</h1>
          <p className={`text-sm ${config.heroImageUrl ? "text-white/80" : sub}`}>{config.heroSubtitle}</p>
        </div>
      </div>

      {/* About */}
      <div className={`px-8 py-5 border-b ${isDark ? "border-border" : "border-gray-100"}`}>
        <p className={`text-xs leading-relaxed ${sub}`}>{config.aboutText}</p>
      </div>

      {/* Scripture */}
      {config.featuredScripture && (
        <div className={`px-8 py-4 text-center border-b ${isDark ? "border-border bg-muted/30" : "border-gray-100 bg-gray-50"}`}>
          <p className="text-xs italic" style={{ color: config.accentColor }}>" {config.featuredScripture} "</p>
        </div>
      )}

      {/* Sermons placeholder */}
      <div className="px-8 py-5">
        <p className={`text-[10px] uppercase font-bold tracking-widest mb-3 ${sub}`}>Recent Sermons</p>
        <div className={config.sermonLayout === "grid" ? "grid grid-cols-3 gap-2" : "space-y-2"}>
          {[1, 2, 3].map(i => (
            <div key={i} className={`rounded-lg ${isDark ? "bg-muted/40" : "bg-gray-100"} ${config.sermonLayout === "grid" ? "aspect-video" : "h-8"} flex items-center justify-center`}>
              <BookOpen className={`w-4 h-4 ${isDark ? "text-muted-foreground" : "text-foreground"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className={`px-8 py-4 border-t ${isDark ? "border-border bg-muted/30" : "border-gray-100 bg-gray-50"} flex items-center justify-between`}>
        <div className={`text-[10px] space-y-0.5 ${sub}`}>
          {config.contactEmail && <p>✉ {config.contactEmail}</p>}
          {config.contactPhone && <p>📞 {config.contactPhone}</p>}
          {config.contactAddress && <p>📍 {config.contactAddress}</p>}
        </div>
        <div className="flex gap-2">
          {config.socialLinks.facebook && <div className="w-5 h-5 rounded-full bg-blue-600/20 flex items-center justify-center"><Facebook className="w-2.5 h-2.5 text-blue-400" /></div>}
          {config.socialLinks.instagram && <div className="w-5 h-5 rounded-full bg-pink-600/20 flex items-center justify-center"><Instagram className="w-2.5 h-2.5 text-pink-400" /></div>}
          {config.socialLinks.youtube && <div className="w-5 h-5 rounded-full bg-red-600/20 flex items-center justify-center"><Youtube className="w-2.5 h-2.5 text-red-400" /></div>}
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const ChurchCMS = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<CMSConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    churchService.getCMS().then((res: any) => {
      if (res?.config) setConfig({ ...DEFAULT_CONFIG, ...res.config });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const set = (key: keyof CMSConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const setNested = (parent: "socialLinks", key: string, value: string) => {
    setConfig(prev => ({ ...prev, [parent]: { ...(prev[parent] as any), [key]: value } }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await churchService.saveCMS(config as unknown as Record<string, unknown>);
      setSaved(true);
      toast({ title: "Church website saved!", description: "Your changes are live." });
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Could not save CMS config." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="force-dark flex-1 overflow-auto">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 via-teal-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Church Website CMS</h1>
                <p className="text-sm text-muted-foreground">Customise your public-facing church page — no code needed.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(p => !p)}
                className="text-muted-foreground hover:text-foreground gap-2"
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPreview ? "Hide Preview" : "Show Preview"}
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : saved ? "Saved" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>

        <div className={`px-8 py-6 ${showPreview ? "grid grid-cols-2 gap-6 items-start" : ""}`}>
          {/* Editor */}
          <div className="space-y-5">
            {/* Branding */}
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Image className="w-4 h-4 text-emerald-400" /> Branding
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Logo URL</Label>
                  <Input value={config.logoUrl} onChange={e => set("logoUrl", e.target.value)} placeholder="https://your-church.com/logo.png" className="bg-muted/40 border-border text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Theme</Label>
                    <Select value={config.theme} onValueChange={v => set("theme", v)}>
                      <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Palette className="w-3 h-3" /> Accent Color</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={config.accentColor} onChange={e => set("accentColor", e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer border border-border bg-transparent" />
                      <Input value={config.accentColor} onChange={e => set("accentColor", e.target.value)} className="bg-muted/40 border-border text-sm font-mono" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hero Section */}
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <AlignCenter className="w-4 h-4 text-blue-400" /> Hero Section
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Headline</Label>
                  <Input value={config.heroTitle} onChange={e => set("heroTitle", e.target.value)} className="bg-muted/40 border-border text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sub-headline</Label>
                  <Input value={config.heroSubtitle} onChange={e => set("heroSubtitle", e.target.value)} className="bg-muted/40 border-border text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Background image URL (optional)</Label>
                  <Input value={config.heroImageUrl} onChange={e => set("heroImageUrl", e.target.value)} placeholder="https://…" className="bg-muted/40 border-border text-sm" />
                </div>
              </CardContent>
            </Card>

            {/* About */}
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <AlignLeft className="w-4 h-4 text-purple-400" /> About Section
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">About text</Label>
                  <Textarea value={config.aboutText} onChange={e => set("aboutText", e.target.value)} className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Featured scripture</Label>
                  <Input value={config.featuredScripture} onChange={e => set("featuredScripture", e.target.value)} className="bg-muted/40 border-border text-sm italic" />
                </div>
              </CardContent>
            </Card>

            {/* Sermons */}
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" /> Sermon Layout
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  {(["grid", "list"] as const).map(layout => (
                    <button
                      key={layout}
                      onClick={() => set("sermonLayout", layout)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors capitalize ${config.sermonLayout === layout ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "text-muted-foreground border-border hover:border-border"}`}
                    >
                      {layout === "grid" ? "Grid (3 columns)" : "List (rows)"}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* CTA */}
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-green-400" /> Call To Action
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Button text</Label>
                  <Input value={config.primaryCtaLabel} onChange={e => set("primaryCtaLabel", e.target.value)} className="bg-muted/40 border-border text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Button URL</Label>
                  <Input value={config.primaryCtaUrl} onChange={e => set("primaryCtaUrl", e.target.value)} placeholder="https://…" className="bg-muted/40 border-border text-sm" />
                </div>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4 text-cyan-400" /> Contact Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input type="email" value={config.contactEmail} onChange={e => set("contactEmail", e.target.value)} className="bg-muted/40 border-border text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <Input value={config.contactPhone} onChange={e => set("contactPhone", e.target.value)} className="bg-muted/40 border-border text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input value={config.contactAddress} onChange={e => set("contactAddress", e.target.value)} placeholder="123 Church Street, City" className="bg-muted/40 border-border text-sm" />
                </div>
              </CardContent>
            </Card>

            {/* Social */}
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Facebook className="w-4 h-4 text-blue-400" /> Social Links
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Facebook className="w-3 h-3 text-blue-400" /> Facebook URL</Label>
                  <Input value={config.socialLinks.facebook} onChange={e => setNested("socialLinks", "facebook", e.target.value)} placeholder="https://facebook.com/…" className="bg-muted/40 border-border text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Instagram className="w-3 h-3 text-pink-400" /> Instagram URL</Label>
                  <Input value={config.socialLinks.instagram} onChange={e => setNested("socialLinks", "instagram", e.target.value)} placeholder="https://instagram.com/…" className="bg-muted/40 border-border text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Youtube className="w-3 h-3 text-red-400" /> YouTube URL</Label>
                  <Input value={config.socialLinks.youtube} onChange={e => setNested("socialLinks", "youtube", e.target.value)} placeholder="https://youtube.com/…" className="bg-muted/40 border-border text-sm" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Preview */}
          {showPreview && (
            <div className="sticky top-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Live Preview</p>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">Real-time</Badge>
              </div>
              <CMSPreview config={config} />
              <p className="text-[10px] text-muted-foreground text-center">Changes are reflected instantly. Click "Save Changes" to publish.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ChurchCMS;
