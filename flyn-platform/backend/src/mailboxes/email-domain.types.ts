/**
 * Tenant verified-email-domain registry (tenant_email_domains collection).
 *
 * A tenant may only create mailboxes on a domain it has ADDED and proven it OWNS via a DNS TXT
 * record (host-independent — a plain dns.resolveTxt lookup, no email provider). This registry +
 * the createMailbox gate are the fix for the spoofing hole where any domain was acceptable.
 *
 * Two independent status dimensions:
 *   • status (ownership)  — 'pending' until the TXT record is found, then 'verified'. Gates mailbox
 *                           CREATION. This phase only needs ownership.
 *   • sendingStatus       — 'none' → 'pending' → 'verified' once the domain's DKIM is authenticated
 *                           with Brevo (startSendingAuth publishes the records, checkSendingAuth
 *                           confirms). Gates whether a mailbox can actually SEND/RECEIVE: when a
 *                           domain flips 'verified', MailboxesService.activateMailboxesForDomain
 *                           flips its mailboxes 'pending' → 'active'.
 */
export type DomainOwnershipStatus = 'pending' | 'verified';
export type DomainSendingStatus = 'none' | 'pending' | 'verified';

/**
 * One DNS record the owner must publish to AUTHENTICATE sending (Brevo DKIM/brevo-code/DMARC).
 * Confirmed live against POST/GET /v3/senders/domains (2026-06-05): Brevo returns DKIM ×2 (CNAME),
 * a brevo-code (TXT @) and a DMARC (TXT _dmarc) — no standalone SPF/MX for sending. We store the
 * full set as a faithful array because the old spf/dkim/mx 3-string seam can't carry host names.
 */
export interface DomainDnsRecord {
  /** Brevo's record key — dkim1Record | dkim2Record | brevo_code | dmarc_record. */
  key: string;
  type: 'CNAME' | 'TXT' | 'MX';
  /** Host/name to publish (e.g. "brevo1._domainkey", "@", "_dmarc"). */
  host: string;
  value: string;
  /** Human label for the UI ("DKIM 1", "Brevo verification", "DMARC"). */
  label: string;
  /** Brevo's last-seen "this record is live in DNS" flag. */
  verified: boolean;
}

export interface TenantEmailDomain {
  id: string;
  tenantId: string;
  /** The domain, lowercased — e.g. "apple.com" or "admin.apple.com". Unique per tenant. */
  domain: string;
  /** Random token; the owner proves control by publishing TXT "flyn-verify=<verifyToken>". */
  verifyToken: string;
  status: DomainOwnershipStatus;
  verifiedAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;

  // ── Deliverability / sending authentication (lit by the Brevo domain-auth step) ──
  sendingStatus: DomainSendingStatus;
  /** Brevo's internal sender-domain id, for reference/cleanup. */
  brevoDomainId?: string;
  /** DKIM/brevo-code/DMARC records the owner publishes to authenticate sending. */
  sendingRecords?: DomainDnsRecord[];
  /** Last time we polled Brevo for authentication status. */
  sendingCheckedAt?: number;
  /** When sending was first reported authenticated. */
  sendingVerifiedAt?: number;
}

/** The DNS record the owner must publish to prove ownership. */
export interface DomainVerifyRecord {
  type: 'TXT';
  host: string;  // '@' — the domain apex
  value: string; // "flyn-verify=<token>"
}

export interface AddEmailDomainDto {
  domain: string;
}

/** Result of a verify attempt — verified flips ownership; reason explains a still-pending result. */
export interface VerifyDomainResult {
  domain: TenantEmailDomain;
  verified: boolean;
  reason?: string;
}
