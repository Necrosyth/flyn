import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}

// Status badge renderer helper
export const renderStatusBadge = (status: string | null | undefined) => {
  if (!status) return null;
  const statusMap: Record<string, { variant: BadgeProps["variant"]; label: string }> = {
    active: { variant: "active", label: "Active" },
    inactive: { variant: "inactive", label: "Inactive" },
    pending: { variant: "pending", label: "Pending" },
    error: { variant: "error", label: "Error" },
    new: { variant: "new", label: "New" },
    draft: { variant: "draft", label: "Draft" },
    approved: { variant: "approved", label: "Approved" },
    lead: { variant: "lead", label: "Lead" },
    qualified: { variant: "success", label: "Qualified" },
    won: { variant: "success", label: "Won" },
    lost: { variant: "error", label: "Lost" },
    present: { variant: "active", label: "Present" },
    absent: { variant: "error", label: "Absent" },
    on_leave: { variant: "warning", label: "On Leave" },
    registered: { variant: "success", label: "Registered" },
    cancelled: { variant: "error", label: "Cancelled" },
    completed: { variant: "success", label: "Completed" },
    in_progress: { variant: "pending", label: "In Progress" },
    scheduled: { variant: "info", label: "Scheduled" },
    paid: { variant: "success", label: "Paid" },
    unpaid: { variant: "warning", label: "Unpaid" },
    overdue: { variant: "error", label: "Overdue" },
    partially_paid: { variant: "warning", label: "Partially Paid" },
    applied: { variant: "info", label: "Applied" },
  };

  const config = statusMap[status.toLowerCase().replace(/ /g, "_")] || {
    variant: "secondary",
    label: status,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = "No data to display",
  onRowClick,
  className,
}: DataTableProps<T>) {
  const renderCellValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    return JSON.stringify(value);
  };

  const getValue = (row: T, key: string) => {
    const keys = key.split(".");
    let value: unknown = row;
    for (const k of keys) {
      value = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[k] : undefined;
    }
    return value;
  };

  if (data.length === 0) {
    return (
      <div className={cn("border border-dashed border-border rounded-lg p-8", className)}>
        <p className="text-center text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("border border-border rounded-lg overflow-hidden bg-card", className)}
    >
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {columns.map((col) => (
              <TableHead key={String(col.key)} className={col.className}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow
              key={i}
              onClick={() => onRowClick?.(row)}
              className={cn(onRowClick && "cursor-pointer")}
            >
              {columns.map((col) => (
                <TableCell key={String(col.key)} className={col.className}>
                  {col.render
                    ? col.render(getValue(row, String(col.key)), row)
                    : renderCellValue(getValue(row, String(col.key)))}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </motion.div>
  );
}
