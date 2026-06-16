/**
 * Church QR Self Check-in Kiosk
 *
 * Public, tablet-optimized full-screen page. Accessible at /kiosk/:eventId
 * No auth required — designed to run on a device at the venue entrance.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { churchService } from "@/services/church.service";
import { CheckCircle2, Loader2, Users, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attendee {
  memberId?: string;
  memberName: string;
  checkedInAt: string;
  method: string;
}

interface AttendanceData {
  eventId: string;
  eventTitle: string;
  totalCheckins: number;
  attendees: Attendee[];
}

// ─── Component ────────────────────────────────────────────────────────────────

const ChurchKiosk = () => {
  const { eventId } = useParams<{ eventId: string }>();

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("Event Check-In");
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load QR code ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    churchService.getEventQRCode(eventId).then((data) => {
      if (data?.qrCodePngUrl) setQrUrl(data.qrCodePngUrl);
      if (data?.eventTitle) setEventTitle(data.eventTitle);
    });
  }, [eventId]);

  // ── Poll attendance every 15 s ──────────────────────────────────────────────
  const refreshAttendance = useCallback(async () => {
    if (!eventId) return;
    const data = await churchService.getEventAttendance(eventId);
    if (data) setAttendance(data as AttendanceData);
  }, [eventId]);

  useEffect(() => {
    refreshAttendance();
    const id = setInterval(refreshAttendance, 15_000);
    return () => clearInterval(id);
  }, [refreshAttendance]);

  // ── Manual name check-in ────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!eventId || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await churchService.checkInToEvent(eventId, {
        memberName: name.trim(),
        method: "manual",
      });
      if (res?.success === false) {
        setError(res.message ?? "Check-in failed. Please try again.");
      } else {
        setSuccessName(name.trim());
        setName("");
        setTimeout(() => setSuccessName(null), 4_000);
        refreshAttendance();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-10 py-6 border-b border-white/10">
        <div>
          <p className="text-slate-400 text-sm uppercase tracking-widest font-medium">Welcome to</p>
          <h1 className="text-3xl font-bold text-white">{eventTitle}</h1>
        </div>
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <Users className="w-5 h-5" />
          <span className="text-2xl font-bold text-amber-400">{attendance?.totalCheckins ?? 0}</span>
          <span>checked in</span>
          <button
            onClick={refreshAttendance}
            className="ml-2 p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0">
        {/* Left — QR code */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-10 py-12 border-r border-white/10">
          <div className="text-center">
            <p className="text-slate-300 text-xl font-medium mb-2">Scan to Check In</p>
            <p className="text-slate-500 text-sm">Point your phone camera at the code</p>
          </div>
          {qrUrl ? (
            <div className="p-4 bg-white rounded-2xl shadow-2xl shadow-amber-500/10">
              <img
                src={qrUrl}
                alt="Event QR Code"
                className="w-64 h-64 lg:w-80 lg:h-80"
              />
            </div>
          ) : (
            <div className="w-64 h-64 lg:w-80 lg:h-80 rounded-2xl bg-slate-800 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-slate-600 animate-spin" />
            </div>
          )}
          <p className="text-slate-500 text-xs text-center max-w-xs">
            Or enter your name on the right to check in manually
          </p>
        </div>

        {/* Right — manual name entry */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-10 py-12">
          {successName ? (
            <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
              <CheckCircle2 className="w-20 h-20 text-green-400" />
              <p className="text-3xl font-bold text-white text-center">Welcome, {successName}!</p>
              <p className="text-slate-400 text-lg">You're checked in. God bless you!</p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-slate-300 text-xl font-medium mb-2">Manual Check-In</p>
                <p className="text-slate-500 text-sm">Type your name and tap Check In</p>
              </div>

              <div className="w-full max-w-sm flex flex-col gap-4">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckIn()}
                  placeholder="Your full name"
                  className="w-full px-6 py-5 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xl placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                  autoComplete="off"
                  autoFocus
                />

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <button
                  onClick={handleCheckIn}
                  disabled={submitting || !name.trim()}
                  className="w-full py-5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xl font-bold transition-colors flex items-center justify-center gap-3"
                >
                  {submitting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    "Check In"
                  )}
                </button>
              </div>
            </>
          )}

          {/* Recent attendees */}
          {(attendance?.attendees?.length ?? 0) > 0 && (
            <div className="w-full max-w-sm mt-4">
              <p className="text-slate-500 text-xs uppercase tracking-widest mb-3">Recent arrivals</p>
              <ul className="flex flex-col gap-2">
                {[...(attendance?.attendees ?? [])].reverse().slice(0, 6).map((a, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/60">
                    <span className="text-white text-sm font-medium">{a.memberName}</span>
                    <span className="text-slate-500 text-xs">
                      {new Date(a.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-10 py-4 border-t border-white/10 flex items-center justify-between">
        <p className="text-slate-600 text-xs">Powered by Flyn</p>
        <p className="text-slate-600 text-xs">Auto-refreshes every 15 seconds</p>
      </div>
    </div>
  );
};

export default ChurchKiosk;
