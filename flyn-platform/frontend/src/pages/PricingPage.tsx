import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, X, CalendarDays, Info, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { getAllPublicPlans, getPublicSchema } from "@/services/plansApi";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { PlanDefinition, PricingTableSchema, BillingPeriodConfig, AddOnDef } from "@/services/plansApi";

// ─── Billing period config ───────────────────────────────────────────────────

type PeriodKey = "monthly" | "quarterly" | "biannual" | "annual";

const PERIOD_META: Record<PeriodKey, { label: string; months: number }> = {
  monthly:   { label: "Monthly",  months: 1  },
  quarterly: { label: "3 months", months: 3  },
  biannual:  { label: "6 months", months: 6  },
  annual:    { label: "Annual",   months: 12 },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyDiscount(base: number, discount: number): number {
  return parseFloat((base * (1 - discount / 100)).toFixed(2));
}

function splitPrice(price: number): { whole: string; cents: string } {
  const [w, c] = price.toFixed(2).split(".");
  return { whole: w, cents: c === "00" ? "" : c };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckIcon({ highlighted }: { highlighted?: boolean }) {
  return (
    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mx-auto ${highlighted ? "bg-primary" : "bg-primary"}`}>
      <Check className="w-3 h-3 text-white stroke-[3]" />
    </div>
  );
}

function CrossIcon() {
  return (
    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/25 flex items-center justify-center shrink-0 mx-auto">
      <X className="w-2.5 h-2.5 text-muted-foreground/40 stroke-[2.5]" />
    </div>
  );
}

interface AddOnCardProps {
  icon: React.ElementType;
  label: string;
  basePrice: number;
  discount: number;
  months: number;
  availableOn: string;
  features: string[];
  isSelected?: boolean;
  onToggle?: () => void;
  isLoading?: boolean;
}

function AddOnCard({ icon: Icon, label, basePrice, discount, months, availableOn, features, isSelected, onToggle, isLoading }: AddOnCardProps) {
  const effectivePrice = applyDiscount(basePrice, discount);
  const { whole, cents } = splitPrice(effectivePrice);
  const totalBilled = months > 1 ? Math.round(effectivePrice * months) : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground">{label}</h3>
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-4">
        <Info className="w-3 h-3 shrink-0" />
        {availableOn}
      </p>

      {/* Price */}
      <div className="flex items-start gap-0 mb-5">
        <span className="text-xl font-bold pt-1 text-foreground">$</span>
        <span className="text-4xl font-bold leading-none text-foreground">{whole}</span>
        {cents && <span className="text-lg font-bold pt-1 text-foreground">.{cents}</span>}
        <span className="text-sm self-end mb-0.5 ml-0.5 text-muted-foreground">/mo</span>
        {totalBilled && (
          <span className="self-end mb-0.5 ml-2 text-xs text-muted-foreground">
            · ${totalBilled} every {months} mo
          </span>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-1.5 mb-5">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 bg-primary">
              <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
            </div>
            {f}
          </li>
        ))}
      </ul>

      {/* Action button */}
      {onToggle && (
        <Button
          onClick={onToggle}
          disabled={isLoading}
          variant={isSelected ? "default" : "outline"}
          className="w-full"
        >
          {isLoading ? "Processing..." : isSelected ? "Remove Add-on" : "Add Add-on"}
        </Button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PricingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("monthly");
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [schema, setSchema] = useState<PricingTableSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOnLoading, setAddOnLoading] = useState<string | null>(null);

  const handleAddOnClick = async (addonName: string) => {
    if (!user) {
      toast({ description: "Please log in to manage add-ons" });
      navigate("/login");
      return;
    }
    setAddOnLoading(addonName);
    // Redirect to billing page with add-on selection
    navigate(`/settings/billing?addon=${encodeURIComponent(addonName)}`);
  };

  useEffect(() => {
    Promise.all([
      getAllPublicPlans().catch(() => []),
      getPublicSchema().catch(() => null),
    ]).then(([plansData, schemaData]) => {
      setPlans(plansData);
      if (schemaData) setSchema(schemaData);
      setLoading(false);
    });
  }, []);

  // Resolve period configs (merge schema over defaults)
  const periodsConfig: Record<PeriodKey, BillingPeriodConfig> = {
    monthly:   { ...DEFAULT_PERIODS.monthly,   ...(schema?.billingPeriods?.monthly   ?? {}) },
    quarterly: { ...DEFAULT_PERIODS.quarterly, ...(schema?.billingPeriods?.quarterly ?? {}) },
    biannual:  { ...DEFAULT_PERIODS.biannual,  ...(schema?.billingPeriods?.biannual  ?? {}) },
    annual:    { ...DEFAULT_PERIODS.annual,    ...(schema?.billingPeriods?.annual    ?? {}) },
  };

  // A period is only shown if it's enabled AND at least one plan has a Stripe price ID for it.
  // monthly/annual use the existing stripeMonthlyPriceId/stripeYearlyPriceId.
  // quarterly/biannual need a stripeQuarterlyPriceId/stripeBiannualPriceId — not yet in plans,
  // so they're hidden until those IDs are added to plan definitions in Stripe.
  const periodHasStripeIds = (k: PeriodKey): boolean => {
    if (k === "monthly") return true;
    if (k === "annual")  return true;
    if (k === "quarterly") return plans.some(p => (p.pricing as any)?.stripeQuarterlyPriceId);
    if (k === "biannual")  return plans.some(p => (p.pricing as any)?.stripeBiannualPriceId);
    return false;
  };
  const enabledPeriods = PERIOD_ORDER.filter(k => periodsConfig[k].enabled && periodHasStripeIds(k));

  // Auto-correct selectedPeriod if it gets disabled
  const activePeriod: PeriodKey = enabledPeriods.includes(selectedPeriod)
    ? selectedPeriod
    : (enabledPeriods[0] ?? "monthly");

  const discount = periodsConfig[activePeriod].discount;
  const months   = PERIOD_META[activePeriod].months;

  // Resolve add-on configs
  const essentialCfg: Required<AddOnDef> = {
    ...DEFAULT_ADDON_ESSENTIAL,
    ...(schema?.addOns?.essential ?? {}),
    features: schema?.addOns?.essential?.features ?? DEFAULT_ADDON_ESSENTIAL.features,
  };
  const advancedCfg: Required<AddOnDef> = {
    ...DEFAULT_ADDON_ADVANCED,
    ...(schema?.addOns?.advanced ?? {}),
    features: schema?.addOns?.advanced?.features ?? DEFAULT_ADDON_ADVANCED.features,
  };

  const getCellValue = (
    plan: PlanDefinition,
    catKey: string,
    rowKey: string,
    type: "boolean" | "limit" | "text" | "number" | undefined,
    limitKey?: string,
  ): boolean | string => {
    if (type === "limit" && limitKey) {
      const v = (plan.limits as unknown as Record<string, number>)[limitKey] ?? 0;
      return v >= 999999 ? "Unlimited" : v >= 1000 ? v.toLocaleString() : String(v);
    }
    const cat = (plan.features as Record<string, Record<string, boolean>>)?.[catKey] ?? {};
    return cat[rowKey] === true;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const sorted = [...plans]
    .filter(p => p.name && p.pricing)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-20">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="py-14 lg:py-20">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
                Simple, Transparent Pricing
              </h1>
              <p className="mt-3 text-base text-muted-foreground">
                Everything your business needs — scale at your pace.<br />
                No hidden fees. No surprises. Cancel anytime.
              </p>

              {/* ── Billing period tabs ───────────────────────────────── */}
              {enabledPeriods.length > 1 && (
                <div className="mt-8 inline-flex items-center gap-1 bg-muted rounded-full p-1 border border-border flex-wrap justify-center">
                  {enabledPeriods.map(key => {
                    const meta = PERIOD_META[key];
                    const cfg  = periodsConfig[key];
                    const isSelected = activePeriod === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedPeriod(key)}
                        className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {meta.label}
                        {cfg.discount > 0 && (
                          <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded-full">
                            Save {cfg.discount}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Single period: just show a subtle label */}
              {enabledPeriods.length === 1 && (
                <p className="mt-6 text-sm text-muted-foreground">
                  {PERIOD_META[enabledPeriods[0]].label} billing
                </p>
              )}
            </motion.div>
          </div>
        </section>

        {/* ── Base Plan Cards ───────────────────────────────────────────── */}
        <section className="pb-8">
          <div className="max-w-6xl mx-auto px-4">
            <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-5">Base Plans</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {sorted.map((plan, i) => {
                const baseMo  = plan.pricing?.monthly ?? 0;
                const baseYr  = plan.pricing?.yearly  ?? 0;
                const isCustom = baseMo === 0 && baseYr === 0;
                const isPro   = plan.recommended;
                const cta     = plan.pricing?.ctaText ?? (isCustom ? "Contact Sales" : "Start Free Trial");

                const effectiveMo  = isCustom ? 0 : applyDiscount(baseMo, discount);
                const totalBilled  = (!isCustom && months > 1) ? Math.round(effectiveMo * months) : null;
                const { whole, cents } = isCustom ? { whole: "", cents: "" } : splitPrice(effectiveMo);

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className={`relative rounded-2xl p-6 flex flex-col ${
                      isPro
                        ? "bg-gradient-to-br from-indigo-500 via-purple-600 to-purple-700 text-white shadow-xl shadow-purple-500/20 border-0"
                        : "bg-card border border-border"
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 bg-white text-purple-700 text-xs font-bold px-3 py-1 rounded-full shadow-md">
                          ✦ Most Popular
                        </span>
                      </div>
                    )}

                    <p className={`text-xs font-medium mb-0.5 ${isPro ? "text-white/70" : "text-muted-foreground"}`}>
                      {plan.description}
                    </p>
                    <h2 className={`text-2xl font-bold mb-0.5 ${isPro ? "text-white" : "text-foreground"}`}>
                      {plan.name}
                    </h2>
                    <p className={`text-sm mb-5 ${isPro ? "text-white/60" : "text-muted-foreground"}`}>
                      {plan.tagline}
                    </p>

                    {/* Price */}
                    <div className="mb-6">
                      {isCustom ? (
                        <>
                          <span className={`text-4xl font-bold ${isPro ? "text-white" : "text-foreground"}`}>
                            Contact Sales
                          </span>
                          <p className={`text-xs mt-1 ${isPro ? "text-white/50" : "text-muted-foreground"}`}>
                            Custom pricing for your team
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start gap-0">
                            <span className={`text-2xl font-bold pt-2 ${isPro ? "text-white" : "text-foreground"}`}>$</span>
                            <span className={`text-5xl font-bold leading-none ${isPro ? "text-white" : "text-foreground"}`}>{whole}</span>
                            {cents && (
                              <span className={`text-xl font-bold pt-1 ${isPro ? "text-white/80" : "text-foreground/80"}`}>.{cents}</span>
                            )}
                            <span className={`text-sm self-end mb-0.5 ml-0.5 ${isPro ? "text-white/60" : "text-muted-foreground"}`}>/mo</span>
                          </div>
                          <p className={`text-xs mt-1 ${isPro ? "text-white/50" : "text-muted-foreground"}`}>
                            {totalBilled
                              ? `$${totalBilled} billed every ${months} months`
                              : "Billed monthly"
                            }
                          </p>
                        </>
                      )}
                    </div>

                    {/* Highlights */}
                    <ul className="space-y-2 mb-6 flex-1">
                      {(plan.highlights ?? []).map((h, idx) => (
                        <li key={idx} className={`flex items-center gap-2 text-sm ${isPro ? "text-white/90" : "text-muted-foreground"}`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isPro ? "bg-white" : "bg-green-500"}`} />
                          {h}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <Link to={isCustom ? "/contact" : "/signup"}>
                      <Button
                        className={`w-full font-semibold transition-all ${
                          isPro
                            ? "bg-white text-purple-700 hover:bg-white/90 border-0"
                            : "bg-foreground text-background hover:bg-foreground/90 border-0"
                        }`}
                      >
                        {cta}
                      </Button>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Feature Add-ons ───────────────────────────────────────────── */}
        {(essentialCfg.enabled || advancedCfg.enabled) && (
          <section className="pb-12">
            <div className="max-w-6xl mx-auto px-4">
              <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-5">Feature Add-ons</p>
              <div className="grid md:grid-cols-2 gap-4">
                {essentialCfg.enabled && (
                  <AddOnCard
                    icon={Package}
                    label="Essential Features"
                    basePrice={essentialCfg.basePrice}
                    discount={discount}
                    months={months}
                    availableOn={essentialCfg.availableOn ?? DEFAULT_ADDON_ESSENTIAL.availableOn}
                    features={essentialCfg.features ?? DEFAULT_ADDON_ESSENTIAL.features}
                    onToggle={() => handleAddOnClick("essential")}
                    isLoading={addOnLoading === "essential"}
                  />
                )}
                {advancedCfg.enabled && (
                  <AddOnCard
                    icon={Sparkles}
                    label="Advanced Features"
                    basePrice={advancedCfg.basePrice}
                    discount={discount}
                    months={months}
                    availableOn={advancedCfg.availableOn ?? DEFAULT_ADDON_ADVANCED.availableOn}
                    features={advancedCfg.features ?? DEFAULT_ADDON_ADVANCED.features}
                    onToggle={() => handleAddOnClick("advanced")}
                    isLoading={addOnLoading === "advanced"}
                  />
                )}
              </div>
              <p className="text-xs text-center text-muted-foreground mt-6">
                All prices in USD · Add-ons billed at the same period as your base plan · Advanced Features are bundled into Custom at no extra cost.
              </p>
            </div>
          </section>
        )}

        {/* ── Comparison Table ──────────────────────────────────────────── */}
        {schema && sorted.length > 0 && (
          <section className="py-12">
            <div className="max-w-6xl mx-auto px-4">
              <div className="rounded-2xl border border-border overflow-hidden bg-card">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-6 py-4 font-semibold text-foreground w-56 bg-card">Features</th>
                      {sorted.map(plan => (
                        <th key={plan.id} className={`text-center px-4 py-4 font-bold bg-card ${plan.recommended ? "text-primary" : "text-foreground"}`}>
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(schema.categories ?? [])
                      .sort((a, b) => a.order - b.order)
                      .map(category => (
                        <React.Fragment key={category.key}>
                          <tr>
                            <td colSpan={sorted.length + 1} className="px-6 py-2.5 text-xs font-bold tracking-widest uppercase bg-primary/5 text-primary border-y border-primary/10">
                              {category.label}
                            </td>
                          </tr>
                          {category.features
                            .sort((a, b) => a.order - b.order)
                            .map((row, rowIdx) => (
                              <tr key={row.key} className={`border-b border-border/40 ${rowIdx % 2 === 1 ? "bg-muted/20" : ""}`}>
                                <td className="px-6 py-3 text-foreground font-medium">{row.label}</td>
                                {sorted.map(plan => {
                                  const val = getCellValue(plan, category.key, row.key, row.type, row.limitKey);
                                  return (
                                    <td key={plan.id} className="px-4 py-3 text-center">
                                      {typeof val === "string" ? (
                                        <span className={`font-bold text-sm ${plan.recommended ? "text-primary" : "text-foreground"}`}>{val}</span>
                                      ) : val ? (
                                        <CheckIcon highlighted={plan.recommended} />
                                      ) : (
                                        <CrossIcon />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                        </React.Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Bottom CTA ────────────────────────────────────────────────── */}
        <section className="py-16 bg-foreground">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <CalendarDays className="w-8 h-8 mx-auto mb-4 text-background/70" />
            <h2 className="text-2xl font-bold text-background">Still not sure? Talk to our team.</h2>
            <p className="mt-2 text-background/60 text-sm">We'll help you find the right plan for your business.</p>
            <Link to="/contact" className="mt-6 inline-block">
              <Button className="flyn-button-gradient px-8 mt-4">Schedule a Demo</Button>
            </Link>
          </div>
        </section>

      </main>

      <LandingFooter />
    </div>
  );
};

export default PricingPage;
