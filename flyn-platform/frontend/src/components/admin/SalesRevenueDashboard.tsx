import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSalesAnalytics } from "@/contexts/SalesAnalyticsContext";
import {
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  CreditCard,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(num: number) {
  return new Intl.NumberFormat("en-US").format(num);
}

interface StatCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
  delay?: number;
}

function StatCard({ title, value, change, icon: Icon, delay = 0 }: StatCardProps) {
  const isPositive = change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              <div className={`flex items-center gap-1 mt-1 text-sm ${isPositive ? "text-green-600" : "text-destructive"}`}>
                {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                <span>{Math.abs(change)}%</span>
                <span className="text-muted-foreground">vs last month</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function SalesRevenueDashboard() {
  const {
    metrics,
    revenueHistory,
    customerHistory,
    recentTransactions,
    stripeConnection,
    refreshMetrics,
    isLoading,
  } = useSalesAnalytics();

  const statusColors: Record<string, string> = {
    succeeded: "bg-green-500/10 text-green-600 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
    refunded: "bg-muted text-muted-foreground border-border",
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Stripe Connection Status */}
      {!stripeConnection.isConnected && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div className="flex-1">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Stripe not connected
                </p>
                <p className="text-sm text-yellow-700/80 dark:text-yellow-300/80">
                  Connect your Stripe account to view real revenue data and manage subscriptions.
                </p>
              </div>
              <Button variant="outline" className="border-yellow-500/50" asChild>
                <a href="#stripe">Connect Stripe</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sales & Revenue</h2>
          <p className="text-sm text-muted-foreground">
            {stripeConnection.isConnected
              ? `Connected${stripeConnection.accountName ? ` to ${stripeConnection.accountName}` : ""} • ${stripeConnection.liveMode ? "Live" : "Test"} mode`
              : "Showing demo data"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshMetrics} disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(metrics.monthlyRevenue)}
          change={metrics.revenueGrowth}
          icon={DollarSign}
          delay={0}
        />
        <StatCard
          title="Total Customers"
          value={formatNumber(metrics.totalCustomers)}
          change={metrics.customerGrowth}
          icon={Users}
          delay={0.05}
        />
        <StatCard
          title="Avg Revenue / User"
          value={formatCurrency(metrics.avgRevenuePerUser)}
          change={8.2}
          icon={TrendingUp}
          delay={0.1}
        />
        <StatCard
          title="Churn Rate"
          value={`${metrics.churnRate}%`}
          change={-0.3}
          icon={TrendingDown}
          delay={0.15}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Chart */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue Trend</CardTitle>
              <CardDescription>Daily revenue over the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueHistory}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      className="text-xs text-muted-foreground"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v}`}
                      className="text-xs text-muted-foreground"
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      fill="url(#revenueGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Customer Growth Chart */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer Growth</CardTitle>
              <CardDescription>New vs churned customers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={customerHistory.slice(-14)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { day: "numeric" })}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="new" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="New" />
                    <Bar dataKey="churned" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Churned" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Plan Distribution & Transactions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Plan Distribution */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Active Plans
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.activePlans.map((plan) => (
                <div key={plan.planId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{plan.planName}</p>
                    <p className="text-sm text-muted-foreground">{formatNumber(plan.count)} subscribers</p>
                  </div>
                  <p className="font-semibold text-primary">{formatCurrency(plan.revenue)}/mo</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Transactions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <CardDescription>Latest payment activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentTransactions.map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {txn.customerName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{txn.customerName}</p>
                        <p className="text-xs text-muted-foreground">{txn.customerEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={statusColors[txn.status]}>
                        {txn.status}
                      </Badge>
                      <p className="font-semibold text-sm w-20 text-right">
                        {formatCurrency(txn.amount / 100)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
