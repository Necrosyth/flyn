import React from "react";
import type { CallAnalyticsDoc } from "./SentimentAnalysisCard";

interface QualityScoresCardProps {
  docs: CallAnalyticsDoc[];
}

interface Metric {
  label: string;
  score: number;
  stars: number;
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function renderStars(filled: number): React.ReactNode {
  const f = Math.max(0, Math.min(5, filled));
  return (
    <span className="text-amber-500">
      {"★".repeat(f)}{"☆".repeat(5 - f)}
    </span>
  );
}

function computeMetrics(docs: CallAnalyticsDoc[]): Metric[] | null {
  if (!docs.length) return null;

  const toneArr  = docs.filter(d => d.callClarityScore != null).map(d => (d.callClarityScore as number) / 10);
  const empArr   = docs.filter(d => d.avgSentimentScore != null).map(d => ((d.avgSentimentScore as number) + 1) / 2 * 10);
  const confArr  = docs.filter(d => d.avgConfidence   != null).map(d => (d.avgConfidence as number) * 10);
  const sttArr   = docs.filter(d => d.sttAccuracy     != null).map(d => (d.sttAccuracy as number) / 10);
  const adherArr = docs
    .filter(d => d.summary?.adherenceScore != null)
    .map(d => (d.summary!.adherenceScore as number) / 10);

  const metrics: { label: string; arr: number[] }[] = [
    { label: "TONE & CLARITY",    arr: toneArr  },
    { label: "EMPATHY",           arr: empArr   },
    { label: "AI CONFIDENCE",     arr: confArr  },
    { label: "STT QUALITY",       arr: sttArr   },
    { label: "SCRIPT ADHERENCE",  arr: adherArr },
  ];

  const computed = metrics
    .filter(m => m.arr.length > 0)
    .map(m => {
      const score = parseFloat(avg(m.arr).toFixed(1));
      return { label: m.label, score, stars: Math.round(score / 2) };
    });

  return computed.length ? computed : null;
}

export const QualityScoresCard: React.FC<QualityScoresCardProps> = ({ docs }) => {
  const metrics = computeMetrics(docs);

  const overall = metrics
    ? parseFloat(avg(metrics.map(m => m.score)).toFixed(1))
    : null;

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3 bg-card border border-border">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-foreground">Quality Scores</p>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(124,111,247,0.15)", color: "#7C6FF7" }}
          >
            Auto QA
          </span>
          {docs.length > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
              style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E" }}
            >
              <span className="w-1 h-1 rounded-full inline-block bg-green-500" />
              Live
            </span>
          )}
        </div>
      </div>

      {!metrics ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">No calls yet today.</p>
          <p className="text-[11px] text-muted-foreground/60">
            Quality scores are computed automatically from AI call data once calls complete.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {metrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px]">{renderStars(m.stars)}</span>
                  <span className="text-xs font-mono font-semibold w-8 text-right text-foreground">
                    {m.score}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {metrics.map((m) => (
              <div
                key={m.label + "_bar"}
                className="h-1 rounded-full overflow-hidden bg-muted"
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${m.score * 10}%`,
                    background: m.score >= 8
                      ? "rgba(34,197,94,0.7)"
                      : m.score >= 6
                      ? "rgba(124,111,247,0.7)"
                      : "rgba(239,68,68,0.7)",
                  }}
                />
              </div>
            ))}
          </div>

          {overall != null && (
            <div className="rounded-lg p-3 mt-1 flex items-center justify-between bg-muted/60">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Overall QA Score</p>
                <p className="text-[10px] mt-0.5 text-muted-foreground/60">
                  {docs.length} call{docs.length !== 1 ? "s" : ""} · today
                </p>
              </div>
              <p className="text-xl font-bold text-foreground">
                {overall}{" "}
                <span className="text-xs font-normal text-muted-foreground">/ 10</span>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
