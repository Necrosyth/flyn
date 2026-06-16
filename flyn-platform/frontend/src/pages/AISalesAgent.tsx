/**
 * AI Sales & Support Agent
 *
 * Tabs:
 *  - Pipeline Assistant : analyze deals, suggest next steps
 *  - Proposal Generator  : AI-written proposals from deal details
 *  - Follow-up Sequences : email/WhatsApp follow-up drafts
 */

import { useState } from "react";
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
  TrendingUp, Sparkles, Copy, Loader2,
  Target, FileText, Mail, ChevronRight,
  DollarSign, Users, Clock, Zap,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

// ─── AI helper ────────────────────────────────────────────────────────────────

async function callAI(prompt: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/orchestrator/demo-ai-router`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: { ticket_text: prompt, customer_name: "Sales AI", channel: "sales" },
        mock: false,
      }),
    });
    if (res.ok) {
      const data = await res.json() as { context?: { response?: string } };
      if (data.context?.response) return data.context.response;
    }
  } catch { /* fall through */ }
  return mockSalesResponse(prompt);
}

function mockSalesResponse(prompt: string): string {
  if (prompt.toLowerCase().includes("next step") || prompt.toLowerCase().includes("deal")) {
    return `## Deal Analysis\n\n**Current Stage:** Negotiation\n**Win Probability:** 68%\n\n### Recommended Next Steps:\n\n1. **Send ROI calculator** — This prospect is value-driven. A 1-page ROI breakdown showing payback period in <3 months will accelerate the decision.\n\n2. **Schedule a technical deep-dive** — Their CTO has concerns about integration. Bring your tech lead to the next call.\n\n3. **Create urgency** — Their Q1 budget closes in 18 days. Reference the implementation timeline to make the case for moving now.\n\n4. **Address the security objection** — They asked about SOC 2. Send the compliance overview from your trust center.\n\n### Risk Factors:\n- Competitor evaluation ongoing (Salesforce)\n- 3-person buying committee (get all stakeholders aligned)\n\n### Suggested Message:\n> "Hi [Name], following up on our last conversation — I wanted to share the ROI breakdown our team put together based on your team size and current workflow. Customers like [Similar Company] typically see a 340% ROI in year one. Worth 20 minutes this week?"`;
  }
  if (prompt.toLowerCase().includes("proposal")) {
    return `# Proposal: [Solution Name] for [Company Name]\n\n**Prepared by:** [Your Name], [Title]\n**Date:** ${new Date().toLocaleDateString()}\n**Valid until:** ${new Date(Date.now() + 30 * 86400000).toLocaleDateString()}\n\n---\n\n## Executive Summary\n\n[Company Name] is looking to [core problem]. This proposal outlines how [Your Company] will solve that challenge, deliver measurable ROI, and integrate seamlessly with your existing stack.\n\n## The Challenge\n\nYour team currently spends approximately **X hours/week** on manual processes that we can automate. This costs an estimated **$XX,000/year** in lost productivity.\n\n## Our Solution\n\n| Feature | Benefit |\n|---------|--------|\n| Feature 1 | Outcome 1 |\n| Feature 2 | Outcome 2 |\n| Feature 3 | Outcome 3 |\n\n## Investment\n\n| Plan | Monthly | Annual (save 20%) |\n|------|---------|------------------|\n| Starter | $X/mo | $X/yr |\n| Growth | $X/mo | $X/yr |\n\n## Timeline\n\n- Week 1: Onboarding & setup\n- Week 2: Integration & testing\n- Week 3: Team training\n- Week 4: Go-live\n\n## Next Steps\n\n1. Sign agreement\n2. Schedule kickoff call\n3. Send technical requirements\n\n*This proposal is valid for 30 days.*`;
  }
  if (prompt.toLowerCase().includes("follow") || prompt.toLowerCase().includes("sequence")) {
    return `## 5-Touch Follow-up Sequence\n\n**Day 1 — Same Day:**\n> "Hi [Name], great speaking with you today! As promised, I've attached [resource]. Let me know if you have questions — happy to jump on a quick call.\n> — [Your Name]"\n\n**Day 3 — Value Add:**\n> "Hi [Name], thought you'd find this useful: [relevant case study / insight]. It's directly relevant to the challenge you mentioned around [pain point]. Any questions as you evaluate options?"\n\n**Day 7 — Soft Check-in:**\n> "Hey [Name], just checking in! Have you had a chance to look at [resource]? Happy to schedule a follow-up or answer any questions the team has."\n\n**Day 14 — New Angle:**\n> "Hi [Name], I wanted to share something new — [new feature / announcement / relevant news]. This addresses exactly what [Company] was looking for. Worth a quick catch-up?"\n\n**Day 21 — Break-up:**\n> "Hi [Name], I don't want to keep filling your inbox. I'll close the loop here — but if [key outcome] ever becomes a priority, I'm here. Wishing [Company] continued success! 🙌"`;
  }
  return `Here is an AI-generated sales response for: "${prompt.slice(0, 50)}"...\n\nBased on your request, here are the key recommendations:\n\n1. Focus on the customer's core pain point\n2. Lead with value, not features\n3. Create a clear call-to-action\n4. Follow up within 24 hours\n\nWould you like me to refine this for a specific context?`;
}

// ─── Pipeline Assistant Panel ─────────────────────────────────────────────────

const DEAL_STAGES = ["Lead", "Qualified", "Proposal Sent", "Negotiation", "Closing", "Won", "Lost"];
const DEAL_SIZES = ["< $1K", "$1K–$10K", "$10K–$50K", "$50K–$200K", "$200K+"];

const PipelinePanel = () => {
  const [dealName, setDealName] = useState("");
  const [stage, setStage] = useState(DEAL_STAGES[2]);
  const [dealSize, setDealSize] = useState(DEAL_SIZES[1]);
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const { toast } = useToast();

  const analyze = async () => {
    if (!dealName.trim()) return;
    setGenerating(true);
    try {
      const prompt = `Analyze this deal and suggest next steps: Deal "${dealName}", Stage: ${stage}, Size: ${dealSize}. ${notes ? `Notes: ${notes}` : ""}. What are the next best actions to advance and close this deal?`;
      const analysis = await callAI(prompt);
      setResult(analysis);
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
              <Target className="w-4 h-4 text-orange-400" /> Deal Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Deal / Company name</Label>
              <Input value={dealName} onChange={e => setDealName(e.target.value)} placeholder="e.g. Acme Corp — CRM Upgrade" className="bg-muted/40 border-border text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Stage</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{DEAL_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Deal size</Label>
                <Select value={dealSize} onValueChange={setDealSize}>
                  <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{DEAL_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Current situation / blockers</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What's stalling the deal? Competitor involved? Key stakeholders? Objections heard?" className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" />
            </div>
            <Button onClick={analyze} disabled={!dealName.trim() || generating} className="w-full bg-orange-600 hover:bg-orange-500 text-white text-sm">
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {generating ? "Analyzing…" : "Analyze Deal"}
            </Button>
          </CardContent>
        </Card>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: DollarSign, label: "Open Deals", value: "—", color: "text-orange-400" },
            { icon: Users, label: "In Pipeline", value: "—", color: "text-blue-400" },
            { icon: Clock, label: "Avg Cycle", value: "—", color: "text-violet-400" },
          ].map((s, i) => (
            <Card key={i} className="bg-muted/40 border-border">
              <CardContent className="p-3.5">
                <s.icon className={`w-4 h-4 ${s.color} mb-1.5`} />
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        {result ? (
          <Card className="bg-muted/40 border-border h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">AI Recommendations</CardTitle>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(result); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea value={result} onChange={e => setResult(e.target.value)} className="bg-muted/40 border-border text-sm leading-relaxed min-h-[420px] resize-none font-sans" />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8">
            <Target className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Deal analysis will appear here</p>
            <p className="text-xs text-muted-foreground mt-1">Fill in the deal details and click Analyze</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Proposal Generator Panel ─────────────────────────────────────────────────

const ProposalPanel = () => {
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [pain, setPain] = useState("");
  const [price, setPrice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState("");
  const { toast } = useToast();

  const generate = async () => {
    if (!company.trim()) return;
    setGenerating(true);
    try {
      const prompt = `Write a professional sales proposal for ${company}. Product/service: ${product}. Customer pain point: ${pain}. Pricing: ${price}.`;
      const result = await callAI(prompt);
      setProposal(result);
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
              <FileText className="w-4 h-4 text-blue-400" /> Proposal Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Prospect company *</Label>
                <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" className="bg-muted/40 border-border text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Product / service</Label>
                <Input value={product} onChange={e => setProduct(e.target.value)} placeholder="CRM + AI automation platform" className="bg-muted/40 border-border text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Their main pain point</Label>
                <Textarea value={pain} onChange={e => setPain(e.target.value)} placeholder="Manual follow-ups taking 10+ hours/week, losing deals to faster competitors…" className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Pricing / plan</Label>
                <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="$299/month Growth plan" className="bg-muted/40 border-border text-sm" />
              </div>
            </div>
            <Button onClick={generate} disabled={!company.trim() || generating} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm">
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {generating ? "Writing proposal…" : "Generate Proposal"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        {proposal ? (
          <Card className="bg-muted/40 border-border h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">Generated Proposal</CardTitle>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(proposal); toast({ title: "Copied" }); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea value={proposal} onChange={e => setProposal(e.target.value)} className="bg-muted/40 border-border text-sm leading-relaxed min-h-[480px] resize-none font-mono text-xs" />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8">
            <FileText className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Your proposal will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Follow-up Sequences Panel ────────────────────────────────────────────────

const SEQUENCE_TYPES = ["Cold Prospect", "After Demo", "Post-Proposal", "Stalled Deal", "Won Deal (Upsell)", "Lost Deal (Re-engage)"];

const FollowUpPanel = () => {
  const [seqType, setSeqType] = useState(SEQUENCE_TYPES[1]);
  const [channel, setChannel] = useState("email");
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sequences, setSequences] = useState<{ id: string; type: string; content: string }[]>([]);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const prompt = `Write a ${channel} follow-up sequence for: ${seqType}. ${context ? `Context: ${context}` : ""}`;
      const result = await callAI(prompt);
      setSequences(prev => [{ id: `seq${Date.now()}`, type: seqType, content: result }, ...prev]);
      toast({ title: "Sequence generated" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mail className="w-4 h-4 text-violet-400" /> Follow-up Sequences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sequence type</Label>
              <Select value={seqType} onValueChange={setSeqType}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SEQUENCE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Context (product, ICP, key pain)</Label>
            <Textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Our product helps B2B SaaS companies reduce churn by 40%…" className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" />
          </div>
          <Button onClick={generate} disabled={generating} className="bg-violet-600 hover:bg-violet-500 text-white text-sm">
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
            {generating ? "Writing sequence…" : "Generate Sequence"}
          </Button>
        </CardContent>
      </Card>

      {sequences.map(s => (
        <Card key={s.id} className="bg-muted/40 border-border">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/20 text-[10px]">{s.type}</Badge>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(s.content); toast({ title: "Copied" }); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">{s.content}</pre>
          </CardContent>
        </Card>
      ))}

      {sequences.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8">
          <Mail className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Generated sequences will appear here</p>
        </div>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "pipeline" | "proposal" | "followup";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "pipeline", label: "Pipeline Assistant", icon: <Target className="w-4 h-4" /> },
  { id: "proposal", label: "Proposal Generator", icon: <FileText className="w-4 h-4" /> },
  { id: "followup", label: "Follow-up Sequences", icon: <Mail className="w-4 h-4" /> },
];

const AISalesAgent = () => {
  const [tab, setTab] = useState<Tab>("pipeline");

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-600/10 via-amber-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/20">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Sales Agent</h1>
                <p className="text-muted-foreground text-sm">Deal analysis, proposal writing & follow-up sequences — all AI-powered</p>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t.id ? "text-orange-400 border-orange-400" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="px-8 pb-10">
          {tab === "pipeline" && <PipelinePanel />}
          {tab === "proposal" && <ProposalPanel />}
          {tab === "followup" && <FollowUpPanel />}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default AISalesAgent;
