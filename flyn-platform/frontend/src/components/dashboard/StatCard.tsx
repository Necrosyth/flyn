import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  gradient?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
  compact?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  gradient = "from-primary to-flyn-cyan",
  trend,
  compact = false,
  className,
}: StatCardProps) {
  if (compact) {
    return (
      <Card className={cn("border-0 flyn-card", className)}>
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={cn("border-0 flyn-card", className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-0.5 text-foreground">{value}</p>
              {trend && (
                <p
                  className={cn(
                    "text-xs mt-0.5",
                    trend.positive ? "text-status-active" : "text-destructive"
                  )}
                >
                  {trend.value}
                </p>
              )}
            </div>
            {Icon && (
              <div className={cn("p-1.5 rounded-lg bg-gradient-to-br text-white shadow-sm flex-shrink-0", gradient)}>
                <Icon className="h-4 w-4" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Featured stat with gradient background (like the 256 Employees in HR)
interface FeaturedStatProps {
  label: string;
  value: string | number;
  gradient?: string;
  className?: string;
}

export function FeaturedStat({
  label,
  value,
  gradient = "from-primary to-flyn-purple-deep",
  className,
}: FeaturedStatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        "rounded-lg bg-gradient-to-br p-4 text-white text-center shadow-lg",
        gradient,
        className
      )}
    >
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs opacity-90 mt-0.5">{label}</p>
    </motion.div>
  );
}
