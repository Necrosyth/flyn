import { Controller, Get, Post, Delete, Put, Body, Query, Param, Req, UseGuards, UsePipes, ValidationPipe, BadRequestException, Logger } from '@nestjs/common';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { DomainsService } from './domains.service';
import { DomainAvailability, RegisteredDomain, DnsRecord, CustomHostname } from './domains.types';

@Controller('domains')
@UseGuards(ApiOrFirebaseAuthGuard)
export class DomainsController {
  private readonly logger = new Logger(DomainsController.name);

  constructor(private readonly domainsService: DomainsService) {}

  private tenantIdFromReq(req: AuthRequest): string {
    return ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
  }

  @Get('search')
  async search(@Query('q') query: string): Promise<DomainAvailability[]> {
    if (!query) throw new BadRequestException('Query parameter "q" is required');
    return this.domainsService.searchDomains(query);
  }

  @Get('check')
  async check(@Query('domain') domain: string): Promise<DomainAvailability> {
    if (!domain) throw new BadRequestException('Query parameter "domain" is required');
    return this.domainsService.checkAvailability(domain);
  }

  @Post('checkout')
  async checkout(
    @Req() req: AuthRequest,
    @Body() body: { domain: string; price: number; currency: string },
  ): Promise<{ paymentUrl: string }> {
    const result = await this.domainsService.createCheckout(
      this.tenantIdFromReq(req),
      body.domain,
      body.price,
      body.currency,
    );
    return { paymentUrl: result.paymentUrl };
  }

  @Post('register')
  async register(@Req() req: AuthRequest, @Body() body: { domain: string; years?: number }): Promise<RegisteredDomain> {
    return this.domainsService.registerDomain(this.tenantIdFromReq(req), body.domain, body.years);
  }

  @Get('list')
  async list(@Req() req: AuthRequest): Promise<RegisteredDomain[]> {
    return this.domainsService.listDomains(this.tenantIdFromReq(req));
  }

  @Get(':domain/dns')
  async getDns(@Param('domain') domain: string): Promise<DnsRecord[]> {
    return this.domainsService.getDnsRecords(domain);
  }

  @Post(':domain/dns')
  async addDns(
    @Param('domain') domain: string,
    @Body() body: Omit<DnsRecord, 'id' | 'domain'>,
  ): Promise<DnsRecord> {
    return this.domainsService.addDnsRecord(domain, body);
  }

  @Delete(':domain/dns/:id')
  async deleteDns(
    @Param('domain') domain: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.domainsService.deleteDnsRecord(domain, id);
  }

  @Get('custom-hostnames')
  async listCustom(@Req() req: AuthRequest): Promise<CustomHostname[]> {
    return this.domainsService.listCustomHostnames(this.tenantIdFromReq(req));
  }

  @Post('custom-hostnames')
  async addCustom(@Req() req: AuthRequest, @Body() body: { hostname: string }): Promise<CustomHostname> {
    if (!body.hostname?.trim()) {
      throw new BadRequestException('Hostname is required');
    }
    try {
      return await this.domainsService.addCustomHostname(this.tenantIdFromReq(req), body.hostname);
    } catch (err: any) {
      this.logger.error(`Failed to add custom hostname: ${err.message}`);
      throw new BadRequestException(err.message ?? 'Failed to connect domain');
    }
  }

  @Get('custom-hostnames/:id')
  async getCustomStatus(@Req() req: AuthRequest, @Param('id') id: string): Promise<CustomHostname> {
    return this.domainsService.getCustomHostnameStatus(this.tenantIdFromReq(req), id);
  }

  @Delete('custom-hostnames/:id')
  async deleteCustom(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.domainsService.deleteCustomHostname(this.tenantIdFromReq(req), id);
  }

  @Post('link-website')
  async linkWebsite(
    @Req() req: AuthRequest,
    @Body() body: { type: 'registered' | 'custom'; id: string; websiteId: string | null },
  ): Promise<{ success: boolean }> {
    await this.domainsService.linkWebsite(this.tenantIdFromReq(req), body.type, body.id, body.websiteId);
    return { success: true };
  }
}
