import React from "react";

// ── Shared type (exported — imported by QualityScoresCard, AgentLeaderboardCard, Dialer) ──

export interface CallAnalyticsDoc {
  id: string;
  overallSentiment?: string;
  avgSentimentScore?: number;
  to?: string;
  startedAt?: string;
  agentId?: string;
  agentName?: string;
  callClarityScore?: number;
  sttAccuracy?: number;
  talkToListenRatio?: number;
  avgConfidence?: number;
  positiveCount?: number;
  neutralCount?: number;
  negativeCount?: number;
  keywordFrequency?: Record<string, number>;
  totalTurns?: number;
  durationSeconds?: number;
  persistedAt?: string;
  summary?: {
    intent?: string;
    keyPoints?: string[];
    actionItems?: string[];
    overallSentiment?: string;
    adherenceScore?: number;
    adherenceBreakdown?: {
      openingScore?: number;
      objectiveScore?: number;
      professionalismScore?: number;
      closureScore?: number;
    };
    adherenceFlags?: string[];
    tags?: string[];
  };
  appointmentBooked?: boolean;
  [key: string]: unknown;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const SENTIMENT_MAP: Record<string, { label: string; color: string; bg: string }> = {
  positive:   { label: "Positive",   color: "#22C55E", bg: "rgba(34,197,94,0.15)"   },
  neutral:    { label: "Neutral",    color: "#60A5FA", bg: "rgba(96,165,250,0.15)"  },
  negative:   { label: "Negative",   color: "#EF4444", bg: "rgba(239,68,68,0.15)"   },
  frustrated: { label: "Frustrated", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
};

// SVG sparkline — plots avgSentimentScore (-1..1) over the last N calls (oldest→newest)
const Sparkline: React.FC<{ scores: number[] }> = ({ scores }) => {
  if (scores.length < 2) return null;
  const W = 120;
  const H = 32;
  const pad = 2;
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
    const y = pad + ((1 - (s + 1) / 2)) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="#7C6FF7"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* last point dot */}
      {scores.length > 0 && (() => {
        const lastX = pad + ((scores.length - 1) / (scores.length - 1)) * (W - pad * 2);
        const lastY = pad + ((1 - (scores[scores.length - 1] + 1) / 2)) * (H - pad * 2);
        return <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.5" fill="#7C6FF7" />;
      })()}
    </svg>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

interface SentimentAnalysisCardProps {
  docs: CallAnalyticsDoc[];
}

export const SentimentAnalysisCard: React.FC<SentimentAnalysisCardProps> = ({ docs }) => {
  const counts: Record<string, number> = { positive: 0, neutral: 0, negative: 0, frustrated: 0 };
  docs.forEach((doc) => {
    const sent = doc.overallSentiment?.toLowerCase() ?? "neutral";
    if (sent in counts) counts[sent]++;
    else counts.neutral++;
  });
  const total = docs.length;

  // Sparkline: last 10 calls oldest→newest, need avgSentimentScore
  const sparkScores = [...docs]
    .filter((d) => d.avgSentimentScore != null)
    .sort((a, b) => {
      const aTs = (a.startedAt ?? a.persistedAt ?? "") as string;
      const bTs = (b.startedAt ?? b.persistedAt ?? "") as string;
      return aTs.localeCompare(bTs);
    })
    .slice(-10)
    .map((d) => d.avgSentimentScore as number);

  // Aggregate stats across all docs
  const withClarity = docs.filter((d) => d.callClarityScore != null);
  const avgClarity = withClarity.length
    ? Math.round(withClarity.reduce((s, d) => s + (d.callClarityScore ?? 0), 0) / withClarity.length)
    : null;

  const withStt = docs.filter((d) => d.sttAccuracy != null);
  const avgStt = withStt.length
    ? Math.round(withStt.reduce((s, d) => s + (d.sttAccuracy ?? 0), 0) / withStt.length)
    : null;

  const withTtl = docs.filter((d) => d.talkToListenRatio != null);
  const avgTtl = withTtl.length
    ? (withTtl.reduce((s, d) => s + (d.talkToListenRatio ?? 0), 0) / withTtl.length).toFixed(1)
    : null;

  // Aggregate keyword frequency across all docs
  const kwMap: Record<string, number> = {};
  docs.forEach((d) => {
    Object.entries(d.keywordFrequency ?? {}).forEach(([k, v]) => {
      kwMap[k] = (kwMap[k] ?? 0) + v;
    });
  });
  const topKeywords = Object.entries(kwMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxKwFreq = topKeywords[0]?.[1] ?? 1;

  const mostRecentNegative = docs.find(
    (d) => d.overallSentiment === "negative" || d.overallSentiment === "frustrated"
  );

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "#12121A", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "#F1F0FF" }}>Sentiment Analysis</p>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: "rgba(96,165,250,0.15)", color: "#60A5FA" }}
        >
          Today
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs" style={{ color: "#4B5563" }}>No calls yet today.</p>
      ) : (
        <>
          {/* Sentiment bars */}
          <div className="space-y-2">
            {Object.entries(SENTIMENT_MAP).map(([key, cfg]) => {
              const count = counts[key] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: "#9CA3AF" }}>{cfg.label}</span>
                    <span className="text-xs font-mono" style={{ color: cfg.color }}>
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: cfg.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sparkline trend */}
          {sparkScores.length >= 2 && (
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: "#1A1A26" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#9CA3AF" }}>
                Sentiment Trend
              </p>
              <Sparkline scores={sparkScores} />
            </div>
          )}

          {/* Stats row */}
          {(avgStt != null || avgTtl != null || avgClarity != null) && (
            <div className="grid grid-cols-3 gap-2">
              {avgStt != null && (
                <div className="rounded-lg p-2 text-center" style={{ background: "#1A1A26" }}>
                  <p className="text-xs font-bold" style={{ color: "#F1F0FF" }}>{avgStt}%</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>STT Acc.</p>
                </div>
              )}
              {avgTtl != null && (
                <div className="rounded-lg p-2 text-center" style={{ background: "#1A1A26" }}>
                  <p className="text-xs font-bold" style={{ color: "#F1F0FF" }}>{avgTtl}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>Talk:Listen</p>
                </div>
              )}
              {avgClarity != null && (
                <div className="rounded-lg p-2 text-center" style={{ background: "rgba(124,111,247,0.15)" }}>
                  <p className="text-xs font-bold" style={{ color: "#C4BBFF" }}>{avgClarity}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Clarity</p>
                </div>
              )}
            </div>
          )}

          {/* Top keywords */}
          {topKeywords.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: "#1A1A26" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>
                Keyword Mentions
              </p>
              <div className="space-y-1.5">
                {topKeywords.map(([kw, freq]) => (
                  <div key={kw} className="flex items-center gap-2">
                    <span className="text-[11px] w-16 truncate shrink-0" style={{ color: "#9CA3AF" }}>{kw}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.round((freq / maxKwFreq) * 100)}%`, background: "rgba(124,111,247,0.6)" }}
                      />
                    </div>
                    <span className="text-[10px] font-mono w-5 text-right shrink-0" style={{ color: "#6B7280" }}>{freq}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insights */}
          <div className="rounded-lg p-3" style={{ background: "#1A1A26" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>
              AI Insights
            </p>
            {mostRecentNegative ? (
              <p className="text-xs" style={{ color: "#F59E0B" }}>
                ⚠ {mostRecentNegative.to ?? "Customer"} showing frustration — review required
              </p>
            ) : (
              <p className="text-xs" style={{ color: "#22C55E" }}>All calls performing well ✓</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
