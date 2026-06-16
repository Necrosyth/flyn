// eSIM API types — based on esimcard.com Reseller API

export interface EsimLoginResponse {
  status: boolean;
  access_token: string;
  token_type: string;
  user: {
    id: number;
    name: string;
    email: string;
    balance: number;
  };
}

export interface EsimCoverageNetwork {
  id: number;
  country_name: string;
  code: string; // ISO 2-letter code, e.g. "us"
  iso: string; // ISO 3-letter code, e.g. "usa"
  country_image_url: string;
  network_name: string;
  network_code: string;
  t_2G: boolean;
  th_3G: boolean;
  'for-4G': boolean;
  fiv_5G: boolean;
  supported_networks_coverages: string[];
}

export interface EsimPackage {
  id: string;
  name: string;
  price: number;
  data_quantity: number;
  data_unit: string;
  voice_quantity: number;
  voice_unit: string;
  sms_quantity: number;
  package_validity: number;
  package_validity_unit: string;
  package_type: string;
  banner: string;
  created_at: string;
  updated_at: string;
  coverage: EsimCoverageNetwork[];
  unlimited: boolean;
  tether: boolean;
  other_info: string;
  throttle: boolean;
  connectivity: string;
  activation_type: string;
  activation_type_description: string;
  unthrottle_data: number | null;
  throttle_speed: string | null;
  international_minutes: number;
  international_sms: number;
  network: string;
}

export interface EsimPackagesResponse {
  status: boolean;
  meta: {
    total: number;
    perPage: number;
    currentPage: number;
    lastPage: number;
  };
  data: EsimPackage[];
}

export interface EsimBalanceResponse {
  status: boolean;
  balance: number;
}

// Aggregated country info derived from packages
export interface EsimCountry {
  name: string;
  code: string;
  iso: string;
  imageUrl: string;
  packagesCount: number;
  priceFrom: number;
  networks: string[];
  region: string;
}

// Simplified package for frontend
export interface EsimPackageSummary {
  id: string;
  name: string;
  price: number;
  dataQuantity: number;
  dataUnit: string;
  validity: number;
  validityUnit: string;
  type: string;
  unlimited: boolean;
  tether: boolean;
  connectivity: string;
  countries: string[];
  countryCount: number;
  activationType: string;
  activationDescription: string;
}
