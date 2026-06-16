import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Phone, PhoneIncoming, PhoneOutgoing, Check, Loader2, Sparkles, CreditCard } from 'lucide-react';
import { voiceProvisioning } from '@/services/voiceProvisioning';

function formatE164(num: string): string {
  const m = num.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return num;
}

interface Props {
  onClose: () => void;
  /** Called with the allocated E.164 number once assignment succeeds. */
  onAllocated: (number: string) => void;
}

export function AllocateNumberModal({ onClose, onAllocated }: Props) {
  const [allocating, setAllocating] = useState(false);
  const [assigned, setAssigned] = useState<string | null>(null);
  const [needsPayment, setNeedsPayment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function allocate() {
    setAllocating(true);
    setError(null);
    try {
      const res = await voiceProvisioning.allocate();
      if (res.allocated && res.number) {
        setAssigned(res.number);
        onAllocated(res.number);
      } else if (res.requiresPayment) {
        setNeedsPayment(res.message);
      } else {
        setError(res.message || 'Could not allocate a number.');
      }
    } catch (err: any) {
      setError(err.message || 'Could not allocate a number.');
    } finally {
      setAllocating(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50" onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="relative w-[92%] max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        <button onClick={onClose} className="absolute right-3 top-3 p-1.5 rounded-lg hover:bg-accent text-muted-foreground z-10">
          <X className="w-4 h-4" />
        </button>

        {/* SUCCESS */}
        {assigned ? (
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/30 mx-auto flex items-center justify-center mb-4">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="font-semibold text-base">Number assigned 🎉</h3>
            <p className="text-sm text-muted-foreground mt-1">This number is now yours for inbound & outbound calls:</p>
            <p className="text-xl font-mono font-bold mt-3">{formatE164(assigned)}</p>
            <button onClick={onClose} className="mt-5 w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium">
              Done
            </button>
          </div>
        ) : needsPayment ? (
          /* BILLING GATE (2nd+ number) */
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 mx-auto flex items-center justify-center mb-4">
              <CreditCard className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="font-semibold text-base">Additional number</h3>
            <p className="text-sm text-muted-foreground mt-2">{needsPayment}</p>
            <button onClick={onClose} className="mt-5 w-full px-4 py-2.5 border border-border rounded-xl hover:bg-accent text-sm font-medium">
              Close
            </button>
          </div>
        ) : (
          /* DEFAULT — allocate */
          <div className="p-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center mb-4">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-base">Access Flyn Voice</h3>
            <p className="text-sm text-muted-foreground mt-1">Get a dedicated number for AI-powered calling.</p>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2.5 text-sm">
                <PhoneIncoming className="w-4 h-4 text-violet-500 shrink-0" />
                <span>Inbound — your AI agent answers calls</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <PhoneOutgoing className="w-4 h-4 text-violet-500 shrink-0" />
                <span>Outbound — call customers from the dialer</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
              <Sparkles className="w-3.5 h-3.5" /> Your first number is free
            </div>

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

            <button
              onClick={allocate}
              disabled={allocating}
              className="mt-5 w-full px-4 py-2.5 rounded-xl text-white font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {allocating ? <><Loader2 className="w-4 h-4 animate-spin" /> Allocating…</> : 'Allocate a Number'}
            </button>
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
