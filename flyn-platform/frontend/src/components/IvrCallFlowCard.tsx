import React from "react";
import {
  Phone,
  Bot,
  GitBranch,
  ArrowRight,
  FileText,
  Star,
} from "lucide-react";

const STEPS = [
  { Icon: Phone, label: "Inbound call received" },
  { Icon: Bot, label: "AI Greeter plays welcome" },
  { Icon: GitBranch, label: "Intent detection · Routing" },
  { Icon: ArrowRight, label: "Forward to agent / AI" },
  { Icon: FileText, label: "Transcription + Sentiment" },
  { Icon: Star, label: "QA Score + CRM Log" },
];

export const IvrCallFlowCard: React.FC = () => {
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
          IVR Call Flow
        </p>
      </div>

      {/* Steps */}
      <div className="px-4 py-3">
        {STEPS.map((step, idx) => {
          const { Icon } = step;
          const isLast = idx === STEPS.length - 1;
          return (
            <div key={idx} className="flex items-stretch gap-3">
              {/* Left connector column */}
              <div className="flex flex-col items-center">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(124,111,247,0.15)" }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: "#7C6FF7" }} />
                </div>
                {!isLast && (
                  <div
                    className="w-px flex-1 my-0.5"
                    style={{
                      borderLeft: "1px dotted rgba(124,111,247,0.3)",
                      minHeight: 12,
                    }}
                  />
                )}
              </div>

              {/* Step text */}
              <div className={`flex items-center ${isLast ? "pb-0" : "pb-2"}`}>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: "#4B5563" }}
                  >
                    {idx + 1}.
                  </span>
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>
                    {step.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
