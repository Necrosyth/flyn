/**
 * Tenant mailbox model — an org-domain address (e.g. marketing@apple.com) the owner/admin
 * creates, then LINKS to a flexible access set via a checkbox picker:
 *   • teams[] → every member whose team label is in this list (dynamic: future joiners included)
 *   • uids[]  → specific individual members (hand-picked)
 * Effective access = (members whose team ∈ teams) ∪ uids. Checking a team in the UI is a
 * convenience that bulk-selects its members; unchecking one falls back to explicit uids.
 *
 * Send/receive plumbing is identical regardless of who's linked and host-independent: send via the
 * org's authenticated domain (From = address), receive via inbound webhook → the unified inbox,
 * scoped by the same access set (MailboxesService.getMailboxesForUser).
 *
 * `status` is 'pending' until the domain is authenticated with the email provider, then 'active'
 * (sendable). A mailbox with empty teams[] AND uids[] is simply unlinked (nobody has access yet).
 */
export type MailboxStatus = 'pending' | 'active';

/**
 * The subdomain convention for inbound: `mail.<domain>`. Centralised here — the ONLY place that
 * builds this string. Scattered concatenation elsewhere is the code smell we're avoiding.
 *
 * Why a subdomain and not the apex?
 *   Tenants are already on Google Workspace / Microsoft 365 (apex MX → Google/MS). Flyn cannot
 *   change the apex MX without killing their existing mail. A dedicated `mail.` subdomain lets
 *   Brevo catch replies while the tenant's normal mail is untouched. The tenant adds just two MX
 *   records for `mail.<domain>` — no other DNS changes.
 */
export function deriveReceivingAddress(localPart: string, domain: string): string {
  return `${localPart}@mail.${domain}`;
}

export interface TenantMailbox {
  id: string;
  tenantId: string;
  /** Full address, lowercased — e.g. "marketing@apple.com". Unique per tenant. */
  address: string;
  /** Local part — "marketing". */
  localPart: string;
  /** Domain — "apple.com". */
  domain: string;
  /** Team labels with access (dynamic — current + future members of these teams). */
  teams: string[];
  /** Specific member uids with access (hand-picked). */
  uids: string[];
  status: MailboxStatus;
  createdAt: number;
  updatedAt: number;
  /** uid of the admin/owner who created it. */
  createdBy: string;
  /**
   * Where Brevo delivers inbound mail (mail.<domain>). Derived at create time via
   * deriveReceivingAddress; never trust a client-sent value. Distinct from `address`
   * (the From: identity) because the tenant's apex MX is almost certainly Google/Microsoft.
   */
  receivingAddress?: string;
}

/** Create payload — address only; linking happens after, via the Link picker. */
export interface CreateMailboxDto {
  address: string;
}

/** Link payload — the full access set selected in the checkbox picker (replaces prior linkage). */
export interface LinkMailboxDto {
  teams: string[];
  uids: string[];
}
