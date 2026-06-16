import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  /** Layer 1: Header KPI Strip */
  kpiStrip: ReactNode;
  /** Layer 2: Primary Action Bar */
  actionBar: ReactNode;
  /** Layer 3: Core Operational Table */
  mainContent: ReactNode;
  /** Layer 4: Contextual Analytics */
  analytics?: ReactNode;
  /** Layer 5: AI Insight Panel */
  aiInsights?: ReactNode;
  /** Layer 6: Activity & System Feed */
  activityFeed?: ReactNode;
  /** Module-specific accent color */
  accentGradient?: string;
  className?: string;
}

/**
 * DashboardLayout - Enforces the mandatory 6-layer structure
 * All module dashboards inherit this layout automatically
 */
export function DashboardLayout({
  kpiStrip,
  actionBar,
  mainContent,
  analytics,
  aiInsights,
  activityFeed,
  className,
}: DashboardLayoutProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Layer 1: Header KPI Strip */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        aria-label="Key Performance Indicators"
      >
        {kpiStrip}
      </motion.section>

      {/* Layer 2: Primary Action Bar */}
      <motion.section
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        aria-label="Actions"
      >
        {actionBar}
      </motion.section>

      {/* Layer 3 & 4: Main Content + Analytics side-by-side or stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Core Operational Table - takes 2/3 on large screens */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(analytics ? "lg:col-span-2" : "lg:col-span-3")}
          aria-label="Main Data View"
        >
          {mainContent}
        </motion.section>

        {/* Contextual Analytics - takes 1/3 on large screens */}
        {analytics && (
          <motion.section
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-3"
            aria-label="Analytics"
          >
            {analytics}
          </motion.section>
        )}
      </div>

      {/* Layer 5 & 6: AI Insights + Activity Feed */}
      {(aiInsights || activityFeed) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* AI Insight Panel */}
          {aiInsights && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              aria-label="AI Insights"
            >
              {aiInsights}
            </motion.section>
          )}

          {/* Activity & System Feed */}
          {activityFeed && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              aria-label="Activity Feed"
            >
              {activityFeed}
            </motion.section>
          )}
        </div>
      )}
    </div>
  );
}
