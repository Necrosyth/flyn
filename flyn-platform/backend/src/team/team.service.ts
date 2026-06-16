import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { MailService } from '../mail/mail.service';
import { TenantsService } from '../tenants/tenants.service';
import type { TeamMemberPermissions, TeamMemberRecord, TeamRole, ModuleAccess, ModuleAccessLevel } from './team.types';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);
  private readonly COLLECTION = 'team_members';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
    private readonly tenants: TenantsService,
  ) {}

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new Error('Firestore not initialised');
    return db;
  }

  private auth() {
    const auth = this.firebase.auth();
    if (!auth) throw new Error('Firebase not initialized');
    return auth;
  }

  private normalizeRole(role: string): TeamRole {
    if (role === 'admin' || role === 'manager' || role === 'agent') return role;
    throw new BadRequestException('Invalid role');
  }

  private defaultPermissions(role: TeamRole): TeamMemberPermissions {
    if (role === 'admin') return { accessCRM: true, manageUsers: true, editSettings: true };
    if (role === 'manager') return { accessCRM: true, manageUsers: true, editSettings: true };
    return { accessCRM: true, manageUsers: false, editSettings: false };
  }

  /**
   * Generate module access based on tenant's plan tier.
   * Admins get full access to all plan features.
   * Managers/Agents get full access to their allowed modules.
   */
  private async generateModuleAccessByPlan(
    tenantId: string,
    role: TeamRole,
  ): Promise<ModuleAccess> {
    try {
      const { plan } = await this.tenants.getTenantPlan(tenantId);
      const access: ModuleAccess = {};
      const accessLevel: ModuleAccessLevel = role === 'admin' ? 'full' : 'full';

      // Map plan tiers to module availability
      const planModules: Record<string, string[]> = {
        free: [
          'crm', 'unified_inbox', 'phonebook',
          'email',
          'dashboard',
        ],
        starter: [
          'crm', 'unified_inbox', 'phonebook',
          'whatsapp', 'email',
          'ai_agents', 'ai_summaries',
          'workflows', 'automations',
          'dashboard', 'tasks', 'calendar',
        ],
        growth: [
          'crm', 'unified_inbox', 'phonebook',
          'whatsapp', 'telegram', 'email',
          'ai_agents', 'ai_summaries', 'ai_sentiment',
          'workflows', 'automations',
          'api_access',
          'telephony', 'ivr',
          'dashboard', 'tasks', 'calendar', 'contracts',
        ],
        pro: [
          'crm', 'unified_inbox', 'phonebook',
          'whatsapp', 'telegram', 'email',
          'ai_agents', 'ai_summaries', 'ai_sentiment',
          'workflows', 'automations',
          'api_access', 'white_label', 'custom_domains',
          'telephony', 'ivr',
          'dashboard', 'tasks', 'calendar', 'contracts', 'branding',
        ],
        enterprise: [
          // All modules available
          'crm', 'unified_inbox', 'phonebook',
          'whatsapp', 'telegram', 'email',
          'ai_agents', 'ai_summaries', 'ai_sentiment',
          'workflows', 'automations',
          'api_access', 'white_label', 'custom_domains',
          'telephony', 'ivr',
          'dashboard', 'tasks', 'calendar', 'contracts', 'branding',
        ],
      };

      const allowedModules = planModules[plan] || planModules.free;

      // Set all known modules
      const allModules: (keyof ModuleAccess)[] = [
        'crm', 'unified_inbox', 'phonebook', 'dashboard',
        'whatsapp', 'telegram', 'email',
        'ai_agents', 'ai_summaries', 'ai_sentiment',
        'workflows', 'automations',
        'api_access', 'white_label', 'custom_domains',
        'telephony', 'ivr',
        'tasks', 'calendar', 'contracts', 'branding',
      ];

      allModules.forEach((module) => {
        access[module] = allowedModules.includes(module as string) ? accessLevel : 'none';
      });

      return access;
    } catch (err) {
      this.logger.warn(`Failed to generate module access for ${tenantId}: ${(err as Error).message}`);
      // Fallback: no module access on error
      return {};
    }
  }

  async listMembers(tenantId: string): Promise<TeamMemberRecord[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const snap = await this.db().collection(this.COLLECTION).where('tenantId', '==', tenantId).get();
    return snap.docs
      .map((d) => d.data() as TeamMemberRecord)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /**
   * The caller's own role + module access, for client-side gating.
   * No team-member doc = org owner (created the tenant) → full access.
   */
  async getMyAccess(uid: string): Promise<{ role: TeamRole; moduleAccess: ModuleAccess }> {
    const doc = await this.db().collection(this.COLLECTION).doc(uid).get();
    if (!doc.exists) return { role: 'owner' as TeamRole, moduleAccess: {} };
    const d = doc.data() as TeamMemberRecord;
    return { role: (d.role || 'agent') as TeamRole, moduleAccess: d.moduleAccess || {} };
  }

  async peekInvite(code: string): Promise<{ valid: true; orgName: string; invitedEmail: string; role: TeamRole; expiresAt: number }> {
    const snap = await this.db().collection('invitations')
      .where('code', '==', code.trim())
      .where('used', '==', false)
      .get();

    if (snap.empty) {
      throw new BadRequestException('Invalid or expired invite code');
    }

    const data = snap.docs[0].data();
    const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

    if (Date.now() - data.createdAt > INVITE_TTL_MS) {
      throw new BadRequestException('Invite code has expired');
    }

    let orgName = 'your organization';
    try {
      const tenant = await this.tenants.getTenant(data.tenantId);
      orgName = tenant.name || 'your organization';
    } catch {
      // tenant lookup failure should not block invite validation
    }

    return {
      valid: true,
      orgName,
      invitedEmail: data.email,
      role: data.role as TeamRole,
      expiresAt: data.createdAt + INVITE_TTL_MS,
    };
  }

  async validateInviteCode(inviteCode: string): Promise<{ tenantId: string; email: string; role: TeamRole }> {
    const snap = await this.db().collection('invitations')
      .where('code', '==', inviteCode.trim())
      .where('used', '==', false)
      .get();

    if (snap.empty) {
      throw new BadRequestException('Invalid or expired invite code');
    }

    const data = snap.docs[0].data();

    const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
    if (Date.now() - data.createdAt > INVITE_TTL_MS) {
      throw new BadRequestException('Invite code has expired');
    }

    return {
      tenantId: data.tenantId,
      email: data.email,
      role: data.role as TeamRole,
    };
  }

  async joinWithInvite(uid: string, inviteCode: string): Promise<TeamMemberRecord> {
    const { tenantId, email, role } = await this.validateInviteCode(inviteCode);
    
    // Check if user already exists in auth
    const auth = this.auth();
    const user = await auth.getUser(uid);

    this.logger.log(`[JOIN] Email check — firebase: "${user.email?.toLowerCase()}" invite: "${email.toLowerCase()}"`);
    if (user.email?.toLowerCase() !== email.toLowerCase()) {
      this.logger.warn(`[JOIN] Email mismatch — uid=${uid} firebase="${user.email}" invite="${email}"`);
      throw new BadRequestException(`This invite was sent to ${email}. Please sign in with that email address.`);
    }

    // Set custom claims — include tenant plan so UI feature gates work immediately
    const { plan } = await this.tenants.getTenantPlan(tenantId);
    await auth.setCustomUserClaims(uid, {
      ...(user.customClaims ?? {}),
      organization_id: tenantId,
      role,
      plan,
    });

    const now = Date.now();
    const record: TeamMemberRecord = {
      uid,
      tenantId,
      email: user.email.toLowerCase(),
      name: user.displayName || "",
      role,
      permissions: this.defaultPermissions(role),
      createdAt: now,
      updatedAt: now,
    };

    // Save member record
    await this.db().collection(this.COLLECTION).doc(uid).set(record);

    // Mark invite as used
    const inviteDoc = (await this.db().collection('invitations').where('code', '==', inviteCode).get()).docs[0];
    await inviteDoc.ref.update({ used: true, usedAt: now, usedBy: uid });

    return record;
  }

  async inviteMember(params: { tenantId: string; email: string; role: string; team?: string }) {
    const { tenantId, email, team } = params;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!email?.trim()) throw new BadRequestException('email is required');
    const role = this.normalizeRole(params.role);

    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // 4 bytes = 4.3B combinations — collision probability < 0.01% at 10,000 concurrent invites
    const inviteCode = `FLYN-${randomBytes(4).toString('hex').toUpperCase()}`;

    await this.db().collection('invitations').add({
      code: inviteCode,
      tenantId,
      email: normalizedEmail,
      role,
      used: false,
      createdAt: now,
    });

    const signupUrl = `https://app.myflynai.com/signup?invite=${inviteCode}`;

    // Get the tenant's logo for the email
    let logoUrl = 'https://app.myflynai.com/assets/flyn_icon.png';
    try {
      const tenantSnap = await this.db().collection('tenants').doc(tenantId).get();
      const tenantData = tenantSnap.data() as any;
      if (tenantData?.logoUrl) {
        logoUrl = tenantData.logoUrl;
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch tenant logo for invite email: ${err.message}`);
    }

    this.mail.sendEmail({
      to: normalizedEmail,
      subject: `You've been invited to join a team on FLYNAI`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${logoUrl}" alt="Organization Logo" style="height: 48px; width: auto;" />
          </div>
          <h1 style="color: #6366f1; text-align: center;">Welcome to FLYNAI</h1>
          <p>You've been invited to join an organization on FLYNAI as a <strong>${role}</strong>.</p>
          <p>Use the invite code below when signing up:</p>
          <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; font-family: monospace; color: #18181b;">${inviteCode}</span>
          </div>
          <p>Or click the link below to go directly to the signup page with your invite pre-filled:</p>
          <a href="${signupUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Accept Invitation</a>
          <br/><br/>
          <p style="color: #71717a; font-size: 14px;">This invite expires in 72 hours. If you did not expect this email, you can safely ignore it.</p>
        </div>
      `,
    }).catch(err => this.logger.error(`Failed to send invite email to ${normalizedEmail}: ${err.message}`));

    return { email: normalizedEmail, role, tenantId, inviteCode };
  }

  async updateMember(params: {
    tenantId: string;
    uid: string;
    role?: string;
    team?: string | null;
    permissions?: Partial<TeamMemberPermissions>;
  }): Promise<TeamMemberRecord> {
    const { tenantId, uid } = params;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!uid) throw new BadRequestException('uid is required');

    const ref = this.db().collection(this.COLLECTION).doc(uid);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Member not found');

    const existing = doc.data() as TeamMemberRecord;
    if (existing.tenantId !== tenantId) throw new NotFoundException('Member not found');

    const nextRole: TeamRole = params.role ? this.normalizeRole(params.role) : existing.role;
    const nextPermissions: TeamMemberPermissions = {
      ...existing.permissions,
      ...(params.permissions || {}),
    };

    const updated: TeamMemberRecord = {
      ...existing,
      role: nextRole,
      team: params.team === null ? undefined : (params.team ?? existing.team),
      permissions: nextPermissions,
      updatedAt: Date.now(),
    };

    await ref.set(updated, { merge: true });

    if (params.role) {
      try {
        const memberUser = await this.auth().getUser(uid);
        await this.auth().setCustomUserClaims(uid, {
          ...(memberUser.customClaims ?? {}),
          organization_id: tenantId,
          role: nextRole,
        });
      } catch (err) {
        this.logger.warn(`Failed to update custom claims for uid=${uid}`);
      }
    }

    return updated;
  }

  async updateMemberModuleAccess(params: {
    tenantId: string;
    uid: string;
    moduleAccess: Partial<ModuleAccess>;
  }): Promise<TeamMemberRecord> {
    const { tenantId, uid, moduleAccess } = params;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!uid) throw new BadRequestException('uid is required');

    const ref = this.db().collection(this.COLLECTION).doc(uid);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Member not found');

    const existing = doc.data() as TeamMemberRecord;
    if (existing.tenantId !== tenantId) throw new NotFoundException('Member not found');

    const updated: TeamMemberRecord = {
      ...existing,
      moduleAccess: {
        ...existing.moduleAccess,
        ...moduleAccess,
      },
      updatedAt: Date.now(),
    };

    await ref.set(updated, { merge: true });
    return updated;
  }

  async removeMember(params: {
    tenantId: string;
    uid: string;
    revokedByUid: string;
    revokedByEmail: string;
    revokedByName: string;
  }): Promise<{ ok: true }> {
    const { tenantId, uid, revokedByUid, revokedByEmail, revokedByName } = params;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!uid) throw new BadRequestException('uid is required');
    if (uid === revokedByUid) throw new BadRequestException('You cannot revoke your own access');

    const ref = this.db().collection(this.COLLECTION).doc(uid);
    const doc = await ref.get();
    if (!doc.exists) throw new NotFoundException('Member not found');
    const member = doc.data() as TeamMemberRecord;
    if (member.tenantId !== tenantId) throw new NotFoundException('Member not found');

    const memberEmail = member.email;
    const memberFirstName = (member.name || memberEmail.split('@')[0]).split(' ')[0];

    let orgName = 'your organization';
    try {
      const tenant = await this.tenants.getTenant(tenantId);
      orgName = tenant.name || 'your organization';
    } catch { /* non-blocking */ }

    // Delete team member record
    await ref.delete();

    // Clear Firebase custom claims
    try {
      await this.auth().setCustomUserClaims(uid, {});
    } catch (err) { void err; }

    // Kick all active sessions immediately
    try {
      await this.auth().revokeRefreshTokens(uid);
    } catch (err) {
      this.logger.warn(`Failed to revoke refresh tokens for uid=${uid}: ${(err as Error).message}`);
    }

    // Mark any open invitations for this email+tenant as revoked
    const now = Date.now();
    try {
      const inviteSnap = await this.db().collection('invitations')
        .where('email', '==', memberEmail.toLowerCase())
        .where('tenantId', '==', tenantId)
        .where('used', '==', false)
        .get();
      if (!inviteSnap.empty) {
        const batch = this.db().batch();
        inviteSnap.docs.forEach(d => batch.update(d.ref, { revoked: true, revokedAt: now, revokedBy: revokedByUid }));
        await batch.commit();
      }
    } catch (err) {
      this.logger.warn(`Failed to mark invitations revoked for ${memberEmail}: ${(err as Error).message}`);
    }

    // Send revocation email (fire-and-forget)
    this.mail.sendRevocationEmail({
      to: memberEmail,
      memberFirstName,
      orgName,
      adminName: revokedByName || revokedByEmail,
    }).catch(err => this.logger.error(`Failed to send revocation email to ${memberEmail}: ${err.message}`));

    return { ok: true };
  }

  async revokeInvite(params: {
    code: string;
    tenantId: string;
    revokedByUid: string;
  }): Promise<{ ok: true }> {
    const { code, tenantId, revokedByUid } = params;

    const snap = await this.db().collection('invitations')
      .where('code', '==', code.trim())
      .where('used', '==', false)
      .get();

    if (snap.empty) throw new NotFoundException('Invite not found or already used');

    const inviteDoc = snap.docs[0];
    const data = inviteDoc.data();
    if (data.tenantId !== tenantId) throw new NotFoundException('Invite not found');

    const now = Date.now();
    await inviteDoc.ref.update({ used: true, revoked: true, revokedAt: now, revokedBy: revokedByUid });

    let orgName = 'your organization';
    try {
      const tenant = await this.tenants.getTenant(tenantId);
      orgName = tenant.name || 'your organization';
    } catch { /* non-blocking */ }

    this.mail.sendInviteCancelledEmail({ to: data.email, orgName })
      .catch(err => this.logger.error(`Failed to send invite cancel email to ${data.email}: ${err.message}`));

    return { ok: true };
  }

  async listPendingInvites(tenantId: string): Promise<{ code: string; email: string; role: TeamRole; createdAt: number }[]> {
    const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
    const snap = await this.db().collection('invitations')
      .where('tenantId', '==', tenantId)
      .where('used', '==', false)
      .get();

    const now = Date.now();
    return snap.docs
      .map(d => d.data())
      .filter(d => !d.revoked && (now - d.createdAt) < INVITE_TTL_MS)
      .map(d => ({ code: d.code, email: d.email, role: d.role as TeamRole, createdAt: d.createdAt }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
