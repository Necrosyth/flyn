import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Search, BookOpen, FileText, HelpCircle, Star, TrendingUp,
  ChevronRight, Clock, User, Zap, Lightbulb, Edit, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/services/authApi";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ??
  "https://pjpmzvu7wn.us-east-1.awsapprunner.com/api";

interface Article {
  id: string;
  tenantId: string;
  title: string;
  category: string;
  content: string;
  excerpt: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ["General", "CRM", "Automation", "Billing", "Security", "Technical", "HR", "Events", "Other"];

const KnowledgeBase = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit/create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState({ title: "", category: "General", content: "", excerpt: "" });
  const [saving, setSaving] = useState(false);

  // View article dialog
  const [viewArticle, setViewArticle] = useState<Article | null>(null);

  const tenantId = user?.organizationId ?? "";
  const isOwner = user?.role === "admin" || user?.role === "owner";

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/chatbot/knowledge-base?tenantId=${tenantId}`, {
        headers: { "x-tenant-id": tenantId },
      });
      const data = await res.json();
      setArticles(Array.isArray(data?.articles) ? data.articles : []);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", category: "General", content: "", excerpt: "" });
    setDialogOpen(true);
  };

  const openEdit = (a: Article) => {
    setEditing(a);
    setForm({ title: a.title, category: a.category, content: a.content, excerpt: a.excerpt });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: "Required", description: "Title and content are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `${API_BASE}/chatbot/knowledge-base/${editing.id}`
        : `${API_BASE}/chatbot/knowledge-base`;
      const method = editing ? "PUT" : "POST";
      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ ...form, tenantId }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: editing ? "Article updated" : "Article created", description: `"${form.title}" saved to knowledge base.` });
      setDialogOpen(false);
      load();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: Article) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    try {
      const res = await authedFetch(`${API_BASE}/chatbot/knowledge-base/${a.id}?tenantId=${tenantId}`, {
        method: "DELETE",
        headers: { "x-tenant-id": tenantId },
      });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Deleted", description: `"${a.title}" removed.` });
      load();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const filteredArticles = articles.filter(a =>
    (selectedCategory === "all" || a.category.toLowerCase() === selectedCategory.toLowerCase()) &&
    (a.title.toLowerCase().includes(search.toLowerCase()) || a.content.toLowerCase().includes(search.toLowerCase()))
  );

  const uniqueCategories = ["all", ...Array.from(new Set(articles.map(a => a.category.toLowerCase())))];

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/20 via-primary/10 to-transparent border border-border/50 p-8">
          <div className="relative z-10 max-w-2xl space-y-4">
            <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 uppercase tracking-widest text-[10px] font-black px-2 py-0.5">
              Wiki / Help Center
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Knowledge Base</h1>
            <p className="text-muted-foreground text-base">
              Articles saved here are used by the AI chatbot to answer questions automatically.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search articles..."
                  className="pl-11 h-12 bg-background/50 border-border rounded-xl"
                />
              </div>
              {isOwner && (
                <Button onClick={openCreate} className="h-12 gap-2 shrink-0">
                  <Plus className="w-4 h-4" /> New Article
                </Button>
              )}
            </div>
          </div>
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-64 h-64 bg-primary/20 blur-[100px] pointer-events-none rounded-full" />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          {uniqueCategories.map(cat => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="capitalize text-xs"
            >
              {cat === "all" ? "All Topics" : cat}
            </Button>
          ))}
        </div>

        {/* Articles */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                <FileText className="w-5 h-5 text-primary" />
                Articles
              </h2>
              <Badge variant="outline" className="text-muted-foreground text-[10px] uppercase tracking-tight">
                {filteredArticles.length} result{filteredArticles.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading...</div>
            ) : filteredArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
                <BookOpen className="w-12 h-12 text-slate-700 mb-4" />
                {articles.length === 0 ? (
                  <>
                    <p className="text-slate-400 font-medium">No articles yet</p>
                    {isOwner && <p className="text-slate-600 text-xs mt-1">Click "New Article" to add your first knowledge base entry.</p>}
                  </>
                ) : (
                  <p className="text-slate-400 font-medium">No results for "{search}"</p>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredArticles.map(article => (
                  <motion.div
                    key={article.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="group relative bg-card hover:bg-accent/5 border border-border rounded-2xl p-5 transition-all cursor-pointer"
                    onClick={() => setViewArticle(article)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant="outline" className="text-[10px] bg-muted/50 border-border text-muted-foreground capitalize">
                        {article.category}
                      </Badge>
                      {isOwner && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEdit(article)} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(article)} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors mb-1">{article.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{article.excerpt || article.content.slice(0, 160)}</p>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        Updated {new Date(article.updatedAt).toLocaleDateString()}
                      </span>
                      <ChevronRight className="w-4 h-4 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground border-b border-border pb-3">
              <Star className="w-5 h-5 text-amber-500" /> Stats
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-card border border-border">
                <span className="text-sm text-foreground font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Total articles</span>
                <Badge variant="outline" className="text-[10px]">{articles.length}</Badge>
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-card border border-border">
                <span className="text-sm text-foreground font-medium flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />Published</span>
                <Badge variant="outline" className="text-[10px]">{articles.filter(a => a.isPublished).length}</Badge>
              </div>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-card border border-border">
                <span className="text-sm text-foreground font-medium flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />Categories</span>
                <Badge variant="outline" className="text-[10px]">{new Set(articles.map(a => a.category)).size}</Badge>
              </div>
            </div>

            {isOwner && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Lightbulb className="w-4 h-4 text-primary" />Tips
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2">
                  <p>• Write articles in plain language — the AI reads the full content field.</p>
                  <p>• Use specific titles so the AI can match questions accurately.</p>
                  <p>• Unpublish articles to hide them from the AI without deleting.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Article" : "New Article"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. How to connect WhatsApp" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Content * <span className="text-muted-foreground font-normal">(the AI reads this in full)</span></Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Write the full answer here. Be specific — this is what the chatbot will use to answer questions."
                className="min-h-[160px] resize-y"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Excerpt <span className="text-muted-foreground font-normal">(optional — short summary shown in list)</span></Label>
              <Input value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Short description shown in article list..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Create Article"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Article Dialog */}
      <Dialog open={!!viewArticle} onOpenChange={() => setViewArticle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <Badge variant="outline" className="text-[10px] mb-2 capitalize">{viewArticle?.category}</Badge>
                <DialogTitle className="text-xl">{viewArticle?.title}</DialogTitle>
              </div>
              {isOwner && viewArticle && (
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => { setViewArticle(null); openEdit(viewArticle); }}>
                  <Edit className="w-3.5 h-3.5" /> Edit
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
            {viewArticle?.content}
          </div>
          <div className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last updated {viewArticle ? new Date(viewArticle.updatedAt).toLocaleDateString() : ""}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default KnowledgeBase;
