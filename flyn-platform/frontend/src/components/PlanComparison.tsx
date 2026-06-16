import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PlanDetails {
  id: string;
  name: string;
  description: string;
  tagline?: string;
  pricing: {
    monthly: number;
    yearly: number;
    currency: string;
  };
  limits: Record<string, number>;
  features: Record<string, Record<string, boolean>>;
  recommended?: boolean;
  position?: number;
}

interface PlanComparisonProps {
  plans: PlanDetails[];
  selectedPlans?: string[];
  onCompare?: (planIds: string[]) => void;
}

export const PlanComparison = ({ plans, selectedPlans = [], onCompare }: PlanComparisonProps) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const comparingPlans = selectedPlans.length > 0 ? plans.filter((p) => selectedPlans.includes(p.id)) : plans;

  const toggleExpand = (category: string) => {
    setExpanded((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const allLimits = new Set<string>();
  comparingPlans.forEach((p) => {
    Object.keys(p.limits).forEach((l) => allLimits.add(l));
  });

  const formatLimit = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  return (
    <div className="space-y-6">
      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {comparingPlans.map((plan) => (
            <motion.div
              key={plan.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <Card
                className={cn(
                  "border-2 relative",
                  plan.recommended
                    ? "border-primary bg-primary/5 shadow-lg"
                    : "border-border hover:border-primary/50"
                )}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground shadow-lg">
                      Recommended
                    </Badge>
                  </div>
                )}
                <CardHeader className="pt-6">
                  <div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    {plan.tagline && (
                      <p className="text-sm text-muted-foreground mt-1">{plan.tagline}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold text-foreground">
                      {plan.pricing.currency === "USD" ? "$" : ""}
                      {plan.pricing.monthly}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      per month ({plan.pricing.currency})
                    </p>
                    {plan.pricing.yearly > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Yearly: ${plan.pricing.yearly} ({Math.round((1 - plan.pricing.yearly / (plan.pricing.monthly * 12)) * 100)}% off)
                      </p>
                    )}
                  </div>
                  <Button className="w-full flyn-button-gradient">Get Started</Button>
                  <p className="text-xs text-muted-foreground text-center">{plan.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Detailed Comparison Table */}
      <Card className="border">
        <CardHeader>
          <CardTitle>Feature & Limit Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold text-foreground min-w-[250px]">
                    Feature
                  </th>
                  {comparingPlans.map((plan) => (
                    <th
                      key={plan.id}
                      className="text-center p-3 font-semibold text-foreground whitespace-nowrap"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Limits Section */}
                <tr className="border-b bg-muted/50">
                  <td colSpan={comparingPlans.length + 1} className="p-3 font-bold text-foreground">
                    Monthly Limits
                  </td>
                </tr>
                {Array.from(allLimits).map((limit) => (
                  <tr key={limit} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-foreground font-medium">
                      {limit
                        .split(/([A-Z])/)
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                    {comparingPlans.map((plan) => (
                      <td key={plan.id} className="p-3 text-center">
                        {plan.limits[limit] ? formatLimit(plan.limits[limit]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Features Section */}
                {comparingPlans.length > 0 &&
                  Object.keys(comparingPlans[0].features || {}).map((category) => (
                    <tbody key={category}>
                      <tr className="border-b bg-muted/50 cursor-pointer hover:bg-muted/70">
                        <td
                          colSpan={comparingPlans.length + 1}
                          className="p-3 font-bold text-foreground flex items-center gap-2"
                          onClick={() => toggleExpand(category)}
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              expanded[category] ? "rotate-180" : ""
                            )}
                          />
                          {category
                            .split("_")
                            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(" ")}
                        </td>
                      </tr>
                      <AnimatePresence>
                        {expanded[category] &&
                          Object.keys(comparingPlans[0].features[category] || {}).map(
                            (feature) => (
                              <tr
                                key={feature}
                                className="border-b hover:bg-muted/30 transition-colors"
                              >
                                <td className="p-3 text-foreground">
                                  {feature
                                    .split("_")
                                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                                    .join(" ")}
                                </td>
                                {comparingPlans.map((plan) => {
                                  const hasFeature = plan.features[category]?.[feature];
                                  return (
                                    <td key={plan.id} className="p-3 text-center">
                                      {hasFeature ? (
                                        <Check className="h-5 w-5 text-green-600 mx-auto" />
                                      ) : (
                                        <X className="h-5 w-5 text-muted-foreground mx-auto" />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            )
                          )}
                      </AnimatePresence>
                    </tbody>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
