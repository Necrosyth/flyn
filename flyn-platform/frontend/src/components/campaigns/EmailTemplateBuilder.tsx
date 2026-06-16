/**
 * EmailTemplateBuilder — split editor + live HTML preview.
 *
 * Left: subject, preheader, body (block text), CTA button, accent colour.
 * Right: live rendered preview (the exact HTML that gets sent), using the
 * shared renderEmailHtml() so preview === delivered email.
 *
 * Used both standalone (Templates tab) and embedded in the campaign wizard.
 */

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolveEmailHtml, type EmailBrandingPreview } from "@/services/campaigns";
import { useBranding } from "@/contexts/BrandingContext";
import { Monitor } from "lucide-react";

export interface EmailTemplateDraft {
  name: string;
  subject: string;
  preheader: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  accent: string;
  /** OPTIONAL rich HTML (a library template cloned as-is). When set, this HTML is the email body
   *  verbatim — the structured fields are ignored at render time. Absent for structured drafts. */
  html?: string;
}

export const EMPTY_TEMPLATE: EmailTemplateDraft = {
  name: "",
  subject: "",
  preheader: "",
  body: "",
  buttonLabel: "",
  buttonUrl: "",
  accent: "#7C6FF7",
};

const ACCENT_PRESETS = ["#7C6FF7", "#22C55E", "#0EA5E9", "#F59E0B", "#EF4444", "#EC4899", "#111827"];

interface Props {
  draft: EmailTemplateDraft;
  onChange: (patch: Partial<EmailTemplateDraft>) => void;
  /** Hide the template-name field when used inline in the campaign wizard */
  showName?: boolean;
  /** Sample name used for {{name}} in the preview */
  previewName?: string;
}

export const EmailTemplateBuilder = ({ draft, onChange, showName = true, previewName = "Alex" }: Props) => {
  const { branding } = useBranding();
  // Tenant branding for an ACCURATE preview — header logo + footer resolve exactly as the backend
  // will apply them at send. (From-name/Reply-To are envelope headers, applied backend-side.)
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
  // A rich library template (draft.html set) previews verbatim+branded; a structured draft previews
  // via renderEmailHtml. resolveEmailHtml picks the right one. {{name}} is substituted for the
  // sample either way so the preview matches the delivered email.
  const isRich = !!draft.html?.trim();
  const previewHtml = useMemo(
    () =>
      resolveEmailHtml({
        subject: draft.subject,
        preheader: draft.preheader,
        body: (draft.body || "").replace(/\{\{\s*name\s*\}\}/gi, previewName),
        buttonLabel: draft.buttonLabel,
        buttonUrl: draft.buttonUrl,
        accent: draft.accent,
        html: draft.html ? draft.html.replace(/\{\{\s*name\s*\}\}/gi, previewName) : undefined,
      }, previewBranding),
    [draft, previewName, previewBranding],
  );

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* ── Editor ── */}
      <div className="space-y-4">
        {showName && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template Name *</Label>
            <Input value={draft.name} onChange={(e) => onChange({ name: e.target.value })}
              placeholder="e.g. Spring Promo" className="bg-muted/40 border-border text-foreground text-sm" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Subject *</Label>
          <Input value={draft.subject} onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="Your exclusive spring offer 🌸" className="bg-muted/40 border-border text-foreground text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Preheader <span className="text-muted-foreground">— inbox preview text</span></Label>
          <Input value={draft.preheader} onChange={(e) => onChange({ preheader: e.target.value })}
            placeholder="A little something just for you…" className="bg-muted/40 border-border text-foreground text-sm" />
        </div>
        {isRich ? (
          /* Rich library template — the design is the imported HTML; block fields don't apply.
             Name + subject stay editable; "Start from blank" (clearing html) returns to the editor. */
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs text-foreground font-medium">Rich template — pre-designed layout</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This template uses its own HTML design (see the live preview). Edit the name and subject above;
              the layout is sent as-is. {"{{name}}"} still personalises. To build a custom layout instead,
              start from a blank template.
            </p>
            <button
              type="button"
              onClick={() => onChange({ html: undefined })}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Convert to an editable structured template
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Body * <span className="text-muted-foreground">— blank line = new paragraph · {"{{name}}"} personalises</span></Label>
              <Textarea value={draft.body} onChange={(e) => onChange({ body: e.target.value })}
                placeholder={"Hi {{name}},\n\nWe're excited to share our spring collection with you.\n\nUse code SPRING20 for 20% off your next order."}
                className="bg-muted/40 border-border text-foreground text-sm min-h-[160px] resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Button Label</Label>
                <Input value={draft.buttonLabel} onChange={(e) => onChange({ buttonLabel: e.target.value })}
                  placeholder="Shop Now" className="bg-muted/40 border-border text-foreground text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Button URL</Label>
                <Input value={draft.buttonUrl} onChange={(e) => onChange({ buttonUrl: e.target.value })}
                  placeholder="https://…" className="bg-muted/40 border-border text-foreground text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Accent Colour</Label>
              <div className="flex items-center gap-2">
                {ACCENT_PRESETS.map((c) => (
                  <button key={c} onClick={() => onChange({ accent: c })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${draft.accent === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ background: c }} title={c} />
                ))}
                <input type="color" value={draft.accent} onChange={(e) => onChange({ accent: e.target.value })}
                  className="w-7 h-7 rounded-full bg-transparent border border-border cursor-pointer" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Live preview ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
          <Monitor className="w-3 h-3" /> Live Preview
        </div>
        <div className="rounded-xl border border-border overflow-hidden bg-[#f4f4f7]">
          {/* Subject line bar */}
          <div className="px-4 py-2.5 bg-white border-b border-slate-200">
            <p className="text-[10px] text-muted-foreground uppercase font-bold">Subject</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{draft.subject || "(no subject)"}</p>
          </div>
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            className="w-full h-[460px] bg-white"
            sandbox=""
          />
        </div>
      </div>
    </div>
  );
};
