import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { withPlanGate } from "@/components/PlanGate";
import {
  Phone, PhoneOff,
  ArrowUpRight,
  ArrowDownLeft, PhoneMissed, Loader2, Bot,
  Users, MicOff, UserMinus, PhoneCall, Activity, ChevronDown, ChevronUp,
  Zap, MessageSquare, Sparkles, TrendingUp, TrendingDown, Minus,
  Square, MessageCircle, Mic, Play, Download, CloudUpload, Clock,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import { isStaleChunkError, reloadForStaleChunkOnce } from "@/lib/staleChunk";
import { useAuth } from "@/contexts/AuthContext";
import { getDb } from "@/lib/firebase";
import { collection, onSnapshot, query, where, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { useAgentStore } from "@/hooks/useAgentStore";
import { CallAnalyticsPanel } from "@/components/CallAnalyticsPanel";
import { CallCenterStatsBar } from "@/components/CallCenterStatsBar";
import { ActiveCallBanner } from "@/components/ActiveCallBanner";
import { LiveCallQueueCard } from "@/components/LiveCallQueueCard";
import { LiveTranscriptCard } from "@/components/LiveTranscriptCard";
import type { CallAnalyticsDoc } from "@/components/SentimentAnalysisCard";
import { QualityScoresCard } from "@/components/QualityScoresCard";
import { AgentLeaderboardCard } from "@/components/AgentLeaderboardCard";
import { CallIntelligenceCard } from "@/components/CallIntelligenceCard";
import { InboundReceptionistCard } from "@/components/InboundReceptionistCard";

type CallStatus = "idle" | "connecting";

interface CallSummary {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  intent: string;
  keyPoints: string[];
  actionItems: string[];
}

interface RecentCall {
  name: string;
  number: string;
  time: string;
  type: "outgoing" | "incoming" | "missed";
  durationSeconds?: number;
  callSid?: string;
  callSummary?: CallSummary;
  followUpSent?: boolean;
  recordingSid?: string;
  recordingDuration?: number;
  recordingStoragePath?: string;
}

// ── Sentiment helpers ────────────────────────────────────────────────────────

const POSITIVE_WORDS = new Set([
  "yes", "yeah", "great", "perfect", "excellent", "wonderful", "fantastic",
  "amazing", "love", "interested", "absolutely", "definitely", "sure",
  "happy", "good", "helpful", "thank", "thanks", "appreciate", "awesome",
  "brilliant", "agree", "exactly", "right", "deal", "let's", "sounds",
]);

const NEGATIVE_WORDS = new Set([
  "no", "not", "never", "cancel", "refund", "angry", "frustrated",
  "expensive", "costly", "problem", "issue", "complaint", "terrible",
  "awful", "bad", "worst", "horrible", "ridiculous", "unacceptable",
  "unhappy", "disappointed", "waste", "useless", "broken", "wrong",
  "don't", "won't", "can't", "impossible", "stop", "quit",
]);

function getCustomerSentiment(text: string): "positive" | "negative" | "neutral" {
  const words = text.toLowerCase().split(/\s+/);
  let pos = 0, neg = 0;
  for (const w of words) {
    const clean = w.replace(/[^a-z']/g, "");
    if (POSITIVE_WORDS.has(clean)) pos++;
    if (NEGATIVE_WORDS.has(clean)) neg++;
  }
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

interface ConferenceSession {
  id: string;
  conferenceName: string;
  tenantId: string;
  status: "connecting" | "active" | "ended";
  agentId?: string;
  customerNumber: string;
  customerCallSid?: string;
  botCallSid?: string;
  humanCallSid?: string;
  conferenceSid?: string;
  humanJoinedAt?: string;
  botMuted?: boolean;
  botRemovedAt?: string;
  createdAt: string;
  endedAt?: string;
}

interface ActiveAiCall {
  id: string;
  callSid: string;
  tenantId: string;
  to: string;
  from?: string | null;
  direction?: "inbound" | "outbound-api" | "outbound-dial";
  agentId?: string | null;
  status: "ringing" | "in-progress" | "barged" | "ended";
  conferenceName?: string | null;
  bargedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  createdAt: string;
  /** per-call intelligence flags set at dial time (makeTwilioAiCall persists these). */
  aiTranscription?: boolean;
  sentimentAnalysis?: boolean;
  recordingEnabled?: boolean;
}

// Full call record from Twilio API (via /channels/twilio/call-history)
export interface TwilioCallRecord {
  callSid: string;
  to: string;
  from: string;
  status: "queued" | "ringing" | "in-progress" | "completed" | "failed" | "busy" | "no-answer" | "canceled";
  direction: "inbound" | "outbound-api" | "outbound-dial";
  duration: number; // seconds
  startTime: string; // ISO
  endTime: string | null;
  price: string | null;
  priceUnit: string;
  agentId?: string;
  agentName?: string;
  sentiment?: string;
}

interface TranscriptEntry {
  id: string;
  role: "customer" | "bot";
  text: string;
  ts: string;
}

const DIAL_PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const Dialer = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [endingCall, setEndingCall] = useState(false);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [twilioConnected, setTwilioConnected] = useState<boolean | null>(null);
  const [conferenceMode, setConferenceMode] = useState(false);
  const [conferences, setConferences] = useState<ConferenceSession[]>([]);
  const [joiningConf, setJoiningConf] = useState<string | null>(null);
  const [activeConfName, setActiveConfName] = useState<string | null>(null);
  const [showLiveCalls, setShowLiveCalls] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [activeAiCalls, setActiveAiCalls] = useState<ActiveAiCall[]>([]);
  // callSid → AI-Transcription flag, kept after a call ends so the transcript panel keeps showing
  // the "off" state for that call (not just while it's live).
  const [callTranscriptionFlags, setCallTranscriptionFlags] = useState<Record<string, boolean>>({});
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptEntry[]>>({});
  const [bargeingIn, setBargeingIn] = useState<string | null>(null);
  const [bargedCallSid, setBargedCallSid] = useState<string | null>(null);
  const [showLiveAiCalls, setShowLiveAiCalls] = useState(true);
  const [analyticsExpanded, setAnalyticsExpanded] = useState<Record<string, boolean>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [recordingPlayers, setRecordingPlayers] = useState<Record<string, {
    status: "idle" | "loading" | "ready" | "error";
    blobUrl?: string;
  }>>({});

  // ── Stale call threshold ─────────────────────────────────────────────────────
  // Any activeCalls doc older than this is considered stale (missed StatusCallback).
  // Stale calls are hidden from the live queue immediately and swept by the backend on mount.
  const MAX_CALL_AGE_MS = 90 * 60 * 1000; // 90 minutes

  // ── New dashboard state ──────────────────────────────────────────────────────
  const [selectedCallSid, setSelectedCallSid] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<Array<{role: string; text: string; ts: string}>>([]);
  const [todayAnalytics, setTodayAnalytics] = useState<CallAnalyticsDoc[]>([]);
  const [now, setNow] = useState(new Date());
  const [sentimentMap, setSentimentMap] = useState<Record<string, string>>({});
  const [aiTranscription, setAiTranscription] = useState(true);
  const [sentimentEnabled, setSentimentEnabled] = useState(true);
  // Full Twilio call history — all statuses (live + completed + missed etc.)
  const [callHistory, setCallHistory] = useState<TwilioCallRecord[]>([]);
  const [callHistoryLoading, setCallHistoryLoading] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deviceRef = useRef<any>(null);
  const phoneNumberRef = useRef("");
  const confUnsubRef = useRef<(() => void) | null>(null);
  const transcriptUnsubsRef = useRef<Record<string, () => void>>({});
  const transcriptBottomsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const prevAiCallsRef = useRef<ActiveAiCall[]>([]);
  const summaryWatchersRef = useRef<Record<string, () => void>>({});
  const blobUrlsRef = useRef<Record<string, string>>({});
  const [dynRecordings, setDynRecordings] = useState<any[]>([]);

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.organizationId || localStorage.getItem("tenantId") || "";
  const { agents, fetchAgents } = useAgentStore();

  useEffect(() => { if (tenantId) fetchAgents(tenantId); }, [tenantId]);

  // Fetch recordings from DynamoDB (permanent store — survives call doc cleanup)
  const fetchDynRecordings = useCallback(async () => {
    try {
      const res = await authedFetch(`${API_BASE_URL}/channels/twilio/recordings`);
      if (res.ok) setDynRecordings(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    fetchDynRecordings();
    const interval = setInterval(fetchDynRecordings, 30_000);
    return () => clearInterval(interval);
  }, [tenantId, fetchDynRecordings]);

  // Immediately refresh recordings whenever the user selects a call
  useEffect(() => {
    if (selectedCallSid) fetchDynRecordings();
  }, [selectedCallSid, fetchDynRecordings]);

  // Auto-select first active agent once agents load; respect manual selection
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const first = agents.find((a: any) => a.status === "active") ?? agents[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (first) setSelectedAgentId((first as any).id);
    }
  }, [agents]);

  // Load persisted call history
  useEffect(() => {
    try {
      const stored = localStorage.getItem("flyn_recent_calls");
      if (stored) setRecentCalls(JSON.parse(stored) as RecentCall[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { phoneNumberRef.current = phoneNumber; }, [phoneNumber]);

  // Check Twilio connection status
  useEffect(() => {
    authedFetch(`${API_BASE_URL}/channels/twilio/config`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { connected?: boolean } | null) => {
        setTwilioConnected(data?.connected ?? false);
      })
      .catch(() => setTwilioConnected(false));
  }, []);

  // On mount: sweep stale activeCalls in Firestore (missed StatusCallbacks from past sessions).
  // Fire-and-forget — the Firestore listener will auto-exclude cleaned docs.
  useEffect(() => {
    if (!tenantId) return;
    authedFetch(`${API_BASE_URL}/channels/twilio/cleanup-stale`, { method: "POST" })
      .then(r => r.json().catch(() => ({})))
      .then((data: { cleaned?: number }) => {
        if (data?.cleaned && data.cleaned > 0) {
          console.info(`[Dialer] Cleaned up ${data.cleaned} stale call(s)`);
        }
      })
      .catch(() => {}); // non-fatal
  }, [tenantId]);

  // Fetch full Twilio call history on mount + expose a refresh callback
  const fetchCallHistory = () => {
    if (!tenantId) return;
    setCallHistoryLoading(true);
    authedFetch(`${API_BASE_URL}/channels/twilio/call-history?limit=100`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { calls?: TwilioCallRecord[] } | null) => {
        if (data?.calls) setCallHistory(data.calls);
      })
      .catch(() => {})
      .finally(() => setCallHistoryLoading(false));
  };

  useEffect(() => {
    fetchCallHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Firestore real-time listener for active conferences
  useEffect(() => {
    if (!tenantId) return;
    const db = getDb();
    if (!db) return;

    const q = query(
      collection(db, "tenants", tenantId, "conferences"),
      where("status", "in", ["connecting", "active"]),
      limit(20),
    );

    const unsub = onSnapshot(q, snap => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ConferenceSession))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setConferences(sorted);
    }, err => {
      console.warn("Conference listener error:", err);
    });

    confUnsubRef.current = unsub;
    return () => { unsub(); confUnsubRef.current = null; };
  }, [tenantId]);

  // Active-call END sync. The red "End Call" button is driven by activeCallSid, which was previously
  // cleared ONLY by the button — so a hang-up from the PHONE (or the AI) left it stuck "live". Watch
  // the active call's doc: the backend writes status='ended' from EVERY end source (phone via the
  // Twilio StatusCallback, AI hangup, or the button — all funnel through endCall), and that flips
  // the dialer back to idle in real time.
  useEffect(() => {
    if (!activeCallSid || !tenantId) return;
    const db = getDb();
    if (!db) return;
    const unsub = onSnapshot(doc(db, "tenants", tenantId, "activeCalls", activeCallSid), (snap) => {
      const data = snap.data();
      if (data && (data.status === "ended" || data.endedAt)) {
        setActiveCallSid(null);
        setCallStatus("idle");
        const reason = data.endedReason;
        if (reason === "phone") toast({ title: "Call ended", description: "The other person hung up." });
        else if (reason === "ai") toast({ title: "Call ended", description: "The AI ended the call." });
      }
    });
    return () => unsub();
  }, [activeCallSid, tenantId]);

  // Firestore real-time listener for active AI calls + nested transcript listeners
  useEffect(() => {
    if (!tenantId) return;
    const db = getDb();
    if (!db) return;

    const q = query(
      collection(db, "tenants", tenantId, "activeCalls"),
      where("status", "in", ["ringing", "in-progress"]),
      limit(10),
    );

    const unsub = onSnapshot(q, snap => {
      const calls = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ActiveAiCall))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        // Client-side stale guard: hide calls older than MAX_CALL_AGE_MS whose
        // Firestore status was never updated (missed StatusCallback).
        .filter(c => Date.now() - new Date(c.createdAt).getTime() < MAX_CALL_AGE_MS);

      const currentIds = new Set(calls.map(c => c.callSid));
      const disappeared = prevAiCallsRef.current.filter(c => !currentIds.has(c.callSid));
      prevAiCallsRef.current = calls;
      setActiveAiCalls(calls);

      // Remember each call's AI-Transcription flag so the transcript panel can still show
      // "Transcription is off" AFTER the call ends (selectedCallInfo only holds ACTIVE calls).
      setCallTranscriptionFlags(prev => {
        const next = { ...prev };
        for (const c of calls) if (typeof c.aiTranscription === "boolean") next[c.callSid] = c.aiTranscription;
        return next;
      });

      disappeared.forEach(endedCall => {
        const db2 = getDb();
        if (!db2) return;

        setRecentCalls(prev => {
          if (prev.some(c => c.callSid === endedCall.callSid)) return prev;
          const entry: RecentCall = {
            name: endedCall.agentId
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? (agents.find((a: any) => a.id === endedCall.agentId)?.name ?? "AI Call")
              : "AI Call",
            number: endedCall.to,
            time: "Just now",
            type: "outgoing",
            callSid: endedCall.callSid,
          };
          const updated = [entry, ...prev].slice(0, 20);
          try { localStorage.setItem("flyn_recent_calls", JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });

        const callDocRef = doc(db2, "tenants", tenantId, "activeCalls", endedCall.callSid);
        let gotDuration = false;
        let gotSummary = false;
        let gotRecording = false;

        const stopWatcher = () => {
          summaryWatchersRef.current[endedCall.callSid]?.();
          delete summaryWatchersRef.current[endedCall.callSid];
        };

        const unsub2 = onSnapshot(callDocRef, (snap2) => {
          if (!snap2.exists()) return;
          const data = snap2.data();

          if (!gotRecording && data.recordingEnabled === false) gotRecording = true;

          setRecentCalls(prev => prev.map(c => {
            if (c.callSid !== endedCall.callSid) return c;
            const updated = { ...c };
            if (data.durationSeconds != null) updated.durationSeconds = data.durationSeconds as number;
            if (data.callSummary) updated.callSummary = data.callSummary as CallSummary;
            if (data.followUpSent) updated.followUpSent = true;
            if (data.recordingSid) updated.recordingSid = data.recordingSid as string;
            if (data.recordingDuration != null) updated.recordingDuration = data.recordingDuration as number;
            if (data.recordingStoragePath) updated.recordingStoragePath = data.recordingStoragePath as string;
            return updated;
          }));

          if (data.durationSeconds != null) gotDuration = true;
          if (data.callSummary) gotSummary = true;
          if (data.recordingSid || data.recordingEnabled === false) gotRecording = true;
          if (data.recordingSid) setTimeout(fetchDynRecordings, 5000); // pull DynamoDB row after S3 archive completes

          if (gotDuration && gotSummary && gotRecording) stopWatcher();
        }, () => { /* non-fatal */ });

        summaryWatchersRef.current[endedCall.callSid] = unsub2;
        setTimeout(stopWatcher, 120_000);
      });

      calls.forEach(call => {
        if (!transcriptUnsubsRef.current[call.callSid]) {
          const tq = query(
            collection(db, "tenants", tenantId, "activeCalls", call.callSid, "transcript"),
            orderBy("ts", "asc"),
            limit(200),
          );
          transcriptUnsubsRef.current[call.callSid] = onSnapshot(tq, tSnap => {
            const entries = tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TranscriptEntry));
            setTranscripts(prev => ({ ...prev, [call.callSid]: entries }));
            setTimeout(() => {
              // Scroll only the transcript container, never the page.
              const el = transcriptBottomsRef.current[call.callSid]?.parentElement;
              if (el) el.scrollTop = el.scrollHeight;
            }, 50);
          }, () => { /* ignore transcript errors */ });
        }
      });

      const activeIds = new Set(calls.map(c => c.callSid));
      Object.keys(transcriptUnsubsRef.current).forEach(sid => {
        if (!activeIds.has(sid)) {
          transcriptUnsubsRef.current[sid]?.();
          delete transcriptUnsubsRef.current[sid];
        }
      });
    }, err => console.warn("ActiveCalls listener error:", err));

    return () => {
      unsub();
      Object.values(transcriptUnsubsRef.current).forEach(u => u());
      transcriptUnsubsRef.current = {};
      Object.values(summaryWatchersRef.current).forEach(u => u());
      summaryWatchersRef.current = {};
    };
  }, [tenantId]);

  // Cleanup Twilio Device + blob URLs on unmount
  useEffect(() => {
    return () => {
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch { /* ignore */ }
        deviceRef.current = null;
      }
      Object.values(blobUrlsRef.current).forEach(url => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      });
    };
  }, []);

  // ── 1-second ticker for live timers ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Today's callAnalytics listener ──────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const db = getDb();
    if (!db) return;
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "tenants", tenantId, "callAnalytics"),
      where("persistedAt", ">=", todayMidnight.toISOString()),
      orderBy("persistedAt", "desc"),
      limit(100),
    );
    return onSnapshot(q, snap => {
      setTodayAnalytics(snap.docs.map(d => ({ id: d.id, ...d.data() } as CallAnalyticsDoc)));
    }, () => {});
  }, [tenantId]);

  // ── sentimentMap — subscribe to activeCalls aggregate docs ──────────────────
  useEffect(() => {
    if (!tenantId || activeAiCalls.length === 0) return;
    const db = getDb();
    if (!db) return;
    const unsubs = activeAiCalls.map(call =>
      onSnapshot(
        doc(db, "tenants", tenantId, "activeCalls", call.callSid),
        snap => {
          if (snap.exists()) {
            setSentimentMap(prev => ({
              ...prev,
              [call.callSid]: (snap.data()?.overallSentiment as string) ?? "neutral",
            }));
          }
        },
      ),
    );
    return () => unsubs.forEach(u => u());
  }, [tenantId, activeAiCalls]);

  // ── Selected call transcript listener ───────────────────────────────────────
  useEffect(() => {
    if (!selectedCallSid || !tenantId) return;
    const db = getDb();
    if (!db) return;
    const q = query(
      collection(db, "tenants", tenantId, "activeCalls", selectedCallSid, "transcript"),
      orderBy("ts", "asc"),
    );
    return onSnapshot(q, snap => {
      setSelectedTranscript(snap.docs.map(d => d.data() as {role: string; text: string; ts: string}));
    }, () => {});
  }, [selectedCallSid, tenantId]);

  // ── Auto-select first live call ──────────────────────────────────────────────
  useEffect(() => {
    if (activeAiCalls.length > 0 && !selectedCallSid) {
      setSelectedCallSid(activeAiCalls[0].callSid);
    }
  }, [activeAiCalls]);

  // Play recording — use S3 pre-signed URL (from DynamoDB) when available, else backend proxy
  const handlePlayRecording = async (recordingSid: string) => {
    const existing = recordingPlayers[recordingSid];
    if (existing?.status === "ready" || existing?.status === "loading") return;

    setRecordingPlayers(prev => ({ ...prev, [recordingSid]: { status: "loading" } }));
    try {
      // Check DynamoDB row for S3 audioUrl first (permanent)
      const dynRow = dynRecordings.find(r => r.recordingSid === recordingSid);
      let blob: Blob;
      if (dynRow?.audioUrl) {
        const r = await fetch(dynRow.audioUrl);
        if (!r.ok) throw new Error(`S3 fetch ${r.status}`);
        blob = await r.blob();
      } else {
        const r = await authedFetch(`${API_BASE_URL}/channels/twilio/recording/${recordingSid}/stream`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        blob = await r.blob();
      }
      const blobUrl = URL.createObjectURL(blob);
      blobUrlsRef.current[recordingSid] = blobUrl;
      setRecordingPlayers(prev => ({ ...prev, [recordingSid]: { status: "ready", blobUrl } }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Recording] Failed to load ${recordingSid}:`, msg);
      setRecordingPlayers(prev => ({ ...prev, [recordingSid]: { status: "error" } }));
    }
  };

  const handleStartCall = async () => {
    if (!phoneNumber) return;
    setCallStatus("connecting");
    phoneNumberRef.current = phoneNumber;

    try {
      if (conferenceMode) {
        const res = await authedFetch(`${API_BASE_URL}/channels/twilio/conference`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: phoneNumber, ...(selectedAgentId ? { agentId: selectedAgentId } : {}) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || (isRecord(data) && data.success === false)) {
          const msg = isRecord(data) && typeof data.message === "string" ? data.message
            : isRecord(data) && typeof data.error === "string" ? data.error
            : "Could not start conference.";
          toast({ variant: "destructive", title: "Conference failed", description: msg });
          return;
        }
        toast({ title: "Conference started", description: `Dialing ${phoneNumber} into conference room.` });
        setShowLiveCalls(true);
      } else {
        const res = await authedFetch(`${API_BASE_URL}/channels/twilio/ai-call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: phoneNumber,
            ...(selectedAgentId ? { agentId: selectedAgentId } : {}),
            recordingEnabled,
            aiTranscription,
            // Sentiment needs the transcript it analyzes — never send it on without transcription.
            sentimentAnalysis: aiTranscription && sentimentEnabled,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || (isRecord(data) && data.success === false)) {
          const msg = isRecord(data) && typeof data.message === "string" ? data.message
            : isRecord(data) && typeof data.error === "string" ? data.error
            : "Could not initiate call.";
          toast({ variant: "destructive", title: "Call failed", description: msg });
          return;
        }
        toast({ title: "Call initiated", description: `Twilio is dialing ${phoneNumber} now.` });
        if (isRecord(data) && typeof data.callSid === "string") {
          setActiveCallSid(data.callSid);
        }
        setRecentCalls(prev => {
          const entry: RecentCall = { name: "Outbound Call", number: phoneNumberRef.current, time: "Just now", type: "outgoing" };
          const updated = [entry, ...prev].slice(0, 20);
          try { localStorage.setItem("flyn_recent_calls", JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
      }
    } catch (err: unknown) {
      const msg = isRecord(err) && typeof err.message === "string" ? err.message : "Network error.";
      toast({ variant: "destructive", title: "Call failed", description: msg });
    } finally {
      setCallStatus("idle");
    }
  };

  const handleJoinConference = async (confName: string) => {
    if (activeConfName) {
      toast({ variant: "destructive", title: "Already in a call", description: "Leave the current conference before joining another." });
      return;
    }
    setJoiningConf(confName);
    try {
      const res = await authedFetch(`${API_BASE_URL}/channels/twilio/conference/${confName}/token`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        toast({ variant: "destructive", title: "Token error", description: "Could not get conference access token." });
        return;
      }

      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(data.token, { logLevel: 1 });
      await device.register();
      deviceRef.current = device;

      const call = await device.connect({ params: { conf: confName, tenantId: tenantId ?? "" } });
      setActiveConfName(confName);
      toast({ title: "Joined conference", description: "You are now live in the conference." });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      call.on("disconnect", () => {
        setActiveConfName(null);
        deviceRef.current = null;
      });
    } catch (err: unknown) {
      if (isStaleChunkError(err)) {
        toast({ title: "Updating Flyn…", description: "A new version was just released — refreshing to update." });
        reloadForStaleChunkOnce();
        return;
      }
      const msg = isRecord(err) && typeof (err as Record<string, unknown>).message === "string"
        ? (err as Record<string, unknown>).message as string
        : "Could not join conference.";
      toast({ variant: "destructive", title: "Join failed", description: msg });
    } finally {
      setJoiningConf(null);
    }
  };

  const handleLeaveConference = () => {
    if (deviceRef.current) {
      try { deviceRef.current.disconnectAll(); deviceRef.current.destroy(); } catch { /* ignore */ }
      deviceRef.current = null;
    }
    setActiveConfName(null);
  };

  const handleMuteBot = async (confName: string) => {
    setActionLoading(`mute-${confName}`);
    try {
      await authedFetch(`${API_BASE_URL}/channels/twilio/conference/${confName}/mute-bot`, { method: "POST" });
      toast({ title: "Bot muted" });
    } catch {
      toast({ variant: "destructive", title: "Mute failed" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveBot = async (confName: string) => {
    setActionLoading(`remove-${confName}`);
    try {
      await authedFetch(`${API_BASE_URL}/channels/twilio/conference/${confName}/remove-bot`, { method: "POST" });
      toast({ title: "Bot removed" });
    } catch {
      toast({ variant: "destructive", title: "Remove failed" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndConference = async (confName: string) => {
    setActionLoading(`end-${confName}`);
    try {
      if (activeConfName === confName) handleLeaveConference();
      await authedFetch(`${API_BASE_URL}/channels/twilio/conference/${confName}/end`, { method: "POST" });
      toast({ title: "Conference ended" });
    } catch {
      toast({ variant: "destructive", title: "End failed" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndCall = async () => {
    if (!activeCallSid) return;
    setEndingCall(true);
    try {
      await authedFetch(`${API_BASE_URL}/channels/twilio/call/${activeCallSid}/cancel`, { method: "POST" });
      toast({ title: "Call ended", description: "Twilio call terminated. Billing stopped." });
      setActiveCallSid(null);
    } catch {
      toast({ variant: "destructive", title: "Could not end call", description: "Try again or check Twilio console." });
    } finally {
      setEndingCall(false);
    }
  };

  const handleBargeIn = async (callSid: string) => {
    setBargeingIn(callSid);
    try {
      const res = await authedFetch(`${API_BASE_URL}/channels/twilio/call/${callSid}/barge`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !isRecord(data) || !data.token) {
        const msg = isRecord(data) && typeof data.message === "string" ? data.message : "Could not barge in.";
        toast({ variant: "destructive", title: "Barge-in failed", description: msg });
        return;
      }
      // Barge-in needs the MICROPHONE — your voice goes to the customer. Request it UP FRONT so a
      // blocked/denied mic shows a clear message, instead of Twilio acquiring no input audio and
      // silently disconnecting the call (error 31401 — "no error, just silence").
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop()); // release immediately; Twilio re-acquires on connect
      } catch {
        toast({
          variant: "destructive",
          title: "Microphone blocked",
          description: "Allow microphone access (click the 🎤 in the address bar), then barge in again.",
        });
        return;
      }

      const { Device } = await import("@twilio/voice-sdk");
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch { /* ignore */ }
      }
      const device = new Device(data.token as string, { logLevel: 1 });
      await device.register();
      deviceRef.current = device;

      const call = await device.connect({ params: { conf: data.conferenceName as string, tenantId: tenantId ?? "" } });
      setBargedCallSid(callSid);
      toast({ title: "Barged in!", description: "You are now live with the customer. Bot loop stopped." });

      call.on("disconnect", () => {
        setBargedCallSid(null);
        deviceRef.current = null;
      });

      // Surface call errors that fire AFTER connect — chiefly 31401 (mic permission). Without this
      // the call dies in silence with no feedback.
      call.on("error", (e: { code?: number; message?: string }) => {
        const micDenied = e?.code === 31401 || /permission|denied|user media|audio/i.test(e?.message || "");
        toast({
          variant: "destructive",
          title: micDenied ? "Microphone blocked" : "Barge-in dropped",
          description: micDenied
            ? "Your mic is blocked — allow microphone access for this site, then try again."
            : (e?.message || "The barge-in call errored."),
        });
        setBargedCallSid(null);
        deviceRef.current = null;
      });
    } catch (err: unknown) {
      // A stale Twilio SDK chunk (old tab after a redeploy) → not a real barge-in failure; reload
      // to the fresh bundle instead of a cryptic "contact support".
      if (isStaleChunkError(err)) {
        toast({ title: "Updating Flyn…", description: "A new version was just released — refreshing to update." });
        reloadForStaleChunkOnce();
        return;
      }
      const msg = isRecord(err) && typeof (err as Record<string, unknown>).message === "string"
        ? (err as Record<string, unknown>).message as string : "Could not barge in.";
      toast({ variant: "destructive", title: "Barge-in failed", description: msg });
    } finally {
      setBargeingIn(null);
    }
  };

  const handleLeaveBargedCall = () => {
    if (deviceRef.current) {
      try { deviceRef.current.disconnectAll(); deviceRef.current.destroy(); } catch { /* ignore */ }
      deviceRef.current = null;
    }
    setBargedCallSid(null);
  };

  const handleDial = (digit: string) => setPhoneNumber(p => p + digit);
  const handleCallRecent = (call: RecentCall) => setPhoneNumber(call.number.replace(/[^\d+]/g, ""));
  const isConnecting = callStatus === "connecting";
  const activeLiveCalls = conferences.filter(c => c.status === "connecting" || c.status === "active");

  // ── Helper functions ─────────────────────────────────────────────────────────
  function isTodayISO(isoString: string | undefined | null): boolean {
    if (!isoString) return false;
    const d = new Date(isoString);
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }

  function formatDuration(startedAt: string | undefined, nowDate: Date): string {
    if (!startedAt) return "0:00";
    const secs = Math.max(0, Math.floor((nowDate.getTime() - new Date(startedAt).getTime()) / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }

  function formatSeconds(secs: number): string {
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }

  // ── Computed values (derived from Twilio call history for accuracy) ──────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const todayHistory = useMemo(
    () => callHistory.filter(c => isTodayISO(c.startTime)),
    [callHistory],
  );
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const todayCallsCount = useMemo(
    () => (callHistory.length > 0 ? todayHistory.length : recentCalls.length),
    [callHistory, todayHistory, recentCalls],
  );
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const avgHandleTime = useMemo(() => {
    const completed = todayHistory.filter(c => c.status === "completed" && c.duration > 0);
    if (!completed.length) {
      // Fallback to recentCalls if Twilio history not loaded yet
      const rc = recentCalls.filter(c => c.durationSeconds && c.durationSeconds > 0);
      if (!rc.length) return "0:00";
      const avg = rc.reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / rc.length;
      return formatSeconds(Math.round(avg));
    }
    const avg = completed.reduce((s, c) => s + c.duration, 0) / completed.length;
    return formatSeconds(Math.round(avg));
  }, [todayHistory, recentCalls]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const aiResolvedPct = useMemo(() => {
    if (!todayHistory.length) return 0;
    const completed = todayHistory.filter(c => c.status === "completed").length;
    return Math.round((completed / todayHistory.length) * 100);
  }, [todayHistory]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const missedCallsToday = useMemo(
    () => todayHistory.filter(c => c.status === "no-answer" || c.status === "busy").length,
    [todayHistory],
  );
  const activeCallAgentIds = activeAiCalls.map(c => c.agentId).filter((id): id is string => !!id);
  const activeInboundCall = activeAiCalls.find(c => c.direction === "inbound") ?? null;
  const firstLiveCall = activeAiCalls[0] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstLiveAgentName = agents.find((a: any) => a.id === firstLiveCall?.agentId)?.name ?? "AI Agent";
  const firstLiveSentiment = sentimentMap[firstLiveCall?.callSid ?? ""] ?? "neutral";
  const selectedCallInfo = activeAiCalls.find(c => c.callSid === selectedCallSid) ?? null;
  // Historical call selected (from Twilio history, not live)
  const selectedHistoricalCall = callHistory.find(c => c.callSid === selectedCallSid) ?? null;
  const selectedAgentName =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agents.find((a: any) => a.id === (selectedCallInfo?.agentId ?? selectedHistoricalCall?.agentId))?.name ?? "AI Agent";

  return (
    <AppLayout>
      <div
        className="flex flex-col bg-background"
        style={{ minHeight: "100vh", margin: "-24px", padding: 0 }}
      >
        {/* PAGE HEADER */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-card border-border"
        >
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-foreground">
              Dialer & Call Center
            </h1>
            <span
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                background: "rgba(34,197,94,0.12)",
                color: "#22C55E",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              System Online · {activeAiCalls.length + activeLiveCalls.length} Live Calls
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-muted border-border text-muted-foreground hover:bg-muted/80 transition-colors"
              onClick={() => navigate("/automations")}
            >
              Workflow Builder
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-muted border-border text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              Call History
            </button>
          </div>
        </div>

        {/* BODY: TWO COLUMN (desktop) / MOBILE OPTIMIZED */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT COLUMN - HIDDEN ON MOBILE */}
          <div
            className="hidden md:flex md:w-[360px] shrink-0 flex-col gap-3 p-4 overflow-y-auto border-r bg-card border-border"
          >
            {/* MANUAL DIALER CARD */}
            <div
              className="rounded-xl p-4 bg-muted/40 border border-border"
            >
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-3 text-muted-foreground"
              >
                Manual Dialer
              </p>

              {/* Call intelligence toggles. Sentiment depends on Transcription (it analyzes the
                  transcript) — when Transcription is off, Sentiment is forced off + disabled. */}
              {([
                { label: "Record Call", hint: "", stateVal: recordingEnabled, setter: setRecordingEnabled, disabled: false },
                { label: "AI Transcription", hint: "", stateVal: aiTranscription, setter: setAiTranscription, disabled: false },
                { label: "Sentiment Analysis", hint: "Needs AI Transcription", stateVal: sentimentEnabled && aiTranscription, setter: setSentimentEnabled, disabled: !aiTranscription },
              ] as Array<{ label: string; hint: string; stateVal: boolean; setter: (v: boolean) => void; disabled: boolean }>).map(({ label, hint, stateVal, setter, disabled }) => (
                <div key={label} className="flex items-center justify-between mb-3">
                  <span className={`text-sm ${disabled ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                    {label}
                    {disabled && hint && <span className="block text-[10px] text-muted-foreground/40">{hint}</span>}
                  </span>
                  <button
                    onClick={() => { if (!disabled) setter(!stateVal); }}
                    disabled={disabled}
                    className="w-10 h-5 rounded-full transition-all relative shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: stateVal ? "#7C6FF7" : "hsl(var(--muted-foreground) / 0.3)" }}
                  >
                    <span
                      className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all shadow"
                      style={{ left: stateVal ? "calc(100% - 18px)" : "2px" }}
                    />
                  </button>
                </div>
              ))}

              {/* Phone input — leading "+" button for international numbers */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => handleDial("+")}
                  disabled={isConnecting}
                  title="Add + for international dialing"
                  className="shrink-0 w-11 rounded-lg text-base font-semibold transition-colors hover:opacity-80 disabled:opacity-40 bg-background border border-border text-foreground"
                >
                  +
                </button>
                <input
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="Enter phone number"
                  className="flex-1 min-w-0 rounded-lg px-3 py-2.5 text-sm outline-none font-mono bg-background border border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {/* Dial pad */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {DIAL_PAD.map(digit => (
                  <button
                    key={digit}
                    onClick={() => handleDial(digit)}
                    disabled={isConnecting}
                    className="h-11 rounded-lg text-base font-medium transition-colors hover:opacity-80 disabled:opacity-40 bg-background border border-border text-foreground"
                  >
                    {digit}
                  </button>
                ))}
              </div>

              {/* Agent selector */}
              {agents.length > 0 && (
                <select
                  value={selectedAgentId ?? ""}
                  onChange={e => setSelectedAgentId(e.target.value || null)}
                  className="w-full rounded-lg px-3 py-2 text-sm mb-3 outline-none bg-background border border-border text-foreground"
                >
                  <option value="">No agent (generic AI)</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {agents.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}

              {/* Call button */}
              <button
                onClick={handleStartCall}
                disabled={!phoneNumber || isConnecting || !twilioConnected}
                className="w-full h-12 rounded-xl font-semibold text-white mb-2 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
              >
                {isConnecting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Calling…</>
                ) : (
                  <><Phone className="w-4 h-4" /> Call</>
                )}
              </button>

              {activeCallSid && (
                <button
                  onClick={handleEndCall}
                  disabled={endingCall}
                  className="w-full h-10 rounded-xl font-medium text-white transition-opacity disabled:opacity-40"
                  style={{ background: "#EF4444" }}
                >
                  {endingCall ? "Ending…" : "✕ End Call"}
                </button>
              )}
            </div>

            {/* INBOUND AI RECEPTIONIST */}
            <InboundReceptionistCard
              tenantId={tenantId ?? ""}
              agents={agents}
              activeInboundCall={activeInboundCall}
              transcript={activeInboundCall ? (transcripts[activeInboundCall.callSid] ?? []) : []}
              sentimentMap={sentimentMap}
              onBarge={handleBargeIn}
              bargeingIn={bargeingIn}
              bargedCallSid={bargedCallSid}
              now={now}
            />

          </div>

          {/* RIGHT COLUMN - MOBILE OPTIMIZED */}
          <div className="flex-1 overflow-y-auto md:p-5 md:space-y-4 flex flex-col md:block">

            {/* MOBILE: DIAL PAD + ACTIVE CALLS (PRIMARY) */}
            <div className="md:hidden flex flex-col flex-1 p-4 space-y-4 pb-20">

              {/* Active call banner - PROMINENT ON MOBILE */}
              {activeCallSid && (
                <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-500/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-400 mb-2">ACTIVE CALL</p>
                  <p className="text-lg font-bold text-white">{phoneNumber}</p>
                  <p className="text-xs text-green-400/70 mt-1">Connected</p>
                </div>
              )}

              {/* Manual dialer card - MOBILE OPTIMIZED */}
              <div className="rounded-xl p-4 bg-muted/40 border border-border">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3 text-muted-foreground">Manual Dialer</p>

                {/* Phone input */}
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => handleDial("+")}
                    disabled={isConnecting}
                    className="shrink-0 w-12 h-12 rounded-lg text-base font-semibold transition-colors hover:opacity-80 disabled:opacity-40 bg-background border border-border text-foreground"
                  >
                    +
                  </button>
                  <input
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="Enter phone number"
                    className="flex-1 min-w-0 rounded-lg px-3 py-3 text-sm outline-none font-mono bg-background border border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {/* Dial pad - TOUCH-FRIENDLY */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {DIAL_PAD.map(digit => (
                    <button
                      key={digit}
                      onClick={() => handleDial(digit)}
                      disabled={isConnecting}
                      className="h-16 rounded-lg text-xl font-semibold transition-colors hover:opacity-80 disabled:opacity-40 bg-background border border-border text-foreground active:bg-muted"
                    >
                      {digit}
                    </button>
                  ))}
                </div>

                {/* Call button - LARGE ON MOBILE */}
                <button
                  onClick={handleStartCall}
                  disabled={!phoneNumber || isConnecting || !twilioConnected}
                  className="w-full h-14 rounded-xl font-semibold text-white mb-2 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 text-base"
                  style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
                >
                  {isConnecting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Calling…</>
                  ) : (
                    <><Phone className="w-5 h-5" /> Call</>
                  )}
                </button>

                {activeCallSid && (
                  <button
                    onClick={handleEndCall}
                    disabled={endingCall}
                    className="w-full h-12 rounded-xl font-medium text-white transition-opacity disabled:opacity-40"
                    style={{ background: "#EF4444" }}
                  >
                    {endingCall ? "Ending…" : "✕ End Call"}
                  </button>
                )}
              </div>

              {/* Active calls list on mobile */}
              {activeAiCalls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Live Calls ({activeAiCalls.length})</p>
                  {activeAiCalls.map(call => (
                    <div key={call.callSid} className="p-3 rounded-lg bg-muted/40 border border-border/50">
                      <p className="text-sm font-medium text-foreground">{call.to}</p>
                      <p className="text-xs text-muted-foreground mt-1">{call.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DESKTOP: STATS + ANALYTICS (SECONDARY) */}
            <div className="hidden md:block space-y-4">
            {/* Stats bar */}
            <CallCenterStatsBar
              liveCalls={activeAiCalls.length + activeLiveCalls.length}
              todayCalls={todayCallsCount}
              avgHandleTime={avgHandleTime}
              aiResolvedPct={aiResolvedPct}
              missedCalls={missedCallsToday}
            />

            {/* Active call banner */}
            <ActiveCallBanner
              call={firstLiveCall}
              agentName={firstLiveAgentName}
              sentiment={firstLiveSentiment}
              durationStr={formatDuration(firstLiveCall?.createdAt, now)}
              onEnd={() => { if (firstLiveCall) { void handleEndCall(); } }}
              onBarge={() => { if (firstLiveCall) { void handleBargeIn(firstLiveCall.callSid); } }}
            />

            {/* Call Outreach + transcript */}
            <div className="grid grid-cols-2 gap-4">
              <LiveCallQueueCard
                liveCalls={activeAiCalls}
                callHistory={callHistory}
                callHistoryLoading={callHistoryLoading}
                onRefreshHistory={fetchCallHistory}
                agents={agents}
                now={now}
                selectedCallSid={selectedCallSid}
                onSelect={setSelectedCallSid}
                onBarge={handleBargeIn}
                sentimentMap={sentimentMap}
                bargeingIn={bargeingIn}
                bargedCallSid={bargedCallSid}
              />
              <LiveTranscriptCard
                transcript={selectedTranscript}
                callerName={selectedCallInfo?.to ?? selectedHistoricalCall?.to ?? ""}
                isLive={!!selectedCallInfo}
                transcriptionOff={selectedCallSid ? callTranscriptionFlags[selectedCallSid] === false : selectedCallInfo?.aiTranscription === false}
                recordingCalls={(() => {
                  const dynRows = dynRecordings.map(r => ({
                    name: r.callerPhone || "Unknown",
                    number: r.callerPhone || "",
                    time: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
                    type: "outgoing" as const,
                    durationSeconds: r.durationSecs || 0,
                    callSid: r.callSid,
                    recordingSid: r.recordingSid,
                    recordingDuration: r.durationSecs || 0,
                  }));
                  const liveRows = recentCalls.filter(c => !!c.recordingSid && !dynRows.find(d => d.recordingSid === c.recordingSid));
                  const all = [...liveRows, ...dynRows];
                  // Show only the selected call's recording; fall back to all if none matched
                  if (selectedCallSid) {
                    const filtered = all.filter(r => r.callSid === selectedCallSid);
                    return filtered.length > 0 ? filtered : all;
                  }
                  return all;
                })()}
                onPlayRecording={handlePlayRecording}
                recordingPlayers={recordingPlayers}
              />
            </div>

            {/* Call Analytics Panel — expands below queue when a call is selected */}
            {selectedCallSid && tenantId && (
              <CallAnalyticsPanel
                callSid={selectedCallSid}
                tenantId={tenantId}
                agentName={selectedAgentName}
                isLive={!!selectedCallInfo}
              />
            )}

            {/* QA + Leaderboard */}
            <div className="grid grid-cols-2 gap-4">
              <QualityScoresCard docs={todayAnalytics} />
              <AgentLeaderboardCard docs={todayAnalytics} agents={agents} />
            </div>

            {/* Call Intelligence — full width */}
            <CallIntelligenceCard />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("telephony.ui")(Dialer);
