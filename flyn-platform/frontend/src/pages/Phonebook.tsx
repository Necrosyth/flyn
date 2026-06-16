import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, Search, Upload, Trash2, Edit2,
  MessageSquare, Phone, Mail, Tag, CheckSquare, Square,
  Send, X, BookOpen, Import, UserPlus,
  Sparkles, AlertCircle, Check, PhoneCall, Download, ShieldCheck,
} from "lucide-react";
import { isValidPhoneNumber } from "libphonenumber-js";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Loader2 as _Loader2 } from "lucide-react";
import { useContactActions } from "@/hooks/useContactActions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PhonebookContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  tags?: string[];
  source?: "manual" | "crm" | "import";
  groupIds?: string[];
  dateOfBirth?: string;  // ISO date e.g. "1990-06-15"
  joinDate?: string;     // ISO date — work/join anniversary
}

interface PhonebookGroup {
  id: string;
  name: string;
  description?: string;
  contactIds: string[];
  color: string;
}

interface BroadcastDraft {
  channel: "whatsapp" | "sms" | "email";
  groupId: string | null;
  contactIds?: string[]; // explicit contact list overrides groupId/selectedIds
  message?: string;
  subject?: string; // for email
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-pink-500 to-rose-500",
  "from-sky-500 to-blue-600",
];


// ─── AddContactModal ──────────────────────────────────────────────────────────

const AddContactModal = ({
  onClose,
  onSave,
  groups,
  initialContact,
}: {
  onClose: () => void;
  onSave: (c: PhonebookContact) => void;
  groups: PhonebookGroup[];
  initialContact?: PhonebookContact | null;
}) => {
  const [name, setName] = useState(initialContact?.name || "");
  const [phone, setPhone] = useState(initialContact?.phone || "");
  const [email, setEmail] = useState(initialContact?.email || "");
  const [tags, setTags] = useState(initialContact?.tags?.join(", ") || "");
  const [selectedGroup, setSelectedGroup] = useState<string>(initialContact?.groupIds?.[0] || "");
  const [dateOfBirth, setDateOfBirth] = useState(initialContact?.dateOfBirth || "");
  const [joinDate, setJoinDate] = useState(initialContact?.joinDate || "");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initialContact?.id || Date.now().toString(),
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      source: initialContact?.source || "manual",
      groupIds: selectedGroup ? [selectedGroup] : (initialContact?.groupIds || []),
      dateOfBirth: dateOfBirth.trim() || undefined,
      joinDate: joinDate.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{initialContact ? "Edit Contact" : "Add Contact"}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <PhoneInput value={phone} onChange={setPhone} defaultCountry="US" placeholder="Enter number" />
          </div>
          <div className="space-y-1.5">
            <Label>Email Address</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Join Date</Label>
              <Input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, lead, customer" />
          </div>
          {groups.length > 0 && (
            <div className="space-y-1.5">
              <Label>Add to Group</Label>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger><SelectValue placeholder="Select group (optional)" /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-6">
          <Button className="flyn-button-gradient flex-1" onClick={handleSave} disabled={!name.trim()}>
            {initialContact ? "Save Changes" : "Add Contact"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── BroadcastModal ───────────────────────────────────────────────────────────

const BroadcastModal = ({
  channel,
  group,
  contacts,
  onClose,
}: {
  channel: "whatsapp" | "sms" | "email";
  group: PhonebookGroup | null;
  contacts: PhonebookContact[];
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);

  const recipients = group
    ? contacts.filter(c => group.contactIds.includes(c.id))
    : contacts;

  const validRecipients = recipients.filter(c =>
    channel === "email" ? !!c.email : !!c.phone,
  );

  const channelLabel = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" }[channel];
  const Icon = { whatsapp: MessageSquare, sms: Phone, email: Mail }[channel];

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/phonebook/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          recipients: validRecipients.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
          })),
          message,
          subject: channel === "email" ? subject : undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; sent?: number; failed?: number; error?: string };
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.failed && data.failed > 0) {
        toast({
          title: `${data.sent} of ${validRecipients.length} sent`,
          description: `${data.failed} failed — some contacts couldn't be reached.`,
          variant: "destructive",
        });
      } else {
        toast({ title: `${channelLabel} sent`, description: `${data.sent ?? validRecipients.length} messages delivered` });
      }
      onClose();
    } catch (err) {
      toast({ variant: "destructive", title: "Could not send", description: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Send {channelLabel} Broadcast</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-muted/40 border border-border/50 text-sm">
          <span className="text-muted-foreground">Sending to: </span>
          <span className="font-medium">{group ? group.name : "All contacts"}</span>
          <span className="text-muted-foreground ml-2">
            ({validRecipients.length} {channel === "email" ? "with email" : "with phone number"})
          </span>
        </div>

        <div className="space-y-3">
          {channel === "email" && (
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your subject line" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Message</Label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={channel === "whatsapp"
                ? "Hi {{name}}, we have an update for you..."
                : channel === "sms"
                  ? "Hi {{name}}, quick message from us..."
                  : "Write your email body here..."}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Use {"{{name}}"} to personalise with recipient's name</p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button
            className="flyn-button-gradient flex-1"
            onClick={handleSend}
            disabled={!message.trim() || sending || validRecipients.length === 0}
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending…" : `Send to ${validRecipients.length} contacts`}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── CreateGroupModal ─────────────────────────────────────────────────────────

const CreateGroupModal = ({
  contacts,
  onClose,
  onSave,
}: {
  contacts: PhonebookContact[];
  onClose: () => void;
  onSave: (g: PhonebookGroup) => void;
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const colorIndex = Math.floor(Math.random() * GROUP_COLORS.length);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: Date.now().toString(),
      name: name.trim(),
      description: description.trim() || undefined,
      contactIds: [...selected],
      color: GROUP_COLORS[colorIndex],
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onWheel={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h2 className="text-lg font-semibold">Create Group</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-3 mb-4 shrink-0">
          <div className="space-y-1.5">
            <Label>Group Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. VIP Clients, Newsletter Subscribers" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
        </div>

        <p className="text-sm font-medium mb-2 shrink-0">Add Contacts ({selected.size} selected)</p>
        <Input
          className="mb-2 shrink-0"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
        />
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => toggle(c.id)}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
            >
              {selected.has(c.id)
                ? <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">{c.phone || c.email || "—"}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4 shrink-0">
          <Button className="flyn-button-gradient flex-1" onClick={handleSave} disabled={!name.trim()}>
            Create Group
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

// Connected channel metadata used to build the per-contact action dropdown
interface ConnectedChannel {
  type: string;  // e.g. 'whatsapp', 'sms', 'twilio', 'vapi', 'telegram', 'email', 'voice' …
  name: string;
}

// Channel display config
const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  whatsapp:  { label: "WhatsApp",  icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-green-500" },
  sms:       { label: "SMS",       icon: <Phone className="h-3.5 w-3.5" />,         color: "text-yellow-500" },
  twilio:    { label: "SMS (Twilio)", icon: <Phone className="h-3.5 w-3.5" />,      color: "text-yellow-500" },
  email:     { label: "Email",     icon: <Mail className="h-3.5 w-3.5" />,          color: "text-violet-500" },
  vapi:      { label: "AI Voice Call", icon: <PhoneCall className="h-3.5 w-3.5" />, color: "text-indigo-500" },
  voice:     { label: "Voice Call", icon: <PhoneCall className="h-3.5 w-3.5" />,    color: "text-indigo-500" },
  telegram:  { label: "Telegram",  icon: <Send className="h-3.5 w-3.5" />,          color: "text-blue-500" },
  facebook:  { label: "Facebook",  icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-blue-600" },
  instagram: { label: "Instagram", icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-pink-500" },
  slack:     { label: "Slack",     icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-purple-500" },
};

// Channel types that require a phone number
const PHONE_CHANNELS = new Set(["whatsapp", "sms", "twilio", "voice", "vapi"]);
// Channel types that make a voice call
const CALL_CHANNELS = new Set(["vapi", "voice"]);
// Channel types that require an email
const EMAIL_CHANNELS = new Set(["email"]);

const Phonebook = () => {
  const { toast } = useToast();
  const { makeVapiCall, sendTwilioSms, callingPhone, sendingSms } = useContactActions();
  const [contacts, setContacts] = useState<PhonebookContact[]>([]);
  const [groups, setGroups] = useState<PhonebookGroup[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const resetPage = () => setPage(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddContact, setShowAddContact] = useState(false);
  const [editContact, setEditContact] = useState<PhonebookContact | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastDraft | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Connected channels — fetched once on mount
  const [connectedChannels, setConnectedChannels] = useState<ConnectedChannel[]>([]);

  // Quick-SMS compose (for direct Twilio SMS to a single contact)
  const [smsCompose, setSmsCompose] = useState<{ contact: PhonebookContact; body: string } | null>(null);

  // CSV field-mapping dialog state
  const [csvMapDialog, setCsvMapDialog] = useState<{
    headers: string[];
    samples: string[][];
    allRows: string[][];
    mapping: Record<string, string>; // colIdx → field
    confidence: number;
    source: string;
  } | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Persistent hidden file input — avoids detached-DOM onchange issues on macOS/Chrome
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const anyOpen = showAddContact || !!editContact || showCreateGroup || showBroadcast || !!csvMapDialog;
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showAddContact, editContact, showCreateGroup, showBroadcast, csvMapDialog]);

  // Load from backend on mount
  useEffect(() => {
    setLoadingContacts(true);
    Promise.allSettled([
      authedFetch(`${API_BASE_URL}/phonebook/contacts`).then(r => r.ok ? r.json() : null),
      authedFetch(`${API_BASE_URL}/phonebook/groups`).then(r => r.ok ? r.json() : null),
      authedFetch(`${API_BASE_URL}/channels/list`).then(r => r.ok ? r.json() : null),
    ]).then(([contactsResult, groupsResult, channelsResult]) => {
      if (contactsResult.status === "fulfilled" && Array.isArray(contactsResult.value)) {
        setContacts(contactsResult.value as PhonebookContact[]);
      }
      if (groupsResult.status === "fulfilled" && Array.isArray(groupsResult.value)) {
        setGroups(groupsResult.value as PhonebookGroup[]);
      }
      if (channelsResult.status === "fulfilled" && channelsResult.value) {
        const raw = channelsResult.value as { channels?: Array<{ channelType?: string; type?: string; name?: string; status?: string }> };
        const active = (raw.channels ?? [])
          .filter(ch => (ch.status ?? "active") === "active")
          .map(ch => ({ type: (ch.channelType ?? ch.type ?? "").toLowerCase(), name: ch.name ?? ch.channelType ?? "" }))
          .filter(ch => ch.type);
        setConnectedChannels(active);
      }
    }).finally(() => setLoadingContacts(false));
  }, []);

  // Import contacts from CRM — fetches CRM contacts, batch-saves them to phonebook backend, then reloads
  const importFromCRM = useCallback(async () => {
    try {
      const res = await authedFetch(`${API_BASE_URL}/crm/contacts?limit=200`);
      if (!res.ok) throw new Error("CRM unavailable");
      const data = await res.json();
      const crmContacts = (data.data ?? data).map((c: {
        _id?: string; id?: string | number; name: string; phone?: string; email?: string; tags?: string[];
      }) => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        tags: c.tags ?? [],
        source: "crm" as const,
        groupIds: [],
      }));

      if (crmContacts.length === 0) {
        toast({ title: "No CRM contacts to import" });
        return;
      }

      // Persist to backend
      const batchRes = await authedFetch(`${API_BASE_URL}/phonebook/contacts/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: crmContacts }),
      });
      const result = batchRes.ok ? await batchRes.json() : { created: 0, skipped: 0 };

      // Re-fetch from backend to get the canonical merged list
      const refreshed = await authedFetch(`${API_BASE_URL}/phonebook/contacts`);
      if (refreshed.ok) {
        const fresh = await refreshed.json();
        if (Array.isArray(fresh)) setContacts(fresh as PhonebookContact[]);
      }

      toast({
        title: `CRM import complete`,
        description: `${result.created ?? 0} added, ${result.skipped ?? 0} duplicates skipped`,
      });
    } catch {
      toast({ variant: "destructive", title: "Could not import from CRM", description: "CRM is unavailable right now" });
    }
  }, [toast]);

  // Auto-detect CSV delimiter from the header row
  const detectDelimiter = (headerLine: string): string => {
    const counts = [',', ';', '\t', '|'].map(d => ({
      d,
      count: (headerLine.split('').filter(c => c === d).length),
    }));
    const best = counts.reduce((a, b) => (b.count > a.count ? b : a));
    return best.count > 0 ? best.d : ',';
  };

  // Shared CSV line parser — auto-detects delimiter, handles quoted fields and BOM
  const parseCSVLine = (line: string, delimiter = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Extract clean email from "Display Name <email@domain>" or plain "email@domain"
  const extractEmail = useCallback((val: string): string | undefined => {
    if (!val) return undefined;
    const angleBracket = val.match(/<([^>]+@[^>]+)>/);
    if (angleBracket) return angleBracket[1].trim().toLowerCase();
    const plain = val.match(/[\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/);
    if (plain) return plain[0].trim().toLowerCase();
    return undefined;
  }, []);

  // Apply confirmed mapping + sanitize + batch import
  const applyMappingAndImport = useCallback(async (
    allRows: string[][],
    mapping: Record<string, string>,
  ) => {
    setCsvImporting(true);
    try {
      let rawContacts = allRows.map((cols) => {
        const get = (field: string) => {
          const idx = Object.entries(mapping).find(([, f]) => f === field)?.[0];
          return idx !== undefined ? cols[parseInt(idx)]?.trim() || undefined : undefined;
        };
        const rawEmail = get('email');
        return {
          name: get('name') || 'Unknown',
          phone: get('phone') || undefined,
          email: rawEmail ? extractEmail(rawEmail) || rawEmail : undefined,
          tags: get('tags') ? [get('tags')!] : undefined,
          source: 'import' as const,
        };
      }).filter(c => c.name && c.name !== 'Unknown');

      if (rawContacts.length === 0) {
        toast({ variant: 'destructive', title: 'No valid contacts found after mapping' });
        return;
      }

      // Local sanitization: title-case names, lowercase emails, strip phone formatting
      rawContacts = rawContacts.map(c => ({
        ...c,
        name: c.name.trim().replace(/\s+/g, ' ').split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
        email: c.email?.trim().toLowerCase() || undefined,
        phone: c.phone?.replace(/[\s\(\)\-]/g, '').trim() || undefined,
      }));

      const now = Date.now();
      const imported: PhonebookContact[] = rawContacts.map((c, i) => ({
        ...c, id: `csv_${now}_${i}`, groupIds: [],
      }));

      // Send to backend — server is the source of truth for dedup and persistence
      try {
        const batchRes = await authedFetch(`${API_BASE_URL}/phonebook/contacts/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: imported }),
        });
        if (batchRes.ok) {
          const result = await batchRes.json();
          const skipped = result.skipped ?? 0;
          toast({
            title: `Imported ${result.created ?? imported.length} contacts`,
            description: skipped > 0 ? `${skipped} duplicate${skipped > 1 ? 's' : ''} skipped` : undefined,
          });
        } else {
          const errData = await batchRes.json().catch(() => ({}));
          toast({ variant: 'destructive', title: 'Import failed', description: errData.message || 'Server rejected the import.' });
        }
      } catch {
        toast({ variant: 'destructive', title: 'Network error', description: 'Could not communicate with the server to save contacts.' });
      }

      // Re-fetch from server to sync UI with what was actually saved (avoids ghost contacts)
      try {
        const fresh = await authedFetch(`${API_BASE_URL}/phonebook/contacts`);
        if (fresh.ok) {
          const freshContacts = await fresh.json();
          if (Array.isArray(freshContacts)) setContacts(freshContacts);
        }
      } catch { /* best-effort sync */ }

      setCsvMapDialog(null);
    } finally {
      setCsvImporting(false);
    }
  }, [toast, extractEmail]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleCsvFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected next time
    if (csvFileInputRef.current) csvFileInputRef.current.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // Strip BOM and normalise line endings
        const text = (event.target?.result as string)
          .replace(/^\uFEFF/, '')
          .replace(/^\u00EF\u00BB\u00BF/, '');
        const lines = text.split(/\r?\n/).filter(l => l.trim());

        if (lines.length <= 1) {
          toast({ variant: 'destructive', title: 'CSV is empty or has only one row' });
          return;
        }

        const delim = detectDelimiter(lines[0]);
        const headers = parseCSVLine(lines[0], delim);
        const dataLines = lines.slice(1);
        const allRows = dataLines.map(l => parseCSVLine(l, delim));
        const samples = allRows.slice(0, 5);

        setIsProcessing(true);
        toast({ title: 'Reading your CSV…', description: 'Auto-detecting column types.' });

        try {
          const resp = await authedFetch(`${API_BASE_URL}/phonebook/ai-map`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headers, samples }),
          });

          // Use heuristic fallback if the request failed
          const result = resp.ok ? await resp.json() : { mapping: {}, confidence: 0.5, source: 'heuristic' };

          setCsvMapDialog({
            headers,
            samples,
            allRows,
            mapping: result.mapping ?? {},
            confidence: result.confidence ?? 0.5,
            source: result.source ?? 'heuristic',
          });
        } catch {
          // AI mapping unavailable — open dialog with empty mapping so user can set it manually
          setCsvMapDialog({ headers, samples, allRows, mapping: {}, confidence: 0, source: 'manual' });
          toast({ title: 'Auto-mapping unavailable', description: 'Please map the columns manually.' });
        } finally {
          setIsProcessing(false);
        }
      } catch (err) {
        toast({ variant: 'destructive', title: 'Failed to read CSV', description: 'The file may be corrupted or not a valid CSV.' });
      }
    };
    reader.readAsText(file);
  }, [toast]); // detectDelimiter + parseCSVLine are stable (no external deps)

  const importFromCSV = useCallback(() => {
    csvFileInputRef.current?.click();
  }, []);

  const exportContactsCSV = () => {
    const headers = ['Name', 'Phone', 'Email', 'Tags'];
    const rows = contacts.map(c => [c.name, c.phone || '', c.email || '', (c.tags || []).join(';')]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `phonebook-${new Date().toISOString().slice(0,10)}.csv` });
    link.click();
  };

  const deleteSelected = async () => {
    const toDelete = [...selectedIds];
    setSelectedIds(new Set());

    let failed = 0;
    const deleted: string[] = [];
    await Promise.all(toDelete.map(async (id) => {
      try {
        const res = await authedFetch(`${API_BASE_URL}/phonebook/contacts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        deleted.push(id);
      } catch {
        failed++;
      }
    }));

    if (deleted.length > 0) {
      const deletedSet = new Set(deleted);
      setContacts(prev => prev.filter(c => !deletedSet.has(c.id)));
      setGroups(prev => prev.map(g => ({ ...g, contactIds: g.contactIds.filter(id => !deletedSet.has(id)) })));
    }

    if (failed > 0) {
      toast({ variant: "destructive", title: `${failed} contact(s) could not be deleted`, description: "They may still appear after reload." });
    } else {
      toast({ title: `Deleted ${deleted.length} contact${deleted.length !== 1 ? 's' : ''}` });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedContacts.length && pagedContacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedContacts.map(c => c.id)));
    }
  };

  const activeGroupObj = activeGroup ? groups.find(g => g.id === activeGroup) : null;
  const visibleContacts = contacts.filter(c => {
    const matchesGroup = !activeGroup || (activeGroupObj?.contactIds?.includes(c.id) ?? false);
    const matchesSearch = !search || [c.name, c.phone ?? "", c.email ?? ""]
      .some(v => v.toLowerCase().includes(search.toLowerCase()));
    return matchesGroup && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(visibleContacts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedContacts = visibleContacts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const broadcastGroup = broadcast ? (groups.find(g => g.id === broadcast.groupId) ?? null) : null;

  const addToCRM = async (contact: PhonebookContact) => {
    try {
      const res = await authedFetch(`${API_BASE_URL}/crm/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          source: 'phonebook',
          tags: contact.tags,
        }),
      });
      if (res.ok) {
        toast({ title: 'Added to CRM', description: `${contact.name} is now in your CRM.` });
      } else if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        toast({
          variant: 'destructive',
          title: 'Already in CRM',
          description: err.message || `"${contact.name}" already exists in CRM — 0 contacts imported, 1 skipped (duplicate).`,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Failed to add to CRM', description: err.message || 'Unknown error' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Network error', description: 'Could not reach CRM.' });
    }
  };

  // Stats
  const withPhone = contacts.filter(c => !!c.phone).length;
  const withEmail = contacts.filter(c => !!c.email).length;
  const invalidPhone = contacts.filter(c => c.phone && !isValidPhoneNumber(c.phone)).length;

  return (
    <AppLayout>
      {/* Hidden file input — must be in the DOM for reliable onChange on all browsers */}
      <input
        ref={csvFileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleCsvFileChange}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between flex-wrap gap-3"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-primary" /> Phonebook
            </h1>
            <p className="text-muted-foreground mt-1">Manage contacts, groups, and send broadcasts across WhatsApp, SMS, and Email</p>
          </div>
          <div className="flex gap-4 flex-wrap items-center">
            <Button variant="outline" onClick={importFromCRM} className="gap-2 flyn-card-hover py-1.5 h-auto text-xs">
              <Import className="h-3.5 w-3.5" /> Import CRM
            </Button>
            <Button
              variant="outline"
              onClick={importFromCSV}
              className="gap-2 flyn-card-hover py-1.5 h-auto text-xs"
            >
              <Upload className="h-3.5 w-3.5" />
              Import CSV
            </Button>
            <Button variant="outline" className="gap-2 flyn-card-hover py-1.5 h-auto text-xs" onClick={exportContactsCSV}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button className="flyn-button-gradient gap-2 py-1.5 h-auto text-xs" onClick={() => setShowAddContact(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Add Contact
            </Button>
          </div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {[
            { label: "Total Contacts", value: contacts.length, icon: Users, color: "text-violet-500" },
            { label: "With Phone", value: withPhone, icon: Phone, color: "text-sky-500" },
            { label: "With Email", value: withEmail, icon: Mail, color: "text-emerald-500" },
            { label: "Groups", value: groups.length, icon: Tag, color: "text-amber-500" },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="flyn-card border-0">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </motion.div>

        {/* Invalid phone warning banner */}
        {invalidPhone > 0 && (
          <div className="flex items-start gap-3 text-sm bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium text-amber-600">{invalidPhone} contact{invalidPhone > 1 ? "s have" : " has"} a phone number that isn't in international E.164 format</p>
              <p className="text-xs text-muted-foreground mt-0.5">SMS and WhatsApp messages may not be delivered to these numbers. Edit each contact and enter the number with the correct country code (e.g. <span className="font-mono font-semibold">+971 50 123 4567</span> for UAE).</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Groups panel */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Groups</p>
              <Button variant="ghost" size="icon" onClick={() => setShowCreateGroup(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* All contacts */}
            <button
              onClick={() => { setActiveGroup(null); resetPage(); }}
              className={`w-full text-left p-3 rounded-xl border transition-all ${!activeGroup
                ? "border-primary/50 bg-primary/10"
                : "border-border/40 hover:bg-muted/50"
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">All Contacts</span>
                </div>
                <Badge variant="secondary" className="text-xs">{contacts.length}</Badge>
              </div>
            </button>

            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => { setActiveGroup(group.id); resetPage(); }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${activeGroup === group.id
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/40 hover:bg-muted/50"
                  }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{group.name}</span>
                  <Badge variant="secondary" className="text-xs">{group.contactIds.length}</Badge>
                </div>
                {group.description && (
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                )}
              </button>
            ))}

            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No groups yet</p>
            )}

            {/* Broadcast buttons for active group */}
            {activeGroup && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Broadcast to group</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-green-500/40 text-green-600 hover:bg-green-500/10"
                  onClick={() => setBroadcast({ channel: "whatsapp", groupId: activeGroup })}
                >
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-sky-500/40 text-sky-600 hover:bg-sky-500/10"
                  onClick={() => setBroadcast({ channel: "sms", groupId: activeGroup })}
                >
                  <Phone className="h-3.5 w-3.5" /> SMS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-violet-500/40 text-violet-600 hover:bg-violet-500/10"
                  onClick={() => setBroadcast({ channel: "email", groupId: activeGroup })}
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </Button>
              </div>
            )}
          </motion.div>

          {/* Right: Contacts table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-3"
          >
            <Card className="flyn-card border-0">
              <CardHeader className="p-4 pb-3 border-b border-border/40">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={e => { setSearch(e.target.value); resetPage(); }}
                      placeholder="Search by name, phone, or email…"
                      className="pl-9"
                    />
                  </div>

                  {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-green-500/40 text-green-600 hover:bg-green-500/10"
                        onClick={() => setBroadcast({ channel: "whatsapp", groupId: null, contactIds: [...selectedIds] })}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-sky-500/40 text-sky-600 hover:bg-sky-500/10"
                        onClick={() => setBroadcast({ channel: "sms", groupId: null, contactIds: [...selectedIds] })}
                      >
                        <Phone className="h-3.5 w-3.5" /> SMS
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-violet-500/40 text-violet-600 hover:bg-violet-500/10"
                        onClick={() => setBroadcast({ channel: "email", groupId: null, contactIds: [...selectedIds] })}
                      >
                        <Mail className="h-3.5 w-3.5" /> Email
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={deleteSelected}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {/* Table head */}
                <div className="grid grid-cols-[24px_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider border-b border-border/30">
                  <button onClick={toggleSelectAll} className="flex items-center">
                    {selectedIds.size === pagedContacts.length && pagedContacts.length > 0
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4" />}
                  </button>
                  <span>Name</span>
                  <span>Phone</span>
                  <span>Email</span>
                  <span>Actions</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border/20">
                  <AnimatePresence>
                    {loadingContacts ? (
                      <div className="py-12 text-center text-muted-foreground text-sm">
                        Loading contacts…
                      </div>
                    ) : visibleContacts.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground text-sm">
                        {contacts.length === 0 ? "No contacts yet. Add one or import from CSV." : "No contacts found"}
                      </div>
                    ) : (
                      pagedContacts.map((contact, i) => (
                        <motion.div
                          key={contact.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={`grid grid-cols-[24px_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 hover:bg-muted/30 transition-colors ${selectedIds.has(contact.id) ? "bg-primary/5" : ""}`}
                        >
                          <button onClick={() => toggleSelect(contact.id)}>
                            {selectedIds.has(contact.id)
                              ? <CheckSquare className="h-4 w-4 text-primary" />
                              : <Square className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <div>
                            <p className="text-sm font-medium">{contact.name}</p>
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                              {contact.tags?.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-[10px] py-0">{tag}</Badge>
                              ))}
                              {contact.source && contact.source !== "manual" && (
                                <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">{contact.source}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {contact.phone ? (() => {
                              const valid = isValidPhoneNumber(contact.phone);
                              return (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 shrink-0" />
                                  <span className={valid ? "" : "text-amber-500"}>{contact.phone}</span>
                                  {valid
                                    ? <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" title="Valid E.164" />
                                    : <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" title="Not E.164 — edit to fix for SMS/WhatsApp delivery" />}
                                </span>
                              );
                            })() : <span className="text-muted-foreground/40">—</span>}
                          </div>
                          <div className="text-sm text-muted-foreground truncate max-w-[180px]">
                            {contact.email
                              ? <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{contact.email}</span>
                              : <span className="text-muted-foreground/40">—</span>}
                          </div>
                          <div className="flex gap-1">
                            {/* Dynamic channel dropdown — shows only channels the tenant has connected */}
                            {(() => {
                              // Build the menu items from connected channels, filtered by contact data
                              const items = connectedChannels.length > 0
                                ? connectedChannels.filter(ch => {
                                    if (EMAIL_CHANNELS.has(ch.type)) return !!contact.email;
                                    if (PHONE_CHANNELS.has(ch.type)) return !!contact.phone;
                                    return false; // skip channels we can't reach this contact on
                                  })
                                // Fallback: if no channels fetched yet, show defaults
                                : [
                                    ...(contact.phone ? [{ type: "whatsapp", name: "WhatsApp" }, { type: "sms", name: "SMS" }] : []),
                                    ...(contact.email ? [{ type: "email", name: "Email" }] : []),
                                  ];

                              if (items.length === 0) return null;
                              return (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-primary hover:text-primary/80"
                                      title="Contact via channel"
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52">
                                    {items.map((ch) => {
                                      const meta = CHANNEL_META[ch.type];
                                      const label = meta?.label ?? ch.name ?? ch.type;
                                      const icon = meta?.icon ?? <Send className="h-3.5 w-3.5" />;
                                      const color = meta?.color ?? "text-muted-foreground";

                                      const handleAction = () => {
                                        if (CALL_CHANNELS.has(ch.type)) {
                                          // Voice call via Vapi
                                          if (contact.phone) void makeVapiCall(contact.phone);
                                        } else if ((ch.type === "sms" || ch.type === "twilio") && contact.phone) {
                                          // Direct Twilio SMS — open compose
                                          setSmsCompose({ contact, body: "" });
                                        } else if (ch.type === "email" && contact.email) {
                                          setBroadcast({ channel: "email", groupId: null, contactIds: [contact.id] });
                                        } else if (ch.type === "whatsapp" && contact.phone) {
                                          setBroadcast({ channel: "whatsapp", groupId: null, contactIds: [contact.id] });
                                        } else {
                                          toast({ title: `${label} not available`, description: "This contact is missing the required contact info for this channel." });
                                        }
                                      };

                                      return (
                                        <DropdownMenuItem key={ch.type} onClick={handleAction}>
                                          <span className={`mr-2 ${color}`}>{icon}</span>
                                          {label}
                                        </DropdownMenuItem>
                                      );
                                    })}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              );
                            })()}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-violet-500 hover:text-violet-400"
                              title="Add to CRM"
                              onClick={() => addToCRM(contact)}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-600 hover:text-blue-700"
                              title="Edit"
                              onClick={() => setEditContact(contact)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive/80"
                              title="Delete"
                              onClick={async () => {
                                try {
                                  const res = await authedFetch(`${API_BASE_URL}/phonebook/contacts/${contact.id}`, { method: "DELETE" });
                                  if (!res.ok) throw new Error(await res.text());
                                  setContacts(prev => prev.filter(c => c.id !== contact.id));
                                  setGroups(prev => prev.map(g => ({ ...g, contactIds: g.contactIds.filter(id => id !== contact.id) })));
                                  toast({ title: `${contact.name} removed` });
                                } catch {
                                  toast({ variant: "destructive", title: "Delete failed", description: `Could not delete ${contact.name}. Please try again.` });
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border/30 space-y-3">
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, visibleContacts.length)} of {visibleContacts.length} contacts
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPage(1)}
                          disabled={safePage === 1}
                        >«</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                        >‹</Button>
                        <span className="text-xs px-2 text-muted-foreground font-medium">
                          Page {safePage} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage === totalPages}
                        >›</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setPage(totalPages)}
                          disabled={safePage === totalPages}
                        >»</Button>
                      </div>
                    </div>
                  )}
                  {totalPages <= 1 && (
                    <p className="text-xs text-muted-foreground">{visibleContacts.length} contact{visibleContacts.length !== 1 ? "s" : ""}</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setBroadcast({ channel: "whatsapp", groupId: null })}>
                      <MessageSquare className="h-3.5 w-3.5 text-green-500" /> Broadcast WhatsApp
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setBroadcast({ channel: "sms", groupId: null })}>
                      <Phone className="h-3.5 w-3.5 text-sky-500" /> Broadcast SMS
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setBroadcast({ channel: "email", groupId: null })}>
                      <Mail className="h-3.5 w-3.5 text-violet-500" /> Broadcast Email
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Modals */}
      {showAddContact && (
        <AddContactModal
          groups={groups}
          onClose={() => setShowAddContact(false)}
          onSave={async c => {
            try {
              const res = await authedFetch(`${API_BASE_URL}/phonebook/contacts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(c),
              });
              const saved = res.ok ? await res.json() : null;
              setContacts(prev => [saved ? { ...c, id: saved.id } : c, ...prev]);
            } catch {
              setContacts(prev => [c, ...prev]);
            }
            toast({ title: "Contact Added", description: c.name });
          }}
        />
      )}
      {editContact && (
        <AddContactModal
          groups={groups}
          initialContact={editContact}
          onClose={() => setEditContact(null)}
          onSave={async c => {
            try {
              await authedFetch(`${API_BASE_URL}/phonebook/contacts/${c.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(c),
              });
            } catch { /* optimistic update — UI is already correct */ }
            setContacts(prev => prev.map(p => p.id === c.id ? c : p));
            toast({ title: "Contact Updated", description: c.name });
          }}
        />
      )}
      {showCreateGroup && (
        <CreateGroupModal
          contacts={contacts}
          onClose={() => setShowCreateGroup(false)}
          onSave={async g => {
            try {
              const res = await authedFetch(`${API_BASE_URL}/phonebook/groups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(g),
              });
              const saved = res.ok ? await res.json() : null;
              setGroups(prev => [...prev, saved ?? g]);
            } catch {
              setGroups(prev => [...prev, g]);
            }
          }}
        />
      )}
      {broadcast && (
        <BroadcastModal
          channel={broadcast.channel}
          group={broadcastGroup}
          contacts={
            broadcast.contactIds
              ? contacts.filter(c => broadcast.contactIds!.includes(c.id))
              : broadcast.groupId
                ? contacts.filter(c => broadcastGroup?.contactIds.includes(c.id))
                : contacts
          }
          onClose={() => setBroadcast(null)}
        />
      )}

      {/* ── AI Field Mapping Dialog ── */}
      <Dialog open={!!csvMapDialog} onOpenChange={(open) => { if (!open && !csvImporting) setCsvMapDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              AI Column Mapping
            </DialogTitle>
          </DialogHeader>

          {csvMapDialog && (
            <div className="space-y-4 py-2">
              {/* Confidence banner */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                csvMapDialog.confidence >= 0.8
                  ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                  : csvMapDialog.confidence >= 0.6
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
              }`}>
                {csvMapDialog.source === 'ai' ? <Sparkles className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {csvMapDialog.source === 'ai'
                  ? `AI mapped your columns with ${Math.round(csvMapDialog.confidence * 100)}% confidence. Review and adjust if needed.`
                  : `Mapped using smart heuristics (AI unavailable). Please review carefully.`}
              </div>

              {/* Column mapping table */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Column → Field Mapping</p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">CSV Column</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Sample Values</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Maps To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvMapDialog.headers.map((header, colIdx) => {
                        const sampleVals = csvMapDialog.samples.map(r => r[colIdx] || '').filter(Boolean).slice(0, 3);
                        const currentField = csvMapDialog.mapping[String(colIdx)] || 'skip';
                        return (
                          <tr key={colIdx} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium text-foreground">{header || `Column ${colIdx + 1}`}</td>
                            <td className="px-3 py-2 text-muted-foreground text-xs max-w-[200px]">
                              {sampleVals.map((v, i) => (
                                <span key={i} className="inline-block bg-muted/40 rounded px-1 mr-1 truncate max-w-[60px]" title={v}>{v}</span>
                              ))}
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={currentField}
                                onValueChange={(val) => setCsvMapDialog(prev => prev ? {
                                  ...prev,
                                  mapping: { ...prev.mapping, [String(colIdx)]: val },
                                } : null)}
                              >
                                <SelectTrigger className="h-7 text-xs w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="name">👤 Name</SelectItem>
                                  <SelectItem value="phone">📞 Phone</SelectItem>
                                  <SelectItem value="email">✉️ Email</SelectItem>
                                  <SelectItem value="tags">🏷️ Tags</SelectItem>
                                  <SelectItem value="skip">⛔ Skip</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preview of first few rows */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Preview ({csvMapDialog.allRows.length} total rows)
                </p>
                <div className="rounded-lg border overflow-auto max-h-32 text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/30 border-b sticky top-0">
                      <tr>
                        {['name', 'phone', 'email'].map(f => (
                          <th key={f} className="text-left px-2 py-1.5 font-semibold text-muted-foreground capitalize">{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvMapDialog.allRows.slice(0, 5).map((row, ri) => {
                        const get = (field: string) => {
                          const idx = Object.entries(csvMapDialog.mapping).find(([, f]) => f === field)?.[0];
                          return idx !== undefined ? row[parseInt(idx)] || '—' : '—';
                        };
                        return (
                          <tr key={ri} className="border-b last:border-b-0">
                            <td className="px-2 py-1">{get('name')}</td>
                            <td className="px-2 py-1 text-muted-foreground">{get('phone')}</td>
                            <td className="px-2 py-1 text-muted-foreground">{get('email')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Validation */}
              {!Object.values(csvMapDialog.mapping).includes('name') && (
                <div className="flex items-center gap-2 text-xs text-rose-400 px-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  No column mapped to "Name" — please assign at least one column as Name.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvMapDialog(null)} disabled={csvImporting}>Cancel</Button>
            <Button
              disabled={!csvMapDialog || !Object.values(csvMapDialog.mapping).includes('name') || csvImporting}
              onClick={() => csvMapDialog && applyMappingAndImport(csvMapDialog.allRows, csvMapDialog.mapping)}
              className="gap-2"
            >
              {csvImporting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                : <><Check className="w-3.5 h-3.5" /> Confirm & Import ({csvMapDialog?.allRows.length ?? 0} rows)</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick SMS Compose Dialog (direct Twilio SMS to single contact) */}
      {smsCompose && (
        <Dialog open onOpenChange={() => setSmsCompose(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-yellow-500" />
                Send SMS to {smsCompose.contact.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground font-mono">{smsCompose.contact.phone}</p>
              <textarea
                value={smsCompose.body}
                onChange={e => setSmsCompose(prev => prev ? { ...prev, body: e.target.value } : null)}
                placeholder="Type your message…"
                rows={4}
                className="w-full text-sm px-3 py-2 border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSmsCompose(null)}>Cancel</Button>
              <Button
                disabled={!smsCompose.body.trim() || !!sendingSms}
                onClick={async () => {
                  const result = await sendTwilioSms(smsCompose.contact.phone!, smsCompose.body);
                  if (result.success) setSmsCompose(null);
                }}
                className="gap-2"
              >
                {sendingSms
                  ? <><_Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                  : <><Send className="w-3.5 h-3.5" /> Send SMS</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
};

import { withPlanGate } from "@/components/PlanGate";
export default withPlanGate("modules.phonebook")(Phonebook);
