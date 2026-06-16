/**
 * AI HR Co-pilot
 *
 * Tabs:
 *  - Policy Q&A    : ask HR policy questions, get AI-answered
 *  - Letter Drafting: offer letters, warnings, termination letters
 *  - Performance   : OKR summaries, review templates
 */

import { useState } from "react";
import { withPlanGate } from "@/components/PlanGate";
import { motion } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users2, Sparkles, Copy, Loader2,
  BookOpen, FileSignature, BarChart2, MessageCircle,
  Shield, Award,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";

// ─── AI helper — calls real HR AI endpoint ───────────────────────────────────

async function callAI(prompt: string, category?: string): Promise<string> {
  try {
    const res = await authedFetch(`${API_BASE_URL}/hr/ai/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: prompt, category }),
    });
    if (res.ok) {
      const data = await res.json() as { response?: string; answer?: string };
      if (data.response) return data.response;
      if (data.answer) return data.answer;
    }
  } catch { /* fall through */ }
  return "AI service is currently unavailable. Please try again later.";
}

// ─── Policy Q&A Panel ─────────────────────────────────────────────────────────

interface QAEntry { id: string; question: string; answer: string; }

const PolicyQAPanel = () => {
  const [question, setQuestion] = useState("");
  const [generating, setGenerating] = useState(false);
  const [entries, setEntries] = useState<QAEntry[]>([]);
  const { toast } = useToast();

  const SAMPLE_QUESTIONS = [
    "How many days of annual leave are employees entitled to?",
    "What is the process for requesting a leave of absence?",
    "What is our policy on remote work / work from home?",
    "How does the disciplinary process work?",
    "What happens to unused vacation days at year end?",
  ];

  const ask = async (q = question) => {
    if (!q.trim()) return;
    setGenerating(true);
    try {
      const answer = await callAI(`HR policy question: ${q}`, 'policy');
      setEntries(prev => [{ id: `qa${Date.now()}`, question: q, answer }, ...prev]);
      setQuestion("");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" /> HR Policy Q&A
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ask an HR policy question</Label>
            <div className="flex gap-2">
              <Input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} placeholder="e.g. How many sick days are employees entitled to?" className="bg-muted/40 border-border text-sm flex-1" />
              <Button onClick={() => ask()} disabled={!question.trim() || generating} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">Quick questions</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_QUESTIONS.map(q => (
                <button key={q} onClick={() => ask(q)} className="text-xs px-2.5 py-1 rounded-lg bg-muted/40 border border-border text-foreground hover:bg-muted transition-colors text-left">
                  {q}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {entries.map(e => (
        <Card key={e.id} className="bg-muted/40 border-border">
          <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{e.question}</p>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0" onClick={() => { navigator.clipboard.writeText(e.answer); toast({ title: "Copied" }); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">{e.answer}</pre>
          </CardContent>
        </Card>
      ))}

      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8">
          <BookOpen className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Ask a policy question or click a quick question above</p>
        </div>
      )}
    </div>
  );
};

// ─── Letter Drafting Panel ─────────────────────────────────────────────────────

const LETTER_TYPES = [
  "Offer Letter",
  "Employment Contract Summary",
  "Probation Confirmation",
  "Salary Increase Letter",
  "Promotion Letter",
  "Written Warning",
  "Final Warning",
  "Termination Letter",
  "Reference Letter",
  "Leave Approval Letter",
];

const LetterPanel = () => {
  const [letterType, setLetterType] = useState(LETTER_TYPES[0]);
  const [employeeName, setEmployeeName] = useState("");
  const [role, setRole] = useState("");
  const [details, setDetails] = useState("");
  const [generating, setGenerating] = useState(false);
  const [letter, setLetter] = useState("");
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const prompt = `Draft a professional HR ${letterType} for employee: ${employeeName || "[Employee Name]"}. Role/Title: ${role || "[Role]"}. Additional details: ${details || "standard terms"}. Please write a complete, ready-to-use letter with proper formatting, salutation, body paragraphs, and sign-off.`;
      const result = await callAI(prompt, 'document');
      setLetter(result);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-rose-400" /> Letter Drafting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Letter type</Label>
              <Select value={letterType} onValueChange={setLetterType}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{LETTER_TYPES.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Employee name</Label>
                <Input value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder="John Smith" className="bg-muted/40 border-border text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Role / title</Label>
                <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Senior Developer" className="bg-muted/40 border-border text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Additional details</Label>
              <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Salary, start date, specific issues, performance metrics, reasons…" className="bg-muted/40 border-border text-sm min-h-[100px] resize-none" />
            </div>
            <Button onClick={generate} disabled={generating} className="w-full bg-rose-600 hover:bg-rose-500 text-white text-sm">
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {generating ? "Drafting letter…" : "Draft Letter"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        {letter ? (
          <Card className="bg-muted/40 border-border h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">{letterType}</CardTitle>
                {employeeName && <p className="text-xs text-muted-foreground mt-0.5">For: {employeeName}{role ? ` · ${role}` : ""}</p>}
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(letter); toast({ title: "Copied to clipboard" }); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea value={letter} onChange={e => setLetter(e.target.value)} className="bg-muted/40 border-border text-sm leading-relaxed min-h-[480px] resize-none font-mono text-xs" />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8">
            <FileSignature className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Your drafted letter will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Performance Panel ────────────────────────────────────────────────────────

const PerformancePanel = () => {
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("Q1 2025");
  const [achievements, setAchievements] = useState("");
  const [areas, setAreas] = useState("");
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState("");
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const prompt = `Write a detailed, structured performance review for ${name || "the employee"} covering the period ${period}. Key achievements this period: ${achievements || "to be assessed"}. Areas for development: ${areas || "to be identified"}. Include: overall rating, competency scores, development plan, manager comments section, and specific actionable feedback.`;
      const result = await callAI(prompt, 'performance');
      setReview(result);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" /> Performance Review Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Employee name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" className="bg-muted/40 border-border text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Review period</Label>
                <Input value={period} onChange={e => setPeriod(e.target.value)} placeholder="Q1 2025 / Annual" className="bg-muted/40 border-border text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Key achievements this period</Label>
              <Textarea value={achievements} onChange={e => setAchievements(e.target.value)} placeholder="Launched new onboarding flow, reduced churn by 12%, mentored 2 junior devs…" className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Areas for development</Label>
              <Textarea value={areas} onChange={e => setAreas(e.target.value)} placeholder="Communication with stakeholders, time management on large projects…" className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" />
            </div>
            <Button onClick={generate} disabled={generating} className="w-full bg-amber-600 hover:bg-amber-500 text-white text-sm">
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {generating ? "Generating…" : "Generate Review"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        {review ? (
          <Card className="bg-muted/40 border-border h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">Performance Review</CardTitle>
                {name && <p className="text-xs text-muted-foreground mt-0.5">{name} · {period}</p>}
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(review); toast({ title: "Copied" }); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea value={review} onChange={e => setReview(e.target.value)} className="bg-muted/40 border-border text-sm leading-relaxed min-h-[480px] resize-none font-mono text-xs" />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8">
            <BarChart2 className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Generated performance review will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "policy" | "letters" | "performance";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "policy", label: "Policy Q&A", icon: <BookOpen className="w-4 h-4" /> },
  { id: "letters", label: "Letter Drafting", icon: <FileSignature className="w-4 h-4" /> },
  { id: "performance", label: "Performance", icon: <BarChart2 className="w-4 h-4" /> },
];

const AIHRCopilot = () => {
  const [tab, setTab] = useState<Tab>("policy");

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-600/10 via-pink-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/20">
                <Users2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">AI HR Co-pilot</h1>
                <p className="text-muted-foreground text-sm">Policy Q&A, letter drafting & performance review templates</p>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t.id ? "text-rose-400 border-rose-400" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="px-8 pb-10">
          {tab === "policy" && <PolicyQAPanel />}
          {tab === "letters" && <LetterPanel />}
          {tab === "performance" && <PerformancePanel />}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("modules.hr")(AIHRCopilot);
