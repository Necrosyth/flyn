import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Zap,
  Settings,
  ArrowRight,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

interface UsageMetric {
  name: string;
  label: string;
  current: number;
  limit: number;
  percentage: number;
  status: "ok" | "warning" | "critical";
  trend?: number;
}

interface SubscriptionInfo {
  status: "active" | "trialing" | "paused" | "canceled";
  currentPlan: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  daysUntilRenewal: number;
  nextBillingDate: string;
  autoRenew: boolean;
}

interface TenantPlanDashboard {
  subscription: SubscriptionInfo;
  currentPlan: {
    id: string;
    name: string;
    description: string;
    pricing: {
      monthly: number;
      yearly: number;
      currency: string;
    };
  };
  usage: UsageMetric[];
  features: Record<string, Array<{ name: string; enabled: boolean }>>;
  recommendations: any[];
  upcomingLimitWarnings: string[];
}

const PlanDashboard = () => {
  const [dashboard, setDashboard] = useState<TenantPlanDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authedFetch(`${API_BASE_URL}/tenants/me/plan-dashboard`);
        if (!res.ok) throw new Error("Failed to load plan dashboard");
        const data = await res.json();
        setDashboard(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load dashboard";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">Loading plan dashboard...</div>
        </div>
      </AppLayout>
    );
  }

  if (!dashboard) {
    return (
      <AppLayout>
        <div className="text-center text-muted-foreground">No plan data available</div>
      </AppLayout>
    );
  }

  const getStatusIcon = (status: "ok" | "warning" | "critical") => {
    switch (status) {
      case "critical":
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between"
        >
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Plan & Usage</h1>
            <p className="text-muted-foreground">Track your current plan and usage metrics</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Settings className="h-4 w-4" />
            Manage Subscription
          </Button>
        </motion.div>

        {/* Plan Overview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* Current Plan */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Current Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h3 className="text-2xl font-bold text-foreground">{dashboard.currentPlan.name}</h3>
                <p className="text-sm text-muted-foreground">{dashboard.currentPlan.description}</p>
              </div>
              <div className="pt-3 border-t">
                <Badge
                  variant={
                    dashboard.subscription.status === "active" ? "default" : "secondary"
                  }
                >
                  {dashboard.subscription.status.charAt(0).toUpperCase() +
                    dashboard.subscription.status.slice(1)}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Monthly Price</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  {dashboard.currentPlan.pricing.currency === "USD" ? "$" : ""}
                  {dashboard.currentPlan.pricing.monthly}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Billed monthly • Yearly: ${dashboard.currentPlan.pricing.yearly}
                </p>
              </div>
              <div className="pt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Renews on {new Date(dashboard.subscription.nextBillingDate).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Renewal Info */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 inline mr-2" />
                Time Until Renewal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  {dashboard.subscription.daysUntilRenewal}
                </h3>
                <p className="text-sm text-muted-foreground">days remaining in billing cycle</p>
              </div>
              <div className="pt-3 border-t">
                <p className="text-xs">
                  {dashboard.subscription.autoRenew
                    ? "✓ Auto-renewal enabled"
                    : "⚠ Auto-renewal disabled"}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Usage Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Usage & Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {dashboard.usage.map((metric) => (
                <div key={metric.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(metric.status)}
                      <span className="font-medium text-foreground">{metric.label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-foreground">
                        {metric.current.toLocaleString()} / {metric.limit.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {metric.percentage}% used
                        {metric.trend !== undefined && (
                          <span
                            className={cn(
                              "ml-2",
                              metric.trend > 0 ? "text-red-600" : "text-green-600"
                            )}
                          >
                            {metric.trend > 0 ? "+" : ""}
                            {metric.trend}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Progress
                    value={metric.percentage}
                    className={cn("h-2", {
                      "[&>div]:bg-green-600": metric.status === "ok",
                      "[&>div]:bg-yellow-500": metric.status === "warning",
                      "[&>div]:bg-destructive": metric.status === "critical",
                    })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Warnings */}
        {dashboard.upcomingLimitWarnings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border border-yellow-200 bg-yellow-50 dark:bg-yellow-950">
              <CardHeader>
                <CardTitle className="text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Approaching Limits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {dashboard.upcomingLimitWarnings.map((warning, i) => (
                    <li key={i} className="text-sm text-yellow-800 dark:text-yellow-200">
                      • {warning}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Recommendations */}
        {dashboard.recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border border-blue-200 bg-blue-50 dark:bg-blue-950">
              <CardHeader>
                <CardTitle className="text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Upgrade Recommended
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded border border-blue-200 dark:border-blue-800"
                  >
                    <div>
                      <p className="font-medium text-foreground">{rec.reason}</p>
                      <p className="text-sm text-muted-foreground">
                        Upgrade from {rec.fromPlan} to {rec.toPlan}
                      </p>
                    </div>
                    <Button size="sm" className="gap-2">
                      Upgrade <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Feature Access Matrix */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="border">
            <CardHeader>
              <CardTitle>Available Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {Object.entries(dashboard.features).map(([category, features]) => (
                  <div key={category}>
                    <h4 className="font-semibold text-foreground mb-3">{category}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {features.map((feature) => (
                        <div
                          key={feature.name}
                          className={cn(
                            "p-3 rounded border",
                            feature.enabled
                              ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                              : "bg-muted border-muted-foreground/20"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {feature.enabled ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span
                              className={cn(
                                "text-sm font-medium",
                                feature.enabled
                                  ? "text-green-900 dark:text-green-100"
                                  : "text-muted-foreground"
                              )}
                            >
                              {feature.name}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default PlanDashboard;
