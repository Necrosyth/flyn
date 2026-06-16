import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Plus, Sparkles, Download, Upload, MoreHorizontal, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ActionItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ai" | "ghost";
}

interface ActionBarProps {
  /** Module title */
  title: string;
  /** Module description */
  description?: string;
  /** Primary action (1 only) */
  primaryAction?: ActionItem;
  /** Secondary actions (up to 2) */
  secondaryActions?: ActionItem[];
  /** AI-powered actions (visually grouped) */
  aiActions?: ActionItem[];
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Search value */
  searchValue?: string;
  /** Search change handler */
  onSearchChange?: (value: string) => void;
  /** Show filter button */
  showFilter?: boolean;
  /** Filter click handler */
  onFilterClick?: () => void;
  /** Additional actions in overflow menu */
  overflowActions?: ActionItem[];
  className?: string;
}

/**
 * ActionBar - Layer 2 of Dashboard
 * Rules: 1 primary action (solid), up to 2 secondary (outline), grouped AI actions
 */
export function ActionBar({
  title,
  description,
  primaryAction,
  secondaryActions = [],
  aiActions = [],
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  showFilter = true,
  onFilterClick,
  overflowActions = [],
  className,
}: ActionBarProps) {
  // Enforce max 2 secondary actions
  const displaySecondary = secondaryActions.slice(0, 2);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="pl-10 w-48 lg:w-64"
            />
          </div>

          {/* Filter */}
          {showFilter && (
            <Button variant="outline" onClick={onFilterClick} size="icon" className="shrink-0">
              <Filter className="h-4 w-4" />
            </Button>
          )}

          {/* AI Actions (grouped visually) */}
          {aiActions.length > 0 && (
            <div className="flex items-center gap-1 px-1 py-0.5 rounded-lg bg-flyn-gradient/10 border border-primary/20">
              {aiActions.map((action) => (
                <Button
                  key={action.id}
                  variant="ghost"
                  size="sm"
                  onClick={action.onClick}
                  className="text-primary hover:text-primary hover:bg-primary/10"
                >
                  {action.icon ? (
                    <action.icon className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1.5" />
                  )}
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          {/* Secondary Actions */}
          {displaySecondary.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              onClick={action.onClick}
              className="shrink-0"
            >
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          ))}

          {/* Primary Action */}
          {primaryAction && (
            <Button
              onClick={primaryAction.onClick}
              className="flyn-button-gradient shrink-0"
            >
              {primaryAction.icon ? (
                <primaryAction.icon className="h-4 w-4 mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {primaryAction.label}
            </Button>
          )}

          {/* Overflow menu for additional actions */}
          {overflowActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {overflowActions.map((action) => (
                  <DropdownMenuItem key={action.id} onClick={action.onClick}>
                    {action.icon && <action.icon className="h-4 w-4 mr-2" />}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
