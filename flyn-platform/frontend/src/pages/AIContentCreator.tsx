/**
 * AI Content Creator — wired to /api/smart-agents/content/*
 */

import { useState, useEffect, useCallback } from "react";
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
import { FileText, Sparkles, Loader2, BookOpen, Zap, Copy, Calendar, CheckCircle2, AlignLeft, Settings, RefreshCw, ChevronLeft, ChevronRight, Library, GitBranch, Share2, Megaphone } from "lucide-react";
import { agentsApi } from "@/lib/smartAgentsApi";
import { withPlanGate } from "@/components/PlanGate";

interface CalEntry { day:number; date:string; platform:string; contentType:string; topic:string; caption:string; hashtags:string[]; status:string; }
interface LibEntry { id:string; contentType:string; title:string; body:string; status:string; createdAt:string; }

const platformColor: Record<string,string> = { Instagram:"text-pink-400 bg-pink-500/10", LinkedIn:"text-blue-400 bg-blue-500/10", Facebook:"text-indigo-400 bg-indigo-500/10", WhatsApp:"text-emerald-400 bg-emerald-500/10" };
const statusColor: Record<string,string> = { draft:"bg-slate-500/15 text-muted-foreground", approved:"bg-emerald-500/15 text-emerald-400", published:"bg-blue-500/15 text-blue-400" };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
const CalendarTab = () => {
  const [entries, setEntries] = useState<CalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<CalEntry|null>(null);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const { toast } = useToast();

  const [syncing, setSyncing] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const cal = await agentsApi.generateCalendar();
      setEntries(cal);
      toast({ title: "30-day calendar generated", description: `${cal.length} posts planned` });
    } catch { toast({ title: "Generation failed", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const syncToCalendar = async () => {
    if (!entries.length) { toast({ title: "Generate a calendar first" }); return; }
    setSyncing(true);
    try {
      const r = await agentsApi.syncCalendarToCalendar(entries);
      toast({ title: "Synced to Calendar", description: `${r.synced} posts added to the Calendar module` });
    } catch { toast({ title: "Sync failed", variant: "destructive" }); }
    finally { setSyncing(false); }
  };

  const firstDay = new Date(year,month,1).getDay();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const now = new Date();
  const getPostsForDay = (d: number) => entries.filter(e=>{ const dt=new Date(e.date); return dt.getFullYear()===year&&dt.getMonth()===month&&dt.getDate()===d; });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h3 className="text-foreground font-semibold">30-Day Content Calendar</h3><p className="text-xs text-muted-foreground mt-0.5">AI generates a full month of platform-native content</p></div>
        <div className="flex gap-2">
          <Button onClick={syncToCalendar} disabled={syncing||!entries.length} variant="outline" className="text-sm border-border">
            {syncing?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Calendar className="w-3.5 h-3.5 mr-2" />}{syncing?"Syncing…":"Sync to Calendar"}
          </Button>
          <Button onClick={generate} disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm">
            {loading?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Sparkles className="w-3.5 h-3.5 mr-2" />}{loading?"Generating…":"Generate Calendar"}
          </Button>
        </div>
      </div>
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-400" />{MONTHS[month]} {year}</CardTitle>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}}><ChevronLeft className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px">
            {DAYS_SHORT.map(d=><div key={d} className="text-center text-[11px] text-muted-foreground font-medium pb-2">{d}</div>)}
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`} />)}
            {Array.from({length:daysInMonth}).map((_,i)=>{ const day=i+1; const posts=getPostsForDay(day); const isToday=now.getFullYear()===year&&now.getMonth()===month&&now.getDate()===day; return (
              <div key={day} className={`min-h-[68px] rounded-lg p-1.5 border cursor-pointer ${isToday?"border-indigo-500/40 bg-indigo-500/5":"border-transparent hover:border-border"}`} onClick={()=>posts[0]&&setViewing(posts[0])}>
                <p className={`text-xs font-medium mb-1 ${isToday?"text-indigo-400":"text-muted-foreground"}`}>{day}</p>
                {posts.slice(0,2).map((p,pi)=><div key={pi} className={`rounded px-1 py-0.5 text-[10px] truncate mb-0.5 ${platformColor[p.platform]||"text-muted-foreground bg-muted/40"}`}>{p.platform}</div>)}
                {posts.length>2&&<p className="text-[9px] text-muted-foreground">+{posts.length-2}</p>}
              </div>
            );})}
          </div>
        </CardContent>
      </Card>
      {viewing&&(
        <Card className="bg-muted/40 border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Badge className={`text-[10px] ${platformColor[viewing.platform]||""}`}>{viewing.platform}</Badge>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{viewing.contentType}</Badge>
              <span className="text-[10px] text-muted-foreground ml-auto">{viewing.date}</span>
            </div>
            <p className="text-sm font-semibold text-foreground mb-2">{viewing.topic}</p>
            <p className="text-sm text-foreground leading-relaxed">{viewing.caption}</p>
            {viewing.hashtags?.length>0&&<p className="text-xs text-indigo-400 mt-2">{viewing.hashtags.join(" ")}</p>}
            <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs text-muted-foreground" onClick={()=>navigator.clipboard.writeText(viewing.caption)}><Copy className="w-3 h-3 mr-1" />Copy</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Generate Tab ─────────────────────────────────────────────────────────────
const GenerateTab = () => {
  const [mode, setMode] = useState<"caption"|"blog"|"ab"|"faq">("caption");
  const [platform, setPlatform] = useState("LinkedIn");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [channel, setChannel] = useState("WhatsApp");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string|null>(null);
  const [abResult, setAbResult] = useState<{versionA:string;versionB:string}|null>(null);
  const { toast } = useToast();

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true); setResult(null); setAbResult(null);
    try {
      if (mode==="caption") { const r=await agentsApi.generateCaption(platform,topic,tone); setResult(r.caption); }
      else if (mode==="blog") { const r=await agentsApi.generateBlogOutline(topic); setResult(r.outline); }
      else if (mode==="ab") { const r=await agentsApi.generateABVariants(topic,channel); setAbResult(r); }
      else if (mode==="faq") { const r=await agentsApi.generateFAQAnswer(topic); setResult(r.answer); }
      toast({ title:"Content generated" });
    } catch { toast({title:"Failed",variant:"destructive"}); }
    finally { setLoading(false); }
  };

  const modes = [{id:"caption",label:"Caption",icon:Zap},{id:"blog",label:"Blog Outline",icon:BookOpen},{id:"ab",label:"A/B Variants",icon:GitBranch},{id:"faq",label:"FAQ Answer",icon:AlignLeft}];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {modes.map(m=><button key={m.id} onClick={()=>setMode(m.id as any)} className={`p-3 rounded-xl border text-center ${mode===m.id?"border-indigo-500/40 bg-indigo-500/5":"border-white/8 bg-muted/30 hover:bg-muted/40"}`}><m.icon className="w-4 h-4 mx-auto mb-1 text-indigo-400" /><p className="text-xs font-medium text-foreground">{m.label}</p></button>)}
        </div>
        <Card className="bg-muted/40 border-border">
          <CardContent className="p-5 space-y-4">
            {mode==="caption"&&(
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Platform</Label>
                  <Select value={platform} onValueChange={setPlatform}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent>{["LinkedIn","Instagram","Facebook","WhatsApp"].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Tone</Label>
                  <Select value={tone} onValueChange={setTone}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent>{["professional","engaging","witty","formal","storytelling"].map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              </div>
            )}
            {mode==="ab"&&<div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Channel</Label>
              <Select value={channel} onValueChange={setChannel}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent>{["WhatsApp","Email","Instagram","LinkedIn"].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{mode==="faq"?"Question":"Topic / Brief"} *</Label>
              <Textarea value={topic} onChange={e=>setTopic(e.target.value)} placeholder={mode==="faq"?"What is your refund policy?":"What to write about…"} className="bg-muted/40 border-border text-sm min-h-[90px] resize-none" />
            </div>
            <Button onClick={generate} disabled={!topic.trim()||loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm">
              {loading?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Sparkles className="w-3.5 h-3.5 mr-2" />}{loading?"Generating…":"Generate"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div>
        {abResult?(
          <div className="space-y-4">
            {(["versionA","versionB"] as const).map((v,i)=>(
              <Card key={v} className="bg-muted/40 border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between"><span>Version {i===0?"A":"B"}</span><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>navigator.clipboard.writeText(abResult[v])}><Copy className="w-3.5 h-3.5" /></Button></CardTitle></CardHeader>
                <CardContent><pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{abResult[v]}</pre></CardContent>
              </Card>
            ))}
          </div>
        ):result?(
          <Card className="bg-muted/40 border-border h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between"><CardTitle className="text-sm font-semibold text-foreground">Generated</CardTitle><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>navigator.clipboard.writeText(result||"")}><Copy className="w-3.5 h-3.5" /></Button></CardHeader>
            <CardContent><Textarea value={result} onChange={e=>setResult(e.target.value)} className="bg-muted/40 border-border text-sm font-mono leading-relaxed min-h-[400px] resize-none" /></CardContent>
          </Card>
        ):(
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-2xl border border-dashed border-border text-center p-8">
            <FileText className="w-10 h-10 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Generated content appears here</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Library Tab ──────────────────────────────────────────────────────────────
const LibraryTab = () => {
  const [items, setItems] = useState<LibEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<LibEntry|null>(null);
  const [approving, setApproving] = useState<string|null>(null);
  const { toast } = useToast();
  const load = useCallback(() => { setLoading(true); agentsApi.getContentLibrary().then(setItems).catch(()=>setItems([])).finally(()=>setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  const approve = async (id: string) => { setApproving(id); try { await agentsApi.approveContent(id); setItems(p=>p.map(x=>x.id===id?{...x,status:"approved"}:x)); toast({title:"Approved"}); } catch { toast({title:"Failed",variant:"destructive"}); } finally { setApproving(null); } };
  const [pushing, setPushing] = useState<string|null>(null);
  const toSocial = async (id: string) => { setPushing("social"); try { await agentsApi.contentToSocial(id); toast({title:"Sent to Social",description:"Draft post created in AI Social Media"}); } catch { toast({title:"Failed",variant:"destructive"}); } finally { setPushing(null); } };
  const toCampaign = async (id: string) => { setPushing("campaign"); try { await agentsApi.contentToCampaign(id); toast({title:"Sent to Campaign Manager",description:"Draft campaign created"}); } catch { toast({title:"Failed",variant:"destructive"}); } finally { setPushing(null); } };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">Content Library ({items.length})</p><Button size="sm" variant="ghost" onClick={load} className="h-8 text-muted-foreground"><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button></div>
        {loading?<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>:items.length===0?(
          <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8"><Library className="w-10 h-10 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Library empty. Generate content to populate it.</p></div>
        ):items.map(item=>(
          <div key={item.id} onClick={()=>setViewing(item)} className={`p-3 rounded-xl border cursor-pointer ${viewing?.id===item.id?"border-indigo-500/40 bg-indigo-500/5":"border-white/8 bg-muted/30 hover:bg-muted/40"}`}>
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-foreground line-clamp-1">{item.title}</p><Badge className={`text-[10px] ${statusColor[item.status]}`}>{item.status}</Badge></div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{item.contentType} · {new Date(item.createdAt).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
      <div>
        {viewing?(
          <Card className="bg-muted/40 border-border">
            <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
              <div><CardTitle className="text-sm font-semibold text-foreground">{viewing.title}</CardTitle><div className="flex gap-2 mt-1"><Badge className={`text-[10px] ${statusColor[viewing.status]}`}>{viewing.status}</Badge><Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{viewing.contentType}</Badge></div></div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>navigator.clipboard.writeText(viewing.body)}><Copy className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-border" onClick={()=>toSocial(viewing.id)} disabled={pushing!==null}>{pushing==="social"?<Loader2 className="w-3 h-3 animate-spin" />:<Share2 className="w-3 h-3 mr-1" />}To Social</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-border" onClick={()=>toCampaign(viewing.id)} disabled={pushing!==null}>{pushing==="campaign"?<Loader2 className="w-3 h-3 animate-spin" />:<Megaphone className="w-3 h-3 mr-1" />}To Campaign</Button>
                {viewing.status==="draft"&&<Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-500 text-white text-xs" onClick={()=>approve(viewing.id)} disabled={approving===viewing.id}>{approving===viewing.id?<Loader2 className="w-3 h-3 animate-spin" />:<CheckCircle2 className="w-3 h-3 mr-1" />}Approve</Button>}
              </div>
            </CardHeader>
            <CardContent><pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[500px] overflow-auto">{viewing.body}</pre></CardContent>
          </Card>
        ):(
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8"><Library className="w-10 h-10 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Select an item to preview</p></div>
        )}
      </div>
    </div>
  );
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const SettingsTab = () => {
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ businessName:"", industry:"", toneAdjectives:"bold, warm, professional", contentGoals:"leads", signaturePhrases:"", avoidPhrases:"", upcomingPromotions:"", contentFormats:"WhatsApp, blog, short posts" });
  const { toast } = useToast();
  useEffect(() => { agentsApi.getConfig("content").then(c=>{ setConfig(c); if(c.companyData) setForm((f:any)=>({...f,...c.companyData})); }).catch(()=>{}); }, []);
  const save = async () => { setSaving(true); try { await agentsApi.updateCompanyData("content",form); toast({title:"Settings saved"}); } catch { toast({title:"Failed",variant:"destructive"}); } finally { setSaving(false); } };
  return (
    <div className="max-w-2xl space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Settings className="w-4 h-4 text-indigo-400" />Content Agent Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {config&&<div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-white/8"><div><p className="text-sm font-medium text-foreground">Agent Active</p><p className="text-xs text-muted-foreground">Runs content calendar automatically</p></div><Switch checked={config.active} onCheckedChange={async v=>{await agentsApi.toggleAgent("content",v);setConfig((c:any)=>({...c,active:v}));}} /></div>}
          {([["businessName","Business Name","Acme Corp"],["industry","Industry","SaaS"],["toneAdjectives","Brand Tone Adjectives","bold, warm, professional"],["signaturePhrases","Signature Phrases","Work smarter not harder"],["avoidPhrases","Words to Avoid","cheap, discount"],["upcomingPromotions","Upcoming Promotions","Summer sale 20% off"],["contentFormats","Preferred Formats","WhatsApp, blog, short posts"]] as [string,string,string][]).map(([k,l,p])=>(
            <div key={k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{l}</Label><Input value={(form as any)[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p} className="bg-muted/40 border-border text-sm" /></div>
          ))}
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Content Goals</Label>
            <Select value={form.contentGoals} onValueChange={v=>setForm(f=>({...f,contentGoals:v}))}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="leads">Lead Generation</SelectItem><SelectItem value="awareness">Brand Awareness</SelectItem><SelectItem value="loyalty">Customer Loyalty</SelectItem><SelectItem value="education">Education</SelectItem></SelectContent></Select>
          </div>
          <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm">{saving?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<CheckCircle2 className="w-3.5 h-3.5 mr-2" />}Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
type Tab = "calendar"|"generate"|"library"|"settings";
const TABS = [{id:"calendar" as Tab,label:"30-Day Calendar",icon:Calendar},{id:"generate" as Tab,label:"Generate",icon:Sparkles},{id:"library" as Tab,label:"Library",icon:Library},{id:"settings" as Tab,label:"Settings",icon:Settings}];

const AIContentCreator = () => {
  const [tab, setTab] = useState<Tab>("calendar");
  const [metrics, setMetrics] = useState<any>(null);
  useEffect(() => { agentsApi.getMetrics().then(all=>{ const m=all.find((x:any)=>x.agentType==="content"); setMetrics(m||null); }).catch(()=>{}); }, []);
  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-blue-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20"><FileText className="w-6 h-6" /></div>
              <div><h1 className="text-2xl font-bold text-foreground tracking-tight">AI Content Creator</h1><p className="text-muted-foreground text-sm">30-day calendars, captions, blog outlines, A/B variants & content library</p></div>
            </div>
            {metrics&&(
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-indigo-600"><FileText className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.piecesCreated||0}</p><p className="text-xs text-muted-foreground">Pieces Created</p></div></CardContent></Card>
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-amber-600"><Calendar className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.calendarDays||0}</p><p className="text-xs text-muted-foreground">Calendar Days</p></div></CardContent></Card>
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-cyan-600"><AlignLeft className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.faqsWritten||0}</p><p className="text-xs text-muted-foreground">FAQs Written</p></div></CardContent></Card>
              </div>
            )}
            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab===t.id?"text-indigo-400 border-indigo-400":"text-muted-foreground border-transparent hover:text-foreground"}`}><t.icon className="w-4 h-4" />{t.label}</button>)}
            </div>
          </div>
        </div>
        <motion.div key={tab} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:0.15}} className="px-8 pb-10">
          {tab==="calendar"&&<CalendarTab />}{tab==="generate"&&<GenerateTab />}{tab==="library"&&<LibraryTab />}{tab==="settings"&&<SettingsTab />}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("ai.content")(AIContentCreator);
