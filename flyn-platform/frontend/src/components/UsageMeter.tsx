import { useUsageMeter, UsageMetricKey, USAGE_THRESHOLDS } from "@/contexts/UsageContext";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface UsageMeterProps {
  metricKey: UsageMetricKey;
  label?: string;
  showValue?: boolean;
  compact?: boolean;
}

export const UsageMeter = ({ metricKey, label, showValue = true, compact = false }: UsageMeterProps) => {
  const { usage, percentage, threshold } = useUsageMeter(metricKey);
  const { t } = useTranslation();

  const METRIC_LABELS: Record<UsageMetricKey, string> = {
    "messages.sent": t("usageMeter.messages"),
    "calls.minutes": t("usageMeter.callMinutes"),
    "ai.tokens": t("usageMeter.aiTokens"),
    "webchat.sessions": t("usageMeter.webchatSessions"),
    "storage.gb": t("usageMeter.storageGB"),
    "whatsapp.conversations": t("usageMeter.whatsappConversations"),
  };

  const displayLabel = label || METRIC_LABELS[metricKey];

  const getThresholdColor = () => {
    switch (threshold) {
      case "LIMIT": return "bg-destructive";
      case "CRITICAL": return "bg-destructive";
      case "WARNING": return "bg-status-pending";
      default: return "bg-primary";
    }
  };

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{displayLabel}</span>
          <span className={cn(
            "font-medium",
            threshold === "LIMIT" && "text-destructive",
            threshold === "CRITICAL" && "text-destructive",
            threshold === "WARNING" && "text-status-pending"
          )}>
            {percentage}%
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all", getThresholdColor())}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{displayLabel}</span>
        {showValue && (
          <span className="text-sm text-muted-foreground">
            {usage.used.toLocaleString()} / {usage.limit.toLocaleString()}
          </span>
        )}
      </div>
      <Progress
        value={Math.min(percentage, 100)}
        className={cn(
          "h-2",
          threshold === "LIMIT" && "[&>div]:bg-destructive",
          threshold === "CRITICAL" && "[&>div]:bg-destructive",
          threshold === "WARNING" && "[&>div]:bg-status-pending"
        )}
      />
      {threshold && (
        <p className={cn(
          "text-xs",
          threshold === "LIMIT" && "text-destructive",
          threshold === "CRITICAL" && "text-destructive",
          threshold === "WARNING" && "text-status-pending",
          threshold === "INFO" && "text-muted-foreground"
        )}>
          {threshold === "LIMIT" && t("usageMeter.limitReached")}
          {threshold === "CRITICAL" && t("usageMeter.approachingLimit")}
          {threshold === "WARNING" && t("usageMeter.warningUsed")}
          {threshold === "INFO" && t("usageMeter.runningNormally")}
        </p>
      )}
    </div>
  );
};
