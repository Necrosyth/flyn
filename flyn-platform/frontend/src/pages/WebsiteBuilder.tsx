import { useEffect, useState, useCallback } from "react";
import { Puck, Render, type Data } from "@measured/puck";
import "@measured/puck/puck.css";
import { puckConfig } from "@/features/websiteBuilder/blocks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import { Loader2, Eye, EyeOff, Globe, ExternalLink, Save, Undo2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { withPlanGate } from "@/components/PlanGate";

const STORAGE_KEY = "flyn_website_builder_data";

const defaultData: Data = {
  root: { props: {} },
  content: [
    {
      type: "Hero",
      props: {
        id: "hero-default",
        headline: "Welcome to Our Website",
        subheadline: "Built with Flyn",
        description: "Tell your story here. Drag blocks from the left panel to build your page.",
        primaryCta: "Get Started",
        primaryCtaUrl: "#",
        secondaryCta: "Learn More",
        secondaryCtaUrl: "#",
        background: "gradient",
      },
    },
  ],
  zones: {},
};

type ViewMode = "editor" | "preview";

function WebsiteBuilder() {
  const { user } = useAuth();
  const [data, setData] = useState<Data>(defaultData);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  // Load from Firestore (per tenant) or localStorage fallback
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, "websites", user.id ?? user.email ?? "default");

    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.puckData) setData(d.puckData as Data);
        if (d.publishedAt) setPublishedAt(d.publishedAt);
      } else {
        // Try localStorage fallback
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) setData(JSON.parse(raw) as Data);
        } catch { /* ignore */ }
      }
      setIsLoading(false);
    }, () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setData(JSON.parse(raw) as Data);
      } catch { /* ignore */ }
      setIsLoading(false);
    });

    return () => unsub();
  }, [user]);

  const handleChange = useCallback((newData: Data) => {
    setData(newData);
    setIsDirty(true);
    // Autosave to localStorage
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newData)); } catch { /* ignore */ }
  }, []);

  const handleSave = async (publish = false) => {
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        puckData: data,
        updatedAt: now,
        ...(publish ? { publishedAt: now } : {}),
      };

      if (db && user) {
        const docRef = doc(db, "websites", user.id ?? user.email ?? "default");
        await setDoc(docRef, payload, { merge: true });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }

      if (publish) {
        setPublishedAt(now);
        // Notify backend to update public site
        try {
          await authedFetch(`${API_BASE_URL}/website/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ puckData: data }),
          });
        } catch { /* backend optional */ }
      }

      setIsDirty(false);
      toast({
        title: publish ? "Published!" : "Draft saved",
        description: publish
          ? "Your site is now live."
          : "Changes saved. Click Publish to go live.",
      });
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (viewMode === "preview") {
    return (
      <AppLayout>
        <div className="space-y-4">
          {/* Preview toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">Preview Mode</Badge>
              <span className="text-sm text-muted-foreground">Viewing your site as visitors will see it</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode("editor")}>
                <EyeOff className="w-4 h-4 mr-2" />
                Back to Editor
              </Button>
              <Button
                size="sm"
                className="flyn-button-gradient"
                disabled={isSaving}
                onClick={() => handleSave(true)}
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                Publish
              </Button>
            </div>
          </div>

          {/* Preview canvas */}
          <div className="rounded-xl border border-border overflow-hidden bg-background">
            <Render config={puckConfig} data={data} />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Builder toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 p-3 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">Website Builder</h1>
            <p className="text-xs text-muted-foreground">
              {publishedAt
                ? `Last published ${new Date(publishedAt).toLocaleDateString()}`
                : "Not published yet"}
            </p>
          </div>
          {isDirty && <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/5">Unsaved changes</Badge>}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode("preview")}>
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={() => handleSave(false)}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Draft
          </Button>
          <Button
            size="sm"
            className="flyn-button-gradient"
            disabled={isSaving}
            onClick={() => handleSave(true)}
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
            Publish
          </Button>
        </div>
      </div>

      {/* Puck Editor — full height */}
      <div className="rounded-xl border border-border overflow-hidden" style={{ height: "calc(100vh - 180px)" }}>
        <Puck
          config={puckConfig}
          data={data}
          onPublish={(d) => { setData(d); handleSave(true); }}
          onChange={handleChange}
        />
      </div>
    </AppLayout>
  );
}

export default withPlanGate("website.builder")(WebsiteBuilder);
