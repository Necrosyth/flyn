import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type HealthStatus = "green" | "amber" | "red";

interface HealthStatusChipProps {
  status: HealthStatus;
  /** Show text label */
  showLabel?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusConfig: Record<HealthStatus, { color: string; label: string; bgClass: string }> = {
  green: {
    color: "bg-status-active",
    label: "Healthy",
    bgClass: "bg-status-active/10 text-status-active border-status-active/30",
  },
  amber: {
    color: "bg-status-pending",
    label: "Attention",
    bgClass: "bg-status-pending/10 text-status-pending border-status-pending/30",
  },
  red: {
    color: "bg-destructive",
    label: "At Risk",
    bgClass: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const sizeConfig = {
  sm: { dot: "w-1.5 h-1.5", text: "text-[10px]", padding: "px-1.5 py-0.5" },
  md: { dot: "w-2 h-2", text: "text-xs", padding: "px-2 py-1" },
  lg: { dot: "w-2.5 h-2.5", text: "text-sm", padding: "px-3 py-1.5" },
};

/**
 * HealthStatusChip - Green/Amber/Red indicator for coach/client health
 */
export function HealthStatusChip({ 
  status, 
  showLabel = false, 
  size = "md",
  className 
}: HealthStatusChipProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];

  if (!showLabel) {
    return (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className={cn(
          "inline-block rounded-full",
          sizes.dot,
          config.color,
          className
        )}
      />
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border",
        sizes.padding,
        sizes.text,
        config.bgClass,
        className
      )}
    >
      <span className={cn("rounded-full", sizes.dot, config.color)} />
      {config.label}
    </motion.span>
  );
}

/**
 * HealthStatusDot - Simple colored dot for inline use
 */
export function HealthStatusDot({ status, className }: { status: HealthStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full",
        statusConfig[status].color,
        className
      )}
    />
  );
}

/**
 * Helper to render health status in table cells
 */
export function renderHealthStatus(status: HealthStatus | undefined, showLabel = true) {
  if (!status) return null;
  return <HealthStatusChip status={status} showLabel={showLabel} size="sm" />;
}
