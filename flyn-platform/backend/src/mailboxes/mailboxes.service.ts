import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import { EmailDomainsService } from './email-domains.service';
import type { TenantMailbox, CreateMailboxDto, LinkMailboxDto } from './mailbox.types';
import { deriveReceivingAddress } from './mailbox.types';

/**
 * CRUD + access resolution for tenant mailboxes (tenant_mailboxes collection).
 *
 * The heart of the design is getMailboxesForUser: a mailbox is visible to every member whose team
 * is in mailbox.teams, plus every uid in mailbox.uids. The org owner (no team_members doc) and
 * admins see all. This ONE function powers both the inbox filter and the outbox From-picker.
 *
 * Reads team_members directly (not via TeamService) to stay dependency-light and avoid a module
 * cycle, mirroring how the email-branding resolver reads collections directly.
 */
@Injectable()
export class MailboxesService {
  private readonly logger = new Logger(MailboxesService.name);
  private readonly COLLECTION = 'tenant_mailboxes';
  private readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly emailDomains: EmailDomainsService,
  ) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  /** All mailboxes for an org (admin/owner view). */
  async listMailboxes(tenantId: string): Promise<TenantMailbox[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const snap = await this.db().collection(this.COLLECTION).where('tenantId', '==', tenantId).get();
    return snap.docs
      .map((d) => d.data() as TenantMailbox)
      .sort((a, b) => a.address.localeCompare(b.address));
  }

  /**
   * THE ACL — mailboxes a given user may see/send-from.
   *   • owner (no team_members doc) or admin → ALL mailboxes
   *   • else → mailboxes where uid ∈ uids OR the member's team ∈ teams
   */
  async getMailboxesForUser(tenantId: string, uid: string): Promise<TenantMailbox[]> {
    if (!tenantId || !uid) return [];
    const all = await this.listMailboxes(tenantId);
    if (all.length === 0) return [];

    const memberSnap = await this.db().collection('team_members').doc(uid).get();
    // No member doc → org owner (created the tenant) → full access.
    if (!memberSnap.exists) return all;

    const member = memberSnap.data() as { role?: string; team?: string };
    if (member.role === 'admin') return all;

    const myTeam = (member.team || '').trim();
    return all.filter(
      (m) => m.uids.includes(uid) || (!!myTeam && m.teams.includes(myTeam)),
    );
  }

  /**
   * Resolve a mailbox by its full address ACROSS tenants — for inbound routing, where the webhook
   * arrives with only the recipient address and no tenant context. Address is unique per tenant; in
   * the (guarded-against) event of a collision, the oldest active mailbox wins. Returns null if none.
   */
  /**
   * Resolve a mailbox by its full address ACROSS tenants — for inbound routing, where the webhook
   * arrives with only the recipient address. Matches BOTH the display address (From identity, apex)
   * AND the receiving address (subdomain Brevo delivers to). This is THE fix that makes Brevo's
   * inbound (To: user@mail.domain) resolve to the mailbox stored as user@domain. Active-then-oldest
   * wins for determinism. Returns null when neither form matches.
   */
  async findMailboxByAddress(address: string): Promise<TenantMailbox | null> {
    const target = (address || '').toLowerCase().trim();
    if (!target) return null;
    // Query both forms in parallel — one will match depending on whether Brevo is delivering to
    // the subdomain (receivingAddress) or someone addressed the display address directly.
    const [byAddr, byReceiving] = await Promise.all([
      this.db().collection(this.COLLECTION).where('address', '==', target).get(),
      this.db().collection(this.COLLECTION).where('receivingAddress', '==', target).get(),
    ]);
    const docs = [...byAddr.docs, ...byReceiving.docs];
    if (!docs.length) return null;
    const seen = new Set<string>();
    const matches = docs
      .filter((d) => { const ok = !seen.has(d.id); seen.add(d.id); return ok; })
      .map((d) => d.data() as TenantMailbox);
    // Active mailbox first, then oldest — deterministic when two tenants share an address (shouldn't happen, but guarded).
    matches.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.createdAt - b.createdAt);
    return matches[0];
  }

  /** One mailbox by id, tenant-scoped (null if missing or cross-tenant). */
  async getMailbox(tenantId: string, id: string): Promise<TenantMailbox | null> {
    if (!tenantId || !id) return null;
    const snap = await this.db().collection(this.COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const m = snap.data() as TenantMailbox;
    return m.tenantId === tenantId ? m : null;
  }

  /** Whether a user may send AS a given address (outbox gate). */
  async canSendAs(tenantId: string, uid: string, address: string): Promise<boolean> {
    const mine = await this.getMailboxesForUser(tenantId, uid);
    const target = (address || '').toLowerCase().trim();
    return mine.some((m) => m.address === target);
  }

  /**
   * Whether `uid` may access a SPECIFIC mailbox by id — the per-conversation gate behind the inbox
   * detail/action routes (the IDOR fix). Mirrors getMailboxesForUser's rule for ONE mailbox without
   * listing them all: owner (no team_members doc) and admins see every mailbox; everyone else needs a
   * team match or a hand-picked uid. A missing/cross-tenant mailbox → false for a member (owner/admin
   * already short-circuited, so they retain access to threads on a since-deleted mailbox).
   */
  async canAccessMailbox(tenantId: string, uid: string, mailboxId: string): Promise<boolean> {
    if (!mailboxId) return true; // untagged conversation → visible to all tenant members
    if (!tenantId || !uid) return false;
    const memberSnap = await this.db().collection('team_members').doc(uid).get();
    if (!memberSnap.exists) return true; // org owner → all
    const member = memberSnap.data() as { role?: string; team?: string };
    if (member.role === 'admin') return true; // admin → all
    const mailbox = await this.getMailbox(tenantId, mailboxId);
    if (!mailbox) return false;
    const myTeam = (member.team || '').trim();
    return mailbox.uids.includes(uid) || (!!myTeam && mailbox.teams.includes(myTeam));
  }

  async createMailbox(tenantId: string, createdBy: string, dto: CreateMailboxDto): Promise<TenantMailbox> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const address = (dto.address || '').toLowerCase().trim();
    if (!this.EMAIL_RE.test(address)) throw new BadRequestException('A valid email address is required');
    const [localPart, domain] = address.split('@');

    // OWNERSHIP GATE (the security boundary — never trust the client). A mailbox may only be created
    // on a domain this tenant has ADDED and DNS-verified it owns. This rejection holds even if the
    // UI is bypassed with a forged payload (e.g. marketing@google.com). See email-domains.service.ts.
    if (!(await this.emailDomains.isVerifiedDomain(tenantId, domain))) {
      throw new BadRequestException(
        `You can only create mailboxes on a domain you've added and verified. Add "${domain}" under Your Domains and verify ownership first.`,
      );
    }

    // Uniqueness — one mailbox per address per tenant.
    const existing = await this.db()
      .collection(this.COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('address', '==', address)
      .limit(1)
      .get();
    if (!existing.empty) throw new BadRequestException(`Mailbox ${address} already exists`);

    const now = Date.now();
    const mailbox: TenantMailbox = {
      id: randomUUID(),
      tenantId,
      address,
      localPart,
      domain,
      // Derived once — the subdomain address Brevo delivers inbound mail to. The apex domain MX
      // is never touched (it may be Google/Microsoft). See deriveReceivingAddress in mailbox.types.
      receivingAddress: deriveReceivingAddress(localPart, domain),
      teams: [], // unlinked — assigned later via the Link picker
      uids: [],
      status: 'pending', // becomes 'active' once the domain is authenticated with the provider
      createdAt: now,
      updatedAt: now,
      createdBy,
    };
    await this.db().collection(this.COLLECTION).doc(mailbox.id).set(mailbox);
    this.logger.log(`[mailboxes] created ${address} for tenant ${tenantId}`);
    return mailbox;
  }

  /** Set the full access set from the checkbox picker (replaces any prior linkage). */
  async linkMailbox(tenantId: string, id: string, dto: LinkMailboxDto): Promise<TenantMailbox> {
    const ref = this.db().collection(this.COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as TenantMailbox).tenantId !== tenantId) {
      throw new NotFoundException('Mailbox not found');
    }

    // Validate every uid/team against the org's actual members in one read (prevents linking
    // strangers or non-existent teams from a forged payload).
    const membersSnap = await this.db().collection('team_members').where('tenantId', '==', tenantId).get();
    const validUids = new Set(membersSnap.docs.map((d) => d.id));
    const validTeams = new Set(
      membersSnap.docs.map((d) => (d.data() as { team?: string }).team?.trim()).filter(Boolean) as string[],
    );

    const uids = Array.from(new Set((dto.uids || []).filter((u) => validUids.has(u))));
    const teams = Array.from(new Set((dto.teams || []).map((t) => t.trim()).filter((t) => validTeams.has(t))));

    const patch: Partial<TenantMailbox> = { teams, uids, updatedAt: Date.now() };
    await ref.set(patch, { merge: true });
    this.logger.log(`[mailboxes] linked ${(snap.data() as TenantMailbox).address} → ${teams.length} team(s), ${uids.length} user(s)`);
    return { ...(snap.data() as TenantMailbox), ...patch } as TenantMailbox;
  }

  /**
   * Flip every PENDING mailbox on a now-sending-authenticated domain to 'active' (sendable). Called
   * from EmailDomainsController after a domain's sendingStatus reaches 'verified'. Orchestrating here
   * (controller injects both services) keeps the MailboxesService → EmailDomainsService dependency
   * one-way — EmailDomainsService never imports MailboxesService.
   */
  async activateMailboxesForDomain(tenantId: string, domain: string): Promise<{ activated: number; addresses: string[] }> {
    const target = (domain || '').toLowerCase().trim();
    if (!tenantId || !target) return { activated: 0, addresses: [] };
    const snap = await this.db()
      .collection(this.COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('domain', '==', target)
      .where('status', '==', 'pending')
      .get();
    const addresses: string[] = [];
    for (const doc of snap.docs) {
      await doc.ref.set({ status: 'active', updatedAt: Date.now() }, { merge: true });
      addresses.push((doc.data() as TenantMailbox).address);
    }
    if (addresses.length) this.logger.log(`[mailboxes] activated ${addresses.length} mailbox(es) on ${target} (tenant ${tenantId})`);
    return { activated: addresses.length, addresses };
  }

  /** Mailboxes on a domain NOT verified-owned by the tenant — junk from before the ownership gate. */
  async listOrphans(tenantId: string): Promise<TenantMailbox[]> {
    const [all, verified] = await Promise.all([
      this.listMailboxes(tenantId),
      this.emailDomains.listVerified(tenantId),
    ]);
    const owned = new Set(verified.map((d) => d.domain));
    return all.filter((m) => !owned.has(m.domain));
  }

  /** Delete every orphan mailbox (logged; recreatable on a verified domain). Verified ones untouched. */
  async deleteOrphans(tenantId: string): Promise<{ deleted: number; addresses: string[] }> {
    const orphans = await this.listOrphans(tenantId);
    for (const m of orphans) {
      await this.db().collection(this.COLLECTION).doc(m.id).delete();
      this.logger.warn(`[mailboxes] orphan deleted: ${m.address} (domain not verified-owned) tenant ${tenantId}`);
    }
    return { deleted: orphans.length, addresses: orphans.map((m) => m.address) };
  }

  async deleteMailbox(tenantId: string, id: string): Promise<{ success: boolean }> {
    const ref = this.db().collection(this.COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as TenantMailbox).tenantId !== tenantId) {
      throw new NotFoundException('Mailbox not found');
    }
    await ref.delete();
    return { success: true };
  }
}
