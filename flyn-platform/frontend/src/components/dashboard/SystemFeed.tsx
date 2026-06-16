import { motion } from "framer-motion";
import { 
  Mail, MessageSquare, Phone, FileText, Calendar, 
  UserPlus, Edit, Trash2, CheckCircle, AlertCircle,
  Download, Upload, Settings, Bell, LucideIcon 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SystemEvent {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  type: 
    | "email" | "message" | "call" | "note" | "meeting"
    | "created" | "updated" | "deleted" | "completed" | "error"
    | "import" | "export" | "settings" | "notification";
  /** Link to related entity */
  entityLink?: string;
  /** Actor who performed the action */
  actor?: string;
}

interface SystemFeedProps {
  events: SystemEvent[];
  title?: string;
  /** Show "See All" link */
  showSeeAll?: boolean;
  onSeeAll?: () => void;
  /** Max events to display */
  maxEvents?: number;
  className?: string;
}

const eventIcons: Record<SystemEvent["type"], LucideIcon> = {
  email: Mail,
  message: MessageSquare,
  call: Phone,
  note: FileText,
  meeting: Calendar,
  created: UserPlus,
  updated: Edit,
  deleted: Trash2,
  completed: CheckCircle,
  error: AlertCircle,
  import: Download,
  export: Upload,
  settings: Settings,
  notification: Bell,
};

const eventColors: Record<SystemEvent["type"], string> = {
  email: "text-primary bg-primary/10",
  message: "text-flyn-cyan bg-flyn-cyan/10",
  call: "text-status-active bg-status-active/10",
  note: "text-muted-foreground bg-muted",
  meeting: "text-flyn-purple-deep bg-flyn-purple-deep/10",
  created: "text-status-active bg-status-active/10",
  updated: "text-primary bg-primary/10",
  deleted: "text-destructive bg-destructive/10",
  completed: "text-status-active bg-status-active/10",
  error: "text-destructive bg-destructive/10",
  import: "text-flyn-cyan bg-flyn-cyan/10",
  export: "text-flyn-cyan bg-flyn-cyan/10",
  settings: "text-muted-foreground bg-muted",
  notification: "text-status-pending bg-status-pending/10",
};

/**
 * SystemFeed - Layer 6 of Dashboard
 * Rules: Chronological, human-readable, linked to system entities
 */
export function SystemFeed({
  events,
  title = "Activity",
  showSeeAll = true,
  onSeeAll,
  maxEvents = 5,
  className,
}: SystemFeedProps) {
  const displayEvents = events.slice(0, maxEvents);

  return (
    <Card className={cn("border-0 flyn-card", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-display">{title}</CardTitle>
          {showSeeAll && (
            <Button
              variant="link"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-auto p-0"
              onClick={onSeeAll}
            >
              See all →
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {displayEvents.map((event, index) => {
            const Icon = eventIcons[event.type];
            const colorClass = eventColors[event.type];
            const isLast = index === displayEvents.length - 1;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex gap-3"
              >
                {/* Timeline */}
                <div className="flex flex-col items-center">
                  <div className={cn("p-2 rounded-lg shrink-0", colorClass)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-border my-2" />}
                </div>

                {/* Content */}
                <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm leading-tight">
                        {event.entityLink ? (
                          <button
                            className="hover:text-primary transition-colors text-left"
                            onClick={() => {
                              // Navigate to entity
                            }}
                          >
                            {event.title}
                          </button>
                        ) : (
                          event.title
                        )}
                      </p>
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {event.timestamp}
                    </span>
                    {event.actor && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {event.actor}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
