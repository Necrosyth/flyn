/**
 * AI Social Media Manager — wired to /api/smart-agents/social/*
 * Features: Post Generation, Scheduling, Calendar, Sentiment Analysis, Trend Alerts, Settings
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
import { Share2, Sparkles, Loader2, Copy, Send, Clock, TrendingUp, Calendar, Settings, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Globe, MessageSquare, BarChart3, Zap } from "lucide-react";
import { agentsApi } from "@/lib/smartAgentsApi";
import { withPlanGate } from "@/components/PlanGate";

interface SocialPost { id?:string; platform:string; caption:string; hashtags:string[]; scheduledAt?:string; publishedAt?:string; status?:string; publishedUrl?:string; error?:string; }

const PC: Record<string,{label:string;color:string;bg:string}> = {
  linkedin:{label:"LinkedIn",color:"text-blue-400",bg:"bg-blue-500/10"},
  instagram:{label:"Instagram",color:"text-pink-400",bg:"bg-pink-500/10"},
  facebook:{label:"Facebook",color:"text-indigo-400",bg:"bg-indigo-500/10"},
  twitter:{label:"X (Twitter)",color:"text-foreground",bg:"bg-muted/40"},
  telegram:{label:"Telegram",color:"text-sky-400",bg:"bg-sky-500/10"},
};
const SC: Record<string,string> = { draft:"bg-slate-500/15 text-muted-foreground", scheduled:"bg-amber-500/15 text-amber-400", publishing:"bg-blue-500/15 text-blue-400", published:"bg-emerald-500/15 text-emerald-400", failed:"bg-rose-500/15 text-rose-400" };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Compose Tab ──────────────────────────────────────────────────────────────
const ComposeTab = ({ onScheduled }: { onScheduled: (p: SocialPost) => void }) => {
  const [platform, setPlatform] = useState("linkedin");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [sentiment, setSentiment] = useState<any>(null);
  const [analysing, setAnalysing] = useState(false);
  const [connected, setConnected] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => { agentsApi.getConnectedSocialChannels().then(r=>setConnected(r.platforms||[])).catch(()=>{}); }, []);
  const isConnected = connected.includes(platform);

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      const post = await agentsApi.generateSocialPost(platform, topic);
      setContent(post.caption);
      if (post.hashtags?.length) setHashtags(post.hashtags.join(" "));
      toast({ title: `${PC[platform]?.label} post generated` });
    } catch { toast({ title:"Generation failed", variant:"destructive" }); }
    finally { setGenerating(false); }
  };

  const schedule = async () => {
    if (!content.trim()) return;
    setScheduling(true);
    try {
      const tags = hashtags.split(/\s+/).filter(Boolean);
      const scheduledAt = scheduleDate ? new Date(scheduleDate).toISOString() : undefined;
      const post = await agentsApi.schedulePost({ platform, caption: content, hashtags: tags, scheduledAt, status: scheduledAt ? "scheduled" : "draft" });
      onScheduled(post);
      setContent(""); setTopic(""); setHashtags(""); setScheduleDate("");
      toast({ title: scheduledAt ? "Post scheduled" : "Saved as draft" });
    } catch { toast({ title:"Scheduling failed", variant:"destructive" }); }
    finally { setScheduling(false); }
  };

  const analyse = async () => {
    if (!content.trim()) return;
    setAnalysing(true);
    try { const r = await agentsApi.analyzeSentiment(content); setSentiment(r); }
    catch { toast({ title:"Sentiment check failed", variant:"destructive" }); }
    finally { setAnalysing(false); }
  };

  const cfg = PC[platform];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Zap className="w-4 h-4 text-pink-400" />AI Post Generator</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}><SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PC).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Topic / Message</Label>
              <Textarea value={topic} onChange={e=>setTopic(e.target.value)} placeholder="What do you want to post about?" className="bg-muted/40 border-border text-sm min-h-[80px] resize-none" /></div>
            <Button onClick={generate} disabled={!topic.trim()||generating} className="w-full bg-pink-600 hover:bg-pink-500 text-white text-sm">
              {generating?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Sparkles className="w-3.5 h-3.5 mr-2" />}{generating?"Writing…":`Generate ${cfg?.label} Post`}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-muted/40 border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400" />Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Publish date & time (blank = draft)</Label>
              <Input type="datetime-local" value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} className="bg-muted/40 border-border text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Hashtags</Label>
              <Input value={hashtags} onChange={e=>setHashtags(e.target.value)} placeholder="#AI #Growth #Business" className="bg-muted/40 border-border text-sm font-mono" /></div>
            {content.trim()&&!isConnected&&(
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300">No {cfg?.label} account connected — this will be saved, but won't publish until you connect {cfg?.label} in Settings → Channels.</p>
              </div>
            )}
            <Button onClick={schedule} disabled={!content.trim()||scheduling} className="w-full bg-amber-600 hover:bg-amber-500 text-white text-sm">
              {scheduling?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Send className="w-3.5 h-3.5 mr-2" />}{scheduling?"Scheduling…":scheduleDate?"Schedule Post":"Save as Draft"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="bg-muted/40 border-border h-fit">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <div className={`flex items-center gap-2 ${cfg?.color}`}><Globe className="w-4 h-4" /><span className="text-sm font-semibold text-foreground">{cfg?.label} Preview</span></div>
            {content&&<Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>navigator.clipboard.writeText(content)}><Copy className="w-3.5 h-3.5" /></Button>}
          </CardHeader>
          <CardContent>
            {content ? (
              <div className="space-y-3">
                <Textarea value={content} onChange={e=>setContent(e.target.value)} className="bg-muted/40 border-border text-sm leading-relaxed min-h-[240px] resize-none" />
                <p className="text-[10px] text-muted-foreground">{content.length} chars</p>
                <Button size="sm" onClick={analyse} disabled={analysing} variant="outline" className="border-border text-muted-foreground hover:text-foreground text-xs">
                  {analysing?<Loader2 className="w-3 h-3 mr-1 animate-spin" />:<MessageSquare className="w-3 h-3 mr-1" />}Check Sentiment
                </Button>
                {sentiment&&(
                  <div className={`p-3 rounded-xl border ${sentiment.shouldEscalate?"border-red-500/20 bg-red-500/5":"border-white/8 bg-muted/30"}`}>
                    <div className="flex items-center gap-2">
                      {sentiment.shouldEscalate?<AlertCircle className="w-4 h-4 text-red-400" />:<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      <span className="text-sm font-medium text-foreground capitalize">{sentiment.sentiment}</span>
                      <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{Math.round((sentiment.score||0.5)*100)}% confidence</Badge>
                    </div>
                    {sentiment.shouldEscalate&&<p className="text-xs text-red-400 mt-1">⚠ Contains escalation keywords — review before posting</p>}
                  </div>
                )}
              </div>
            ):(
              <div className="flex flex-col items-center justify-center min-h-[240px] text-center">
                <Globe className="w-10 h-10 text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">Generated post appears here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
const CalendarTab = ({ posts, onCompose, onChanged }: { posts: SocialPost[]; onCompose: () => void; onChanged: () => void }) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState<string|null>(null);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const syncToCalendar = async () => { setSyncing(true); try { const r = await agentsApi.syncSocialToCalendar(); toast({ title: "Synced to Calendar", description: `${r.synced} posts added to the Calendar module` }); } catch { toast({ title: "Sync failed", variant: "destructive" }); } finally { setSyncing(false); } };
  const publishNow = async (id?: string) => { if(!id) return; setBusy(id); try { await agentsApi.publishNow(id); toast({ title: "Published" }); onChanged(); } catch(e:any){ toast({ title: "Publish failed", description: String(e?.message||e).slice(0,120), variant: "destructive" }); onChanged(); } finally { setBusy(null); } };
  const retry = async (id?: string) => { if(!id) return; setBusy(id); try { await agentsApi.retryPost(id); toast({ title: "Re-queued" }); onChanged(); } catch { toast({ title: "Retry failed", variant: "destructive" }); } finally { setBusy(null); } };
  const firstDay = new Date(year,month,1).getDay();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const now = new Date();
  const getPostsForDay = (d: number) => posts.filter(p => { if(!p.scheduledAt) return false; const dt=new Date(p.scheduledAt); return dt.getFullYear()===year&&dt.getMonth()===month&&dt.getDate()===d; });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h3 className="text-foreground font-semibold">Content Calendar</h3><p className="text-xs text-muted-foreground mt-0.5">Scheduled posts across all platforms</p></div>
        <Button onClick={syncToCalendar} disabled={syncing} variant="outline" className="text-sm border-border">
          {syncing?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<Calendar className="w-3.5 h-3.5 mr-2" />}{syncing?"Syncing…":"Sync to Calendar"}
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(PC).map(([k,v])=>{ const count=posts.filter(p=>p.platform===k).length; return (
          <Card key={k} className="bg-muted/40 border-border"><CardContent className="p-4"><div className={`flex items-center gap-2 mb-2 ${v.color}`}><BarChart3 className="w-4 h-4" /><span className="text-xs font-medium">{v.label}</span></div><p className="text-2xl font-bold text-foreground">{count}</p><p className="text-[11px] text-muted-foreground">posts scheduled</p></CardContent></Card>
        );})}
      </div>
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Calendar className="w-4 h-4 text-pink-400" />{MONTHS[month]} {year}</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}}><ChevronLeft className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}}><ChevronRight className="w-4 h-4" /></Button>
              <Button onClick={onCompose} className="bg-pink-600 hover:bg-pink-500 text-white text-xs h-7 ml-2"><Sparkles className="w-3 h-3 mr-1" />Compose</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px">
            {DAYS_SHORT.map(d=><div key={d} className="text-center text-[11px] text-muted-foreground font-medium pb-2">{d}</div>)}
            {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`} />)}
            {Array.from({length:daysInMonth}).map((_,i)=>{ const day=i+1; const dayPosts=getPostsForDay(day); const isToday=now.getFullYear()===year&&now.getMonth()===month&&now.getDate()===day; return (
              <div key={day} className={`min-h-[64px] rounded-lg p-1.5 border ${isToday?"border-pink-500/40 bg-pink-500/5":"border-transparent hover:border-border"}`}>
                <p className={`text-xs font-medium mb-1 ${isToday?"text-pink-400":"text-muted-foreground"}`}>{day}</p>
                {dayPosts.slice(0,2).map((p,pi)=>{ const cfg=PC[p.platform]; return <div key={pi} className={`rounded px-1 py-0.5 text-[10px] truncate mb-0.5 ${cfg?.color||""} ${cfg?.bg||"bg-muted/40"}`}>{cfg?.label||p.platform}</div>;})}
                {dayPosts.length>2&&<p className="text-[9px] text-muted-foreground">+{dayPosts.length-2}</p>}
              </div>
            );})}
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Upcoming Posts</p>
        {posts.filter(p=>p.status!=="published"&&p.scheduledAt).sort((a,b)=>new Date(a.scheduledAt!).getTime()-new Date(b.scheduledAt!).getTime()).map((p,i)=>{
          const cfg=PC[p.platform]; return (
          <Card key={i} className="bg-muted/40 border-border"><CardContent className="p-3.5 flex items-start gap-3">
            <div className={`p-1.5 rounded-lg flex-shrink-0 ${cfg?.bg} ${cfg?.color}`}><Globe className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground line-clamp-2">{p.caption}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap"><Badge className={`text-[10px] ${SC[p.status||"draft"]}`}>{p.status||"draft"}</Badge><span className="text-[10px] text-muted-foreground">{p.scheduledAt?new Date(p.scheduledAt).toLocaleDateString():""}</span>{p.status==="failed"&&p.error&&<span className="text-[10px] text-rose-400 line-clamp-1" title={p.error}>{p.error.slice(0,60)}</span>}</div>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs border-border" disabled={busy===p.id} onClick={()=>publishNow(p.id)}>{busy===p.id?<Loader2 className="w-3 h-3 animate-spin" />:<Send className="w-3 h-3 mr-1" />}Publish now</Button>
              {p.status==="failed"&&<Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={busy===p.id} onClick={()=>retry(p.id)}><RefreshCw className="w-3 h-3 mr-1" />Retry</Button>}
            </div>
          </CardContent></Card>
        );})}
        {posts.filter(p=>p.status!=="published"&&p.scheduledAt).length===0&&(
          <div className="flex flex-col items-center justify-center min-h-[150px] rounded-2xl border border-dashed border-border text-center p-6"><Calendar className="w-8 h-8 text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">No upcoming posts. Compose one above.</p></div>
        )}
      </div>
    </div>
  );
};

// ─── Insights Tab ─────────────────────────────────────────────────────────────
const InsightsTab = () => {
  const [trendTopic, setTrendTopic] = useState("");
  const [trend, setTrend] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();
  const checkTrend = async () => {
    if (!trendTopic.trim()) return;
    setChecking(true);
    try { const r = await agentsApi.generateTrendAlert(trendTopic); setTrend(r); }
    catch { toast({title:"Failed",variant:"destructive"}); }
    finally { setChecking(false); }
  };
  const TIPS = [
    {icon:Clock,title:"Best time to post on LinkedIn",body:"Tue–Thu 8–10AM. Engagement drops 60% on weekends.",color:"text-blue-400"},
    {icon:TrendingUp,title:"Instagram engagement peaks",body:"6–9PM weekdays. Carousels get 3x more reach.",color:"text-pink-400"},
    {icon:BarChart3,title:"Post frequency guide",body:"LinkedIn: 3–5×/wk. Instagram: 4–7×/wk. Consistency beats volume.",color:"text-indigo-400"},
    {icon:Sparkles,title:"AI content performs when…",body:"It sounds human. Add a personal data point before using AI copy.",color:"text-purple-400"},
  ];
  return (
    <div className="space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-pink-400" />Trend Relevance Check</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <Input value={trendTopic} onChange={e=>setTrendTopic(e.target.value)} placeholder="Enter a trending topic (e.g. 'AI regulation 2026')" className="bg-muted/40 border-border text-sm flex-1" />
            <Button onClick={checkTrend} disabled={!trendTopic.trim()||checking} className="bg-pink-600 hover:bg-pink-500 text-white text-sm flex-shrink-0">{checking?<Loader2 className="w-3.5 h-3.5 animate-spin" />:<TrendingUp className="w-3.5 h-3.5" />}</Button>
          </div>
          {trend&&(
            <div className="space-y-3 mt-2">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${trend.relevanceScore>=7?"bg-emerald-500/10 border border-emerald-500/20":"bg-amber-500/10 border border-amber-500/20"}`}>
                  <p className={`text-2xl font-bold ${trend.relevanceScore>=7?"text-emerald-400":"text-amber-400"}`}>{trend.relevanceScore}/10</p>
                  <p className="text-xs text-muted-foreground">Relevance</p>
                </div>
                <div><p className="text-sm font-semibold text-foreground">{trend.topic}</p><p className="text-xs text-muted-foreground mt-0.5">{trend.relevanceScore>=7?"✅ Recommend posting on this trend":"ℹ Below threshold (7). Consider skipping."}</p></div>
              </div>
              {trend.relevanceScore>=7&&(
                <div className="p-3 rounded-xl bg-muted/40 border border-white/8">
                  <p className="text-xs text-muted-foreground font-semibold mb-2">Draft Reactive Post</p>
                  <p className="text-sm text-foreground">{trend.draftPost}</p>
                  <Button size="sm" variant="ghost" className="mt-2 h-6 text-xs text-muted-foreground" onClick={()=>navigator.clipboard.writeText(trend.draftPost)}><Copy className="w-3 h-3 mr-1" />Copy</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">AI Recommendations</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TIPS.map((tip,i)=><Card key={i} className="bg-muted/40 border-border"><CardContent className="p-4 flex gap-3"><div className={`flex-shrink-0 mt-0.5 ${tip.color}`}><tip.icon className="w-4 h-4" /></div><div><p className="text-sm font-semibold text-foreground mb-1">{tip.title}</p><p className="text-xs text-muted-foreground leading-relaxed">{tip.body}</p></div></CardContent></Card>)}
        </div>
      </div>
    </div>
  );
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const SettingsTab = () => {
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ businessName:"", industry:"", connectedPlatforms:"Instagram, LinkedIn, Facebook", postingFrequency:"daily", brandHashtag:"", industryHashtags:"", competitors:"", communityTone:"casual", avoidTopics:"", escalationWhatsapp:"" });
  const { toast } = useToast();
  useEffect(() => { agentsApi.getConfig("social").then(c=>{ setConfig(c); if(c.companyData) setForm((f:any)=>({...f,...c.companyData})); }).catch(()=>{}); }, []);
  const save = async () => { setSaving(true); try { await agentsApi.updateCompanyData("social",form); toast({title:"Settings saved"}); } catch { toast({title:"Failed",variant:"destructive"}); } finally { setSaving(false); } };
  return (
    <div className="max-w-2xl space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2"><Settings className="w-4 h-4 text-pink-400" />Social Agent Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {config&&<div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-white/8"><div><p className="text-sm font-medium text-foreground">Agent Active</p><p className="text-xs text-muted-foreground">Schedules & engages automatically</p></div><Switch checked={config.active} onCheckedChange={async v=>{await agentsApi.toggleAgent("social",v);setConfig((c:any)=>({...c,active:v}));}} /></div>}
          {([
            ["businessName","Business Name","Acme Corp"],
            ["industry","Industry","SaaS"],
            ["connectedPlatforms","Connected Platforms","Instagram, LinkedIn, Facebook"],
            ["postingFrequency","Posting Frequency","daily"],
            ["brandHashtag","Brand Hashtag","#YourBrand"],
            ["industryHashtags","Industry Hashtags (5-10)","#AI #Tech #SaaS"],
            ["competitors","Competitors to Monitor","competitor1, competitor2"],
            ["communityTone","Community Reply Tone","casual"],
            ["avoidTopics","Topics to Never Post","politics, religion"],
            ["escalationWhatsapp","Escalation WhatsApp Number","+1234567890"],
          ] as [string,string,string][]).map(([k,l,p])=><div key={k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{l}</Label><Input value={(form as any)[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={p} className="bg-muted/40 border-border text-sm" /></div>)}
          <Button onClick={save} disabled={saving} className="bg-pink-600 hover:bg-pink-500 text-white text-sm">{saving?<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />:<CheckCircle2 className="w-3.5 h-3.5 mr-2" />}Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
type Tab = "calendar"|"compose"|"insights"|"settings";
const TABS = [{id:"calendar" as Tab,label:"Calendar",icon:Calendar},{id:"compose" as Tab,label:"Compose & Schedule",icon:Sparkles},{id:"insights" as Tab,label:"Insights & Trends",icon:TrendingUp},{id:"settings" as Tab,label:"Settings",icon:Settings}];

const AISocialMedia = () => {
  const [tab, setTab] = useState<Tab>("calendar");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [metrics, setMetrics] = useState<any>(null);

  const reloadPosts = useCallback(() => { agentsApi.getPosts().then(setPosts).catch(()=>{}); }, []);
  useEffect(() => {
    reloadPosts();
    agentsApi.getMetrics().then(all=>{ const m=all.find((x:any)=>x.agentType==="social"); setMetrics(m||null); }).catch(()=>{});
  }, [reloadPosts]);

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-600/10 via-rose-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/20"><Share2 className="w-6 h-6" /></div>
              <div><h1 className="text-2xl font-bold text-foreground tracking-tight">AI Social Media Manager</h1><p className="text-muted-foreground text-sm">Multi-platform scheduling, AI post generation & trend monitoring</p></div>
            </div>
            {metrics&&(
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-emerald-600"><CheckCircle2 className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.postsPublished||0}</p><p className="text-xs text-muted-foreground">Published</p></div></CardContent></Card>
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-amber-600"><Clock className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.postsScheduled||0}</p><p className="text-xs text-muted-foreground">Scheduled</p></div></CardContent></Card>
                <Card className="bg-muted/40 border-border"><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-red-600"><AlertCircle className="w-4 h-4 text-white" /></div><div><p className="text-xl font-bold text-foreground">{metrics.sentimentAlerts||0}</p><p className="text-xs text-muted-foreground">Alerts</p></div></CardContent></Card>
              </div>
            )}
            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab===t.id?"text-pink-400 border-pink-400":"text-muted-foreground border-transparent hover:text-foreground"}`}><t.icon className="w-4 h-4" />{t.label}</button>)}
            </div>
          </div>
        </div>
        <motion.div key={tab} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:0.15}} className="px-8 pb-10">
          {tab==="calendar"&&<CalendarTab posts={posts} onCompose={()=>setTab("compose")} onChanged={reloadPosts} />}
          {tab==="compose"&&<ComposeTab onScheduled={p=>{setPosts(prev=>[p,...prev]);setTab("calendar");}} />}
          {tab==="insights"&&<InsightsTab />}
          {tab==="settings"&&<SettingsTab />}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default withPlanGate("ai.social")(AISocialMedia);
