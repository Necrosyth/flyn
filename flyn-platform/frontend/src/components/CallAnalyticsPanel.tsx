import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar,
} from "recharts";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { API_BASE_URL } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Flyn colour palette (exact hex, used in recharts props) ─────────────────
const PURPLE_DARK  = "#3C3489";
const PURPLE_MID   = "#534AB7";
const PURPLE_LIGHT = "#AFA9EC";
const PURPLE_FAINT = "#EEEDFE";
const GREEN        = "#1D9E75";
const RED_NEG      = "#E24B4A";

// ── Types ────────────────────────────────────────────────────────────────────
interface TranscriptTurn {
  turnIndex: number;
  speaker: "customer" | "agent";
  text: string;
  timestamp: string;
  confidence: number;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  keywords: string[];
  durationMs: number;
}

interface CallAggregate {
  totalTurns?: number;
  customerTurns?: number;
  agentTurns?: number;
  totalCustomerMs?: number;
  totalAgentMs?: number;
  avgConfidence?: number;
  avgSentimentScore?: number;
  overallSentiment?: "positive" | "neutral" | "negative";
  positiveCount?: number;
  neutralCount?: number;
  negativeCount?: number;
  keywordFrequency?: Record<string, number>;
  callClarityScore?: number;
  talkToListenRatio?: number;
  sttAccuracy?: number;
  callSummary?: {
    intent?: string;
    keyPoints?: string[];
    actionItems?: string[];
    sentiment?: string;
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
}

export interface CallAnalyticsPanelProps {
  callSid: string;
  tenantId: string;
  agentName: string;
  isLive: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sentimentCellColor(score: number): string {
  if (score > 0.3) return PURPLE_MID;
  if (score > 0) return PURPLE_LIGHT;
  if (score > -0.3) return PURPLE_FAINT;
  return RED_NEG;
}

function buildSentimentTimeline(turns: TranscriptTurn[]) {
  let pos = 0, neu = 0, neg = 0;
  return turns.map((t, i) => {
    if (t.sentiment === "positive") pos++;
    else if (t.sentiment === "negative") neg++;
    else neu++;
    const total = i + 1;
    return {
      turn: i,
      positive: Math.round((pos / total) * 100),
      neutral: Math.round((neu / total) * 100),
      negative: Math.round((neg / total) * 100),
    };
  });
}

function topKeywords(freq: Record<string, number>, n = 5) {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([keyword, count]) => ({ keyword, count }));
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  if (accent) {
    return (
      <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: PURPLE_MID }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
        <span className="text-3xl font-bold text-white">{value}</span>
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-3xl font-bold" style={{ color: PURPLE_DARK }}>{value}</span>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export function CallAnalyticsPanel({ callSid, tenantId, agentName, isLive }: CallAnalyticsPanelProps) {
  const [agg, setAgg] = useState<CallAggregate | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubAgg = useRef<(() => void) | null>(null);
  const unsubTurns = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!callSid || !tenantId) { setLoading(false); return; }

    if (isLive) {
      const db = getDb();
      if (!db) { setLoading(false); return; }

      // Subscribe to aggregate document
      const aggRef = doc(db, "tenants", tenantId, "activeCalls", callSid);
      unsubAgg.current = onSnapshot(aggRef, snap => {
        if (snap.exists()) setAgg(snap.data() as CallAggregate);
        setLoading(false);
      }, () => setLoading(false));

      // Subscribe to transcriptTurns sub-collection
      const turnsQ = query(
        collection(db, "tenants", tenantId, "activeCalls", callSid, "transcriptTurns"),
        orderBy("turnIndex", "asc"),
      );
      unsubTurns.current = onSnapshot(turnsQ, snap => {
        setTurns(snap.docs.map(d => d.data() as TranscriptTurn));
      }, () => {});

      return () => { unsubAgg.current?.(); unsubTurns.current?.(); };
    } else {
      // Post-call: single API fetch
      fetch(`${API_BASE_URL}/channels/calls/${encodeURIComponent(callSid)}/analytics?tenantId=${encodeURIComponent(tenantId)}`)
        .then(r => (r.ok ? r.json() : null))
        .then((data: CallAggregate & { turns?: TranscriptTurn[] } | null) => {
          if (data) {
            setAgg(data);
            setTurns(data.turns ?? []);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callSid, tenantId, isLive]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const displayTurns = turns.slice(-30);
  const sentimentTimeline = buildSentimentTimeline(displayTurns);
  const customerTurns = turns.filter(t => t.speaker === "customer");
  const keywords = topKeywords(agg?.keywordFrequency ?? {});
  const automationData = turns.map((_, i) => ({ turn: i, count: 0 }));
  const sttAccuracy  = agg?.sttAccuracy ?? (loading ? null : 100);
  const clarityScore = agg?.callClarityScore ?? 0;
  const talkListen   = agg?.talkToListenRatio != null ? agg.talkToListenRatio.toFixed(1) : "—";
  const agentPerfData = [{
    agent: agentName.slice(0, 12),
    sentiment: Math.round(((agg?.avgSentimentScore ?? 0) + 1) * 50),
    talkRatio: Math.min(Math.round((agg?.talkToListenRatio ?? 0) * 50), 100),
    automation: 0,
  }];

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-xl border mt-3 p-4 space-y-3" style={{ borderColor: "rgba(83,74,183,0.2)" }}>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border mt-3 overflow-hidden text-sm" style={{ borderColor: "rgba(83,74,183,0.2)", background: "rgba(83,74,183,0.03)" }}>

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "rgba(83,74,183,0.15)" }}>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: PURPLE_DARK }}>AI Voice Analytics</span>
        {isLive && (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: RED_NEG + "22", color: RED_NEG }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: RED_NEG }} />
            LIVE
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {agg?.appointmentBooked && (
            <Badge className="text-[10px] px-2 py-0 border-0" style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}>
              Appt Booked
            </Badge>
          )}
          {agg?.overallSentiment && (
            <Badge
              className="text-[10px] px-2 py-0 border-0"
              style={{
                background: agg.overallSentiment === "positive" ? GREEN + "22" : agg.overallSentiment === "negative" ? RED_NEG + "22" : PURPLE_FAINT,
                color: agg.overallSentiment === "positive" ? GREEN : agg.overallSentiment === "negative" ? RED_NEG : PURPLE_MID,
              }}
            >
              {agg.overallSentiment}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ─────────────── LEFT COLUMN ─────────────────────────────────── */}
        <div className="space-y-4">

          {/* 1. Sentiment Over Time */}
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: PURPLE_DARK }}>Sentiment Over Time</p>
            {sentimentTimeline.length === 0 ? (
              <div className="h-28 rounded-lg flex items-center justify-center text-[11px] text-muted-foreground" style={{ background: PURPLE_FAINT }}>
                Waiting for turns…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={112}>
                <LineChart data={sentimentTimeline} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis dataKey="turn" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v}%`, name]}
                    contentStyle={{ fontSize: 10, borderRadius: 6, border: `1px solid ${PURPLE_LIGHT}`, background: "#fff" }}
                  />
                  <Line type="monotone" dataKey="positive" stroke={PURPLE_MID} strokeWidth={2} dot={false} name="Positive" />
                  <Line type="monotone" dataKey="neutral"  stroke={PURPLE_LIGHT} strokeWidth={2} dot={false} name="Neutral" />
                  <Line type="monotone" dataKey="negative" stroke={RED_NEG}     strokeWidth={1.5} dot={false} name="Negative" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 3. Metric stat cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border p-3 flex items-center gap-2" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              <div className="w-1 h-9 rounded-full" style={{ background: PURPLE_MID }} />
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Speech-to-Text Accuracy</p>
                <p className="text-2xl font-bold" style={{ color: PURPLE_DARK }}>
                  {sttAccuracy != null ? `${sttAccuracy}%` : "—"}
                </p>
              </div>
            </div>
            <StatCard label="Talk to Listen" value={talkListen} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Call Clarity" value={clarityScore} accent />
            <div className="rounded-xl border p-3 flex flex-col justify-center" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Talk-To-Listen Ratio</p>
              <p className="text-2xl font-bold" style={{ color: PURPLE_DARK }}>{talkListen}</p>
            </div>
          </div>

          {/* 5. Agent performance horizontal bars */}
          <div>
            <p className="text-[11px] font-semibold mb-1" style={{ color: PURPLE_DARK }}>Agent Performance</p>
            <ResponsiveContainer width="100%" height={70}>
              <BarChart data={agentPerfData} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis type="category" dataKey="agent" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={52} />
                <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, border: `1px solid ${PURPLE_LIGHT}` }} />
                <Bar dataKey="sentiment"  name="Avg Sentiment" fill={PURPLE_MID}   radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="talkRatio"  name="Talk/Listen"   fill={PURPLE_LIGHT} radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="automation" name="Automation %"  fill={PURPLE_FAINT} radius={[0, 3, 3, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ─────────────── RIGHT COLUMN ────────────────────────────────── */}
        <div className="space-y-4">

          {/* 2. Customer Sentiment Grid */}
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: PURPLE_DARK }}>Customer Sentiment</p>
            {customerTurns.length === 0 ? (
              <div className="h-20 rounded-lg flex items-center justify-center text-[11px] text-muted-foreground" style={{ background: PURPLE_FAINT }}>
                No customer turns yet
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {customerTurns.map((t, i) => (
                  <div
                    key={i}
                    title={`"${t.text.slice(0, 60)}" · score: ${t.sentimentScore.toFixed(2)}`}
                    style={{ width: 20, height: 20, borderRadius: 4, background: sentimentCellColor(t.sentimentScore), cursor: "default", flexShrink: 0 }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 4. Keyword Mentions */}
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: PURPLE_DARK }}>Keyword Mentions</p>
            {keywords.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No keywords detected</p>
            ) : (
              <div className="space-y-1.5">
                {keywords.map(({ keyword, count }) => {
                  const maxCount = keywords[0]?.count || 1;
                  return (
                    <div key={keyword} className="flex items-center gap-2">
                      <span className="text-[10px] w-14 text-right shrink-0 text-muted-foreground">{keyword}</span>
                      <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ background: PURPLE_FAINT }}>
                        <div style={{ width: `${Math.round((count / maxCount) * 100)}%`, height: "100%", background: PURPLE_MID, borderRadius: "9999px" }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground w-4 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 8. Automations from Voice */}
          <div>
            <p className="text-[11px] font-semibold mb-1" style={{ color: PURPLE_DARK }}>Automations from Voice</p>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={automationData.length ? automationData : [{ turn: 0, count: 0 }]} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis dataKey="turn" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                <Area type="monotone" dataKey="count" stroke={PURPLE_MID} strokeWidth={1.5} fill={PURPLE_FAINT} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 9. Trigger Count */}
          <div className="flex items-center gap-2">
            <span className="px-4 py-1 rounded-full text-white text-sm font-bold" style={{ background: PURPLE_MID }}>
              0
            </span>
            <span className="text-[11px] text-muted-foreground">Trigger Count</span>
          </div>
        </div>
      </div>

      {/* ── Agent performance full-width column chart ─────────────────────── */}
      <div className="px-4 pb-4 border-t pt-4" style={{ borderColor: "rgba(83,74,183,0.1)" }}>
        <p className="text-[11px] font-semibold mb-2" style={{ color: PURPLE_DARK }}>Agent Performance</p>
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={agentPerfData} margin={{ top: 4, right: 4, left: 0, bottom: 16 }}>
            <XAxis dataKey="agent" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis hide domain={[0, 100]} />
            <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, border: `1px solid ${PURPLE_LIGHT}` }} />
            <Bar dataKey="sentiment"  name="Average Sentiment" fill={PURPLE_MID}   radius={[3, 3, 0, 0]} />
            <Bar dataKey="talkRatio"  name="Talk-to-Ratio"    fill={PURPLE_LIGHT} radius={[3, 3, 0, 0]} />
            <Bar dataKey="automation" name="Automation Rate"  fill={PURPLE_FAINT} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1">
          {([["Average Sentiment", PURPLE_MID], ["Talk-to-Ratio", PURPLE_LIGHT], ["Automation Rate", PURPLE_FAINT]] as const).map(([label, color]) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
              <span className="text-[9px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Script adherence score ───────────────────────────────────────── */}
      {agg?.callSummary?.adherenceScore != null && (
        <div className="px-4 pb-4 border-t pt-4 space-y-2" style={{ borderColor: "rgba(83,74,183,0.1)" }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold" style={{ color: PURPLE_DARK }}>Script Adherence</p>
            <span className="text-lg font-bold" style={{ color: agg.callSummary.adherenceScore >= 75 ? GREEN : agg.callSummary.adherenceScore >= 50 ? PURPLE_MID : RED_NEG }}>
              {agg.callSummary.adherenceScore}<span className="text-[10px] font-normal text-muted-foreground">/100</span>
            </span>
          </div>
          {agg.callSummary.adherenceBreakdown && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(["Opening", "Objective", "Professionalism", "Closure"] as const).map((label) => {
                const key = `${label.toLowerCase()}Score` as keyof typeof agg.callSummary.adherenceBreakdown;
                const val = (agg.callSummary?.adherenceBreakdown as Record<string, number> | undefined)?.[key] ?? 0;
                return (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground w-20 shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(83,74,183,0.12)" }}>
                      <div className="h-full rounded-full" style={{ width: `${val}%`, background: val >= 75 ? GREEN : val >= 50 ? PURPLE_MID : RED_NEG }} />
                    </div>
                    <span className="text-[9px] font-mono w-5 text-right text-muted-foreground">{val}</span>
                  </div>
                );
              })}
            </div>
          )}
          {(agg.callSummary.adherenceFlags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {(agg.callSummary.adherenceFlags ?? []).map((flag: string) => (
                <span key={flag} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.1)", color: RED_NEG }}>{flag}</span>
              ))}
            </div>
          )}
          {(agg.callSummary.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(agg.callSummary.tags ?? []).map((tag: string) => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(124,111,247,0.12)", color: PURPLE_MID }}>#{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom sentiment counts ───────────────────────────────────────── */}
      {(agg?.totalTurns ?? 0) > 0 && (
        <div className="flex gap-4 px-4 pb-3 text-[10px]">
          <span style={{ color: GREEN }}>▲ {agg?.positiveCount ?? 0} positive</span>
          <span style={{ color: PURPLE_LIGHT }}>◆ {agg?.neutralCount ?? 0} neutral</span>
          <span style={{ color: RED_NEG }}>▼ {agg?.negativeCount ?? 0} negative</span>
          <span className="ml-auto text-muted-foreground">Total turns: {agg?.totalTurns ?? 0}</span>
        </div>
      )}
    </div>
  );
}
