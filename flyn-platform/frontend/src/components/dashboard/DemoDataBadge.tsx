import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Lock, ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DemoDataBadgeProps {
  /** Show demo badge */
  isDemo?: boolean;
  /** Show upgrade CTA */
  showUpgradeCTA?: boolean;
  /** Upgrade click handler */
  onUpgrade?: () => void;
  className?: string;
}

/**
 * DemoDataBadge - Indicator for demo/trial data with upgrade CTA
 * Applied to KPI Strip and Analytics when on Free/Trial plan
 */
export function DemoDataBadge({ 
  isDemo = true, 
  showUpgradeCTA = true, 
  onUpgrade,
  className 
}: DemoDataBadgeProps) {
  if (!isDemo) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("flex items-center gap-2", className)}
    >
      <Badge 
        variant="outline" 
        className="bg-status-pending/10 text-status-pending border-status-pending/30 gap-1"
      >
        <Sparkles className="h-3 w-3" />
        Demo Data
      </Badge>
      {showUpgradeCTA && (
        <Button
          variant="link"
          size="sm"
          onClick={onUpgrade}
          className="h-auto p-0 text-xs text-primary hover:text-primary/80"
        >
          Upgrade for live data
          <ArrowUpRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </motion.div>
  );
}

/**
 * CappedStateBanner - Shows when user reaches plan limits
 */
interface CappedStateBannerProps {
  /** Entity that is capped (e.g., "clients", "members") */
  entityName: string;
  /** Current count */
  current: number;
  /** Max allowed by plan */
  max: number;
  /** Upgrade click handler */
  onUpgrade?: () => void;
  /** Dismiss handler */
  onDismiss?: () => void;
  className?: string;
}

export function CappedStateBanner({
  entityName,
  current,
  max,
  onUpgrade,
  onDismiss,
  className,
}: CappedStateBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const isAtLimit = current >= max;

  if (isDismissed || !isAtLimit) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card className={cn("border-status-pending/30 bg-status-pending/5", className)}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-pending/10">
                <Lock className="h-4 w-4 text-status-pending" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {entityName} limit reached ({current}/{max})
                </p>
                <p className="text-xs text-muted-foreground">
                  Upgrade your plan to add more {entityName.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={onUpgrade}
                size="sm"
                className="flyn-button-gradient"
              >
                Upgrade
                <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setIsDismissed(true);
                    onDismiss?.();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * DisabledActionButton - Primary action button in disabled/capped state
 */
interface DisabledActionButtonProps {
  /** Original action label */
  label: string;
  /** Why it's disabled */
  reason?: string;
  /** Upgrade handler */
  onUpgrade?: () => void;
  className?: string;
}

export function DisabledActionButton({
  label,
  reason = "Plan limit reached",
  onUpgrade,
  className,
}: DisabledActionButtonProps) {
  return (
    <div className={cn("relative", className)}>
      <Button
        disabled
        className="opacity-50 cursor-not-allowed"
      >
        <Lock className="h-4 w-4 mr-2" />
        {label}
      </Button>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-full mt-1 left-0 right-0"
      >
        <Button
          variant="link"
          size="sm"
          onClick={onUpgrade}
          className="h-auto p-0 text-xs text-primary w-full justify-center"
        >
          {reason} — Upgrade
        </Button>
      </motion.div>
    </div>
  );
}
