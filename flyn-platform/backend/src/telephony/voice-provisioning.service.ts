import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { TenantsService } from '../tenants/tenants.service';
import { MailService } from '../mail/mail.service';
import { StripeService } from '../billing/gateways/stripe/stripe.service';
import {
  PoolNumber,
  PoolNumberStatus,
  VoiceActivationRequest,
  ActivationStatus,
  FlynVoiceState,
  PoolCounts,
  TenantVoiceNumber,
  VoiceSubscriptionMap,
} from './voice-provisioning.types';

/**
 * VoiceProvisioningService
 *
 * Pool + admin-approval provisioning for Flyn Voice. Uses Flyn's platform Twilio
 * account (FLYN_TWILIO_ACCOUNT_SID / FLYN_TWILIO_AUTH_TOKEN) and routes calls
 * through the in-house channels AI flow. See voice-provisioning.types.ts.
 */
@Injectable()
export class VoiceProvisioningService {
  private readonly logger = new Logger(VoiceProvisioningService.name);

  private readonly POOL = 'platform_phone_pool';
  private readonly REQUESTS = 'voice_activation_requests';
  private readonly NOTIFS = 'admin_notifications';
  private readonly SUBS = 'flyn_voice_subscriptions'; // reverse map: {subId} → tenant/number

  /** Monthly price per ADDITIONAL number (smallest unit). First number is free. */
  private readonly NUMBER_PRICE_CENTS = 115; // $1.15/mo
  private readonly NUMBER_PRICE_CURRENCY = 'USD';

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantsService,
    private readonly mail: MailService,
    private readonly stripe: StripeService,
  ) {}

  // ─── Env / helpers ───────────────────────────────────────────────────────

  private get twSid() {
    return process.env.FLYN_TWILIO_ACCOUNT_SID ?? '';
  }
  private get twToken() {
    return process.env.FLYN_TWILIO_AUTH_TOKEN ?? '';
  }
  private get backendUrl() {
    return (process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
  }

  private db() {
    const db = this.firebase.firestore();
    if (!db) throw new BadRequestException('Database is not available.');
    return db;
  }

  private requireTwilioEnv() {
    if (!this.twSid || !this.twToken) {
      throw new BadRequestException(
        'Flyn Voice is not configured on this server. Contact your administrator.',
      );
    }
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private async getTenantName(tenantId: string): Promise<string> {
    const tenant = await this.tenants.getTenant(tenantId).catch(() => null);
    return (tenant as any)?.name ?? (tenant as any)?.domain ?? tenantId;
  }

  private async patchFlynVoice(tenantId: string, patch: Partial<FlynVoiceState>): Promise<void> {
    const tenant = await this.tenants.getTenant(tenantId).catch(() => null);
    const current: FlynVoiceState =
      (tenant as any)?.flynVoice ?? {
        status: 'inactive',
        phoneNumber: null,
        phoneNumberSid: null,
        activatedAt: null,
      };
    await this.tenants.updateTenant(tenantId, {
      flynVoice: { ...current, ...patch },
    } as any);
  }

  private async getFlynVoice(tenantId: string): Promise<FlynVoiceState | null> {
    const tenant = await this.tenants.getTenant(tenantId).catch(() => null);
    return ((tenant as any)?.flynVoice as FlynVoiceState) ?? null;
  }

  // ─── Admin notifications ─────────────────────────────────────────────────

  private async notifyAdmin(
    type: string,
    payload: Record<string, unknown>,
    email?: { subject: string; body: string },
  ): Promise<void> {
    try {
      await this.db()
        .collection(this.NOTIFS)
        .add({ type, ...payload, read: false, createdAt: this.nowIso() });
    } catch (err: any) {
      this.logger.warn(`admin_notifications write failed: ${err?.message}`);
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && email) {
      this.mail
        .sendEmail({ to: adminEmail, subject: email.subject, html: email.body })
        .catch((e) => this.logger.warn(`Admin email failed: ${e?.message}`));
    }
  }

  // ─── METHOD 1: requestActivation ─────────────────────────────────────────

  async requestActivation(tenantId: string, requestedByUid: string) {
    const reqRef = this.db().collection(this.REQUESTS).doc(tenantId);
    const existing = await reqRef.get();
    if (existing.exists) {
      const data = existing.data() as VoiceActivationRequest;
      if (data.status === 'active') {
        throw new ConflictException('Flyn Voice is already active for this workspace.');
      }
      if (data.status === 'pending' || data.status === 'pending_number') {
        throw new ConflictException('Your activation request is already under review.');
      }
    }

    const tenantName = await this.getTenantName(tenantId);
    const requestedAt = this.nowIso();

    const request: VoiceActivationRequest = {
      tenantId,
      tenantName,
      requestedBy: requestedByUid,
      requestedAt,
      status: 'pending',
      assignedNumber: null,
      assignedNumberSid: null,
      approvedBy: null,
      approvedAt: null,
      rejectedReason: null,
      webhookConfigured: false,
    };
    await reqRef.set(request);

    await this.patchFlynVoice(tenantId, { status: 'pending' });

    await this.notifyAdmin(
      'voice_activation_request',
      { tenantId, tenantName, requestedAt },
      {
        subject: `Flyn Voice activation request — ${tenantName}`,
        body: `<p><strong>${tenantName}</strong> (tenant <code>${tenantId}</code>) requested Flyn Voice activation.</p>
               <p>Review it in the admin panel → Voice Provisioning → Pending Requests.</p>`,
      },
    );

    this.logger.log(`Voice activation requested by tenant ${tenantId}`);
    return { status: 'pending' as const, message: 'Your request is under review.' };
  }

  // ─── METHOD 2: approveActivation ─────────────────────────────────────────

  async approveActivation(tenantId: string, approvedByUid: string) {
    this.requireTwilioEnv();
    const reqRef = this.db().collection(this.REQUESTS).doc(tenantId);
    const snap = await reqRef.get();
    if (!snap.exists) throw new NotFoundException('No activation request found for this tenant.');
    const request = snap.data() as VoiceActivationRequest;
    if (request.status === 'active') {
      throw new ConflictException('This tenant already has Flyn Voice active.');
    }
    if (request.status !== 'pending' && request.status !== 'pending_number') {
      throw new BadRequestException(`Request is in status "${request.status}" and cannot be approved.`);
    }

    // Find an available number in the pool.
    const poolSnap = await this.db()
      .collection(this.POOL)
      .where('status', '==', 'available')
      .limit(1)
      .get();

    if (poolSnap.empty) {
      // Pool empty — waitlist this request.
      await reqRef.set({ status: 'pending_number', approvedBy: approvedByUid } as Partial<VoiceActivationRequest>, {
        merge: true,
      });
      await this.patchFlynVoice(tenantId, { status: 'pending' });
      await this.notifyAdmin(
        'pool_empty',
        { tenantId, tenantName: request.tenantName },
        {
          subject: 'Flyn Voice — number pool is empty',
          body: `<p>Cannot approve <strong>${request.tenantName}</strong>: no numbers available in the pool.</p>
                 <p>Add numbers in the admin panel → Voice Provisioning → Number Pool. The oldest waitlisted request is auto-fulfilled when a number is added.</p>`,
        },
      );
      return { status: 'pending_number' as const, message: 'No numbers available in pool.' };
    }

    const poolDoc = poolSnap.docs[0];
    const pool = poolDoc.data() as PoolNumber;
    const selectedAgentId = (await this.getFlynVoice(tenantId))?.selectedAgentId ?? undefined;

    // Reserve first (race guard) — never hand the same number to two tenants.
    await poolDoc.ref.set(
      { status: 'reserved' as PoolNumberStatus, assignedTo: tenantId, assignedAt: this.nowIso() },
      { merge: true },
    );

    try {
      await this.configureNumberWebhooks(pool.twilioSid, tenantId, selectedAgentId);
    } catch (err: any) {
      // Revert reservation so the number stays usable.
      await poolDoc.ref.set(
        { status: 'available' as PoolNumberStatus, assignedTo: null, assignedAt: null },
        { merge: true },
      );
      await reqRef.set({ status: 'pending' } as Partial<VoiceActivationRequest>, { merge: true });
      this.logger.error(`Webhook config failed for ${pool.number}: ${err?.message}`);
      throw new BadRequestException(`Failed to configure number: ${err?.message ?? err}`);
    }

    const approvedAt = this.nowIso();
    await poolDoc.ref.set({ status: 'assigned' as PoolNumberStatus, assignedAt: approvedAt }, { merge: true });
    await reqRef.set(
      {
        status: 'active',
        assignedNumber: pool.number,
        assignedNumberSid: pool.twilioSid,
        approvedBy: approvedByUid,
        approvedAt,
        webhookConfigured: true,
      } as Partial<VoiceActivationRequest>,
      { merge: true },
    );
    await this.patchFlynVoice(tenantId, {
      status: 'active',
      phoneNumber: pool.number,
      phoneNumberSid: pool.twilioSid,
      activatedAt: approvedAt,
    });

    this.logger.log(`Flyn Voice activated for tenant ${tenantId}: ${pool.number}`);
    return { status: 'active' as const, phoneNumber: pool.number, message: 'Flyn Voice activated.' };
  }

  // ─── METHOD 3: configureNumberWebhooks ───────────────────────────────────

  /**
   * Point the platform Twilio number's webhooks at Flyn's backend for this tenant.
   * Voice + status route to the in-house channels AI flow; SMS routes to the
   * telephony SMS webhook. tenantId (and optional agentId) are embedded in the URLs.
   */
  async configureNumberWebhooks(
    phoneNumberSid: string,
    tenantId: string,
    agentId?: string,
  ): Promise<{ configured: true }> {
    // Platform Twilio creds are REQUIRED to point a number's webhook at Flyn.
    // In dev (localhost) we skip so the UI flow can be exercised; in production we
    // MUST fail loudly — silently returning success here is what left numbers with
    // a blank Voice URL ("provisioned but doesn't work").
    if (!this.twSid || !this.twToken) {
      const isProd = process.env.NODE_ENV === 'production';
      if (isProd) {
        this.logger.error('FLYN_TWILIO creds absent in production — cannot configure number webhook.');
        throw new BadRequestException(
          'Voice provisioning is not configured: FLYN_TWILIO_ACCOUNT_SID / FLYN_TWILIO_AUTH_TOKEN are missing on the server.',
        );
      }
      this.logger.warn('[dev] FLYN_TWILIO creds absent — skipping Twilio webhook configuration.');
      return { configured: true };
    }
    if (!this.backendUrl) {
      throw new BadRequestException('PUBLIC_BACKEND_URL is not configured.');
    }
    const t = encodeURIComponent(tenantId);
    let voiceUrl = `${this.backendUrl}/api/channels/webhook/twilio/inbound-voice?tenantId=${t}`;
    if (agentId) voiceUrl += `&agentId=${encodeURIComponent(agentId)}`;
    const statusCallbackUrl = `${this.backendUrl}/api/channels/webhook/twilio/call-status?tenantId=${t}`;
    const smsUrl = `${this.backendUrl}/api/telephony/webhook/sms?tenantId=${t}`;

    const body = new URLSearchParams({
      VoiceUrl: voiceUrl,
      VoiceMethod: 'POST',
      StatusCallback: statusCallbackUrl,
      StatusCallbackMethod: 'POST',
      SmsUrl: smsUrl,
      SmsMethod: 'POST',
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.twSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${this.twSid}:${this.twToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err?.message ?? `Twilio webhook config failed: HTTP ${res.status}`);
    }
    return { configured: true };
  }

  /** Clear all webhooks on a number (used on deactivation). Best-effort. */
  private async clearNumberWebhooks(phoneNumberSid: string): Promise<void> {
    if (!this.twSid || !this.twToken) return;
    const body = new URLSearchParams({ VoiceUrl: '', SmsUrl: '', StatusCallback: '' });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.twSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${this.twSid}:${this.twToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );
    if (!res.ok) {
      this.logger.warn(`Clearing webhooks for ${phoneNumberSid} returned HTTP ${res.status}`);
    }
  }

  // ─── METHOD 4: deactivateVoice ───────────────────────────────────────────

  /**
   * Turn off Flyn Voice. FREE numbers are released immediately (free-first count
   * resets). PAID numbers are scheduled to cancel at period end (locked, no refund)
   * and only released when Stripe confirms the subscription ended.
   */
  async deactivateVoice(tenantId: string, _deactivatedByUid: string) {
    const numbersSnap = await this.numbersCol(tenantId).get();
    const held = numbersSnap.docs.map((d) => d.data() as TenantVoiceNumber);

    // Legacy fallback: flynVoice summary with no subcollection docs (treat as free).
    if (held.length === 0) {
      const fv = await this.getFlynVoice(tenantId);
      if (fv?.phoneNumber) {
        held.push({ number: fv.phoneNumber, twilioSid: fv.phoneNumberSid ?? '', billable: false } as TenantVoiceNumber);
      }
    }

    let releasedFree = 0;
    let scheduledPaid = 0;
    for (const n of held) {
      if (!n.billable) {
        await this.releaseHeldNumber(tenantId, n);
        releasedFree++;
      } else if (n.status !== 'canceling' && n.stripeSubscriptionId) {
        try {
          const { currentPeriodEnd } = await this.stripe.cancelSubscriptionAtPeriodEnd(n.stripeSubscriptionId);
          await this.numbersCol(tenantId).doc(n.number)
            .set({ status: 'canceling', cancelAtPeriodEnd: true, periodEnd: currentPeriodEnd } as Partial<TenantVoiceNumber>, { merge: true });
          await this.db().collection(this.SUBS).doc(n.stripeSubscriptionId)
            .set({ status: 'canceling', periodEnd: currentPeriodEnd } as Partial<VoiceSubscriptionMap>, { merge: true }).catch(() => {});
          scheduledPaid++;
        } catch (e: any) {
          this.logger.warn(`Could not schedule cancel for paid number ${n.number}: ${e?.message}`);
        }
      }
    }

    // If no numbers remain at all, fully reset the summary + request mirror.
    const remaining = await this.numbersCol(tenantId).get();
    if (remaining.empty) {
      await this.patchFlynVoice(tenantId, { status: 'inactive', phoneNumber: null, phoneNumberSid: null, activatedAt: null });
      await this.db().collection(this.REQUESTS).doc(tenantId)
        .set({ status: 'inactive' as ActivationStatus } as Partial<VoiceActivationRequest>, { merge: true }).catch(() => {});
    }

    this.logger.log(`Flyn Voice deactivate for tenant ${tenantId}: released ${releasedFree} free, scheduled ${scheduledPaid} paid`);
    return { deactivated: true as const, releasedFree, scheduledPaid };
  }

  // ─── METHOD 5: getActivationStatus ───────────────────────────────────────

  async getActivationStatus(tenantId: string) {
    const reqSnap = await this.db().collection(this.REQUESTS).doc(tenantId).get();
    const request = reqSnap.exists ? (reqSnap.data() as VoiceActivationRequest) : null;
    const flynVoice = await this.getFlynVoice(tenantId);
    return {
      status: flynVoice?.status ?? request?.status ?? 'inactive',
      phoneNumber: flynVoice?.phoneNumber ?? request?.assignedNumber ?? null,
      selectedAgentId: flynVoice?.selectedAgentId ?? null,
      activatedAt: flynVoice?.activatedAt ?? null,
      request,
    };
  }

  // ─── METHOD 6: addNumberToPool ───────────────────────────────────────────

  async addNumberToPool(
    number: string,
    twilioSid: string,
    addedByUid: string,
    opts?: { country?: string; capabilities?: { voice: boolean; sms: boolean } },
  ) {
    if (!/^\+[1-9]\d{6,14}$/.test(number)) {
      throw new BadRequestException('Number must be in E.164 format, e.g. +14155551234.');
    }
    if (!twilioSid || !twilioSid.startsWith('PN')) {
      throw new BadRequestException('A valid Twilio number SID (PNxxxx) is required.');
    }

    const ref = this.db().collection(this.POOL).doc(number);
    if ((await ref.get()).exists) {
      throw new ConflictException('This number is already in the pool.');
    }

    const poolNumber: PoolNumber = {
      number,
      twilioSid,
      status: 'available',
      assignedTo: null,
      assignedAt: null,
      country: opts?.country ?? 'US',
      capabilities: opts?.capabilities ?? { voice: true, sms: true },
      addedAt: this.nowIso(),
      addedBy: addedByUid,
    };
    await ref.set(poolNumber);
    this.logger.log(`Pool +1: ${number} (${twilioSid}) added by ${addedByUid}`);

    // Auto-fulfill the oldest waitlisted ('pending_number') request, if any.
    let autoFulfilled: string | null = null;
    const waiting = await this.db()
      .collection(this.REQUESTS)
      .where('status', '==', 'pending_number')
      .get();
    if (!waiting.empty) {
      const oldest = waiting.docs
        .map((d) => d.data() as VoiceActivationRequest)
        .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1))[0];
      try {
        await this.approveActivation(oldest.tenantId, addedByUid);
        autoFulfilled = oldest.tenantId;
        this.logger.log(`Auto-fulfilled waitlisted request for ${oldest.tenantId} with ${number}`);
      } catch (e: any) {
        this.logger.warn(`Auto-fulfill failed for ${oldest.tenantId}: ${e?.message}`);
      }
    }

    return { added: true as const, number, autoFulfilled };
  }

  // ─── METHOD 7: listPool ──────────────────────────────────────────────────

  async listPool() {
    const snap = await this.db().collection(this.POOL).get();
    const numbers = snap.docs.map((d) => d.data() as PoolNumber);
    const counts: PoolCounts = {
      total: numbers.length,
      available: numbers.filter((n) => n.status === 'available').length,
      assigned: numbers.filter((n) => n.status === 'assigned').length,
      reserved: numbers.filter((n) => n.status === 'reserved').length,
    };
    return { numbers, counts };
  }

  // ─── Admin: reconcile webhooks ───────────────────────────────────────────

  /**
   * Re-point the Voice webhook on every assigned/reserved pool number at Flyn's
   * backend. Backfill for numbers provisioned while FLYN_TWILIO creds were missing
   * (they ended up with a blank Voice URL). Idempotent.
   */
  async reconcileWebhooks(): Promise<{ reconciled: number; failed: number; results: { number: string; tenantId: string; ok: boolean; error?: string }[] }> {
    const snap = await this.db().collection(this.POOL).get();
    const results: { number: string; tenantId: string; ok: boolean; error?: string }[] = [];
    for (const doc of snap.docs) {
      const n = doc.data() as PoolNumber;
      if ((n.status !== 'assigned' && n.status !== 'reserved') || !n.assignedTo || !n.twilioSid) continue;
      try {
        const selectedAgentId = (await this.getFlynVoice(n.assignedTo))?.selectedAgentId ?? undefined;
        await this.configureNumberWebhooks(n.twilioSid, n.assignedTo, selectedAgentId);
        results.push({ number: n.number, tenantId: n.assignedTo, ok: true });
      } catch (err: any) {
        results.push({ number: n.number, tenantId: n.assignedTo, ok: false, error: err?.message ?? 'unknown' });
      }
    }
    const reconciled = results.filter((r) => r.ok).length;
    this.logger.log(`reconcileWebhooks: ${reconciled}/${results.length} numbers reconfigured`);
    return { reconciled, failed: results.length - reconciled, results };
  }

  // ─── Admin: list requests / reject ───────────────────────────────────────

  async listRequests() {
    const snap = await this.db().collection(this.REQUESTS).get();
    const requests = snap.docs
      .map((d) => d.data() as VoiceActivationRequest)
      .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
    return { requests };
  }

  async listActiveTenants() {
    const snap = await this.db()
      .collection(this.REQUESTS)
      .where('status', '==', 'active')
      .get();
    const tenants = snap.docs.map((d) => d.data() as VoiceActivationRequest);
    return { tenants };
  }

  async rejectActivation(tenantId: string, reason: string, _byUid: string) {
    const reqRef = this.db().collection(this.REQUESTS).doc(tenantId);
    if (!(await reqRef.get()).exists) {
      throw new NotFoundException('No activation request found for this tenant.');
    }
    await reqRef.set(
      { status: 'rejected' as ActivationStatus, rejectedReason: reason ?? null } as Partial<VoiceActivationRequest>,
      { merge: true },
    );
    await this.patchFlynVoice(tenantId, { status: 'inactive' });
    this.logger.log(`Voice activation rejected for ${tenantId}: ${reason ?? '(no reason)'}`);
    return { rejected: true as const };
  }

  // ─── Self-service instant allocation ─────────────────────────────────────

  private numbersCol(tenantId: string) {
    return this.db().collection('tenants').doc(tenantId).collection('flynVoiceNumbers');
  }

  private async countTenantNumbers(tenantId: string): Promise<number> {
    const snap = await this.numbersCol(tenantId).get();
    return snap.size;
  }

  /** Search the platform Twilio account for one available voice+SMS number. */
  private async searchAvailableNumber(country: string): Promise<string | null> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twSid}/AvailablePhoneNumbers/${country}/Local.json?VoiceEnabled=true&SmsEnabled=true&Limit=1`;
    const res = await fetch(url, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${this.twSid}:${this.twToken}`).toString('base64') },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new BadRequestException(err?.message ?? `Twilio number search failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as any;
    return data.available_phone_numbers?.[0]?.phone_number ?? null;
  }

  /** Purchase a number on the platform Twilio account. */
  private async buyNumber(phoneNumber: string): Promise<{ sid: string; number: string }> {
    const body = new URLSearchParams({ PhoneNumber: phoneNumber, FriendlyName: `Flyn-${Date.now()}` });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.twSid}/IncomingPhoneNumbers.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.twSid}:${this.twToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new BadRequestException(err?.message ?? `Could not purchase number: HTTP ${res.status}`);
    }
    const data = (await res.json()) as any;
    return { sid: data.sid, number: data.phone_number };
  }

  private async releaseNumber(sid: string): Promise<void> {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.twSid}/IncomingPhoneNumbers/${sid}.json`, {
      method: 'DELETE',
      headers: { Authorization: 'Basic ' + Buffer.from(`${this.twSid}:${this.twToken}`).toString('base64') },
    }).catch(() => {});
  }

  // ─── Shared number acquisition (pool-first, else purchase) ───────────────

  /** Reserve a pool number if available, else buy one. Caller must finalize/revert. */
  private async acquireNumber(
    country: string,
    tenantId: string,
  ): Promise<{
    number: string;
    sid: string;
    source: 'pool' | 'purchased';
    poolRef: FirebaseFirestore.DocumentReference | null;
  }> {
    const poolSnap = await this.db().collection(this.POOL).where('status', '==', 'available').limit(1).get();
    if (!poolSnap.empty) {
      const pool = poolSnap.docs[0].data() as PoolNumber;
      await poolSnap.docs[0].ref.set(
        { status: 'reserved' as PoolNumberStatus, assignedTo: tenantId, assignedAt: this.nowIso() },
        { merge: true },
      );
      return { number: pool.number, sid: pool.twilioSid, source: 'pool', poolRef: poolSnap.docs[0].ref };
    }
    this.requireTwilioEnv();
    const available = await this.searchAvailableNumber(country);
    if (!available) throw new BadRequestException(`No numbers available in ${country} right now.`);
    const bought = await this.buyNumber(available);
    return { number: bought.number, sid: bought.sid, source: 'purchased', poolRef: null };
  }

  private async revertAcquire(acq: { sid: string; poolRef: FirebaseFirestore.DocumentReference | null }) {
    if (acq.poolRef) {
      await acq.poolRef.set({ status: 'available' as PoolNumberStatus, assignedTo: null, assignedAt: null }, { merge: true }).catch(() => {});
    } else {
      await this.releaseNumber(acq.sid); // don't leave an orphan number we can't route
    }
  }

  private async finalizeAcquire(
    acq: { number: string; sid: string; poolRef: FirebaseFirestore.DocumentReference | null },
    tenantId: string,
    country: string,
    at: string,
  ) {
    if (acq.poolRef) {
      await acq.poolRef.set({ status: 'assigned' as PoolNumberStatus, assignedAt: at }, { merge: true });
    } else {
      await this.db().collection(this.POOL).doc(acq.number).set({
        number: acq.number,
        twilioSid: acq.sid,
        status: 'assigned' as PoolNumberStatus,
        assignedTo: tenantId,
        assignedAt: at,
        country,
        capabilities: { voice: true, sms: true },
        addedAt: at,
        addedBy: 'auto-purchase',
      } as PoolNumber);
    }
  }

  private async mirrorActiveRequest(tenantId: string, number: string, sid: string, at: string) {
    const tenantName = await this.getTenantName(tenantId);
    await this.db().collection(this.REQUESTS).doc(tenantId).set(
      {
        tenantId, tenantName, requestedBy: 'self-service', requestedAt: at,
        status: 'active', assignedNumber: number, assignedNumberSid: sid,
        approvedBy: 'self-service', approvedAt: at, rejectedReason: null, webhookConfigured: true,
      } as VoiceActivationRequest,
      { merge: true },
    );
  }

  /**
   * Instantly allocate the FREE first number (no admin approval, no payment).
   * Additional numbers must go through the paid checkout (createPaidNumberCheckout).
   */
  async allocateNumber(tenantId: string, requestedByUid: string, opts?: { country?: string }) {
    const country = (opts?.country || 'US').toUpperCase();

    if ((await this.countTenantNumbers(tenantId)) >= 1) {
      return {
        allocated: false as const,
        requiresPayment: true as const,
        message: 'Your first number is free. Additional numbers are $1.15/mo — add them from Manage.',
      };
    }

    const acq = await this.acquireNumber(country, tenantId);
    const selectedAgentId = (await this.getFlynVoice(tenantId))?.selectedAgentId ?? undefined;
    try {
      await this.configureNumberWebhooks(acq.sid, tenantId, selectedAgentId);
    } catch (err: any) {
      await this.revertAcquire(acq);
      throw new BadRequestException(`Failed to configure number: ${err?.message ?? err}`);
    }

    const at = this.nowIso();
    await this.finalizeAcquire(acq, tenantId, country, at);

    await this.numbersCol(tenantId).doc(acq.number).set({
      number: acq.number, twilioSid: acq.sid, source: acq.source,
      billable: false, allocatedAt: at, allocatedBy: requestedByUid,
      status: 'active',
    } as TenantVoiceNumber);

    await this.patchFlynVoice(tenantId, {
      status: 'active', phoneNumber: acq.number, phoneNumberSid: acq.sid, activatedAt: at,
    });
    await this.mirrorActiveRequest(tenantId, acq.number, acq.sid, at);

    this.logger.log(`Flyn Voice FREE number ${acq.number} allocated to tenant ${tenantId} (${acq.source})`);
    return {
      allocated: true as const,
      requiresPayment: false as const,
      number: acq.number,
      source: acq.source,
      message: `${acq.number} has been assigned to you.`,
    };
  }

  // ─── Paid additional numbers ($1.15/mo subscription) ─────────────────────

  /** List every number the tenant holds (free + paid), for the Manage modal. */
  async listNumbers(tenantId: string) {
    const snap = await this.numbersCol(tenantId).get();
    const numbers = snap.docs
      .map((d) => d.data() as TenantVoiceNumber)
      .sort((a, b) => (a.allocatedAt < b.allocatedAt ? -1 : 1));
    return { numbers, priceCents: this.NUMBER_PRICE_CENTS, currency: this.NUMBER_PRICE_CURRENCY };
  }

  /**
   * Create a Stripe subscription checkout for an ADDITIONAL number ($1.15/mo).
   * The number is NOT allocated here — only after the Stripe webhook confirms payment
   * (fulfillPaidNumber). Returns the hosted checkout URL.
   */
  async createPaidNumberCheckout(
    tenantId: string,
    email: string,
    opts: { country?: string; successUrl?: string; cancelUrl?: string },
  ) {
    if ((await this.countTenantNumbers(tenantId)) === 0) {
      throw new BadRequestException('Your first number is free — use Activate instead.');
    }
    if (!email) throw new BadRequestException('A billing email is required to add a paid number.');

    const frontendUrl = (process.env.FRONTEND_URL || 'https://app.myflynai.com').replace(/\/$/, '');
    const successUrl = opts.successUrl || `${frontendUrl}/settings/channels?voice_number=success`;
    const cancelUrl = opts.cancelUrl || `${frontendUrl}/settings/channels?voice_number=cancelled`;
    const country = (opts.country || 'US').toUpperCase();

    const { url } = await this.stripe.createRecurringCheckout({
      tenantId,
      email,
      unitAmount: this.NUMBER_PRICE_CENTS,
      currency: this.NUMBER_PRICE_CURRENCY,
      productName: 'Flyn Voice — additional number',
      metadata: { type: 'flyn_voice_number', country },
      successUrl,
      cancelUrl,
    });
    this.logger.log(`Paid-number checkout created for tenant ${tenantId}`);
    return { checkoutUrl: url };
  }

  /**
   * Fulfil a paid number AFTER Stripe confirms the subscription (webhook-driven).
   * Idempotent on stripeSubscriptionId.
   */
  async fulfillPaidNumber(opts: {
    tenantId: string;
    country: string;
    stripeSubscriptionId: string;
    stripeCustomerId?: string | null;
    periodStart: number;
    periodEnd: number;
  }) {
    const subMapRef = this.db().collection(this.SUBS).doc(opts.stripeSubscriptionId);
    if ((await subMapRef.get()).exists) {
      this.logger.log(`Subscription ${opts.stripeSubscriptionId} already fulfilled — skipping.`);
      return;
    }

    const acq = await this.acquireNumber((opts.country || 'US').toUpperCase(), opts.tenantId);
    const selectedAgentId = (await this.getFlynVoice(opts.tenantId))?.selectedAgentId ?? undefined;
    try {
      await this.configureNumberWebhooks(acq.sid, opts.tenantId, selectedAgentId);
    } catch (err: any) {
      await this.revertAcquire(acq);
      this.logger.error(`Paid fulfilment webhook config failed for ${opts.tenantId}: ${err?.message}`);
      throw err; // webhook layer logs; Stripe sub still exists — manual replay possible
    }

    const at = this.nowIso();
    await this.finalizeAcquire(acq, opts.tenantId, opts.country, at);

    await this.numbersCol(opts.tenantId).doc(acq.number).set({
      number: acq.number, twilioSid: acq.sid, source: acq.source,
      billable: true, allocatedAt: at, allocatedBy: 'stripe-webhook',
      stripeSubscriptionId: opts.stripeSubscriptionId,
      stripeCustomerId: opts.stripeCustomerId ?? null,
      priceCents: this.NUMBER_PRICE_CENTS,
      periodStart: opts.periodStart, periodEnd: opts.periodEnd,
      cancelAtPeriodEnd: false, status: 'active',
    } as TenantVoiceNumber);

    await subMapRef.set({
      tenantId: opts.tenantId, number: acq.number, twilioSid: acq.sid,
      periodEnd: opts.periodEnd, status: 'active', createdAt: at,
    } as VoiceSubscriptionMap);

    // Keep tenant active; only set primary if none yet.
    const fv = await this.getFlynVoice(opts.tenantId);
    if (!fv || fv.status !== 'active' || !fv.phoneNumber) {
      await this.patchFlynVoice(opts.tenantId, {
        status: 'active', phoneNumber: acq.number, phoneNumberSid: acq.sid, activatedAt: at,
      });
      await this.mirrorActiveRequest(opts.tenantId, acq.number, acq.sid, at);
    }
    this.logger.log(`Flyn Voice PAID number ${acq.number} fulfilled for tenant ${opts.tenantId} (sub ${opts.stripeSubscriptionId})`);
  }

  /**
   * Remove a number. Free → released immediately. Paid → scheduled to cancel at the
   * end of the current paid period (no refund, locked until then). Actual release
   * happens via the Stripe subscription-deleted webhook (releaseBySubscriptionId).
   */
  async requestRemoveNumber(tenantId: string, number: string) {
    const ref = this.numbersCol(tenantId).doc(number);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Number not found for this workspace.');
    const n = snap.data() as TenantVoiceNumber;

    if (!n.billable) {
      await this.releaseHeldNumber(tenantId, n);
      return { released: true as const, immediate: true as const };
    }

    if (n.status === 'canceling') {
      return { released: false as const, immediate: false as const, cancelsAt: n.periodEnd ?? null };
    }
    if (!n.stripeSubscriptionId) {
      throw new BadRequestException('Paid number is missing its subscription reference.');
    }
    const { currentPeriodEnd } = await this.stripe.cancelSubscriptionAtPeriodEnd(n.stripeSubscriptionId);
    await ref.set({ status: 'canceling', cancelAtPeriodEnd: true, periodEnd: currentPeriodEnd } as Partial<TenantVoiceNumber>, { merge: true });
    await this.db().collection(this.SUBS).doc(n.stripeSubscriptionId)
      .set({ status: 'canceling', periodEnd: currentPeriodEnd } as Partial<VoiceSubscriptionMap>, { merge: true }).catch(() => {});

    this.logger.log(`Paid number ${number} scheduled to cancel at period end for tenant ${tenantId}`);
    return { released: false as const, immediate: false as const, cancelsAt: currentPeriodEnd };
  }

  /** Actually release a held number: clear webhook, return to pool, delete docs, fix primary. */
  private async releaseHeldNumber(tenantId: string, n: TenantVoiceNumber) {
    if (n.twilioSid) await this.clearNumberWebhooks(n.twilioSid).catch(() => {});
    await this.db().collection(this.POOL).doc(n.number)
      .set({ status: 'available' as PoolNumberStatus, assignedTo: null, assignedAt: null }, { merge: true }).catch(() => {});
    await this.numbersCol(tenantId).doc(n.number).delete().catch(() => {});
    if (n.stripeSubscriptionId) await this.db().collection(this.SUBS).doc(n.stripeSubscriptionId).delete().catch(() => {});

    // Repoint the flynVoice primary if this number was it.
    const fv = await this.getFlynVoice(tenantId);
    if (fv?.phoneNumber === n.number) {
      const remaining = await this.numbersCol(tenantId).limit(1).get();
      if (remaining.empty) {
        await this.patchFlynVoice(tenantId, { status: 'inactive', phoneNumber: null, phoneNumberSid: null, activatedAt: null });
        await this.db().collection(this.REQUESTS).doc(tenantId)
          .set({ status: 'inactive' as ActivationStatus } as Partial<VoiceActivationRequest>, { merge: true }).catch(() => {});
      } else {
        const r = remaining.docs[0].data() as TenantVoiceNumber;
        await this.patchFlynVoice(tenantId, { phoneNumber: r.number, phoneNumberSid: r.twilioSid });
      }
    }
  }

  /** Webhook: a paid subscription ended → release its number. */
  async releaseBySubscriptionId(stripeSubscriptionId: string) {
    const mapRef = this.db().collection(this.SUBS).doc(stripeSubscriptionId);
    const map = await mapRef.get();
    if (!map.exists) return { released: false as const };
    const { tenantId, number } = map.data() as VoiceSubscriptionMap;
    const nSnap = await this.numbersCol(tenantId).doc(number).get();
    if (nSnap.exists) {
      await this.releaseHeldNumber(tenantId, nSnap.data() as TenantVoiceNumber);
    } else {
      await mapRef.delete().catch(() => {});
    }
    this.logger.log(`Released paid number ${number} for tenant ${tenantId} (sub ${stripeSubscriptionId} ended)`);
    return { released: true as const };
  }

  // ─── Inbound agent selection ─────────────────────────────────────────────

  /** Bind a specific Flyn Voice number's inbound calls to an AI agent (Dialer receptionist). */
  async setNumberAgent(tenantId: string, number: string, agentId: string) {
    const ref = this.numbersCol(tenantId).doc(number);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Number not found for this workspace.');
    const n = snap.data() as TenantVoiceNumber;

    await this.configureNumberWebhooks(n.twilioSid, tenantId, agentId || undefined);
    await ref.set({ agentId: agentId || null } as Partial<TenantVoiceNumber>, { merge: true });

    // Mirror onto the summary if this is the primary number.
    const fv = await this.getFlynVoice(tenantId);
    if (fv?.phoneNumber === number) {
      await this.patchFlynVoice(tenantId, { selectedAgentId: agentId || null });
    }
    this.logger.log(`Inbound agent ${agentId || '(none)'} bound to ${number} for tenant ${tenantId}`);
    return { updated: true as const, number, agentId };
  }

  async updateSelectedAgent(tenantId: string, agentId: string) {
    const flynVoice = await this.getFlynVoice(tenantId);
    if (!flynVoice || flynVoice.status !== 'active' || !flynVoice.phoneNumberSid) {
      throw new BadRequestException('Flyn Voice is not active for this workspace.');
    }
    await this.configureNumberWebhooks(flynVoice.phoneNumberSid, tenantId, agentId);
    await this.patchFlynVoice(tenantId, { selectedAgentId: agentId });
    return { updated: true as const, agentId };
  }
}
