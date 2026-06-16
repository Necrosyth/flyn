import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, X, Send, ChevronRight, CheckCircle2, CreditCard, LogIn, Loader2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { authedFetch } from '@/services/authApi';
import { API_BASE_URL } from '@/lib/api';
import { useChatbot } from './useChatbot';
import type { LocalMessage } from './useChatbot';
import flynIcon from '@/assets/flyn_icon.png';

// ── Markdown renderer (no dependency) ────────────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (line: string): React.ReactNode => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*'))
        return <em key={idx}>{part.slice(1, -1)}</em>;
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^[-•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-•]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-0.5 my-1">
          {items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}
        </ul>
      );
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={i} className="list-decimal list-inside space-y-0.5 my-1">
          {items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}
        </ol>
      );
      continue;
    }
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }

  return <div className="text-sm space-y-0.5">{elements}</div>;
}

// ── Quick Topics ──────────────────────────────────────────────────────────────

const QUICK_TOPICS = [
  { label: 'What is FLYN?',    prompt: 'What is FLYN AI and what does it do?' },
  { label: 'Pricing plans',    prompt: 'What are the pricing plans for FLYN AI?' },
  { label: 'Book a demo',      prompt: 'I would like to book a demo of FLYN AI.' },
  { label: 'Talk to sales',    prompt: 'I want to discuss enterprise pricing with the sales team.' },
];

// ── Message Bubble ────────────────────────────────────────────────────────────

const MessageBubble = ({ msg }: { msg: { role: 'visitor' | 'agent'; content: string } }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className={`flex gap-2 ${msg.role === 'visitor' ? 'flex-row-reverse' : 'flex-row'}`}
  >
    {msg.role === 'agent' && (
      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden p-1">
        <img src={flynIcon} alt="Flyn" className="w-full h-full object-contain brightness-0 invert" />
      </div>
    )}
    <div
      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
        msg.role === 'visitor'
          ? 'bg-primary text-primary-foreground rounded-br-sm text-sm leading-relaxed'
          : 'bg-muted text-foreground rounded-bl-sm'
      }`}
    >
      {msg.role === 'visitor' ? msg.content : <MarkdownText text={msg.content} />}
    </div>
  </motion.div>
);

// ── Typing Indicator ──────────────────────────────────────────────────────────

const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="flex gap-2 flex-row"
  >
    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden p-1">
      <img src={flynIcon} alt="Flyn" className="w-full h-full object-contain brightness-0 invert" />
    </div>
    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </span>
    </div>
  </motion.div>
);

// ── Inline Sales Form ─────────────────────────────────────────────────────────

const SalesFormInline = ({
  visitorName,
  visitorEmail,
  onSubmit,
  onDismiss,
  submitted,
}: {
  visitorName: string;
  visitorEmail: string;
  onSubmit: (company: string, message: string, type: string) => void;
  onDismiss: () => void;
  submitted: boolean;
}) => {
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('enterprise');

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">Sales inquiry received!</p>
        <p className="text-xs text-muted-foreground mt-1">Our sales team will contact you within 4 hours.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Talk to our sales team</p>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <Input
          placeholder="Company name"
          value={company}
          onChange={e => setCompany(e.target.value)}
          className="h-8 text-sm rounded-xl"
        />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="w-full h-8 text-sm rounded-xl border border-input bg-background px-3 text-foreground"
        >
          <option value="enterprise">Enterprise Plan</option>
          <option value="reseller">Reseller / White-label</option>
          <option value="general">General Inquiry</option>
        </select>
        <Textarea
          placeholder="Tell us about your needs…"
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="text-sm rounded-xl resize-none min-h-[60px]"
        />
        <Button
          size="sm"
          className="w-full h-8 text-xs flyn-button-gradient rounded-xl"
          onClick={() => onSubmit(company, message, type)}
          disabled={!company.trim()}
        >
          Submit to Sales Team
        </Button>
      </div>
    </motion.div>
  );
};

// ── Inline Ticket Form ────────────────────────────────────────────────────────

const TicketFormInline = ({
  onSubmit,
  onDismiss,
  submitted,
}: {
  onSubmit: (subject: string, description: string) => void;
  onDismiss: () => void;
  submitted: boolean;
}) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">Support ticket created!</p>
        <p className="text-xs text-muted-foreground mt-1">We'll respond to your email within 24 hours.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Open a support ticket</p>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <Input
          placeholder="Subject"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className="h-8 text-sm rounded-xl"
        />
        <Textarea
          placeholder="Describe your issue…"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="text-sm rounded-xl resize-none min-h-[60px]"
        />
        <Button
          size="sm"
          className="w-full h-8 text-xs rounded-xl"
          variant="outline"
          onClick={() => onSubmit(subject, description)}
          disabled={!subject.trim() || !description.trim()}
        >
          Submit Ticket
        </Button>
      </div>
    </motion.div>
  );
};

// ── Billing CTA ───────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, { name: string; monthly: string; yearly: string }> = {
  starter:      { name: 'Starter',      monthly: '$29.99/mo', yearly: '$323/yr' },
  growth:       { name: 'Growth',       monthly: '$49/mo',    yearly: '$529/yr' },
  professional: { name: 'Professional', monthly: '$99/mo',    yearly: '$1,069/yr' },
  enterprise:   { name: 'Enterprise',   monthly: 'Custom',    yearly: 'Custom' },
};

const BillingCTA = ({
  planId,
  interval,
  isAuthenticated,
}: {
  planId: string;
  interval: 'monthly' | 'yearly';
  isAuthenticated: boolean;
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const plan = PLAN_LABELS[planId];
  if (!plan) return null;

  const price = interval === 'yearly' ? plan.yearly : plan.monthly;

  const handleUpgrade = async () => {
    if (!isAuthenticated) {
      window.open('https://app.myflynai.com/login', '_blank');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch(`${API_BASE_URL}/billing/plan-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval: interval }),
      });
      const data = await res.json() as { checkoutUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? 'Checkout failed');
      if (data.checkoutUrl) window.open(data.checkoutUrl, '_blank');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-purple-600/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-violet-500" />
        <p className="text-sm font-semibold text-foreground">
          Upgrade to {plan.name} — <span className="text-violet-500">{price}</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {isAuthenticated
          ? 'Click below to open your secure Stripe checkout. Your plan updates instantly after payment.'
          : 'Log in to your FLYN account to complete this upgrade securely.'}
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button
        size="sm"
        className="w-full h-8 text-xs flyn-button-gradient rounded-xl"
        onClick={() => void handleUpgrade()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isAuthenticated ? (
          <><CreditCard className="w-3.5 h-3.5 mr-1.5" />Upgrade to {plan.name} ({interval})</>
        ) : (
          <><LogIn className="w-3.5 h-3.5 mr-1.5" />Log in to Upgrade</>
        )}
      </Button>
    </motion.div>
  );
};

// ── Main Widget ───────────────────────────────────────────────────────────────

export function ChatWidget() {
  const chat = useChatbot();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pre-fill from auth if localStorage is empty
  useEffect(() => {
    if (!localStorage.getItem('reca_visitor_name') && user?.name && !chat.visitorName) {
      chat.setVisitorName(user.name);
    }
    if (!localStorage.getItem('reca_visitor_email') && user?.email && !chat.visitorEmail) {
      chat.setVisitorEmail(user.email);
    }
  }, [user]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, chat.isSending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void chat.sendMessage();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Chat Panel */}
      <AnimatePresence>
        {chat.isOpen && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
            style={{ height: '520px' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-gradient-to-r from-violet-600/10 to-purple-600/5 shrink-0">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center overflow-hidden p-1.5">
                  <img src={flynIcon} alt="Flyn" className="w-full h-full object-contain brightness-0 invert" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card bg-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">RECA</p>
                <p className="text-[11px] text-muted-foreground">FLYN AI Assistant · Online</p>
              </div>
              <button
                onClick={chat.toggle}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden flex flex-col">

              {/* Welcome / Setup Phase */}
              {(chat.phase === 'welcome' || chat.phase === 'connecting') && (
                <div
                  className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain"
                  onWheel={e => e.stopPropagation()}
                >
                  {/* Intro */}
                  <div className="text-center pt-2">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center mx-auto mb-3 overflow-hidden p-2.5">
                      <img src={flynIcon} alt="Flyn" className="w-full h-full object-contain brightness-0 invert" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Hi, I'm RECA 👋</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      FLYN's AI assistant — here 24/7 to help with questions, pricing, onboarding, and support.
                    </p>
                  </div>

                  {/* Quick Topics */}
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide px-1">Quick questions</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_TOPICS.map(topic => (
                        <button
                          key={topic.label}
                          onClick={() => chat.selectQuickTopic(topic.prompt)}
                          className={`text-left text-xs px-3 py-2 rounded-xl border transition-all duration-150 ${
                            chat.pendingQuickTopic === topic.prompt
                              ? 'border-primary/60 bg-primary/10 text-primary'
                              : 'border-border bg-muted/40 text-foreground hover:border-primary/40 hover:bg-primary/5'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                            {topic.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name + Email Form */}
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide px-1">Start chatting</p>
                    <Input
                      placeholder="Your name"
                      value={chat.visitorName}
                      onChange={e => chat.setVisitorName(e.target.value)}
                      className="h-9 text-sm rounded-xl"
                      disabled={chat.phase === 'connecting'}
                    />
                    <Input
                      type="email"
                      placeholder="Your email"
                      value={chat.visitorEmail}
                      onChange={e => chat.setVisitorEmail(e.target.value)}
                      className="h-9 text-sm rounded-xl"
                      disabled={chat.phase === 'connecting'}
                    />
                    <Button
                      className="w-full h-9 text-sm flyn-button-gradient rounded-xl"
                      onClick={() => void chat.startSession()}
                      disabled={
                        chat.phase === 'connecting' ||
                        !chat.visitorName.trim() ||
                        !chat.visitorEmail.trim()
                      }
                    >
                      {chat.phase === 'connecting' ? (
                        <span className="flex items-center gap-2">
                          <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Connecting…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          Start Chat
                          <MessageSquare className="h-4 w-4" />
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Active Chat Phase */}
              {chat.phase === 'active' && (
                <>
                  {/* Resumed session banner */}
                  {chat.isResumed && (
                    <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-violet-500/10 border-b border-violet-500/20 text-[11px] text-violet-400 font-medium">
                      <History className="w-3.5 h-3.5 shrink-0" />
                      Picked up your previous conversation
                    </div>
                  )}

                  {/* Messages */}
                  <div
                    className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain"
                    onWheel={e => e.stopPropagation()}
                  >
                    <AnimatePresence initial={false}>
                      {chat.messages.map(msg => (
                        <div key={msg.id}>
                          <MessageBubble msg={msg} />
                          {msg.billingIntent && (
                            <div className="mt-2 ml-9">
                              <BillingCTA
                                planId={msg.billingIntent.planId}
                                interval={msg.billingIntent.interval}
                                isAuthenticated={!!user}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                      {chat.isSending && <TypingIndicator key="typing" />}
                    </AnimatePresence>

                    {/* Inline Sales Form */}
                    {chat.showSalesForm && !chat.isSending && (
                      <SalesFormInline
                        visitorName={chat.visitorName}
                        visitorEmail={chat.visitorEmail}
                        submitted={chat.salesFormSubmitted}
                        onDismiss={chat.dismissSalesForm}
                        onSubmit={(company, message, type) =>
                          void chat.submitSalesForm({ company, message, inquiryType: type as 'enterprise' | 'reseller' | 'general' })
                        }
                      />
                    )}

                    {/* Inline Ticket Form */}
                    {chat.showTicketForm && !chat.isSending && (
                      <TicketFormInline
                        submitted={chat.ticketFormSubmitted}
                        onDismiss={chat.dismissTicketForm}
                        onSubmit={(subject, description) =>
                          void chat.submitTicketForm({ subject, description })
                        }
                      />
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div className="shrink-0 flex items-center gap-2 p-3 border-t border-border bg-background/50">
                    <Input
                      placeholder="Type a message…"
                      value={chat.inputText}
                      onChange={e => chat.setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={chat.isSending}
                      className="rounded-xl flex-1 h-9 text-sm"
                    />
                    <Button
                      size="icon"
                      className="flyn-button-gradient rounded-xl h-9 w-9 shrink-0"
                      onClick={() => void chat.sendMessage()}
                      disabled={chat.isSending || !chat.inputText.trim()}
                    >
                      {chat.isSending ? (
                        <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Bubble Button */}
      <motion.button
        onClick={chat.toggle}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 shadow-lg shadow-violet-500/30 flex items-center justify-center text-white hover:shadow-violet-500/50 transition-shadow"
        aria-label={chat.isOpen ? 'Close chat' : 'Open RECA chat'}
      >
        <AnimatePresence mode="wait">
          {chat.isOpen ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageSquare className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
        {/* Pulsing online dot */}
        {!chat.isOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background bg-emerald-400">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </span>
        )}
      </motion.button>
    </div>
  );
}
