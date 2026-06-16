import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Workflow, CheckCircle2, MessageCircle, PhoneCall, XCircle, Zap, ChevronRight } from "lucide-react";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";

// ── Preset dialer call intelligence flow templates ────────────────────────────

const DIALER_PRESET_FLOWS = [
  {
    name: "Sales Qualifier",
    nodes: [
      { id: "n1", type: "trigger",       name: "Call Ended",          position: { x: 80,  y: 150 }, config: { trigger_type: "event", event_name: "call.ended" } },
      { id: "n2", type: "ai_decision",   name: "Positive Sentiment?", position: { x: 320, y: 150 }, config: { ai_task: "sentiment", prompt: "Was the caller's tone positive and did they express genuine interest?" } },
      { id: "n3", type: "crm",           name: "Mark as Qualified",   position: { x: 580, y: 60  }, config: { operation: "update_contact", op_fields: { tags: "qualified, hot-lead" } } },
      { id: "n4", type: "send_whatsapp", name: "Follow-up WhatsApp",  position: { x: 830, y: 60  }, config: { message_type: "plain_text", message: "Hi! Thanks for your time on the call. Here's a quick summary of what we discussed — happy to answer any questions!" } },
      { id: "n5", type: "crm",           name: "Mark Not Interested", position: { x: 580, y: 260 }, config: { operation: "update_contact", op_fields: { tags: "not-interested" } } },
      { id: "n6", type: "end",           name: "End",                 position: { x: 1080, y: 60  }, config: {} },
      { id: "n7", type: "end",           name: "End",                 position: { x: 830, y: 260 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", sourceHandle: "true"  },
      { id: "e3", source: "n2", target: "n5", sourceHandle: "false" },
      { id: "e4", source: "n3", target: "n4" },
      { id: "e5", source: "n4", target: "n6" },
      { id: "e6", source: "n5", target: "n7" },
    ],
  },
  {
    name: "Missed Call Recovery",
    nodes: [
      { id: "n1", type: "trigger",       name: "Call Missed",        position: { x: 80,  y: 150 }, config: { trigger_type: "event", event_name: "call.no-answer" } },
      { id: "n2", type: "send_whatsapp", name: "First Miss Text",    position: { x: 340, y: 80  }, config: { message_type: "plain_text", message: "Hi! We tried reaching you just now. When would be a good time for a quick call?" } },
      { id: "n3", type: "action",        name: "Schedule Callback",  position: { x: 340, y: 240 }, config: { action_type: "notification", description: "Schedule callback in 1 day" } },
      { id: "n4", type: "end",           name: "End",                position: { x: 600, y: 80  }, config: {} },
      { id: "n5", type: "end",           name: "End",                position: { x: 600, y: 240 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n1", target: "n3" },
      { id: "e3", source: "n2", target: "n4" },
      { id: "e4", source: "n3", target: "n5" },
    ],
  },
  {
    name: "Hot Lead Fast Track",
    nodes: [
      { id: "n1", type: "trigger",       name: "Call Ended",            position: { x: 80,  y: 150 }, config: { trigger_type: "event", event_name: "call.ended" } },
      { id: "n2", type: "ai_decision",   name: "Buying Signal?",        position: { x: 320, y: 150 }, config: { ai_task: "sentiment", prompt: "Did the caller mention pricing, booking, purchasing, or express urgency?" } },
      { id: "n3", type: "crm",           name: "Move to Hot Leads",     position: { x: 580, y: 60  }, config: { operation: "update_contact", op_fields: { tags: "buying-signal, urgent" } } },
      { id: "n4", type: "send_whatsapp", name: "Instant Follow-up",     position: { x: 830, y: 60  }, config: { message_type: "plain_text", message: "Hey! Great speaking with you. I've put together something special for you — checking your inbox?" } },
      { id: "n5", type: "end",           name: "End",                   position: { x: 1080, y: 60  }, config: {} },
      { id: "n6", type: "end",           name: "Skip",                  position: { x: 580, y: 260 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3", sourceHandle: "true"  },
      { id: "e3", source: "n2", target: "n6", sourceHandle: "false" },
      { id: "e4", source: "n3", target: "n4" },
      { id: "e5", source: "n4", target: "n5" },
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlowStats {
  totalExecutions: number;
  todayExecutions: number;
  qualified: number;
  followupsSent: number;
  callbacksScheduled: number;
  dismissed: number;
  lastTriggeredAt: number | null;
}

interface ActiveFlow {
  name: string;
  nodes: unknown[];
  edges: unknown[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CallIntelligenceCard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<FlowStats | null>(null);
  const [activeFlow, setActiveFlow] = useState<ActiveFlow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [flowRes, statsRes] = await Promise.all([
        authedFetch(`${API_BASE_URL}/channels/twilio/call-flow`),
        authedFetch(`${API_BASE_URL}/channels/twilio/call-flow/stats`),
      ]);
      if (flowRes.ok) {
        const d = await flowRes.json() as { flow: ActiveFlow | null };
        setActiveFlow(d.flow);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json() as FlowStats);
      }
    } catch { /* non-blocking */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openBuilder = (preset?: typeof DIALER_PRESET_FLOWS[number]) => {
    if (preset) {
      navigate("/automations", {
        state: { presetFlow: preset, workflowName: preset.name },
      });
    } else if (activeFlow) {
      navigate("/automations", {
        state: { presetFlow: activeFlow, workflowName: activeFlow.name },
      });
    } else {
      navigate("/automations", {
        state: { presetFlow: DIALER_PRESET_FLOWS[0], workflowName: DIALER_PRESET_FLOWS[0].name },
      });
    }
  };

  const STAT_ROWS = stats ? [
    { icon: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />, label: "Qualified today", value: stats.qualified },
    { icon: <MessageCircle className="w-3.5 h-3.5" style={{ color: "#60A5FA" }} />, label: "Follow-ups sent", value: stats.followupsSent },
    { icon: <PhoneCall    className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />, label: "Callbacks scheduled", value: stats.callbacksScheduled },
    { icon: <XCircle      className="w-3.5 h-3.5 text-muted-foreground" />, label: "Dismissed", value: stats.dismissed },
  ] : [];

  return (
    <div className="rounded-xl flex flex-col overflow-hidden bg-card border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Call Intelligence</p>
        </div>
        <button
          onClick={() => openBuilder()}
          className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: "#7C6FF7", border: "1px solid rgba(124,111,247,0.25)" }}
        >
          Open Flow Builder <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#534AB7" }} />
        </div>
      ) : (
        <div className="p-4 space-y-4">

          {/* Active flow status */}
          <div
            className="rounded-lg px-3 py-2.5 flex items-center justify-between"
            style={{ background: "rgba(124,111,247,0.07)", border: "1px solid rgba(124,111,247,0.15)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Workflow className="w-3.5 h-3.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate text-foreground">
                  {activeFlow?.name ?? "No active flow"}
                </p>
                {activeFlow && (
                  <p className="text-[10px] text-muted-foreground">
                    {(activeFlow.nodes as unknown[]).length} nodes
                    {stats?.lastTriggeredAt ? ` · triggered ${timeAgo(stats.lastTriggeredAt)}` : ""}
                  </p>
                )}
              </div>
            </div>
            {activeFlow && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0"
                style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}
              >
                ACTIVE
              </span>
            )}
          </div>

          {/* Today's stats */}
          {stats && stats.todayExecutions > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Today</p>
              <div className="grid grid-cols-2 gap-1.5">
                {STAT_ROWS.map(r => (
                  <div
                    key={r.label}
                    className="rounded-lg px-2.5 py-2 flex items-center gap-2 bg-muted/40"
                  >
                    {r.icon}
                    <div>
                      <p className="text-xs font-semibold text-foreground">{r.value}</p>
                      <p className="text-[9px] leading-tight text-muted-foreground">{r.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preset templates */}
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {activeFlow ? "Switch Template" : "Start with a Template"}
            </p>
            {DIALER_PRESET_FLOWS.map(preset => (
              <button
                key={preset.name}
                onClick={() => openBuilder(preset)}
                className="w-full text-left rounded-lg px-3 py-2 flex items-center justify-between transition-colors hover:bg-muted/50 border border-border"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">{preset.name}</p>
                  <p className="text-[10px] text-muted-foreground">{preset.nodes.length} nodes</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>

        </div>
      )}
    </div>
  );
};
