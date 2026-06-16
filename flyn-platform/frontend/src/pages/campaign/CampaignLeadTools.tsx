/**
 * Campaign Manager — Lead Scoring + Activity panels.
 * Moved here from the retired AI Marketing section. Lead scoring writes a
 * tier-tagged CRM contact (via /smart-agents/marketing/score-lead) which then
 * feeds Campaign Manager's audience selection. Connected to AI Agents: pick the
 * agent that qualifies leads + jump to its config in the AI Agents hub.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Target, Sparkles, Loader2, Send, Zap, Clock, Copy, Brain, RefreshCw, Activity as ActivityIcon, CheckCircle2, Bot, ExternalLink } from "lucide-react";
import { agentsApi } from "@/lib/smartAgentsApi";
import { useAgentStore } from "@/hooks/useAgentStore";

interface LeadScore { score: number; tier: "hot"|"warm"|"cold"; reasoning: string; nextAction: string; }
interface DripStep { step: number; delayHours: number; channel: string; message: string; }
interface AgentActivity { id: string; action: string; detail?: string; outcome?: string; timestamp: number | string; }

const QUAL_AGENT_KEY = "flyn.qualificationAgentId";

export const LeadScoringPanel = () => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", budget: "", timeline: "", message: "", source: "website", isDecisionMaker: false, repliedWithinHour: false, clickedLink: false, askedSpecificQuestion: false });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LeadScore|null>(null);
  const [drip, setDrip] = useState<DripStep[]>([]);
  const [loadingDrip, setLoadingDrip] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { agents, fetchAgents } = useAgentStore();
  const [qualAgent, setQualAgent] = useState<string>(() => localStorage.getItem(QUAL_AGENT_KEY) || "");

  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  const onPickAgent = (id: string) => { setQualAgent(id); localStorage.setItem(QUAL_AGENT_KEY, id); };

  const score = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const res = await agentsApi.scoreLead({ name: form.name, email: form.email, phone: form.phone, budget: form.budget, timeline: form.timeline, message: form.message, source: form.source, isDecisionMaker: form.isDecisionMaker, repliedWithinHour: form.repliedWithinHour, clickedLink: form.clickedLink, askedSpecificQuestion: form.askedSpecificQuestion });
      setResult(res);
      toast({ title: `Lead scored: ${res.score}/10 (${res.tier})`, description: "Added to CRM — target it in a campaign's audience" });
    } catch {
      toast({ title: "Scoring failed", description: "Check backend connection", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const getDrip = async (tier: "hot"|"warm"|"cold") => {
    setLoadingDrip(true);
    try { setDrip(await agentsApi.getDripSequence(tier)); }
    catch { toast({ title: "Failed to generate drip", variant: "destructive" }); }
    finally { setLoadingDrip(false); }
  };

  const tierColor = { hot: "bg-red-500/15 text-red-400 border-red-500/20", warm: "bg-amber-500/15 text-amber-400 border-amber-500/20", cold: "bg-blue-500/15 text-blue-400 border-blue-500/20" };

  return (
    <div className="space-y-4 pt-2">
      {/* Qualification agent (connected to AI Agents) */}
      <Card className="bg-muted/40 border-border">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="p-2 rounded-lg bg-violet-600 flex-shrink-0"><Bot className="w-4 h-4 text-white" /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Qualification Agent</p>
              <p className="text-xs text-muted-foreground">The AI agent that follows up scored leads (used for Call campaigns).</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={qualAgent} onValueChange={onPickAgent}>
              <SelectTrigger className="bg-muted/40 border-border text-sm w-48"><SelectValue placeholder="Choose an agent" /></SelectTrigger>
              <SelectContent>
                {agents.length === 0 && <SelectItem value="none" disabled>No agents yet</SelectItem>}
                {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="border-border text-xs gap-1" onClick={() => navigate("/ai-agents")}>
              Configure <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card className="bg-muted/40 border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Target className="w-4 h-4 text-rose-400" />Lead Scoring Engine</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2"><Label className="text-xs text-muted-foreground">Lead Name *</Label><Input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="John Smith" className="bg-muted/40 border-border text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email</Label><Input value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="john@acme.com" className="bg-muted/40 border-border text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone</Label><Input value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="+1 555 123 4567" className="bg-muted/40 border-border text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Budget</Label><Input value={form.budget} onChange={e => setForm(f=>({...f,budget:e.target.value}))} placeholder="$5,000/month" className="bg-muted/40 border-border text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Timeline</Label><Input value={form.timeline} onChange={e => setForm(f=>({...f,timeline:e.target.value}))} placeholder="ASAP / 30 days" className="bg-muted/40 border-border text-sm" /></div>
                <div className="space-y-1.5 col-span-2"><Label className="text-xs text-muted-foreground">Source</Label>
                  <Select value={form.source} onValueChange={v=>setForm(f=>({...f,source:v}))}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="website">Website</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="referral">Referral</SelectItem><SelectItem value="social">Social</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Lead's Message</Label><Textarea value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))} placeholder="What they said…" className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                {([["isDecisionMaker","Decision Maker?"],["repliedWithinHour","Replied <1h?"],["clickedLink","Clicked Link?"],["askedSpecificQuestion","Asked Specific Q?"]] as [keyof typeof form, string][]).map(([key,label])=>(
                  <div key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Switch checked={!!form[key]} onCheckedChange={v=>setForm(f=>({...f,[key]:v}))} />
                  </div>
                ))}
              </div>
              <Button onClick={score} disabled={!form.name.trim()||loading} className="w-full bg-rose-600 hover:bg-rose-500 text-white">
                {loading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
                {loading ? "Scoring…" : "Score this Lead"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {result && (
            <Card className="bg-muted/40 border-border">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold text-foreground">{result.score}<span className="text-lg text-muted-foreground">/10</span></p>
                    <Badge className={`text-xs mt-1 ${tierColor[result.tier]}`}>{result.tier.toUpperCase()} LEAD</Badge>
                  </div>
                  <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center ${result.tier==="hot"?"border-red-500":result.tier==="warm"?"border-amber-500":"border-blue-500"}`}>
                    <span className="text-2xl font-black text-foreground">{result.score}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Reasoning</p>
                  <p className="text-sm text-foreground">{result.reasoning}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-xs text-emerald-400 font-semibold mb-1">Recommended Next Action</p>
                  <p className="text-sm text-foreground">{result.nextAction}</p>
                </div>
                <Button onClick={()=>getDrip(result.tier)} disabled={loadingDrip} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm">
                  {loadingDrip ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
                  Generate {result.tier} Lead Drip Sequence
                </Button>
              </CardContent>
            </Card>
          )}

          {drip.length > 0 && (
            <Card className="bg-muted/40 border-border">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" />Drip Sequence ({drip.length} steps)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {drip.map((step,i) => (
                  <div key={i} className="p-3 rounded-xl bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">{step.step}</span>
                      <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{step.channel}</Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />+{step.delayHours}h</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{step.message}</p>
                    <Button size="sm" variant="ghost" className="mt-1 h-6 text-xs text-muted-foreground hover:text-foreground px-1" onClick={()=>{navigator.clipboard.writeText(step.message);}}><Copy className="w-3 h-3 mr-1" />Copy</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!result && (
            <div className="flex flex-col items-center justify-center min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8">
              <Brain className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Fill in lead details and click Score</p>
              <p className="text-xs text-muted-foreground mt-1">AI scores 1–10, tags the CRM contact, and recommends next action</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ActivityPanel = () => {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    agentsApi.getActivity("marketing", 50).then(setActivities).catch(()=>setActivities([])).finally(()=>setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  const outcomeColor = { success: "text-emerald-400", pending: "text-amber-400", failed: "text-red-400" };
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Marketing Activity Log</p>
        <Button size="sm" variant="ghost" onClick={load} className="text-muted-foreground h-8"><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-2">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8">
              <ActivityIcon className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet. Start scoring leads.</p>
            </div>
          ) : activities.map(a => (
            <div key={a.id} className="p-3 rounded-xl border border-border bg-muted/30 flex items-start gap-3">
              <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${outcomeColor[a.outcome as keyof typeof outcomeColor]||"text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{a.action}</p>
                {a.detail && <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>}
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
