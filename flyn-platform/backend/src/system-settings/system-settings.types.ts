export interface StripeConfig {
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  isEnabled: boolean;
}

export interface SystemSettings {
  stripe: StripeConfig;
  platformName: string;
  supportEmail: string;
  updatedAt: number;
}
