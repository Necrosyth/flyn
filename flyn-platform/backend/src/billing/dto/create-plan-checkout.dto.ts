import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreatePlanCheckoutDto {
  @IsString()
  planId: string;

  @IsIn(['monthly', 'yearly'])
  billingInterval: 'monthly' | 'yearly';

  @IsOptional()
  @IsUrl()
  successUrl?: string;

  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}
