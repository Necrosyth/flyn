import { PaymentGatewayType } from '../billing.types';

export type Region = 'africa' | 'middle_east' | 'global';

/**
 * Full set of African ISO-3166-1 alpha-2 country codes supported by Flutterwave.
 * Source: https://developer.flutterwave.com/docs/integration-guides/currencies
 */
export const AFRICA_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'NG', // Nigeria
  'GH', // Ghana
  'KE', // Kenya
  'UG', // Uganda
  'TZ', // Tanzania
  'ZA', // South Africa
  'RW', // Rwanda
  'CI', // Côte d'Ivoire
  'SN', // Senegal
  'CM', // Cameroon
  'ZM', // Zambia
  'MZ', // Mozambique
  'ET', // Ethiopia
  'MU', // Mauritius
  'BJ', // Benin
  'ML', // Mali
  'BF', // Burkina Faso
  'TG', // Togo
  'NE', // Niger
  'CD', // DR Congo
  'MG', // Madagascar
  'AO', // Angola
  'BI', // Burundi
  'DJ', // Djibouti
  'ER', // Eritrea
  'GM', // Gambia
  'GN', // Guinea
  'GQ', // Equatorial Guinea
  'GW', // Guinea-Bissau
  'LS', // Lesotho
  'LR', // Liberia
  'MW', // Malawi
  'MR', // Mauritania
  'NA', // Namibia
  'SL', // Sierra Leone
  'SO', // Somalia
  'SS', // South Sudan
  'SD', // Sudan
  'SZ', // Eswatini
  'ZW', // Zimbabwe
  'CF', // Central African Republic
  'TD', // Chad
  'CG', // Republic of Congo
  'CV', // Cape Verde
  'KM', // Comoros
  'GA', // Gabon
  'GE', // Georgia (edge case — keep Africa-only)
  'SC', // Seychelles
  'ST', // São Tomé and Príncipe
  'TN', // Tunisia
  'MA', // Morocco
  'DZ', // Algeria
  'LY', // Libya
]);

/**
 * GCC / MENA region country codes supported by Ziina.
 * Source: https://ziina.com
 */
export const MIDDLE_EAST_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'AE', // United Arab Emirates
  'SA', // Saudi Arabia
  'BH', // Bahrain
  'KW', // Kuwait
  'OM', // Oman
  'QA', // Qatar
  'JO', // Jordan
  'LB', // Lebanon
  'IQ', // Iraq
  'YE', // Yemen
  'PS', // Palestine
  'SY', // Syria
]);

export interface RegionConfig {
  region: Region;
  /** Default billing currency (ISO 4217) for this region. */
  defaultCurrency: string;
  gateway: PaymentGatewayType;
}

export const REGION_CONFIG_MAP: Readonly<Record<Region, RegionConfig>> = {
  africa: {
    region: 'africa',
    defaultCurrency: 'NGN',
    gateway: 'flutterwave',
  },
  middle_east: {
    region: 'middle_east',
    defaultCurrency: 'AED',
    gateway: 'ziina',
  },
  global: {
    region: 'global',
    defaultCurrency: 'USD',
    gateway: 'stripe',
  },
};
