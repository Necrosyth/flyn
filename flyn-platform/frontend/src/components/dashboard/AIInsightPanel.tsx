import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronDown, ChevronUp, Lightbulb, TrendingUp, AlertTriangle, CheckCircle2, LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AIInsight {
  id: string;
  title: string;
  description: string;
  type: "suggestion" | "trend" | "warning" | "success";
  priority?: "high" | "medium" | "low";
  actionLabel?: string;
  onAction?: () => void;
}

interface AIInsightPanelProps {
  insights: AIInsight[];
  /** Panel title */
  title?: string;
  /** Initially collapsed state */
  defaultCollapsed?: boolean;
  className?: string;
}

const insightIcons: Record<AIInsight["type"], LucideIcon> = {
  suggestion: Lightbulb,
  trend: TrendingUp,
  warning: AlertTriangle,
  success: CheckCircle2,
};

const insightColors: Record<AIInsight["type"], string> = {
  suggestion: "text-primary bg-primary/10",
  trend: "text-flyn-cyan bg-flyn-cyan/10",
  warning: "text-status-pending bg-status-pending/10",
  success: "text-status-active bg-status-active/10",
};

/**
 * AIInsightPanel - Layer 5 of Dashboard
 * Rules: Collapsible, non-intrusive, clearly labeled as AI-generated
 */
export function AIInsightPanel({
  insights,
  title = "AI Insights",
  defaultCollapsed = false,
  className,
}: AIInsightPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (insights.length === 0) return null;

  return (
    <Card className={cn("border-0 flyn-card overflow-hidden", className)}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-flyn-cyan">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg font-display">{title}</CardTitle>
            <Badge variant="secondary" className="text-xs">
              AI Generated
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-0 space-y-3">
              {insights.map((insight, index) => {
                const Icon = insightIcons[insight.type];
                const colorClass = insightColors[insight.type];

                return (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className={cn("p-2 rounded-lg shrink-0", colorClass)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">{insight.title}</p>
                        {insight.priority && (
                          <Badge
                            variant={
                              insight.priority === "high"
                                ? "destructive"
                                : insight.priority === "medium"
                                ? "warning"
                                : "secondary"
                            }
                            className="text-[10px] shrink-0"
                          >
                            {insight.priority}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {insight.description}
                      </p>
                      {insight.actionLabel && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 mt-1 text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            insight.onAction?.();
                          }}
                        >
                          {insight.actionLabel} →
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
