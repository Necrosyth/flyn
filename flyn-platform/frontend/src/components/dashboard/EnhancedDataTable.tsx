import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, MoreHorizontal, Check, Save, Eye, Trash2, Edit2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
}

export interface SavedView {
  id: string;
  name: string;
  filters?: Record<string, unknown>;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
}

export interface BulkAction {
  id: string;
  label: string;
  onClick: (selectedIds: string[]) => void;
  variant?: "default" | "destructive";
}

interface EnhancedDataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  /** Unique key field for each row */
  rowKey?: keyof T;
  /** Enable row selection for bulk actions */
  selectable?: boolean;
  /** Bulk actions menu */
  bulkActions?: BulkAction[];
  /** Saved views */
  savedViews?: SavedView[];
  /** Current saved view */
  currentView?: string;
  /** View change handler */
  onViewChange?: (viewId: string) => void;
  /** Save current view */
  onSaveView?: () => void;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** View row handler (read-only) — if omitted falls back to onEditRow */
  onViewRow?: (row: T) => void;
  /** Edit row handler */
  onEditRow?: (row: T) => void;
  /** Delete row handler — shows confirmation dialog then calls this */
  onDeleteRow?: (id: string) => Promise<void> | void;
  /** Extra items injected into each row's ... menu before the separator+Delete */
  extraMenuItems?: (row: T) => Array<{ label: string; icon?: React.ReactNode; onClick: () => void; className?: string }>;
  /** Empty state message */
  emptyMessage?: string;
  /** Table title */
  title?: string;
  className?: string;
}

type SortDirection = "asc" | "desc" | null;

/** Parses human-readable and ISO date strings into a Date for sort comparison. */
function parseDateValue(str: string): Date | null {
  const lower = str.toLowerCase().trim();
  const now = new Date();
  if (lower === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (lower === "yesterday") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - 1);
    return d;
  }
  const daysAgo = lower.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgo) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysAgo[1]));
    return d;
  }
  const weeksAgo = lower.match(/^(\d+)\s+weeks?\s+ago$/);
  if (weeksAgo) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(weeksAgo[1]) * 7);
    return d;
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * EnhancedDataTable - Layer 3 of Dashboard
 * Rules: Sortable, filterable, bulk actions, saved views
 */
export function EnhancedDataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey = "id" as keyof T,
  selectable = true,
  bulkActions = [],
  savedViews = [],
  currentView,
  onViewChange,
  onSaveView,
  onRowClick,
  onViewRow,
  onEditRow,
  onDeleteRow,
  extraMenuItems,
  emptyMessage = "No data to display",
  title,
  className,
}: EnhancedDataTableProps<T>) {
  const PAGE_SIZE = 10;
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Clamp current page to remain valid after data changes (e.g. after delete)
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, Math.max(1, Math.ceil(data.length / PAGE_SIZE))));
  }, [data.length]);

  const renderCellValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    return JSON.stringify(value);
  };

  // Get nested value from object
  const getValue = (row: T, key: string) => {
    const keys = key.split(".");
    let value: unknown = row;
    for (const k of keys) {
      value = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[k] : undefined;
    }
    return value;
  };

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aVal = getValue(a, sortKey);
      const bVal = getValue(b, sortKey);

      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Try date-aware comparison for string values
      if (typeof aVal === "string" && typeof bVal === "string") {
        const aDate = parseDateValue(aVal);
        const bDate = parseDateValue(bVal);
        if (aDate && bDate) {
          return sortDirection === "asc"
            ? aDate.getTime() - bDate.getTime()
            : bDate.getTime() - aDate.getTime();
        }
      }

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedData = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedData.slice(start, start + PAGE_SIZE);
  }, [sortedData, safePage]);

  const firstItem = sortedData.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(safePage * PAGE_SIZE, sortedData.length);

  // Handle sort
  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortKey(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  // Handle row selection
  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedRows.size === data.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data.map((row) => String(row[rowKey]))));
    }
  };

  // Get sort icon
  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) {
      return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="h-3.5 w-3.5" />;
    }
    return <ChevronDown className="h-3.5 w-3.5" />;
  };

  const hasSelected = selectedRows.size > 0;

  if (data.length === 0) {
    return (
      <Card className={cn("border-0 flyn-card", className)}>
        {/* Always show the filter tabs even when empty so the user can switch back */}
        {(title || savedViews.length > 0) && (
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              {title && <CardTitle className="font-display">{title}</CardTitle>}
              {savedViews.length > 0 && (
                <div className="flex items-center gap-1">
                  {savedViews.map((view) => (
                    <Button
                      key={view.id}
                      variant={currentView === view.id ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => onViewChange?.(view.id)}
                      className="h-7 text-xs"
                    >
                      {currentView === view.id && <Check className="h-3 w-3 mr-1" />}
                      {view.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
        )}
        <CardContent>
          <div className="border border-dashed border-border rounded-lg p-8">
            <p className="text-center text-muted-foreground">{emptyMessage}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card className={cn("border-0 flyn-card overflow-hidden", className)}>
      {/* Header with views and bulk actions */}
      {(title || savedViews.length > 0 || hasSelected) && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {title && <CardTitle className="font-display">{title}</CardTitle>}
              
              {/* Saved Views */}
              {savedViews.length > 0 && (
                <div className="flex items-center gap-1">
                  {savedViews.map((view) => (
                    <Button
                      key={view.id}
                      variant={currentView === view.id ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => onViewChange?.(view.id)}
                      className="h-7 text-xs"
                    >
                      {currentView === view.id && <Check className="h-3 w-3 mr-1" />}
                      {view.name}
                    </Button>
                  ))}
                  {onSaveView && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onSaveView}
                      className="h-7 text-xs"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Save View
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Bulk Actions */}
            {hasSelected && bulkActions.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {selectedRows.size} selected
                </Badge>
                {bulkActions.map((action) => (
                  <Button
                    key={action.id}
                    variant={action.variant === "destructive" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => action.onClick(Array.from(selectedRows))}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
      )}

      <CardContent className="p-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="overflow-x-auto"
        >
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {selectable && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedRows.size === data.length && data.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead
                    key={String(col.key)}
                    className={cn(
                      "whitespace-nowrap px-4",
                      col.sortable && "cursor-pointer select-none",
                      col.className
                    )}
                    onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && <SortIcon columnKey={String(col.key)} />}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedData.map((row) => {
                const rowId = String(row[rowKey]);
                const isSelected = selectedRows.has(rowId);

                return (
                  <TableRow
                    key={rowId}
                    className={cn(
                      onRowClick && "cursor-pointer",
                      isSelected && "bg-primary/5"
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell onClick={(e) => e.stopPropagation()} className="px-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelectRow(rowId)}
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={String(col.key)} className={cn("px-4 whitespace-nowrap", col.className)}>
                        {col.render
                          ? col.render(getValue(row, String(col.key)), row)
                          : renderCellValue(getValue(row, String(col.key)))}
                      </TableCell>
                    ))}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => (onViewRow ?? onEditRow)?.(row)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEditRow?.(row)}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {extraMenuItems?.(row).map((item, idx) => (
                            <DropdownMenuItem key={idx} onClick={item.onClick} className={item.className}>
                              {item.icon}
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setPendingDeleteId(rowId)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </motion.div>
      </CardContent>

      {/* Pagination Footer */}
      {sortedData.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Showing {firstItem}–{lastItem} of {sortedData.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Card>

    {/* Delete Confirmation Dialog */}
    {onDeleteRow && (
      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open && !isDeleting) setPendingDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button
              variant="ghost"
              onClick={() => setPendingDeleteId(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                if (!pendingDeleteId) return;
                setIsDeleting(true);
                try {
                  await onDeleteRow(pendingDeleteId);
                } finally {
                  setIsDeleting(false);
                  setPendingDeleteId(null);
                }
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
