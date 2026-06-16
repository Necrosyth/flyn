import { useState } from "react";
import { motion } from "framer-motion";
import { Building, ChevronDown, Check, Globe, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface Campus {
  id: string;
  name: string;
  location?: string;
  memberCount?: number;
  isDefault?: boolean;
}

interface CampusScopeSelectorProps {
  /** Available campuses/organizations */
  campuses: Campus[];
  /** Currently selected campus ID (null = All) */
  selectedCampusId: string | null;
  /** Callback when campus selection changes */
  onCampusChange: (campusId: string | null) => void;
  /** Label for "All" option */
  allLabel?: string;
  /** Show member counts */
  showCounts?: boolean;
  className?: string;
}

/**
 * CampusScopeSelector - Global scope toggle for multi-campus/multi-tenancy
 * Updates all 6 dashboard layers when changed
 */
export function CampusScopeSelector({
  campuses,
  selectedCampusId,
  onCampusChange,
  allLabel = "All Campuses",
  showCounts = true,
  className,
}: CampusScopeSelectorProps) {
  const selectedCampus = campuses.find((c) => c.id === selectedCampusId);
  const totalMembers = campuses.reduce((acc, c) => acc + (c.memberCount || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("mb-4", className)}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 bg-background/50 backdrop-blur-sm border-border/50 hover:bg-muted/50"
          >
            {selectedCampusId === null ? (
              <>
                <Globe className="h-4 w-4 text-primary" />
                <span>{allLabel}</span>
                {showCounts && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {totalMembers}
                  </Badge>
                )}
              </>
            ) : (
              <>
                <Building className="h-4 w-4 text-primary" />
                <span>{selectedCampus?.name}</span>
                {showCounts && selectedCampus?.memberCount && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {selectedCampus.memberCount}
                  </Badge>
                )}
              </>
            )}
            <ChevronDown className="h-4 w-4 ml-1 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          {/* All Campuses option */}
          <DropdownMenuItem
            onClick={() => onCampusChange(null)}
            className="flex items-center justify-between p-3"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">{allLabel}</p>
                {showCounts && (
                  <p className="text-xs text-muted-foreground">{totalMembers} total</p>
                )}
              </div>
            </div>
            {selectedCampusId === null && (
              <Check className="h-4 w-4 text-status-active" />
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Individual campuses */}
          {campuses.map((campus) => (
            <DropdownMenuItem
              key={campus.id}
              onClick={() => onCampusChange(campus.id)}
              className="flex items-center justify-between p-3"
            >
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                <div>
                  <p className="font-medium">{campus.name}</p>
                  {campus.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {campus.location}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {showCounts && campus.memberCount && (
                  <Badge variant="secondary" className="text-xs">
                    {campus.memberCount}
                  </Badge>
                )}
                {selectedCampusId === campus.id && (
                  <Check className="h-4 w-4 text-status-active" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}

// Demo campus data
export const demoCampuses: Campus[] = [
  { id: "main", name: "Main Campus", location: "Downtown", memberCount: 850 },
  { id: "north", name: "North Campus", location: "Northside", memberCount: 320 },
  { id: "east", name: "East Campus", location: "Eastview", memberCount: 275 },
];
