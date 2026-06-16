import { motion } from "framer-motion";
import { Mail, MessageSquare, Phone, FileText, Calendar, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Activity {
  id: string;
  title: string;
  description?: string;
  time: string;
  type: "email" | "message" | "call" | "note" | "meeting";
}

const activityIcons: Record<Activity["type"], LucideIcon> = {
  email: Mail,
  message: MessageSquare,
  call: Phone,
  note: FileText,
  meeting: Calendar,
};

interface ActivityItemProps {
  activity: Activity;
  isLast?: boolean;
}

function ActivityItem({ activity, isLast }: ActivityItemProps) {
  const Icon = activityIcons[activity.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex gap-3"
    >
      <div className="flex flex-col items-center">
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border my-2" />}
      </div>
      <div className="flex-1 pb-4">
        <p className="font-medium text-sm">{activity.title}</p>
        {activity.description && (
          <p className="text-sm text-muted-foreground mt-0.5">{activity.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
      </div>
    </motion.div>
  );
}

interface ActivityFeedProps {
  activities: Activity[];
  title?: string;
  subtitle?: string;
  className?: string;
}

export function ActivityFeed({
  activities,
  title = "Activity",
  subtitle,
  className,
}: ActivityFeedProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{title}</h3>
        {subtitle && (
          <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            {subtitle}
          </span>
        )}
      </div>
      <div className="space-y-0">
        {activities.map((activity, i) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            isLast={i === activities.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
