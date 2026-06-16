import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useMarketingDashboard } from "@/contexts/MarketingDashboardContext";
import {
  Rocket,
  CheckCircle,
  Circle,
  MessageSquare,
  Mail,
} from "lucide-react";

export function OnboardingCenter() {
  const { onboardingChecklists, updateOnboardingStep } = useMarketingDashboard();

  const getCompletionPercentage = (checklist: typeof onboardingChecklists[0]) => {
    const completed = checklist.steps.filter(s => s.completed).length;
    return Math.round((completed / checklist.steps.length) * 100);
  };

  const productIcons: Record<string, string> = {
    "whatsapp-crm": "💬",
    "events": "🎫",
    "church": "⛪",
    "coaches": "🎓",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Circle className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Not Started</p>
                <p className="text-2xl font-bold">12</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold">24</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Activated</p>
                <p className="text-2xl font-bold">156</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Checklists */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Product Onboarding
          </CardTitle>
          <CardDescription>Track user activation across products</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {onboardingChecklists.map((checklist) => {
            const completion = getCompletionPercentage(checklist);
            return (
              <div
                key={checklist.productId}
                className="p-4 rounded-xl border border-border"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{productIcons[checklist.productId] || "📦"}</span>
                    <div>
                      <h3 className="font-semibold">{checklist.productName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {checklist.activationRate}% activation rate
                      </p>
                    </div>
                  </div>
                  <Badge variant={completion === 100 ? "default" : "secondary"}>
                    {completion}% complete
                  </Badge>
                </div>

                <Progress value={completion} className="h-2 mb-4" />

                <div className="space-y-2">
                  {checklist.steps.map((step) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={step.completed}
                        onCheckedChange={(checked) => 
                          updateOnboardingStep(checklist.productId, step.id, checked as boolean)
                        }
                      />
                      <span className={`text-sm ${step.completed ? "line-through text-muted-foreground" : ""}`}>
                        {step.label}
                      </span>
                      {step.completed && (
                        <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Onboarding Nudges */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Activation Nudges
          </CardTitle>
          <CardDescription>Send targeted messages to help users complete onboarding</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                user: "John Smith",
                product: "WhatsApp CRM",
                step: "Send first message",
                lastActive: "2 days ago",
              },
              {
                user: "Maria Garcia",
                product: "Events",
                step: "First ticket sale",
                lastActive: "1 day ago",
              },
              {
                user: "David Chen",
                product: "Church",
                step: "Import members",
                lastActive: "5 hours ago",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-lg border border-border"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                  {item.user.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{item.user}</p>
                  <p className="text-sm text-muted-foreground">
                    Stuck on: <span className="text-foreground">{item.step}</span> in {item.product}
                  </p>
                  <p className="text-xs text-muted-foreground">Last active {item.lastActive}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Mail className="w-4 h-4 mr-1" />
                    Email
                  </Button>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="w-4 h-4 mr-1" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
