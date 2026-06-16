/**
 * AI Front Desk Agent — wired to /api/smart-agents/frontdesk/*
 * Features: FAQ Builder, Bookings, Support Cases, Settings
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { PhoneIncoming, Sparkles, Loader2, Copy, Trash2, HelpCircle, Calendar, CheckCircle2, Settings, RefreshCw, AlertCircle, MessageSquare, UserCheck, Shield } from "lucide-react";
import { agentsApi } from "@/lib/smartAgentsApi";
import { withPlanGate } from "@/components/PlanGate";

interface FAQEntry { id:string; question:string; answer:string; category:string; createdAt:string; }
interface BookingRecord { id:string; customerName:string; customerPhone?:string; service?:string; date:string; time:string; status:string; notes?:string; createdAt:string; }
interface SupportCase { id:string; caseType:string; status:string; summary:string; attempts:number; createdAt:string; resolvedAt?:string; }

const CATEGORIES = ["General","Pricing","Technical","Billing","Support","Onboarding","Refunds"];
const BOOKING_STATUS_COLOR: Record<string,string> = { pending:"bg-amber-500/15 text-amber-400", confirmed:"bg-emerald-500/15 text-emerald-400", completed:"bg-blue-500/15 text-blue-400", cancelled:"bg-red-500/15 text-red-400", reminded:"bg-purple-500/15 text-purple-400" };
const CASE_STATUS_COLOR: Record<string,string> = { open:"bg-amber-500/15 text-amber-400", resolved:"bg-emerald-500/15 text-emerald-400", escalated:"bg-red-500/15 text-red-400" };

// ─── FAQ Tab ──────────────────────────────────────────────────────────────────
const FAQTab = () => {
  const [faqs, setFaqs] = useState<FAQEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("General");
  const [generating, setGenerating] = useState(false);
  const [viewing, setViewing] = useState<FAQEntry|null>(null);
  const [testQ, setTestQ] = useState("");
  const [testAnswer, setTestAnswer] = useState("");
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(() => { setLoading(true); agentsApi.getFAQs().then(data=>{ setFaqs(data); if(data.length>0&&!viewing) setViewing(data[0]); }).catch(()=>setFaqs([])).finally(()=>setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (!question.trim()) return;
    setGenerating(true);
    try {
      const r = await agentsApi.generateFAQAnswer(question);
      const saved = await agentsApi.saveFAQ(question, r.answer, category);
      setFaqs(p=>[saved,...p]); setViewing(saved); setQuestion("");
      toast({ title:"FAQ generated & saved" });
    } catch { toast({title:"Failed",variant:"destructive"}); }
    finally { setGenerating(false); }
  };

  const del = async (id: string) => {
    try { await agentsApi.deleteFAQ(id); setFaqs(p=>p.filter(f=>f.id!==id)); if(viewing?.id===id) setViewing(null); toast({title:"Deleted"}); }
    catch { toast({title:"Delete failed",variant:"destructive"}); }
  };

  const test = async () => {
    if (!testQ.trim()) return;
    setTesting(true);
    try { const r=await agentsApi.answerFAQ(testQ); setTestAnswer(r.answer); }
    catch { toast({title:"Test failed",variant:"destructive"}); }
    finally { setTesting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card className="bg-muted/40 border-border">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><HelpCircle className="w-4 h-4 text-cyan-400" />Add FAQ</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Question *</Label><Input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="e.g. What is your refund policy?" className="bg-muted/40 border-border text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={category} onValueChange={setCategory}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={generate} disabled={!question.trim()||generating} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-sm">
                {generating?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Sparkles className="w-3.5 h-3.5 mr-2" />}{generating?"Writing answer…":"Generate & Save Answer"}
              </Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Knowledge Base ({faqs.length})</p><Button size="sm" variant="ghost" onClick={load} className="h-8 text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" /></Button></div>
            {loading?<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>:faqs.map(f=>(
              <div key={f.id} onClick={()=>setViewing(f)} className={`p-3 rounded-xl border cursor-pointer transition-colors ${viewing?.id===f.id?"border-cyan-500/40 bg-cyan-500/5":"border-white/8 bg-muted/30 hover:bg-muted/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-foreground line-clamp-1">{f.question}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{f.category}</Badge>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-red-400" onClick={e=>{e.stopPropagation();del(f.id);}}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          {viewing?(
            <Card className="bg-muted/40 border-border h-fit">
              <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
                <div><CardTitle className="text-sm font-semibold text-foreground">{viewing.question}</CardTitle><Badge variant="outline" className="text-[10px] border-cyan-500/20 text-cyan-400 mt-1">{viewing.category}</Badge></div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>navigator.clipboard.writeText(viewing.answer)}><Copy className="w-3.5 h-3.5" /></Button>
              </CardHeader>
              <CardContent><Textarea value={viewing.answer} onChange={e=>setViewing(v=>v?{...v,answer:e.target.value}:null)} className="bg-muted/40 border-border text-sm leading-relaxed min-h-[300px] resize-none" /></CardContent>
            </Card>
          ):(
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8"><HelpCircle className="w-10 h-10 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Select a FAQ or add a new one</p></div>
          )}
        </div>
      </div>

      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-cyan-400" />Test Agent Response</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <Input value={testQ} onChange={e=>setTestQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&test()} placeholder="Ask the agent a question…" className="bg-muted/40 border-border text-sm flex-1" />
            <Button onClick={test} disabled={!testQ.trim()||testing} className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm flex-shrink-0">{testing?<Loader2 className="w-3.5 h-3.5 animate-spin" />:"Ask"}</Button>
          </div>
          {testAnswer&&<div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20"><p className="text-sm text-foreground leading-relaxed">{testAnswer}</p></div>}
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Bookings Tab ─────────────────────────────────────────────────────────────
const BookingsTab = () => {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ customerName:"", customerPhone:"", service:"", requestedDate:"", requestedTime:"", notes:"" });
  const { toast } = useToast();

  const load = useCallback(() => { setLoading(true); agentsApi.getBookings().then(setBookings).catch(()=>setBookings([])).finally(()=>setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.customerName||!form.requestedDate||!form.requestedTime) return;
    setCreating(true);
    try {
      const b = await agentsApi.createBooking(form);
      setBookings(p=>[b,...p]); setForm({customerName:"",customerPhone:"",service:"",requestedDate:"",requestedTime:"",notes:""});
      toast({title:`Booking confirmed: ${form.customerName}`});
    } catch { toast({title:"Failed",variant:"destructive"}); }
    finally { setCreating(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try { await agentsApi.updateBookingStatus(id, status); setBookings(p=>p.map(b=>b.id===id?{...b,status}:b)); toast({title:`Status updated: ${status}`}); }
    catch { toast({title:"Update failed",variant:"destructive"}); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Calendar className="w-4 h-4 text-violet-400" />Create Booking</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label className="text-xs text-muted-foreground">Customer Name *</Label><Input value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))} placeholder="John Smith" className="bg-muted/40 border-border text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone</Label><Input value={form.customerPhone} onChange={e=>setForm(f=>({...f,customerPhone:e.target.value}))} placeholder="+1234567890" className="bg-muted/40 border-border text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Service</Label><Input value={form.service} onChange={e=>setForm(f=>({...f,service:e.target.value}))} placeholder="Consultation" className="bg-muted/40 border-border text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Date *</Label><Input type="date" value={form.requestedDate} onChange={e=>setForm(f=>({...f,requestedDate:e.target.value}))} className="bg-muted/40 border-border text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Time *</Label><Input type="time" value={form.requestedTime} onChange={e=>setForm(f=>({...f,requestedTime:e.target.value}))} className="bg-muted/40 border-border text-sm" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Any special instructions…" className="bg-muted/40 border-border text-sm min-h-[70px] resize-none" /></div>
            <Button onClick={create} disabled={!form.customerName||!form.requestedDate||!form.requestedTime||creating} className="w-full bg-violet-600 hover:bg-violet-500 text-white text-sm">
              {creating?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Calendar className="w-3.5 h-3.5 mr-2" />}Confirm Booking
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">Upcoming Bookings ({bookings.length})</p><Button size="sm" variant="ghost" onClick={load} className="h-8 text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" /></Button></div>
        {loading?<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>:bookings.length===0?(
          <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8"><Calendar className="w-10 h-10 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No bookings yet.</p></div>
        ):bookings.map(b=>(
          <Card key={b.id} className="bg-muted/40 border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-foreground">{b.customerName}</p><p className="text-xs text-muted-foreground mt-0.5">{b.date} at {b.time}{b.service?` · ${b.service}`:""}</p>{b.customerPhone&&<p className="text-xs text-muted-foreground">{b.customerPhone}</p>}</div>
                <Badge className={`text-[10px] ${BOOKING_STATUS_COLOR[b.status]||"bg-slate-500/15 text-muted-foreground"}`}>{b.status}</Badge>
              </div>
              {b.notes&&<p className="text-xs text-muted-foreground mt-2 italic">{b.notes}</p>}
              <div className="flex gap-1.5 mt-3">
                {b.status==="pending"&&<Button size="sm" className="h-6 bg-emerald-600 hover:bg-emerald-500 text-white text-xs" onClick={()=>updateStatus(b.id,"confirmed")}><CheckCircle2 className="w-3 h-3 mr-1" />Confirm</Button>}
                {b.status==="confirmed"&&<Button size="sm" className="h-6 bg-blue-600 hover:bg-blue-500 text-white text-xs" onClick={()=>updateStatus(b.id,"completed")}>Complete</Button>}
                {["pending","confirmed"].includes(b.status)&&<Button size="sm" variant="ghost" className="h-6 text-xs text-red-400 hover:text-red-300" onClick={()=>updateStatus(b.id,"cancelled")}>Cancel</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── Cases Tab ────────────────────────────────────────────────────────────────
const CasesTab = () => {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ caseType:"enquiry", summary:"" });
  const { toast } = useToast();
  const load = useCallback(() => { setLoading(true); agentsApi.getCases().then(setCases).catch(()=>setCases([])).finally(()=>setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  const createCase = async () => { if(!form.summary.trim()) return; setCreating(true); try { const c=await agentsApi.createCase(form.caseType,form.summary); setCases(p=>[c,...p]); setForm({caseType:"enquiry",summary:""}); toast({title:"Case created"}); } catch { toast({title:"Failed",variant:"destructive"}); } finally { setCreating(false); } };
  const escalate = async (id: string) => { try { await agentsApi.escalateCase(id); setCases(p=>p.map(c=>c.id===id?{...c,status:"escalated"}:c)); toast({title:"Escalated to human team"}); } catch { toast({title:"Failed",variant:"destructive"}); } };
  const resolve = async (id: string) => { try { await agentsApi.resolveCase(id); setCases(p=>p.map(c=>c.id===id?{...c,status:"resolved"}:c)); toast({title:"Case resolved"}); } catch { toast({title:"Failed",variant:"destructive"}); } };
  return (
    <div className="space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield className="w-4 h-4 text-cyan-400" />New Case</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.caseType} onValueChange={v=>setForm(f=>({...f,caseType:v}))}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="enquiry">Enquiry</SelectItem><SelectItem value="complaint">Complaint</SelectItem><SelectItem value="refund">Refund</SelectItem><SelectItem value="booking">Booking</SelectItem><SelectItem value="escalation">Escalation</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5 md:col-span-2"><Label className="text-xs text-muted-foreground">Summary *</Label><Input value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Brief description of the case…" className="bg-muted/40 border-border text-sm" /></div>
          </div>
          <Button onClick={createCase} disabled={!form.summary.trim()||creating} className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm">{creating?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Shield className="w-3.5 h-3.5 mr-2" />}Create Case</Button>
        </CardContent>
      </Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">Support Cases ({cases.length})</p><Button size="sm" variant="ghost" onClick={load} className="h-8 text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" /></Button></div>
        {loading?<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>:cases.length===0?(
          <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8"><Shield className="w-10 h-10 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">No cases. Create one above.</p></div>
        ):cases.map(c=>(
          <Card key={c.id} className="bg-muted/40 border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-foreground">{c.summary}</p><p className="text-xs text-muted-foreground mt-0.5">{c.caseType} · {new Date(c.createdAt).toLocaleDateString()}</p></div>
                <Badge className={`text-[10px] ${CASE_STATUS_COLOR[c.status]||""}`}>{c.status}</Badge>
              </div>
              {c.status==="open"&&(
                <div className="flex gap-1.5 mt-3">
                  <Button size="sm" className="h-6 bg-emerald-600 hover:bg-emerald-500 text-white text-xs" onClick={()=>resolve(c.id)}><CheckCircle2 className="w-3 h-3 mr-1" />Resolve</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400 hover:text-red-300 border border-red-500/20" onClick={()=>escalate(c.id)}><AlertCircle className="w-3 h-3 mr-1" />Escalate</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};


// ─── Main ─────────────────────────────────────────────────────────────────────
type Tab = "faq"|"bookings"|"cases";
const TABS = [{id:"faq" as Tab,label:"FAQ Builder",icon:HelpCircle},{id:"bookings" as Tab,label:"Bookings",icon:Calendar},{id:"cases" as Tab,label:"Support Cases",icon:Shield}];

const AIFrontDesk = () => {
  const [tab, setTab] = useState<Tab>("faq");
  const [metrics, setMetrics] = useState<any>(null);
  const navigate = useNavigate();
  useEffect(() => { agentsApi.getMetrics().then(all=>{ const m=all.find((x:any)=>x.agentType==="frontdesk"); setMetrics(m||null); }).catch(()=>{}); }, []);
  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/10 via-teal-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg shadow-cyan-500/20"><PhoneIncoming className="w-6 h-6" /></div>
              <div className="flex-1"><h1 className="text-2xl font-bold text-foreground tracking-tight">AI Front Desk</h1><p className="text-muted-foreground text-sm">FAQ knowledge base, smart bookings & support case management</p></div>
              <Button onClick={()=>navigate("/ai-agents",{state:{focusAgentId:"seed-frontdesk"}})} className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm gap-1.5 flex-shrink-0"><UserCheck className="w-4 h-4" />Configure Agent</Button>
            </div>
            {metrics&&(
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-emerald-600"><CheckCircle2 className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.casesResolved||0}</p><p className="text-xs text-muted-foreground">Cases Resolved</p></div></CardContent></Card>
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-violet-600"><Calendar className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.bookingsCreated||0}</p><p className="text-xs text-muted-foreground">Bookings</p></div></CardContent></Card>
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-red-600"><AlertCircle className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.casesEscalated||0}</p><p className="text-xs text-muted-foreground">Escalated</p></div></CardContent></Card>
              </div>
            )}
            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab===t.id?"text-cyan-400 border-cyan-400":"text-muted-foreground border-transparent hover:text-foreground"}`}><t.icon className="w-4 h-4" />{t.label}</button>)}
            </div>
          </div>
        </div>
        <motion.div key={tab} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:0.15}} className="px-8 pb-10">
          {tab==="faq"&&<FAQTab />}{tab==="bookings"&&<BookingsTab />}{tab==="cases"&&<CasesTab />}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("ai.frontdesk")(AIFrontDesk);
