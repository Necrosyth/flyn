import { IsEmail, IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';

export class CreateSubscriptionDto {
  /**
   * Internal tenant ID (from Firebase custom claims).
   * Validated server-side against the authenticated token; not trusted from body.
   */
  @IsString()
  tenantId: string;

  /** Internal plan ID (Firestore document ID). */
  @IsString()
  planId: string;

  /**
   * ISO 3166-1 alpha-2 country code stored on the tenant at onboarding.
   * Used to resolve the billing region and select the appropriate gateway.
   */
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code' })
  countryCode: string;

  /** Customer email for gateway customer creation / lookup. */
  @IsEmail()
  email: string;

  /** URL to redirect the user after successful payment. */
  @IsOptional()
  @IsUrl()
  successUrl?: string;

  /** URL to redirect the user on payment cancellation. */
  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}
