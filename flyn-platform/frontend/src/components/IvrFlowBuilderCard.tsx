import React from "react";

export const IvrFlowBuilderCard: React.FC = () => {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{
        background: "#12121A",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "#F1F0FF" }}>
          IVR Flow Builder
        </p>
        <button
          disabled
          className="text-xs px-3 py-1.5 rounded-lg font-medium opacity-50 cursor-not-allowed"
          style={{
            background: "rgba(124,111,247,0.15)",
            color: "#7C6FF7",
            border: "1px solid rgba(124,111,247,0.2)",
          }}
          title="Coming Soon"
        >
          Visual Editor →
        </button>
      </div>

      {/* Flow nodes */}
      <div className="flex items-center gap-2 justify-center flex-wrap">
        {[
          { icon: "📞", label: "Inbound" },
          { icon: "🤖", label: "AI Greeting" },
          { icon: "🧠", label: "Intent NLP" },
        ].map((node, idx, arr) => (
          <React.Fragment key={idx}>
            <div
              className="rounded-lg px-3 py-2 text-center"
              style={{
                background: "#1A1A26",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="text-lg">{node.icon}</div>
              <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                {node.label}
              </p>
            </div>
            {idx < arr.length - 1 && (
              <span className="text-base" style={{ color: "#4B5563" }}>
                →
              </span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Avg Answer", value: "8s" },
          { label: "Abandon Rate", value: "4.8%" },
          { label: "FCR Rate", value: "78%" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg p-2 text-center"
            style={{ background: "#1A1A26" }}
          >
            <p className="text-xs font-bold" style={{ color: "#F1F0FF" }}>
              {stat.value}
            </p>
            <p className="text-[10px]" style={{ color: "#4B5563" }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Coming soon label */}
      <p className="text-center text-xs" style={{ color: "#4B5563" }}>
        Coming Soon
      </p>
    </div>
  );
};
