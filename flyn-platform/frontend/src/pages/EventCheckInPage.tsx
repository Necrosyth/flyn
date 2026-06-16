/**
 * EventCheckInPage — Public QR self-check-in page.
 * Route: /checkin/:eventId?token=...  (no auth required)
 *
 * Opened when an attendee scans the event QR code. Collects name, email,
 * and phone, then marks them as checked in via the backend.
 */
import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Calendar,
  MapPin,
  Loader2,
  AlertCircle,
  Clock,
  Users,
  ChevronRight,
} from "lucide-react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)
    ?.trim()
    .replace(/\/$/, "") ?? "https://pjpmzvu7wn.us-east-1.awsapprunner.com/api";

interface EventInfo {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  location?: string;
  locationType?: string;
  virtualLink?: string;
  description?: string;
  coverImage?: string;
  theme?: string;
  capacity?: string | number;
}

const THEME_COLORS: Record<string, string> = {
  default: "#6366f1",
  ocean: "#0ea5e9",
  forest: "#22c55e",
  sunset: "#f97316",
  rose: "#f43f5e",
  gold: "#eab308",
  midnight: "#6366f1",
  purple: "#a855f7",
};

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function EventCheckInPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [alreadyIn, setAlreadyIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!eventId) return;
    fetch(`${API}/church/events/${eventId}/info`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoadError(true); return; }
        setEvent(data);
      })
      .catch(() => setLoadError(true));
  }, [eventId]);

  const themeColor =
    THEME_COLORS[event?.theme ?? "default"] ?? THEME_COLORS.default;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Full name is required";
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/church/events/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberName: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          method: "qr",
          token,
        }),
      });
      const data = await res.json();
      if (data.success || data.alreadyCheckedIn) {
        setCheckedIn(true);
        setAlreadyIn(!!data.alreadyCheckedIn);
      } else {
        setErrors({ submit: data.message ?? "Check-in failed. Please try again." });
      }
    } catch {
      setErrors({ submit: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Event Not Found</h2>
          <p className="text-sm text-muted-foreground">
            This check-in link may have expired or the event has been removed.
          </p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (checkedIn) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          {/* Animated checkmark */}
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${themeColor}20`, border: `2px solid ${themeColor}40` }}
          >
            <CheckCircle2 className="w-12 h-12" style={{ color: themeColor }} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {alreadyIn ? "Already Checked In" : "You're In!"}
            </h1>
            <p className="text-foreground mt-1">
              Welcome, <span className="font-semibold text-foreground">{name}</span>
            </p>
            {alreadyIn && (
              <p className="text-sm text-muted-foreground mt-1">
                You were already checked in for this event.
              </p>
            )}
          </div>

          {/* Event summary card */}
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-left space-y-3">
            <p className="font-semibold text-foreground truncate">{event.title}</p>
            {event.date && (
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 shrink-0 mt-0.5" style={{ color: themeColor }} />
                <div>
                  <p className="text-sm text-foreground">{formatDate(event.date)}</p>
                  {event.time && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.time}{event.endTime ? ` – ${event.endTime}` : ""}
                    </p>
                  )}
                </div>
              </div>
            )}
            {event.location && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: themeColor }} />
                <p className="text-sm text-foreground">{event.location}</p>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Powered by <span className="text-muted-foreground font-medium">Flyn</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Main check-in form ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-12">
      {/* Cover banner */}
      <div
        className="w-full h-44 relative"
        style={
          event.coverImage
            ? { backgroundImage: `url(${event.coverImage})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: `linear-gradient(135deg, ${themeColor}33 0%, ${themeColor}66 100%)` }
        }
      >
        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f0f0f]" />
      </div>

      <div className="max-w-md mx-auto px-4 -mt-8 relative">
        {/* Event card */}
        <div className="rounded-2xl border border-border bg-[#1a1a1a] overflow-hidden shadow-2xl">
          {/* Event info header */}
          <div className="px-6 pt-6 pb-5 border-b border-white/[0.07]">
            {/* Theme dot */}
            <div
              className="w-3 h-3 rounded-full mb-3"
              style={{ background: themeColor }}
            />
            <h1 className="text-xl font-bold text-foreground leading-tight">{event.title}</h1>

            <div className="mt-3 space-y-2">
              {event.date && (
                <div className="flex items-center gap-2.5 text-sm text-foreground">
                  <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span>
                    {formatDate(event.date)}
                    {event.time && (
                      <span className="text-muted-foreground">
                        {" · "}{event.time}{event.endTime ? ` – ${event.endTime}` : ""}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-2.5 text-sm text-foreground">
                  <MapPin className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.capacity && event.capacity !== "unlimited" && (
                <div className="flex items-center gap-2.5 text-sm text-foreground">
                  <Users className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span>Capacity: {event.capacity}</span>
                </div>
              )}
            </div>
          </div>

          {/* Check-in form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Check In</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enter your details to check in to this event.
              </p>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="ci-name" className="text-sm text-foreground">
                Full Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="ci-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoFocus
                autoComplete="name"
                className="h-11 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:border-white/25 text-sm"
              />
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="ci-email" className="text-sm text-foreground">
                Email{" "}
                <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <Input
                id="ci-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="h-11 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:border-white/25 text-sm"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="ci-phone" className="text-sm text-foreground">
                Phone{" "}
                <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <Input
                id="ci-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                autoComplete="tel"
                className="h-11 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:border-white/25 text-sm"
              />
            </div>

            {errors.submit && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                {errors.submit}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full h-11 text-sm font-semibold text-foreground rounded-xl flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: themeColor }}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Check In Now
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          Powered by{" "}
          <span className="text-muted-foreground font-medium">Flyn</span>
        </p>
      </div>
    </div>
  );
}
