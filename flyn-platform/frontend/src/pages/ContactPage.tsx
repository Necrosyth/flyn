import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Mail, Phone, MapPin, MessageSquare, Send, Globe, Clock, Users,
  CheckCircle2, AlertCircle, ArrowRight, Building2, Zap, Star,
  ChevronRight, Twitter, Linkedin, Instagram, Facebook, Youtube,
  Headphones, TrendingUp, Heart, Languages, Bell,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { useLandingContent } from "@/contexts/LandingContentContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getLocations, getCountries, getAgents,
  submitContactForm, startChat, sendMessage, subscribeNotifications,
  type ContactLocation, type LiveAgent, type ChatMessage,
} from "@/services/contactApi";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FlagIcon = ({ code }: { code: string }) => {
  const iso = (code === 'UK' ? 'GB' : code).toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      alt={code}
      className="w-8 h-auto rounded-sm shadow-sm object-cover"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
};

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-indigo-500', 'bg-sky-500', 'bg-emerald-500',
  'bg-rose-500', 'bg-amber-500', 'bg-pink-500', 'bg-teal-500',
];

const avatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const initials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const statusDot: Record<string, string> = {
  online: 'bg-emerald-400',
  away: 'bg-amber-400',
  busy: 'bg-red-400',
  offline: 'bg-zinc-500',
};

const DEPARTMENTS = [
  { id: 'general', label: 'General Inquiry', icon: MessageSquare },
  { id: 'support', label: 'Technical Support', icon: Headphones },
  { id: 'sales', label: 'Sales & Pricing', icon: TrendingUp },
  { id: 'careers', label: 'Careers', icon: Heart },
  { id: 'brand', label: 'Brand & Partnerships', icon: Zap },
];

const PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
];

const FAQS = [
  { q: "What's your typical response time?", a: "We respond within 24 hours during business hours. Urgent requests are prioritised and handled within 2 hours." },
  { q: "Do you offer 24/7 support?", a: "Our global offices cover most time zones. Check the Locations tab to find office hours nearest to you." },
  { q: "What languages does your team support?", a: "Our team collectively speaks English, Spanish, French, German, Portuguese, Mandarin, Malay, and Japanese." },
  { q: "Can I schedule a demo?", a: "Absolutely — select the Sales department in the form and mention you'd like a demo. Our team will reach out to book time." },
  { q: "How do I escalate an urgent issue?", a: "Set priority to Urgent in the contact form. This immediately notifies our on-call team, typically within 30 minutes." },
];

const STATS = [
  { label: "Avg Response", value: "< 2 hrs", icon: Clock },
  { label: "Global Offices", value: "10", icon: Building2 },
  { label: "Languages", value: "9+", icon: Languages },
  { label: "Customer CSAT", value: "95%", icon: Star },
];

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.07 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const LocationCard = ({ loc }: { loc: ContactLocation }) => (
  <motion.div
    variants={stagger.item}
    className="rounded-2xl border border-border bg-card/80 p-6 flex flex-col gap-4 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <FlagIcon code={loc.country_code} />
        <div>
          <h3 className="font-semibold text-foreground">{loc.city}</h3>
          <p className="text-sm text-muted-foreground">{loc.country}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        {loc.agent_available && (
          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[11px] px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1.5 animate-pulse" />
            Live
          </Badge>
        )}
        <Badge variant="outline" className="text-[11px] px-2 py-0.5 capitalize">
          {loc.department}
        </Badge>
      </div>
    </div>

    <div className="space-y-2.5 text-sm">
      <div className="flex items-start gap-2.5 text-muted-foreground">
        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary/60" />
        <span className="leading-snug">{loc.address}</span>
      </div>
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <Phone className="h-4 w-4 shrink-0 text-primary/60" />
        <a href={`tel:${loc.phone}`} className="hover:text-primary transition-colors">{loc.phone}</a>
      </div>
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <Mail className="h-4 w-4 shrink-0 text-primary/60" />
        <a href={`mailto:${loc.email}`} className="hover:text-primary transition-colors">{loc.email}</a>
      </div>
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0 text-primary/60" />
        <span>{loc.hours.monday_friday}</span>
      </div>
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <Globe className="h-4 w-4 shrink-0 text-primary/60" />
        <span>{loc.timezone.replace(/_/g, ' ')}</span>
      </div>
    </div>

    <div className="flex flex-wrap gap-1.5">
      {loc.languages.map(lang => (
        <span key={lang} className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {lang}
        </span>
      ))}
    </div>

    <div className="flex items-center justify-between pt-2 border-t border-border/50">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Users className="h-3.5 w-3.5" />
        {loc.agent_count} agent{loc.agent_count !== 1 ? 's' : ''}
      </span>
      {loc.coordinates && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${loc.coordinates.lat},${loc.coordinates.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary flex items-center gap-1 hover:underline"
        >
          Get directions <ChevronRight className="h-3 w-3" />
        </a>
      )}
    </div>
  </motion.div>
);

const AgentCard = ({ agent }: { agent: LiveAgent }) => (
  <motion.div
    variants={stagger.item}
    className="rounded-2xl border border-border bg-card/80 p-5 flex items-start gap-4 hover:border-primary/40 transition-all duration-300"
  >
    <div className="relative shrink-0">
      <div className={`w-12 h-12 rounded-xl ${avatarColor(agent.name)} flex items-center justify-center text-white font-bold text-sm`}>
        {initials(agent.name)}
      </div>
      <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${statusDot[agent.status]}`} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-foreground text-sm">{agent.name}</h4>
        <div className="flex items-center gap-0.5 text-amber-400 shrink-0">
          <Star className="h-3 w-3 fill-current" />
          <span className="text-xs font-medium text-foreground">{agent.customer_rating.toFixed(1)}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground capitalize mt-0.5">{agent.department} · {agent.location}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {agent.languages.map(lang => (
          <span key={lang} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{lang}</span>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] text-muted-foreground">
          ~{agent.average_response_time}s avg · {agent.max_chats - agent.current_chats} slots free
        </span>
        {agent.is_available ? (
          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-500 border-emerald-500/30 px-2 py-0">Available</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground px-2 py-0">Away</Badge>
        )}
      </div>
    </div>
  </motion.div>
);

// ─── Chat message bubble ─────────────────────────────────────────────────────

const ChatBubble = ({ msg }: { msg: ChatMessage }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className={`flex flex-col ${msg.sender_type === 'visitor' ? 'items-end' : 'items-start'}`}
  >
    <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
      msg.sender_type === 'visitor'
        ? 'bg-primary text-primary-foreground rounded-br-sm'
        : 'bg-muted text-foreground rounded-bl-sm'
    }`}>
      {msg.message}
    </div>
  </motion.div>
);

// ─── Main Page ───────────────────────────────────────────────────────────────

type ChatPhase = 'setup' | 'connecting' | 'active' | 'error' | 'no-agents';

const ContactPage = () => {
  const { content } = useLandingContent();
  const { contact, social } = content;
  const { toast } = useToast();

  // ── Tab + filter state ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("message");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [selectedDept, setSelectedDept] = useState("all");
  const [activeChatDept, setActiveChatDept] = useState("support");

  // ── Contact form state ─────────────────────────────────────────────────────
  const [submitted, setSubmitted] = useState<{ ticketId: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msgLength, setMsgLength] = useState(0);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", country: "US",
    subject: "", message: "", department: "general", priority: "medium",
  });

  // ── Live chat state ────────────────────────────────────────────────────────
  const [chatPhase, setChatPhase] = useState<ChatPhase>('setup');
  const [chatSession, setChatSession] = useState<{ chatId: string; agent: LiveAgent } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Subscribe state ────────────────────────────────────────────────────────
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribeState, setSubscribeState] = useState<'idle' | 'loading' | 'done'>('idle');

  // Reset chat when department changes
  useEffect(() => {
    setChatPhase('setup');
    setChatSession(null);
    setChatMessages([]);
    setChatInput('');
  }, [activeChatDept]);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const locationsQuery = useQuery({
    queryKey: ["contact-locations", selectedCountry, selectedDept],
    queryFn: () =>
      getLocations(
        selectedCountry !== "all" ? selectedCountry : undefined,
        selectedDept !== "all" ? selectedDept : undefined,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const countriesQuery = useQuery({
    queryKey: ["contact-countries"],
    queryFn: getCountries,
    staleTime: 10 * 60 * 1000,
  });

  const agentsQuery = useQuery({
    queryKey: ["contact-agents", activeChatDept],
    queryFn: () => getAgents(activeChatDept),
    staleTime: 60 * 1000,
  });

  const locations = locationsQuery.data ?? [];
  const countries = countriesQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const onlineAgents = agents.filter(a => a.is_available);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast({ variant: "destructive", title: "Missing fields", description: "Please fill in all required fields." });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await submitContactForm({ ...form, phone: form.phone || undefined });
      setSubmitted({ ticketId: result.ticketId });
      setForm({ name: "", email: "", phone: "", country: "US", subject: "", message: "", department: "general", priority: "medium" });
      setMsgLength(0);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartChat = async () => {
    if (!visitorName.trim() || !visitorEmail.trim()) return;
    setChatPhase('connecting');
    try {
      const result = await startChat({
        visitor_name: visitorName.trim(),
        visitor_email: visitorEmail.trim(),
        department: activeChatDept,
      });
      setChatSession({ chatId: result.chatId, agent: result.agent });
      setChatMessages(result.messages ?? []);
      setChatPhase('active');
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      setChatPhase(msg.includes('no agent') ? 'no-agents' : 'error');
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !chatSession || chatSending) return;
    const text = chatInput.trim();
    setChatInput('');
    setChatSending(true);

    const tempId = `temp_${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      chat_id: chatSession.chatId,
      sender_type: 'visitor',
      message: text,
      created_at: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, optimistic]);

    try {
      const result = await sendMessage({
        chat_id: chatSession.chatId,
        message: text,
        sender_type: 'visitor',
      });
      setChatMessages(prev => {
        const confirmed = prev.map(m =>
          m.id === tempId ? { ...m, id: result.messageId } : m,
        );
        return result.aiReply ? [...confirmed, result.aiReply] : confirmed;
      });
    } catch {
      toast({ variant: "destructive", title: "Failed to send", description: "Please try again." });
      setChatMessages(prev => prev.filter(m => m.id !== tempId));
      setChatInput(text);
    } finally {
      setChatSending(false);
    }
  };

  const handleChatDeptSelect = (dept: string) => {
    setForm(f => ({
      ...f,
      department: dept,
      subject: `Live chat request — ${DEPARTMENTS.find(d => d.id === dept)?.label ?? dept}`,
    }));
    setActiveTab("message");
    toast({ title: "Department selected", description: "Your message will be routed to the right team." });
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;
    setSubscribeState('loading');
    try {
      await subscribeNotifications(subscribeEmail.trim());
      setSubscribeState('done');
      setSubscribeEmail('');
    } catch {
      toast({ variant: "destructive", title: "Subscribe failed", description: "Please try again." });
      setSubscribeState('idle');
    }
  };

  const socialLinks = [
    { icon: Twitter, label: "Twitter", href: social.twitter },
    { icon: Linkedin, label: "LinkedIn", href: social.linkedin },
    { icon: Instagram, label: "Instagram", href: social.instagram },
    { icon: Facebook, label: "Facebook", href: social.facebook },
    { icon: Youtube, label: "YouTube", href: social.youtube },
  ].filter(s => s.href);

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-20">

        {/* ── HERO ── */}
        <section className="relative overflow-hidden py-20 lg:py-28">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-violet-600/5 pointer-events-none" />
          <div className="absolute top-20 left-[10%] w-72 h-72 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 right-[5%] w-96 h-96 bg-violet-500/8 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-6">
                <Zap className="h-3.5 w-3.5" />
                We're here for you, globally
              </div>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground leading-[1.07] tracking-tight">
                Let's{" "}
                <span className="bg-gradient-to-r from-primary via-violet-500 to-indigo-400 bg-clip-text text-transparent">
                  talk.
                </span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Whether it's a quick question, a big idea, or a support request — our global team is ready. Choose your preferred way to reach us below.
              </p>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4"
            >
              {STATS.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-5 text-center hover:border-primary/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <stat.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── QUICK CONTACT CARDS ── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-4">
          <motion.div
            variants={stagger.container}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {[
              { icon: Mail, label: "Email Us", value: contact.email || "hello@myflynai.com", sub: "24hr response", href: `mailto:${contact.email || 'hello@myflynai.com'}`, onClick: undefined },
              { icon: Phone, label: "Call Us", value: contact.phone || "+1 (612) 4590-542", sub: "Mon–Fri, 9am–6pm CST", href: `tel:${contact.phone}`, onClick: undefined },
              { icon: MessageSquare, label: "Live Chat", value: "Chat with our team", sub: "Agents online now", href: "#chat", onClick: (e: React.MouseEvent) => { e.preventDefault(); setActiveTab("chat"); document.getElementById("contact-tabs")?.scrollIntoView({ behavior: "smooth" }); } },
              { icon: MapPin, label: "HQ Office", value: contact.address || "San Francisco, CA", sub: "123 Innovation Drive", href: "#locations", onClick: undefined },
            ].map((card) => (
              <motion.a
                key={card.label}
                variants={stagger.item}
                href={card.href}
                onClick={card.onClick}
                className="group rounded-2xl border border-border bg-card p-5 flex items-start gap-4 hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 transition-all duration-300 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{card.label}</p>
                  <p className="text-sm font-semibold text-foreground truncate">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                </div>
              </motion.a>
            ))}
          </motion.div>
        </section>

        {/* ── TABS ── */}
        <section id="contact-tabs" className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex mb-8 h-auto p-1 bg-muted/60 rounded-2xl border border-border/50">
              <TabsTrigger value="message" className="rounded-xl px-6 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Send className="h-4 w-4 mr-2" />
                Send Message
              </TabsTrigger>
              <TabsTrigger value="locations" className="rounded-xl px-6 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Globe className="h-4 w-4 mr-2" />
                Locations
              </TabsTrigger>
              <TabsTrigger value="chat" className="rounded-xl px-6 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <MessageSquare className="h-4 w-4 mr-2" />
                Live Chat
              </TabsTrigger>
            </TabsList>

            {/* ── TAB: MESSAGE FORM ── */}
            <TabsContent value="message">
              <AnimatePresence mode="wait">
                {submitted ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-10 text-center max-w-xl mx-auto"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">Message sent!</h2>
                    <p className="text-muted-foreground mb-6">We'll get back to you within 24 hours.</p>
                    <div className="inline-block rounded-xl bg-background border border-border px-6 py-3 mb-6">
                      <p className="text-xs text-muted-foreground mb-1">Your Ticket ID</p>
                      <p className="font-mono font-semibold text-primary">{submitted.ticketId}</p>
                    </div>
                    <div>
                      <Button variant="outline" onClick={() => setSubmitted(null)}>
                        Send another message
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8"
                  >
                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-5">
                        <h2 className="text-xl font-semibold text-foreground">Send us a message</h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Full Name <span className="text-red-400">*</span></label>
                            <Input placeholder="Jane Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="rounded-xl" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Email Address <span className="text-red-400">*</span></label>
                            <Input type="email" placeholder="jane@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className="rounded-xl" />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Phone <span className="text-muted-foreground font-normal">(optional)</span></label>
                            <Input type="tel" placeholder="+1 (555) 000-0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="rounded-xl" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Country <span className="text-red-400">*</span></label>
                            <Select value={form.country} onValueChange={v => setForm(f => ({ ...f, country: v }))}>
                              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select country" /></SelectTrigger>
                              <SelectContent>
                                {countries.length > 0
                                  ? countries.map(c => (
                                    <SelectItem key={c.country_code} value={c.country_code}>
                                      <span className="inline-flex items-center gap-1.5"><FlagIcon code={c.country_code} /> {c.country}</span>
                                    </SelectItem>
                                  ))
                                  : (<>
                                    <SelectItem value="US">🇺🇸 United States</SelectItem>
                                    <SelectItem value="GB">🇬🇧 United Kingdom</SelectItem>
                                    <SelectItem value="CA">🇨🇦 Canada</SelectItem>
                                    <SelectItem value="AU">🇦🇺 Australia</SelectItem>
                                    <SelectItem value="SG">🇸🇬 Singapore</SelectItem>
                                    <SelectItem value="DE">🇩🇪 Germany</SelectItem>
                                    <SelectItem value="FR">🇫🇷 France</SelectItem>
                                    <SelectItem value="JP">🇯🇵 Japan</SelectItem>
                                    <SelectItem value="MX">🇲🇽 Mexico</SelectItem>
                                  </>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Department <span className="text-red-400">*</span></label>
                            <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v }))}>
                              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DEPARTMENTS.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Priority</label>
                            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PRIORITIES.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Subject <span className="text-red-400">*</span></label>
                          <Input
                            placeholder={
                              form.department === 'support' ? "Describe your issue briefly..."
                              : form.department === 'sales' ? "I'd like to learn more about..."
                              : form.department === 'careers' ? "Applying for..."
                              : "How can we help?"
                            }
                            value={form.subject}
                            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                            required
                            className="rounded-xl"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-foreground">Message <span className="text-red-400">*</span></label>
                            <span className={`text-xs ${msgLength > 4500 ? 'text-red-400' : 'text-muted-foreground'}`}>{msgLength}/5000</span>
                          </div>
                          <Textarea
                            placeholder="Tell us everything — the more detail, the faster we can help."
                            rows={6}
                            value={form.message}
                            onChange={e => { setForm(f => ({ ...f, message: e.target.value })); setMsgLength(e.target.value.length); }}
                            required
                            maxLength={5000}
                            className="rounded-xl resize-none"
                          />
                        </div>

                        <Button type="submit" disabled={isSubmitting} className="w-full flyn-button-gradient h-11 rounded-xl text-sm font-semibold">
                          {isSubmitting ? (
                            <span className="flex items-center gap-2">
                              <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              Sending…
                            </span>
                          ) : (
                            <span className="flex items-center gap-2"><Send className="h-4 w-4" />Send Message</span>
                          )}
                        </Button>
                      </div>
                    </form>

                    {/* Sidebar */}
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="font-semibold text-foreground mb-4">What to expect</h3>
                        <div className="space-y-3">
                          {[
                            { label: "General & Sales", time: "< 24 hours" },
                            { label: "Technical Support", time: "< 12 hours" },
                            { label: "Urgent Priority", time: "< 2 hours" },
                          ].map(item => (
                            <div key={item.label} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="font-medium text-foreground">{item.time}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                        <h3 className="font-semibold text-foreground">Other ways to reach us</h3>
                        {[
                          { icon: Mail, label: contact.email || "hello@myflynai.com", href: `mailto:${contact.email || 'hello@myflynai.com'}` },
                          { icon: Phone, label: contact.phone || "+1 (612) 4590-542", href: `tel:${contact.phone}` },
                        ].map(item => (
                          <a key={item.label} href={item.href} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors">
                            <item.icon className="h-4 w-4 text-primary/60" />
                            {item.label}
                          </a>
                        ))}
                      </div>

                      {socialLinks.length > 0 && (
                        <div className="rounded-2xl border border-border bg-card p-5">
                          <h3 className="font-semibold text-foreground mb-3">Follow us</h3>
                          <div className="flex flex-wrap gap-2">
                            {socialLinks.map(s => (
                              <a
                                key={s.label}
                                href={s.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                              >
                                <s.icon className="h-3.5 w-3.5" />
                                {s.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            {/* ── TAB: LOCATIONS ── */}
            <TabsContent value="locations">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger className="sm:w-52 rounded-xl">
                      <SelectValue placeholder="All Countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">🌍 All Countries</SelectItem>
                      {countries.map(c => (
                        <SelectItem key={c.country_code} value={c.country_code}>
                          <span className="inline-flex items-center gap-1.5"><FlagIcon code={c.country_code} /> {c.country}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedDept} onValueChange={setSelectedDept}>
                    <SelectTrigger className="sm:w-52 rounded-xl">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {DEPARTMENTS.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(selectedCountry !== "all" || selectedDept !== "all") && (
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedCountry("all"); setSelectedDept("all"); }} className="text-muted-foreground">
                      Clear filters
                    </Button>
                  )}
                </div>

                {locationsQuery.isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-2xl border border-border bg-card/60 h-64 animate-pulse" />
                    ))}
                  </div>
                ) : locations.length === 0 ? (
                  <div className="text-center py-16">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground">No offices match the selected filters.</p>
                    <Button variant="ghost" className="mt-3" onClick={() => { setSelectedCountry("all"); setSelectedDept("all"); }}>
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <motion.div
                    variants={stagger.container}
                    initial="initial"
                    animate="animate"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {locations.map(loc => <LocationCard key={loc.id} loc={loc} />)}
                  </motion.div>
                )}
              </motion.div>
            </TabsContent>

            {/* ── TAB: LIVE CHAT ── */}
            <TabsContent value="chat">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

                {/* Department selection */}
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">Connect with the right team</h2>
                  <p className="text-sm text-muted-foreground mb-4">Select a department to see available agents and start a live chat.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {DEPARTMENTS.map(dept => {
                      const Icon = dept.icon;
                      const isActive = activeChatDept === dept.id;
                      return (
                        <button
                          key={dept.id}
                          onClick={() => setActiveChatDept(dept.id)}
                          className={`group flex items-center gap-4 p-4 rounded-2xl border text-left transition-all duration-200 ${
                            isActive
                              ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
                              : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isActive ? "bg-primary/20" : "bg-muted group-hover:bg-primary/10"}`}>
                            <Icon className={`h-5 w-5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                          </div>
                          <p className={`font-medium text-sm ${isActive ? "text-primary" : "text-foreground"}`}>{dept.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Agents for selected dept */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">
                      {DEPARTMENTS.find(d => d.id === activeChatDept)?.label ?? "Team"} agents
                    </h3>
                    {onlineAgents.length > 0 && (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse inline-block" />
                        {onlineAgents.length} available
                      </Badge>
                    )}
                  </div>

                  {agentsQuery.isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="rounded-2xl border border-border bg-card/60 h-28 animate-pulse" />
                      ))}
                    </div>
                  ) : agents.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card p-6 text-center">
                      <AlertCircle className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No agents found for this department.</p>
                    </div>
                  ) : (
                    <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
                    </motion.div>
                  )}
                </div>

                {/* ── Inline Chat Panel ── */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <AnimatePresence mode="wait">

                    {/* Setup: collect visitor info */}
                    {chatPhase === 'setup' && (
                      <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6">
                        <h3 className="font-semibold text-foreground mb-1">
                          Start a live chat with {DEPARTMENTS.find(d => d.id === activeChatDept)?.label ?? "the team"}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-5">
                          {onlineAgents.length > 0
                            ? `${onlineAgents.length} agent${onlineAgents.length > 1 ? 's' : ''} available right now.`
                            : "No agents are currently online in this department."}
                        </p>

                        {onlineAgents.length === 0 ? (
                          <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={() => handleChatDeptSelect(activeChatDept)} className="gap-2">
                              <Send className="h-4 w-4" />
                              Send a message instead
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-sm font-medium text-foreground">Your name</label>
                                <Input
                                  placeholder="Jane Smith"
                                  value={visitorName}
                                  onChange={e => setVisitorName(e.target.value)}
                                  className="rounded-xl"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-sm font-medium text-foreground">Your email</label>
                                <Input
                                  type="email"
                                  placeholder="jane@company.com"
                                  value={visitorEmail}
                                  onChange={e => setVisitorEmail(e.target.value)}
                                  className="rounded-xl"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Button
                                className="flyn-button-gradient gap-2"
                                disabled={!visitorName.trim() || !visitorEmail.trim()}
                                onClick={handleStartChat}
                              >
                                <MessageSquare className="h-4 w-4" />
                                Start Chat
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleChatDeptSelect(activeChatDept)} className="text-muted-foreground text-xs">
                                Send message instead
                              </Button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Connecting spinner */}
                    {chatPhase === 'connecting' && (
                      <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-10 text-center">
                        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">Connecting you to an agent…</p>
                      </motion.div>
                    )}

                    {/* Active chat */}
                    {chatPhase === 'active' && chatSession && (
                      <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
                        {/* Agent header */}
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-muted/30">
                          <div className={`relative w-9 h-9 rounded-xl ${avatarColor(chatSession.agent.name)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                            {initials(chatSession.agent.name)}
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card bg-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{chatSession.agent.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{chatSession.agent.department} · Online</p>
                          </div>
                          <div className="flex items-center gap-1 text-amber-400 shrink-0">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            <span className="text-xs font-medium text-foreground">{chatSession.agent.customer_rating.toFixed(1)}</span>
                          </div>
                        </div>

                        {/* Message thread */}
                        <div className="flex flex-col gap-3 p-4 h-72 overflow-y-auto">
                          <AnimatePresence initial={false}>
                            {chatMessages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
                            {chatSending && (
                              <motion.div
                                key="typing"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="flex items-start"
                              >
                                <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-4 py-3">
                                  <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                                  </span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <div ref={chatEndRef} />
                        </div>

                        {/* Input row */}
                        <div className="flex items-center gap-2 p-3 border-t border-border bg-background/50">
                          <Input
                            placeholder="Type a message…"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                            className="rounded-xl flex-1"
                            disabled={chatSending}
                          />
                          <Button
                            size="icon"
                            className="flyn-button-gradient rounded-xl h-10 w-10 shrink-0"
                            onClick={handleSendMessage}
                            disabled={chatSending || !chatInput.trim()}
                          >
                            {chatSending ? (
                              <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </motion.div>
                    )}

                    {/* Error / no-agents */}
                    {(chatPhase === 'error' || chatPhase === 'no-agents') && (
                      <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 text-center">
                        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
                        <p className="font-semibold text-foreground mb-1">
                          {chatPhase === 'no-agents' ? 'No agents available' : 'Connection failed'}
                        </p>
                        <p className="text-sm text-muted-foreground mb-5">
                          {chatPhase === 'no-agents'
                            ? 'All agents in this department are busy. Try another department or send us a message.'
                            : 'Could not start the chat. Please try again or use the contact form.'}
                        </p>
                        <div className="flex items-center justify-center gap-3">
                          <Button variant="outline" size="sm" onClick={() => setChatPhase('setup')}>Try Again</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleChatDeptSelect(activeChatDept)} className="text-muted-foreground">
                            Send Message
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </motion.div>
            </TabsContent>
          </Tabs>
        </section>

        {/* ── FAQ ── */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="text-2xl font-bold text-foreground mb-2">Frequently asked questions</h2>
            <p className="text-muted-foreground mb-8">Can't find the answer? Reach us via the form above.</p>
            <Accordion type="single" collapsible className="space-y-3">
              {FAQS.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="rounded-2xl border border-border bg-card px-6 data-[state=open]:border-primary/30"
                >
                  <AccordionTrigger className="text-left font-medium text-foreground hover:no-underline py-4">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </section>

        {/* ── CTA BANNER ── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 p-10 sm:p-14 text-center"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">Ready to get started?</h2>
              <p className="text-muted-foreground max-w-xl mx-auto mb-8">
                Join thousands of teams using FLYN AI to automate conversations, grow pipelines, and scale globally.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a href="/signup">
                  <Button className="flyn-button-gradient h-11 px-8 font-semibold gap-2">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
                <Button
                  variant="outline"
                  className="h-11 px-8 gap-2"
                  onClick={() => { setActiveTab("message"); document.getElementById("contact-tabs")?.scrollIntoView({ behavior: "smooth" }); }}
                >
                  <MessageSquare className="h-4 w-4" />
                  Talk to Sales
                </Button>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ── SUBSCRIBE BAR ── */}
        <section className="border-t border-border/60 bg-muted/20">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Stay in the loop</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Get platform updates, feature releases, and early access to new capabilities.
              </p>

              <AnimatePresence mode="wait">
                {subscribeState === 'done' ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-center gap-2 text-emerald-500 font-medium"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    You're subscribed!
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onSubmit={handleSubscribe}
                    className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                  >
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={subscribeEmail}
                      onChange={e => setSubscribeEmail(e.target.value)}
                      required
                      className="rounded-xl flex-1"
                      disabled={subscribeState === 'loading'}
                    />
                    <Button
                      type="submit"
                      className="flyn-button-gradient rounded-xl px-6 shrink-0 gap-2"
                      disabled={subscribeState === 'loading' || !subscribeEmail.trim()}
                    >
                      {subscribeState === 'loading' ? (
                        <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Bell className="h-4 w-4" />
                          Subscribe
                        </>
                      )}
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>
              <p className="text-xs text-muted-foreground mt-3">No spam. Unsubscribe anytime.</p>
            </motion.div>
          </div>
        </section>

      </main>

      <LandingFooter />
    </div>
  );
};

export default ContactPage;
