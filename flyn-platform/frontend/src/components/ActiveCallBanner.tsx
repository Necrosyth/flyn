import React from "react";

interface ActiveAiCallMin {
  callSid: string;
  to: string;
  agentId?: string | null;
  status: string;
  createdAt: string;
}

interface ActiveCallBannerProps {
  call: ActiveAiCallMin | null;
  agentName: string;
  sentiment: string;
  durationStr: string;
  onEnd: () => void;
  onBarge: () => void;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22C55E",
  neutral: "#60A5FA",
  frustrated: "#F59E0B",
  negative: "#EF4444",
  angry: "#EF4444",
};

const SENTIMENT_BG: Record<string, string> = {
  positive: "rgba(34,197,94,0.15)",
  neutral: "rgba(96,165,250,0.15)",
  frustrated: "rgba(245,158,11,0.15)",
  negative: "rgba(239,68,68,0.15)",
  angry: "rgba(239,68,68,0.15)",
};

export const ActiveCallBanner: React.FC<ActiveCallBannerProps> = ({
  call,
  agentName,
  sentiment,
  durationStr,
  onEnd,
  onBarge,
}) => {
  if (!call) return null;

  const sentKey = sentiment?.toLowerCase() ?? "neutral";
  const sentColor = SENTIMENT_COLORS[sentKey] ?? "#60A5FA";
  const sentBg = SENTIMENT_BG[sentKey] ?? "rgba(96,165,250,0.15)";
  const sentLabel = sentKey.charAt(0).toUpperCase() + sentKey.slice(1);

  return (
    <div
      className="rounded-xl p-4 flex items-center gap-4"
      style={{
        background: "rgba(34,197,94,0.1)",
        border: "1px solid rgba(34,197,94,0.3)",
        borderLeft: "3px solid #22C55E",
      }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-3 h-3 rounded-full animate-pulse inline-block bg-green-500" />
        <span className="text-xs font-semibold text-green-500">LIVE</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold font-mono text-foreground">{call.to}</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(124,111,247,0.15)", color: "#7C6FF7" }}
          >
            {agentName}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: sentBg, color: sentColor }}
          >
            {sentLabel}
          </span>
        </div>
        <p className="text-xs mt-0.5 text-muted-foreground">Duration: {durationStr}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onBarge}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-opacity hover:opacity-80"
          style={{ background: "rgba(124,111,247,0.2)", color: "#7C6FF7" }}
          title="Barge In"
        >
          🗑
        </button>
        <button
          onClick={onEnd}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-opacity hover:opacity-80"
          style={{ background: "rgba(239,68,68,0.2)", color: "#EF4444" }}
          title="End Call"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
