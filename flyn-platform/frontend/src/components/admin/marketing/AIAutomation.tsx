import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useMarketingDashboard } from "@/contexts/MarketingDashboardContext";
import {
  Bot,
  Zap,
  TrendingUp,
  Clock,
  Send,
  ArrowUpRight,
  Sparkles,
  Settings,
  AlertCircle,
} from "lucide-react";

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  enabled: boolean;
  runsToday: number;
}

export function AIAutomation() {
  const { aiRecommendations, leads } = useMarketingDashboard();

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([
    {
      id: "ar-1",
      name: "Auto-assign new leads",
      description: "Automatically assign new leads to available team members",
      trigger: "New lead created",
      action: "Assign to next available marketer",
      enabled: true,
      runsToday: 23,
    },
    {
      id: "ar-2",
      name: "Follow-up reminder",
      description: "Send reminder when lead hasn't responded in 3 days",
      trigger: "No response for 3 days",
      action: "Send follow-up email",
      enabled: true,
      runsToday: 8,
    },
    {
      id: "ar-3",
      name: "Trial activation nudge",
      description: "Remind trial users to complete setup",
      trigger: "Trial started, not activated in 24h",
      action: "Send WhatsApp message",
      enabled: true,
      runsToday: 12,
    },
    {
      id: "ar-4",
      name: "Upgrade prompt",
      description: "Suggest upgrade when usage exceeds 80%",
      trigger: "Usage > 80% of plan limit",
      action: "Send upgrade offer",
      enabled: false,
      runsToday: 0,
    },
  ]);

  const [leadScoreThreshold, setLeadScoreThreshold] = useState([70]);

  const toggleRule = (id: string) => {
    setAutomationRules(prev =>
      prev.map(rule => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)
    );
  };

  const priorityColors = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    low: "bg-muted text-muted-foreground border-border",
  };

  // Calculate high-score leads
  const highScoreLeads = leads.filter(l => l.score >= leadScoreThreshold[0]).length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* AI Insights Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">AI Actions Today</p>
                <p className="text-2xl font-bold">43</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">High Score Leads</p>
                <p className="text-2xl font-bold">{highScoreLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Follow-ups</p>
                <p className="text-2xl font-bold">8</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Upgrade Ready</p>
                <p className="text-2xl font-bold">5</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Recommendations
            </CardTitle>
            <CardDescription>Intelligent actions based on lead behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiRecommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {rec.type === "lead-score" && <TrendingUp className="w-4 h-4 text-primary" />}
                  {rec.type === "outreach-time" && <Clock className="w-4 h-4 text-primary" />}
                  {rec.type === "follow-up" && <Send className="w-4 h-4 text-primary" />}
                  {rec.type === "upgrade" && <ArrowUpRight className="w-4 h-4 text-primary" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm">{rec.message}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={priorityColors[rec.priority]}>
                      {rec.priority}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      Take Action
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Lead Scoring Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              AI Configuration
            </CardTitle>
            <CardDescription>Configure AI behavior and thresholds</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Lead Score Threshold</Label>
                <span className="text-sm font-medium">{leadScoreThreshold[0]}</span>
              </div>
              <Slider
                value={leadScoreThreshold}
                onValueChange={setLeadScoreThreshold}
                min={0}
                max={100}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Leads with scores above {leadScoreThreshold[0]} will be flagged for priority outreach
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">AI Auto-Reply</p>
                  <p className="text-xs text-muted-foreground">Let AI respond to common questions</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Predictive Lead Scoring</p>
                  <p className="text-xs text-muted-foreground">Use ML to predict conversion likelihood</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Best Time Prediction</p>
                  <p className="text-xs text-muted-foreground">Suggest optimal contact times</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automation Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Automation Rules
          </CardTitle>
          <CardDescription>Configure automated workflows (Admin only)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {automationRules.map((rule) => (
              <div
                key={rule.id}
                className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                  rule.enabled ? "border-border" : "border-border/50 opacity-60"
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{rule.name}</p>
                    {rule.enabled && (
                      <Badge variant="secondary" className="text-xs">
                        {rule.runsToday} runs today
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{rule.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span><strong>Trigger:</strong> {rule.trigger}</span>
                    <span><strong>Action:</strong> {rule.action}</span>
                  </div>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={() => toggleRule(rule.id)}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-4 h-4" />
              <span>Only admins can modify automation rules</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
