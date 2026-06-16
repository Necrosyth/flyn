import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, Ticket, TrendingUp, Activity, RefreshCw, ChevronDown, ChevronUp, Mail, BookOpen, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  adminGetStats,
  adminGetSessions,
  adminGetSessionMessages,
  adminGetTickets,
  adminGetSalesInquiries,
  adminGetKBArticles,
  adminCreateKBArticle,
  adminUpdateKBArticle,
  adminDeleteKBArticle,
  type ChatbotSession,
  type ChatbotMessage,
  type ChatbotTicket,
  type ChatbotSalesInquiry,
  type AdminStats,
  type KBArticle,
} from '@/services/chatbotApi';

type Tab = 'overview' | 'conversations' | 'tickets' | 'sales' | 'knowledge-base';

const KB_CATEGORIES = ['General', 'Billing', 'Technical', 'Onboarding', 'Features', 'Policies', 'Other'];

interface KBFormState {
  tenantId: string;
  title: string;
  category: string;
  content: string;
  excerpt: string;
}

const EMPTY_FORM: KBFormState = { tenantId: '', title: '', category: 'General', content: '', excerpt: '' };

export default function ChatbotAdminPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sessions, setSessions] = useState<ChatbotSession[]>([]);
  const [tickets, setTickets] = useState<ChatbotTicket[]>([]);
  const [sales, setSales] = useState<ChatbotSalesInquiry[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [threadMap, setThreadMap] = useState<Record<string, ChatbotMessage[]>>({});
  const [threadLoading, setThreadLoading] = useState<string | null>(null);

  // KB state
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbForm, setKbForm] = useState<KBFormState>(EMPTY_FORM);
  const [kbEditing, setKbEditing] = useState<KBArticle | null>(null);
  const [kbShowDialog, setKbShowDialog] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbFilterTenant, setKbFilterTenant] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sess, t, sal] = await Promise.all([
        adminGetStats(),
        adminGetSessions(),
        adminGetTickets(),
        adminGetSalesInquiries(),
      ]);
      setStats(s);
      setSessions(sess);
      setTickets(t);
      setSales(sal);
    } catch {
      toast({ title: 'Load failed', description: 'Could not fetch chatbot data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadKB = useCallback(async (tenantId?: string) => {
    setKbLoading(true);
    try {
      const articles = await adminGetKBArticles(tenantId || undefined);
      setKbArticles(articles);
    } catch {
      toast({ title: 'KB load failed', variant: 'destructive' });
    } finally {
      setKbLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (tab === 'knowledge-base') void loadKB(kbFilterTenant || undefined);
  }, [tab, loadKB, kbFilterTenant]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const toggleSession = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sessionId);
    if (threadMap[sessionId]) return;
    setThreadLoading(sessionId);
    try {
      const msgs = await adminGetSessionMessages(sessionId);
      setThreadMap(prev => ({ ...prev, [sessionId]: msgs }));
    } catch {
      toast({ title: 'Failed to load thread', variant: 'destructive' });
    } finally {
      setThreadLoading(null);
    }
  };

  const openKBCreate = () => {
    setKbEditing(null);
    setKbForm(EMPTY_FORM);
    setKbShowDialog(true);
  };

  const openKBEdit = (article: KBArticle) => {
    setKbEditing(article);
    setKbForm({
      tenantId: article.tenantId,
      title: article.title,
      category: article.category,
      content: article.content,
      excerpt: article.excerpt ?? '',
    });
    setKbShowDialog(true);
  };

  const handleKBSave = async () => {
    if (!kbForm.tenantId.trim()) {
      toast({ title: 'Tenant ID required', variant: 'destructive' }); return;
    }
    if (!kbForm.title.trim() || !kbForm.content.trim()) {
      toast({ title: 'Title and content are required', variant: 'destructive' }); return;
    }
    setKbSaving(true);
    try {
      if (kbEditing) {
        const updated = await adminUpdateKBArticle(kbForm.tenantId, kbEditing.id, {
          title: kbForm.title,
          category: kbForm.category,
          content: kbForm.content,
          excerpt: kbForm.excerpt,
        });
        setKbArticles(prev => prev.map(a => a.id === updated.id ? updated : a));
      } else {
        const created = await adminCreateKBArticle(kbForm.tenantId, {
          title: kbForm.title,
          category: kbForm.category,
          content: kbForm.content,
          excerpt: kbForm.excerpt,
        });
        setKbArticles(prev => [created, ...prev]);
      }
      setKbShowDialog(false);
      toast({ title: kbEditing ? 'Article updated' : 'Article created' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setKbSaving(false);
    }
  };

  const handleKBDelete = async (article: KBArticle) => {
    if (!confirm(`Delete "${article.title}"?`)) return;
    try {
      await adminDeleteKBArticle(article.tenantId, article.id);
      setKbArticles(prev => prev.filter(a => a.id !== article.id));
      toast({ title: 'Article deleted' });
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const handleKBTogglePublish = async (article: KBArticle) => {
    try {
      const updated = await adminUpdateKBArticle(article.tenantId, article.id, { isPublished: !article.isPublished });
      setKbArticles(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'conversations', label: 'Conversations' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'sales', label: 'Sales Leads' },
    { key: 'knowledge-base', label: 'Knowledge Base' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">RECA Chatbot Admin</h1>
          <p className="text-muted-foreground text-sm">Live visitor conversations, tickets, and sales leads</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/contact-submissions">
              <Mail className="w-4 h-4 mr-2" />
              Contact Forms
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Sessions Today', value: stats?.sessionsToday ?? '—', icon: MessageSquare, color: 'text-blue-500' },
            { label: 'Open Tickets', value: stats?.openTickets ?? '—', icon: Ticket, color: 'text-orange-500' },
            { label: 'Sales Leads', value: stats?.salesLeads ?? '—', icon: TrendingUp, color: 'text-green-500' },
            { label: 'Escalations', value: stats?.escalations ?? '—', icon: Activity, color: 'text-red-500' },
          ].map(card => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                  <span className="text-2xl font-bold">{loading ? '…' : card.value}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Conversations */}
      {tab === 'conversations' && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          )}
          {sessions.map(sess => (
            <Card key={sess.id} className="overflow-hidden">
              <button
                className="w-full text-left p-4 flex items-center justify-between hover:bg-muted/40 transition-colors"
                onClick={() => void toggleSession(sess.id)}
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-sm">{sess.visitorName}</p>
                  <p className="text-xs text-muted-foreground">{sess.visitorEmail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={sess.status === 'active' ? 'default' : 'secondary'}>{sess.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(sess.createdAt).toLocaleDateString()}
                  </span>
                  {expandedSession === sess.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {expandedSession === sess.id && (
                <div className="border-t bg-muted/20 p-4 space-y-2 max-h-80 overflow-y-auto">
                  {threadLoading === sess.id && <p className="text-xs text-muted-foreground">Loading thread…</p>}
                  {(threadMap[sess.id] ?? []).map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'visitor' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                          msg.role === 'visitor'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card border text-foreground'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Tickets */}
      {tab === 'tickets' && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && tickets.length === 0 && (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          )}
          {tickets.map(t => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">{t.visitorName} · {t.visitorEmail}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={t.status === 'open' ? 'default' : 'secondary'}>{t.status}</Badge>
                  <Badge variant="outline" className="text-xs">{t.priority}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Sales Leads */}
      {tab === 'sales' && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && sales.length === 0 && (
            <p className="text-sm text-muted-foreground">No sales inquiries yet.</p>
          )}
          {sales.map(s => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{s.visitorName}</p>
                    {s.company && (
                      <span className="text-xs text-muted-foreground">· {s.company}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.visitorEmail}</p>
                  {s.aiSummary && (
                    <p className="text-sm text-muted-foreground italic line-clamp-2">{s.aiSummary}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline">{s.inquiryType}</Badge>
                  <Badge variant={s.status === 'new' ? 'default' : 'secondary'}>{s.status}</Badge>
                  {s.leadScore !== undefined && (
                    <span className="text-xs font-semibold text-green-600">Score {s.leadScore}/10</span>
                  )}
                  <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Knowledge Base */}
      {tab === 'knowledge-base' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Filter by Tenant ID…"
              value={kbFilterTenant}
              onChange={e => setKbFilterTenant(e.target.value)}
              className="h-8 px-3 text-sm border rounded-md bg-background w-64"
            />
            <Button size="sm" variant="outline" onClick={() => void loadKB(kbFilterTenant || undefined)} disabled={kbLoading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${kbLoading ? 'animate-spin' : ''}`} />
              Load
            </Button>
            <Button size="sm" onClick={openKBCreate}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Article
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {kbArticles.length} article{kbArticles.length !== 1 ? 's' : ''} · {kbArticles.filter(a => a.isPublished).length} published
            </span>
          </div>

          {/* Article list */}
          {kbLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!kbLoading && kbArticles.length === 0 && (
            <p className="text-sm text-muted-foreground">No articles yet. Enter a Tenant ID and click Load, or create a new article.</p>
          )}
          <div className="space-y-2">
            {kbArticles.map(article => (
              <Card key={article.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{article.title}</p>
                      <Badge variant="outline" className="text-xs">{article.category}</Badge>
                      <Badge variant={article.isPublished ? 'default' : 'secondary'} className="text-xs">
                        {article.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">tenant: {article.tenantId}</p>
                    {article.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{article.excerpt}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(article.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleKBTogglePublish(article)} title={article.isPublished ? 'Unpublish' : 'Publish'}>
                      {article.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openKBEdit(article)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void handleKBDelete(article)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Create / Edit dialog */}
          {kbShowDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">{kbEditing ? 'Edit Article' : 'New Article'}</h2>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Tenant ID *</label>
                    <input
                      type="text"
                      value={kbForm.tenantId}
                      onChange={e => setKbForm(f => ({ ...f, tenantId: e.target.value }))}
                      placeholder="e.g. FSHfLDxg24hb9TaoYpDK"
                      className="mt-1 w-full h-9 px-3 text-sm border rounded-md bg-background font-mono"
                      disabled={!!kbEditing}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Title *</label>
                    <input
                      type="text"
                      value={kbForm.title}
                      onChange={e => setKbForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Article title"
                      className="mt-1 w-full h-9 px-3 text-sm border rounded-md bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Category</label>
                    <select
                      value={kbForm.category}
                      onChange={e => setKbForm(f => ({ ...f, category: e.target.value }))}
                      className="mt-1 w-full h-9 px-3 text-sm border rounded-md bg-background"
                    >
                      {KB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Excerpt</label>
                    <input
                      type="text"
                      value={kbForm.excerpt}
                      onChange={e => setKbForm(f => ({ ...f, excerpt: e.target.value }))}
                      placeholder="Short summary (optional)"
                      className="mt-1 w-full h-9 px-3 text-sm border rounded-md bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Content *</label>
                    <textarea
                      value={kbForm.content}
                      onChange={e => setKbForm(f => ({ ...f, content: e.target.value }))}
                      placeholder="Full article content…"
                      rows={10}
                      className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-background resize-y"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setKbShowDialog(false)} disabled={kbSaving}>Cancel</Button>
                  <Button onClick={() => void handleKBSave()} disabled={kbSaving}>
                    {kbSaving ? 'Saving…' : kbEditing ? 'Save Changes' : 'Create Article'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
