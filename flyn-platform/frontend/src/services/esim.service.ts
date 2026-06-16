import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ─── Types ───────────────────────────────────────────────────────

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

export interface EsimPackageDetail {
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
  coverage: {
    country_name: string;
    code: string;
    iso: string;
    country_image_url: string;
    network_name: string;
    supported_networks_coverages: string[];
  }[];
  unlimited: boolean;
  tether: boolean;
  connectivity: string;
  activation_type: string;
  activation_type_description: string;
  other_info: string;
}

interface PaginatedResponse<T> {
  status: boolean;
  data: T[];
  total: number;
  page: number;
  lastPage: number;
}

// ─── Service ─────────────────────────────────────────────────────

export const esimService = {
  /**
   * Get all countries with eSIM coverage
   * @param region - optional region filter (Americas, Europe, Asia, etc.)
   */
  getCountries: async (region?: string): Promise<EsimCountry[]> => {
    const params: Record<string, string> = {};
    if (region && region !== 'All') params.region = region;
    const { data } = await axios.get(`${API_URL}/api/esim/countries`, { params });
    return data.data;
  },

  /**
   * Get available regions
   */
  getRegions: async (): Promise<string[]> => {
    const { data } = await axios.get(`${API_URL}/api/esim/regions`);
    return data.data;
  },

  /**
   * Get packages for a specific country
   */
  getPackagesByCountry: async (
    countryCode: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<EsimPackageSummary>> => {
    const { data } = await axios.get(
      `${API_URL}/api/esim/packages/country/${countryCode}`,
      { params: { page, limit } },
    );
    return data;
  },

  /**
   * Get popular/featured packages
   */
  getPopularPackages: async (limit = 6): Promise<EsimPackageSummary[]> => {
    const { data } = await axios.get(`${API_URL}/api/esim/packages/popular`, {
      params: { limit },
    });
    return data.data;
  },

  /**
   * Search packages by country name or keyword
   */
  searchPackages: async (
    query: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<EsimPackageSummary>> => {
    const { data } = await axios.get(`${API_URL}/api/esim/packages/search`, {
      params: { q: query, page, limit },
    });
    return data;
  },

  /**
   * Get full details of a single package
   */
  getPackageDetails: async (id: string): Promise<EsimPackageDetail> => {
    const { data } = await axios.get(`${API_URL}/api/esim/packages/${id}`);
    return data.data;
  },
};
