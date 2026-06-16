import { cn } from "@/lib/utils";

type Status = "active" | "open" | "pending" | "closed" | "resolved" | "snoozed";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  active: {
    label: "ACTIVE",
    className: "bg-status-active-bg text-status-active",
  },
  open: {
    label: "ACTIVE",
    className: "bg-status-active-bg text-status-active",
  },
  pending: {
    label: "PENDING",
    className: "bg-status-pending-bg text-status-pending",
  },
  closed: {
    label: "CLOSED",
    className: "bg-status-closed-bg text-status-closed",
  },
  resolved: {
    label: "CLOSED",
    className: "bg-status-closed-bg text-status-closed",
  },
  snoozed: {
    label: "SNOOZED",
    className: "bg-muted text-muted-foreground",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
