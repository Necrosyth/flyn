import React from "react";
import type { CallAnalyticsDoc } from "./SentimentAnalysisCard";

interface AgentLeaderboardCardProps {
  docs: CallAnalyticsDoc[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agents: any[];
}

const AVATAR_COLORS = ["#7C6FF7", "#60A5FA", "#22C55E", "#F59E0B", "#EF4444"];

const SENTIMENT_DOT: Record<string, string> = {
  positive: "#22C55E",
  neutral:  "#60A5FA",
  negative: "#EF4444",
};

function scoreColor(score: number): string {
  if (score >= 8) return "#22C55E";
  if (score >= 6) return "#F59E0B";
  return "#EF4444";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtDur(secs?: number): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export const AgentLeaderboardCard: React.FC<AgentLeaderboardCardProps> = ({ docs, agents }) => {
  const grouped: Record<string, {
    callCount: number;
    scores: number[];
    durations: number[];
    sentiments: string[];
  }> = {};

  docs.forEach((doc) => {
    const aid = doc.agentId ?? "__unknown__";
    if (!grouped[aid]) grouped[aid] = { callCount: 0, scores: [], durations: [], sentiments: [] };
    grouped[aid].callCount++;
    if (doc.avgSentimentScore != null) grouped[aid].scores.push(doc.avgSentimentScore);
    if (doc.durationSeconds != null)   grouped[aid].durations.push(doc.durationSeconds);
    if (doc.overallSentiment)          grouped[aid].sentiments.push(doc.overallSentiment);
  });

  const rows = Object.entries(grouped)
    .map(([agentId, data]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agent = agents.find((a: any) => a.id === agentId);
      const name = agent?.name ?? (agentId === "__unknown__" ? "AI Agent" : agentId.slice(0, 8));
      const avgRaw = data.scores.length
        ? data.scores.reduce((s, v) => s + v, 0) / data.scores.length
        : 0;
      const score = Math.round(((avgRaw + 1) / 2) * 100) / 10;
      const avgDur = data.durations.length
        ? Math.round(data.durations.reduce((s, v) => s + v, 0) / data.durations.length)
        : undefined;
      const sentCount: Record<string, number> = {};
      data.sentiments.forEach(s => { sentCount[s] = (sentCount[s] ?? 0) + 1; });
      const dominantSentiment = Object.entries(sentCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
      return { agentId, name, callCount: data.callCount, score, avgDur, dominantSentiment };
    })
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 5);

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3 bg-card border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Agent Leaderboard</p>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: "rgba(124,111,247,0.15)", color: "#7C6FF7" }}
        >
          This Week
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row, idx) => {
            const sc = scoreColor(row.score);
            const barWidth = Math.round((row.score / 10) * 100);
            const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
            const dotColor = SENTIMENT_DOT[row.dominantSentiment] ?? "#60A5FA";

            return (
              <div key={row.agentId} className="flex items-center gap-2.5">
                <span className="text-xs font-bold w-4 shrink-0 text-center text-muted-foreground">
                  {idx + 1}
                </span>

                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 relative text-white"
                  style={{ background: avatarColor }}
                >
                  {initials(row.name)}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card"
                    style={{ background: dotColor }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs truncate text-foreground">{row.name}</span>
                      {row.avgDur && (
                        <span className="text-[10px] font-mono shrink-0 text-muted-foreground/60">
                          avg {fmtDur(row.avgDur)}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono shrink-0 ml-1" style={{ color: sc }}>
                      {row.score}/10
                    </span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${barWidth}%`, background: sc }} />
                  </div>
                </div>

                <span className="text-[11px] shrink-0 text-muted-foreground">
                  {row.callCount}c
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
