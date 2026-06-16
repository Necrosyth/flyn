import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Send, UserPlus, Check, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AddMode = "add" | "invite";

interface AddInviteToggleProps {
  /** Label for add action */
  addLabel?: string;
  /** Label for invite action */
  inviteLabel?: string;
  /** Callback when add is clicked */
  onAdd?: () => void;
  /** Callback when invite is clicked */
  onInvite?: () => void;
  /** Default mode */
  defaultMode?: AddMode;
  /** Module context for labeling */
  entityType?: "member" | "guest" | "attendee";
  className?: string;
}

/**
 * AddInviteToggle - Toggle between Add (auto-confirmed + calendar) vs Invite (needs RSVP)
 * Used in Events & Church modules for member/guest management
 */
export function AddInviteToggle({
  addLabel,
  inviteLabel,
  onAdd,
  onInvite,
  defaultMode = "add",
  entityType = "member",
  className,
}: AddInviteToggleProps) {
  const [mode, setMode] = useState<AddMode>(defaultMode);

  const entityLabels = {
    member: { add: "Add Member", invite: "Invite Member" },
    guest: { add: "Add Guest", invite: "Invite Guest" },
    attendee: { add: "Add Attendee", invite: "Invite Attendee" },
  };

  const labels = {
    add: addLabel || entityLabels[entityType].add,
    invite: inviteLabel || entityLabels[entityType].invite,
  };

  const handlePrimaryClick = () => {
    if (mode === "add") {
      onAdd?.();
    } else {
      onInvite?.();
    }
  };

  return (
    <div className={cn("flex items-center gap-0", className)}>
      {/* Primary button */}
      <Button
        onClick={handlePrimaryClick}
        className="flyn-button-gradient rounded-r-none"
      >
        {mode === "add" ? (
          <>
            <UserPlus className="h-4 w-4 mr-2" />
            {labels.add}
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            {labels.invite}
          </>
        )}
      </Button>

      {/* Dropdown for switching mode */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default" className="flyn-button-gradient rounded-l-none border-l border-white/20 px-2">
            <motion.div
              animate={{ rotate: 0 }}
              whileHover={{ rotate: 90 }}
              transition={{ duration: 0.2 }}
            >
              <Plus className="h-4 w-4" />
            </motion.div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              setMode("add");
              onAdd?.();
            }}
            className="flex items-start gap-3 p-3"
          >
            <div className="p-1.5 rounded-md bg-status-active/10">
              <UserPlus className="h-4 w-4 text-status-active" />
            </div>
            <div className="flex-1">
              <p className="font-medium flex items-center gap-2">
                {labels.add}
                {mode === "add" && <Check className="h-3.5 w-3.5 text-status-active" />}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-confirmed + Calendar invite
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              setMode("invite");
              onInvite?.();
            }}
            className="flex items-start gap-3 p-3"
          >
            <div className="p-1.5 rounded-md bg-primary/10">
              <Send className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium flex items-center gap-2">
                {labels.invite}
                {mode === "invite" && <Check className="h-3.5 w-3.5 text-status-active" />}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Requires RSVP/acceptance
              </p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * CheckInLink - Clickable KPI that links to QR Scanner or Rapid Check-in
 */
interface CheckInLinkProps {
  label: string;
  value: string | number;
  onClick?: () => void;
  className?: string;
}

export function CheckInLink({ label, value, onClick, className }: CheckInLinkProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "p-4 rounded-xl bg-gradient-to-br from-primary/10 to-flyn-cyan/10 border border-primary/20",
        "flex items-center justify-between gap-4 w-full text-left transition-colors hover:bg-primary/5",
        className
      )}
    >
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold font-display">{value}</p>
      </div>
      <div className="p-2 rounded-lg bg-primary/10">
        <Calendar className="h-5 w-5 text-primary" />
      </div>
    </motion.button>
  );
}
