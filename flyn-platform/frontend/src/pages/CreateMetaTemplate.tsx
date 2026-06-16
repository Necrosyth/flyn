import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { authedFetch } from "@/services/authApi";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/api";
import { withPlanGate } from "@/components/PlanGate";
import {
  ChevronLeft, ChevronRight, Check, Plus, X, Loader2, Send,
  Info, MessageSquare, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

const WA_API = `${API_BASE_URL}/channels/whatsapp`;

const STEP_LABELS = ["Basic Info", "Header", "Body", "Buttons", "Variables", "Review & Submit"];

const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi",    label: "Hindi" },
  { code: "es",    label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "ar",    label: "Arabic" },
  { code: "fr",    label: "French" },
  { code: "de",    label: "German" },
  { code: "id",    label: "Indonesian" },
];

const TEMPLATE_TYPES = [
  { id: "standard"  as const, label: "Standard", desc: "Text, media, buttons",    badge: null },
  { id: "carousel"  as const, label: "Carousel", desc: "Multiple image cards",    badge: "Coming soon" },
  { id: "catalog"   as const, label: "Catalog",  desc: "Product catalog message", badge: "Coming soon" },
];

type TemplateType  = "standard" | "carousel" | "catalog";
type HeaderFormat  = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
type BtnType       = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
type Category      = "MARKETING" | "UTILITY" | "AUTHENTICATION";

interface BtnDef {
  type: BtnType;
  text: string;
  value: string;
}

interface FormState {
  templateType:    TemplateType;
  name:            string;
  language:        string;
  category:        Category;
  headerEnabled:   boolean;
  headerFormat:    HeaderFormat;
  headerText:      string;
  body:            string;
  footerEnabled:   boolean;
  footer:          string;
  buttonsEnabled:  boolean;
  buttons:         BtnDef[];
  variableSamples: Record<string, string>;
}

const BLANK: FormState = {
  templateType: "standard", name: "", language: "en_US", category: "UTILITY",
  headerEnabled: false, headerFormat: "TEXT", headerText: "",
  body: "", footerEnabled: false, footer: "",
  buttonsEnabled: false, buttons: [], variableSamples: {},
};

function extractVars(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out.sort((a, b) => Number(a) - Number(b));
}

function allVars(form: FormState): string[] {
  const fromHeader = form.headerEnabled && form.headerFormat === "TEXT" ? extractVars(form.headerText) : [];
  const fromBody   = extractVars(form.body);
  return [...new Set([...fromHeader, ...fromBody])].sort((a, b) => Number(a) - Number(b));
}

function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.name.trim()) return "Template name is required.";
    if (!/^[a-z0-9_]+$/.test(form.name)) return "Only lowercase letters, numbers and underscores allowed.";
    return null;
  }
  if (step === 1) {
    if (form.headerEnabled && form.headerFormat === "TEXT" && !form.headerText.trim())
      return "Header text is required when Text header is enabled.";
    return null;
  }
  if (step === 2) {
    if (!form.body.trim()) return "Message body is required.";
    return null;
  }
  if (step === 3) {
    if (form.buttonsEnabled) {
      for (const btn of form.buttons) {
        if (!btn.text.trim()) return "All button labels are required.";
        if (btn.type === "URL") {
          if (!btn.value.trim()) return "Visit URL button requires a destination URL.";
          if (!/^https?:\/\//i.test(btn.value.trim())) return "URL must start with https:// (or http://).";
        }
        if (btn.type === "PHONE_NUMBER") {
          if (!btn.value.trim()) return "Call Phone button requires a phone number.";
          if (!btn.value.trim().startsWith("+")) return "Phone number must include country code and start with + (e.g. +971501234567).";
        }
      }
    }
    return null;
  }
  if (step === 4) {
    for (const v of allVars(form)) {
      if (!form.variableSamples[v]?.trim()) return `Sample value required for {{${v}}}.`;
    }
    return null;
  }
  return null;
}

// ─── Phone mockup ─────────────────────────────────────────────────────────────

const PhoneMockup = ({ form }: { form: FormState }) => {
  const resolve = (t: string) =>
    t.replace(/\{\{(\d+)\}\}/g, (_, n) => form.variableSamples[n]?.trim() || `{{${n}}}`);

  const headerText       = form.headerEnabled && form.headerFormat === "TEXT" && form.headerText ? resolve(form.headerText) : null;
  const showMediaHolder  = form.headerEnabled && form.headerFormat !== "TEXT";
  const bodyText         = form.body ? resolve(form.body) : "";
  const showButtons      = form.buttonsEnabled && form.buttons.length > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">Live Preview</p>

      {/* Phone shell */}
      <div className="relative" style={{ width: 232 }}>
        {/* Volume buttons */}
        <div className="absolute -left-[5px] top-[86px] w-1 h-7 bg-[#2a2a2a] rounded-l-md" />
        <div className="absolute -left-[5px] top-[122px] w-1 h-7 bg-[#2a2a2a] rounded-l-md" />
        {/* Power button */}
        <div className="absolute -right-[5px] top-[104px] w-1 h-14 bg-[#2a2a2a] rounded-r-md" />

        {/* Body */}
        <div className="bg-[#1c1c1e] rounded-[40px] p-[9px] shadow-2xl shadow-black/60 border border-[#2e2e2e]">
          <div className="rounded-[32px] overflow-hidden flex flex-col bg-[#ECE5DD]">

            {/* Status bar with pill notch */}
            <div className="bg-[#1c1c1e] h-7 flex items-end justify-between px-4 pb-1 relative">
              <span className="text-foreground text-[8px] font-semibold">9:41</span>
              <div className="absolute left-1/2 top-0 -translate-x-1/2 w-16 h-4 bg-[#1c1c1e] rounded-b-3xl" />
              <div className="flex items-center gap-0.5 opacity-70">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="white"><rect x="0" y="1" width="2" height="7" rx="1"/><rect x="3" y="0" width="2" height="8" rx="1"/><rect x="6" y="2" width="2" height="6" rx="1"/><rect x="9" y="3" width="1" height="5" rx="0.5"/></svg>
                <svg width="10" height="8" viewBox="0 0 12 8" fill="white"><rect x="1" y="2" width="10" height="5" rx="1" fillOpacity=".3"/><rect x="2" y="3" width="7" height="3" rx=".5"/><rect x="11" y="3" width="1" height="2" rx=".5"/></svg>
              </div>
            </div>

            {/* WA header */}
            <div className="bg-[#075E54] px-2.5 py-1.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                <span className="text-foreground text-[9px] font-bold">B</span>
              </div>
              <div>
                <p className="text-foreground text-[9px] font-semibold leading-none">Business</p>
                <p className="text-[#B2DFDB] text-[7px] mt-0.5">online</p>
              </div>
            </div>

            {/* Chat area */}
            <div className="px-2 py-3 flex flex-col gap-2" style={{ minHeight: 280, background: "#E5DDD5" }}>
              <div className="ml-auto max-w-[185px]">
                <div className="bg-[#DCF8C6] rounded-lg rounded-tr-none px-2.5 py-2 shadow-sm">
                  {showMediaHolder && (
                    <div className="w-full h-14 bg-[#c3d4c0] rounded mb-1.5 flex items-center justify-center">
                      <span className="text-[#5a7a58] text-[8px]">
                        {form.headerFormat === "IMAGE" ? "📷 Image" : form.headerFormat === "VIDEO" ? "🎥 Video" : "📎 Document"}
                      </span>
                    </div>
                  )}
                  {headerText && (
                    <p className="text-[9px] font-bold text-[#1a1a1a] mb-1 leading-tight">{headerText}</p>
                  )}
                  <p className="text-[9px] text-[#1a1a1a] leading-relaxed whitespace-pre-wrap break-words">
                    {bodyText || <span className="text-[#9E9E9E] italic">Your message will appear here…</span>}
                  </p>
                  {form.footerEnabled && form.footer && (
                    <p className="text-[7px] text-[#757575] mt-1">{form.footer}</p>
                  )}
                  <p className="text-[6px] text-[#757575] text-right mt-1">9:41 AM ✓✓</p>
                </div>
                {showButtons && (
                  <div className="bg-white rounded-lg mt-0.5 overflow-hidden divide-y divide-[#e5e5e5] shadow-sm">
                    {form.buttons.slice(0, 3).map((btn, i) => (
                      <div key={i} className="px-2 py-1.5 text-center">
                        <span className="text-[#00A5F5] text-[8px] font-medium">{btn.text || `Button ${i + 1}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Input bar */}
            <div className="bg-[#F0F0F0] px-2 py-1.5 flex items-center gap-1.5">
              <div className="flex-1 bg-white rounded-full px-3 py-1 border border-[#ddd]">
                <span className="text-[#BDBDBD] text-[8px]">Type a message</span>
              </div>
              <div className="w-6 h-6 bg-[#25D366] rounded-full flex items-center justify-center shrink-0">
                <Send className="w-2.5 h-2.5 text-foreground" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Stepper ─────────────────────────────────────────────────────────────────

const Stepper = ({ current, onStepClick }: { current: number; onStepClick: (i: number) => void }) => (
  <div className="flex items-start gap-0">
    {STEP_LABELS.map((label, i) => {
      const done   = i < current;
      const active = i === current;
      return (
        <div key={i} className="flex items-start">
          <button
            type="button"
            onClick={() => done ? onStepClick(i) : undefined}
            disabled={!done}
            className={cn("flex flex-col items-center gap-1.5", done ? "cursor-pointer" : "cursor-default")}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all",
              done   && "bg-green-500 border-green-500 text-white",
              active && "bg-blue-600 border-blue-600 text-white",
              !done && !active && "bg-transparent border-slate-600 text-muted-foreground",
            )}>
              {done ? <Check className="w-4 h-4" /> : <span>{i + 1}</span>}
            </div>
            <span className={cn(
              "text-[10px] font-medium whitespace-nowrap",
              active && "text-foreground",
              done   && "text-green-400",
              !done && !active && "text-muted-foreground",
            )}>{label}</span>
          </button>
          {i < STEP_LABELS.length - 1 && (
            <div className={cn(
              "h-0.5 w-8 xl:w-10 mx-1 mt-4 rounded-full shrink-0",
              i < current ? "bg-green-500" : "bg-slate-700",
            )} />
          )}
        </div>
      );
    })}
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

function CreateMetaTemplate() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep]               = useState(0);
  const [form, setForm]               = useState<FormState>({ ...BLANK });
  const [submitting, setSubmitting]   = useState(false);
  const [submitResult, setSubmitResult] = useState<{ status: string; id?: string } | null>(null);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [stepError, setStepError]     = useState<string | null>(null);

  const patch = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setStepError(null);
  }, []);

  const handleNext = () => {
    const err = validateStep(step, form);
    if (err) { setStepError(err); return; }
    setStepError(null);
    setStep(s => Math.min(s + 1, STEP_LABELS.length - 1));
  };

  const handleBack = () => { setStepError(null); setStep(s => Math.max(s - 1, 0)); };

  const handleStepClick = (i: number) => { setStep(i); setStepError(null); };

  const handleAddBtn = () => {
    if (form.buttons.length >= 3) return;
    patch("buttons", [...form.buttons, { type: "QUICK_REPLY", text: "", value: "" }]);
  };

  const handleRemoveBtn = (i: number) => patch("buttons", form.buttons.filter((_, idx) => idx !== i));

  const updateBtn = (i: number, p: Partial<BtnDef>) =>
    patch("buttons", form.buttons.map((b, idx) => idx === i ? { ...b, ...p } : b));

  const vars = allVars(form);

  const handleSubmit = async () => {
    if (form.templateType !== "standard") {
      toast({ variant: "destructive", title: "Not supported yet", description: "Carousel and Catalog templates require Meta partner access. Use Standard for now." });
      return;
    }
    const err = validateStep(4, form);
    if (err) { setStepError(err); return; }
    setSubmitting(true);
    setStepError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        category: form.category,
        language: form.language,
        body: { text: form.body },
      };
      if (form.headerEnabled) {
        if (form.headerFormat === "TEXT" && form.headerText.trim()) {
          payload.header = { format: "TEXT", text: form.headerText };
        } else if (form.headerFormat !== "TEXT") {
          payload.header = { format: form.headerFormat };
        }
      }
      if (form.footerEnabled && form.footer.trim()) payload.footer = { text: form.footer };
      if (form.buttonsEnabled && form.buttons.length > 0) {
        payload.buttons = form.buttons.map(b =>
          b.type === "QUICK_REPLY"    ? { type: "QUICK_REPLY",   text: b.text } :
          b.type === "URL"            ? { type: "URL",            text: b.text, url: b.value } :
                                        { type: "PHONE_NUMBER",   text: b.text, phone_number: b.value }
        );
      }
      if (vars.length > 0) {
        payload.variableSamples = form.variableSamples;
      }

      const r = await authedFetch(`${WA_API}/meta-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json() as { message?: string; template?: { status?: string; id?: string } };
      if (!r.ok) throw new Error(data.message || r.statusText);

      setSubmitResult({ status: data.template?.status || "pending", id: data.template?.id });
      toast({ title: "Template submitted!", description: "Under Meta review. Approval usually takes a few minutes to 24 hours." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStepError(`Submission failed: ${msg}`);
      toast({ variant: "destructive", title: "Submission failed", description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex bg-[#0A0A0F]" style={{ minHeight: "100%" }}>

        {/* ── Left column ── */}
        <div className={cn("flex flex-col min-w-0 transition-all duration-300", previewVisible ? "flex-1" : "w-full")}>

          {/* Page header */}
          <div className="px-8 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <button
              type="button"
              onClick={() => navigate("/plugins/whatsapp-crm")}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm mb-4 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to WhatsApp CRM
            </button>
            <h1 className="text-lg font-bold text-foreground leading-snug">
              Build and submit WhatsApp message templates for your campaigns
            </h1>
          </div>

          {/* Stepper */}
          <div className="px-8 py-5 border-b border-white/[0.06] overflow-x-auto shrink-0">
            <Stepper current={step} onStepClick={handleStepClick} />
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">

            {stepError && (
              <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                <Info className="w-4 h-4 shrink-0" />
                {stepError}
              </div>
            )}

            {/* ─ STEP 0: Basic Info ─ */}
            {step === 0 && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-3">
                  <Label className="text-sm text-foreground font-medium">Template Type</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {TEMPLATE_TYPES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => patch("templateType", t.id)}
                        className={cn(
                          "rounded-xl p-4 text-left border-2 transition-all",
                          form.templateType === t.id && t.id === "standard" && "border-blue-500 bg-blue-500/10",
                          form.templateType === t.id && t.id === "carousel" && "border-purple-500 bg-purple-500/10",
                          form.templateType === t.id && t.id === "catalog"  && "border-slate-500 bg-slate-500/10",
                          form.templateType !== t.id && "border-white/[0.08] bg-muted/30 hover:border-border",
                        )}
                      >
                        <p className={cn(
                          "font-semibold text-sm",
                          form.templateType === t.id && t.id === "standard" ? "text-blue-400"   :
                          form.templateType === t.id && t.id === "carousel" ? "text-purple-400" :
                          form.templateType === t.id                        ? "text-foreground"   : "text-foreground",
                        )}>{t.label}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{t.desc}</p>
                        {t.badge && (
                          <span className="inline-block mt-2 text-[10px] text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">{t.badge}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground font-medium">
                    Template Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={form.name}
                    onChange={e => patch("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="e.g. order_confirmation"
                    className="bg-muted/40 border-white/[0.08] text-foreground font-mono placeholder:text-muted-foreground focus:border-blue-500/60"
                  />
                  <p className="text-[11px] text-muted-foreground">Only lowercase letters, numbers and underscores — no spaces</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm text-foreground font-medium">Language</Label>
                    <Select value={form.language} onValueChange={v => patch("language", v)}>
                      <SelectTrigger className="bg-muted/40 border-white/[0.08] text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-foreground font-medium">Category</Label>
                    <Select value={form.category} onValueChange={v => patch("category", v as Category)}>
                      <SelectTrigger className="bg-muted/40 border-white/[0.08] text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTILITY">Utility</SelectItem>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Template Name Guidelines
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>• Must be unique within your WhatsApp Business Account (WABA)</li>
                    <li>• Only lowercase letters, numbers and underscores — no spaces or special characters</li>
                    <li>• Cannot be changed after submission to Meta for review</li>
                  </ul>
                </div>
              </div>
            )}

            {/* ─ STEP 1: Header ─ */}
            {step === 1 && (
              <div className="space-y-5 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm text-foreground font-medium">Add Header</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Optional — shown above your message body</p>
                  </div>
                  <Switch checked={form.headerEnabled} onCheckedChange={v => patch("headerEnabled", v)} />
                </div>

                {form.headerEnabled && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Header Type</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as HeaderFormat[]).map(fmt => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => patch("headerFormat", fmt)}
                            className={cn(
                              "rounded-lg p-3 text-center border transition-all text-xs font-medium flex flex-col items-center gap-1",
                              form.headerFormat === fmt
                                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                                : "border-white/[0.08] bg-muted/30 text-muted-foreground hover:border-border",
                            )}
                          >
                            {fmt === "TEXT"     && <MessageSquare className="w-4 h-4" />}
                            {fmt === "IMAGE"    && <span className="text-base leading-none">🖼</span>}
                            {fmt === "VIDEO"    && <span className="text-base leading-none">🎥</span>}
                            {fmt === "DOCUMENT" && <span className="text-base leading-none">📄</span>}
                            {fmt.charAt(0) + fmt.slice(1).toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {form.headerFormat === "TEXT" ? (
                      <div className="space-y-1.5">
                        <Label className="text-sm text-foreground font-medium">Header Text <span className="text-red-400">*</span></Label>
                        <Input
                          value={form.headerText}
                          onChange={e => patch("headerText", e.target.value)}
                          placeholder="Short header — variables not recommended"
                          maxLength={60}
                          className="bg-muted/40 border-white/[0.08] text-foreground placeholder:text-muted-foreground"
                        />
                        <p className="text-[11px] text-muted-foreground">{form.headerText.length}/60</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/[0.06] bg-muted/30 p-4 text-center">
                        <p className="text-muted-foreground text-sm">
                          {form.headerFormat === "IMAGE" ? "📷 Image" : form.headerFormat === "VIDEO" ? "🎥 Video" : "📎 Document"} header will be attached at send time.
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">Media uploads are handled when sending via the API, not during template creation.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t border-white/[0.06] pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-foreground font-medium">Add Footer</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Optional — displayed in small text below the message</p>
                    </div>
                    <Switch checked={form.footerEnabled} onCheckedChange={v => patch("footerEnabled", v)} />
                  </div>
                  {form.footerEnabled && (
                    <Input
                      value={form.footer}
                      onChange={e => patch("footer", e.target.value)}
                      placeholder="e.g. Reply STOP to unsubscribe"
                      maxLength={60}
                      className="bg-muted/40 border-white/[0.08] text-foreground placeholder:text-muted-foreground"
                    />
                  )}
                </div>
              </div>
            )}

            {/* ─ STEP 2: Body ─ */}
            {step === 2 && (
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground font-medium">
                      Message Body <span className="text-red-400">*</span> — use <code className="text-green-400 text-[11px]">{"{{name}}"}</code> for personalisation
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = vars.length > 0 ? String(Number(vars[vars.length - 1]) + 1) : "1";
                        patch("body", form.body + `{{${next}}}`);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Variable
                    </button>
                  </div>
                  <Textarea
                    value={form.body}
                    onChange={e => patch("body", e.target.value)}
                    placeholder={`Hello {{1}}, your order #{{2}} is confirmed and will arrive by {{3}}.`}
                    rows={7}
                    maxLength={1024}
                    className="bg-muted/40 border-white/[0.08] text-foreground placeholder:text-muted-foreground resize-none font-mono text-sm leading-relaxed"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Variables: <code className="text-green-400 text-[10px]">{"{{1}}"}</code>, <code className="text-green-400 text-[10px]">{"{{2}}"}</code>… filled in at send time
                    </p>
                    <p className={cn("text-[11px]", form.body.length > 900 ? "text-amber-400" : "text-muted-foreground")}>
                      {form.body.length}/1024
                    </p>
                  </div>
                </div>

                {vars.length > 0 && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <p className="text-xs text-blue-400 font-medium mb-2">
                      {vars.length} variable{vars.length > 1 ? "s" : ""} detected
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {vars.map(v => (
                        <span key={v} className="text-[11px] bg-blue-500/20 text-blue-300 rounded px-2 py-0.5 font-mono">{`{{${v}}}`}</span>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">You'll provide sample values in Step 5 (required by Meta).</p>
                  </div>
                )}
              </div>
            )}

            {/* ─ STEP 3: Buttons ─ */}
            {step === 3 && (
              <div className="space-y-5 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm text-foreground font-medium">Add Buttons</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Optional — up to 3 buttons below your message</p>
                  </div>
                  <Switch checked={form.buttonsEnabled} onCheckedChange={v => patch("buttonsEnabled", v)} />
                </div>

                {form.buttonsEnabled && (
                  <div className="space-y-3">
                    {form.buttons.length === 0 && (
                      <button
                        type="button"
                        onClick={handleAddBtn}
                        className="w-full rounded-lg border-2 border-dashed border-white/[0.08] py-8 text-muted-foreground hover:border-blue-500/40 hover:text-blue-400 transition-all flex flex-col items-center gap-2"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-sm">Add your first button</span>
                      </button>
                    )}
                    {form.buttons.map((btn, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-6 h-6 mt-2 rounded-full bg-muted/40 border border-white/[0.08] flex items-center justify-center text-[10px] text-muted-foreground font-semibold shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <Select value={btn.type} onValueChange={v => updateBtn(i, { type: v as BtnType, value: "" })}>
                            <SelectTrigger className="bg-muted/40 border-white/[0.08] text-foreground text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="QUICK_REPLY">Quick Reply</SelectItem>
                              <SelectItem value="URL">Visit URL</SelectItem>
                              <SelectItem value="PHONE_NUMBER">Call Phone</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={btn.text}
                            onChange={e => updateBtn(i, { text: e.target.value })}
                            placeholder="Button label"
                            className="bg-muted/40 border-white/[0.08] text-foreground text-sm placeholder:text-muted-foreground"
                          />
                          {btn.type !== "QUICK_REPLY" ? (
                            <Input
                              value={btn.value}
                              onChange={e => updateBtn(i, { value: e.target.value })}
                              placeholder={btn.type === "URL" ? "https://…" : "+1234567890"}
                              className="bg-muted/40 border-white/[0.08] text-foreground text-sm placeholder:text-muted-foreground"
                            />
                          ) : <div />}
                        </div>
                        <button type="button" onClick={() => handleRemoveBtn(i)} className="mt-2 text-muted-foreground hover:text-red-400 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {form.buttons.length > 0 && form.buttons.length < 3 && (
                      <button
                        type="button"
                        onClick={handleAddBtn}
                        className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-1"
                      >
                        <Plus className="w-4 h-4" /> Add Button
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─ STEP 4: Variables ─ */}
            {step === 4 && (
              <div className="space-y-4 max-w-2xl">
                {vars.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Check className="w-6 h-6 text-green-500" />
                    </div>
                    <p className="text-foreground font-medium">No variables in this template</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      Your template doesn't use any <code className="text-green-400">{"{{N}}"}</code> placeholders. Click Next to proceed.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-foreground font-medium">Sample Values</p>
                      <p className="text-muted-foreground text-sm mt-0.5">
                        Meta requires example content for each variable to review your template. These are not sent to recipients.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {vars.map(v => (
                        <div key={v} className="space-y-1.5">
                          <Label className="text-sm text-foreground">
                            Sample for <code className="text-green-400 text-[11px] font-mono bg-green-400/10 px-1.5 py-0.5 rounded">{`{{${v}}}`}</code>
                          </Label>
                          <Input
                            value={form.variableSamples[v] || ""}
                            onChange={e => patch("variableSamples", { ...form.variableSamples, [v]: e.target.value })}
                            placeholder={v === "1" ? "e.g. John" : v === "2" ? "e.g. ORD-12345" : "Sample value…"}
                            className="bg-muted/40 border-white/[0.08] text-foreground placeholder:text-muted-foreground"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─ STEP 5: Review & Submit ─ */}
            {step === 5 && (
              <div className="space-y-5 max-w-2xl">
                {submitResult ? (
                  <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-400" />
                      </div>
                      <p className="text-green-400 font-semibold">Template submitted for Meta review</p>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Status: <span className="text-amber-400 capitalize font-medium">{submitResult.status}</span> — Meta review usually takes a few minutes to 24 hours.
                    </p>
                    {submitResult.id && <p className="text-muted-foreground text-xs font-mono">ID: {submitResult.id}</p>}
                    <div className="flex gap-2 pt-1">
                      <Button onClick={() => navigate("/plugins/whatsapp-crm")} className="bg-green-500 hover:bg-green-600 text-white text-sm h-8">
                        View Templates
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-muted-foreground text-sm h-8"
                        onClick={() => { setForm({ ...BLANK }); setStep(0); setSubmitResult(null); }}
                      >
                        Create Another
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-foreground font-semibold">Review your template</p>
                      <p className="text-muted-foreground text-sm mt-0.5">Once submitted, the template name cannot be changed.</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] overflow-hidden">
                      {([
                        { label: "Name",     value: <code className="text-green-400 font-mono text-sm">{form.name}</code> },
                        { label: "Type",     value: <span className="capitalize">{form.templateType}</span> },
                        { label: "Category", value: form.category },
                        { label: "Language", value: LANGUAGES.find(l => l.code === form.language)?.label ?? form.language },
                        { label: "Header",   value: form.headerEnabled
                            ? form.headerFormat === "TEXT" ? `Text — "${form.headerText}"` : form.headerFormat
                            : "None" },
                        { label: "Body",     value: <span className="font-mono text-xs whitespace-pre-wrap break-all">{form.body}</span> },
                        { label: "Footer",   value: form.footerEnabled && form.footer ? form.footer : "None" },
                        { label: "Buttons",  value: form.buttonsEnabled && form.buttons.length > 0
                            ? form.buttons.map(b => b.text || "(untitled)").join(", ")
                            : "None" },
                        { label: "Variables", value: vars.length > 0
                            ? vars.map(v => `{{${v}}} → "${form.variableSamples[v] || ""}"`).join("  |  ")
                            : "None" },
                      ] as { label: string; value: React.ReactNode }[]).map(row => (
                        <div key={row.label} className="flex border-b border-white/[0.05] last:border-0">
                          <div className="w-24 shrink-0 px-4 py-3 bg-muted/30 text-xs text-muted-foreground font-medium">{row.label}</div>
                          <div className="flex-1 px-4 py-3 text-sm text-foreground">{row.value}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Bottom bar ── */}
          {!submitResult && (
            <div className="px-8 py-4 border-t border-white/[0.06] bg-[#0A0A0F] flex items-center justify-between shrink-0">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewVisible(v => !v)}
                  className="text-muted-foreground border-white/[0.08] hover:text-foreground text-xs gap-1.5"
                >
                  {previewVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {previewVisible ? "Hide Preview" : "Show Preview"}
                </Button>
                {step < STEP_LABELS.length - 1 ? (
                  <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-green-500 hover:bg-green-600 text-white gap-1.5"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submitting ? "Submitting…" : "Submit for Review"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: phone mockup ── */}
        {previewVisible && (
          <div
            className="w-80 xl:w-96 border-l border-white/[0.06] bg-[#070709] shrink-0 flex flex-col items-center justify-center py-8 self-start sticky top-0"
            style={{ height: "100vh" }}
          >
            <PhoneMockup form={form} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default withPlanGate("channels.whatsapp")(CreateMetaTemplate);
