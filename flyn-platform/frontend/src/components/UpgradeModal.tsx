import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlan, PlanTier, PLANS, FeatureKey } from "@/contexts/PlanContext";
import { Check, Sparkles, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureKey?: FeatureKey;
  requiredPlan?: PlanTier;
}

export const UpgradeModal = ({ open, onOpenChange, featureKey, requiredPlan }: UpgradeModalProps) => {
  const { currentPlan, upgradePlan, getRequiredPlanForFeature } = usePlan();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const targetPlan = requiredPlan || (featureKey ? getRequiredPlanForFeature(featureKey) : "GROWTH");
  const planInfo = targetPlan ? PLANS[targetPlan] : PLANS.GROWTH;

  const handleUpgrade = (plan: PlanTier) => {
    upgradePlan(plan);
    onOpenChange(false);
    navigate("/settings/billing");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{t("upgrade.upgradeTo", { plan: planInfo.name })}</DialogTitle>
          <DialogDescription className="text-center">
            {t("upgrade.featureAvailableOn", { plan: planInfo.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t("upgrade.planName", { plan: planInfo.name })}</span>
              {planInfo.price !== null ? (
                <span className="text-2xl font-bold">${planInfo.price}<span className="text-sm text-muted-foreground">{t("billing.perMonth")}</span></span>
              ) : (
                <span className="text-sm text-muted-foreground">{t("upgrade.customPricing")}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{planInfo.description}</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {t("upgrade.liveMessaging")}</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {t("upgrade.aiAutomation")}</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {t("upgrade.advancedAnalytics")}</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t("upgrade.maybeLater")}
            </Button>
            <Button className="flex-1 flyn-button-gradient" onClick={() => handleUpgrade(targetPlan || "GROWTH")}>
              <Zap className="h-4 w-4 mr-2" />
              {t("upgrade.upgradeNow")}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            {t("upgrade.noCharges")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
