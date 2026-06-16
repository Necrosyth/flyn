import { useState, useRef, useCallback } from 'react';
import {
  createChatSession,
  sendChatMessage,
  createChatTicket,
  createSalesInquiry,
  getChatbotPublicConfig,
  type ChatbotMessage,
} from '@/services/chatbotApi';

const TENANT_ID = (import.meta.env.VITE_CHATBOT_TENANT_ID as string | undefined) ?? 'flyn-master';

// Maps the stored chatbotAgent key → agentType short string sent to backend
const AGENT_TYPE_MAP: Record<string, string> = {
  'ai-front-desk': 'front-desk',
  'ai-sales-agent': 'sales',
  'ai-marketing-agent': 'marketing',
  'ai-support-agent': 'support',
  'custom-agent': 'custom',
};

export type ChatPhase = 'welcome' | 'connecting' | 'active';

export interface LocalMessage {
  id: string;
  role: 'visitor' | 'agent';
  content: string;
  createdAt: string;
  billingIntent?: {
    planId: string;
    interval: 'monthly' | 'yearly';
  };
}

export interface TicketFormPayload {
  subject: string;
  description: string;
}

export interface SalesFormPayload {
  company: string;
  message: string;
  inquiryType: 'enterprise' | 'reseller' | 'general';
}

export interface UseChatbotReturn {
  isOpen: boolean;
  phase: ChatPhase;
  messages: LocalMessage[];
  isSending: boolean;
  isSalesIntent: boolean;
  isEscalation: boolean;
  showSalesForm: boolean;
  showTicketForm: boolean;
  salesFormSubmitted: boolean;
  ticketFormSubmitted: boolean;
  inputText: string;
  pendingQuickTopic: string | null;
  visitorName: string;
  visitorEmail: string;
  sessionId: string | null;
  isResumed: boolean;
  setVisitorName: (v: string) => void;
  setVisitorEmail: (v: string) => void;
  setInputText: (v: string) => void;
  toggle: () => void;
  selectQuickTopic: (prompt: string) => void;
  startSession: () => Promise<void>;
  sendMessage: () => Promise<void>;
  submitTicketForm: (payload: TicketFormPayload) => Promise<void>;
  submitSalesForm: (payload: SalesFormPayload) => Promise<void>;
  dismissSalesForm: () => void;
  dismissTicketForm: () => void;
}

export function useChatbot(): UseChatbotReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>('welcome');
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isSalesIntent, setIsSalesIntent] = useState(false);
  const [isEscalation, setIsEscalation] = useState(false);
  const [showSalesForm, setShowSalesForm] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [salesFormSubmitted, setSalesFormSubmitted] = useState(false);
  const [ticketFormSubmitted, setTicketFormSubmitted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [pendingQuickTopic, setPendingQuickTopic] = useState<string | null>(null);
  const [visitorName, setVisitorName] = useState(
    () => localStorage.getItem('reca_visitor_name') ?? '',
  );
  const [visitorEmail, setVisitorEmail] = useState(
    () => localStorage.getItem('reca_visitor_email') ?? '',
  );
  const [isResumed, setIsResumed] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  const toggle = useCallback(() => setIsOpen(o => !o), []);

  const selectQuickTopic = useCallback((prompt: string) => {
    setPendingQuickTopic(prompt);
  }, []);

  const appendMessage = (msg: LocalMessage) =>
    setMessages(prev => [...prev, msg]);

  const startSession = useCallback(async () => {
    if (!visitorName.trim() || !visitorEmail.trim()) return;
    setPhase('connecting');
    try {
      localStorage.setItem('reca_visitor_name', visitorName.trim());
      localStorage.setItem('reca_visitor_email', visitorEmail.trim());

      // Fetch the tenant's configured chatbot agent type (public — no auth required)
      let agentType: string | undefined;
      try {
        const config = await getChatbotPublicConfig(TENANT_ID);
        if (config?.chatbotAgent) agentType = AGENT_TYPE_MAP[config.chatbotAgent] ?? config.chatbotAgent;
      } catch { /* fall back to default RECA */ }

      const result = await createChatSession({
        tenantId: TENANT_ID,
        visitorName: visitorName.trim(),
        visitorEmail: visitorEmail.trim(),
        agentType,
      });
      sessionIdRef.current = result.sessionId;
      localStorage.setItem('reca_session_id', result.sessionId);
      localStorage.setItem('reca_session_ts', Date.now().toString());

      // If resuming a past session, load all prior messages first
      if (result.isResumed && result.pastMessages && result.pastMessages.length > 0) {
        setIsResumed(true);
        const loaded: LocalMessage[] = result.pastMessages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }));
        setMessages(loaded);
      } else {
        setIsResumed(false);
        appendMessage({
          id: `${result.sessionId}_greeting`,
          role: 'agent',
          content: result.greeting,
          createdAt: new Date().toISOString(),
        });
      }

      setPhase('active');

      if (pendingQuickTopic) {
        const topicToSend = pendingQuickTopic;
        setPendingQuickTopic(null);
        await sendMessageInternal(result.sessionId, topicToSend);
      }
    } catch {
      setPhase('welcome');
    }
  }, [visitorName, visitorEmail, pendingQuickTopic]);

  const sendMessageInternal = async (sid: string, text: string) => {
    const tempId = `temp_${Date.now()}`;
    appendMessage({ id: tempId, role: 'visitor', content: text, createdAt: new Date().toISOString() });
    setIsSending(true);
    try {
      const result = await sendChatMessage({ sessionId: sid, tenantId: TENANT_ID, message: text });
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: `${sid}_v_${Date.now()}` } : m));

      const agentMsg: LocalMessage = {
        id: `${sid}_a_${Date.now()}`,
        role: 'agent',
        content: result.reply,
        createdAt: new Date().toISOString(),
      };

      // Attach billing intent to the message so the UI can render a CTA
      if (result.isBillingIntent && result.billingPlanId) {
        agentMsg.billingIntent = {
          planId: result.billingPlanId,
          interval: result.billingInterval,
        };
      }

      appendMessage(agentMsg);
      if (result.isSalesIntent) { setIsSalesIntent(true); setShowSalesForm(true); }
      if (result.isEscalation) { setIsEscalation(true); setShowTicketForm(true); }
    } catch {
      appendMessage({
        id: `err_${Date.now()}`,
        role: 'agent',
        content: "Sorry, I'm having trouble connecting. Please try again.",
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !sessionIdRef.current || isSending) return;
    setInputText('');
    await sendMessageInternal(sessionIdRef.current, text);
  }, [inputText, isSending]);

  const submitTicketForm = useCallback(async (payload: TicketFormPayload) => {
    await createChatTicket({
      tenantId: TENANT_ID,
      sessionId: sessionIdRef.current ?? undefined,
      visitorName,
      visitorEmail,
      subject: payload.subject,
      description: payload.description,
    });
    setTicketFormSubmitted(true);
  }, [visitorName, visitorEmail]);

  const submitSalesForm = useCallback(async (payload: SalesFormPayload) => {
    await createSalesInquiry({
      tenantId: TENANT_ID,
      sessionId: sessionIdRef.current ?? undefined,
      visitorName,
      visitorEmail,
      company: payload.company,
      message: payload.message,
      inquiryType: payload.inquiryType,
    });
    setSalesFormSubmitted(true);
  }, [visitorName, visitorEmail]);

  const dismissSalesForm = useCallback(() => setShowSalesForm(false), []);
  const dismissTicketForm = useCallback(() => setShowTicketForm(false), []);

  return {
    isOpen, phase, messages, isSending, isSalesIntent, isEscalation,
    showSalesForm, showTicketForm, salesFormSubmitted, ticketFormSubmitted,
    inputText, pendingQuickTopic, visitorName, visitorEmail,
    sessionId: sessionIdRef.current, isResumed,
    setVisitorName, setVisitorEmail, setInputText, toggle,
    selectQuickTopic, startSession, sendMessage,
    submitTicketForm, submitSalesForm,
    dismissSalesForm, dismissTicketForm,
  };
}
