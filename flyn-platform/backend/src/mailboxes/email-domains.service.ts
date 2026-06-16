import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { promises as dns } from 'dns';
import { FirebaseService } from '../firebase/firebase.service';
import { BrevoService } from '../brevo/brevo.service';
import type { BrevoSenderDomain, BrevoDnsRecord } from '../brevo/brevo.service';
import type {
  TenantEmailDomain,
  AddEmailDomainDto,
  DomainVerifyRecord,
  VerifyDomainResult,
  DomainDnsRecord,
} from './email-domain.types';

/**
 * Per-tenant verified-email-domain registry + DNS ownership verification.
 *
 * Ownership is proven by a plain DNS TXT lookup (dns.resolveTxt — Node built-in, NO email
 * provider). isVerifiedDomain() is the helper the createMailbox gate calls to reject mailboxes on
 * domains the tenant hasn't proven it owns. Reads/writes tenant_email_domains; depends only on
 * FirebaseService (no module cycle).
 */
@Injectable()
export class EmailDomainsService {
  private readonly logger = new Logger(EmailDomainsService.name);
  private readonly COLLECTION = 'tenant_email_domains';
  // Labels of letters/digits/hyphens (no leading/trailing hyphen), ≥2 labels, alpha TLD ≥2.
  private readonly DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly brevo: BrevoService,
  ) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  private normalize(domain: string): string {
    return (domain || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  }

  async list(tenantId: string): Promise<TenantEmailDomain[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const snap = await this.db().collection(this.COLLECTION).where('tenantId', '==', tenantId).get();
    return snap.docs.map((d) => d.data() as TenantEmailDomain).sort((a, b) => a.domain.localeCompare(b.domain));
  }

  /** Verified domains only — sources the create-UI dropdown. */
  async listVerified(tenantId: string): Promise<TenantEmailDomain[]> {
    return (await this.list(tenantId)).filter((d) => d.status === 'verified');
  }

  /** THE GATE HELPER — is `domain` an ownership-verified domain for this tenant? */
  async isVerifiedDomain(tenantId: string, domain: string): Promise<boolean> {
    const target = this.normalize(domain);
    if (!tenantId || !target) return false;
    const snap = await this.db()
      .collection(this.COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('domain', '==', target)
      .where('status', '==', 'verified')
      .limit(1)
      .get();
    return !snap.empty;
  }

  /** Add a domain → generate the TXT token, persist as 'pending', return the record to publish. */
  async addDomain(tenantId: string, createdBy: string, dto: AddEmailDomainDto): Promise<{ domain: TenantEmailDomain; record: DomainVerifyRecord }> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const domain = this.normalize(dto.domain);
    if (!this.DOMAIN_RE.test(domain)) throw new BadRequestException('Enter a valid domain, e.g. yourcompany.com');

    const existing = await this.db()
      .collection(this.COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('domain', '==', domain)
      .limit(1)
      .get();
    if (!existing.empty) {
      // Idempotent re-add returns the existing record (so the user can re-copy the TXT value).
      const d = existing.docs[0].data() as TenantEmailDomain;
      return { domain: d, record: this.recordFor(d) };
    }

    const now = Date.now();
    const record: TenantEmailDomain = {
      id: randomUUID(),
      tenantId,
      domain,
      verifyToken: randomBytes(16).toString('hex'),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      createdBy,
      sendingStatus: 'none', // Phase-4 seam — lit up by the deferred Brevo domain-auth step
    };
    await this.db().collection(this.COLLECTION).doc(record.id).set(record);
    this.logger.log(`[email-domains] added ${domain} (pending) for tenant ${tenantId}`);
    return { domain: record, record: this.recordFor(record) };
  }

  private recordFor(d: TenantEmailDomain): DomainVerifyRecord {
    return { type: 'TXT', host: '@', value: `flyn-verify=${d.verifyToken}` };
  }

  /**
   * Verify ownership via a REAL dns.resolveTxt lookup. Idempotent (already-verified → no-op).
   * NXDOMAIN / no-records are handled gracefully: stays 'pending' with a clear reason.
   */
  async verifyDomain(tenantId: string, id: string): Promise<VerifyDomainResult> {
    const ref = this.db().collection(this.COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as TenantEmailDomain).tenantId !== tenantId) {
      throw new NotFoundException('Domain not found');
    }
    const d = snap.data() as TenantEmailDomain;
    if (d.status === 'verified') return { domain: d, verified: true };

    const expected = `flyn-verify=${d.verifyToken}`;
    let found = false;
    let reason: string | undefined;
    try {
      const records = await dns.resolveTxt(d.domain); // string[][] — TXT can be chunked
      const flat = records.map((chunks) => chunks.join(''));
      found = flat.some((r) => r.trim() === expected || r.includes(expected));
      if (!found) reason = `TXT record "${expected}" not found at ${d.domain} (found ${flat.length} TXT record(s)). DNS can take a few minutes to propagate.`;
    } catch (err: any) {
      reason =
        err?.code === 'ENOTFOUND' || err?.code === 'ENODATA'
          ? `No TXT records found at ${d.domain} yet — add the record and allow a few minutes for DNS to propagate.`
          : `DNS lookup failed: ${err?.message || 'unknown error'}`;
    }

    if (found) {
      const patch = { status: 'verified' as const, verifiedAt: Date.now(), updatedAt: Date.now() };
      await ref.set(patch, { merge: true });
      this.logger.log(`[email-domains] VERIFIED ${d.domain} for tenant ${tenantId}`);
      return { domain: { ...d, ...patch }, verified: true };
    }
    this.logger.log(`[email-domains] verify pending for ${d.domain} (tenant ${tenantId}): ${reason}`);
    return { domain: d, verified: false, reason };
  }

  // ───────────────────────── Sending authentication (Brevo DKIM) ─────────────────────────

  private readonly RECORD_LABELS: Record<string, string> = {
    brevo_code: 'Brevo verification',
    dkim1Record: 'DKIM 1',
    dkim2Record: 'DKIM 2',
    dmarc_record: 'DMARC',
  };

  /**
   * The two MX records a tenant must add for `mail.<domain>` so Brevo can catch inbound replies.
   * These are STATIC (confirmed from Brevo docs), appended to sendingRecords alongside DKIM so the
   * tenant sees everything they need to add in one place. NOT verified via Brevo's authenticate
   * endpoint (that only checks DKIM/brevo-code/DMARC) — we surface them for manual DNS addition.
   */
  private inboundMxRecords(domain: string): DomainDnsRecord[] {
    const sub = `mail.${domain}`;
    return [
      { key: 'mx1', type: 'MX', host: sub, value: '10 inbound1.sendinblue.com', label: 'Inbound MX (primary)', verified: false },
      { key: 'mx2', type: 'MX', host: sub, value: '20 inbound2.sendinblue.com', label: 'Inbound MX (backup)',  verified: false },
    ];
  }

  /** Map Brevo's dns_records object → our ordered, UI-ready array. Shape confirmed live (2026-06-05). */
  private mapDnsRecords(dns?: Record<string, BrevoDnsRecord | null>): DomainDnsRecord[] {
    if (!dns) return [];
    const order = ['brevo_code', 'dkim1Record', 'dkim2Record', 'dmarc_record'];
    const keys = [
      ...order.filter((k) => dns[k]),
      ...Object.keys(dns).filter((k) => !order.includes(k) && dns[k]),
    ];
    return keys
      .map((key) => {
        const r = dns[key];
        if (!r || !r.value || !r.host_name) return null;
        return {
          key,
          type: (r.type === 'CNAME' ? 'CNAME' : 'TXT') as 'CNAME' | 'TXT' | 'MX',
          host: r.host_name,
          value: r.value,
          label: this.RECORD_LABELS[key] || key,
          verified: !!r.status,
        } as DomainDnsRecord;
      })
      .filter((r): r is DomainDnsRecord => !!r);
  }

  private async loadOwned(tenantId: string, id: string): Promise<{ ref: FirebaseFirestore.DocumentReference; d: TenantEmailDomain }> {
    const ref = this.db().collection(this.COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as TenantEmailDomain).tenantId !== tenantId) {
      throw new NotFoundException('Domain not found');
    }
    return { ref, d: snap.data() as TenantEmailDomain };
  }

  /**
   * Begin Brevo sending authentication for an OWNERSHIP-verified domain. Registers the domain with
   * Brevo (idempotent — re-reads via GET if it already exists in the account), persists the
   * DKIM/brevo-code/DMARC records for the owner to publish, and sets sendingStatus → 'pending'
   * (or 'verified' if Brevo already reports it authenticated). Returns the records to display.
   */
  async startSendingAuth(tenantId: string, id: string): Promise<{ domain: TenantEmailDomain; records: DomainDnsRecord[] }> {
    if (!this.brevo.isConfigured()) {
      throw new BadRequestException('Email sending is not configured on this server (BREVO_API_KEY missing).');
    }
    const { ref, d } = await this.loadOwned(tenantId, id);
    if (d.status !== 'verified') {
      throw new BadRequestException('Verify domain ownership first, then authenticate sending.');
    }

    // Register with Brevo, or re-read if it already exists in the (shared) Brevo account.
    let detail: BrevoSenderDomain | null = null;
    const created = await this.brevo.createSenderDomain(d.domain);
    if (created.ok) {
      detail = created.data;
    } else {
      const got = await this.brevo.getSenderDomain(d.domain);
      if (!got.ok) {
        const why = created.ipBlocked || got.ipBlocked ? 'this server IP is not authorised in Brevo' : got.error || created.error || 'unknown error';
        throw new BadRequestException(`Could not start sending authentication: ${why}`);
      }
      detail = got.data;
    }

    const records = [
      ...this.mapDnsRecords(detail?.dns_records),
      ...this.inboundMxRecords(d.domain),
    ];
    if (records.length === 0) throw new BadRequestException('Brevo returned no DNS records to publish — please retry.');
    const authenticated = detail?.authenticated === true;
    const now = Date.now();
    const patch: Partial<TenantEmailDomain> = {
      sendingStatus: authenticated ? 'verified' : 'pending',
      brevoDomainId: detail?.id || d.brevoDomainId,
      sendingRecords: records,
      sendingCheckedAt: now,
      updatedAt: now,
      ...(authenticated ? { sendingVerifiedAt: now } : {}),
    };
    await ref.set(patch, { merge: true });
    this.logger.log(`[email-domains] sending-auth started for ${d.domain} (tenant ${tenantId}) → ${patch.sendingStatus}`);
    return { domain: { ...d, ...patch }, records };
  }

  /**
   * Ask Brevo to re-check the published DNS, then read the authoritative status. Flips
   * sendingStatus → 'verified' once Brevo reports the domain authenticated. The CONTROLLER activates
   * the domain's mailboxes when this returns authenticated (keeps the
   * MailboxesService → EmailDomainsService dependency one-way — no forwardRef).
   */
  async checkSendingAuth(
    tenantId: string,
    id: string,
  ): Promise<{ domain: TenantEmailDomain; records: DomainDnsRecord[]; authenticated: boolean; reason?: string }> {
    if (!this.brevo.isConfigured()) {
      throw new BadRequestException('Email sending is not configured on this server (BREVO_API_KEY missing).');
    }
    const { ref, d } = await this.loadOwned(tenantId, id);
    if (d.sendingStatus === 'none') throw new BadRequestException('Start sending authentication first.');

    // Nudge Brevo to re-check (a 400 here just means DNS isn't all live yet), then read the truth.
    const auth = await this.brevo.authenticateSenderDomain(d.domain);
    const got = await this.brevo.getSenderDomain(d.domain);
    if (!got.ok) {
      const why = got.ipBlocked ? 'this server IP is not authorised in Brevo' : got.error || 'unknown error';
      throw new BadRequestException(`Could not check sending authentication: ${why}`);
    }
    const detail = got.data;
    const authenticated = detail?.authenticated === true;
    const records = [
      ...this.mapDnsRecords(detail?.dns_records),
      ...this.inboundMxRecords(d.domain),
    ];
    const now = Date.now();
    const patch: Partial<TenantEmailDomain> = {
      sendingStatus: authenticated ? 'verified' : 'pending',
      ...(records.length ? { sendingRecords: records } : {}),
      sendingCheckedAt: now,
      updatedAt: now,
      ...(authenticated && !d.sendingVerifiedAt ? { sendingVerifiedAt: now } : {}),
    };
    await ref.set(patch, { merge: true });
    const reason = authenticated
      ? undefined
      : auth.ok
        ? 'DNS records not all live yet — allow a few minutes for propagation.'
        : auth.error || 'DNS records not all live yet — allow a few minutes for propagation.';
    this.logger.log(`[email-domains] sending-auth check for ${d.domain} (tenant ${tenantId}) → ${patch.sendingStatus}`);
    return { domain: { ...d, ...patch }, records, authenticated, reason };
  }

  async deleteDomain(tenantId: string, id: string): Promise<{ success: boolean }> {
    const { ref, d } = await this.loadOwned(tenantId, id);
    // Best-effort: deregister the sender domain from Brevo so the shared account doesn't accrue junk.
    if (d.sendingStatus !== 'none' && this.brevo.isConfigured()) {
      try {
        await this.brevo.deleteSenderDomain(d.domain);
      } catch (err: any) {
        this.logger.warn(`[email-domains] Brevo deregister failed for ${d.domain}: ${err?.message || err}`);
      }
    }
    await ref.delete();
    return { success: true };
  }
}
