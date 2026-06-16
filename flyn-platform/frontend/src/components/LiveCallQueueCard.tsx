import React, { useState } from "react";
import { Loader2, RefreshCw, Phone, PhoneIncoming, PhoneMissed, PhoneOff, ChevronLeft, ChevronRight } from "lucide-react";
import type { TwilioCallRecord } from "@/pages/Dialer";

interface ActiveAiCallMin {
  id: string;
  callSid: string;
  to: string;
  from?: string | null;
  direction?: "inbound" | "outbound-api" | "outbound-dial";
  agentId?: string | null;
  status: string;
  createdAt: string;
}

interface LiveCallQueueCardProps {
  liveCalls: ActiveAiCallMin[];
  callHistory: TwilioCallRecord[];
  callHistoryLoading: boolean;
  onRefreshHistory: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agents: any[];
  now: Date;
  selectedCallSid: string | null;
  onSelect: (sid: string) => void;
  onBarge: (sid: string) => void;
  sentimentMap: Record<string, string>;
  bargeingIn: string | null;
  bargedCallSid: string | null;
}

const PAGE_SIZE = 5;

const SENTIMENT_COLOR: Record<string, string> = {
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

function sentimentLabel(s: string | undefined): string {
  if (!s) return "Neutral";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDur(startedAt: string, nowDate: Date): string {
  const secs = Math.max(0, Math.floor((nowDate.getTime() - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function formatSecs(secs: number): string {
  if (secs <= 0) return "—";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return (
      d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

function StatusIcon({ status, direction }: { status: string; direction?: string }) {
  if (status === "in-progress" || status === "ringing") {
    return <span className="w-2 h-2 rounded-full animate-pulse inline-block bg-green-500" />;
  }
  if (status === "no-answer" || status === "busy" || status === "failed" || status === "canceled") {
    return <PhoneMissed className="w-3.5 h-3.5 text-red-500" />;
  }
  if (direction === "inbound") {
    return <PhoneIncoming className="w-3.5 h-3.5 text-blue-400" />;
  }
  return <Phone className="w-3.5 h-3.5 text-muted-foreground" />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    "in-progress": { label: "Live",      color: "#22C55E", bg: "rgba(34,197,94,0.15)"    },
    ringing:       { label: "Ringing",   color: "#F59E0B", bg: "rgba(245,158,11,0.15)"   },
    completed:     { label: "Completed", color: "#9CA3AF", bg: "rgba(156,163,175,0.12)"  },
    "no-answer":   { label: "No Answer", color: "#EF4444", bg: "rgba(239,68,68,0.12)"    },
    busy:          { label: "Busy",      color: "#F59E0B", bg: "rgba(245,158,11,0.12)"   },
    failed:        { label: "Failed",    color: "#EF4444", bg: "rgba(239,68,68,0.12)"    },
    canceled:      { label: "Canceled",  color: "#6B7280", bg: "rgba(107,114,128,0.12)"  },
    queued:        { label: "Queued",    color: "#60A5FA", bg: "rgba(96,165,250,0.12)"   },
  };
  const c = cfg[status] ?? { label: status, color: "#9CA3AF", bg: "rgba(156,163,175,0.1)" };
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1 px-4 py-2.5 shrink-0 border-t border-border">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-muted disabled:opacity-30"
      >
        <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {getPages().map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className="w-6 h-6 flex items-center justify-center rounded text-[11px] font-medium transition-colors"
          style={
            p === page
              ? { background: "#7C6FF7", color: "#fff" }
              : undefined
          }
          data-active={p === page}
        >
          <span className={p !== page ? "text-muted-foreground" : ""}>{p}</span>
        </button>
      ))}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-muted disabled:opacity-30"
      >
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

export const LiveCallQueueCard: React.FC<LiveCallQueueCardProps> = ({
  liveCalls,
  callHistory,
  callHistoryLoading,
  onRefreshHistory,
  agents,
  now,
  selectedCallSid,
  onSelect,
  onBarge,
  sentimentMap,
  bargeingIn,
  bargedCallSid,
}) => {
  const [page, setPage] = useState(1);

  const liveCallSids = new Set(liveCalls.map(c => c.callSid));
  const historicalCalls = callHistory.filter(c => !liveCallSids.has(c.callSid));

  const totalPages = Math.max(1, Math.ceil(historicalCalls.length / PAGE_SIZE));
  const pagedHistory = historicalCalls.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalCount = liveCalls.length + historicalCalls.length;

  const COL = "grid-cols-[1fr_70px_80px_90px]";

  const handlePageChange = (p: number) => {
    setPage(Math.max(1, Math.min(p, totalPages)));
  };

  return (
    <div className="rounded-xl flex flex-col overflow-hidden bg-card border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Call Outreach</p>
          {liveCalls.length > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
              style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block bg-green-500" />
              {liveCalls.length} Live
            </span>
          )}
          {totalCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
              {totalCount} total
            </span>
          )}
        </div>
        <button
          onClick={onRefreshHistory}
          disabled={callHistoryLoading}
          className="p-1.5 rounded-lg transition-colors hover:bg-muted disabled:opacity-40"
          title="Refresh call history"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-muted-foreground ${callHistoryLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Column headers */}
      {totalCount > 0 && (
        <div className={`grid ${COL} px-4 py-2 text-[10px] font-bold uppercase tracking-widest shrink-0 text-muted-foreground border-b border-border`}>
          <span>CALLER</span>
          <span>DURATION</span>
          <span>SENTIMENT</span>
          <span>STATUS / AGENT</span>
        </div>
      )}

      {/* Rows */}
      <div className="flex-1 overflow-hidden">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2" style={{ minHeight: 200 }}>
            {callHistoryLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <>
                <PhoneOff className="w-5 h-5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No calls yet</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* ── LIVE SECTION ── */}
            {liveCalls.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest border-b border-primary/20 text-primary">
                  Live
                </div>
                {liveCalls.map(call => {
                  const isSelected = selectedCallSid === call.callSid;
                  const isBarging = bargeingIn === call.callSid;
                  const isBarged = bargedCallSid === call.callSid;
                  const sentKey = (sentimentMap[call.callSid] ?? "neutral").toLowerCase();
                  const sentColor = SENTIMENT_COLOR[sentKey] ?? "#60A5FA";
                  const sentBg = SENTIMENT_BG[sentKey] ?? "rgba(96,165,250,0.15)";
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const agentName = agents.find((a: any) => a.id === call.agentId)?.name ?? "AI Agent";

                  return (
                    <div
                      key={call.id}
                      className={`grid ${COL} items-center px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 border-b border-border/50`}
                      style={{
                        borderLeft: isSelected ? "2px solid #7C6FF7" : "2px solid transparent",
                        background: isSelected ? "rgba(124,111,247,0.06)" : undefined,
                      }}
                      onClick={() => onSelect(call.callSid)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {call.direction === "inbound" ? (
                          <PhoneIncoming className="w-3 h-3 shrink-0 text-blue-400" />
                        ) : (
                          <span className="w-2 h-2 rounded-full animate-pulse shrink-0 bg-green-500" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-mono truncate text-foreground">{call.to}</span>
                          {call.direction === "inbound" && (
                            <span className="text-[9px] font-semibold text-blue-400">INBOUND</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatDur(call.createdAt, now)}
                      </span>
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded font-medium w-fit"
                        style={{ background: sentBg, color: sentColor }}
                      >
                        {sentimentLabel(sentKey)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs truncate text-muted-foreground">{agentName}</span>
                        {isBarged ? (
                          <span className="text-[10px] font-semibold shrink-0 text-green-500">Live</span>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); onBarge(call.callSid); }}
                            disabled={isBarging || !!bargedCallSid}
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 transition-opacity disabled:opacity-40"
                            style={{ background: "rgba(124,111,247,0.2)", color: "#7C6FF7" }}
                          >
                            {isBarging ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Barge"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── HISTORY SECTION ── */}
            {historicalCalls.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest flex items-center justify-between border-b border-border/50 text-muted-foreground">
                  <span>All Calls</span>
                  <span className="text-muted-foreground/60">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, historicalCalls.length)} of {historicalCalls.length}
                  </span>
                </div>
                {pagedHistory.map(call => {
                  const isSelected = selectedCallSid === call.callSid;
                  const sent = (call.sentiment ?? "neutral").toLowerCase();
                  const sentColor = SENTIMENT_COLOR[sent] ?? "#60A5FA";
                  const sentBg = SENTIMENT_BG[sent] ?? "rgba(96,165,250,0.15)";
                  const agentLabel = call.agentName ?? (call.direction === "inbound" ? "Inbound" : "AI Agent");

                  return (
                    <div
                      key={call.callSid}
                      className={`grid ${COL} items-center px-4 py-2.5 cursor-pointer transition-colors hover:bg-muted/50 border-b border-border/30`}
                      style={{
                        borderLeft: isSelected ? "2px solid #7C6FF7" : "2px solid transparent",
                        background: isSelected ? "rgba(124,111,247,0.06)" : undefined,
                      }}
                      onClick={() => onSelect(call.callSid)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusIcon status={call.status} direction={call.direction} />
                        <div className="min-w-0">
                          <span className="text-xs font-mono truncate block text-foreground">{call.to}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtDate(call.startTime)}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatSecs(call.duration)}
                      </span>
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded font-medium w-fit"
                        style={{ background: sentBg, color: sentColor }}
                      >
                        {sentimentLabel(sent)}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status={call.status} />
                        <span className="text-[10px] truncate text-muted-foreground">{agentLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
    </div>
  );
};
