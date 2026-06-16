import { SetMetadata } from '@nestjs/common';
import { PlanFeature } from '../plan-entitlements';

export const FEATURE_KEY = 'plan_feature';
export const RequiresFeature = (feature: PlanFeature) => SetMetadata(FEATURE_KEY, feature);
