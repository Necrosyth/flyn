import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  EsimLoginResponse,
  EsimPackagesResponse,
  EsimPackage,
  EsimBalanceResponse,
  EsimCountry,
  EsimPackageSummary,
} from './esim.types';

// Country code → region mapping
const REGION_MAP: Record<string, string> = {
  us: 'Americas', ca: 'Americas', mx: 'Americas', br: 'Americas', ar: 'Americas',
  co: 'Americas', cl: 'Americas', pe: 'Americas', ec: 'Americas', ve: 'Americas',
  cr: 'Americas', pa: 'Americas', do: 'Americas', gt: 'Americas', hn: 'Americas',
  jm: 'Americas', tt: 'Americas', pr: 'Americas', bo: 'Americas', py: 'Americas',
  uy: 'Americas', sv: 'Americas', ni: 'Americas', ht: 'Americas', cu: 'Americas',
  gb: 'Europe', fr: 'Europe', de: 'Europe', es: 'Europe', it: 'Europe',
  nl: 'Europe', pt: 'Europe', ch: 'Europe', at: 'Europe', be: 'Europe',
  se: 'Europe', no: 'Europe', dk: 'Europe', fi: 'Europe', ie: 'Europe',
  pl: 'Europe', cz: 'Europe', ro: 'Europe', hu: 'Europe', gr: 'Europe',
  bg: 'Europe', hr: 'Europe', sk: 'Europe', si: 'Europe', lt: 'Europe',
  lv: 'Europe', ee: 'Europe', cy: 'Europe', lu: 'Europe', mt: 'Europe',
  is: 'Europe', al: 'Europe', mk: 'Europe', rs: 'Europe', ba: 'Europe',
  me: 'Europe', xk: 'Europe', md: 'Europe', ua: 'Europe', by: 'Europe',
  tr: 'Europe', ge: 'Europe', am: 'Europe', az: 'Europe',
  jp: 'Asia', kr: 'Asia', cn: 'Asia', tw: 'Asia', hk: 'Asia', mo: 'Asia',
  th: 'Asia', vn: 'Asia', ph: 'Asia', my: 'Asia', sg: 'Asia', id: 'Asia',
  mm: 'Asia', kh: 'Asia', la: 'Asia', bn: 'Asia', in: 'Asia', pk: 'Asia',
  bd: 'Asia', lk: 'Asia', np: 'Asia', mn: 'Asia', kz: 'Asia', uz: 'Asia',
  kg: 'Asia', tj: 'Asia', tm: 'Asia',
  ae: 'Middle East', sa: 'Middle East', qa: 'Middle East', bh: 'Middle East',
  kw: 'Middle East', om: 'Middle East', il: 'Middle East', jo: 'Middle East',
  lb: 'Middle East', iq: 'Middle East', ir: 'Middle East', ye: 'Middle East',
  za: 'Africa', eg: 'Africa', ma: 'Africa', tn: 'Africa', dz: 'Africa',
  ng: 'Africa', ke: 'Africa', gh: 'Africa', tz: 'Africa', ug: 'Africa',
  et: 'Africa', cm: 'Africa', ci: 'Africa', sn: 'Africa', rw: 'Africa',
  mz: 'Africa', zm: 'Africa', zw: 'Africa', bw: 'Africa', mu: 'Africa',
  mg: 'Africa', ml: 'Africa', ne: 'Africa', bf: 'Africa', cd: 'Africa',
  au: 'Oceania', nz: 'Oceania', fj: 'Oceania', pg: 'Oceania',
  ru: 'Europe',
};

@Injectable()
export class EsimService implements OnModuleInit {
  private readonly logger = new Logger(EsimService.name);
  private api: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  // Caches
  private packagesCache: EsimPackage[] = [];
  private countriesCache: EsimCountry[] = [];
  private packagesByCountry: Map<string, EsimPackage[]> = new Map();
  private cacheBuiltAt: number = 0;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private isFetching = false;

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.get<string>(
      'ESIM_API_BASE_URL',
      'https://esimcard.com/api',
    );
    this.api = axios.create({
      baseURL: baseUrl,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30000,
    });
  }

  async onModuleInit() {
    try {
      await this.authenticate();
      // Start background fetch of packages (don't block startup)
      this.buildCacheInBackground();
    } catch (err) {
      this.logger.warn('eSIM API init failed — will retry on first request', err?.message);
    }
  }

  // ─── Authentication ────────────────────────────────────────────

  private async authenticate(): Promise<string> {
    const email = this.configService.get<string>('ESIM_API_EMAIL');
    const password = this.configService.get<string>('ESIM_API_PASSWORD');

    if (!email || !password) {
      throw new Error('ESIM_API_EMAIL and ESIM_API_PASSWORD must be set');
    }

    this.logger.log('Authenticating with eSIM API...');
    const { data } = await this.api.post<EsimLoginResponse>(
      '/developer/reseller/login',
      { email, password },
    );

    if (!data.status || !data.access_token) {
      throw new Error(`eSIM login failed: ${JSON.stringify(data)}`);
    }

    this.accessToken = data.access_token;
    // Tokens last ~24h, refresh after 20h to be safe
    this.tokenExpiresAt = Date.now() + 20 * 60 * 60 * 1000;
    this.logger.log(`eSIM authenticated as ${data.user.name} (balance: ${data.user.balance})`);
    return this.accessToken;
  }

  private async getToken(): Promise<string> {
    if (!this.accessToken || Date.now() > this.tokenExpiresAt) {
      await this.authenticate();
    }
    return this.accessToken!;
  }

  private async authedGet<T>(url: string, params?: Record<string, any>): Promise<T> {
    const token = await this.getToken();
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data } = await this.api.get<T>(url, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
        return data;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 429 && attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt + 1) * 1000;
          this.logger.warn(
            `Rate limited (429) on ${url} page=${params?.page ?? '?'}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await this.sleep(delay);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Unreachable');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Cache building ────────────────────────────────────────────

  private buildCacheInBackground() {
    this.buildCache().catch((err) =>
      this.logger.error('Background cache build failed', err?.message),
    );
  }

  private async buildCache(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      this.logger.log('Building eSIM packages cache...');
      const allPackages: EsimPackage[] = [];
      const PER_PAGE = 500;
      const DELAY_BETWEEN_REQUESTS_MS = 2000; // 2s between each request

      // Fetch first page to get total/lastPage
      const first = await this.authedGet<EsimPackagesResponse>(
        '/developer/reseller/packages',
        { page: 1, per_page: PER_PAGE },
      );
      allPackages.push(...first.data);
      const totalPages = first.meta.lastPage;
      this.logger.log(`eSIM API: ${first.meta.total} packages across ${totalPages} pages (${PER_PAGE}/page)`);

      // Fetch remaining pages sequentially with delays to avoid 429
      for (let page = 2; page <= totalPages; page++) {
        await this.sleep(DELAY_BETWEEN_REQUESTS_MS);
        const result = await this.authedGet<EsimPackagesResponse>(
          '/developer/reseller/packages',
          { page, per_page: PER_PAGE },
        );
        allPackages.push(...result.data);
        this.logger.log(
          `eSIM cache progress: ${allPackages.length}/${first.meta.total} packages (page ${page}/${totalPages})`,
        );
      }

      this.logger.log(`Fetched ${allPackages.length} packages total`);

      // Build country index
      const countryMap = new Map<string, {
        name: string;
        code: string;
        iso: string;
        imageUrl: string;
        packages: Set<string>;
        minPrice: number;
        networks: Set<string>;
      }>();

      this.packagesByCountry.clear();

      for (const pkg of allPackages) {
        for (const cov of pkg.coverage) {
          const code = cov.code.toLowerCase();
          const existing = countryMap.get(code);

          if (existing) {
            existing.packages.add(pkg.id);
            existing.minPrice = Math.min(existing.minPrice, pkg.price);
            cov.supported_networks_coverages.forEach((n) => existing.networks.add(n));
          } else {
            countryMap.set(code, {
              name: cov.country_name,
              code,
              iso: cov.iso,
              imageUrl: cov.country_image_url,
              packages: new Set([pkg.id]),
              minPrice: pkg.price,
              networks: new Set(cov.supported_networks_coverages),
            });
          }

          // Build country→packages index
          if (!this.packagesByCountry.has(code)) {
            this.packagesByCountry.set(code, []);
          }
          this.packagesByCountry.get(code)!.push(pkg);
        }
      }

      // Convert to sorted array
      this.countriesCache = Array.from(countryMap.values())
        .map((c) => ({
          name: c.name,
          code: c.code,
          iso: c.iso,
          imageUrl: c.imageUrl,
          packagesCount: c.packages.size,
          priceFrom: c.minPrice,
          networks: Array.from(c.networks).sort(),
          region: REGION_MAP[c.code] || 'Other',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      this.packagesCache = allPackages;
      this.cacheBuiltAt = Date.now();
      this.logger.log(
        `eSIM cache built: ${this.countriesCache.length} countries, ${allPackages.length} packages`,
      );
    } finally {
      this.isFetching = false;
    }
  }

  private async ensureCache(): Promise<void> {
    if (
      this.countriesCache.length === 0 ||
      Date.now() - this.cacheBuiltAt > this.CACHE_TTL
    ) {
      await this.buildCache();
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  async getCountries(region?: string): Promise<EsimCountry[]> {
    await this.ensureCache();
    if (region && region !== 'All') {
      return this.countriesCache.filter((c) => c.region === region);
    }
    return this.countriesCache;
  }

  async getRegions(): Promise<string[]> {
    await this.ensureCache();
    const regions = new Set(this.countriesCache.map((c) => c.region));
    return ['All', ...Array.from(regions).sort()];
  }

  async getPackagesByCountry(
    countryCode: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: EsimPackageSummary[]; total: number; page: number; lastPage: number }> {
    await this.ensureCache();
    const code = countryCode.toLowerCase();
    const packages = this.packagesByCountry.get(code) || [];

    // Sort by price ascending
    const sorted = [...packages].sort((a, b) => a.price - b.price);
    const total = sorted.length;
    const lastPage = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const slice = sorted.slice(start, start + limit);

    return {
      data: slice.map(this.toSummary),
      total,
      page,
      lastPage,
    };
  }

  async getPackageById(id: string): Promise<EsimPackage | null> {
    await this.ensureCache();
    return this.packagesCache.find((p) => p.id === id) || null;
  }

  async searchPackages(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: EsimPackageSummary[]; total: number; page: number; lastPage: number }> {
    await this.ensureCache();
    const q = query.toLowerCase();

    const filtered = this.packagesCache.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      return p.coverage.some(
        (c) =>
          c.country_name.toLowerCase().includes(q) ||
          c.code.toLowerCase() === q,
      );
    });

    const sorted = filtered.sort((a, b) => a.price - b.price);
    const total = sorted.length;
    const lastPage = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const slice = sorted.slice(start, start + limit);

    return {
      data: slice.map(this.toSummary),
      total,
      page,
      lastPage,
    };
  }

  async getPopularPackages(limit = 6): Promise<EsimPackageSummary[]> {
    await this.ensureCache();
    // Popular = cheapest multi-country plans sorted by country count desc
    const multiCountry = this.packagesCache
      .filter((p) => p.coverage.length > 1)
      .sort((a, b) => b.coverage.length - a.coverage.length || a.price - b.price)
      .slice(0, limit);

    if (multiCountry.length < limit) {
      const single = this.packagesCache
        .filter((p) => p.coverage.length === 1)
        .sort((a, b) => a.price - b.price)
        .slice(0, limit - multiCountry.length);
      return [...multiCountry, ...single].map(this.toSummary);
    }

    return multiCountry.map(this.toSummary);
  }

  async getBalance(): Promise<number> {
    const resp = await this.authedGet<EsimBalanceResponse>(
      '/developer/reseller/balance',
    );
    return resp.balance;
  }

  async getCacheStats() {
    return {
      countriesCount: this.countriesCache.length,
      packagesCount: this.packagesCache.length,
      cacheAge: this.cacheBuiltAt
        ? Math.round((Date.now() - this.cacheBuiltAt) / 1000)
        : null,
      isFetching: this.isFetching,
    };
  }

  // Force refresh cache
  async refreshCache(): Promise<void> {
    this.cacheBuiltAt = 0;
    await this.buildCache();
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private toSummary = (pkg: EsimPackage): EsimPackageSummary => ({
    id: pkg.id,
    name: pkg.name.trim(),
    price: pkg.price,
    dataQuantity: pkg.data_quantity,
    dataUnit: pkg.data_unit,
    validity: pkg.package_validity,
    validityUnit: pkg.package_validity_unit,
    type: pkg.package_type,
    unlimited: pkg.unlimited,
    tether: pkg.tether,
    connectivity: pkg.connectivity,
    countries: pkg.coverage.map((c) => c.country_name),
    countryCount: pkg.coverage.length,
    activationType: pkg.activation_type,
    activationDescription: pkg.activation_type_description,
  });
}
