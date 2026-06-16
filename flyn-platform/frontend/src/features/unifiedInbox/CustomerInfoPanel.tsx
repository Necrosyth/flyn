import { useState } from "react";
import {
  Phone, Mail, MapPin, PhoneCall, MessageSquare,
  Loader2, Send, X, ExternalLink, Plus, AlertTriangle,
  Clock, Star, Tag
} from "lucide-react";
import type { Contact, Conversation } from "@/types/inbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useContactActions } from "@/hooks/useContactActions";
import { useNavigate } from "react-router-dom";
import { updateContact } from "@/services/crm";
import { useToast } from "@/hooks/use-toast";

interface CustomerInfoPanelProps {
  contact: Contact;
  conversation?: Conversation;
  onSendMessage?: (text: string) => void;
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-green-500", "bg-amber-500",
  "bg-red-500", "bg-pink-500", "bg-cyan-500", "bg-orange-500",
];

function getAvatarColor(name: string): string {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

const LABEL_STYLES: Record<string, string> = {
  urgent:      "bg-red-500/15 text-red-500 border-red-500/20",
  vip:         "bg-amber-500/15 text-amber-500 border-amber-500/20",
  support:     "bg-blue-500/15 text-blue-400 border-blue-500/20",
  billing:     "bg-purple-500/15 text-purple-400 border-purple-500/20",
  lead:        "bg-green-500/15 text-green-500 border-green-500/20",
  appointment: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  customer:    "bg-violet-500/15 text-violet-400 border-violet-500/20",
  qualified:   "bg-teal-500/15 text-teal-400 border-teal-500/20",
};

function getLabelStyle(label: string): string {
  return LABEL_STYLES[label.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "text-red-500",
  high:   "text-orange-500",
  medium: "text-amber-500",
  low:    "text-green-500",
};

// Map CRM contact status to customer type dropdown value
const CRM_STATUS_TO_TYPE: Record<string, string> = {
  lead: "Lead",
  qualified: "Lead",
  customer: "Client",
  churned: "Client",
  inactive: "Client",
};

function getSlaInfo(conv: Conversation) {
  if (conv.status !== "open" || !conv.priority) return null;
  const SLA: Record<string, number> = { urgent: 15, high: 60, medium: 240, low: 1440 };
  const total = SLA[conv.priority] ?? 240;
  const elapsed = Math.floor((Date.now() - conv.createdAt.getTime()) / 60000);
  const left = total - elapsed;
  return { total, elapsed, left, breached: left <= 0, pct: Math.min(100, (elapsed / total) * 100) };
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-border/60">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

const QUICK_REPLY_TEMPLATES = [
  { icon: <Send className="w-3 h-3 text-muted-foreground flex-shrink-0" />, text: "Send available slots", message: "Here are our available slots: Thursday 3:30 PM, Thursday 5:00 PM, Friday 4:00 PM. Which works for you?" },
  { icon: <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />, text: "Confirm booking", message: "Your booking has been confirmed! We'll see you at the scheduled time. Please let us know if you need to make any changes." },
];

export function CustomerInfoPanel({ contact, conversation, onSendMessage }: CustomerInfoPanelProps) {
  const { makeVapiCall, sendTwilioSms, callingPhone, sendingSms } = useContactActions();
  const [showSmsCompose, setShowSmsCompose] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [localLabels, setLocalLabels] = useState<string[] | null>(null);
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [savingType, setSavingType] = useState(false);
  const { toast } = useToast();

  const phone = contact.phone?.trim() || "";
  const initials = contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarColor = getAvatarColor(contact.name);

  const navigate = useNavigate();
  const attrs = contact.customAttributes ?? {};
  const location = attrs.location || attrs.city || "";
  const csat = attrs.csat ? parseFloat(attrs.csat) : null;
  const ltv = attrs.ltv || "";
  const role = attrs.role || attrs.type || (contact.tags?.includes("VIP") ? "VIP Customer" : "");
  const subtitle = [role, location].filter(Boolean).join(" · ");

  const baseLabels = conversation?.labels ?? contact.tags ?? [];
  const labels = localLabels ?? baseLabels;
  const sla = conversation ? getSlaInfo(conversation) : null;

  // Derive initial customer type from CRM contact status or tags
  const crmStatus = (contact as any).crmStatus as string | undefined;
  const derivedType = customerType ?? (crmStatus ? CRM_STATUS_TO_TYPE[crmStatus] ?? "Client" : contact.tags?.includes("VIP") ? "VIP" : "Client");

  const handleSmsSend = async () => {
    const result = await sendTwilioSms(phone, smsBody);
    if (result.success) { setSmsBody(""); setShowSmsCompose(false); }
  };

  const handleAddLabel = async () => {
    const label = newLabel.trim().toLowerCase();
    if (!label || labels.includes(label)) { setShowAddLabel(false); setNewLabel(""); return; }
    const updated = [...labels, label];
    setLocalLabels(updated);
    setShowAddLabel(false);
    setNewLabel("");
    if (contact.id) {
      try {
        await updateContact(contact.id, { tags: updated } as any);
      } catch {
        // Non-fatal — label shown locally even if save fails
      }
    }
  };

  const handleRemoveLabel = async (label: string) => {
    const updated = labels.filter((l) => l !== label);
    setLocalLabels(updated);
    if (contact.id) {
      try {
        await updateContact(contact.id, { tags: updated } as any);
      } catch {
        // Non-fatal
      }
    }
  };

  const handleCustomerTypeChange = async (type: string) => {
    setCustomerType(type);
    setSavingType(true);
    const statusMap: Record<string, string> = { Client: "customer", Lead: "lead", Partner: "customer", VIP: "customer" };
    const newStatus = statusMap[type] ?? "customer";
    if (contact.id) {
      try {
        await updateContact(contact.id, { status: newStatus } as any);
        toast({ title: "Customer type updated" });
      } catch {
        toast({ variant: "destructive", title: "Failed to save customer type" });
      }
    }
    setSavingType(false);
  };

  const handleQuickReply = (message: string) => {
    if (onSendMessage) {
      onSendMessage(message);
      toast({ title: "Quick reply sent" });
    } else {
      navigator.clipboard.writeText(message).catch(() => {});
      toast({ title: "Copied to clipboard", description: "Paste it in the message box" });
    }
  };

  return (
    <div className="h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contact</span>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate(`/dashboard/crm`)}
          title="Open in CRM"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Profile ── */}
        <div className="px-4 py-4 border-b border-border/60">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-12 h-12 flex-shrink-0">
              <AvatarImage src={contact.avatar} alt={contact.name} />
              <AvatarFallback className={cn("text-sm font-bold text-white", avatarColor)}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground leading-tight">{contact.name}</p>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{subtitle}</p>}
            </div>
          </div>

          {/* Contact details */}
          <div className="space-y-1.5">
            {phone && (
              <button
                className="flex items-center gap-2 text-xs text-foreground/80 hover:text-primary transition-colors w-full text-left"
                onClick={() => { navigator.clipboard.writeText(phone).catch(() => {}); toast({ title: "Phone copied" }); }}
                title="Copy phone number"
              >
                <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-mono">{phone}</span>
              </button>
            )}
            {contact.email && (
              <button
                className="flex items-center gap-2 text-xs text-foreground/80 hover:text-primary transition-colors w-full text-left"
                onClick={() => { navigator.clipboard.writeText(contact.email!).catch(() => {}); toast({ title: "Email copied" }); }}
                title="Copy email"
              >
                <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </button>
            )}
            {location && (
              <div className="flex items-center gap-2 text-xs text-foreground/80">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span>{location}</span>
              </div>
            )}
          </div>

          {/* CSAT + LTV */}
          {(csat !== null || ltv) && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-border/50">
              {csat !== null && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">CSAT</p>
                  <p className="text-sm font-bold text-green-500 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    {csat.toFixed(1)} / 5.0
                  </p>
                </div>
              )}
              {ltv && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">LTV</p>
                  <p className="text-sm font-bold text-amber-500">{ltv}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Labels ── */}
        <Section
          title="Labels"
          action={
            <button
              className="flex items-center gap-1 text-[10px] text-primary font-medium hover:underline"
              onClick={() => setShowAddLabel(!showAddLabel)}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          }
        >
          {showAddLabel && (
            <div className="flex gap-1.5 mb-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAddLabel(); if (e.key === "Escape") { setShowAddLabel(false); setNewLabel(""); } }}
                placeholder="Type label…"
                autoFocus
                className="flex-1 text-xs px-2 py-1 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={() => void handleAddLabel()}
                className="text-[10px] font-semibold text-white px-2 py-1 rounded-md"
                style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
              >
                Add
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {labels.length === 0 && !showAddLabel && (
              <span className="text-[11px] text-muted-foreground">No labels yet</span>
            )}
            {labels.map((label) => (
              <span
                key={label}
                className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border capitalize group", getLabelStyle(label))}
              >
                {label}
                <button
                  onClick={() => void handleRemoveLabel(label)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                  title="Remove label"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        </Section>

        {/* ── Assigned To ── */}
        {conversation?.assignee && (
          <Section title="Assigned To">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={conversation.assignee.avatar} />
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {conversation.assignee.name.split(" ").map((n) => n[0]).join("").slice(0,2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium text-foreground">{conversation.assignee.name}</span>
                </div>
                <button
                  className="text-[10px] text-primary hover:underline font-medium"
                  onClick={() => toast({ title: "Reassign", description: "Go to Settings → Team to manage agent assignments." })}
                >
                  Reassign
                </button>
              </div>
              {conversation.priority && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <span className={cn("text-xs font-bold capitalize", PRIORITY_STYLES[conversation.priority] ?? "text-foreground")}>
                    {conversation.priority}
                  </span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ── SLA Status ── */}
        {sla && (
          <Section title="SLA Status">
            <div className="space-y-2">
              <div className={cn("flex items-center gap-2", sla.breached ? "text-red-500" : sla.left <= 10 ? "text-amber-500" : "text-foreground")}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs font-semibold">
                  {sla.breached ? "SLA breached" : `Breach in ${sla.left} minute${sla.left !== 1 ? "s" : ""}`}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                First response SLA: {sla.total} min · Elapsed: {sla.elapsed} min
              </p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", sla.breached || sla.pct > 80 ? "bg-red-500" : "bg-amber-500")}
                  style={{ width: `${sla.pct}%` }}
                />
              </div>
            </div>
          </Section>
        )}

        {/* ── Conversation History ── */}
        {conversation && (
          <Section title="Conversation History">
            <div className="space-y-2.5">
              <div className="flex items-start gap-2">
                <span className={cn("w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0",
                  conversation.status === "resolved" ? "bg-green-500" :
                  conversation.status === "open" ? "bg-blue-500" : "bg-amber-500"
                )} />
                <div className="min-w-0">
                  <p className="text-xs text-foreground leading-snug truncate">
                    {conversation.lastMessage?.content || "No messages"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {conversation.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · <span className="capitalize">{conversation.channel}</span> · <span className="capitalize">{conversation.status}</span>
                  </p>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ── Quick Replies ── */}
        <Section title="Quick Replies">
          <div className="space-y-1.5">
            {QUICK_REPLY_TEMPLATES.map((qr) => (
              <button
                key={qr.text}
                onClick={() => handleQuickReply(qr.message)}
                className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors text-xs text-foreground"
              >
                {qr.icon}
                {qr.text}
              </button>
            ))}
            {phone && (
              <button
                onClick={() => void makeVapiCall(phone)}
                disabled={!!callingPhone}
                className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors text-xs text-foreground disabled:opacity-50"
              >
                {callingPhone ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" /> : <PhoneCall className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                {callingPhone ? "Connecting…" : "AI Voice Call"}
              </button>
            )}
          </div>
        </Section>

        {/* ── Customer Type ── */}
        <div className="px-4 py-3 border-b border-border/60">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <Tag className="w-3 h-3" />
            Customer Type
            {savingType && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          </p>
          <select
            value={derivedType}
            onChange={(e) => void handleCustomerTypeChange(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:outline-none"
          >
            <option value="Client">Client</option>
            <option value="Lead">Lead</option>
            <option value="Partner">Partner</option>
            <option value="VIP">VIP</option>
          </select>
        </div>

        {/* ── SMS Compose ── */}
        {showSmsCompose && phone && (
          <div className="px-4 py-3 border-b border-border/60 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SMS to {phone}</p>
              <button onClick={() => setShowSmsCompose(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              placeholder="Type your message…"
              rows={3}
              className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              className="w-full py-1.5 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
              onClick={handleSmsSend}
              disabled={!smsBody.trim() || !!sendingSms}
            >
              {sendingSms ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sendingSms ? "Sending…" : "Send SMS"}
            </button>
          </div>
        )}
      </div>

      {/* ── Footer Actions ── */}
      {phone && !showSmsCompose && (
        <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
          <button
            onClick={() => void makeVapiCall(phone)}
            disabled={!!callingPhone}
            className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
          >
            {callingPhone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
            {callingPhone ? "Connecting…" : "AI Voice Call"}
          </button>
          <button
            className="w-full py-2 rounded-lg text-xs font-semibold border border-border text-foreground flex items-center justify-center gap-1.5 hover:bg-muted transition-colors"
            onClick={() => setShowSmsCompose(true)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Send SMS
          </button>
        </div>
      )}
    </div>
  );
}
