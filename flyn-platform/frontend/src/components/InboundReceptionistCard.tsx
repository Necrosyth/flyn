import React, { useState, useEffect, useRef } from "react";
import { PhoneIncoming, Loader2, Check, Mic } from "lucide-react";
import { voiceProvisioning } from "@/services/voiceProvisioning";

interface TwilioPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
}

interface ActiveInboundCall {
  callSid: string;
  to: string;
  from?: string | null;
  direction?: string;
  agentId?: string | null;
  status: string;
  createdAt: string;
}

interface TranscriptEntry {
  id: string;
  role: "customer" | "bot";
  text: string;
  ts: string;
}

interface InboundReceptionistCardProps {
  tenantId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agents: any[];
  activeInboundCall: ActiveInboundCall | null;
  transcript: TranscriptEntry[];
  sentimentMap: Record<string, string>;
  onBarge: (callSid: string) => void;
  bargeingIn: string | null;
  bargedCallSid: string | null;
  now: Date;
}

function formatDur(startedAt: string, now: Date): string {
  const secs = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "#22C55E",
  neutral: "#60A5FA",
  negative: "#EF4444",
  frustrated: "#F59E0B",
};

const Waveform: React.FC = () => {
  const heights = [4, 10, 16, 8, 20, 12, 18, 6, 14, 10, 18, 8, 14, 10, 6];
  return (
    <svg width="130" height="28" viewBox="0 0 130 28" fill="none" aria-hidden="true">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 9}
          y={(28 - h) / 2}
          width="5"
          height={h}
          rx="2.5"
          fill="#7C6FF7"
          opacity="0.7"
          style={{
            animation: `wave ${0.8 + (i % 4) * 0.2}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
      <style>{`@keyframes wave { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }`}</style>
    </svg>
  );
};

export const InboundReceptionistCard: React.FC<InboundReceptionistCardProps> = ({
  tenantId,
  agents,
  activeInboundCall,
  transcript,
  sentimentMap,
  onBarge,
  bargeingIn,
  bargedCallSid,
  now,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedPhoneSid, setSelectedPhoneSid] = useState<string>("");
  const [phoneNumbers, setPhoneNumbers] = useState<TwilioPhoneNumber[]>([]);
  const [phonesLoading, setPhonesLoading] = useState(false);
  const [phonesError, setPhonesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isActive, setIsActive] = useState(false);
  // Last-persisted selection, used to detect unsaved changes (dirty state).
  const [savedAgentId, setSavedAgentId] = useState<string>("");
  const [savedNumber, setSavedNumber] = useState<string>("");
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  const dirty = selectedAgentId !== savedAgentId || selectedPhoneSid !== savedNumber;

  // Numbers come from the tenant's Flyn Voice allocation (platform-managed),
  // NOT the old BYO Twilio account. Only the tenant's own number(s) are shown.
  const fetchPhoneNumbers = () => {
    if (!tenantId) return;
    setPhonesLoading(true);
    setPhonesError(null);
    voiceProvisioning
      .listNumbers()
      .then(({ numbers }) => {
        const mapped = numbers.map((n) => ({
          sid: n.twilioSid,
          phoneNumber: n.number,
          friendlyName: n.billable ? "Flyn Voice (paid)" : "Flyn Voice (free)",
        }));
        setPhoneNumbers(mapped);
        // Prefill the bound agent + selected number from the allocation.
        const bound = numbers.find((n) => n.agentId);
        const initialNumber = bound?.number ?? mapped[0]?.phoneNumber ?? "";
        if (bound) {
          setSelectedAgentId((prev) => prev || (bound.agentId as string));
          setSavedAgentId(bound.agentId as string);
          setIsActive(true);
        }
        setSelectedPhoneSid((prev) => prev || initialNumber);
        if (bound) setSavedNumber(bound.number);
      })
      .catch((err: Error) => setPhonesError(err.message))
      .finally(() => {
        setPhonesLoading(false);
        setConfigLoaded(true);
      });
  };
  useEffect(fetchPhoneNumbers, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Scroll only the transcript container — not the whole page (scrollIntoView
    // would scroll every scrollable ancestor, yanking the page down on each line).
    const el = transcriptBottomRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const handleSave = async () => {
    if (!selectedAgentId || !selectedPhoneSid) return;
    setSaving(true);
    try {
      // Bind the chosen Flyn Voice number's inbound calls to the selected agent
      // (configures the webhook on the platform Twilio account → channels AI flow).
      await voiceProvisioning.setNumberAgent(selectedPhoneSid, selectedAgentId);
      setIsActive(true);
      setSavedAgentId(selectedAgentId);
      setSavedNumber(selectedPhoneSid);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const activeAgent = agents.find((a: any) => a.id === selectedAgentId);
  const liveAgent = agents.find((a: any) => a.id === activeInboundCall?.agentId);
  const callSentiment = activeInboundCall ? (sentimentMap[activeInboundCall.callSid] ?? "neutral") : "neutral";
  const sentColor = SENTIMENT_COLOR[callSentiment] ?? "#60A5FA";
  const isBarging = activeInboundCall ? bargeingIn === activeInboundCall.callSid : false;
  const isBarged = activeInboundCall ? bargedCallSid === activeInboundCall.callSid : false;

  // ── LIVE CALL VIEW ──────────────────────────────────────────────────────────
  if (activeInboundCall) {
    const callerNumber = activeInboundCall.to;
    const agentName = liveAgent?.name ?? "AI Agent";
    const agentInitials = agentName.split(" ").map((w: string) => w[0] ?? "").slice(0, 2).join("").toUpperCase();
    const lastTurns = transcript.slice(-6);

    return (
      <div className="rounded-xl overflow-hidden flex flex-col bg-card border border-primary/40">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary/8 border-b border-primary/20">
          <div className="flex items-center gap-2">
            <PhoneIncoming className="w-4 h-4 text-primary" />
            <p className="text-sm font-bold text-foreground">AI Voice Console</p>
          </div>
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full font-bold animate-pulse text-white"
            style={{ background: "#7C6FF7" }}
          >
            IN CALL
          </span>
        </div>

        {/* Agent + caller info */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
            style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
          >
            {agentInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">{agentName}</p>
            <p className="text-[11px] font-mono truncate text-muted-foreground">{callerNumber}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-mono font-bold text-foreground">
              {formatDur(activeInboundCall.createdAt, now)}
            </p>
            <p className="text-[11px] font-semibold" style={{ color: sentColor }}>
              {callSentiment.charAt(0).toUpperCase() + callSentiment.slice(1)}
            </p>
          </div>
        </div>

        {/* Live transcript */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Live Transcript
          </p>
          <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 160 }}>
            {lastTurns.length === 0 ? (
              <p className="text-xs text-muted-foreground/50">Waiting for speech…</p>
            ) : (
              lastTurns.map(entry => (
                <div
                  key={entry.id}
                  className={`flex ${entry.role === "bot" ? "justify-end" : "justify-start"}`}
                >
                  {entry.role === "customer" && (
                    <p className="text-[10px] font-medium mr-1.5 mt-1 shrink-0 text-muted-foreground">
                      Caller
                    </p>
                  )}
                  <div
                    className={`rounded-xl px-3 py-2 max-w-[85%] text-xs leading-relaxed ${entry.role !== "bot" ? "bg-muted border border-border text-foreground" : "text-white"}`}
                    style={entry.role === "bot" ? { background: "#7C6FF7" } : undefined}
                  >
                    {entry.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptBottomRef} />
          </div>
        </div>

        {/* Waveform */}
        <div className="flex justify-center py-2">
          <Waveform />
        </div>

        {/* Barge button */}
        <div className="px-4 pb-3">
          {isBarged ? (
            <div
              className="w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold"
              style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)" }}
            >
              <Mic className="w-3.5 h-3.5" /> You are live
            </div>
          ) : (
            <button
              onClick={() => onBarge(activeInboundCall.callSid)}
              disabled={isBarging || !!bargedCallSid}
              className="w-full h-9 rounded-lg font-semibold text-xs text-white transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
            >
              {isBarging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
              {isBarging ? "Joining…" : "Barge In"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── CONFIG VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3 bg-muted/40 border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhoneIncoming className="w-4 h-4 text-primary" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            AI Receptionist
          </p>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={
            isActive
              ? { background: "rgba(34,197,94,0.15)", color: "#22C55E" }
              : undefined
          }
        >
          {isActive ? (
            <span style={{ color: "#22C55E" }}>● Active</span>
          ) : (
            <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Not Configured</span>
          )}
        </span>
      </div>

      {/* Current active agent display */}
      {isActive && activeAgent && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "rgba(124,111,247,0.08)", border: "1px solid rgba(124,111,247,0.2)" }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 text-white"
            style={{ background: "linear-gradient(135deg, #7C6FF7, #534AB7)" }}
          >
            {activeAgent.name?.split(" ").map((w: string) => w[0] ?? "").slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate text-foreground">{activeAgent.name}</p>
            <p className="text-[10px] text-primary">Handling all inbound calls</p>
          </div>
        </div>
      )}

      {/* Agent select */}
      {configLoaded && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground">
            Select Agent
          </label>
          <select
            value={selectedAgentId}
            onChange={e => setSelectedAgentId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none bg-background border border-border text-foreground"
          >
            <option value="">Choose an agent…</option>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {agents.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Phone number dropdown */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">
          Receive calls on
        </label>
        {phonesLoading ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading numbers…</span>
          </div>
        ) : phonesError ? (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-red-500/20">
            <span className="text-[11px] truncate text-red-500">{phonesError}</span>
            <button onClick={fetchPhoneNumbers} className="text-[11px] ml-2 shrink-0 underline text-primary">Retry</button>
          </div>
        ) : phoneNumbers.length === 0 ? (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border">
            <span className="text-xs text-muted-foreground">No numbers found</span>
            <button onClick={fetchPhoneNumbers} className="text-[11px] ml-2 shrink-0 underline text-primary">Retry</button>
          </div>
        ) : (
          <select
            value={selectedPhoneSid}
            onChange={e => setSelectedPhoneSid(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none bg-background border border-border text-foreground"
          >
            <option value="">Choose a number…</option>
            {phoneNumbers.map(n => (
              <option key={n.phoneNumber} value={n.phoneNumber}>
                {n.phoneNumber}{n.friendlyName && n.friendlyName !== n.phoneNumber ? ` — ${n.friendlyName}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!selectedAgentId || !selectedPhoneSid || saving || (isActive && !dirty)}
        className="w-full h-10 rounded-lg font-semibold text-sm text-white transition-opacity disabled:opacity-100 disabled:cursor-default flex items-center justify-center gap-2"
        style={{
          background: saved || (isActive && !dirty)
            ? "rgba(34,197,94,0.15)"
            : "linear-gradient(135deg, #7C6FF7, #534AB7)",
          color: saved || (isActive && !dirty) ? "#22C55E" : "#fff",
          border: saved || (isActive && !dirty) ? "1px solid rgba(34,197,94,0.3)" : undefined,
        }}
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
        ) : saved ? (
          <><Check className="w-4 h-4" /> Saved!</>
        ) : isActive && !dirty ? (
          <><Check className="w-4 h-4" /> Receptionist Active</>
        ) : isActive ? (
          <><PhoneIncoming className="w-4 h-4" /> Update</>
        ) : (
          <><PhoneIncoming className="w-4 h-4" /> Save & Activate</>
        )}
      </button>

    </div>
  );
};
