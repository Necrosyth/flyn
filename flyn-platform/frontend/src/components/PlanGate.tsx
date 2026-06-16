import { ReactNode, useState, ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { usePlan, FeatureKey, PLANS } from "@/contexts/PlanContext";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/UpgradeModal";

interface PlanGateProps {
  feature: FeatureKey;
  children: ReactNode;
}

/**
 * Wraps any page/section.
 * If the tenant is not entitled to the feature, renders a full-height upgrade wall
 * instead of the children. No partial rendering — either full access or full block.
 */
/**
 * HOC that gates an entire page component behind a plan feature.
 * The wrapped component never renders (hooks never run) when not entitled.
 * Usage: export default withPlanGate("ai.marketing")(MyPage);
 */
export function withPlanGate<P extends object>(feature: FeatureKey) {
  return function gate(Wrapped: ComponentType<P>): ComponentType<P> {
    const Gated = (props: P) => (
      <PlanGate feature={feature}>
        <Wrapped {...props} />
      </PlanGate>
    );
    Gated.displayName = `PlanGate(${Wrapped.displayName ?? Wrapped.name})`;
    return Gated;
  };
}

export const PlanGate = ({ feature, children }: PlanGateProps) => {
  const { isEntitled, getRequiredPlanForFeature, featuresLoaded } = usePlan();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  // Show a neutral skeleton while the first /entitlements/me request is in flight.
  // Without this, every gated page would flash the upgrade wall on cold load.
  if (!featuresLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isEntitled(feature)) return <>{children}</>;

  const requiredPlan = getRequiredPlanForFeature(feature);
  const planInfo = requiredPlan ? PLANS[requiredPlan] : PLANS.GROWTH;

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 py-24 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Lock className="h-7 w-7 text-primary" />
        </div>

        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-semibold tracking-tight">
            {planInfo.name} feature
          </h2>
          <p className="text-muted-foreground">
            This feature is available on the{" "}
            <span className="font-medium text-foreground">{planInfo.name}</span> plan
            {planInfo.price !== null ? ` ($${planInfo.price}/mo)` : ""} and above.
            Upgrade to unlock it for your workspace.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => navigate("/settings/billing")}
          >
            View Plans
          </Button>
          <Button
            className="flyn-button-gradient gap-2"
            onClick={() => setShowModal(true)}
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to {planInfo.name}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <UpgradeModal
        open={showModal}
        onOpenChange={setShowModal}
        featureKey={feature}
        requiredPlan={requiredPlan ?? undefined}
      />
    </>
  );
};
