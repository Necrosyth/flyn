import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KPI {
  id: string;
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: string;
    positive?: boolean;
  };
  gradient?: string;
  onClick?: () => void;
}

interface KPIStripProps {
  kpis: KPI[];
  maxKpis?: number; // Default 6, enforces 3-6 KPI rule
  className?: string;
}

/**
 * KPIStrip - Layer 1 of Dashboard
 * Rules: 3-6 KPIs maximum, clickable for deep views, shows real/demo data
 */
export function KPIStrip({ kpis, maxKpis = 6, className }: KPIStripProps) {
  // Enforce 3-6 KPI rule
  const displayKpis = kpis.slice(0, Math.min(maxKpis, 6));

  return (
    <div
      className={cn(
        "grid gap-3",
        displayKpis.length <= 3
          ? "grid-cols-1 sm:grid-cols-3"
          : displayKpis.length === 4
          ? "grid-cols-2 lg:grid-cols-4"
          : displayKpis.length === 5
          ? "grid-cols-2 lg:grid-cols-5"
          : "grid-cols-2 lg:grid-cols-6",
        className
      )}
    >
      {displayKpis.map((kpi, index) => (
        <motion.div
          key={kpi.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          whileHover={kpi.onClick ? { y: -2, transition: { duration: 0.15 } } : undefined}
        >
          <Card
            className={cn(
              "border-0 flyn-card overflow-hidden",
              kpi.onClick && "cursor-pointer hover:shadow-lg transition-shadow"
            )}
            onClick={kpi.onClick}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-lg font-bold mt-0.5 font-display">{kpi.value}</p>
                  {kpi.trend && (
                    <p
                      className={cn(
                        "text-xs mt-0.5 font-medium",
                        kpi.trend.positive ? "text-status-active" : "text-destructive"
                      )}
                    >
                      {kpi.trend.value}
                    </p>
                  )}
                </div>
                {kpi.icon && (
                  <div
                    className={cn(
                      "p-1.5 rounded-lg bg-gradient-to-br text-white shrink-0",
                      kpi.gradient || "from-primary to-flyn-cyan"
                    )}
                  >
                    <kpi.icon className="h-4 w-4" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
