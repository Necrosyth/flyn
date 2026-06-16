/**
 * PulseSurveyPage — Public employee pulse survey form.
 * Route: /surveys/pulse?id=<employeeId>&tid=<tenantId>  (no auth required)
 * Reached via link in email / WhatsApp from HR pulse survey send.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, AlertCircle, Heart } from "lucide-react";

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ?? "https://pjpmzvu7wn.us-east-1.awsapprunner.com/api";

const QUESTIONS: { key: keyof Scores; label: string; low: string; high: string }[] = [
  { key: "overallSatisfaction", label: "Overall Job Satisfaction", low: "Very unhappy", high: "Love my job" },
  { key: "workLifeBalance",     label: "Work-Life Balance",        low: "Very imbalanced", high: "Perfect balance" },
  { key: "managementRating",   label: "Management & Leadership",  low: "Needs improvement", high: "Excellent" },
  { key: "teamCohesion",       label: "Team Collaboration",       low: "Disconnected", high: "Highly cohesive" },
  { key: "growthOpportunities",label: "Growth Opportunities",     low: "Stagnating", high: "Thriving" },
];

interface Scores {
  overallSatisfaction: number;
  workLifeBalance: number;
  managementRating: number;
  teamCohesion: number;
  growthOpportunities: number;
}

const DEFAULT_SCORES: Scores = {
  overallSatisfaction: 70,
  workLifeBalance: 70,
  managementRating: 70,
  teamCohesion: 70,
  growthOpportunities: 70,
};

function scoreColor(v: number) {
  if (v >= 75) return "#22c55e";
  if (v >= 50) return "#f59e0b";
  return "#ef4444";
}

export default function PulseSurveyPage() {
  const [params] = useSearchParams();
  const employeeId = params.get("id") ?? "";
  const tenantId   = params.get("tid") ?? "";

  const [scores, setScores]       = useState<Scores>(DEFAULT_SCORES);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [error, setError]           = useState("");

  // Validate params on mount
  useEffect(() => {
    if (!employeeId || !tenantId) {
      setError("Invalid survey link. Please use the link sent to you by your HR team.");
    }
  }, [employeeId, tenantId]);

  const handleSlider = (key: keyof Scores, value: number) => {
    setScores(prev => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (!employeeId || !tenantId) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API}/hr/pulse-surveys/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, tenantId, scores }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !employeeId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-14 h-14 text-rose-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-800">Invalid Survey Link</h1>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-5 bg-white rounded-3xl shadow-xl p-10">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-9 h-9 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Thank you!</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Your feedback has been recorded. Your responses are anonymous and help your HR team make things better for everyone.
          </p>
          <div className="grid grid-cols-1 gap-2 text-left mt-4">
            {QUESTIONS.map(q => (
              <div key={q.key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-xs text-slate-500">{q.label}</span>
                <span className="text-sm font-bold" style={{ color: scoreColor(scores[q.key]) }}>
                  {scores[q.key]}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-7 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Flyn HR</span>
          </div>
          <h1 className="text-2xl font-bold">Quick Pulse Check-in</h1>
          <p className="text-indigo-200 text-sm mt-1">Takes about 1 minute · Responses are confidential</p>
        </div>

        {/* Form */}
        <div className="px-8 py-6 space-y-7">
          {QUESTIONS.map((q, i) => (
            <div key={q.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-800">
                  {i + 1}. {q.label}
                </label>
                <span
                  className="text-sm font-black tabular-nums w-10 text-right"
                  style={{ color: scoreColor(scores[q.key]) }}
                >
                  {scores[q.key]}%
                </span>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={scores[q.key]}
                  onChange={e => handleSlider(q.key, Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${scoreColor(scores[q.key])} ${scores[q.key]}%, #e2e8f0 ${scores[q.key]}%)`,
                  }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                <span>{q.low}</span>
                <span>{q.high}</span>
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-sm bg-rose-50 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
            ) : (
              "Submit My Feedback"
            )}
          </Button>

          <p className="text-center text-[10px] text-slate-400">
            Powered by Flyn AI · Your responses are encrypted and only visible to your HR admin
          </p>
        </div>
      </div>
    </div>
  );
}
