import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Trash2, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2, Circle, MessageSquare, Send, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';
import { authedFetch } from '@/services/authApi';

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country: string;
  department: string;
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'new' | 'opened' | 'in_progress' | 'resolved' | 'closed';
  assigned_to?: string;
  response?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

const base = `${API_BASE_URL}/contact`;

async function fetchSubmissions(status?: string, department?: string): Promise<ContactSubmission[]> {
  const params = new URLSearchParams({ limit: '100' });
  if (status && status !== 'all') params.set('status', status);
  if (department && department !== 'all') params.set('department', department);
  const res = await authedFetch(`${base}/admin/submissions?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch submissions');
  const data = await res.json() as { submissions: ContactSubmission[] };
  return data.submissions;
}

async function updateSubmission(id: string, payload: { status?: string; response?: string; assigned_to?: string }): Promise<void> {
  const res = await authedFetch(`${base}/forms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update submission');
}

async function deleteSubmission(id: string): Promise<void> {
  const res = await authedFetch(`${base}/forms/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete submission');
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-500/15 text-slate-400',
  medium: 'bg-blue-500/15 text-blue-400',
  high: 'bg-amber-500/15 text-amber-400',
  urgent: 'bg-red-500/15 text-red-400',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  new: <Circle className="w-3.5 h-3.5 text-violet-400" />,
  opened: <Clock className="w-3.5 h-3.5 text-blue-400" />,
  in_progress: <Clock className="w-3.5 h-3.5 text-amber-400" />,
  resolved: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  closed: <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  opened: 'Opened',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const DEPT_LABELS: Record<string, string> = {
  general: 'General',
  support: 'Support',
  sales: 'Sales',
  careers: 'Careers',
  brand: 'Brand',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ReplyBox({ submissionId, submissionEmail }: { submissionId: string; submissionEmail: string }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/contact/admin/submissions/${submissionId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      });
      if (!res.ok) throw new Error('Send failed');
      toast({ title: 'Reply sent', description: `Email delivered to ${submissionEmail}` });
      setText('');
    } catch {
      toast({ title: 'Send failed', description: 'Could not send reply. Check your Brevo SMTP config in API Keys.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reply via Email</p>
      <Textarea
        placeholder={`Write your reply to ${submissionEmail}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="text-sm resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">→ {submissionEmail} · Ctrl+Enter to send</span>
        <Button size="sm" onClick={handleSend} disabled={sending || !text.trim()} className="gap-1.5">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Sending…' : 'Send Reply'}
        </Button>
      </div>
    </div>
  );
}

function SubmissionCard({
  sub,
  onStatusChange,
  onDelete,
}: {
  sub: ContactSubmission;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Summary row */}
        <button
          className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="mt-0.5 shrink-0">{STATUS_ICON[sub.status] ?? <Circle className="w-3.5 h-3.5" />}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground truncate">{sub.subject}</span>
              <Badge className={`text-[10px] px-1.5 py-0 font-medium ${PRIORITY_COLORS[sub.priority]}`}>
                {sub.priority.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {DEPT_LABELS[sub.department] ?? sub.department}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {sub.name} · {sub.email} · {timeAgo(sub.created_at)}
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div><span className="text-muted-foreground">Country:</span> <span className="text-foreground">{sub.country}</span></div>
              <div><span className="text-muted-foreground">Phone:</span> <span className="text-foreground">{sub.phone ?? '—'}</span></div>
              <div><span className="text-muted-foreground">Ticket ID:</span> <code className="text-violet-400 text-xs">{sub.id}</code></div>
              <div><span className="text-muted-foreground">Status:</span> <span className="text-foreground">{STATUS_LABEL[sub.status]}</span></div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{sub.message}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={sub.status} onValueChange={v => onStatusChange(sub.id, v)}>
                <SelectTrigger className="h-8 text-xs w-36 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => onDelete(sub.id)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            </div>
            <ReplyBox submissionId={sub.id} submissionEmail={sub.email} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContactSubmissionsPage() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSubmissions(statusFilter, deptFilter);
      setSubmissions(data);
    } catch {
      toast({ title: 'Load failed', description: 'Could not fetch contact submissions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, deptFilter, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateSubmission(id, { status });
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: status as ContactSubmission['status'] } : s));
      toast({ title: 'Status updated' });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this submission permanently?')) return;
    try {
      await deleteSubmission(id);
      setSubmissions(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Submission deleted' });
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const counts = {
    total: submissions.length,
    new: submissions.filter(s => s.status === 'new').length,
    urgent: submissions.filter(s => s.priority === 'urgent').length,
    open: submissions.filter(s => s.status !== 'resolved' && s.status !== 'closed').length,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contact Submissions</h1>
          <p className="text-sm text-muted-foreground mt-1">Contact form tickets from myflynai.com/contact</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/chatbot">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chatbot Admin
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: counts.total, color: 'text-foreground' },
          { label: 'New', value: counts.new, color: 'text-violet-400' },
          { label: 'Open', value: counts.open, color: 'text-blue-400' },
          { label: 'Urgent', value: counts.urgent, color: 'text-red-400' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{loading ? '—' : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-36 rounded-lg">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="opened">Opened</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-8 text-xs w-36 rounded-lg">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="careers">Careers</SelectItem>
            <SelectItem value="brand">Brand</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No submissions found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {submissions.map(sub => (
            <SubmissionCard
              key={sub.id}
              sub={sub}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
