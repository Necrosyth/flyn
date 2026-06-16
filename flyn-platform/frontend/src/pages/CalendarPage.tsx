/**
 * Calendar Page — zero external dependencies.
 * Custom month/week grid built on Tailwind + vanilla JS date helpers.
 *
 * Cross-module connections:
 *  - Internal events (created here) → /api/calendar/events
 *  - Church/Events module           → /api/church/events  (auto-pulled)
 *  - Tasks with due dates           → /api/tasks          (auto-pulled)
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { authedFetch } from "@/services/authApi";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { calendarService } from "@/services/calendar.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Calendar as CalendarIcon, Plus, RefreshCw, ChevronLeft, ChevronRight,
  Link, Clock, X, Check, MessageCircle, Layers, CheckSquare, Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── API base ─────────────────────────────────────────────────────────────────
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ??
  "https://pjpmzvu7wn.us-east-1.awsapprunner.com/api";

// ─── date helpers (no external lib) ──────────────────────────────────────────
const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/** Normalises any date string (YYYY-MM-DD or ISO) to a local YYYY-MM-DD string */
function normStart(start: string): string {
  if (!start) return "";
  if (start.length <= 10) return start;          // already YYYY-MM-DD
  const d = new Date(start);
  return isNaN(d.getTime()) ? start.slice(0, 10) : toDateStr(d);
}

function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1).getDay();
  const total = daysInMonth(year, month);
  const cells: (Date | null)[] = Array(first).fill(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));
  return weeks;
}

function buildWeekDays(anchor: Date): Date[] {
  const dow = anchor.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - dow + i);
    return d;
  });
}

// ─── colour palette ───────────────────────────────────────────────────────────
const COLORS = ["bg-indigo-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-sky-500","bg-purple-500"];
function eventColor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) & 0xff;
  return COLORS[h % COLORS.length];
}

// Source badge colours
const SOURCE_COLORS: Record<string, string> = {
  church:    "bg-violet-500/20 text-violet-300 border-violet-500/30",
  task:      "bg-amber-500/20  text-amber-300  border-amber-500/30",
  whatsapp:  "bg-green-500/20  text-green-300  border-green-500/30",
  google:    "bg-red-500/20    text-red-300    border-red-500/30",
  microsoft: "bg-sky-500/20    text-sky-300    border-sky-500/30",
  hr:        "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface CalEvent {
  id: string;
  title: string;
  start: string;   // YYYY-MM-DD or ISO — normalised at read time
  end?: string;
  time?: string;
  allDay?: boolean;
  description?: string;
  source?: string;
}

// ─── Mini month (sidebar) ─────────────────────────────────────────────────────
const MiniMonth = ({ year, month, selected, onSelect, onMonthChange }: {
  year: number; month: number; selected: Date;
  onSelect: (d: Date) => void; onMonthChange: (y: number, m: number) => void;
}) => {
  const today = new Date();
  const weeks = buildMonthGrid(year, month);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <button onClick={() => { const d = new Date(year, month - 1, 1); onMonthChange(d.getFullYear(), d.getMonth()); }} className="p-1 rounded hover:bg-muted text-muted-foreground"><ChevronLeft className="w-3 h-3" /></button>
        <span className="text-[11px] font-semibold text-foreground">{MONTHS[month].slice(0,3)} {year}</span>
        <button onClick={() => { const d = new Date(year, month + 1, 1); onMonthChange(d.getFullYear(), d.getMonth()); }} className="p-1 rounded hover:bg-muted text-muted-foreground"><ChevronRight className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {DAYS.map(d => <div key={d} className="text-[9px] text-center text-muted-foreground py-1 font-semibold">{d[0]}</div>)}
        {weeks.flat().map((day, i) => (
          <button key={i} disabled={!day} onClick={() => day && onSelect(day)}
            className={`text-[11px] h-6 w-full rounded transition-colors ${!day ? "" : isSameDay(day, selected) ? "bg-primary text-white font-bold" : isSameDay(day, today) ? "text-primary font-bold hover:bg-muted" : "text-muted-foreground hover:bg-muted"}`}>
            {day?.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const CalendarPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  const [integrationStatus, setIntegrationStatus] = useState<{ calendly: boolean; zoom: boolean }>({ calendly: false, zoom: false });

  // Calendar-native events (from /api/calendar/events)
  const [calEvents, setCalEvents]   = useState<CalEvent[]>([]);
  // Cross-module: church events
  const [churchEvents, setChurchEvents] = useState<CalEvent[]>([]);
  // Cross-module: tasks with due dates
  const [taskEvents, setTaskEvents] = useState<CalEvent[]>([]);
  // Cross-module: HR interviews & schedules
  const [hrEvents, setHrEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Merged event list (all sources)
  const allEvents: CalEvent[] = useMemo(
    () => [...calEvents, ...churchEvents, ...taskEvents, ...hrEvents],
    [calEvents, churchEvents, taskEvents, hrEvents],
  );

  // view state
  const [view, setView]     = useState<"month" | "week">("month");
  const [year, setYear]     = useState(today.getFullYear());
  const [month, setMonth]   = useState(today.getMonth());
  const [anchor, setAnchor] = useState(today);

  // sidebar mini-month
  const [miniYear, setMiniYear]   = useState(today.getFullYear());
  const [miniMonth, setMiniMonth] = useState(today.getMonth());

  // new-event dialog
  const [newOpen, setNewOpen]     = useState(false);
  const [newDate, setNewDate]     = useState("");
  const [newTime, setNewTime]     = useState("");
  const [newTitle, setNewTitle]   = useState("");
  const [newDesc, setNewDesc]     = useState("");
  const [newSource, setNewSource] = useState<string>("internal");
  const [saving, setSaving]       = useState(false);

  // event detail
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);

  // ── Fetch real integration status from backend ──────────────────────────────
  useEffect(() => {
    if (!user?.organizationId) return;
    authedFetch(`${API_BASE}/integrations/status`, { headers: { 'x-tenant-id': user.organizationId } })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (!data) return;
        setIntegrationStatus({
          calendly: data?.calendly?.status === 'connected',
          zoom: data?.zoom?.status === 'connected',
        });
      })
      .catch(() => {});
  }, [user?.organizationId]);

  // ── OAuth redirect success toasts ───────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendly_connected') === '1') {
      toast({ title: 'Calendly connected', description: 'Your Calendly account has been linked successfully.' });
      setIntegrationStatus(s => ({ ...s, calendly: true }));
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('zoom_connected') === '1') {
      toast({ title: 'Zoom connected', description: 'Your Zoom account has been linked successfully.' });
      setIntegrationStatus(s => ({ ...s, zoom: true }));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // ── Fetch calendar-native events ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = user?.organizationId ? await calendarService.getEvents(user.organizationId) : [];
        setCalEvents(Array.isArray(data) ? data : []);
      } catch {
        setCalEvents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // ── Fetch church/events module events ───────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/church/events?limit=200`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => {
        const rows: any[] = Array.isArray(data) ? data : (data?.events ?? data?.rows ?? data?.data ?? []);
        setChurchEvents(
          rows
            .filter((e: any) => e.date || e.dateTime)
            .map((e: any) => ({
              id:          `church_${e._id ?? e.id ?? Math.random()}`,
              title:       e.title ?? e.name ?? "Event",
              start:       e.date ?? e.dateTime ?? "",
              end:         e.endDate ?? undefined,
              time:        e.time ?? undefined,
              description: [e.location ? `📍 ${e.location}` : "", e.description ?? ""].filter(Boolean).join(" · ") || undefined,
              source:      "church",
            }))
        );
      })
      .catch(() => {});
  }, []);

  // ── Fetch tasks with due dates ──────────────────────────────────────────────
  useEffect(() => {
    authedFetch(`${API_BASE}/tasks`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then((data: any) => {
        const rows: any[] = Array.isArray(data) ? data : (data?.tasks ?? data?.data ?? []);
        setTaskEvents(
          rows
            .filter((t: any) => t.dueDate || t.due_date)
            .map((t: any) => ({
              id:          `task_${t.id ?? t._id ?? Math.random()}`,
              title:       `✓ ${t.title ?? t.name ?? "Task"}`,
              start:       t.dueDate ?? t.due_date ?? "",
              description: t.description ?? undefined,
              source:      "task",
            }))
        );
      })
      .catch(() => {});
  }, []);

  // ── Fetch HR interviews ─────────────────────────────────────────────────────
  useEffect(() => {
    authedFetch(`${API_BASE}/hr/interviews`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => {
        const rows: any[] = Array.isArray(data) ? data : [];
        setHrEvents(
          rows
            .filter((e: any) => e.start)
            .map((e: any) => ({
              id:          `hr_${e.id ?? Math.random()}`,
              title:       e.title ?? `Interview: ${e.metadata?.candidateName ?? 'Candidate'}`,
              start:       e.start ?? "",
              end:         e.end ?? undefined,
              description: e.description ?? undefined,
              source:      "hr",
            }))
        );
      })
      .catch(() => {});
  }, []);

  // ── navigation ──────────────────────────────────────────────────────────────
  const prevMonth = () => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); setMiniYear(d.getFullYear()); setMiniMonth(d.getMonth()); };
  const nextMonth = () => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); setMiniYear(d.getFullYear()); setMiniMonth(d.getMonth()); };
  const prevWeek  = () => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); };
  const nextWeek  = () => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); };
  const goToday   = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setAnchor(today); setMiniYear(today.getFullYear()); setMiniMonth(today.getMonth()); };

  const handleMiniSelect = (d: Date) => {
    setYear(d.getFullYear()); setMonth(d.getMonth()); setAnchor(d);
    setMiniYear(d.getFullYear()); setMiniMonth(d.getMonth());
  };

  // ── helpers ─────────────────────────────────────────────────────────────────
  // Match events to a day, handling both YYYY-MM-DD and ISO timestamps
  const eventsOnDay = useCallback((d: Date) =>
    allEvents.filter(e => normStart(e.start) === toDateStr(d)),
    [allEvents]);

  const openNewOnDay = (d: Date) => { setNewDate(toDateStr(d)); setNewTime(""); setNewOpen(true); };

  const saveEvent = async () => {
    if (!newTitle.trim() || !newDate) return;
    setSaving(true);
    try {
      const start = newTime ? `${newDate}T${newTime}` : newDate;
      const created: CalEvent = {
        id: `local_${Date.now()}`,
        title: newTitle.trim(),
        start,
        time: newTime || undefined,
        description: newDesc || undefined,
        allDay: !newTime,
        source: newSource !== "internal" ? newSource : undefined,
      };
      if (user?.organizationId) {
        await calendarService.createEvent(user.organizationId, created as any).catch(() => {});
      }
      setCalEvents(prev => [...prev, created]);
      toast({ title: "Event created", description: `${newTitle} on ${newDate}${newTime ? " at " + newTime : ""}` });
      setNewOpen(false); setNewTitle(""); setNewDesc(""); setNewDate(""); setNewTime(""); setNewSource("internal");
    } finally { setSaving(false); }
  };

  // ── grids ───────────────────────────────────────────────────────────────────
  const monthWeeks = buildMonthGrid(year, month);
  const weekDays   = buildWeekDays(anchor);

  // Upcoming: sort all events by start date, pick next 5 from today onwards
  const upcomingEvents = useMemo(() => {
    const todayStr = toDateStr(today);
    return [...allEvents]
      .filter(e => e.start && normStart(e.start) >= todayStr)
      .sort((a, b) => normStart(a.start).localeCompare(normStart(b.start)))
      .slice(0, 8);
  }, [allEvents, today]);

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col overflow-hidden bg-background">

        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Calendars</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-widest">Hub</span>
            {loading && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin ml-1" />}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              {(["month","week"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? "bg-primary text-white" : "text-muted-foreground hover:text-white hover:bg-muted"}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-xs border border-border text-foreground hover:bg-muted transition-colors">Today</button>
            <button onClick={view === "month" ? prevMonth : prevWeek} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-foreground min-w-[160px] text-center">
              {view === "month"
                ? `${MONTHS[month]} ${year}`
                : `${MONTHS[weekDays[0].getMonth()].slice(0,3)} ${weekDays[0].getDate()} – ${MONTHS[weekDays[6].getMonth()].slice(0,3)} ${weekDays[6].getDate()}`}
            </span>
            <button onClick={view === "month" ? nextMonth : nextWeek} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>

            <button
              onClick={() => { setNewSource("whatsapp"); setNewDate(toDateStr(today)); setNewOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Book WhatsApp Appt
            </button>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white gap-1.5 shadow-lg shadow-primary/20"
              onClick={() => { setNewSource("internal"); setNewDate(toDateStr(today)); setNewOpen(true); }}>
              <Plus className="w-3.5 h-3.5" /> New Event
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">

          {/* ── Sidebar ── */}
          <aside className="w-72 border-r border-border bg-black/30 hidden lg:flex flex-col p-4 gap-6 overflow-y-auto shrink-0">
            {/* Mini month */}
            <MiniMonth year={miniYear} month={miniMonth} selected={anchor}
              onSelect={handleMiniSelect}
              onMonthChange={(y, m) => { setMiniYear(y); setMiniMonth(m); }} />

            {/* Source legend */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Module Sync</p>
              <div className="space-y-1.5">
                {[
                  { key: "church", label: "Events module", count: churchEvents.length, icon: <Layers className="w-3 h-3" /> },
                  { key: "task",   label: "Tasks (due dates)", count: taskEvents.length,  icon: <CheckSquare className="w-3 h-3" /> },
                  { key: "hr",     label: "HR Interviews", count: hrEvents.length, icon: <Users className="w-3 h-3" /> },
                  { key: "whatsapp", label: "WhatsApp Appts", count: allEvents.filter(e => e.source === "whatsapp").length, icon: <MessageCircle className="w-3 h-3" /> },
                ].map(src => (
                  <div key={src.key} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/40 border border-white/[0.06]">
                    <div className="flex items-center gap-2 text-muted-foreground">{src.icon}<span className="text-xs">{src.label}</span></div>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">{src.count}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Integrations */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Integrations</p>
              {[
                { label: "Google Calendar", initial: "G", color: "text-red-400 bg-red-500/10 border-red-500/20", provider: "google" as const },
                { label: "Outlook / Microsoft", initial: "O", color: "text-sky-400 bg-sky-500/10 border-sky-500/20", provider: "microsoft" as const },
              ].map(p => (
                <Card key={p.provider} className="bg-muted/30 border-border hover:bg-muted transition-colors cursor-pointer group">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center border text-xs font-bold ${p.color}`}>{p.initial}</div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{p.label}</p>
                        <p className="text-[10px] text-muted-foreground">Not connected</p>
                      </div>
                    </div>
                    <button onClick={() => { window.location.href = p.provider === "google" ? calendarService.getGoogleAuthUrl(user?.organizationId ?? "") : calendarService.getMicrosoftAuthUrl(user?.organizationId ?? ""); }}
                      className="p-1.5 rounded-lg text-muted-foreground group-hover:text-primary hover:bg-muted transition-colors">
                      <Link className="w-3.5 h-3.5" />
                    </button>
                  </CardContent>
                </Card>
              ))}
              {[
                {
                  label: "Zoom",
                  initial: "Z",
                  color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                  getUrl: () => calendarService.getZoomAuthUrl(user?.organizationId ?? ""),
                  connectedParam: "zoom_connected",
                },
                {
                  label: "Calendly",
                  initial: "C",
                  color: "text-teal-400 bg-teal-500/10 border-teal-500/20",
                  getUrl: () => calendarService.getCalendlyAuthUrl(user?.organizationId ?? ""),
                  connectedParam: "calendly_connected",
                },
              ].map(p => {
                const isConnected = p.connectedParam === "calendly_connected" ? integrationStatus.calendly : integrationStatus.zoom;
                return (
                  <Card key={p.label} className="bg-muted/30 border-border hover:bg-muted transition-colors cursor-pointer group">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border text-xs font-bold ${p.color}`}>{p.initial}</div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{p.label}</p>
                          <p className={`text-[10px] ${isConnected ? "text-emerald-400" : "text-muted-foreground"}`}>
                            {isConnected ? "Connected" : "Not connected"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => { window.location.href = p.getUrl(); }}
                        className="p-1.5 rounded-lg text-muted-foreground group-hover:text-primary hover:bg-muted transition-colors"
                        title={`Connect ${p.label}`}
                      >
                        <Link className="w-3.5 h-3.5" />
                      </button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Upcoming (sorted, future-first) */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Upcoming</p>
              <div className="space-y-1">
                {upcomingEvents.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground px-1">No upcoming events</p>
                ) : upcomingEvents.map(e => (
                  <button key={e.id} onClick={() => setDetailEvent(e)}
                    className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted transition-colors group">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${eventColor(e.title)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground">{normStart(e.start)}{e.time ? ` · ${e.time}` : ""}</p>
                    </div>
                    {e.source && SOURCE_COLORS[e.source] && (
                      <span className={`text-[9px] px-1 py-0.5 rounded border font-medium shrink-0 mt-0.5 ${SOURCE_COLORS[e.source]}`}>
                        {e.source}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* ── Main grid ── */}
          <main className="flex-1 overflow-auto p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${view}-${year}-${month}-${anchor.toDateString()}`}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* ── Month view ── */}
                {view === "month" && (
                  <div className="rounded-2xl border border-border bg-card"
                    style={{ minHeight: monthWeeks.length * 130 + 44 }}>
                    {/* Day-of-week headers */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", height: 44, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {DAYS.map(d => (
                        <div key={d} className="flex items-center justify-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{d}</div>
                      ))}
                    </div>

                    {/* Week rows — 130px per row via explicit inline CSS grid, no Tailwind ambiguity */}
                    <div style={{ display: "grid", gridTemplateRows: `repeat(${monthWeeks.length}, 130px)` }}>
                      {monthWeeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-7" style={{ borderBottom: wi < monthWeeks.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", height: 130 }}>
                          {week.map((day, di) => {
                            const isToday        = day ? isSameDay(day, today) : false;
                            const dayEvents      = day ? eventsOnDay(day) : [];
                            const isCurrentMonth = day ? day.getMonth() === month : false;
                            return (
                              <div key={di} onClick={() => day && openNewOnDay(day)}
                                className={`p-2 border-r border-white/[0.04] last:border-r-0 transition-colors
                                  ${day ? "cursor-pointer hover:bg-muted/40" : "opacity-0 pointer-events-none"}
                                  ${day && !isCurrentMonth ? "opacity-30" : ""}`}>
                                {day && (
                                  <>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1 transition-colors
                                      ${isToday ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}>
                                      {day.getDate()}
                                    </div>
                                    <div className="space-y-0.5">
                                      {dayEvents.slice(0, 3).map(e => (
                                        <button key={e.id} onClick={ev => { ev.stopPropagation(); setDetailEvent(e); }}
                                          className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] text-foreground font-medium truncate flex items-center gap-1 ${eventColor(e.title)} bg-opacity-80 hover:bg-opacity-100 transition-all`}>
                                          {e.source === "whatsapp" && <MessageCircle className="w-2.5 h-2.5 shrink-0" />}
                                          {e.source === "church"   && <Layers className="w-2.5 h-2.5 shrink-0 opacity-70" />}
                                          {e.source === "task"     && <CheckSquare className="w-2.5 h-2.5 shrink-0 opacity-70" />}
                                          {e.source === "hr"       && <Users className="w-2.5 h-2.5 shrink-0 opacity-70" />}
                                          <span className="truncate">{e.title}</span>
                                        </button>
                                      ))}
                                      {dayEvents.length > 3 && (
                                        <p className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</p>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Week view ── */}
                {view === "week" && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-border">
                      {weekDays.map((day, i) => {
                        const isToday = isSameDay(day, today);
                        return (
                          <div key={i} className={`p-3 text-center border-r border-white/[0.04] last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">{DAYS[i]}</p>
                            <p className={`text-lg font-bold mt-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>{day.getDate()}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-7" style={{ minHeight: 520 }}>
                      {weekDays.map((day, i) => {
                        const isToday    = isSameDay(day, today);
                        const dayEvents  = eventsOnDay(day);
                        return (
                          <div key={i} onClick={() => openNewOnDay(day)}
                            className={`p-2 border-r border-white/[0.04] last:border-r-0 cursor-pointer hover:bg-muted/30 transition-colors ${isToday ? "bg-primary/[0.03]" : ""}`}
                            style={{ minHeight: 520 }}>
                            <div className="space-y-1">
                              {dayEvents.map(e => (
                                <button key={e.id} onClick={ev => { ev.stopPropagation(); setDetailEvent(e); }}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs text-foreground font-medium ${eventColor(e.title)} bg-opacity-80 hover:bg-opacity-100 transition-all`}>
                                  <p className="truncate flex items-center gap-1">
                                    {e.source === "whatsapp" && <MessageCircle className="w-3 h-3 shrink-0" />}
                                    {e.source === "church"   && <Layers className="w-3 h-3 shrink-0 opacity-70" />}
                                    {e.source === "task"     && <CheckSquare className="w-3 h-3 shrink-0 opacity-70" />}
                                    {e.source === "hr"       && <Users className="w-3 h-3 shrink-0 opacity-70" />}
                                    {e.title}
                                  </p>
                                  {(e.time || e.description) && (
                                    <p className="text-[10px] opacity-75 truncate mt-0.5">{e.time ? `🕐 ${e.time}` : ""}{e.time && e.description ? " · " : ""}{e.description ?? ""}</p>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* ── New event dialog ── */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {newSource === "whatsapp"
                ? <><MessageCircle className="w-4 h-4 text-green-400" /> Book WhatsApp Appointment</>
                : <><CalendarIcon className="w-4 h-4 text-primary" /> New Event</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {newSource === "whatsapp" && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <MessageCircle className="w-4 h-4 text-green-400 shrink-0" />
                <p className="text-xs text-green-300">This appointment will be linked to WhatsApp and shown with a WhatsApp badge on the calendar.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={newSource === "whatsapp" ? "e.g. Consultation with John" : "e.g. Sunday Service"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date *</Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time (optional)</Label>
                <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional notes" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Select value={newSource} onValueChange={setNewSource}>
                <SelectTrigger className="h-8 text-xs bg-muted/40 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="google">Google Calendar</SelectItem>
                  <SelectItem value="microsoft">Outlook / Microsoft</SelectItem>
                  <SelectItem value="zoom">Zoom Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={saveEvent} disabled={!newTitle.trim() || !newDate || saving} className="gap-2">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {newSource === "whatsapp" ? "Book Appointment" : "Save Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Event detail dialog ── */}
      <Dialog open={!!detailEvent} onOpenChange={() => setDetailEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailEvent && <span className={`w-3 h-3 rounded-full shrink-0 ${eventColor(detailEvent.title)}`} />}
              {detailEvent?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {detailEvent && normStart(detailEvent.start)}
              {detailEvent?.time && ` at ${detailEvent.time}`}
              {detailEvent?.end ? ` → ${normStart(detailEvent.end)}` : ""}
            </div>
            {detailEvent?.source && SOURCE_COLORS[detailEvent.source] && (
              <span className={`inline-flex text-xs px-2 py-1 rounded-lg border font-medium ${SOURCE_COLORS[detailEvent.source]}`}>
                {detailEvent.source === "church" ? "Events Module" : detailEvent.source === "task" ? "Task" : detailEvent.source === "hr" ? "HR Module" : detailEvent.source}
              </span>
            )}
            {detailEvent?.description && (
              <p className="text-sm text-foreground leading-relaxed">{detailEvent.description}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailEvent(null)} className="gap-1.5"><X className="w-3.5 h-3.5" /> Close</Button>
            {/* Only allow deleting calendar-native events, not cross-module ones */}
            {(!detailEvent?.source || detailEvent.source === "internal" || detailEvent.source === "whatsapp") && (
              <Button variant="destructive" size="sm" onClick={async () => {
                const id = detailEvent?.id;
                setCalEvents(prev => prev.filter(e => e.id !== id));
                setDetailEvent(null);
                if (id && user?.organizationId) { calendarService.deleteEvent(user.organizationId, id).catch(() => {}); }
                toast({ title: "Event removed" });
              }}>
                Delete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

import { withPlanGate } from "@/components/PlanGate";
export default withPlanGate("calendar.sync")(CalendarPage);
