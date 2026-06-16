import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Edit2, RefreshCw, DollarSign, Users, Star, ExternalLink, Save, Calendar, Package, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getAllPlans, seedPlans, getAdminSchema, updateSchema } from "@/services/plansApi";
import type { PlanDefinition, PricingTableSchema, BillingPeriodConfig, AddOnDef } from "@/services/plansApi";

type PeriodKey = "monthly" | "quarterly" | "biannual" | "annual";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  monthly:   "1 Month (Monthly)",
  quarterly: "3 Months",
  biannual:  "6 Months",
  annual:    "1 Year (Annual)",
};

const PERIOD_ORDER: PeriodKey[] = ["monthly", "quarterly", "biannual", "annual"];

const DEFAULT_PERIODS: Record<PeriodKey, BillingPeriodConfig> = {
  monthly:   { enabled: true,  discount: 0  },
  quarterly: { enabled: false, discount: 5  },
  biannual:  { enabled: false, discount: 10 },
  annual:    { enabled: true,  discount: 20 },
};

const DEFAULT_ADDON_ESSENTIAL: Required<AddOnDef> = {
  enabled: true,
  basePrice: 25,
  availableOn: "Available on Starter & Growth",
  features: [
    "Sales pipeline & deal tracking",
    "Phonebook with smart segments",
    "Calendar sync & scheduling",
    "Automated task workflows",
    "WhatsApp CRM integration",
    "Telegram bot connection",
    "Basic AI Front Desk support",
    "Asset Hub (media library)",
  ],
};

const DEFAULT_ADDON_ADVANCED: Required<AddOnDef> = {
  enabled: true,
  basePrice: 50,
  availableOn: "Available on Pro · Bundled in Custom",
  features: [
    "AI Agents (custom-trained)",
    "AI Marketing campaigns",
    "AI Content generation",
    "AI Social Media scheduler",
    "Website Builder + hosting",
    "Custom domain management",
    "Voice Agents (Vapi/IVR)",
    "Developer Portal & API access",
  ],
};

export function PricingEditor() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Schema / billing periods
  const [periods, setPeriods] = useState<Record<PeriodKey, BillingPeriodConfig>>({ ...DEFAULT_PERIODS });
  const [essential, setEssential] = useState<Required<AddOnDef>>({ ...DEFAULT_ADDON_ESSENTIAL });
  const [advanced, setAdvanced] = useState<Required<AddOnDef>>({ ...DEFAULT_ADDON_ADVANCED });
  const [schemaSaving, setSchemaSaving] = useState(false);

  const fetchPlans = async () => {
    try {
      const data = await getAllPlans();
      setPlans(data.sort((a, b) => (a.position ?? 99) - (b.position ?? 99)));
    } catch {
      toast({ title: "Error", description: "Failed to load plans", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchSchema = async () => {
    try {
      const s = await getAdminSchema();
      if (s?.billingPeriods) {
        setPeriods({
          monthly:   { ...DEFAULT_PERIODS.monthly,   ...(s.billingPeriods.monthly   ?? {}) },
          quarterly: { ...DEFAULT_PERIODS.quarterly, ...(s.billingPeriods.quarterly ?? {}) },
          biannual:  { ...DEFAULT_PERIODS.biannual,  ...(s.billingPeriods.biannual  ?? {}) },
          annual:    { ...DEFAULT_PERIODS.annual,    ...(s.billingPeriods.annual    ?? {}) },
        });
      }
      if (s?.addOns?.essential) setEssential({ ...DEFAULT_ADDON_ESSENTIAL, ...s.addOns.essential, features: s.addOns.essential.features ?? DEFAULT_ADDON_ESSENTIAL.features });
      if (s?.addOns?.advanced)  setAdvanced({ ...DEFAULT_ADDON_ADVANCED,  ...s.addOns.advanced,  features: s.addOns.advanced.features  ?? DEFAULT_ADDON_ADVANCED.features  });
    } catch { /* ignore — use defaults */ }
  };

  useEffect(() => { fetchPlans(); fetchSchema(); }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedPlans();
      await fetchPlans();
      toast({ title: "Plans seeded", description: "All 4 plans + comparison table written to Firestore." });
    } catch {
      toast({ title: "Seed failed", description: "Could not seed plans.", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const handleSaveSchema = async () => {
    setSchemaSaving(true);
    try {
      const current = await getAdminSchema().catch(() => ({} as PricingTableSchema));
      await updateSchema({
        ...current,
        billingPeriods: periods,
        addOns: { essential, advanced },
      });
      toast({ title: "Saved", description: "Billing periods & add-ons updated on public pricing page." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSchemaSaving(false);
    }
  };

  const setPeriodField = (key: PeriodKey, field: keyof BillingPeriodConfig, value: boolean | number) => {
    setPeriods(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* ── Plans Grid ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                Pricing Plans
              </CardTitle>
              <CardDescription>
                Manage subscription tiers — changes reflect immediately on the public pricing page.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => window.open("/pricing", "_blank")} className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Preview
              </Button>
              <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding} className="gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${seeding ? "animate-spin" : ""}`} />
                {seeding ? "Seeding..." : plans.length === 0 ? "Seed Plans" : "Re-seed"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <p className="text-muted-foreground text-sm">
                No plans in Firestore yet. Click <strong>Seed Plans</strong> to populate the default 4 plans.
              </p>
              <Button onClick={handleSeed} disabled={seeding} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${seeding ? "animate-spin" : ""}`} />
                {seeding ? "Seeding..." : "Seed Plans"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const price = plan.pricing?.monthly;
                const isCustom = plan.pricing?.monthly === 0 && plan.pricing?.yearly === 0;
                const enabledCount = Object.values(plan.features ?? {}).reduce((n, cat) =>
                  n + Object.values(cat ?? {}).filter(Boolean).length, 0);
                return (
                  <div key={plan.id} className={`relative rounded-xl border p-5 flex flex-col gap-3 ${plan.recommended ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    {plan.recommended && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium whitespace-nowrap">
                        <Star className="w-3 h-3" />
                        Recommended
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      {isCustom ? (
                        <span className="text-2xl font-bold">Contact Sales</span>
                      ) : (
                        <>
                          <span className="text-3xl font-bold">${price}</span>
                          <span className="text-muted-foreground text-sm">/mo</span>
                        </>
                      )}
                    </div>
                    <ul className="space-y-1 flex-1">
                      {(plan.highlights ?? []).slice(0, 4).map((h, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          {h}
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {plan.limits?.teamMembers >= 999999 ? "Unlimited" : plan.limits?.teamMembers} members
                      </span>
                      <span>{enabledCount} features</span>
                    </div>
                    <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => navigate(`/admin/plans/${plan.id}`)}>
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit Plan
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Billing Periods ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Billing Periods
          </CardTitle>
          <CardDescription>
            Control which payment intervals are visible on the public pricing page. Discount % is applied to all base plan and add-on prices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {PERIOD_ORDER.map((key) => {
              const cfg = periods[key];
              const isMonthly = key === "monthly";
              return (
                <div key={key} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch
                      checked={cfg.enabled}
                      onCheckedChange={(v) => setPeriodField(key, "enabled", v)}
                    />
                    <span className={`font-medium text-sm ${cfg.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                      {PERIOD_LABELS[key]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Discount %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      disabled={isMonthly}
                      value={cfg.discount}
                      onChange={(e) => setPeriodField(key, "discount", parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-sm text-center"
                    />
                    {!isMonthly && cfg.discount > 0 && (
                      <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        Save {cfg.discount}%
                      </span>
                    )}
                    {isMonthly && (
                      <span className="text-xs text-muted-foreground px-2 py-0.5 whitespace-nowrap">No discount</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSaveSchema} disabled={schemaSaving} className="gap-2">
              <Save className={`w-4 h-4 ${schemaSaving ? "animate-spin" : ""}`} />
              {schemaSaving ? "Saving..." : "Save Billing Periods & Add-ons"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Feature Add-ons ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Feature Add-ons
          </CardTitle>
          <CardDescription>
            Optional bundles shown below base plans on the public pricing page. Prices are discounted automatically by the selected billing period.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Essential */}
          <div className="rounded-xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold">Essential Features</h4>
                <p className="text-xs text-muted-foreground">Sales/CRM productivity layer</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show on pricing page</span>
                <Switch checked={essential.enabled} onCheckedChange={(v) => setEssential(prev => ({ ...prev, enabled: v }))} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Base Price ($/mo)</Label>
                <Input
                  type="number"
                  min={0}
                  value={essential.basePrice}
                  onChange={(e) => setEssential(prev => ({ ...prev, basePrice: parseFloat(e.target.value) || 0 }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Availability Label</Label>
                <Input
                  value={essential.availableOn}
                  onChange={(e) => setEssential(prev => ({ ...prev, availableOn: e.target.value }))}
                  className="h-9"
                  placeholder="Available on Starter & Growth"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Features (one per line)</Label>
              <Textarea
                rows={6}
                value={(essential.features ?? []).join("\n")}
                onChange={(e) => setEssential(prev => ({ ...prev, features: e.target.value.split("\n").filter(Boolean) }))}
                className="text-sm font-mono resize-none"
              />
            </div>
          </div>

          {/* Advanced */}
          <div className="rounded-xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold">Advanced Features</h4>
                <p className="text-xs text-muted-foreground">AI intelligence layer</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show on pricing page</span>
                <Switch checked={advanced.enabled} onCheckedChange={(v) => setAdvanced(prev => ({ ...prev, enabled: v }))} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Base Price ($/mo)</Label>
                <Input
                  type="number"
                  min={0}
                  value={advanced.basePrice}
                  onChange={(e) => setAdvanced(prev => ({ ...prev, basePrice: parseFloat(e.target.value) || 0 }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Availability Label</Label>
                <Input
                  value={advanced.availableOn}
                  onChange={(e) => setAdvanced(prev => ({ ...prev, availableOn: e.target.value }))}
                  className="h-9"
                  placeholder="Available on Pro · Bundled in Custom"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Features (one per line)</Label>
              <Textarea
                rows={6}
                value={(advanced.features ?? []).join("\n")}
                onChange={(e) => setAdvanced(prev => ({ ...prev, features: e.target.value.split("\n").filter(Boolean) }))}
                className="text-sm font-mono resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSchema} disabled={schemaSaving} className="gap-2">
              <Save className={`w-4 h-4 ${schemaSaving ? "animate-spin" : ""}`} />
              {schemaSaving ? "Saving..." : "Save Billing Periods & Add-ons"}
            </Button>
          </div>

        </CardContent>
      </Card>

    </motion.div>
  );
}
