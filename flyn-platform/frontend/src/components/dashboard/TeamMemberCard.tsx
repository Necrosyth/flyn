import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  status?: "online" | "offline" | "busy";
}

interface TeamMemberCardProps {
  member: TeamMember;
  onClick?: (member: TeamMember) => void;
  className?: string;
}

export function TeamMemberCard({ member, onClick, className }: TeamMemberCardProps) {
  const initials = member.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 4 }}
      onClick={() => onClick?.(member)}
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.avatar} alt={member.name} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        {member.status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
              member.status === "online" && "bg-status-active",
              member.status === "busy" && "bg-status-pending",
              member.status === "offline" && "bg-muted-foreground"
            )}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{member.name}</p>
        <p className="text-xs text-muted-foreground truncate">{member.role}</p>
      </div>
    </motion.div>
  );
}

interface TeamListProps {
  members: TeamMember[];
  title?: string;
  onMemberClick?: (member: TeamMember) => void;
  className?: string;
}

export function TeamList({ members, title = "Team", onMemberClick, className }: TeamListProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {title && <h3 className="font-semibold text-lg mb-3">{title}</h3>}
      <div className="space-y-1">
        {members.map((member) => (
          <TeamMemberCard key={member.id} member={member} onClick={onMemberClick} />
        ))}
      </div>
    </div>
  );
}
