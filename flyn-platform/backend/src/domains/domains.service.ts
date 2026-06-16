import { Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { BillingService } from '../billing/billing.service';
import { DomainAvailability, RegisteredDomain, DnsRecord, CustomHostname } from './domains.types';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);
  private readonly COL_DOMAINS = 'domains';
  private readonly COL_DNS_RECORDS = 'dns_records';
  private readonly COL_CUSTOM_HOSTNAMES = 'custom_hostnames';

  // Configuration for Domain Registration
  private readonly DOMAIN_CONFIG = {
    tlds: ['com', 'net', 'org', 'io', 'ai', 'co', 'app', 'dev', 'me', 'tech', 'online'],
    platformFee: 10.00,
    nameservers: process.env.FLYN_NAMESERVERS?.split(',') || ['ns1.flynai.com', 'ns2.flynai.com'],
    customHostnameTarget: process.env.FLYN_CUSTOM_DOMAIN_TARGET || 'customers.myflynai.com',
    namecheap: {
      apiKey: process.env.NAMECHEAP_API_KEY,
      user: process.env.NAMECHEAP_USER,
      clientIp: process.env.NAMECHEAP_CLIENT_IP,
      isSandbox: process.env.NAMECHEAP_SANDBOX === 'true',
    },
    cloudflare: {
      email: process.env.CLOUDFLARE_EMAIL,
      apiKey: process.env.CLOUDFLARE_API_KEY,
      zoneId: process.env.CLOUDFLARE_ZONE_ID,
    },
    // Base registration prices per TLD (USD) — used when Namecheap returns 0 for non-premium domains
    tldPrices: {
      com: 8.98, net: 9.98, org: 9.98, io: 32.98, ai: 79.98,
      co: 24.98, app: 14.98, dev: 12.98, me: 12.98, tech: 19.98, online: 14.98,
    } as Record<string, number>,
  };

  constructor(
    private readonly firebase: FirebaseService,
    private readonly billing: BillingService,
  ) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  // ── Domain Search & Availability ──────────────────────────────────────────

  async searchDomains(query: string): Promise<DomainAvailability[]> {
    const cleanQuery = query.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    const base = cleanQuery.split('.')[0];

    if (!base) throw new BadRequestException('Invalid domain query');

    this.logger.log(`Searching domains for: ${cleanQuery}`);

    if (!this.DOMAIN_CONFIG.namecheap.apiKey || !this.DOMAIN_CONFIG.namecheap.user) {
      this.logger.error('Namecheap API credentials not configured');
      throw new ServiceUnavailableException('Domain search is not configured on this server');
    }

    const results = await this.callNamecheapApi(base, this.DOMAIN_CONFIG.tlds);

    // Cross-reference with our database to mark domains registered inside Flyn as taken
    const registeredSnap = await this.db().collection(this.COL_DOMAINS).get();
    const registeredDomains = new Set(registeredSnap.docs.map(doc => (doc.data().domain as string).toLowerCase()));

    return results.map(r => ({
      ...r,
      available: r.available && !registeredDomains.has(r.domain.toLowerCase()),
      price: parseFloat((r.price + this.DOMAIN_CONFIG.platformFee).toFixed(2)),
    }));
  }

  private async callNamecheapApi(base: string, tlds: string[]): Promise<DomainAvailability[]> {
    const domainList = tlds.map(tld => `${base}.${tld}`).join(',');
    const endpoint = this.DOMAIN_CONFIG.namecheap.isSandbox
      ? 'https://api.sandbox.namecheap.com/xml.response'
      : 'https://api.namecheap.com/xml.response';

    let xmlData: string;
    try {
      const response = await axios.get<string>(endpoint, {
        params: {
          ApiUser:   this.DOMAIN_CONFIG.namecheap.user,
          ApiKey:    this.DOMAIN_CONFIG.namecheap.apiKey,
          UserName:  this.DOMAIN_CONFIG.namecheap.user,
          ClientIp:  this.DOMAIN_CONFIG.namecheap.clientIp,
          Command:   'namecheap.domains.check',
          DomainList: domainList,
        },
        responseType: 'text',
        timeout: 15000,
      });
      xmlData = response.data;
    } catch (err: any) {
      this.logger.error(`Namecheap HTTP error: ${err.message}`);
      throw new ServiceUnavailableException(`Domain search failed: ${err.message}`);
    }

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    let parsed: any;
    try {
      parsed = parser.parse(xmlData);
    } catch (err: any) {
      this.logger.error(`Namecheap XML parse error: ${err.message}\nRaw: ${xmlData.slice(0, 500)}`);
      throw new ServiceUnavailableException('Domain search returned an unreadable response');
    }

    const apiResponse = parsed?.ApiResponse;

    // Surface Namecheap API-level errors
    if (apiResponse?.['@_Status'] === 'ERROR') {
      const errors = apiResponse?.Errors?.Error;
      const msg = Array.isArray(errors)
        ? errors.map((e: any) => e?.['#text'] ?? e).join('; ')
        : (errors?.['#text'] ?? errors ?? 'Unknown Namecheap error');
      this.logger.error(`Namecheap API error: ${msg}`);
      throw new ServiceUnavailableException(`Domain search error: ${msg}`);
    }

    const checkResults = apiResponse?.CommandResponse?.DomainCheckResult;
    if (!checkResults) {
      this.logger.warn(`Namecheap returned no DomainCheckResult. Raw: ${xmlData.slice(0, 500)}`);
      throw new ServiceUnavailableException('Domain search returned no results');
    }

    const items: any[] = Array.isArray(checkResults) ? checkResults : [checkResults];

    return items.map((item: any) => {
      const domain = (item['@_Domain'] ?? '').toLowerCase();
      const available = item['@_Available'] === 'true';
      const isPremium = item['@_IsPremiumName'] === 'true';
      const tld = domain.split('.').slice(1).join('.');
      // Use Namecheap's premium price if available, else look up our base price table
      const premiumPrice = parseFloat(item['@_PremiumRegistrationPrice'] ?? '0');
      const basePrice = premiumPrice > 0 ? premiumPrice : (this.DOMAIN_CONFIG.tldPrices[tld] ?? 14.98);

      return {
        domain,
        available,
        premium: isPremium,
        price: parseFloat(basePrice.toFixed(2)),
        currency: 'USD',
      } as DomainAvailability;
    });
  }

  async checkAvailability(domain: string): Promise<DomainAvailability> {
    const results = await this.searchDomains(domain);
    const result = results.find(r => r.domain.toLowerCase() === domain.toLowerCase());
    if (!result) throw new NotFoundException(`Domain ${domain} not found in search results`);
    return result;
  }

  private async getTenantEmail(tenantId: string): Promise<string> {
    const tenant = await this.firebase.firestore()?.collection('tenants').doc(tenantId).get();
    return tenant?.data()?.email || '';
  }

  async createCheckout(tenantId: string, domain: string, price: number, currency: string) {
    const email = await this.getTenantEmail(tenantId);
    
    // Convert price to cents (Stripe logic)
    const amountInCents = Math.round(price * 100);

    return this.billing.createCheckoutSession(
      {
        tenantId, // Required by CreatePaymentDto
        amount: amountInCents,
        currency: currency.toLowerCase(),
        description: `Domain Registration: ${domain}`,
        customerEmail: email,
        successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/domains?success=true&domain=${domain}`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/domains?cancelled=true`,
        metadata: {
          domain,
          type: 'domain_registration',
        },
        countryCode: 'US', // Default or resolve via tenant
      },
      tenantId,
    );
  }

  // ── Domain Registration ───────────────────────────────────────────────────

  async registerDomain(tenantId: string, domain: string, years: number = 1): Promise<RegisteredDomain> {
    this.logger.log(`Registering domain ${domain} for tenant ${tenantId}`);
    
    // 1. Verify availability and get price
    const availability = await this.checkAvailability(domain);
    if (!availability.available) {
      throw new BadRequestException(`Domain ${domain} is not available`);
    }

    // 2. In a real flow, we would check if a payment intent is already paid.
    // Since we are "wiring" it, we will assume the frontend handles the checkout
    // flow and this method is called after payment or as part of a transaction.
    
    // For this implementation, we will create a record in Firestore.
    const id = randomUUID();
    const now = new Date();
    const expiry = new Date();
    expiry.setFullYear(now.getFullYear() + years);

    const record: RegisteredDomain = {
      id,
      domain,
      status: 'active', // In reality, might start as 'pending'
      expiresAt: expiry.toISOString(),
      autoRenew: true,
      nameservers: ['ns1.flynai.com', 'ns2.flynai.com'],
      createdAt: now.toISOString(),
      tenantId,
    };

    await this.db().collection(this.COL_DOMAINS).doc(id).set(record);

    // 3. Set default DNS records
    await this.addDnsRecord(domain, {
      type: 'A',
      host: '@',
      value: '76.76.21.21', // Flyn Default IP (Vercel-like)
      ttl: 300
    });
    await this.addDnsRecord(domain, {
      type: 'CNAME',
      host: 'www',
      value: domain,
      ttl: 300
    });

    return record;
  }

  async listDomains(tenantId: string): Promise<RegisteredDomain[]> {
    const snap = await this.db()
      .collection(this.COL_DOMAINS)
      .where('tenantId', '==', tenantId)
      .get();
      
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RegisteredDomain));
  }

  // ── DNS Management ────────────────────────────────────────────────────────

  async getDnsRecords(domain: string): Promise<DnsRecord[]> {
    const snap = await this.db()
      .collection(this.COL_DNS_RECORDS)
      .where('domain', '==', domain.toLowerCase())
      .get();
    
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DnsRecord));
  }

  async addDnsRecord(domain: string, record: Omit<DnsRecord, 'id' | 'domain'>): Promise<DnsRecord> {
    const id = randomUUID();
    const fullRecord: DnsRecord = {
      ...record,
      id,
      domain: domain.toLowerCase(),
    } as DnsRecord;
    
    await this.db().collection(this.COL_DNS_RECORDS).doc(id).set(fullRecord);
    return fullRecord;
  }

  async deleteDnsRecord(domain: string, recordId: string): Promise<void> {
    const doc = await this.db().collection(this.COL_DNS_RECORDS).doc(recordId).get();
    if (!doc.exists) throw new NotFoundException('DNS record not found');
    
    const data = doc.data() as DnsRecord;
    if (data.domain !== domain.toLowerCase()) throw new BadRequestException('Record does not belong to this domain');
    
    await doc.ref.delete();
  }

  // ── Custom Hostnames (Cloudflare for SaaS) ────────────────────────────────

  private async cloudflareReq(method: string, path: string, data?: any) {
    const { email, apiKey, zoneId } = this.DOMAIN_CONFIG.cloudflare;

    if (!email || !apiKey || !zoneId) {
      this.logger.error('Cloudflare credentials not configured');
      throw new ServiceUnavailableException('Cloudflare integration is not configured');
    }

    try {
      const resp = await axios({
        method,
        url: `https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`,
        headers: {
          'X-Auth-Email': email,
          'X-Auth-Key': apiKey,
          'Content-Type': 'application/json',
        },
        data,
      });
      return resp.data;
    } catch (err: any) {
      const msg = err.response?.data?.errors?.[0]?.message || err.message;
      this.logger.error(`Cloudflare API error: ${msg}`);
      throw new BadRequestException(`Cloudflare error: ${msg}`);
    }
  }

  async listCustomHostnames(tenantId: string): Promise<CustomHostname[]> {
    const snap = await this.db()
      .collection(this.COL_CUSTOM_HOSTNAMES)
      .where('tenantId', '==', tenantId)
      .get();
      
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomHostname));
  }

  async addCustomHostname(tenantId: string, hostname: string): Promise<CustomHostname> {
    this.logger.log(`Adding custom hostname ${hostname} for tenant ${tenantId}`);

    // Check if hostname already exists in Cloudflare
    const listResult = await this.cloudflareReq('GET', '/custom_hostnames');
    const existing = listResult.result?.find((h: any) => h.hostname === hostname);

    let cfData = existing;

    // Only create if it doesn't exist
    if (!existing) {
      const cfResult = await this.cloudflareReq('POST', '/custom_hostnames', {
        hostname,
        ssl: {
          method: 'txt',
          type: 'dv',
        },
      });
      cfData = cfResult.result;
    } else {
      this.logger.log(`Custom hostname ${hostname} already exists in Cloudflare`);
    }

    const id = cfData.id;
    const record: CustomHostname = {
      id,
      hostname,
      status: cfData.status,
      ssl: {
        status: cfData.ssl?.status,
        type: cfData.ssl?.type,
      },
      verificationRecords: [
        {
          type: 'CNAME',
          name: hostname,
          value: this.DOMAIN_CONFIG.customHostnameTarget,
        },
      ],
      createdAt: new Date().toISOString(),
      tenantId,
    };

    // Add TXT verification if present
    if (cfData.ownership_verification) {
      record.verificationRecords.push({
        type: cfData.ownership_verification.type || 'TXT',
        name: cfData.ownership_verification.name || hostname,
        value: cfData.ownership_verification.value,
      });
    }

    await this.db().collection(this.COL_CUSTOM_HOSTNAMES).doc(id).set(record);
    return record;
  }

  async deleteCustomHostname(tenantId: string, id: string): Promise<void> {
    const doc = await this.db().collection(this.COL_CUSTOM_HOSTNAMES).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Hostname not found');
    
    const data = doc.data() as CustomHostname;
    if (data.tenantId !== tenantId) throw new NotFoundException('Hostname not found');
    
    // 1. Remove from Cloudflare
    try {
      await this.cloudflareReq('DELETE', `/custom_hostnames/${id}`);
    } catch (e) {
      this.logger.warn(`Could not delete hostname ${id} from Cloudflare: ${e.message}`);
    }

    // 2. Remove from DB
    await doc.ref.delete();
  }

  async linkWebsite(tenantId: string, type: 'registered' | 'custom', id: string, websiteId: string | null): Promise<void> {
    const collection = type === 'registered' ? this.COL_DOMAINS : this.COL_CUSTOM_HOSTNAMES;
    const doc = await this.db().collection(collection).doc(id).get();
    
    if (!doc.exists) throw new NotFoundException(`${type === 'registered' ? 'Domain' : 'Hostname'} not found`);
    
    const data = doc.data() as any;
    if (data.tenantId !== tenantId) throw new NotFoundException(`${type === 'registered' ? 'Domain' : 'Hostname'} not found`);
    
    await doc.ref.update({ websiteId });
    this.logger.log(`Linked website ${websiteId} to ${type} domain ${id} for tenant ${tenantId}`);
  }

  async getCustomHostnameStatus(tenantId: string, id: string): Promise<CustomHostname> {
    const doc = await this.db().collection(this.COL_CUSTOM_HOSTNAMES).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Hostname not found');

    const data = doc.data() as CustomHostname;
    if (data.tenantId !== tenantId) throw new NotFoundException('Hostname not found');

    // 1. Fetch from Cloudflare
    const cfResult = await this.cloudflareReq('GET', `/custom_hostnames/${id}`);
    const cfData = cfResult.result;

    this.logger.log(`[getCustomHostnameStatus] Cloudflare response:`, JSON.stringify(cfData, null, 2).substring(0, 1000));

    // 2. Update local DB with validation details
    const updates: Partial<CustomHostname> = {
      status: cfData.status,
      ssl: {
        status: cfData.ssl.status,
        type: cfData.ssl.type,
        validationErrors: cfData.ssl?.validation_errors || [],
        validationRecords: cfData.ssl?.validation_records || [],
        dcvDelegationRecords: cfData.ssl?.dcv_delegation_records || [],
      },
      verificationRecords: [
        {
          type: 'CNAME',
          name: cfData.hostname,
          value: this.DOMAIN_CONFIG.customHostnameTarget,
        },
      ],
    };

    // Add ownership verification TXT record (for TXT validation method)
    if (cfData.ownership_verification) {
      updates.verificationRecords?.push({
        type: cfData.ownership_verification.type || 'TXT',
        name: cfData.ownership_verification.name,
        value: cfData.ownership_verification.value,
      });
    }

    // Add ACME validation TXT records if present
    if (cfData.ssl?.validation_records) {
      cfData.ssl.validation_records.forEach((rec: any) => {
        updates.verificationRecords?.push({
          type: 'TXT',
          name: rec.txt_name,
          value: rec.txt_value,
        });
      });
    }

    // Add DCV delegation CNAME as alternative
    if (cfData.ssl?.dcv_delegation_records) {
      cfData.ssl.dcv_delegation_records.forEach((rec: any) => {
        updates.verificationRecords?.push({
          type: 'CNAME',
          name: rec.cname,
          value: rec.cname_target,
        });
      });
    }

    await doc.ref.update(updates);

    return { ...data, ...updates };
  }
}
