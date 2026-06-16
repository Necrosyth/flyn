/**
 * EventRegisterPage — Public event registration / subscribe form.
 * Route: /events/register/:eventId  (no auth required)
 * Reached via QR code scan or invitation link.
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Calendar, MapPin, Clock, Loader2, AlertCircle, Tag, X } from "lucide-react";

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ?? "https://pjpmzvu7wn.us-east-1.awsapprunner.com/api";

const COUNTRY_CODES = [
  { code: "AF", flag: "🇦🇫", name: "Afghanistan",           dial: "+93" },
  { code: "AL", flag: "🇦🇱", name: "Albania",               dial: "+355" },
  { code: "DZ", flag: "🇩🇿", name: "Algeria",               dial: "+213" },
  { code: "AR", flag: "🇦🇷", name: "Argentina",             dial: "+54" },
  { code: "AU", flag: "🇦🇺", name: "Australia",             dial: "+61" },
  { code: "AT", flag: "🇦🇹", name: "Austria",               dial: "+43" },
  { code: "BE", flag: "🇧🇪", name: "Belgium",               dial: "+32" },
  { code: "BD", flag: "🇧🇩", name: "Bangladesh",            dial: "+880" },
  { code: "BR", flag: "🇧🇷", name: "Brazil",                dial: "+55" },
  { code: "CA", flag: "🇨🇦", name: "Canada",                dial: "+1" },
  { code: "CL", flag: "🇨🇱", name: "Chile",                 dial: "+56" },
  { code: "CN", flag: "🇨🇳", name: "China",                 dial: "+86" },
  { code: "CO", flag: "🇨🇴", name: "Colombia",              dial: "+57" },
  { code: "HR", flag: "🇭🇷", name: "Croatia",               dial: "+385" },
  { code: "CZ", flag: "🇨🇿", name: "Czech Republic",        dial: "+420" },
  { code: "DK", flag: "🇩🇰", name: "Denmark",               dial: "+45" },
  { code: "EG", flag: "🇪🇬", name: "Egypt",                 dial: "+20" },
  { code: "FI", flag: "🇫🇮", name: "Finland",               dial: "+358" },
  { code: "FR", flag: "🇫🇷", name: "France",                dial: "+33" },
  { code: "DE", flag: "🇩🇪", name: "Germany",               dial: "+49" },
  { code: "GH", flag: "🇬🇭", name: "Ghana",                 dial: "+233" },
  { code: "GR", flag: "🇬🇷", name: "Greece",                dial: "+30" },
  { code: "HK", flag: "🇭🇰", name: "Hong Kong",             dial: "+852" },
  { code: "HU", flag: "🇭🇺", name: "Hungary",               dial: "+36" },
  { code: "IN", flag: "🇮🇳", name: "India",                 dial: "+91" },
  { code: "ID", flag: "🇮🇩", name: "Indonesia",             dial: "+62" },
  { code: "IE", flag: "🇮🇪", name: "Ireland",               dial: "+353" },
  { code: "IL", flag: "🇮🇱", name: "Israel",                dial: "+972" },
  { code: "IT", flag: "🇮🇹", name: "Italy",                 dial: "+39" },
  { code: "JP", flag: "🇯🇵", name: "Japan",                 dial: "+81" },
  { code: "JO", flag: "🇯🇴", name: "Jordan",                dial: "+962" },
  { code: "KE", flag: "🇰🇪", name: "Kenya",                 dial: "+254" },
  { code: "KW", flag: "🇰🇼", name: "Kuwait",                dial: "+965" },
  { code: "LB", flag: "🇱🇧", name: "Lebanon",               dial: "+961" },
  { code: "MY", flag: "🇲🇾", name: "Malaysia",              dial: "+60" },
  { code: "MX", flag: "🇲🇽", name: "Mexico",                dial: "+52" },
  { code: "MA", flag: "🇲🇦", name: "Morocco",               dial: "+212" },
  { code: "NL", flag: "🇳🇱", name: "Netherlands",           dial: "+31" },
  { code: "NZ", flag: "🇳🇿", name: "New Zealand",           dial: "+64" },
  { code: "NG", flag: "🇳🇬", name: "Nigeria",               dial: "+234" },
  { code: "NO", flag: "🇳🇴", name: "Norway",                dial: "+47" },
  { code: "PK", flag: "🇵🇰", name: "Pakistan",              dial: "+92" },
  { code: "PE", flag: "🇵🇪", name: "Peru",                  dial: "+51" },
  { code: "PH", flag: "🇵🇭", name: "Philippines",           dial: "+63" },
  { code: "PL", flag: "🇵🇱", name: "Poland",                dial: "+48" },
  { code: "PT", flag: "🇵🇹", name: "Portugal",              dial: "+351" },
  { code: "QA", flag: "🇶🇦", name: "Qatar",                 dial: "+974" },
  { code: "RO", flag: "🇷🇴", name: "Romania",               dial: "+40" },
  { code: "RU", flag: "🇷🇺", name: "Russia",                dial: "+7" },
  { code: "SA", flag: "🇸🇦", name: "Saudi Arabia",          dial: "+966" },
  { code: "SG", flag: "🇸🇬", name: "Singapore",             dial: "+65" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa",          dial: "+27" },
  { code: "KR", flag: "🇰🇷", name: "South Korea",           dial: "+82" },
  { code: "ES", flag: "🇪🇸", name: "Spain",                 dial: "+34" },
  { code: "LK", flag: "🇱🇰", name: "Sri Lanka",             dial: "+94" },
  { code: "SE", flag: "🇸🇪", name: "Sweden",                dial: "+46" },
  { code: "CH", flag: "🇨🇭", name: "Switzerland",           dial: "+41" },
  { code: "TW", flag: "🇹🇼", name: "Taiwan",                dial: "+886" },
  { code: "TZ", flag: "🇹🇿", name: "Tanzania",              dial: "+255" },
  { code: "TH", flag: "🇹🇭", name: "Thailand",              dial: "+66" },
  { code: "TR", flag: "🇹🇷", name: "Turkey",                dial: "+90" },
  { code: "UG", flag: "🇺🇬", name: "Uganda",                dial: "+256" },
  { code: "UA", flag: "🇺🇦", name: "Ukraine",               dial: "+380" },
  { code: "AE", flag: "🇦🇪", name: "United Arab Emirates",  dial: "+971" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom",        dial: "+44" },
  { code: "US", flag: "🇺🇸", name: "United States",         dial: "+1" },
  { code: "UY", flag: "🇺🇾", name: "Uruguay",               dial: "+598" },
  { code: "VE", flag: "🇻🇪", name: "Venezuela",             dial: "+58" },
  { code: "VN", flag: "🇻🇳", name: "Vietnam",               dial: "+84" },
  { code: "YE", flag: "🇾🇪", name: "Yemen",                 dial: "+967" },
  { code: "ZW", flag: "🇿🇼", name: "Zimbabwe",              dial: "+263" },
];


interface EventInfo {
  id: string;
  title: string;
  date: string;
  time: string;
  endDate?: string;
  endTime?: string;
  location?: string;
  locationType?: string;
  virtualLink?: string;
  description?: string;
  coverImage?: string;
  theme?: string;
  ticketPrice?: string | number;
  requireApproval?: boolean;
  capacity?: string | number;
}

const THEME_COLORS: Record<string, string> = {
  default: "#6366f1",
  ocean: "#0ea5e9",
  forest: "#22c55e",
  sunset: "#f97316",
  rose: "#f43f5e",
  gold: "#eab308",
  midnight: "#1e1b4b",
};

export default function EventRegisterPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [dialCode, setDialCode] = useState("+1");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [promoInput, setPromoInput] = useState("");
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoResult, setPromoResult] = useState<{
    valid: boolean;
    code?: string;
    discountType?: string;
    discountValue?: number;
    originalPrice?: number;
    finalPrice?: number;
    savings?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    fetch(`${API}/church/events/${eventId}/info`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(true); return; }
        setEvent(data);
      })
      .catch(() => setLoadError(true));
  }, [eventId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) e.email = "Enter a valid email";
    return e;
  };

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || !eventId) return;
    setPromoApplying(true);
    try {
      const price = typeof event?.ticketPrice === "number" ? event.ticketPrice : parseFloat(String(event?.ticketPrice ?? "0"));
      const res = await fetch(`${API}/church/events/${eventId}/validate-promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoInput.trim(), ticketPrice: price }),
      });
      const data = await res.json();
      setPromoResult(data);
    } finally {
      setPromoApplying(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoInput("");
    setPromoResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/church/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: form.phone ? `${dialCode}${form.phone.replace(/^0/, "")}` : "",
          ...(promoResult?.valid ? { promoCode: promoResult.code } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setAlreadyRegistered(!!data.alreadyRegistered);
      }
    } catch {
      setErrors({ submit: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const themeColor = THEME_COLORS[event?.theme ?? "default"] ?? THEME_COLORS.default;
  const isPaid = event && event.ticketPrice !== "free" && event.ticketPrice;

  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold">Event Not Found</h2>
          <p className="text-muted-foreground text-sm">This event link may have expired or the event was removed.</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: `${themeColor}22` }}
          >
            <CheckCircle className="w-10 h-10" style={{ color: themeColor }} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">
              {alreadyRegistered ? "Already Registered!" : "You're registered!"}
            </h2>
            <p className="text-muted-foreground mt-1">
              {alreadyRegistered
                ? `You're already on the guest list for ${event.title}.`
                : `We've saved your spot for ${event.title}.`}
            </p>
          </div>
          {event.requireApproval && !alreadyRegistered && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
              Your registration is pending host approval.
            </div>
          )}
          <div className="p-4 rounded-xl border border-border text-left space-y-2 text-sm">
            {event.date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>{event.date}{event.time ? ` at ${event.time}` : ""}</span>
              </div>
            )}
            {event.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>{event.location}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A confirmation will be sent to <strong>{form.email}</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Cover banner */}
      <div
        className="w-full h-40 relative"
        style={{
          background: event.coverImage
            ? `url(${event.coverImage}) center/cover no-repeat`
            : `linear-gradient(135deg, ${themeColor}44, ${themeColor}99)`,
        }}
      />

      <div className="max-w-lg mx-auto px-4 pb-12 -mt-10 relative">
        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <div className="mt-3 space-y-1.5">
              {event.date && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4 shrink-0" style={{ color: themeColor }} />
                  <span>
                    {event.date}
                    {event.time ? ` · ${event.time}` : ""}
                    {event.endTime ? ` → ${event.endTime}` : ""}
                  </span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" style={{ color: themeColor }} />
                  <span>{event.location}</span>
                </div>
              )}
              {(event.locationType === "virtual" || event.locationType === "hybrid") && event.virtualLink && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 shrink-0" style={{ color: themeColor }} />
                  <a href={event.virtualLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline truncate">
                    {event.virtualLink}
                  </a>
                </div>
              )}
            </div>
            {event.description && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{event.description}</p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <span
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: `${themeColor}22`, color: themeColor }}
              >
                {event.ticketPrice === "free" || !event.ticketPrice ? "Free" : `$${event.ticketPrice}`}
              </span>
              {event.requireApproval && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400">
                  Approval Required
                </span>
              )}
              {event.capacity && event.capacity !== "unlimited" && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-muted-foreground">
                  Capacity: {event.capacity}
                </span>
              )}
            </div>
          </div>

          {/* Registration form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <h2 className="text-base font-semibold">Register for this event</h2>

            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Full Name <span className="text-red-400">*</span></Label>
              <Input
                id="reg-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Your full name"
                className="bg-background border-input"
              />
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email Address <span className="text-red-400">*</span></Label>
              <Input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                className="bg-background border-input"
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-phone">Phone Number</Label>
              <div className="flex gap-2">
                <select
                  value={dialCode}
                  onChange={e => setDialCode(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring shrink-0 max-w-[140px]"
                  style={{ minWidth: "110px" }}
                  aria-label="Country dial code"
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.dial}>
                      {c.flag} {c.dial} {c.name}
                    </option>
                  ))}
                </select>
                <Input
                  id="reg-phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Phone number"
                  className="bg-background border-input flex-1"
                />
              </div>
            </div>

            {/* Promo code — only for paid events */}
            {isPaid && (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4" style={{ color: themeColor }} />
                  <p className="text-sm font-medium">Have a promo code?</p>
                </div>

                {promoResult?.valid ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-sm">
                      <span className="font-bold text-emerald-400">{promoResult.code}</span>
                      <span className="text-muted-foreground ml-2">
                        {promoResult.discountType === "percentage"
                          ? `${promoResult.discountValue}% off`
                          : `$${promoResult.discountValue} off`}
                      </span>
                      <p className="text-xs text-emerald-400 mt-0.5">
                        ${promoResult.finalPrice?.toFixed(2)} (saved ${promoResult.savings?.toFixed(2)})
                      </p>
                    </div>
                    <button type="button" onClick={handleRemovePromo} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={promoInput}
                      onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoResult(null); }}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApplyPromo(); } }}
                      placeholder="Enter code..."
                      className="bg-background border-input uppercase font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyPromo}
                      disabled={!promoInput.trim() || promoApplying}
                      className="shrink-0"
                    >
                      {promoApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                )}

                {promoResult && !promoResult.valid && (
                  <p className="text-xs text-red-400">{promoResult.error ?? "Invalid promo code"}</p>
                )}
              </div>
            )}

            {errors.submit && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {errors.submit}
              </div>
            )}

            {/* Price summary for paid events */}
            {isPaid && (
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold text-lg">
                  {promoResult?.valid
                    ? promoResult.finalPrice === 0
                      ? "Free"
                      : `$${promoResult.finalPrice?.toFixed(2)}`
                    : `$${parseFloat(String(event?.ticketPrice ?? 0)).toFixed(2)}`
                  }
                </span>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 text-base font-bold"
              style={{ background: themeColor }}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Register Now"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              By registering you agree to receive event updates.
            </p>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by <span className="font-semibold">Flyn</span>
        </p>
      </div>
    </div>
  );
}
