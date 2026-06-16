import React from "react";
import { Play, Loader2, Download } from "lucide-react";

interface CallSummary {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  intent: string;
  keyPoints: string[];
  actionItems: string[];
}

interface RecentCallMin {
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

interface CallRecordingsCardProps {
  calls: RecentCallMin[];
  onPlay: (recordingSid: string) => void;
  recordingPlayers: Record<string, RecordingPlayer>;
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

function fmtDur(secs?: number): string {
  if (!secs) return "—";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

// Decorative waveform SVG
const Waveform: React.FC = () => {
  const heights = [8, 14, 6, 18, 10, 20, 7, 12];
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" aria-hidden="true">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 6}
          y={(24 - h) / 2}
          width="4"
          height={h}
          rx="2"
          fill="#534AB7"
          opacity="0.6"
        />
      ))}
    </svg>
  );
};

export const CallRecordingsCard: React.FC<CallRecordingsCardProps> = ({
  calls,
  onPlay,
  recordingPlayers,
}) => {
  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: "#12121A",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "#F1F0FF" }}>
          Call Recordings
        </p>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: "rgba(255,255,255,0.06)", color: "#6B7280" }}
        >
          Auto-stored · 90 days
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {calls.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: "#4B5563" }}>
              No recordings yet
            </p>
          </div>
        ) : (
          calls.map((call, i) => {
            const sid = call.recordingSid!;
            const player = recordingPlayers[sid];
            const sentKey = call.callSummary?.sentiment ?? "neutral";
            const sentColor = SENTIMENT_COLOR[sentKey] ?? "#60A5FA";
            const sentBg = SENTIMENT_BG[sentKey] ?? "rgba(96,165,250,0.15)";

            return (
              <div key={call.callSid ?? i} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Play button */}
                  <button
                    onClick={() => onPlay(sid)}
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

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium truncate" style={{ color: "#F1F0FF" }}>
                        {call.name}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: "#9CA3AF" }}>
                        {call.number}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize"
                        style={{ background: "rgba(255,255,255,0.06)", color: "#6B7280" }}
                      >
                        {call.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono" style={{ color: "#6B7280" }}>
                        {fmtDur(call.recordingDuration ?? call.durationSeconds)}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: sentBg, color: sentColor }}
                      >
                        {sentKey.charAt(0).toUpperCase() + sentKey.slice(1)}
                      </span>
                    </div>
                  </div>

                  {/* Waveform */}
                  <div className="shrink-0">
                    <Waveform />
                  </div>

                  {/* Download if ready */}
                  {player?.status === "ready" && player.blobUrl && (
                    <a
                      href={player.blobUrl}
                      download={`recording-${call.callSid ?? sid}.mp3`}
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#9CA3AF" }}
                      title="Download"
                    >
                      <Download className="w-3 h-3" />
                    </a>
                  )}

                  {player?.status === "error" && (
                    <button
                      onClick={() => onPlay(sid)}
                      className="shrink-0 text-[11px] underline"
                      style={{ color: "#EF4444" }}
                    >
                      Retry
                    </button>
                  )}
                </div>

                {/* Audio player */}
                {player?.status === "ready" && player.blobUrl && (
                  <div className="mt-2">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio
                      controls
                      src={player.blobUrl}
                      className="w-full h-8 rounded"
                      style={{ colorScheme: "dark" }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
