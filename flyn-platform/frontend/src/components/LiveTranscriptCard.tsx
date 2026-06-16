import React, { useRef, useEffect, useState } from "react";
import { Play, Loader2, Download, Mic, MicOff, Radio } from "lucide-react";

interface TranscriptMessage {
  role: string;
  text: string;
  ts: string;
}

interface CallSummary {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  intent: string;
  keyPoints: string[];
  actionItems: string[];
}

interface RecordingCall {
  name: string;
  number: string;
  time: string;
  type: "outgoing" | "incoming" | "missed";
  durationSeconds?: number;
  callSid?: string;
  callSummary?: CallSummary;
  recordingSid?: string;
  recordingDuration?: number;
}

interface RecordingPlayer {
  status: "idle" | "loading" | "ready" | "error";
  blobUrl?: string;
}

interface LiveTranscriptCardProps {
  transcript: TranscriptMessage[];
  callerName: string;
  isLive: boolean;
  recordingCalls: RecordingCall[];
  onPlayRecording: (recordingSid: string) => void;
  recordingPlayers: Record<string, RecordingPlayer>;
  /** When true, this call had AI Transcription toggled OFF → show an "off" state, not the transcript. */
  transcriptionOff?: boolean;
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function fmtDur(secs?: number): string {
  if (!secs) return "—";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "#22C55E",
  neutral: "#60A5FA",
  negative: "#EF4444",
};
const SENTIMENT_BG: Record<string, string> = {
  positive: "rgba(34,197,94,0.15)",
  neutral: "rgba(96,165,250,0.15)",
  negative: "rgba(239,68,68,0.15)",
};

const Waveform: React.FC = () => {
  const heights = [8, 14, 6, 18, 10, 20, 7, 12];
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" aria-hidden="true">
      {heights.map((h, i) => (
        <rect key={i} x={i * 6} y={(24 - h) / 2} width="4" height={h} rx="2" fill="#534AB7" opacity="0.6" />
      ))}
    </svg>
  );
};

export const LiveTranscriptCard: React.FC<LiveTranscriptCardProps> = ({
  transcript,
  callerName,
  isLive,
  recordingCalls,
  onPlayRecording,
  recordingPlayers,
  transcriptionOff = false,
}) => {
  const [activeTab, setActiveTab] = useState<"transcript" | "recordings">("transcript");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLive) setActiveTab("transcript");
  }, [isLive]);

  useEffect(() => {
    if (!isLive && recordingCalls.length > 0) setActiveTab("recordings");
  }, [recordingCalls.length, isLive]);

  useEffect(() => {
    if (activeTab !== "transcript") return;
    const el = scrollRef.current;
    if (!el) return;
    // Scroll ONLY this container (never scrollIntoView — that scrolls the whole page).
    // And only auto-follow when the user is already near the bottom, so reading
    // older lines isn't interrupted by new ones.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [transcript, activeTab]);

  return (
    <div className="rounded-xl overflow-hidden flex flex-col bg-card border border-border" style={{ minHeight: 240 }}>
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        {/* Tab pills */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50">
          <button
            onClick={() => setActiveTab("transcript")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={
              activeTab === "transcript"
                ? { background: "rgba(124,111,247,0.2)", color: "#C4BBFF" }
                : undefined
            }
          >
            <span className={activeTab !== "transcript" ? "text-muted-foreground" : ""}>
              <Mic className="w-3 h-3 inline mr-1" />
              Live Transcript
            </span>
          </button>
          <button
            onClick={() => setActiveTab("recordings")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={
              activeTab === "recordings"
                ? { background: "rgba(124,111,247,0.2)", color: "#C4BBFF" }
                : undefined
            }
          >
            <span className={activeTab !== "recordings" ? "text-muted-foreground flex items-center gap-1.5" : "flex items-center gap-1.5"}>
              <Radio className="w-3 h-3" />
              Recordings
              {recordingCalls.length > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5"
                  style={{ background: "rgba(124,111,247,0.3)", color: "#C4BBFF" }}
                >
                  {recordingCalls.length}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Right badge */}
        {activeTab === "transcript" ? (
          isLive ? (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest shrink-0 text-red-500">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block bg-red-500" />
              LIVE
            </span>
          ) : callerName ? (
            <span className="text-[11px] font-mono shrink-0 text-muted-foreground">
              {callerName}
            </span>
          ) : null
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
            Auto-stored · 90 days
          </span>
        )}
      </div>

      {/* Transcript tab */}
      {activeTab === "transcript" && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2" style={{ maxHeight: 320 }}>
          {transcriptionOff ? (
            <div className="flex flex-col items-center justify-center h-full gap-1.5 text-center px-4" style={{ minHeight: 120 }}>
              <MicOff className="w-5 h-5 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Transcription is off for this call</p>
              <p className="text-xs text-muted-foreground/60">Turn on AI Transcription before dialing to see the transcript here.</p>
            </div>
          ) : transcript.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ minHeight: 120 }}>
              <p className="text-sm text-muted-foreground">
                {isLive ? "Waiting for conversation…" : "No active call selected"}
              </p>
            </div>
          ) : (
            transcript.map((msg, i) => {
              const isBot = msg.role === "bot";
              return (
                <div key={i} className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
                  <div
                    className="max-w-[80%] rounded-lg px-3 py-2 text-xs text-foreground"
                    style={
                      isBot
                        ? { background: "rgba(124,111,247,0.15)", borderLeft: "2px solid rgba(124,111,247,0.4)" }
                        : { background: "hsl(var(--muted) / 0.5)" }
                    }
                  >
                    <p className="leading-relaxed">{msg.text}</p>
                    {msg.ts && (
                      <p className="text-[10px] mt-1 opacity-60 text-muted-foreground">
                        {formatTs(msg.ts)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Recordings tab */}
      {activeTab === "recordings" && (
        <div className="flex-1 overflow-y-auto divide-y divide-border" style={{ maxHeight: 320 }}>
          {recordingCalls.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No recordings yet</p>
            </div>
          ) : (
            recordingCalls.map((call, i) => {
              const sid = call.recordingSid!;
              const player = recordingPlayers[sid];
              const sentKey = call.callSummary?.sentiment ?? "neutral";
              const sentColor = SENTIMENT_COLOR[sentKey] ?? "#60A5FA";
              const sentBg = SENTIMENT_BG[sentKey] ?? "rgba(96,165,250,0.15)";

              return (
                <div key={call.callSid ?? i} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onPlayRecording(sid)}
                      disabled={player?.status === "loading" || player?.status === "ready"}
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ background: "rgba(124,111,247,0.2)" }}
                      title="Play Recording"
                    >
                      {player?.status === "loading" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#7C6FF7" }} />
                      ) : (
                        <Play className="w-3.5 h-3.5" style={{ color: "#7C6FF7" }} />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium truncate text-foreground">{call.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{call.number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize bg-muted text-muted-foreground">
                          {call.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {fmtDur(call.recordingDuration ?? call.durationSeconds)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: sentBg, color: sentColor }}>
                          {sentKey.charAt(0).toUpperCase() + sentKey.slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0"><Waveform /></div>

                    {player?.status === "ready" && player.blobUrl && (
                      <a
                        href={player.blobUrl}
                        download={`recording-${call.callSid ?? sid}.mp3`}
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80 bg-muted text-muted-foreground"
                        title="Download"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    )}

                    {player?.status === "error" && (
                      <button onClick={() => onPlayRecording(sid)} className="shrink-0 text-[11px] underline text-red-500">
                        Retry
                      </button>
                    )}
                  </div>

                  {player?.status === "ready" && player.blobUrl && (
                    <div className="mt-2">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio controls src={player.blobUrl} className="w-full h-8 rounded" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
