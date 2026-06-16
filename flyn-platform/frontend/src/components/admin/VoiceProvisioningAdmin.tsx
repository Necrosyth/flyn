import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Phone, Plus, Check, X, RefreshCw, PhoneCall, Hash } from 'lucide-react';
import {
  voiceProvisioning,
  VoiceActivationRequest,
  PoolNumber,
  PoolCounts,
} from '@/services/voiceProvisioning';
import { toast } from '@/hooks/use-toast';

type Tab = 'requests' | 'pool' | 'active';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  pending_number: 'bg-orange-100 text-orange-700',
  active: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  inactive: 'bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${STATUS_STYLE[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function VoiceProvisioningAdmin() {
  const [tab, setTab] = useState<Tab>('requests');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Phone className="w-5 h-5 text-violet-500" /> Voice Provisioning
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage the platform number pool and Flyn Voice activation requests.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          ['requests', 'Pending Requests'],
          ['pool', 'Number Pool'],
          ['active', 'Active Tenants'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-violet-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'requests' && <RequestsTab />}
      {tab === 'pool' && <PoolTab />}
      {tab === 'active' && <ActiveTab />}
    </div>
  );
}

// ─── Tab 1: Pending Requests ─────────────────────────────────────────────────

function RequestsTab() {
  const [requests, setRequests] = useState<VoiceActivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    voiceProvisioning
      .listRequests()
      .then((r) => setRequests(r.requests.filter((x) => x.status === 'pending' || x.status === 'pending_number')))
      .catch((e) => toast({ title: 'Failed to load requests', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(tenantId: string) {
    setBusy(tenantId);
    try {
      const res = await voiceProvisioning.approve(tenantId);
      if (res.status === 'pending_number') {
        toast({ title: 'Pool is empty', description: 'Add numbers before approving — request was waitlisted.', variant: 'destructive' });
      } else {
        toast({ title: 'Approved', description: res.phoneNumber ? `Assigned ${res.phoneNumber}` : 'Flyn Voice activated.' });
      }
      load();
    } catch (e: any) {
      toast({ title: 'Approval failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function reject(tenantId: string) {
    const reason = window.prompt('Rejection reason (optional):') ?? '';
    setBusy(tenantId);
    try {
      await voiceProvisioning.reject(tenantId, reason);
      toast({ title: 'Request rejected' });
      load();
    } catch (e: any) {
      toast({ title: 'Reject failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner />;
  if (requests.length === 0) return <Empty icon={PhoneCall} text="No pending requests." />;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <Th>Tenant</Th><Th>Requested</Th><Th>Status</Th><Th className="text-right">Action</Th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.tenantId} className="border-t border-border">
              <Td>
                <div className="font-medium">{r.tenantName}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{r.tenantId}</div>
              </Td>
              <Td className="text-muted-foreground">{fmtDate(r.requestedAt)}</Td>
              <Td><StatusPill status={r.status} /></Td>
              <Td className="text-right">
                <div className="inline-flex gap-2">
                  <button onClick={() => approve(r.tenantId)} disabled={busy === r.tenantId}
                    className="px-2.5 py-1 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1">
                    {busy === r.tenantId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                  </button>
                  <button onClick={() => reject(r.tenantId)} disabled={busy === r.tenantId}
                    className="px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 inline-flex items-center gap-1">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab 2: Number Pool ──────────────────────────────────────────────────────

function PoolTab() {
  const [numbers, setNumbers] = useState<PoolNumber[]>([]);
  const [counts, setCounts] = useState<PoolCounts>({ total: 0, available: 0, assigned: 0, reserved: 0 });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const r = await voiceProvisioning.reconcileWebhooks();
      toast({
        title: 'Webhooks reconciled',
        description: `${r.reconciled} number${r.reconciled !== 1 ? 's' : ''} re-pointed at Flyn${r.failed ? `, ${r.failed} failed` : ''}.`,
        variant: r.failed ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'Reconcile failed', description: e.message, variant: 'destructive' });
    } finally {
      setReconciling(false);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    voiceProvisioning
      .listPool()
      .then((r) => { setNumbers(r.numbers); setCounts(r.counts); })
      .catch((e) => toast({ title: 'Failed to load pool', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={counts.total} />
        <Stat label="Available" value={counts.available} accent="text-green-600" />
        <Stat label="Assigned" value={counts.assigned} accent="text-violet-600" />
        <Stat label="Reserved" value={counts.reserved} accent="text-amber-600" />
      </div>

      <div className="flex justify-between items-center">
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
        <div className="flex items-center gap-2">
          <button onClick={reconcile} disabled={reconciling}
            title="Re-point the Voice webhook on all assigned numbers at Flyn's backend (fixes numbers provisioned before credentials were set)."
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground hover:bg-muted inline-flex items-center gap-1 disabled:opacity-50">
            {reconciling ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
            {reconciling ? 'Fixing…' : 'Fix Webhooks'}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Number
          </button>
        </div>
      </div>

      {loading ? <Spinner /> : numbers.length === 0 ? (
        <Empty icon={Hash} text="The pool is empty. Add a pre-purchased Twilio number to get started." />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><Th>Number</Th><Th>Status</Th><Th>Assigned To</Th><Th>Country</Th><Th>Added</Th></tr>
            </thead>
            <tbody>
              {numbers.map((n) => (
                <tr key={n.number} className="border-t border-border">
                  <Td className="font-mono font-medium">{n.number}</Td>
                  <Td><StatusPill status={n.status} /></Td>
                  <Td className="text-muted-foreground font-mono text-[11px]">{n.assignedTo ?? '—'}</Td>
                  <Td>{n.country}</Td>
                  <Td className="text-muted-foreground">{fmtDate(n.addedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddNumberModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddNumberModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [number, setNumber] = useState('');
  const [twilioSid, setTwilioSid] = useState('');
  const [country, setCountry] = useState('US');
  const [voice, setVoice] = useState(true);
  const [sms, setSms] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await voiceProvisioning.addNumber({ number, twilioSid, country, capabilities: { voice, sms } });
      toast({
        title: 'Number added',
        description: res.autoFulfilled ? `A waitlisted request (${res.autoFulfilled}) was auto-fulfilled.` : `${number} is now available.`,
      });
      onAdded();
    } catch (err: any) {
      toast({ title: 'Could not add number', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl z-[61]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <p className="font-semibold text-sm">Add Number to Pool</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <Field label="Phone Number (E.164)">
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+14155551234" required
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono" />
          </Field>
          <Field label="Twilio Number SID">
            <input value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} placeholder="PNxxxxxxxxxxxx" required
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-mono" />
          </Field>
          <Field label="Country">
            <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="US" maxLength={2}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm w-24" />
          </Field>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-input rounded-lg hover:bg-accent text-sm">Cancel</button>
            <button type="submit" disabled={saving || !number || !twilioSid}
              className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 text-sm inline-flex items-center justify-center gap-1">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Add
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}

// ─── Tab 3: Active Tenants ───────────────────────────────────────────────────

function ActiveTab() {
  const [tenants, setTenants] = useState<VoiceActivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    voiceProvisioning
      .listActiveTenants()
      .then((r) => setTenants(r.tenants))
      .catch((e) => toast({ title: 'Failed to load', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deactivate(tenantId: string) {
    if (!window.confirm('Deactivate Flyn Voice for this tenant? The number returns to the pool.')) return;
    setBusy(tenantId);
    try {
      await voiceProvisioning.adminDeactivate(tenantId);
      toast({ title: 'Deactivated' });
      load();
    } catch (e: any) {
      toast({ title: 'Deactivation failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner />;
  if (tenants.length === 0) return <Empty icon={PhoneCall} text="No active Flyn Voice tenants." />;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr><Th>Tenant</Th><Th>Number</Th><Th>Activated</Th><Th className="text-right">Action</Th></tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.tenantId} className="border-t border-border">
              <Td>
                <div className="font-medium">{t.tenantName}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{t.tenantId}</div>
              </Td>
              <Td className="font-mono">{t.assignedNumber ?? '—'}</Td>
              <Td className="text-muted-foreground">{fmtDate(t.approvedAt)}</Td>
              <Td className="text-right">
                <button onClick={() => deactivate(t.tenantId)} disabled={busy === t.tenantId}
                  className="px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 inline-flex items-center gap-1">
                  {busy === t.tenantId ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />} Deactivate
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Small UI helpers ────────────────────────────────────────────────────────

const Th = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <th className={`text-left font-medium px-4 py-2.5 ${className}`}>{children}</th>
);
const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-4 py-3 ${className}`}>{children}</td>
);
const Spinner = () => (
  <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
);
const Empty = ({ icon: Icon, text }: { icon: React.ElementType; text: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <Icon className="w-8 h-8 mb-2 opacity-40" />
    <p className="text-sm">{text}</p>
  </div>
);
const Stat = ({ label, value, accent }: { label: string; value: number; accent?: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
    <p className={`text-2xl font-semibold mt-1 ${accent ?? 'text-foreground'}`}>{value}</p>
  </div>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-xs font-medium mb-1">{label}</label>
    {children}
  </div>
);
