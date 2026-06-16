import { BillingInterval } from '../billing.types';
import { Region } from '../region/region.types';

export interface PlanPricing {
  region: Region;
  currency: string;   // ISO 4217
  amount: number;     // smallest unit (cents for USD, kobo for NGN, fils for AED)
}

export interface PlanGatewayIds {
  stripe?: string;        // Stripe Price ID (price_xxx)
  flutterwave?: string;   // Flutterwave Payment Plan ID (numeric string)
  ziina?: string;         // Ziina Subscription Plan ID
}

export interface Plan {
  id: string;
  name: string;             // e.g. 'Starter', 'Pro', 'Enterprise'
  description: string;
  interval: BillingInterval;
  features: string[];
  isActive: boolean;
  pricing: PlanPricing[];
  gatewayPlanIds: PlanGatewayIds;
  createdAt: number;        // Unix ms
  updatedAt: number;        // Unix ms
}

export interface CreatePlanDto {
  name: string;
  description: string;
  interval: BillingInterval;
  features: string[];
  pricing: PlanPricing[];
  gatewayPlanIds: PlanGatewayIds;
}

//   amount: number;             // in smallest unit (cents/kobo/fils)
// }
