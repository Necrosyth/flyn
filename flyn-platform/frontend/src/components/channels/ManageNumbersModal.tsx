import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Phone, Copy, Check, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { voiceProvisioning, TenantVoiceNumber } from '@/services/voiceProvisioning';
import { toast } from '@/hooks/use-toast';

function formatE164(num: string): string {
  const m = num.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return num;
}
const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface Props {
  onClose: () => void;
  /** Called whenever the number set changes (so the parent can refresh its summary). */
  onChanged?: () => void;
}

export function ManageNumbersModal({ onClose, onChanged }: Props) {
  const [numbers, setNumbers] = useState<TenantVoiceNumber[]>([]);
  const [priceCents, setPriceCents] = useState(115);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    voiceProvisioning
      .listNumbers()
      .then((r) => { setNumbers(r.numbers); setPriceCents(r.priceCents); })
      .catch((e) => toast({ title: 'Could not load numbers', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function copy(num: string) {
    await navigator.clipboard.writeText(num);
    setCopied(num);
    setTimeout(() => setCopied(null), 1500);
  }

  async function addNumber() {
    setAdding(true);
    try {
      // Return to this exact page after Stripe; the webhook unlocks the number.
      const url = `${window.location.origin}${window.location.pathname}?voice_number=success`;
      const cancel = `${window.location.origin}${window.location.pathname}?voice_number=cancelled`;
      const { checkoutUrl } = await voiceProvisioning.createNumberCheckout(url, cancel);
      window.location.href = checkoutUrl;
    } catch (e: any) {
      toast({ title: 'Could not start checkout', description: e.message, variant: 'destructive' });
      setAdding(false);
    }
  }

  async function remove(n: TenantVoiceNumber) {
    if (n.billable) {
      if (n.status === 'canceling') return;
      const ok = window.confirm(
        `This number is billed ${dollars(priceCents)}/mo. It stays active until ${fmtDate(n.periodEnd)} and is not refunded. Cancel it?`,
      );
      if (!ok) return;
    } else {
      if (!window.confirm('Remove this free number? It will be released immediately.')) return;
    }
    setBusy(n.number);
    try {
      const res = await voiceProvisioning.removeNumber(n.number);
      toast({
        title: res.immediate ? 'Number removed' : 'Cancellation scheduled',
        description: res.immediate ? undefined : `Active until ${fmtDate(res.cancelsAt ?? n.periodEnd)} — no refund.`,
      });
      load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Could not remove number', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40" onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        className="relative w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <Phone className="w-4 h-4 text-white" />
            </div>
            <p className="font-semibold text-sm">Your Flyn Voice Numbers</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No numbers yet.</p>
          ) : (
            numbers.map((n) => (
              <div key={n.number} className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{formatE164(n.number)}</span>
                    <button onClick={() => copy(n.number)} className="text-muted-foreground hover:text-foreground" title="Copy">
                      {copied === n.number ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {!n.billable ? (
                      <span className="text-green-600 font-medium">Free</span>
                    ) : n.status === 'canceling' ? (
                      <span className="text-amber-600">Cancels {fmtDate(n.periodEnd)} · no refund</span>
                    ) : (
                      <>{dollars(priceCents)}/mo · renews {fmtDate(n.periodEnd)}</>
                    )}
                  </p>
                </div>
                {n.status === 'canceling' ? (
                  <span className="text-[10px] text-amber-600 font-medium shrink-0">Canceling</span>
                ) : (
                  <button
                    onClick={() => remove(n)}
                    disabled={busy === n.number}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 shrink-0"
                    title={n.billable ? 'Cancel at period end' : 'Remove'}
                  >
                    {busy === n.number ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border space-y-2">
          <button
            onClick={addNumber}
            disabled={adding}
            className="w-full px-4 py-2.5 rounded-xl text-white font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {adding ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</> : <><Plus className="w-4 h-4" /> Add another number — {dollars(priceCents)}/mo</>}
          </button>
          <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" /> First number free · additional numbers billed monthly
          </p>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
