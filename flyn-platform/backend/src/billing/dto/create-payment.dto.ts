import {
  IsInt,
  IsISO4217CurrencyCode,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePaymentDto {
  /** Internal tenant ID (validated against Firebase token in controller). */
  @IsString()
  tenantId: string;

  /**
   * Amount in the **smallest currency unit**.
   * e.g. 5000 = 50.00 USD | 500000 = 5000.00 NGN | 500 = 5.00 AED
   * Must be a positive integer to prevent floating-point billing errors.
   */
  @IsInt()
  @IsPositive()
  amount: number;

  /** ISO 4217 currency code (USD, NGN, AED …). Validated by class-validator. */
  @IsISO4217CurrencyCode()
  currency: string;

  /**
   * ISO 3166-1 alpha-2 country code.
   * Used to resolve billing region + select the appropriate gateway.
   */
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code' })
  countryCode: string;

  /** Human-readable payment description shown on the checkout page. */
  @IsString()
  @MaxLength(200)
  description: string;

  /** Customer email (required by all gateways). */
  @IsString()
  customerEmail: string;

  /** URL to redirect the customer after successful payment. */
  @IsUrl()
  successUrl: string;

  /** URL to redirect the customer on cancellation. */
  @IsUrl()
  cancelUrl: string;

  /**
   * Optional key-value metadata attached to the payment.
   * Values must be strings; limited keys to prevent abuse.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
