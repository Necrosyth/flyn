import React from "react";

interface AiAgentsCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agents: any[];
  activeCallAgentIds: string[];
}

const AVATAR_COLORS = [
  "#7C6FF7",
  "#60A5FA",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#A78BFA",
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash];
}

export const AiAgentsCard: React.FC<AiAgentsCardProps> = ({ agents, activeCallAgentIds }) => {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "#12121A",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "#9CA3AF" }}
        >
          AI Agents
        </p>
      </div>

      {/* Agent list */}
      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        {agents.length === 0 ? (
          <p className="px-4 py-3 text-xs" style={{ color: "#4B5563" }}>
            No agents configured.
          </p>
        ) : (
          agents.map((agent) => {
            const onCall = activeCallAgentIds.includes(agent.id);
            const isActive = agent.status === "active";

            return (
              <div
                key={agent.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors cursor-default hover:bg-white/5"
              >
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ background: avatarColor(agent.name ?? "?"), color: "#fff" }}
                >
                  {initials(agent.name ?? "?")}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "#F1F0FF" }}>
                    {agent.name}
                  </p>
                  {agent.description && (
                    <p className="text-[11px] truncate" style={{ color: "#4B5563" }}>
                      {agent.description}
                    </p>
                  )}
                </div>

                {/* Status badge */}
                {onCall ? (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1"
                    style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse inline-block"
                      style={{ background: "#F59E0B" }}
                    />
                    On call
                  </span>
                ) : isActive ? (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ background: "#22C55E" }}
                    />
                    Active
                  </span>
                ) : (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1"
                    style={{ background: "rgba(107,114,128,0.15)", color: "#6B7280" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full border inline-block"
                      style={{ borderColor: "#6B7280" }}
                    />
                    Standby
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
