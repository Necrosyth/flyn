/**
 * AI Church Engagement Assistant
 *
 * Tabs:
 *  - Sermon Builder          : scripture + topic → sermon outline
 *  - Congregation Messaging  : bulk follow-up campaigns by segment
 *  - Volunteer Coordinator   : scheduling communications
 */

import { useState, useEffect } from "react";
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
  Church, Sparkles, Copy, Loader2,
  BookOpen, Send, Users, Calendar, Trash2, BanIcon,
} from "lucide-react";
import { churchService } from "@/services/church.service";

// ─── AI helper — routes through Gemini via church endpoint ───────────────────

async function callChurchAI(prompt: string, category: "general" | "document" = "general"): Promise<string> {
  try {
    const result = await churchService.runAIRespond(prompt, category);
    if (result?.response) return result.response;
  } catch { /* fall through to error */ }
  return "AI is unavailable right now. Please check your connection and try again.";
}

// ─── Sermon Builder Panel ─────────────────────────────────────────────────────

const SERMON_STYLES = ["Expository", "Topical", "Narrative", "Biographical", "Evangelistic", "Devotional"];
const DURATIONS = ["20 min", "30 min", "45 min", "60 min"];

const SermonPanel = () => {
  const [topic, setTopic] = useState("");
  const [scripture, setScripture] = useState("");
  const [style, setStyle] = useState(SERMON_STYLES[0]);
  const [duration, setDuration] = useState(DURATIONS[1]);
  const [audience, setAudience] = useState("general congregation");
  const [generating, setGenerating] = useState(false);
  const [outline, setOutline] = useState("");
  const { toast } = useToast();

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setOutline("");
    try {
      const prompt = `Create a detailed ${style} sermon outline. Respond ONLY with the outline — no intro, no meta-commentary, no "here is your sermon."

Topic: "${topic}"
${scripture ? `Primary Scripture: ${scripture}` : "Select the most fitting scriptures"}
Duration: ${duration}
Audience: ${audience}

Required structure (use markdown headers):
## [Sermon Title]
**Scripture | Theme | Duration**

### Opening Hook (2-3 min)
[Compelling story, question, or statistic specific to "${topic}"]

### Introduction
[Context and thesis]

### Point 1 — [Title]
- Scripture: [verse]
- Explanation: [2-3 sentences]
- Application: [how this applies today]
- Transition: [bridge to next point]

### Point 2 — [Title]
[Same structure]

### Point 3 — [Title]
[Same structure]

### Closing & Altar Call
[Response invitation specific to "${topic}"]

### Life Group Discussion Questions
1. [Question]
2. [Question]
3. [Question]

Every section must be specific to "${topic}" — no filler or generic church language.`;
      const result = await callChurchAI(prompt, "general");
      if (result.includes('temporarily unavailable') || result.includes('rate limit') || result.includes('AI is unavailable')) {
        toast({ variant: "destructive", title: "AI rate limit reached", description: "Too many requests this minute. Wait 30 seconds and try again." });
        setOutline("");
      } else {
        setOutline(result);
      }
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
              <BookOpen className="w-4 h-4 text-amber-400" /> Sermon Builder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sermon topic / theme *</Label>
              <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Walking in Faith, Forgiveness, The Power of Prayer" className="bg-muted/40 border-border text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Key scripture passage (optional)</Label>
              <Input value={scripture} onChange={e => setScripture(e.target.value)} placeholder="e.g. John 3:16, Matthew 5:1-12, Psalm 23" className="bg-muted/40 border-border text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{SERMON_STYLES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{DURATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Target audience</Label>
              <Input value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. general congregation, youth, new believers" className="bg-muted/40 border-border text-sm" />
            </div>
            <Button onClick={generate} disabled={!topic.trim() || generating} className="w-full bg-amber-600 hover:bg-amber-500 text-white text-sm">
              {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {generating ? "Building sermon…" : "Generate Sermon Outline"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        {outline ? (
          <Card className="bg-muted/40 border-border h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">{topic}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{style} · {duration}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(outline); toast({ title: "Copied" }); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea value={outline} onChange={e => setOutline(e.target.value)} className="bg-muted/40 border-border text-sm leading-relaxed min-h-[500px] resize-none font-sans" />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed border-border text-center p-8">
            <BookOpen className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Your sermon outline will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Congregation Messaging Panel ─────────────────────────────────────────────

const SEGMENTS = ["All Members", "First-time Visitors", "New Members (< 3 months)", "Regular Attendees", "Inactive Members", "Youth Group", "Small Groups / Life Groups", "Donors", "Prayer Team", "Volunteers"];
const MSG_OCCASIONS = ["Sunday Service Reminder", "Special Event Invitation", "Prayer Request Follow-up", "Giving Campaign", "Community Outreach", "Holiday Message", "Condolence / Bereavement", "Celebration / Milestone", "Newsletter Summary"];

const MessagingPanel = () => {
  const [segment, setSegment] = useState(SEGMENTS[1]);
  const [occasion, setOccasion] = useState(MSG_OCCASIONS[0]);
  const [channel, setChannel] = useState("whatsapp");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [messages, setMessages] = useState<{ id: string; segment: string; occasion: string; content: string }[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    churchService.getStats().then((s: any) => setMemberCount(s?.totalMembers ?? null)).catch(() => {});
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const memberCtx = memberCount !== null ? `The congregation currently has ${memberCount} members.` : "";
      const prompt = `You are a church communications specialist. Write a ${channel.toUpperCase()} message campaign for:

Segment: ${segment}
Occasion: ${occasion}
Channel: ${channel} ${channel === "whatsapp" ? "(max 300 chars per message, conversational)" : channel === "sms" ? "(max 160 chars, no formatting)" : "(email, can be longer, use HTML-friendly formatting)"}
${memberCtx}
${notes ? `Additional context: ${notes}` : ""}

Create 3-4 messages forming a complete campaign sequence (e.g. Day 1, Day 4, Day 10). Each message should:
- Be warm and pastoral in tone
- Use [First Name] as the personalization placeholder
- Be ready to send with minimal editing
- Fit the channel constraints above

Write ONLY the messages — no meta-commentary. Label each clearly (Day 1, Day 4, etc.)`;
      const content = await callChurchAI(prompt, "general");
      if (content.includes('temporarily unavailable') || content.includes('rate limit')) {
        toast({ variant: "destructive", title: "AI rate limit reached", description: "Wait 30 seconds and try again." });
      } else {
        setMessages(prev => [{ id: `msg${Date.now()}`, segment, occasion, content }, ...prev]);
        toast({ title: "Messages generated" });
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-400" /> Congregation Messaging
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Segment</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SEGMENTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Occasion</Label>
              <Select value={occasion} onValueChange={setOccasion}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MSG_OCCASIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Additional notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Event details, speaker name, special instructions…" className="bg-muted/40 border-border text-sm min-h-[60px] resize-none" />
          </div>
          <Button onClick={generate} disabled={generating} className="bg-blue-600 hover:bg-blue-500 text-white text-sm">
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
            {generating ? "Generating…" : "Generate Messages"}
          </Button>
        </CardContent>
      </Card>

      {messages.map(m => (
        <Card key={m.id} className="bg-muted/40 border-border">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-[10px]">{m.segment}</Badge>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{m.occasion}</Badge>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(m.content); toast({ title: "Copied" }); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">{m.content}</pre>
          </CardContent>
        </Card>
      ))}

      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8">
          <Send className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Generated messages will appear here</p>
        </div>
      )}
    </div>
  );
};

// ─── Volunteer Coordinator Panel ──────────────────────────────────────────────

const VOLUNTEER_TEAMS = ["Worship / Music", "Children's Ministry", "Hospitality / Ushers", "Tech / AV", "Prayer Team", "Outreach", "Youth Ministry", "Parking / Security", "Cleaning / Setup"];
const VOL_MSG_TYPES = ["Volunteer Recruitment", "Shift Reminder (48h)", "Day-of Confirmation", "Appreciation Message", "Skills Survey", "Emergency Coverage Request", "Team Meeting Invite"];

const VolunteerPanel = () => {
  const [team, setTeam] = useState(VOLUNTEER_TEAMS[2]);
  const [msgType, setMsgType] = useState(VOL_MSG_TYPES[0]);
  const [eventDetails, setEventDetails] = useState("");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{ id: string; team: string; type: string; content: string }[]>([]);
  const { toast } = useToast();

  const generate = async () => {
    setGenerating(true);
    try {
      const prompt = `You are a church volunteer coordinator. Write a ${msgType} message for the ${team} team.

Message type: ${msgType}
Team / Ministry: ${team}
${eventDetails ? `Event / date details: ${eventDetails}` : ""}

Requirements:
- Warm, faith-filled tone — volunteers are serving, not employees
- Use [Name] for personalization
- Be specific to the ${team} team (mention their role/location if relevant)
- Keep it concise and actionable
- If it's a reminder or confirmation, include what to bring / when to arrive / who the team lead is (use [Team Lead] placeholder)

Write the ready-to-send message directly. No meta-commentary.`;
      const content = await callChurchAI(prompt, "general");
      if (content.includes('temporarily unavailable') || content.includes('rate limit')) {
        toast({ variant: "destructive", title: "AI rate limit reached", description: "Wait 30 seconds and try again." });
        return;
      }
      setResults(prev => [{ id: `vol${Date.now()}`, team, type: msgType, content }, ...prev]);
      toast({ title: "Message generated" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-green-400" /> Volunteer Coordinator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Team / ministry</Label>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{VOLUNTEER_TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Message type</Label>
              <Select value={msgType} onValueChange={setMsgType}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{VOL_MSG_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Event / date details</Label>
            <Input value={eventDetails} onChange={e => setEventDetails(e.target.value)} placeholder="Sunday 9AM, Main Auditorium, Team Lead: Sarah…" className="bg-muted/40 border-border text-sm" />
          </div>
          <Button onClick={generate} disabled={generating} className="bg-green-600 hover:bg-green-500 text-white text-sm">
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
            {generating ? "Writing…" : "Generate Message"}
          </Button>
        </CardContent>
      </Card>

      {results.map(r => (
        <Card key={r.id} className="bg-muted/40 border-border">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-[10px]">{r.team}</Badge>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{r.type}</Badge>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(r.content); toast({ title: "Copied" }); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">{r.content}</pre>
          </CardContent>
        </Card>
      ))}

      {results.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] rounded-2xl border border-dashed border-border text-center p-8">
          <Users className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Generated volunteer messages will appear here</p>
        </div>
      )}
    </div>
  );
};

// ─── Volunteer Blockouts Panel ────────────────────────────────────────────────

const MINISTRIES = [
  "Worship / Music", "Children's Ministry", "Hospitality / Ushers",
  "Tech / AV", "Prayer Team", "Outreach", "Youth Ministry",
  "Parking / Security", "Cleaning / Setup", "Any / All",
];

const BlockoutsPanel = () => {
  const { toast } = useToast();
  const [blockouts, setBlockouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    volunteerName: "",
    ministry: "",
    fromDate: "",
    toDate: "",
    reason: "",
  });

  const load = () =>
    churchService.getVolunteerBlockouts().then((d: any) => {
      setBlockouts(d.blockouts ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const f = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const save = async () => {
    if (!form.volunteerName.trim() || !form.fromDate || !form.toDate) {
      toast({ variant: "destructive", title: "Missing fields", description: "Name, From date and To date are required." });
      return;
    }
    if (form.toDate < form.fromDate) {
      toast({ variant: "destructive", title: "Invalid dates", description: "To date must be on or after From date." });
      return;
    }
    setSaving(true);
    try {
      const res: any = await churchService.createVolunteerBlockout({
        ...form,
        ministry: form.ministry || undefined,
        reason: form.reason || undefined,
      });
      if (res.success) {
        setBlockouts(prev => [res.blockout, ...prev]);
        setForm({ volunteerName: "", ministry: "", fromDate: "", toDate: "", reason: "" });
        toast({ title: "Blockout saved", description: `${form.volunteerName} is marked unavailable.` });
      }
    } finally { setSaving(false); }
  };

  const remove = async (id: string, name: string) => {
    await churchService.deleteVolunteerBlockout(id);
    setBlockouts(prev => prev.filter((b: any) => b.id !== id));
    toast({ title: "Blockout removed", description: `${name}'s availability restored.` });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Form */}
      <Card className="bg-muted/40 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BanIcon className="w-4 h-4 text-amber-400" /> Mark Yourself Unavailable
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inform the scheduler that you won't be available for a date range. The rotation engine will automatically find a replacement.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Your name *</Label>
              <Input
                value={form.volunteerName}
                onChange={e => f("volunteerName", e.target.value)}
                placeholder="e.g. Sarah Johnson"
                className="bg-muted/40 border-border text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ministry team</Label>
              <Select value={form.ministry} onValueChange={v => f("ministry", v)}>
                <SelectTrigger className="bg-muted/40 border-border text-sm"><SelectValue placeholder="Select team (optional)" /></SelectTrigger>
                <SelectContent>{MINISTRIES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From date *</Label>
              <Input
                type="date"
                value={form.fromDate}
                min={today}
                onChange={e => f("fromDate", e.target.value)}
                className="bg-muted/40 border-border text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To date *</Label>
              <Input
                type="date"
                value={form.toDate}
                min={form.fromDate || today}
                onChange={e => f("toDate", e.target.value)}
                className="bg-muted/40 border-border text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
            <Input
              value={form.reason}
              onChange={e => f("reason", e.target.value)}
              placeholder="e.g. Family vacation, Medical appointment, Travel…"
              className="bg-muted/40 border-border text-sm"
            />
          </div>
          <Button
            onClick={save}
            disabled={saving || !form.volunteerName.trim() || !form.fromDate || !form.toDate}
            className="bg-amber-600 hover:bg-amber-500 text-white text-sm gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Submit Blockout"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing blockouts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Scheduled Blockouts</h3>
          {blockouts.length > 0 && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px]">{blockouts.length} active</Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : blockouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[140px] rounded-2xl border border-dashed border-border text-center p-6">
            <Calendar className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No blockouts recorded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Submit one above and the rotation engine will cover your slot automatically.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blockouts.map((b: any) => {
              const isActive = b.fromDate <= today && b.toDate >= today;
              const isPast = b.toDate < today;
              return (
                <Card
                  key={b.id}
                  className={`bg-muted/40 border-border transition-colors ${isActive ? "border-amber-500/30 bg-amber-500/5" : isPast ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "bg-amber-400 animate-pulse" : isPast ? "bg-slate-600" : "bg-blue-400"}`} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{b.volunteerName}</span>
                          {b.ministry && (
                            <Badge className="bg-muted/40 text-muted-foreground border-border text-[10px]">{b.ministry}</Badge>
                          )}
                          {isActive && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">Active now</Badge>}
                          {isPast && <Badge className="bg-slate-500/20 text-muted-foreground text-[10px]">Past</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {b.fromDate} → {b.toDate}
                          {b.reason && <span className="text-muted-foreground"> · {b.reason}</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => remove(b.id, b.volunteerName)}
                      className="text-muted-foreground hover:text-red-400 transition-colors p-1 flex-shrink-0"
                      title="Remove blockout"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "sermon" | "messaging" | "volunteer" | "blockouts";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "sermon", label: "Sermon Builder", icon: <BookOpen className="w-4 h-4" /> },
  { id: "messaging", label: "Congregation Messaging", icon: <Send className="w-4 h-4" /> },
  { id: "volunteer", label: "Volunteer Coordinator", icon: <Users className="w-4 h-4" /> },
  { id: "blockouts", label: "Availability Blockouts", icon: <BanIcon className="w-4 h-4" /> },
];

const AIChurchAgent = () => {
  const [tab, setTab] = useState<Tab>("sermon");

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-600/10 via-yellow-600/5 to-transparent" />
          <div className="relative px-8 pt-8 pb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 text-white shadow-lg shadow-amber-500/20">
                <Church className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Church Engagement</h1>
                <p className="text-muted-foreground text-sm">Sermon outlines, congregation follow-ups & volunteer coordination</p>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t.id ? "text-amber-400 border-amber-400" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="px-8 pb-10">
          {tab === "sermon" && <SermonPanel />}
          {tab === "messaging" && <MessagingPanel />}
          {tab === "volunteer" && <VolunteerPanel />}
          {tab === "blockouts" && <BlockoutsPanel />}
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default AIChurchAgent;
