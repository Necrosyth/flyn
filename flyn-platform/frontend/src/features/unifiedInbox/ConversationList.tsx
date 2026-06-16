import { useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/inbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChannelIcon } from "./ChannelIcon";
import { AlertTriangle, Trash2, Mail } from "lucide-react";

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: string | null;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  searchQuery?: string;
  /** mailbox id → address, to render a "via <mailbox>" attribution chip on tagged rows. */
  mailboxAddressById?: Record<string, string>;
}

/** Bold the matched substring (case-insensitive) for search highlight. Escapes regex metachars. */
function highlight(text: string, query?: string): ReactNode {
  const q = query?.trim();
  if (!q) return text;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-amber-300/50 text-foreground rounded-[2px] px-0.5">{p}</mark>
      : p
  );
}

// Keyword → color mapping — checked against normalized tag words
const KEYWORD_STYLES: [string[], string][] = [
  [["urgent", "critical", "asap", "emergency"],         "bg-red-500/15 text-red-500 border-red-500/20"],
  [["support", "help", "issue", "problem", "request"],  "bg-blue-500/15 text-blue-400 border-blue-500/20"],
  [["vip", "premium", "enterprise", "key", "priority"], "bg-amber-500/15 text-amber-500 border-amber-500/20"],
  [["billing", "invoice", "payment", "finance"],        "bg-purple-500/15 text-purple-400 border-purple-500/20"],
  [["lead", "prospect", "qualified", "opportunity"],    "bg-green-500/15 text-green-500 border-green-500/20"],
  [["resolved", "closed", "done", "complete"],          "bg-green-500/10 text-green-600 border-green-500/20"],
  [["bot", "auto", "automated", "ai"],                  "bg-muted text-muted-foreground border-border"],
  [["pending", "waiting", "hold", "queue"],             "bg-amber-500/10 text-amber-500 border-amber-500/20"],
  [["appointment", "meeting", "schedule", "booking"],   "bg-sky-500/15 text-sky-400 border-sky-500/20"],
  [["pricing", "price", "plan", "subscription", "cost"],"bg-violet-500/15 text-violet-400 border-violet-500/20"],
  [["unqualified", "cold", "inactive", "churn"],        "bg-rose-500/15 text-rose-400 border-rose-500/20"],
  [["partner", "affiliate", "referral"],                "bg-teal-500/15 text-teal-400 border-teal-500/20"],
];

// Rotating fallback palette for unknown tags
const FALLBACK_PALETTE = [
  "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "bg-violet-500/15 text-violet-400 border-violet-500/20",
  "bg-green-500/15 text-green-500 border-green-500/20",
  "bg-amber-500/15 text-amber-500 border-amber-500/20",
  "bg-pink-500/15 text-pink-400 border-pink-500/20",
  "bg-teal-500/15 text-teal-400 border-teal-500/20",
  "bg-orange-500/15 text-orange-400 border-orange-500/20",
  "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
];

function getLabelStyle(label: string): string {
  const words = label.toLowerCase().replace(/[-_]/g, " ").split(/\s+/);
  for (const [keys, style] of KEYWORD_STYLES) {
    if (words.some((w) => keys.includes(w))) return style;
  }
  // Deterministic color from label hash
  const hash = label.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

// Clean tag for display: hyphen/underscore → space, title-case each word
function formatTagLabel(tag: string): string {
  return tag
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMs < 86400000) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getSlaInfo(conv: Conversation): { label: string; urgent: boolean } | null {
  if (conv.status !== "open" || !conv.priority) return null;
  const SLA: Record<string, number> = { urgent: 15, high: 60, medium: 240, low: 1440 };
  const total = SLA[conv.priority] ?? 240;
  const elapsed = Math.floor((Date.now() - conv.createdAt.getTime()) / 60000);
  const left = total - elapsed;
  if (left > 30) return null;
  if (left <= 0) return { label: "SLA breach", urgent: true };
  return { label: `${left}m left`, urgent: left <= 5 };
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-green-500", "bg-amber-500",
  "bg-red-500", "bg-pink-500", "bg-cyan-500", "bg-orange-500",
];

function getAvatarColor(name: string): string {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function ConversationList({ conversations, selectedConversation, onSelectConversation, onDeleteConversation, searchQuery, mailboxAddressById }: ConversationListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const reduce = useReducedMotion();
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 px-4">
        <p className="text-sm font-medium text-muted-foreground">No conversations</p>
        <p className="text-xs text-muted-foreground/60 text-center">Connect a channel in Settings → Channels to start receiving messages</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <AnimatePresence initial={false}>
      {conversations.map((conv, i) => {
        const sla = getSlaInfo(conv);
        const labels = conv.labels ?? [];
        const isSelected = selectedConversation === conv.id;
        const avatarColor = getAvatarColor(conv.contact.name);
        const initials = conv.contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

        const isConfirming = confirmingId === conv.id;

        return (
          <motion.div
            key={conv.id}
            role="button"
            tabIndex={0}
            // Subtle Gmail-style entry stagger; deletes animate out. Honors prefers-reduced-motion.
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16, transition: { duration: 0.15 } }}
            transition={{ duration: reduce ? 0 : 0.18, delay: reduce ? 0 : Math.min(i * 0.022, 0.28), ease: "easeOut" }}
            onClick={() => onSelectConversation(conv.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectConversation(conv.id); }}
            className={cn(
              "group relative w-full flex items-start gap-3 px-4 py-3 border-b border-border/40 transition-colors text-left cursor-pointer",
              "hover:bg-accent/40",
              isSelected
                ? "bg-primary/6 border-l-[3px] border-l-primary"
                : "border-l-[3px] border-l-transparent"
            )}
          >
            {/* Per-row delete (mirror only) */}
            {onDeleteConversation && !isConfirming && (
              <button
                type="button"
                title="Delete this conversation (from Flyn only)"
                onClick={(e) => { e.stopPropagation(); setConfirmingId(conv.id); }}
                className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {isConfirming && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 z-20 flex items-center justify-end gap-2 px-4 bg-background/95 backdrop-blur-sm"
              >
                <span className="text-[11px] text-muted-foreground mr-auto">Delete from Flyn only — not WhatsApp</span>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted"
                >Cancel</button>
                <button
                  type="button"
                  onClick={() => { onDeleteConversation(conv.id); setConfirmingId(null); }}
                  className="text-xs px-2.5 py-1 rounded-md bg-red-500 text-white hover:bg-red-600"
                >Delete</button>
              </div>
            )}

            {/* Avatar */}
            <div className="relative flex-shrink-0 mt-0.5">
              <Avatar className="w-9 h-9">
                <AvatarImage src={conv.contact.avatar} alt={conv.contact.name} />
                <AvatarFallback className={cn("text-[11px] font-bold text-white", avatarColor)}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full bg-background border border-border flex items-center justify-center">
                <ChannelIcon type={conv.channel} size={8} />
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-sm font-semibold truncate text-foreground leading-tight">
                  {highlight(conv.contact.name, searchQuery)}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {sla ? (
                    <span className={cn(
                      "flex items-center gap-0.5 text-[10px] font-bold",
                      sla.urgent ? "text-red-500" : "text-amber-500"
                    )}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {sla.label}
                    </span>
                  ) : conv.lastMessage ? (
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(conv.lastMessage.createdAt)}
                    </span>
                  ) : null}
                </div>
              </div>

              <p className="text-xs text-muted-foreground truncate mb-1.5 leading-snug">
                {conv.lastMessage?.content ? highlight(conv.lastMessage.content, searchQuery) : "No messages yet"}
              </p>

              {/* Mailbox attribution — which inbox this thread belongs to (only when it resolves). */}
              {conv.mailboxId && mailboxAddressById?.[conv.mailboxId] && (
                <div className="flex items-center gap-1 mb-1 text-[10px] text-muted-foreground">
                  <Mail className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate">via {mailboxAddressById[conv.mailboxId]}</span>
                </div>
              )}

              {labels.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {labels.slice(0, 3).map((label) => {
                    const display = formatTagLabel(label);
                    const isResolved = label.toLowerCase().includes("resolved");
                    return (
                      <span
                        key={label}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium border",
                          getLabelStyle(label)
                        )}
                      >
                        {isResolved ? "✓ " : ""}{display}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Unread indicator */}
            {conv.unreadCount > 0 && (
              <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-primary" />
            )}
          </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
