import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useMarketingDashboard } from "@/contexts/MarketingDashboardContext";
import {
  Users,
  UserPlus,
  UserCheck,
  DollarSign,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Target,
  Zap,
} from "lucide-react";

function formatNumber(num: number) {
  return new Intl.NumberFormat("en-US").format(num);
}

export function MarketingOverview() {
  const { funnelMetrics, teamMembers, aiRecommendations } = useMarketingDashboard();

  const funnelSteps = [
    { label: "Leads", value: funnelMetrics.leads, icon: Users, color: "bg-blue-500" },
    { label: "Trials", value: funnelMetrics.trials, icon: UserPlus, color: "bg-purple-500" },
    { label: "Activated", value: funnelMetrics.activated, icon: UserCheck, color: "bg-amber-500" },
    { label: "Paid", value: funnelMetrics.paid, icon: DollarSign, color: "bg-green-500" },
  ];

  const priorityColors = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    low: "bg-muted text-muted-foreground border-border",
  };

  // Sort team by revenue influenced
  const leaderboard = [...teamMembers].sort((a, b) => b.metrics.revenueInfluenced - a.metrics.revenueInfluenced);

  return (
    <div className="space-y-6">
      {/* Funnel Visualization */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Conversion Funnel
            </CardTitle>
            <CardDescription>Lead → Trial → Activated → Paid journey</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              {funnelSteps.map((step, index) => (
                <div key={step.label} className="flex items-center flex-1">
                  <div className="flex-1 text-center">
                    <div className={`w-12 h-12 mx-auto rounded-xl ${step.color} bg-opacity-10 flex items-center justify-center mb-2`}>
                      <step.icon className={`w-6 h-6 ${step.color.replace("bg-", "text-")}`} />
                    </div>
                    <p className="text-2xl font-bold">{formatNumber(step.value)}</p>
                    <p className="text-sm text-muted-foreground">{step.label}</p>
                  </div>
                  {index < funnelSteps.length - 1 && (
                    <ArrowRight className="w-5 h-5 text-muted-foreground mx-2 shrink-0" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall Conversion Rate</span>
                <span className="font-semibold text-primary">{funnelMetrics.conversionRate}%</span>
              </div>
              <Progress value={funnelMetrics.conversionRate} className="mt-2 h-2" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Recommendations */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                AI Recommendations
              </CardTitle>
              <CardDescription>Smart actions to improve conversions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiRecommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{rec.message}</p>
                    <Badge variant="outline" className={`mt-1 text-xs ${priorityColors[rec.priority]}`}>
                      {rec.priority} priority
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Performance Leaderboard */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Performance Leaderboard
              </CardTitle>
              <CardDescription>Top performers by revenue influenced</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaderboard.map((member, index) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? "bg-amber-500 text-white" :
                    index === 1 ? "bg-slate-400 text-white" :
                    index === 2 ? "bg-amber-700 text-white" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary">
                      ${formatNumber(member.metrics.revenueInfluenced)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.metrics.paidConversions} conversions
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Leads Contacted Today", value: "-", change: "0%" },
          { label: "Trials Started", value: "-", change: "0%" },
          { label: "Demos Booked", value: "-", change: "0%" },
          { label: "Revenue This Week", value: "-", change: "0%" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.05 }}
          >
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <span className="text-sm text-green-600">{stat.change}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
