import { ReactNode, useState } from "react";
import { usePlan, FeatureKey, PlanTier } from "@/contexts/PlanContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

interface FeatureGateProps {
  featureKey: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
  showLockIcon?: boolean;
  className?: string;
}

export const FeatureGate = ({
  featureKey,
  children,
  fallback,
  showLockIcon = true,
  className
}: FeatureGateProps) => {
  const { isEntitled, getRequiredPlanForFeature, currentPlan } = usePlan();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { t } = useTranslation();

  const isEnabled = isEntitled(featureKey);
  const requiredPlan = getRequiredPlanForFeature(featureKey);

  if (isEnabled) {
    return <>{children}</>;
  }

  // Show fallback or locked version
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowUpgrade(true);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn("relative cursor-pointer", className)}
            onClick={handleClick}
          >
            {/* Dimmed children or fallback */}
            <div className="opacity-50 pointer-events-none">
              {fallback || children}
            </div>

            {/* Lock overlay */}
            {showLockIcon && (
              <div className="absolute top-1 right-1 p-1 bg-background/80 rounded-full">
                <Lock className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("sidebar.availableOn", { plan: requiredPlan })}</p>
        </TooltipContent>
      </Tooltip>

      <UpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        featureKey={featureKey}
        requiredPlan={requiredPlan || undefined}
      />
    </>
  );
};

// Hook for programmatic feature gating
export const useFeatureGate = (featureKey: FeatureKey) => {
  const { isEntitled, getRequiredPlanForFeature, isSandboxMode } = usePlan();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const isEnabled = isEntitled(featureKey);
  const requiredPlan = getRequiredPlanForFeature(featureKey);

  const gate = (callback: () => void) => {
    if (isEnabled) {
      callback();
    } else {
      setShowUpgrade(true);
    }
  };

  return {
    isEnabled,
    requiredPlan,
    isSandbox: isSandboxMode(),
    gate,
    showUpgrade,
    setShowUpgrade,
  };
};
