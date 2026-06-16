import { motion } from "framer-motion";
import { LucideIcon, Megaphone, FileText, Calendar, Sparkles, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Notice {
  id: string;
  title: string;
  description: string;
  type: "training" | "policy" | "holiday" | "announcement" | "update";
  date?: string;
}

const noticeIcons: Record<Notice["type"], LucideIcon> = {
  training: Sparkles,
  policy: FileText,
  holiday: Calendar,
  announcement: Megaphone,
  update: Bell,
};

const noticeColors: Record<Notice["type"], string> = {
  training: "bg-primary text-primary-foreground",
  policy: "bg-flyn-cyan text-white",
  holiday: "bg-status-pending text-white",
  announcement: "bg-destructive/80 text-white",
  update: "bg-muted text-muted-foreground",
};

interface NoticeCardProps {
  notice: Notice;
  onClick?: (notice: Notice) => void;
  compact?: boolean;
  className?: string;
}

export function NoticeCard({ notice, onClick, compact = false, className }: NoticeCardProps) {
  const Icon = noticeIcons[notice.type];

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ x: 4 }}
        onClick={() => onClick?.(notice)}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors",
          onClick && "cursor-pointer",
          className
        )}
      >
        <div className={cn("p-2 rounded-lg", noticeColors[notice.type])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{notice.title}</p>
          <p className="text-xs text-muted-foreground truncate">{notice.description}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onClick={() => onClick?.(notice)}
      className={cn(
        "p-4 rounded-xl border border-border bg-card hover:shadow-md transition-all",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2.5 rounded-xl", noticeColors[notice.type])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold">{notice.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{notice.description}</p>
          {notice.date && (
            <p className="text-xs text-muted-foreground mt-2">{notice.date}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface NoticeListProps {
  notices: Notice[];
  title?: string;
  onNoticeClick?: (notice: Notice) => void;
  compact?: boolean;
  className?: string;
}

export function NoticeList({
  notices,
  title = "Notices",
  onNoticeClick,
  compact = false,
  className,
}: NoticeListProps) {
  return (
    <div className={className}>
      {title && <h3 className="font-semibold text-lg mb-3">{title}</h3>}
      <div className={cn("space-y-2", compact ? "space-y-2" : "space-y-3")}>
        {notices.map((notice) => (
          <NoticeCard
            key={notice.id}
            notice={notice}
            onClick={onNoticeClick}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
