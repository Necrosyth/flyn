import { useState, useRef, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Send, ChevronLeft, Check, CheckCheck, AlertCircle,
  Mail, Volume2, Phone, MessageSquare, Loader2,
  Sparkles, Languages, MoreHorizontal, Paperclip,
  FileText, Zap, ChevronDown, CheckCircle2, Clock, RefreshCw,
  Download, File as FileIcon, FileArchive, Image as ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation, Message, QuickReply, Attachment } from "@/types/inbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChannelIcon } from "./ChannelIcon";
import { useContactActions } from "@/hooks/useContactActions";
import { useToast } from "@/hooks/use-toast";
import { inboxService } from "@/services/inbox";
import type { TenantMailbox } from "@/services/mailboxes";

interface ChatThreadProps {
  conversation: Conversation;
  quickReplies: QuickReply[];
  onSendMessage: (content: string, subject?: string, cc?: string, bcc?: string) => void;
  onBack?: () => void;
  onUpdateStatus?: (status: "open" | "pending" | "resolved") => Promise<void>;
  /** Active mailboxes the user may send as — passed from UnifiedInbox (shared mine() fetch). */
  activeMailboxes?: TenantMailbox[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateSeparator(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `Today, ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** Split the quoted reply history off the new message, like Gmail's "···". */
function splitQuotedHtml(html: string): { main: string; quoted: string | null } {
  const markers = [
    /<blockquote/i,
    /<div[^>]+class="?gmail_quote/i,
    /<div[^>]+class="?moz-cite-prefix/i, // Thunderbird
    /<div[^>]+id="?appendonsend/i, // Outlook
    /<div[^>]+class="?yahoo_quoted/i, // Yahoo
  ];
  let idx = -1;
  for (const m of markers) {
    const found = html.search(m);
    if (found >= 0 && (idx === -1 || found < idx)) idx = found;
  }
  if (idx > 0) return { main: html.slice(0, idx), quoted: html.slice(idx) };
  return { main: html, quoted: null };
}

/**
 * Render sanitized email HTML in an ISOLATED iframe. The body was already sanitized server-side
 * (no script/on*=/javascript:). Here we add a second wall: NO `allow-scripts` in the sandbox, so
 * even if something slipped through it can never execute. `allow-same-origin` is present ONLY so
 * the parent can measure the content height (auto-size); `allow-popups` lets sanitized
 * target=_blank links still open. We never use dangerouslySetInnerHTML on email input.
 */
function EmailHtmlBody({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(60);
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><base target="_blank">` +
      `<meta name="color-scheme" content="light dark">` +
      `<style>html,body{margin:0;padding:0;background:transparent;` +
      `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;` +
      `font-size:14px;line-height:1.5;color:#1f2328;word-break:break-word;overflow-wrap:anywhere;}` +
      `img{max-width:100%;height:auto}a{color:#0b57d0}table{max-width:100%}` +
      `</style></head><body>${html}</body></html>`,
    [html],
  );
  const onLoad = () => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (doc?.body) setHeight(Math.min(Math.max(doc.body.scrollHeight + 8, 32), 1600));
    } catch {
      /* opaque origin — keep fallback height */
    }
  };
  return (
    <iframe
      ref={frameRef}
      title="Email message"
      srcDoc={srcDoc}
      onLoad={onLoad}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ width: "100%", height, border: 0, display: "block", background: "transparent" }}
    />
  );
}

// Lightweight inline validation for the Cc/Bcc inputs — every comma/semicolon-separated entry must
// look like an email ("addr" or "Name <addr>"). The backend re-validates authoritatively.
function isValidAddressList(input: string): boolean {
  const parts = input.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return parts.every((p) => re.test(p.includes("<") ? (p.match(/<([^>]+)>/)?.[1] || "") : p));
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentTypeIcon({ type }: { type: string }) {
  const c = "w-4 h-4 flex-shrink-0 text-muted-foreground";
  if (type.startsWith("image/")) return <ImageIcon className={c} />;
  if (type.includes("pdf")) return <FileText className={c} />;
  if (type.includes("zip") || type.includes("compress") || type.includes("tar")) return <FileArchive className={c} />;
  return <FileIcon className={c} />;
}

/** Gmail-style attachment chip — resolves the S3 key to a presigned GET URL on click, then opens it. */
function AttachmentChip({ att, conversationId }: { att: Attachment; conversationId?: string }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const onDownload = async () => {
    if (!att.s3Key || loading) return;
    setLoading(true);
    try {
      const url = await inboxService.getAttachmentUrl(att.s3Key, conversationId);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast({ variant: "destructive", title: "Couldn't open attachment", description: "The download link could not be generated." });
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={loading || !att.s3Key}
      title={`Download ${att.fileName || "attachment"}`}
      className="group/att inline-flex items-center gap-2 max-w-[260px] px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left disabled:opacity-60"
    >
      <AttachmentTypeIcon type={att.fileType} />
      <span className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-foreground truncate">{att.fileName || "attachment"}</span>
        {formatBytes(att.size) && <span className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</span>}
      </span>
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />
        : <Download className="w-3.5 h-3.5 text-muted-foreground ml-auto opacity-0 group-hover/att:opacity-100 transition-opacity" />}
    </button>
  );
}

/** A Gmail-style email message: header (avatar, sender, address, time), subject, rich body, quoted collapse. */
function EmailMessage({ message, contact, conversationId }: { message: Message; contact?: { name: string; avatar?: string }; conversationId?: string }) {
  const isOutgoing = message.messageType === "outgoing";
  const [showQuoted, setShowQuoted] = useState(false);
  const senderName = isOutgoing ? "You" : contact?.name || message.sender?.name || "Unknown";
  const senderAddr = !isOutgoing ? message.sender?.id || "" : "";
  const html = message.emailHtml?.trim();
  const { main, quoted } = html ? splitQuotedHtml(html) : { main: "", quoted: null };
  const renderedHtml = html ? (showQuoted && quoted ? main + quoted : main) : null;

  return (
    <div className="mb-4">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-border/60">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage src={contact?.avatar} alt={senderName} />
            <AvatarFallback className={cn("text-[11px]", isOutgoing ? "bg-primary/10 text-primary" : "bg-muted")}>
              {senderName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground truncate">{senderName}</span>
              {senderAddr && <span className="text-xs text-muted-foreground truncate">&lt;{senderAddr}&gt;</span>}
            </div>
            {message.emailSubject && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground truncate mt-0.5">
                <Mail className="w-3 h-3 flex-shrink-0 opacity-70" />
                {message.emailSubject}
              </p>
            )}
            {message.emailCc && message.emailCc.length > 0 && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                <span className="font-medium">Cc:</span> {message.emailCc.join(", ")}
              </p>
            )}
            {/* Bcc shown ONLY on the sender's own outbound row (their private record), never inbound. */}
            {isOutgoing && message.emailBcc && message.emailBcc.length > 0 && (
              <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                <span className="font-medium">Bcc:</span> {message.emailBcc.join(", ")} <span className="opacity-60">(private)</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0 pt-0.5">
            <span>{formatTime(message.createdAt)}</span>
            {isOutgoing && <MessageStatusIcon status={message.status} />}
          </div>
        </div>
        <div className="px-4 py-3">
          {renderedHtml ? (
            <EmailHtmlBody html={renderedHtml} />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{message.emailText || message.content}</p>
          )}
          {quoted && (
            <button
              onClick={() => setShowQuoted((v) => !v)}
              className="mt-1.5 inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground text-xs leading-none tracking-widest"
              title={showQuoted ? "Hide quoted text" : "Show trimmed content"}
            >
              •••
            </button>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-muted-foreground">
                <Paperclip className="w-3 h-3" />
                {message.attachments.length} attachment{message.attachments.length > 1 ? "s" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {message.attachments.map((att) => (
                  <AttachmentChip key={att.id || att.fileName} att={att} conversationId={conversationId} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getTicketNumber(id: string): string {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `#${(Math.abs(hash) % 9000) + 1000}`;
}

function getSlaDisplay(conv: Conversation): { text: string; urgent: boolean } | null {
  if (conv.status !== "open" || !conv.priority) return null;
  const SLA: Record<string, number> = { urgent: 15, high: 60, medium: 240, low: 1440 };
  const total = SLA[conv.priority] ?? 240;
  const elapsed = Math.floor((Date.now() - conv.createdAt.getTime()) / 60000);
  const left = total - elapsed;
  if (left <= 0) return { text: "SLA breached", urgent: true };
  if (left <= 30) return { text: `SLA: ${left} min remaining`, urgent: left <= 5 };
  return null;
}

function MessageStatusIcon({ status }: { status?: Message["status"] }) {
  if (!status) return null;
  // Match WhatsApp exactly: read = blue double-tick (#53bdeb), delivered = grey double-tick,
  // sent = single grey tick, failed = alert.
  if (status === "read")      return <CheckCheck className="w-3 h-3 text-[#53bdeb]" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
  if (status === "sent")      return <Check className="w-3 h-3 text-muted-foreground" />;
  if (status === "failed")    return <AlertCircle className="w-3 h-3 text-destructive" />;
  return null;
}

function MessageBubble({ message, contact, conversationId }: { message: Message; contact?: { name: string; avatar?: string }; conversationId?: string }) {
  const isOutgoing = message.messageType === "outgoing";
  const isEmail = Boolean(message.emailSubject || message.emailHtml || message.emailText);
  const isVoice = Boolean(message.audioUrl || message.transcript);

  // Email renders as a full-width Gmail-style card (sandboxed HTML), not a chat bubble.
  if (isEmail) return <EmailMessage message={message} contact={contact} conversationId={conversationId} />;

  return (
    <div className={cn("flex gap-2.5 mb-3", isOutgoing ? "justify-end" : "justify-start")}>
      {!isOutgoing && contact && (
        <Avatar className="w-7 h-7 flex-shrink-0 mt-0.5">
          <AvatarImage src={contact.avatar} alt={contact.name} />
          <AvatarFallback className="text-[10px] bg-muted">{contact.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col gap-1 max-w-[68%]">
        <div
          className={cn(
            "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
            isOutgoing
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          )}
        >
          {isVoice ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 opacity-70" />
                <span className="font-semibold text-xs">Voice message</span>
              </div>
              {message.audioUrl && (
                <audio controls preload="none" className="w-full h-7">
                  <source src={message.audioUrl} />
                </audio>
              )}
              {(message.transcript || message.content) && (
                <p className="text-xs opacity-80 italic">"{message.transcript || message.content}"</p>
              )}
            </div>
          ) : (
            message.content
          )}
        </div>

        <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", isOutgoing ? "justify-end" : "justify-start")}>
          {!isOutgoing && contact && <span className="font-medium">{contact.name.split(" ")[0]}</span>}
          <span>{formatTime(message.createdAt)}</span>
          {isOutgoing && <MessageStatusIcon status={message.status} />}
        </div>
      </div>

      {isOutgoing && (
        <Avatar className="w-7 h-7 flex-shrink-0 mt-0.5">
          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">Me</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

function AiSuggestedReply({ text, onUse }: { text: string; onUse: (t: string) => void }) {
  return (
    <div className="mx-4 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-amber-500/20">
        <Sparkles className="w-3 h-3 text-amber-500" />
        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">AI Suggested Reply</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm text-foreground leading-relaxed">{text}</p>
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/5 border-t border-amber-500/15">
        <span className="text-[10px] text-muted-foreground">Suggested · not sent yet</span>
        <button
          onClick={() => onUse(text)}
          className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
        >
          Use this reply
        </button>
      </div>
    </div>
  );
}

type ComposerTab = "reply" | "note" | "ai-draft" | "attach" | "quick-reply";

const CHANNEL_DISPLAY: Partial<Record<string, string>> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "Email",
  sms: "SMS",
  twilio: "SMS",
  voice: "Voice",
  web: "Web Chat",
  webchat: "Web Chat",
};

export function ChatThread({ conversation, quickReplies, onSendMessage, onBack, onUpdateStatus, activeMailboxes }: ChatThreadProps) {
  const [inputValue, setInputValue] = useState("");
  const [activeTab, setActiveTab] = useState<ComposerTab>("reply");
  const [showAiSummary, setShowAiSummary] = useState(true);
  const [aiSuggestedReply, setAiSuggestedReply] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [translating, setTranslating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastConvId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { makeVapiCall, callingPhone } = useContactActions();
  const reduce = useReducedMotion();

  const phone = conversation.contact.phone?.trim() || "";
  const isSmsChannel = conversation.channel === "sms" || (conversation.channel as string) === "twilio";
  const isVoiceChannel = conversation.channel === "voice";
  const isEmailChannel = conversation.channel === "email";
  const showCallBtn = (isSmsChannel || isVoiceChannel) && phone;
  const channelLabel = CHANNEL_DISPLAY[conversation.channel] ?? conversation.channel;
  const ticketNum = getTicketNumber(conversation.id);
  const sla = getSlaDisplay(conversation);

  // Editable reply subject + Cc/Bcc for email — Gmail-style, Cc/Bcc collapsed behind a toggle.
  const [emailSubject, setEmailSubject] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  // Send-as-mailbox: use the active mailboxes passed from UnifiedInbox (shared mine() fetch —
  // no duplicate request). Fall back to empty so the From selector simply doesn't appear.
  const accessibleMailboxes = activeMailboxes ?? [];
  const [selectedMailboxId, setSelectedMailboxId] = useState("");
  const [sendingAs, setSendingAs] = useState(false);
  const threadSubject = useMemo(() => {
    if (!isEmailChannel) return "";
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const s = conversation.messages[i].emailSubject?.trim();
      if (s) return s;
    }
    return "";
  }, [conversation.messages, isEmailChannel]);

  // 'r' shortcut (dispatched by UnifiedInbox) → focus the reply box.
  useEffect(() => {
    const focusReply = () => { setActiveTab("reply"); setTimeout(() => inputRef.current?.focus(), 0); };
    window.addEventListener("flyn-inbox-focus-reply", focusReply);
    return () => window.removeEventListener("flyn-inbox-focus-reply", focusReply);
  }, []);

  // Reset any stale draft + reset the reply subject when switching conversations.
  useEffect(() => {
    setAiSuggestedReply(null);
    setEmailCc(""); setEmailBcc(""); setShowCcBcc(false);
    setSelectedMailboxId(""); // default back to the connected account on every conversation switch
    if (isEmailChannel) {
      const base = threadSubject || "Your message";
      setEmailSubject(/^\s*(re|fwd|fw)\s*:/i.test(base) ? base : `Re: ${base}`);
    }
  }, [conversation.id, isEmailChannel, threadSubject]);

  // Generate a real AI-drafted reply from conversation context (server-side LLM).
  const handleGenerateDraft = async () => {
    setAiDrafting(true);
    setAiSuggestedReply(null);
    try {
      const res = await inboxService.aiDraft(conversation.id);
      if (res.success && res.draft) {
        setAiSuggestedReply(res.draft);
      } else if (res.waitingForCustomer) {
        // Not an error — there's simply no customer message to reply to yet.
        toast({ title: "Waiting for the customer", description: "There's no customer message to reply to yet." });
      } else {
        toast({ variant: "destructive", title: "Couldn't draft a reply", description: res.error || "Try again in a moment." });
      }
    } finally {
      setAiDrafting(false);
    }
  };

  // AI Assist (header): generate a real draft and drop it straight into the reply box.
  const handleAiAssist = async () => {
    if (aiSuggestedReply) {
      setInputValue(aiSuggestedReply);
      setAiSuggestedReply(null);
      setActiveTab("reply");
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    setAiDrafting(true);
    try {
      const res = await inboxService.aiDraft(conversation.id);
      if (res.success && res.draft) {
        setInputValue(res.draft);
        setActiveTab("reply");
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (res.waitingForCustomer) {
        toast({ title: "Waiting for the customer", description: "There's no customer message to reply to yet." });
      } else {
        toast({ variant: "destructive", title: "AI Assist failed", description: res.error || "Couldn't draft a reply." });
      }
    } finally {
      setAiDrafting(false);
    }
  };

  // Auto-scroll policy that PRESERVES the user's scroll position across polls/refreshes:
  //  • When a conversation is OPENED (id changed) → jump to the bottom instantly.
  //  • On new messages in the open thread → only follow if the user is already near the bottom.
  //    If they scrolled up to read history, a refresh must NOT yank them back down.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const opened = lastConvId.current !== conversation.id;
    lastConvId.current = conversation.id;
    if (opened) {
      el.scrollTop = el.scrollHeight; // instant on open — no smooth-scroll fight
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages, conversation.id]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sendingAs) return;
    if (activeTab === "note") {
      setInputValue("");
      const res = await inboxService.addNote(conversation.id, text);
      if (res.success) {
        toast({ title: "Note added", description: "Visible to your team only." });
      } else {
        setInputValue(text);
        toast({ variant: "destructive", title: "Couldn't save note", description: res.error });
      }
      return;
    }
    // Send-as-mailbox: ADDITIVE parallel path — only when the user explicitly picks a mailbox in the
    // From selector (email only). The default ("") keeps the existing BYO-SMTP reply byte-identical.
    if (isEmailChannel && selectedMailboxId) {
      const toEmail = (conversation.contact.email || conversation.contact.phone || "").trim();
      if (!toEmail) {
        toast({ variant: "destructive", title: "No recipient", description: "This conversation has no email address." });
        return;
      }
      setSendingAs(true);
      const res = await inboxService.sendAsMailbox({
        mailboxId: selectedMailboxId,
        to: { email: toEmail, name: conversation.contact.name },
        subject: emailSubject.trim() || "(no subject)",
        text,
      });
      setSendingAs(false);
      if (res.success) {
        toast({ title: "Email sent", description: `From ${res.from || "your mailbox"}` });
        setInputValue("");
        setAiSuggestedReply(null);
        inputRef.current?.focus();
      } else {
        toast({ variant: "destructive", title: "Couldn't send", description: res.error || "Send failed" });
      }
      return;
    }
    onSendMessage(
      text,
      isEmailChannel ? emailSubject.trim() || undefined : undefined,
      isEmailChannel ? emailCc.trim() || undefined : undefined,
      isEmailChannel ? emailBcc.trim() || undefined : undefined,
    );
    if (isEmailChannel) {
      toast({ title: "Email sent", description: emailSubject.trim() || "Reply sent" });
      setEmailCc(""); setEmailBcc(""); setShowCcBcc(false);
    }
    setInputValue("");
    setAiSuggestedReply(null);
    inputRef.current?.focus();
  };

  const handleAttachSend = async () => {
    if (!attachFile || attaching) return;
    // Bind the target conversation NOW, synchronously. The async upload+send must land on the chat
    // the file was composed in — never a value that could change mid-flight. (ChatThread is also
    // keyed by conversation.id, so this component can't outlive a conversation switch anyway.)
    const targetConversationId = conversation.id;
    const targetName = conversation.contact.name;
    setAttaching(true);
    try {
      const res = await inboxService.sendAttachment(targetConversationId, attachFile, inputValue.trim() || undefined);
      if (res.success) {
        toast({ title: "Attachment sent", description: `${attachFile.name} → ${targetName}` });
        setAttachFile(null);
        setInputValue("");
        setActiveTab("reply");
      } else {
        toast({ variant: "destructive", title: "Couldn't send attachment", description: res.error });
      }
    } finally {
      setAttaching(false);
    }
  };

  const handleTranslate = async () => {
    const lastIncoming = [...conversation.messages].reverse().find((m) => m.messageType === "incoming");
    if (!lastIncoming?.content?.trim()) {
      toast({ title: "Nothing to translate", description: "No incoming message yet." });
      return;
    }
    setTranslating(true);
    try {
      const res = await inboxService.translate(lastIncoming.content, "en");
      if (res.success && res.translated) {
        toast({ title: "Translation (English)", description: res.translated });
      } else {
        toast({ variant: "destructive", title: "Translation failed", description: res.error });
      }
    } finally {
      setTranslating(false);
    }
  };

  const handleStatusUpdate = async (status: "open" | "pending" | "resolved") => {
    if (!onUpdateStatus) return;
    setStatusUpdating(true);
    try {
      await onUpdateStatus(status);
      toast({ title: status === "resolved" ? "Conversation resolved" : status === "pending" ? "Marked as pending" : "Reopened" });
    } catch {
      toast({ variant: "destructive", title: "Failed to update status" });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Windowing — only render the most recent WINDOW messages by default so a 1000-message thread
  // doesn't mount 1000 nodes (no virtualization lib installed; this is the no-dep safety valve).
  // "Load earlier" reveals the rest. Reset to the window when switching conversations.
  const WINDOW = 60;
  const [renderAll, setRenderAll] = useState(false);
  useEffect(() => { setRenderAll(false); }, [conversation.id]);
  const totalMsgs = conversation.messages.length;
  const visibleMessages = renderAll || totalMsgs <= WINDOW ? conversation.messages : conversation.messages.slice(-WINDOW);
  const hiddenCount = totalMsgs - visibleMessages.length;

  // Group messages by date for separators
  const messagesWithSeparators: Array<{ type: "separator"; date: Date } | { type: "message"; message: Message }> = [];
  let lastDate = "";
  for (const msg of visibleMessages) {
    const dateStr = msg.createdAt.toDateString();
    if (dateStr !== lastDate) {
      messagesWithSeparators.push({ type: "separator", date: msg.createdAt });
      lastDate = dateStr;
    }
    messagesWithSeparators.push({ type: "message", message: msg });
  }

  // Build AI summary from messages
  const hasMessages = conversation.messages.length >= 2;
  const incomingMessages = conversation.messages.filter((m) => m.messageType === "incoming");
  const aiSummary = hasMessages && incomingMessages.length > 0
    ? `${conversation.contact.name} has ${incomingMessages.length} message${incomingMessages.length > 1 ? "s" : ""} in this conversation.${conversation.assignee ? ` Last agent: ${conversation.assignee.name}.` : ""} ${conversation.priority === "urgent" || conversation.priority === "high" ? " Priority: " + conversation.priority + "." : ""}`
    : null;

  const TABS: { id: ComposerTab; label: string; icon: React.ReactNode }[] = [
    { id: "reply",       label: "Reply",       icon: <MessageSquare className="w-3 h-3" /> },
    { id: "note",        label: "Note",        icon: <FileText className="w-3 h-3" /> },
    { id: "ai-draft",    label: "AI Draft",    icon: <Sparkles className="w-3 h-3" /> },
    { id: "attach",      label: "Attach",      icon: <Paperclip className="w-3 h-3" /> },
    { id: "quick-reply", label: "Quick Reply", icon: <Zap className="w-3 h-3" /> },
  ];

  const isResolved = conversation.status === "resolved";
  const isPending = conversation.status === "pending";

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="lg:hidden mt-0.5 flex-shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground leading-tight">{conversation.contact.name}</h2>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className={cn("w-1.5 h-1.5 rounded-full inline-block",
                isResolved ? "bg-green-500" : isPending ? "bg-amber-500" : "bg-green-500"
              )} />
              <ChannelIcon type={conversation.channel} size={10} className="opacity-60" />
              {channelLabel}
            </span>
            {conversation.mailboxId && (() => {
              const addr = accessibleMailboxes.find((m) => m.id === conversation.mailboxId)?.address;
              return addr ? (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground" title={`This thread belongs to ${addr}`}>
                    <Mail className="w-3 h-3 opacity-60" /> {addr}
                  </span>
                </>
              ) : null;
            })()}
            {conversation.contact.phone && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground font-mono">{conversation.contact.phone}</span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground">Ticket {ticketNum}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className={cn("text-xs font-semibold capitalize",
              isResolved ? "text-green-500" : isPending ? "text-amber-500" : "text-blue-500"
            )}>
              {conversation.status}
            </span>
            {sla && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className={cn("text-xs font-semibold", sla.urgent ? "text-red-500" : "text-amber-500")}>
                  {sla.text}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
            onClick={() => void handleAiAssist()}
            disabled={aiDrafting}
          >
            {aiDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            AI Assist
          </button>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Translate the latest customer message to English"
            onClick={() => void handleTranslate()}
            disabled={translating}
          >
            {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
          </button>
          {showCallBtn && (
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              onClick={() => void makeVapiCall(phone)}
              disabled={!!callingPhone}
              title={`Call ${phone}`}
            >
              {callingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            </button>
          )}

          {/* More options dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                disabled={statusUpdating}
              >
                {statusUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {!isResolved ? (
                <DropdownMenuItem onClick={() => void handleStatusUpdate("resolved")} className="gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  Mark as Resolved
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => void handleStatusUpdate("open")} className="gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                  Reopen
                </DropdownMenuItem>
              )}
              {!isPending && !isResolved && (
                <DropdownMenuItem onClick={() => void handleStatusUpdate("pending")} className="gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Mark as Pending
                </DropdownMenuItem>
              )}
              {isPending && (
                <DropdownMenuItem onClick={() => void handleStatusUpdate("open")} className="gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                  Reopen
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { navigator.clipboard.writeText(conversation.contact.phone || conversation.contact.email || "").catch(() => {}); toast({ title: "Copied to clipboard" }); }}
                className="gap-2"
              >
                Copy contact info
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── AI Summary banner ── */}
      {aiSummary && showAiSummary && (
        <div className="flex items-start gap-2.5 px-4 py-2.5 bg-primary/5 border-b border-primary/10 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-foreground/80 flex-1 leading-relaxed">
            <span className="font-semibold text-primary">AI Summary: </span>
            {aiSummary}
          </p>
          <button
            onClick={() => setShowAiSummary(false)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Messages ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5">
        {hiddenCount > 0 && (
          <div className="flex justify-center pb-3">
            <button
              onClick={() => setRenderAll(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground transition-colors"
            >
              Load {hiddenCount} earlier message{hiddenCount > 1 ? "s" : ""}
            </button>
          </div>
        )}
        {messagesWithSeparators.map((item, i) => {
          if (item.type === "separator") {
            return (
              <div key={`sep-${i}`} className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground font-medium px-2 flex-shrink-0">
                  {formatDateSeparator(item.date)}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            );
          }
          return (
            <motion.div
              key={item.message.id}
              // New messages fade/slide in like Gmail; existing keyed rows don't re-animate.
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
            >
              <MessageBubble
                message={item.message}
                contact={item.message.messageType === "incoming" ? conversation.contact : undefined}
                conversationId={conversation.id}
              />
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── AI Suggested Reply ── */}
      {aiSuggestedReply && activeTab === "reply" && (
        <AiSuggestedReply
          text={aiSuggestedReply}
          onUse={(t) => { setInputValue(t); setAiSuggestedReply(null); inputRef.current?.focus(); }}
        />
      )}

      {/* ── Quick Reply chips (quick-reply tab) ── */}
      {activeTab === "quick-reply" && quickReplies.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap border-t border-border pt-2">
          {quickReplies.map((reply) => (
            <button
              key={reply.id}
              onClick={() => { onSendMessage(reply.text); setActiveTab("reply"); }}
              className="px-3 py-1.5 text-xs border border-border rounded-full hover:bg-accent hover:text-accent-foreground transition-colors text-foreground"
            >
              {reply.text}
            </button>
          ))}
        </div>
      )}

      {/* ── AI Draft tab content ── */}
      {activeTab === "ai-draft" && (
        <div className="mx-4 mb-3 mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center justify-between gap-1.5 px-3 py-1.5 border-b border-amber-500/20">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">AI Draft</span>
            </div>
            <button
              onClick={() => void handleGenerateDraft()}
              disabled={aiDrafting}
              className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
            >
              {aiDrafting ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</> : <><RefreshCw className="w-3 h-3" /> {aiSuggestedReply ? "Regenerate" : "Generate"}</>}
            </button>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-sm text-foreground leading-relaxed">
              {aiDrafting
                ? "Drafting a reply from the conversation…"
                : aiSuggestedReply ?? "Click Generate to draft a reply from this conversation's context."}
            </p>
          </div>
          {aiSuggestedReply && !aiDrafting && (
            <div className="flex items-center justify-end px-3 py-1.5 bg-amber-500/5 border-t border-amber-500/15">
              <button
                onClick={() => { setInputValue(aiSuggestedReply); setAiSuggestedReply(null); setActiveTab("reply"); inputRef.current?.focus(); }}
                className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
              >
                Use this draft
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Attach tab content ── */}
      {activeTab === "attach" && (
        <div className="mx-4 mb-3 mt-2 rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
          />
          {attachFile ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-xs truncate text-foreground">{attachFile.name}</span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">({(attachFile.size / 1024).toFixed(0)} KB)</span>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => setAttachFile(null)} disabled={attaching} className="text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-50">Remove</button>
                <button
                  onClick={() => void handleAttachSend()}
                  disabled={attaching}
                  className="text-[10px] font-semibold text-white px-2.5 py-1 rounded-md disabled:opacity-60 inline-flex items-center gap-1"
                  style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
                >
                  {attaching ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</> : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center gap-1.5 py-4 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors"
            >
              <Paperclip className="w-5 h-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Click to choose a file</span>
            </button>
          )}
        </div>
      )}

      {/* ── Composer ── */}
      <div className="border-t border-border shrink-0 bg-card">
        {/* Tab bar */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-border/50">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ChannelIcon type={conversation.channel} size={10} />
            {channelLabel}
          </span>
        </div>

        {/* Email subject + Cc/Bcc — editable, Gmail-style (reply tab only). Cc/Bcc collapsed by default. */}
        {isEmailChannel && activeTab === "reply" && (
          <div className="px-3 pt-2 space-y-1">
            {/* From selector — only when the user has active mailboxes to send from. "" keeps the
                default connected-account (BYO-SMTP) path; picking a mailbox routes via /send-as-mailbox. */}
            {accessibleMailboxes.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground flex-shrink-0 w-[44px]">From</span>
                <select
                  value={selectedMailboxId}
                  onChange={(e) => setSelectedMailboxId(e.target.value)}
                  className="flex-1 bg-transparent text-xs outline-none border-b border-border/60 focus:border-primary/60 py-1 text-foreground transition-colors"
                >
                  <option value="">Connected account (default)</option>
                  {accessibleMailboxes.map((m) => (
                    <option key={m.id} value={m.id}>{m.address}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground flex-shrink-0 w-[44px]">Subject</span>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Re: …"
                className="flex-1 bg-transparent text-xs outline-none border-b border-border/60 focus:border-primary/60 py-1 text-foreground placeholder:text-muted-foreground transition-colors"
              />
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  Cc / Bcc
                </button>
              )}
            </div>
            {showCcBcc && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground flex-shrink-0 w-[44px]">Cc</span>
                  <input
                    type="text"
                    value={emailCc}
                    onChange={(e) => setEmailCc(e.target.value)}
                    placeholder="comma-separated emails"
                    className={cn(
                      "flex-1 bg-transparent text-xs outline-none border-b py-1 text-foreground placeholder:text-muted-foreground transition-colors",
                      emailCc.trim() && !isValidAddressList(emailCc) ? "border-destructive/60" : "border-border/60 focus:border-primary/60"
                    )}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground flex-shrink-0 w-[44px]">Bcc</span>
                  <input
                    type="text"
                    value={emailBcc}
                    onChange={(e) => setEmailBcc(e.target.value)}
                    placeholder="hidden from other recipients"
                    className={cn(
                      "flex-1 bg-transparent text-xs outline-none border-b py-1 text-foreground placeholder:text-muted-foreground transition-colors",
                      emailBcc.trim() && !isValidAddressList(emailBcc) ? "border-destructive/60" : "border-border/60 focus:border-primary/60"
                    )}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Input area — only show for reply/note tabs */}
        {(activeTab === "reply" || activeTab === "note") && (
          <div className="px-3 pb-3 pt-2">
            {activeTab === "note" ? (
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2 flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add an internal note (only visible to your team)..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {aiSuggestedReply && (
                  <button className="flex-shrink-0 w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={aiSuggestedReply ? "Use AI suggested reply or type a message..." : "Type a message..."}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-1"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
                >
                  <Send className="w-3 h-3" />
                  Send
                </button>
              </div>
            )}
            {activeTab === "note" && (
              <div className="flex justify-end mt-1.5">
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white transition-opacity disabled:opacity-40"
                >
                  <Send className="w-3 h-3" />
                  Add Note
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
