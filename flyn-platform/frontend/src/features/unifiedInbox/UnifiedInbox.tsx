import { useState, useEffect, useRef } from "react";
import type { Channel, Conversation, Message, QuickReply, ChannelType } from "@/types/inbox";
import { inboxService } from "@/services/inbox";
import { mailboxesService, type TenantMailbox } from "@/services/mailboxes";
import { getContacts } from "@/services/crm";
import { ConversationList } from "./ConversationList";
import { ChatThread } from "./ChatThread";
import { ComposeEmailModal } from "./ComposeEmailModal";
import { CustomerInfoPanel } from "./CustomerInfoPanel";
import { ChannelIcon } from "./ChannelIcon";
import { cn } from "@/lib/utils";
import { Users, Plus, SlidersHorizontal, MoreHorizontal, Search, RefreshCw, AlertCircle, Mail, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";

const POLL_INTERVAL_MS = 10_000;

type StatusFilter = "open" | "pending" | "resolved" | "mine";

const CHANNEL_PILL_LABELS: Partial<Record<ChannelType, string>> = {
  whatsapp: "WhatsApp",
  email: "Email",
  telegram: "Telegram",
  web: "Web",
  webchat: "Web",
  sms: "SMS",
  facebook: "Facebook",
  instagram: "Instagram",
  voice: "Voice",
};

export function UnifiedInbox() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  // phone → CRM tags map (normalized phone → string[])
  const [phoneTagMap, setPhoneTagMap] = useState<Record<string, string[]>>({});
  const [channelTypeFilter, setChannelTypeFilter] = useState<ChannelType | null>(null);
  // Mailbox switcher: the user's mailboxes + the active filter ("all" = everything they may see).
  const [myMailboxes, setMyMailboxes] = useState<TenantMailbox[]>([]);
  const [mailboxFilter, setMailboxFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [searchQuery, setSearchQuery] = useState("");
  // Email receive capability — null until checked; {receiving:false} drives the warning banner.
  const [emailReceive, setEmailReceive] = useState<{ connected: boolean; receiving: boolean } | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  // The 10s poll's setInterval is created once (deps []), so it captures the FIRST render's
  // loadConversations — which closed over selectedConversationId=null FOREVER. That made the poll
  // think nothing was selected and force-switch the open chat to the most-active conversation every
  // tick (and, with no ChatThread key, carry a staged attachment to the wrong person). These refs
  // give the long-lived closure the CURRENT selection + ensure auto-select happens only once.
  const selectedConversationIdRef = useRef<string | null>(null);
  const didInitialSelectRef = useRef(false);
  useEffect(() => { selectedConversationIdRef.current = selectedConversationId; }, [selectedConversationId]);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Header-button UI state
  const [showMore, setShowMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [newConvoPhone, setNewConvoPhone] = useState("");
  const [newConvoMsg, setNewConvoMsg] = useState("");
  const [startingConvo, setStartingConvo] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "unread">("newest");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const filtersActive = unreadOnly || sortOrder !== "newest" || channelTypeFilter !== null;

  const loadConversations = async (silent = false) => {
    try {
      const data = await inboxService.getConversations();
      // Read the CURRENT selection via the ref — never the value captured when this function was
      // created (the polled copy is stale; see the ref declaration above).
      const selId = selectedConversationIdRef.current;
      setConversations((prev) => {
        const prevMap = new Map(prev.map(c => [c.id, c]));
        const merged = data.map((newConv) => {
          const existing = prevMap.get(newConv.id);
          if (existing) {
            const isOpen = existing.id === selId;
            if (isOpen || existing.messages.length > 1) {
              return { ...newConv, messages: existing.messages, lastMessage: existing.lastMessage, unreadCount: isOpen ? 0 : newConv.unreadCount };
            }
          }
          return newConv;
        });
        if (selId && !merged.find(c => c.id === selId)) {
          const current = prevMap.get(selId);
          if (current) merged.push(current);
        }
        return merged.sort((a, b) => (b.lastMessage?.createdAt.getTime() ?? 0) - (a.lastMessage?.createdAt.getTime() ?? 0));
      });
      if (!silent) setLoadError(null);
      // Auto-open the first conversation ONLY on the very first load when nothing is selected — never
      // on a poll. A poll must never change the open chat (that misrouted attachments to whoever was
      // most-active). Selection changes only on an explicit click thereafter.
      if (data.length > 0 && !selId && !didInitialSelectRef.current) {
        didInitialSelectRef.current = true;
        setSelectedConversationId(data[0].id);
      }
    } catch (err) {
      if (!silent) setLoadError(err instanceof Error ? err.message : "Failed to load conversations");
    }
  };

  // "Sync Now" — reconnect a stale WhatsApp session and pull recent conversations back in,
  // then refresh the list (with a couple of delayed refreshes to catch the async history import).
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await inboxService.syncWhatsApp();
      if (!res.success) {
        toast({ variant: "destructive", title: "Sync failed", description: res.error || "Try again in a moment." });
      } else if (res.status === "needs_rescan") {
        toast({ variant: "destructive", title: "WhatsApp needs reconnecting", description: "Your session was logged out — reconnect it in Settings → Channels (scan the QR)." });
      } else if (res.status === "reconnecting") {
        toast({ title: "Syncing WhatsApp…", description: "Reconnecting and pulling recent conversations. This can take a few seconds." });
      } else {
        toast({ title: "Up to date", description: "WhatsApp is connected and synced." });
      }
      // Refresh now and a couple more times — the history import lands asynchronously after reconnect.
      await loadConversations(true);
      setTimeout(() => loadConversations(true), 4000);
      setTimeout(() => loadConversations(true), 10000);
    } finally {
      setSyncing(false);
    }
  };

  // Normalize phone: strip non-digits, keep last 10 digits for loose matching
  const normalizePhone = (phone: string) => phone.replace(/\D/g, "").slice(-10);

  useEffect(() => {
    const init = async () => {
      try {
        const [channelsData, quickRepliesData] = await Promise.all([
          inboxService.getChannels(),
          inboxService.getQuickReplies(),
        ]);
        setChannels(channelsData);
        setQuickReplies(quickRepliesData);
        setLoadError(null);
        // Check email receive-capability so we can warn SMTP-only tenants (best-effort).
        if (channelsData.some((c) => c.type === "email")) {
          inboxService.getEmailReceiveStatus().then(setEmailReceive).catch(() => {});
        }
      } catch { /* non-fatal */ }

      // Fetch CRM contacts to get tags, non-blocking
      getContacts({ limit: 200 }).then((result) => {
        const map: Record<string, string[]> = {};
        for (const contact of result.data ?? []) {
          if (contact.phone && contact.tags?.length) {
            const key = normalizePhone(contact.phone);
            if (key) map[key] = contact.tags;
          }
          // Also index by email for email channel conversations
          if (contact.email && contact.tags?.length) {
            map[contact.email.toLowerCase()] = contact.tags;
          }
        }
        setPhoneTagMap(map);
      }).catch(() => { /* CRM unavailable — inbox still works */ });

      await loadConversations();
      setLoadingConversations(false);
    };
    init();
    pollRef.current = setInterval(() => loadConversations(true), POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Live delivery/read ticks for the OPEN conversation. The list poll freezes the open thread's
  // messages (to keep fetched history + scroll), so a WhatsApp status flipping to delivered/read
  // wouldn't show. We re-fetch the open conversation and merge ONLY the `status` field by message
  // id — message identity + order are preserved, so the WhatsApp-blue read tick updates live
  // without ever jumping the scroll. Re-binds on selection change (always the fresh id).
  useEffect(() => {
    const id = selectedConversationId;
    if (!id) return;
    const refreshTicks = async () => {
      const fresh = await inboxService.getConversationMessages(id).catch(() => [] as Message[]);
      if (!fresh.length) return;
      const statusById = new Map<string, Message["status"]>(
        fresh.map((m): [string, Message["status"]] => [m.id, m.status]),
      );
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== id) return conv;
          let changed = false;
          const messages = conv.messages.map((m) => {
            const s = statusById.get(m.id);
            if (s && s !== m.status) { changed = true; return { ...m, status: s }; }
            return m;
          });
          return changed ? { ...conv, messages } : conv;
        }),
      );
    };
    const h = setInterval(refreshTicks, POLL_INTERVAL_MS);
    return () => clearInterval(h);
  }, [selectedConversationId]);

  // Merge CRM tags into each conversation's labels/contact.tags
  // Load the user's mailboxes once (for the switcher + attribution chip). Silent on failure.
  useEffect(() => {
    let alive = true;
    mailboxesService.mine()
      .then((mb) => { if (alive) setMyMailboxes(mb); })
      .catch(() => { if (alive) setMyMailboxes([]); });
    return () => { alive = false; };
  }, []);

  // Active subset — drives the Compose button visibility + the ChatThread From selector.
  // Derived from the same mine() fetch (no second request).
  const activeMailboxes = myMailboxes.filter((m) => m.status === "active");

  // id → address, so a conversation's mailboxId renders as a readable chip.
  const mailboxAddressById: Record<string, string> = Object.fromEntries(myMailboxes.map((m) => [m.id, m.address]));

  const enrichedConversations = conversations.map((conv) => {
    const phone = conv.contact.phone ?? "";
    const email = conv.contact.email ?? "";
    const phoneKey = normalizePhone(phone);
    const crmTags = phoneTagMap[phoneKey] ?? phoneTagMap[email.toLowerCase()] ?? [];
    if (!crmTags.length) return conv;
    // Merge with any existing labels, dedup
    const merged = Array.from(new Set([...(conv.labels ?? []), ...crmTags]));
    return { ...conv, labels: merged, contact: { ...conv.contact, tags: merged } };
  });

  const selectedConversation = enrichedConversations.find((c) => c.id === selectedConversationId);

  // Unique channel types from conversations
  const channelTypes = Array.from(new Set(conversations.map(c => c.channel)));

  // Apply filters
  const filteredConversations = enrichedConversations.filter((conv) => {
    // Channel type filter
    if (channelTypeFilter && conv.channel !== channelTypeFilter) return false;

    // Mailbox filter — a specific mailbox shows its own tagged threads PLUS untagged convs (untagged
    // is global to every view, mirroring the backend gate). "all" shows everything the server scoped.
    if (mailboxFilter !== "all" && conv.mailboxId && conv.mailboxId !== mailboxFilter) return false;

    // Status filter
    if (statusFilter === "open" && conv.status !== "open") return false;
    if (statusFilter === "pending" && conv.status !== "pending") return false;
    if (statusFilter === "resolved" && conv.status !== "resolved") return false;
    // "mine" — would filter by current user assignee; for now show all open
    if (statusFilter === "mine" && conv.status !== "open") return false;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!conv.contact.name.toLowerCase().includes(q) &&
          !(conv.lastMessage?.content.toLowerCase().includes(q)) &&
          !(conv.contact.phone?.includes(q)) &&
          !(conv.contact.email?.toLowerCase().includes(q))) {
        return false;
      }
    }

    // Read filter (⚙️)
    if (unreadOnly && (conv.unreadCount ?? 0) === 0) return false;

    return true;
  }).sort((a, b) => {
    if (sortOrder === "unread") return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
    const at = a.lastMessage?.createdAt.getTime() ?? a.updatedAt.getTime();
    const bt = b.lastMessage?.createdAt.getTime() ?? b.updatedAt.getTime();
    return sortOrder === "oldest" ? at - bt : bt - at;
  });

  // Status tab counts
  const statusCounts: Record<StatusFilter, number> = {
    open: enrichedConversations.filter(c => c.status === "open").length,
    pending: enrichedConversations.filter(c => c.status === "pending").length,
    resolved: enrichedConversations.filter(c => c.status === "resolved").length,
    mine: enrichedConversations.filter(c => c.status === "open" && c.assignee).length,
  };

  // Total unread
  const totalUnread = enrichedConversations.reduce((acc, c) => acc + c.unreadCount, 0);

  const handleUpdateStatus = async (status: "open" | "pending" | "resolved") => {
    if (!selectedConversationId) return;
    const result = await inboxService.updateConversationStatus(selectedConversationId, status);
    if (result.success) {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedConversationId ? { ...conv, status } : conv
        )
      );
    } else {
      throw new Error(result.error || "Failed to update status");
    }
  };

  const handleSendMessage = async (content: string, subject?: string, cc?: string, bcc?: string, convId?: string) => {
    const targetId = convId || selectedConversationId;
    if (!targetId) return;
    const result = await inboxService.sendReply(targetId, content, subject, cc, bcc);
    if (result.success) {
      const optimistic = {
        id: `opt-${Date.now()}`,
        content,
        messageType: "outgoing" as const,
        createdAt: new Date(),
        sender: { id: "me", name: "You" },
        status: "sent" as const,
      };
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === targetId
            ? { ...conv, messages: [...conv.messages, optimistic], lastMessage: optimistic }
            : conv
        )
      );
    } else {
      // Surface the failure: a 'failed' row in the thread (AlertCircle tick) + a retry toast that
      // actually re-sends the same content/subject to the same conversation.
      const failed = {
        id: `fail-${Date.now()}`,
        content,
        messageType: "outgoing" as const,
        createdAt: new Date(),
        sender: { id: "me", name: "You" },
        status: "failed" as const,
      };
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === targetId ? { ...conv, messages: [...conv.messages, failed] } : conv
        )
      );
      toast({
        variant: "destructive",
        title: "Send failed",
        description: result.error || "Message failed to send",
        action: (
          <ToastAction altText="Retry sending" onClick={() => void handleSendMessage(content, subject, cc, bcc, targetId)}>
            Retry
          </ToastAction>
        ),
      });
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setShowMobileChat(true);
    setConversations((prev) =>
      prev.map((conv) => conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv)
    );
    inboxService.markRead(conversationId).catch(() => {});
    inboxService.getConversationMessages(conversationId).then((messages) => {
      if (messages.length > 0) {
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? { ...conv, messages, lastMessage: messages[messages.length - 1] }
              : conv
          )
        );
      }
    }).catch(() => {});
  };

  // 'r' focuses the reply box (Gmail-style). Ignored while typing in an input/textarea.
  // NOTE: j/k conversation navigation was REMOVED — a global keypress must never change which
  // conversation is open (it caused "a random chat opens" while reading). Selection changes ONLY
  // on an explicit click. This also drops filteredConversations from the deps, so the listener no
  // longer re-binds on every 10s poll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      if (e.key.toLowerCase() !== "r") return;
      if (selectedConversationId) { e.preventDefault(); window.dispatchEvent(new CustomEvent("flyn-inbox-focus-reply")); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedConversationId]);

  // Delete one conversation — optimistic (remove now, restore on error). Mirror only, not WhatsApp.
  const handleDeleteConversation = async (conversationId: string) => {
    const prev = conversations;
    setConversations((cs) => cs.filter((c) => c.id !== conversationId));
    if (selectedConversationId === conversationId) setSelectedConversationId(null);
    const res = await inboxService.deleteConversation(conversationId);
    if (!res.success) {
      setConversations(prev); // restore
      toast({ variant: "destructive", title: "Couldn't delete", description: res.error || "Try again." });
    } else {
      toast({ title: "Conversation deleted", description: "Removed from Flyn (not from WhatsApp)." });
    }
  };

  const handleMarkAllRead = async () => {
    setShowMore(false);
    setConversations((cs) => cs.map((c) => ({ ...c, unreadCount: 0 })));
    const res = await inboxService.markAllRead();
    toast(res.success ? { title: "All marked as read" } : { variant: "destructive", title: "Failed to mark all read" });
  };

  const handleExport = async () => {
    setShowMore(false);
    toast({ title: "Exporting…" });
    const res = await inboxService.exportConversations();
    if (!res.success) toast({ variant: "destructive", title: "Export failed", description: res.error });
  };

  const handleDeleteAll = async () => {
    setShowDeleteAll(false);
    setShowMore(false);
    const prev = conversations;
    setConversations([]);
    setSelectedConversationId(null);
    const res = await inboxService.deleteAllConversations();
    if (!res.success) {
      setConversations(prev);
      toast({ variant: "destructive", title: "Couldn't delete all", description: res.error });
    } else {
      toast({ title: "All conversations deleted", description: "Removed from Flyn. Your WhatsApp is not affected." });
    }
  };

  const handleStartConversation = async () => {
    const phone = newConvoPhone.trim();
    if (!phone) { toast({ variant: "destructive", title: "Phone number required" }); return; }
    setStartingConvo(true);
    try {
      const res = await inboxService.startConversation(phone, newConvoMsg.trim() || undefined);
      if (!res.success || !res.conversationId) {
        toast({ variant: "destructive", title: "Couldn't start conversation", description: res.error || "Try again." });
        return;
      }
      setShowNewConvo(false);
      setNewConvoPhone(""); setNewConvoMsg("");
      await loadConversations(true);
      setSelectedConversationId(res.conversationId);
      toast({ title: res.isNew ? "Conversation started" : "Existing conversation opened" });
    } finally {
      setStartingConvo(false);
    }
  };

  const STATUS_TABS: { id: StatusFilter; label: string }[] = [
    { id: "open",     label: "Open" },
    { id: "pending",  label: "Pending" },
    { id: "resolved", label: "Resolved" },
    { id: "mine",     label: "Mine" },
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Email receiving not configured — SMTP connected but no IMAP, so inbound silently never
          ingests. Tell the user instead of leaving them confused. */}
      {emailReceive && emailReceive.connected && !emailReceive.receiving && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs shrink-0">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <strong>Email receiving isn't configured.</strong> You can send, but incoming email won't appear here until you add IMAP (host, port 993, your app password) in Settings → Channels → Email.
          </span>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
      {/* ── LEFT PANEL ── */}
      <div
        className={cn(
          "w-[300px] flex-shrink-0 flex flex-col border-r border-border bg-card",
          showMobileChat && "hidden md:flex"
        )}
      >
        {/* Panel header */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground">Unified Inbox</h1>
              {totalUnread > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                  {totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void handleSync()}
                disabled={syncing}
                title="Sync Now — reconnect WhatsApp and pull recent conversations"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              </button>
              <button
                onClick={() => setShowNewConvo(true)}
                title="New conversation"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
              {activeMailboxes.length > 0 && (
                <button
                  onClick={() => setShowCompose(true)}
                  title="New email"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowFilters((v) => !v)}
                title="Filters"
                className={cn("relative w-7 h-7 rounded-lg flex items-center justify-center hover:text-foreground hover:bg-muted transition-colors", showFilters || filtersActive ? "text-primary" : "text-muted-foreground")}>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {filtersActive && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowMore((v) => !v)}
                  title="More"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {showMore && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowMore(false)} />
                    <div className="absolute right-0 mt-1 w-52 z-40 rounded-lg border border-border bg-card shadow-lg py-1 text-sm">
                      <button onClick={() => void handleMarkAllRead()} className="w-full text-left px-3 py-2 hover:bg-muted">Mark all as read</button>
                      <button onClick={() => void handleExport()} className="w-full text-left px-3 py-2 hover:bg-muted">Export chats (CSV)</button>
                      <div className="my-1 border-t border-border" />
                      <button onClick={() => { setShowMore(false); setShowDeleteAll(true); }} className="w-full text-left px-3 py-2 text-red-500 hover:bg-red-500/10">Delete all conversations</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ⚙️ Filter bar */}
          {showFilters && (
            <div className="mb-3 rounded-lg border border-border bg-muted/30 p-2 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Filters</span>
                {filtersActive && (
                  <button onClick={() => { setUnreadOnly(false); setSortOrder("newest"); setChannelTypeFilter(null); }} className="text-primary hover:underline">Clear</button>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                <span>Unread only</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Sort:</span>
                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)} className="bg-background border border-border rounded px-1.5 py-0.5">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="unread">Unread first</option>
                </select>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-muted border border-transparent focus:border-border focus:outline-none text-foreground placeholder:text-muted-foreground transition-colors"
            />
          </div>

          {/* Channel pills */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setChannelTypeFilter(null)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                channelTypeFilter === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full inline-block", channelTypeFilter === null ? "bg-primary-foreground" : "bg-muted-foreground")} />
              All {conversations.length > 0 && conversations.length}
            </button>
            {channelTypes.slice(0, 4).map((type) => {
              const count = conversations.filter(c => c.channel === type).length;
              const label = CHANNEL_PILL_LABELS[type] ?? type;
              return (
                <button
                  key={type}
                  onClick={() => setChannelTypeFilter(channelTypeFilter === type ? null : type)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                    channelTypeFilter === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  <ChannelIcon type={type} size={9} className={channelTypeFilter === type ? "text-primary-foreground" : undefined} />
                  {label}
                  {count > 0 && <span className="opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Mailbox switcher — only when the user has mailboxes. "All" + one pill per mailbox.
              Filters client-side over the already server-scoped list (no mailboxId sent to the API). */}
          {myMailboxes.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              <button
                onClick={() => setMailboxFilter("all")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                  mailboxFilter === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                )}
              >
                <Mail className="w-2.5 h-2.5" /> All mailboxes
              </button>
              {myMailboxes.map((m) => {
                const count = conversations.filter((c) => c.mailboxId === m.id).length;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMailboxFilter(mailboxFilter === m.id ? "all" : m.id)}
                    title={m.address}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border max-w-[160px]",
                      mailboxFilter === m.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    <span className="truncate">{m.address}</span>
                    {count > 0 && <span className="opacity-70 flex-shrink-0">{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex border-b border-border shrink-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "flex-1 py-2 text-[11px] font-medium transition-colors relative",
                statusFilter === tab.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {statusCounts[tab.id] > 0 && (
                <span className={cn(
                  "ml-1 text-[10px] font-bold",
                  statusFilter === tab.id ? "text-primary" : "text-muted-foreground/60"
                )}>
                  ({statusCounts[tab.id]})
                </span>
              )}
              {statusFilter === tab.id && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Conversation list — skeletons on first load so it doesn't flash empty. */}
        {loadingConversations ? (
          <div className="flex-1 overflow-hidden px-4 py-3 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ConversationList
            conversations={filteredConversations}
            selectedConversation={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={(id) => void handleDeleteConversation(id)}
            searchQuery={searchQuery}
            mailboxAddressById={mailboxAddressById}
          />
        )}
      </div>

      {/* ── CENTER: Chat Thread ── */}
      <div className={cn("flex-1 min-w-0 p-3", !showMobileChat && "hidden md:block")}>
        {selectedConversation ? (
          <ChatThread
            // key = conversationId → switching conversations REMOUNTS ChatThread, resetting its
            // draft + staged attachment. This makes it physically impossible for a file picked for
            // one chat to be sent to another (the wrong-recipient bug). Compose state is bound to
            // its conversation.
            key={selectedConversation.id}
            conversation={selectedConversation}
            quickReplies={quickReplies}
            onSendMessage={handleSendMessage}
            onBack={() => setShowMobileChat(false)}
            onUpdateStatus={handleUpdateStatus}
            activeMailboxes={activeMailboxes}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-card rounded-xl border border-border shadow-sm">
            <div className="text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {loadError ? "Inbox unavailable" : filteredConversations.length === 0 ? "No conversations" : "Select a conversation"}
              </p>
              <p className="text-xs mt-1 max-w-[220px] mx-auto leading-relaxed">
                {loadError
                  || (filteredConversations.length === 0
                    ? channelTypeFilter
                      ? `No messages in this channel yet`
                      : "Connect a channel in Settings → Channels"
                    : "Choose a conversation from the list")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Customer Info ── */}
      <div className="hidden xl:block w-[280px] flex-shrink-0 p-3 pl-0">
        {selectedConversation ? (
          <CustomerInfoPanel
            contact={selectedConversation.contact}
            conversation={selectedConversation}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-card rounded-xl border border-border shadow-sm">
            <p className="text-muted-foreground text-xs">No customer selected</p>
          </div>
        )}
      </div>
      </div>{/* end flex-row */}

      {/* ➕ New Conversation panel */}
      {showNewConvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewConvo(false)}>
          <div className="w-[380px] rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground mb-3">New Conversation</h2>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Phone number</label>
            <input
              autoFocus value={newConvoPhone} onChange={(e) => setNewConvoPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full mb-3 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            <label className="block text-xs font-medium text-muted-foreground mb-1">Message <span className="text-muted-foreground/60">(optional)</span></label>
            <textarea
              value={newConvoMsg} onChange={(e) => setNewConvoMsg(e.target.value)} rows={3}
              placeholder="Type a first message…"
              className="w-full mb-2 px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
            <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-600 border border-green-500/20">WhatsApp</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewConvo(false)} className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Cancel</button>
              <button onClick={() => void handleStartConversation()} disabled={startingConvo}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {startingConvo ? "Starting…" : "Start Conversation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compose new email modal — only mounted when open; activeMailboxes shared from mine() fetch */}
      <ComposeEmailModal
        open={showCompose}
        onOpenChange={setShowCompose}
        activeMailboxes={activeMailboxes}
        onSent={() => void loadConversations(true)}
      />

      {/* Delete All confirm modal */}
      {showDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteAll(false)}>
          <div className="w-[400px] rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground mb-2">Delete ALL conversations?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This permanently removes all chats and attachments from <strong>Flyn</strong>. Your WhatsApp is not affected.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteAll(false)} className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Cancel</button>
              <button onClick={() => void handleDeleteAll()} className="text-sm px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600">
                Delete All — this cannot be undone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
