import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Info, AlertTriangle, AlertCircle, CheckCircle2, Mail, TrendingUp } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/contexts/PlanContext";
import { useUsage, USAGE_THRESHOLDS, UsageMetricKey } from "@/contexts/UsageContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { auth } from "@/lib/firebase";
import { sendEmailVerification } from "firebase/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Sandbox mode banner - shown when in explore mode
export const SandboxBanner = () => {
  const { isSandboxMode, isTrialActive, trialEndsAt, currentPlan } = usePlan();
  const [dismissed, setDismissed] = useState(false);
  
  if (dismissed || (!isSandboxMode() && !isTrialActive())) return null;
  
  const daysLeft = trialEndsAt 
    ? Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "relative overflow-hidden",
        isSandboxMode() 
          ? "bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10" 
          : "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10"
      )}
    >
      <div className="w-full px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-1.5 rounded-full",
            isSandboxMode() ? "bg-primary/10" : "bg-amber-500/10"
          )}>
            {isSandboxMode() ? (
              <Sparkles className="h-4 w-4 text-primary" />
            ) : (
              <Info className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <p className="text-sm">
            {isSandboxMode() ? (
              <>
                <span className="font-medium">Explore Mode</span>
                <span className="text-muted-foreground ml-1">
                  — All actions are simulated. No costs incurred.
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">Trial Active</span>
                <span className="text-muted-foreground ml-1">
                  — {daysLeft} days remaining. Upgrade to continue live operations.
                </span>
              </>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant={isSandboxMode() ? "default" : "outline"}
            className={isSandboxMode() ? "flyn-button-gradient" : ""}
            asChild
          >
            <Link to="/settings/billing">
              {isSandboxMode() ? "Upgrade to Go Live" : "Choose Plan"}
            </Link>
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-7 w-7"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

// Email verification banner — shown when user's email is not yet verified
export const EmailVerificationBanner = () => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resent, setResent] = useState(false);

  if (dismissed || !user || user.emailVerified) return null;

  const handleResend = async () => {
    const fbUser = auth?.currentUser;
    if (!fbUser) return;
    try {
      await sendEmailVerification(fbUser);
      setResent(true);
    } catch {
      // ignore — user may have hit rate limit
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10"
    >
      <div className="w-full px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-full bg-amber-500/10">
            <Mail className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-sm">
            <span className="font-medium">Verify your email</span>
            <span className="text-muted-foreground ml-1">
              — A verification link was sent to <strong>{user.email}</strong>. Check your inbox to confirm your account.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleResend}
            disabled={resent}
            className="h-7 text-xs"
          >
            {resent ? "Sent!" : "Resend email"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

// Modal renderer for modal-channel notifications (feature lock, billing, usage cap, etc.)
export const NotificationModal = () => {
  const { activeModal, dismissModal } = useNotifications();
  const navigate = useNavigate();

  if (!activeModal) return null;

  const { template } = activeModal;

  const getIcon = () => {
    switch (template.level) {
      case "error": return <AlertCircle className="h-10 w-10 text-destructive" />;
      case "warning": return <AlertTriangle className="h-10 w-10 text-amber-500" />;
      case "success": return <CheckCircle2 className="h-10 w-10 text-emerald-500" />;
      default: return <Info className="h-10 w-10 text-primary" />;
    }
  };

  const handleCta = () => {
    if (!template.cta) return;
    dismissModal();
    // Internal routes start with /
    if (template.cta.action.startsWith("/")) {
      navigate(template.cta.action);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) dismissModal(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 text-center pb-2">
            {getIcon()}
            <DialogTitle className="text-xl">{template.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {template.message}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <Button variant="outline" onClick={dismissModal} className="flex-1">
              Dismiss
            </Button>
            {template.cta && (
              <Button
                onClick={handleCta}
                className={cn(
                  "flex-1",
                  template.level === "error" && "bg-destructive hover:bg-destructive/90",
                  template.level !== "error" && "flyn-button-gradient"
                )}
              >
                {template.cta.label}
              </Button>
            )}
          </div>
          {/* Global Trust Footer — from Notification Copy System doc */}
          <p className="text-[11px] text-muted-foreground/50 text-center leading-relaxed px-2">
            FLYN AI enforces usage limits, security policies, and AI governance automatically to protect your business and control costs.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Usage warning banner — shown when any metric approaches its plan limit
export const UsageWarningBanner = () => {
  const { getActiveAlerts, dismissAlert, getUsagePercentage } = useUsage();
  const { isSandboxMode } = usePlan();
  const [localDismissed, setLocalDismissed] = useState(false);

  const criticalAlerts = useMemo(
    () =>
      getActiveAlerts().filter(
        (a) =>
          a.threshold === "CRITICAL" || a.threshold === "LIMIT" || a.threshold === "WARNING",
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getActiveAlerts()],
  );

  if (localDismissed || isSandboxMode() || criticalAlerts.length === 0) return null;

  // Show the highest-priority alert
  const topAlert = criticalAlerts.sort((a, b) => {
    const order = { LIMIT: 0, CRITICAL: 1, WARNING: 2, INFO: 3 };
    return (order[a.threshold] ?? 4) - (order[b.threshold] ?? 4);
  })[0];

  const isLimit = topAlert.threshold === "LIMIT";
  const isCritical = topAlert.threshold === "CRITICAL";

  const METRIC_LABELS: Record<UsageMetricKey, string> = {
    "messages.sent": "messages",
    "calls.minutes": "call minutes",
    "ai.tokens": "AI tokens",
    "webchat.sessions": "webchat sessions",
    "storage.gb": "storage",
    "whatsapp.conversations": "WhatsApp conversations",
  };

  const metricLabel = METRIC_LABELS[topAlert.metricKey as UsageMetricKey] ?? topAlert.metricKey;
  const pct = getUsagePercentage(topAlert.metricKey as UsageMetricKey);

  const handleDismiss = () => {
    dismissAlert(topAlert.id);
    setLocalDismissed(true);
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "relative overflow-hidden",
        isLimit
          ? "bg-gradient-to-r from-destructive/10 via-destructive/5 to-red-500/10"
          : isCritical
          ? "bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-amber-500/10"
          : "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-yellow-500/10",
      )}
    >
      <div className="w-full px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-1.5 rounded-full",
              isLimit ? "bg-destructive/10" : isCritical ? "bg-orange-500/10" : "bg-amber-500/10",
            )}
          >
            {isLimit ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : isCritical ? (
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            ) : (
              <TrendingUp className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <p className="text-sm">
            {isLimit ? (
              <>
                <span className="font-medium text-destructive">Usage limit reached</span>
                <span className="text-muted-foreground ml-1">
                  — Your {metricLabel} quota is at {pct}%. Upgrade to continue.
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">
                  {isCritical ? "Critical usage warning" : "Approaching usage limit"}
                </span>
                <span className="text-muted-foreground ml-1">
                  — {pct}% of your {metricLabel} quota used this month.
                  {criticalAlerts.length > 1 && ` +${criticalAlerts.length - 1} more metric(s).`}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" className="flyn-button-gradient h-7 text-xs" asChild>
            <Link to="/settings/billing">Upgrade Plan</Link>
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

const OCCASION_META_KEY = 'flyn_occasion_meta';

// Occasion/celebration banner from notification system
export const OccasionBanner = () => {
  const { activeBanner, dismissBanner, dismiss } = useNotifications();

  if (!activeBanner) return null;

  const { template } = activeBanner;
  const isOccasion = template.eventType.startsWith('occasion.');

  const getBannerGradient = () => {
    switch (template.level) {
      case "success": return "from-emerald-500/10 via-emerald-500/5 to-teal-500/10";
      case "warning": return "from-amber-500/10 via-amber-500/5 to-orange-500/10";
      case "error": return "from-destructive/10 via-destructive/5 to-red-500/10";
      default: return "from-primary/10 via-primary/5 to-accent/10";
    }
  };

  const handleDismiss = () => {
    if (isOccasion) {
      try {
        const meta: Record<string, { shownAt?: number; dismissCount?: number }> =
          JSON.parse(localStorage.getItem(OCCASION_META_KEY) || '{}');
        const m = meta[template.eventType] || {};
        meta[template.eventType] = { ...m, dismissCount: (m.dismissCount || 0) + 1 };
        localStorage.setItem(OCCASION_META_KEY, JSON.stringify(meta));
      } catch { /* non-critical */ }
    }
    dismiss(activeBanner.id);
    dismissBanner();
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={cn("relative overflow-hidden bg-gradient-to-r", getBannerGradient())}
    >
      <div className="w-full px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium">{template.title}</p>
            <p className="text-xs text-muted-foreground">{template.message}</p>
            {isOccasion && (
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                You're always in control of notifications. Adjust preferences anytime.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {template.cta && (
            <Button size="sm" variant="outline" asChild>
              <a href={template.cta.action}>{template.cta.label}</a>
            </Button>
          )}
          {template.dismissable !== false && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
