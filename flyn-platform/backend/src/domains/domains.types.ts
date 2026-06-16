export interface DomainAvailability {
  domain: string;
  available: boolean;
  premium: boolean;
  price: number;
  currency: string;
}

export interface RegisteredDomain {
  id: string;
  domain: string;
  status: 'active' | 'pending' | 'expired' | 'transferring';
  expiresAt: string;
  autoRenew: boolean;
  nameservers: string[];
  createdAt: string;
  tenantId: string;
  websiteId?: string;
}

export interface DnsRecord {
  id: string;
  domain: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';
  host: string;
  value: string;
  ttl: number;
  priority?: number;
}

export interface CustomHostname {
  id: string;
  hostname: string;
  status: 'pending' | 'active' | 'blocked' | 'moved';
  ssl: {
    status: 'initializing' | 'pending_validation' | 'active' | 'expired';
    type: 'dv';
    validationErrors?: Array<{ code?: string; message?: string }>;
    validationRecords?: Array<{ status?: string; txt_name?: string; txt_value?: string }>;
    dcvDelegationRecords?: Array<{ cname?: string; cname_target?: string }>;
  };
  verificationRecords: Array<{
    type: string;
    name: string;
    value: string;
  }>;
  createdAt: string;
  tenantId: string;
  websiteId?: string;
}
