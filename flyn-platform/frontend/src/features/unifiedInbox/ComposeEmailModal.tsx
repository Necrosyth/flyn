import { useState } from "react";
import { Loader2, X, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { inboxService } from "@/services/inbox";
import type { TenantMailbox } from "@/services/mailboxes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Active mailboxes the user may send as — passed from UnifiedInbox (shared mine() fetch). */
  activeMailboxes: TenantMailbox[];
  /** Called on successful send so the caller can refresh the conversation list. */
  onSent?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ComposeEmailModal({ open, onOpenChange, activeMailboxes, onSent }: Props) {
  const { toast } = useToast();
  const [mailboxId, setMailboxId] = useState(activeMailboxes[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toTrimmed = to.trim();
  const toValid = EMAIL_RE.test(toTrimmed);
  const canSend = !!mailboxId && toValid && !!subject.trim() && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    // POST /inbox/send-as-mailbox (inbox.controller.ts:121 / services/inbox.ts:220).
    // No inReplyTo/references — fresh thread keyed (tenant, email, recipient).
    const res = await inboxService.sendAsMailbox({
      mailboxId,
      to: { email: toTrimmed },
      subject: subject.trim(),
      text: body.trim() || "(no body)",
    });
    setSending(false);
    if (res.success) {
      toast({ title: "Email sent", description: `From ${res.from ?? "your mailbox"}` });
      onSent?.();
      onOpenChange(false);
      setTo(""); setSubject(""); setBody(""); setError(null);
    } else {
      setError(res.error ?? "Send failed — check your Brevo IP allowlist and try again.");
    }
  };

  const from = activeMailboxes.find((m) => m.id === mailboxId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div className="w-full sm:max-w-lg bg-background border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">New email</span>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-4 py-3 space-y-3">
          {/* From */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground w-14 flex-shrink-0">From</span>
            <select
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none border-b border-border/60 focus:border-primary/60 py-1 text-foreground transition-colors"
            >
              {activeMailboxes.map((m) => (
                <option key={m.id} value={m.id}>{m.address}</option>
              ))}
            </select>
          </div>

          {/* To */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground w-14 flex-shrink-0">To</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("compose-subject")?.focus()}
              placeholder="recipient@example.com"
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none border-b border-border/60 focus:border-primary/60 py-1 text-foreground placeholder:text-muted-foreground transition-colors"
            />
          </div>

          {/* Subject */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground w-14 flex-shrink-0">Subject</span>
            <input
              id="compose-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("compose-body")?.focus()}
              placeholder="Subject"
              className="flex-1 bg-transparent text-sm outline-none border-b border-border/60 focus:border-primary/60 py-1 text-foreground placeholder:text-muted-foreground transition-colors"
            />
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-3 flex-1">
          <textarea
            id="compose-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={7}
            className="w-full bg-transparent text-sm outline-none resize-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-3 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground truncate max-w-[260px]">
            {from ? `Sending as ${from.address}` : "Pick a mailbox"}
            {/* Cc/Bcc not available yet — backend send-as-mailbox route doesn't accept them. */}
          </p>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
