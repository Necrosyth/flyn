/**
 * EmailTemplatesPanel — list, create, edit & delete reusable email templates.
 * Mirrors the WhatsApp Templates tab, but for email with a live-preview builder.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { campaignsApi, resolveEmailHtml, type EmailTemplate, type EmailBrandingPreview } from "@/services/campaigns";
import { useBranding } from "@/contexts/BrandingContext";
import { EmailTemplateBuilder, EMPTY_TEMPLATE, type EmailTemplateDraft } from "./EmailTemplateBuilder";
import { EMAIL_LIBRARY, libraryTemplateToDraft, LIBRARY_INDUSTRIES, LIBRARY_USE_CASES, LIBRARY_COUNT, type LibraryTemplate } from "@/data/emailLibrary";
import { Plus, FileText, Trash2, Edit3, Loader2, Mail, Search, Sparkles, LibraryBig } from "lucide-react";

export const EmailTemplatesPanel = () => {
  const { toast } = useToast();
  const { branding } = useBranding();
  // Tenant branding for accurate gallery/My-Templates previews (header logo + footer).
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
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailTemplateDraft>(EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Gallery (built-in library) — additive, read-only. Does not touch saved templates.
  const [view, setView] = useState<"mine" | "library">("mine");
  const [libQuery, setLibQuery] = useState("");
  const [libIndustry, setLibIndustry] = useState("");
  const [libUseCase, setLibUseCase] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await campaignsApi.listEmailTemplates()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditingId(null); setDraft(EMPTY_TEMPLATE); setEditorOpen(true); };
  const openEdit = (t: EmailTemplate) => {
    setEditingId(t.id);
    setDraft({
      name: t.name, subject: t.subject, preheader: t.preheader || "", body: t.body,
      buttonLabel: t.buttonLabel || "", buttonUrl: t.buttonUrl || "", accent: t.accent || "#7C6FF7",
    });
    setEditorOpen(true);
  };

  // "Use this template" from the library → clone into the EXISTING editor draft → user edits →
  // Save goes through the EXISTING saveEmailTemplate path → becomes their own tenant template.
  const useLibraryTemplate = (t: LibraryTemplate) => {
    setEditingId(null);
    setDraft({ ...libraryTemplateToDraft(t), name: `${t.name}` });
    setView("mine");
    setEditorOpen(true);
  };

  const handleSave = async () => {
    // A rich library template has html but no block body — require body OR html.
    const hasContent = draft.body.trim() || draft.html?.trim();
    if (!draft.name.trim() || !draft.subject.trim() || !hasContent) {
      toast({ variant: "destructive", title: "Missing fields", description: "Name, subject and a body (or template) are required." });
      return;
    }
    setSaving(true);
    try {
      const saved = await campaignsApi.saveEmailTemplate({ ...draft, id: editingId || undefined });
      if (saved) { toast({ title: editingId ? "Template updated" : "Template created" }); setEditorOpen(false); void load(); }
      else toast({ variant: "destructive", title: "Save failed" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try { await campaignsApi.deleteEmailTemplate(id); setTemplates((prev) => prev.filter((t) => t.id !== id)); }
    finally { setDeleting(null); }
  };

  // Library filter (pure, on the static bundle — no network).
  const q = libQuery.trim().toLowerCase();
  const filteredLibrary = EMAIL_LIBRARY.filter((t) => {
    if (libIndustry && t.industry !== libIndustry) return false;
    if (libUseCase && t.category !== libUseCase) return false;
    if (q && !(t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.industry.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-semibold">Email Templates</h3>
          <p className="text-xs text-slate-400 mt-0.5">Design reusable email layouts with a live preview. Pick them when creating a campaign.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View switch: your saved templates ↔ the built-in library */}
          <div className="flex items-center p-0.5 rounded-lg bg-white/5 border border-white/10">
            <button onClick={() => setView("mine")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === "mine" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>
              My Templates
            </button>
            <button onClick={() => setView("library")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${view === "library" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>
              <LibraryBig className="w-3.5 h-3.5" /> Library
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300">{LIBRARY_COUNT}</span>
            </button>
          </div>
          {view === "mine" && (
            <Button onClick={openNew} className="bg-rose-500 hover:bg-rose-600 text-white text-sm h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Template
            </Button>
          )}
        </div>
      </div>

      {/* ── Built-in library (gallery) — read-only; "Use this" clones into the editor ── */}
      {view === "library" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <Input value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="Search templates…"
                className="pl-8 bg-white/5 border-white/10 text-white text-sm h-9" />
            </div>
            <select value={libIndustry} onChange={(e) => setLibIndustry(e.target.value)}
              className="h-9 rounded-md bg-white/5 border border-white/10 text-white text-sm px-2">
              <option value="">All industries</option>
              {LIBRARY_INDUSTRIES.map((i) => <option key={i} value={i} className="bg-[#111214]">{i}</option>)}
            </select>
            <select value={libUseCase} onChange={(e) => setLibUseCase(e.target.value)}
              className="h-9 rounded-md bg-white/5 border border-white/10 text-white text-sm px-2">
              <option value="">All use-cases</option>
              {LIBRARY_USE_CASES.map((u) => <option key={u} value={u} className="bg-[#111214]">{u}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-slate-500">{filteredLibrary.length} of {LIBRARY_COUNT} templates · built-in, ready to use</p>
          {filteredLibrary.length === 0 ? (
            <Card className="bg-white/[0.02] border-white/5"><CardContent className="p-10 text-center text-slate-500 text-sm">No templates match your filters.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLibrary.map((t) => (
                <Card key={t.id} className="bg-white/[0.03] border-white/10 overflow-hidden group">
                  <div className="h-36 bg-[#f4f4f7] overflow-hidden relative">
                    <iframe title={t.name} srcDoc={resolveEmailHtml(libraryTemplateToDraft(t), previewBranding)} sandbox=""
                      className="w-[200%] h-[200%] origin-top-left pointer-events-none" style={{ transform: "scale(0.5)" }} />
                    {t.kind === "rich" && (
                      <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/80 text-white inline-flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> Rich
                      </span>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-500 truncate mb-3">{t.industry} · {t.category}</p>
                    <Button onClick={() => useLibraryTemplate(t)} className="w-full h-8 bg-rose-500 hover:bg-rose-600 text-white text-xs gap-1.5">
                      <Plus className="w-3 h-3" /> Use this template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "mine" && (loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : templates.length === 0 ? (
        <Card className="bg-white/[0.02] border-white/5">
          <CardContent className="p-10 text-center text-slate-500">
            <FileText className="w-9 h-9 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No email templates yet.</p>
            <p className="text-xs text-slate-500 mt-1">Start from the <button onClick={() => setView("library")} className="text-rose-400 hover:underline">built-in library</button> or create one.</p>
            <Button onClick={openNew} className="mt-4 bg-rose-500 hover:bg-rose-600 text-white gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create your first template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="bg-white/[0.03] border-white/10 overflow-hidden group">
              <div className="h-32 bg-[#f4f4f7] overflow-hidden relative">
                <iframe title={t.name} srcDoc={resolveEmailHtml(t, previewBranding)} sandbox=""
                  className="w-[200%] h-[200%] origin-top-left pointer-events-none" style={{ transform: "scale(0.5)" }} />
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{t.subject}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5" title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(t.id)} disabled={deleting === t.id}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-white/5" title="Delete">
                      {deleting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="bg-[#111214] border-white/10 text-white max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-rose-400" /> {editingId ? "Edit Template" : "New Email Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 min-h-0">
            <EmailTemplateBuilder draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
          </div>
          <DialogFooter className="pt-4 border-t border-white/10">
            <Button variant="ghost" onClick={() => setEditorOpen(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {editingId ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
