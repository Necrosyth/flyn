import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";

const BASE = `${API_BASE_URL}/domains`;

// ── Types ────────────────────────────────────────────────────────────────────

export interface DomainAvailability {
  domain: string;
  available: boolean;
  premium: boolean;
  price: number; // USD per year
  currency: string;
}

export interface RegisteredDomain {
  id: string;
  domain: string;
  status: "active" | "pending" | "expired" | "transferring";
  expiresAt: string; // ISO
  autoRenew: boolean;
  nameservers: string[];
  createdAt: string;
  websiteId?: string;
}

export interface DnsRecord {
  id: string;
  domain: string;
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV";
  host: string;
  value: string;
  ttl: number;
  priority?: number;
}

export interface CustomHostname {
  id: string;
  hostname: string;
  status: "pending" | "active" | "blocked" | "moved";
  ssl: {
    status: "initializing" | "pending_validation" | "active" | "expired";
    type: "dv";
  };
  verificationRecords: Array<{
    type: string;
    name: string;
    value: string;
  }>;
  createdAt: string;
  websiteId?: string;
}

// ── API calls ──

export async function checkDomainAvailability(domain: string): Promise<DomainAvailability[]> {
  const res = await authedFetch(`${BASE}/check?domain=${encodeURIComponent(domain)}`);
  if (!res.ok) throw new Error("Failed to check domain availability");
  return res.json();
}

export async function searchDomains(query: string): Promise<DomainAvailability[]> {
  const res = await authedFetch(`${BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function registerDomain(params: {
  domain: string;
  years?: number;
  autoRenew?: boolean;
}): Promise<RegisteredDomain> {
  const res = await authedFetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Registration failed");
  return res.json();
}

export async function createDomainCheckout(params: {
  domain: string;
  price: number;
  currency: string;
}): Promise<{ paymentUrl: string }> {
  const res = await authedFetch(`${BASE}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Checkout failed");
  return res.json();
}

export async function listDomains(): Promise<RegisteredDomain[]> {
  const res = await authedFetch(`${BASE}/list`);
  if (!res.ok) throw new Error("Failed to list domains");
  return res.json();
}

export async function getDnsRecords(domain: string): Promise<DnsRecord[]> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(domain)}/dns`);
  if (!res.ok) throw new Error("Failed to get DNS records");
  return res.json();
}

export async function setDnsRecords(domain: string, records: Omit<DnsRecord, "id" | "domain">[]): Promise<void> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(domain)}/dns`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) throw new Error("Failed to update DNS records");
}

export async function addDnsRecord(domain: string, record: Omit<DnsRecord, "id" | "domain">): Promise<DnsRecord> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(domain)}/dns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error("Failed to add DNS record");
  return res.json();
}

export async function deleteDnsRecord(domain: string, recordId: string): Promise<void> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(domain)}/dns/${recordId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete DNS record");
}

// ── Custom hostnames ──────────────────────────────────────────────────────────

export async function addCustomHostname(hostname: string): Promise<CustomHostname> {
  const res = await authedFetch(`${BASE}/custom-hostnames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostname }),
  });
  if (!res.ok) throw new Error("Failed to add custom hostname");
  return res.json();
}

export async function listCustomHostnames(): Promise<CustomHostname[]> {
  const res = await authedFetch(`${BASE}/custom-hostnames`);
  if (!res.ok) throw new Error("Failed to list custom hostnames");
  return res.json();
}

export async function getCustomHostnameStatus(id: string): Promise<CustomHostname> {
  const res = await authedFetch(`${BASE}/custom-hostnames/${id}`);
  if (!res.ok) throw new Error("Failed to get status");
  return res.json();
}

export async function deleteCustomHostname(id: string): Promise<void> {
  const res = await authedFetch(`${BASE}/custom-hostnames/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete custom hostname");
}

export async function linkWebsiteToDomain(params: {
  type: 'registered' | 'custom';
  id: string;
  websiteId: string | null;
}): Promise<void> {
  const res = await authedFetch(`${BASE}/link-website`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Failed to link website");
}
