import { Injectable } from '@nestjs/common';
import {
  Region,
  RegionConfig,
  AFRICA_COUNTRY_CODES,
  MIDDLE_EAST_COUNTRY_CODES,
  REGION_CONFIG_MAP,
} from './region.types';

@Injectable()
export class RegionDetectorService {
  /**
   * Resolve the billing region for a given ISO-3166-1 alpha-2 country code.
   *
   * Strategy (Option C + A):
   *   The tenant picks a billing country at onboarding; that country code is
   *   stored on the tenant document and passed here.  A static lookup table
   *   (Option A) then maps it to a region, which drives gateway selection.
   *
   * Falls back to 'global' (Stripe) for any unknown / unsupported country.
   */
  resolveRegion(countryCode: string): Region {
    if (!countryCode || typeof countryCode !== 'string') return 'global';

    const code = countryCode.trim().toUpperCase();

    if (AFRICA_COUNTRY_CODES.has(code)) return 'africa';
    if (MIDDLE_EAST_COUNTRY_CODES.has(code)) return 'middle_east';
    return 'global';
  }

  /** Convenience: return the full RegionConfig (gateway + default currency). */
  resolveConfig(countryCode: string): RegionConfig {
    return REGION_CONFIG_MAP[this.resolveRegion(countryCode)];
  }
}
