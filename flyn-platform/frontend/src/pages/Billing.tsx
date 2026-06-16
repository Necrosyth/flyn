import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, CreditCard, Zap, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { useUsage, type UsageMetricKey } from "@/contexts/UsageContext";
import { useWallet } from "@/contexts/WalletContext";
import { billingService, type PaymentRecord, type SubscriptionRecord } from "@/services/billing";
import { getAllPublicPlans, type PlanDefinition } from "@/services/plansApi";

// Strip billing-interval suffixes that may exist in period-specific Firestore docs
// e.g. "growth_month" → "growth", "professional_yearly" → "professional"
const normalizePlanId = (id: string) =>
  id.replace(/_(monthly?|yearly?)$/i, '').toLowerCase();

const USAGE_METRIC_LABELS: Record<UsageMetricKey, string> = {
  "messages.sent": "Messages Sent",
  "calls.minutes": "Call Minutes",
  "ai.tokens": "AI Tokens",
  "webchat.sessions": "Webchat Sessions",
  "storage.gb": "Storage (GB)",
  "whatsapp.conversations": "WhatsApp Conversations",
};

// Format a dollar amount (not cents) as currency string
const formatPlanPrice = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
};

const Billing = () => {
  const { user } = useAuth();
  const { currentPlan, getPlanInfo, refreshPlan } = usePlan();
  const { counters, getUsagePercentage, getThresholdStatus } = useUsage();
  const { balance: walletBalance, loading: isLoadingWallet } = useWallet();
  const location = useLocation();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [addCreditsAmount, setAddCreditsAmount] = useState<number>(10);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");

  const planInfo = getPlanInfo(currentPlan);
  const { t } = useTranslation();
  const { toast } = useToast();

  // Handle ?subscribed=true and ?cancelled=true from Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get("subscribed") === "true") {
      window.history.replaceState({}, document.title, window.location.pathname);
      toast({ title: "Subscription activated!", description: "Your plan has been upgraded. It may take a moment to reflect." });
      refreshPlan().catch(() => {});
      return;
    }

    if (params.get("cancelled") === "true") {
      window.history.replaceState({}, document.title, window.location.pathname);
      toast({ title: "Checkout cancelled", description: "No charge was made. You can try again anytime." });
      return;
    }

    // Handle preset credits purchase from website builder
    const creditsPurchase = params.get("creditsPurchase");
    const cost = params.get("cost");
    if (creditsPurchase && cost) {
      const credits = parseInt(creditsPurchase);
      const amount = parseFloat(cost);
      if (!isNaN(credits) && !isNaN(amount)) {
        handleBuyCredits(credits, "US", "USD");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Active usage metrics (limit > 0 only)
  const activeCounters = useMemo(
    () => counters.filter((c) => c.limit > 0),
    [counters],
  );

  // Plans sorted by position field from plan_definitions (live admin data)
  // If Firestore has billing-period-specific docs (e.g. "growth_month", "growth_year"),
  // filter to only show plans matching the current billingInterval.
  const displayPlans = useMemo((): PlanDefinition[] => {
    if (!plans.length) return [];
    const fallbackOrder = ["free", "starter", "growth", "professional", "enterprise"];

    const hasPeriodSpecific = plans.some(p => (p as any).billing_period);
    const filtered = hasPeriodSpecific
      ? plans.filter(p => {
          const bp: string | undefined = (p as any).billing_period;
          return !bp || bp === billingInterval;
        })
      : plans;

    return [...filtered].sort((a, b) => {
      if (a.position != null && b.position != null) return a.position - b.position;
      return fallbackOrder.indexOf(normalizePlanId(a.id)) - fallbackOrder.indexOf(normalizePlanId(b.id));
    });
  }, [plans, billingInterval]);

  // Load live plan definitions from admin-managed collection
  useEffect(() => {
    const load = async () => {
      setIsLoadingPlans(true);
      try {
        const list = await getAllPublicPlans();
        setPlans(list || []);
      } catch {
        setPlans([]);
      } finally {
        setIsLoadingPlans(false);
      }
    };
    load();
  }, []);

  // Default selection to current plan once plans are loaded
  useEffect(() => {
    if (!selectedPlanId && displayPlans.length > 0) {
      const match = displayPlans.find(p => normalizePlanId(p.id) === normalizePlanId(currentPlan));
      setSelectedPlanId(match ? match.id : displayPlans[0].id);
    }
  }, [displayPlans, selectedPlanId, currentPlan]);

  // When billing interval toggles, re-select the equivalent plan for the new interval
  useEffect(() => {
    if (!selectedPlanId || !displayPlans.length) return;
    const alreadyVisible = displayPlans.some(p => p.id === selectedPlanId);
    if (!alreadyVisible) {
      const base = normalizePlanId(selectedPlanId);
      const match = displayPlans.find(p => normalizePlanId(p.id) === base);
      setSelectedPlanId(match ? match.id : displayPlans[0].id);
    }
  }, [billingInterval, displayPlans, selectedPlanId]);

  const loadPayments = async () => {
    setIsLoadingPayments(true);
    try {
      const list = await billingService.listPayments();
      setPayments(list || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load payments";
      toast({ title: "Unable to load payments", description: msg, variant: "destructive" });
      setPayments([]);
    } finally {
      setIsLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadPayments();
    // Load current subscription
    (async () => {
      try {
        const sub = await billingService.getCurrentSubscription();
        setSubscription(sub);
      } catch {
        // No active subscription
        setSubscription(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isCurrentPlan = (planId: string) =>
    normalizePlanId(planId) === normalizePlanId(currentPlan);

  const handleUpgrade = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Not signed in", description: "Please log in to manage billing." });
      return;
    }

    const plan = displayPlans.find((p) => p.id === selectedPlanId);
    if (!plan) {
      toast({ variant: "destructive", title: "Plan not found", description: "Please select a plan to continue." });
      return;
    }

    setIsSubscribing(true);
    try {
      const res = await billingService.planCheckout({
        planId: plan.id.toLowerCase(),
        billingInterval,
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        toast({ title: "Redirecting...", description: "Taking you to checkout." });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unable to start checkout";
      let msg = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.statusCode === 409 || parsed.error === "Conflict") {
          msg = "Plan not yet configured for payments. Please contact support.";
        } else if (parsed.message) {
          msg = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message;
        }
      } catch { /* not JSON — use raw */ }
      toast({ variant: "destructive", title: "Upgrade failed", description: msg });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleRemovePlan = async () => {
    if (!user || user.role !== "owner") {
      toast({ variant: "destructive", title: "Permission denied", description: "Only the owner can remove plans." });
      return;
    }

    if (!subscription?.gatewaySubscriptionId) {
      toast({ variant: "destructive", title: "No subscription found", description: "No active subscription to remove." });
      return;
    }

    if (!window.confirm(`Are you sure you want to cancel your ${currentPlan} plan? You'll downgrade to the free plan.`)) {
      return;
    }

    setIsSubscribing(true);
    try {
      await billingService.cancelSubscription(subscription.gatewaySubscriptionId);
      toast({ title: "Plan removed", description: "You've been downgraded to the free plan." });
      await refreshPlan();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to remove plan";
      toast({ variant: "destructive", title: "Removal failed", description: msg });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleViewAllInvoices = async () => {
    await loadPayments();
    toast({ title: "Payments refreshed", description: "Showing latest payment records." });
  };

  const handleEditPayment = async () => {
    if (!user) return;
    setIsSubscribing(true);
    try {
      const res = await billingService.createCheckout({
        tenantId: user.organizationId || user.id,
        amount: 100,
        currency: "usd",
        countryCode: "US",
        description: "Payment Method Verification",
        customerEmail: user.email || "",
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      });
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        toast({ title: "Payment method", description: "Redirecting to billing portal..." });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to open billing portal",
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleBuyCredits = async (credits: number, countryCode: string, currency: string) => {
    if (!user) return;
    setIsSubscribing(true);
    try {
      const res = await billingService.topUpWallet({
        credits,
        countryCode,
        currency: currency.toLowerCase(),
      });
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        toast({ title: "Checkout", description: "Redirecting to payment..." });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start checkout",
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  const getPlanDisplayPrice = (plan: PlanDefinition): { label: string; sub: string } | null => {
    const monthly = plan.pricing?.monthly ?? 0;
    const yearly = plan.pricing?.yearly ?? 0;
    const currency = plan.pricing?.currency ?? "USD";

    if (normalizePlanId(plan.id) === "enterprise") return null; // Custom
    if (monthly === 0) return { label: "Free", sub: "" };

    if (billingInterval === "yearly" && yearly > 0) {
      const perMonth = Math.round(yearly / 12);
      return { label: formatPlanPrice(perMonth, currency), sub: "/mo (billed yearly)" };
    }
    return { label: formatPlanPrice(monthly, currency), sub: "/mo" };
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-foreground">{t("billing.title")}</h1>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.location.href = "/#pricing"}
          >
            <TrendingUp className="h-4 w-4" />
            Compare Plans
          </Button>
        </motion.div>

        {/* Main Grid - 2x2 Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subscription Card - Full Width at Top */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2"
          >
            <Card className="border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{t("billing.subscription")}</h2>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1 border">
                    <button
                      onClick={() => setBillingInterval("monthly")}
                      className={`text-xs font-medium px-2 py-1 rounded-full transition-all ${billingInterval === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setBillingInterval("yearly")}
                      className={`text-xs font-medium px-2 py-1 rounded-full transition-all ${billingInterval === "yearly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                    >
                      Yearly
                      <span className="ml-1 text-[10px] text-primary font-bold"> -20%</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {isLoadingPlans
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="p-3 rounded-xl border-2 border-border h-20 animate-pulse bg-muted/30" />
                      ))
                    : displayPlans.map((plan) => {
                        const price = getPlanDisplayPrice(plan);
                        const isCurrent = isCurrentPlan(plan.id);
                        const isSelected = selectedPlanId === plan.id;
                        return (
                          <button
                            key={plan.id}
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`min-w-0 p-3 rounded-xl border-2 transition-all text-center relative ${
                              isSelected
                                ? "border-primary bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            {isCurrent && (
                              <span className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${isSelected ? "bg-white/20 border-white/30 text-white" : "bg-primary/10 border-primary/30 text-primary"}`}>
                                CURRENT
                              </span>
                            )}
                            <div className={`text-sm font-medium truncate ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                              {plan.name || "Plan"}
                            </div>
                            <div className={`text-lg font-bold mt-1 ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                              {price === null ? (
                                <span className="text-base">Custom</span>
                              ) : price.label === "Free" ? (
                                <span className="text-base">Free</span>
                              ) : (
                                <>
                                  {price.label}
                                  <span className={`text-xs font-normal ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                    {price.sub}
                                  </span>
                                </>
                              )}
                            </div>
                          </button>
                        );
                      })}
                </div>

                <div className="space-y-3">
                  {normalizePlanId(selectedPlanId) === "enterprise" ? (
                    <Button
                      className="w-full flyn-button-gradient"
                      onClick={() => window.open("mailto:sales@myflynai.com?subject=Enterprise%20Plan%20Inquiry", "_blank")}
                    >
                      Contact Sales
                    </Button>
                  ) : (
                    <Button
                      className="w-full flyn-button-gradient"
                      onClick={handleUpgrade}
                      disabled={isSubscribing || isLoadingPlans || !selectedPlanId || isCurrentPlan(selectedPlanId)}
                    >
                      {isSubscribing
                        ? "Processing..."
                        : isCurrentPlan(selectedPlanId)
                        ? "Current Plan"
                        : t("billing.upgradePlan")}
                    </Button>
                  )}
                  {user?.role === "owner" && !isCurrentPlan("free") && subscription && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleRemovePlan}
                      disabled={isSubscribing}
                    >
                      {isSubscribing ? "Processing..." : "Remove Plan"}
                    </Button>
                  )}
                </div>

                {subscription ? (
                  <div className="text-xs text-muted-foreground mt-3">
                    <div>Subscription: {subscription.status}</div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>

          {/* Invoices Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{t("billing.invoices")}</h2>
                  <button className="text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={handleViewAllInvoices}>
                    {t("common.viewAll")}
                  </button>
                </div>

                <table className="w-full">
                  <thead>
                    <tr className="text-sm text-muted-foreground">
                      <th className="text-left pb-3 font-medium">{t("billing.invoiceId")}</th>
                      <th className="text-left pb-3 font-medium">{t("billing.date")}</th>
                      <th className="text-right pb-3 font-medium">{t("billing.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingPayments ? (
                      <tr className="border-t">
                        <td className="py-3 text-sm text-muted-foreground" colSpan={3}>Loading...</td>
                      </tr>
                    ) : payments.length === 0 ? (
                      <tr className="border-t">
                        <td className="py-3 text-sm text-muted-foreground" colSpan={3}>No payments found.</td>
                      </tr>
                    ) : (
                      payments.slice(0, 5).map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="py-3 text-sm font-medium">{p.id}</td>
                          <td className="py-3 text-sm text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-right">
                            <Badge
                              variant={p.status === "successful" ? "outline" : p.status === "pending" ? "secondary" : "destructive"}
                              className={p.status === "successful" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : ""}
                            >
                              {p.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </motion.div>

          {/* FLYN Wallet Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border bg-gradient-to-br from-primary/5 to-primary/10">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">FLYN Wallet</h2>
                      <p className="text-xs text-muted-foreground mt-1">Unified credits for all features</p>
                    </div>
                  </div>
                </div>

                <div className="bg-background/60 rounded-lg p-4 mb-4 border border-border/50">
                  <div className="text-sm text-muted-foreground mb-2">Current Balance</div>
                  <div className="text-3xl font-bold text-primary">
                    {isLoadingWallet ? "..." : walletBalance?.balance ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">$1 = 1 credit</div>
                </div>

                <div className="space-y-3 mb-4">
                  <p className="text-sm text-muted-foreground">Quick add:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { credits: 10, price: 10 },
                      { credits: 25, price: 25 },
                      { credits: 50, price: 50 },
                      { credits: 100, price: 100 },
                    ].map((pkg) => (
                      <button
                        key={pkg.credits}
                        onClick={() => handleBuyCredits(pkg.credits, "US", "USD")}
                        disabled={isSubscribing}
                        className="p-2 rounded-lg border border-border/50 hover:bg-background/80 hover:border-primary/50 transition-all text-left text-xs"
                      >
                        <div className="font-semibold text-foreground">{pkg.credits}</div>
                        <div className="text-muted-foreground text-[10px]">${pkg.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-xs text-muted-foreground block mb-2">Custom amount:</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Enter credits"
                      onChange={(e) => setAddCreditsAmount(parseInt(e.target.value) || 1)}
                      className="flex-1 px-3 py-2 rounded-lg border border-border/50 bg-background/60 text-sm text-foreground"
                    />
                    <Button
                      size="sm"
                      className="flyn-button-gradient"
                      onClick={() => handleBuyCredits(addCreditsAmount, "US", "USD")}
                      disabled={isSubscribing || addCreditsAmount < 1}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <Button
                  className="w-full flyn-button-gradient"
                  onClick={() => handleBuyCredits(10, "US", "USD")}
                  disabled={isSubscribing}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {isSubscribing ? "Processing..." : "Top Up Wallet"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Plan Overview / Usage Card - Full Width */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="lg:col-span-2"
          >
            <Card className="border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{t("billing.usage")}</h2>
                  <Badge variant="outline" className="text-primary border-primary/40 bg-primary/5 font-semibold">
                    {planInfo.name} Plan
                  </Badge>
                </div>

                {activeCounters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                    <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No usage data yet for this period.</p>
                    <Button
                      size="sm"
                      className="flyn-button-gradient mt-1"
                      onClick={() => {
                        const next = displayPlans.find(
                          (p) => p.id.toLowerCase() !== currentPlan.toLowerCase(),
                        );
                        if (next) setSelectedPlanId(next.id);
                      }}
                    >
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                      Upgrade Plan
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeCounters.map((counter) => {
                      const pct = getUsagePercentage(counter.metricKey as UsageMetricKey);
                      const threshold = getThresholdStatus(counter.metricKey as UsageMetricKey);
                      const label = USAGE_METRIC_LABELS[counter.metricKey as UsageMetricKey] ?? counter.metricKey;

                      const barColor =
                        threshold === "LIMIT" || threshold === "CRITICAL"
                          ? "bg-destructive"
                          : threshold === "WARNING"
                          ? "bg-amber-500"
                          : undefined;

                      return (
                        <div key={counter.metricKey}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-muted-foreground">{label}</span>
                            <span
                              className={
                                threshold === "LIMIT" || threshold === "CRITICAL"
                                  ? "text-sm font-medium text-destructive"
                                  : threshold === "WARNING"
                                  ? "text-sm font-medium text-amber-500"
                                  : "text-sm font-medium text-foreground"
                              }
                            >
                              {counter.used.toLocaleString()} / {counter.limit.toLocaleString()}
                            </span>
                          </div>
                          <Progress value={pct} className="h-1.5" indicatorClassName={barColor} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Payment Method Card - Full Width at Bottom */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2"
          >
            <Card className="border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{t("billing.paymentMethod")}</h2>
                  <button className="text-sm text-primary hover:underline transition-colors" onClick={handleEditPayment}>
                    {t("common.edit")}
                  </button>
                </div>

                <button onClick={handleEditPayment} className="w-full flex items-center justify-between p-4 rounded-xl border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Manage via billing portal</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Billing;
