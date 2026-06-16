import React from "react";

interface CallCenterStatsBarProps {
  liveCalls: number;
  todayCalls: number;
  avgHandleTime: string;
  aiResolvedPct: number;
  missedCalls: number;
}

export const CallCenterStatsBar: React.FC<CallCenterStatsBarProps> = ({
  liveCalls,
  todayCalls,
  avgHandleTime,
  aiResolvedPct,
  missedCalls,
}) => {
  const stats = [
    {
      label: "LIVE CALLS",
      value: String(liveCalls),
      delta: liveCalls > 0 ? `${liveCalls} active now` : "None active",
      deltaClass: liveCalls > 0 ? "text-green-500" : "text-muted-foreground",
    },
    {
      label: "TODAY'S CALLS",
      value: String(todayCalls),
      delta: "This session",
      deltaClass: "text-muted-foreground",
    },
    {
      label: "AVG HANDLE TIME",
      value: avgHandleTime,
      delta: "Per call",
      deltaClass: "text-muted-foreground",
    },
    {
      label: "AI RESOLVED",
      value: `${aiResolvedPct}%`,
      delta: aiResolvedPct > 70 ? "Above target" : "Below target",
      deltaClass: aiResolvedPct > 70 ? "text-green-500" : "text-amber-500",
    },
    {
      label: "AVG CSAT",
      value: "4.6/5",
      delta: "★★★★☆ Coming soon",
      deltaClass: "text-amber-500",
    },
    {
      label: "MISSED CALLS",
      value: String(missedCalls),
      delta: missedCalls > 0 ? "Needs follow-up" : "All answered",
      deltaClass: missedCalls > 0 ? "text-red-500" : "text-green-500",
    },
  ];

  return (
    <div className="grid grid-cols-6 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl p-4 bg-card border border-border"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            {stat.label}
          </p>
          <p className="text-2xl font-bold mb-1 text-foreground">
            {stat.value}
          </p>
          <p className={`text-[10px] ${stat.deltaClass}`}>
            {stat.delta}
          </p>
        </div>
      ))}
    </div>
  );
};
