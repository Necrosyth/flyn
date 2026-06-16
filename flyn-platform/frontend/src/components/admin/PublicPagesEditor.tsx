import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLandingContent } from "@/contexts/LandingContentContext";
import { Save, Eye, Loader2, FileText, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type PageDef = {
  key: string;
  label: string;
  href: string;
};

const PAGE_DEFS: PageDef[] = [
  { key: "product", label: "Product", href: "/product" },
  { key: "product/inbox", label: "Unified Inbox", href: "/product/inbox" },
  { key: "product/events", label: "Events", href: "/product/events" },
  { key: "product/church", label: "Church", href: "/product/church" },
  { key: "product/coaches", label: "Coaches", href: "/product/coaches" },
  { key: "product/ai", label: "AI Automation", href: "/product/ai" },
  { key: "product/telephony", label: "Telephony", href: "/product/telephony" },
  { key: "product/analytics", label: "Analytics & Billing", href: "/product/analytics" },
  { key: "product/website-builder", label: "Website Builder", href: "/product/website-builder" },
  { key: "product/domain-hosting", label: "Domain + Hosting", href: "/product/domain-hosting" },

  { key: "features/ai-agents", label: "AI Agents", href: "/features/ai-agents" },
  { key: "features/automation", label: "Automation", href: "/features/automation" },
  { key: "features/security", label: "Enterprise Security", href: "/features/security" },
  { key: "features/analytics", label: "Analytics", href: "/features/analytics" },
  { key: "features/channels", label: "Multiple Channels", href: "/features/channels" },

  { key: "about", label: "About us", href: "/about" },
  { key: "company", label: "Our company", href: "/company" },
  { key: "brand", label: "Brand Assets", href: "/brand" },
  { key: "contact", label: "Contact us", href: "/contact" },
  { key: "blog", label: "Blog", href: "/blog" },
  { key: "jobs", label: "Jobs", href: "/jobs" },
  { key: "events", label: "Events", href: "/events" },
  { key: "customers", label: "Customers", href: "/customers" },
  { key: "legal/privacy", label: "Privacy", href: "/legal/privacy" },
  { key: "legal/security", label: "Security", href: "/legal/security" },
  { key: "legal/terms", label: "Terms", href: "/legal/terms" },
  { key: "support/knowledge-base", label: "Knowledge Base", href: "/support/knowledge-base" },
  { key: "support/global", label: "Global support", href: "/support/global" },
  { key: "support/uae", label: "UAE support", href: "/support/uae" },
  { key: "support/africa", label: "Africa support", href: "/support/africa" },
  { key: "support/north-america", label: "North America support", href: "/support/north-america" },
];

export function PublicPagesEditor() {
  const { content, updatePage, isSaving } = useLandingContent();

  const [selectedKey, setSelectedKey] = useState<string>(PAGE_DEFS[0].key);
  const selectedDef = useMemo(() => PAGE_DEFS.find((p) => p.key === selectedKey) ?? PAGE_DEFS[0], [selectedKey]);
  const selectedPage = content.pages[selectedKey];

  const [title, setTitle] = useState<string>(selectedPage?.title ?? "");
  const [body, setBody] = useState<string>(selectedPage?.body ?? "");
  const [metaTitle, setMetaTitle] = useState<string>(selectedPage?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState<string>(selectedPage?.metaDescription ?? "");
  const [ogTitle, setOgTitle] = useState<string>(selectedPage?.ogTitle ?? "");
  const [ogDescription, setOgDescription] = useState<string>(selectedPage?.ogDescription ?? "");
  const [canonicalUrl, setCanonicalUrl] = useState<string>(selectedPage?.canonicalUrl ?? "");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const p = content.pages[selectedKey];
    setTitle(p?.title ?? "");
    setBody(p?.body ?? "");
    setMetaTitle(p?.metaTitle ?? "");
    setMetaDescription(p?.metaDescription ?? "");
    setOgTitle(p?.ogTitle ?? "");
    setOgDescription(p?.ogDescription ?? "");
    setCanonicalUrl(p?.canonicalUrl ?? "");
    setHasChanges(false);
  }, [content.pages, selectedKey]);

  const mark = () => setHasChanges(true);

  const handleSave = async () => {
    await updatePage(selectedKey, { title, body, metaTitle, metaDescription, ogTitle, ogDescription, canonicalUrl });
    setHasChanges(false);
    toast({ title: "Page updated", description: `${selectedDef.label} saved successfully.` });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Public Pages
              </CardTitle>
              <CardDescription>Edit the content for your legal, support, and company pages</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={selectedDef.href} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </a>
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="flyn-button-gradient"
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Page</Label>
              <div className="space-y-1 rounded-xl border border-border bg-background/40 p-2">
                {PAGE_DEFS.map((p) => {
                  const active = p.key === selectedKey;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setSelectedKey(p.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.href}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-5">
              {/* Page content */}
              <div className="space-y-2">
                <Label>Page Title <span className="text-muted-foreground font-normal">(shown on page)</span></Label>
                <Input value={title} onChange={(e) => { setTitle(e.target.value); mark(); }} placeholder="Page title" />
              </div>

              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  value={body}
                  onChange={(e) => { setBody(e.target.value); mark(); }}
                  placeholder="Write your page HTML here..."
                  rows={10}
                />
                <p className="text-xs text-muted-foreground">
                  You can use HTML with Tailwind utility classes. Scripts and inline handlers are removed.
                </p>
              </div>

              {/* SEO metadata */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Search className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">SEO &amp; Social Metadata</span>
                </div>

                <div className="space-y-2">
                  <Label>Browser Tab Title <span className="text-muted-foreground font-normal">(meta title)</span></Label>
                  <Input
                    value={metaTitle}
                    onChange={(e) => { setMetaTitle(e.target.value); mark(); }}
                    placeholder={`${title || "Page Title"} | Flyn AI`}
                  />
                  <p className="text-xs text-muted-foreground">Shown in browser tabs and Google results. Keep under 60 characters. Defaults to the page title above if left empty.</p>
                </div>

                <div className="space-y-2">
                  <Label>Meta Description</Label>
                  <Textarea
                    value={metaDescription}
                    onChange={(e) => { setMetaDescription(e.target.value); mark(); }}
                    placeholder="150–160 char unique description shown in search results…"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">{metaDescription.length}/160 characters</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>OG Title <span className="text-muted-foreground font-normal">(social share)</span></Label>
                    <Input
                      value={ogTitle}
                      onChange={(e) => { setOgTitle(e.target.value); mark(); }}
                      placeholder="Title shown when shared on social"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG Description</Label>
                    <Input
                      value={ogDescription}
                      onChange={(e) => { setOgDescription(e.target.value); mark(); }}
                      placeholder="Description shown when shared on social"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Canonical URL</Label>
                  <Input
                    value={canonicalUrl}
                    onChange={(e) => { setCanonicalUrl(e.target.value); mark(); }}
                    placeholder={`https://myflynai.com${selectedDef.href}`}
                  />
                  <p className="text-xs text-muted-foreground">Prevents duplicate content penalties. Usually matches the page URL exactly.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
