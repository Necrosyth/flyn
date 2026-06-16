import { Controller, Get, Param, Query, Post, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { EsimService } from './esim.service';

@Controller('esim')
export class EsimController {
  constructor(private readonly esimService: EsimService) {}

  private notConfigured(): never {
    throw new ServiceUnavailableException('eSIM service is not configured on this server (ESIM_API_EMAIL / ESIM_API_PASSWORD missing)');
  }

  /**
   * GET /api/esim/countries
   * Returns list of countries with eSIM coverage
   * Query: ?region=Europe
   */
  @Get('countries')
  async getCountries(@Query('region') region?: string) {
    try {
      const countries = await this.esimService.getCountries(region);
      return { status: true, data: countries, total: countries.length };
    } catch (e: any) { if (e?.message?.includes('ESIM_API')) this.notConfigured(); throw e; }
  }

  /**
   * GET /api/esim/regions
   * Returns list of available regions
   */
  @Get('regions')
  async getRegions() {
    try {
      const regions = await this.esimService.getRegions();
      return { status: true, data: regions };
    } catch (e: any) { if (e?.message?.includes('ESIM_API')) this.notConfigured(); throw e; }
  }

  /**
   * GET /api/esim/packages/popular
   * Returns popular/featured packages
   */
  @Get('packages/popular')
  async getPopularPackages(@Query('limit') limit?: string) {
    try {
      const data = await this.esimService.getPopularPackages(limit ? parseInt(limit, 10) : 6);
      return { status: true, data };
    } catch (e: any) { if (e?.message?.includes('ESIM_API')) this.notConfigured(); throw e; }
  }

  /**
   * GET /api/esim/packages/search
   * Search packages by name/country
   * Query: ?q=japan&page=1&limit=20
   */
  @Get('packages/search')
  async searchPackages(
    @Query('q') query: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return { status: false, message: 'Query parameter "q" is required' };
    }
    const result = await this.esimService.searchPackages(
      query,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
    return { status: true, ...result };
  }

  /**
   * GET /api/esim/packages/country/:code
   * Returns packages available for a specific country
   * Query: ?page=1&limit=20
   */
  @Get('packages/country/:code')
  async getPackagesByCountry(
    @Param('code') code: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const result = await this.esimService.getPackagesByCountry(code, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 20);
      return { status: true, ...result };
    } catch (e: any) { if (e?.message?.includes('ESIM_API')) this.notConfigured(); throw e; }
  }

  /**
   * GET /api/esim/packages/:id
   * Returns full details of a single package
   */
  @Get('packages/:id')
  async getPackageById(@Param('id') id: string) {
    try {
      const pkg = await this.esimService.getPackageById(id);
      if (!pkg) return { status: false, message: 'Package not found' };
      return { status: true, data: pkg };
    } catch (e: any) { if (e?.message?.includes('ESIM_API')) this.notConfigured(); throw e; }
  }

  /**
   * GET /api/esim/balance
   * Returns current reseller balance
   */
  @Get('balance')
  async getBalance() {
    try {
      const balance = await this.esimService.getBalance();
      return { status: true, balance };
    } catch (e: any) { if (e?.message?.includes('ESIM_API')) this.notConfigured(); throw e; }
  }

  /**
   * GET /api/esim/stats
   * Returns cache statistics
   */
  @Get('stats')
  async getStats() {
    const stats = await this.esimService.getCacheStats();
    return { status: true, ...stats };
  }

  /**
   * POST /api/esim/refresh
   * Force refresh the packages cache
   */
  @Post('refresh')
  @HttpCode(200)
  async refreshCache() {
    await this.esimService.refreshCache();
    const stats = await this.esimService.getCacheStats();
    return { status: true, message: 'Cache refreshed', ...stats };
  }
}
