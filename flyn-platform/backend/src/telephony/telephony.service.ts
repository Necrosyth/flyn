import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import {
  TelephonyConfig,
  TelephonyServiceStatus,
  TelephonyStatusResponse,
  TelephonySmsState,
  TelephonyVoiceState,
} from './telephony.types';

/**
 * TelephonyService
 *
 * Provisions Twilio phone numbers and VAPI voice assistants under Flyn's master
 * accounts on behalf of tenants. Clients see "Flyn Voice" / "Flyn SMS" — they
 * never interact with Twilio or VAPI directly.
 *
 * Required env vars:
 *   FLYN_TWILIO_ACCOUNT_SID   — Flyn's master Twilio account SID
 *   FLYN_TWILIO_AUTH_TOKEN    — Flyn's master Twilio auth token
 *   FLYN_VAPI_API_KEY         — Flyn's master VAPI server key
 *   BACKEND_URL               — Public URL of this backend (for webhook registration)
 */
@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  private get twSid() { return process.env.FLYN_TWILIO_ACCOUNT_SID ?? ''; }
  private get twToken() { return process.env.FLYN_TWILIO_AUTH_TOKEN ?? ''; }
  private get vapiKey() { return process.env.FLYN_VAPI_API_KEY ?? ''; }
  private get backendUrl() {
    return (process.env.BACKEND_URL ?? 'https://pjpmzvu7wn.us-east-1.awsapprunner.com').replace(/\/$/, '');
  }

  constructor(private readonly tenantsService: TenantsService) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  async getStatus(tenantId: string): Promise<TelephonyStatusResponse> {
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const tel: TelephonyConfig = (tenant as any)?.telephony ?? {};
    return {
      sms: tel.sms ? this.stripInternal(tel.sms) : null,
      voice: tel.voice ? this.stripInternal(tel.voice) : null,
    };
  }

  async activateSms(tenantId: string, countryCode = 'US'): Promise<TelephonyStatusResponse['sms']> {
    this.requireTwilioEnv();
    const tenant = await this.tenantsService.getTenant(tenantId);
    const tel: TelephonyConfig = (tenant as any)?.telephony ?? {};

    if (tel.sms?.status === 'active') {
      throw new ConflictException('Flyn SMS is already active for this workspace.');
    }

    // Mark as provisioning
    await this.patchTelephony(tenantId, { sms: { status: 'provisioning' } });

    try {
      // 1. Find an available number
      const available = await this.searchTwilioNumbers(countryCode, 'sms');
      if (!available) throw new BadRequestException(`No available phone numbers in ${countryCode}.`);

      // 2. Buy the number
      const { sid, phoneNumber } = await this.buyTwilioNumber(available.phoneNumber, countryCode);

      // 3. Configure SMS webhook on the number
      const webhookUrl = `${this.backendUrl}/api/telephony/webhook/sms?tenantId=${tenantId}`;
      await this.configureTwilioSmsWebhook(sid, webhookUrl);

      // 4. Persist
      const state: TelephonySmsState = {
        status: 'active',
        phoneNumber,
        activatedAt: Date.now(),
        _twilioSid: sid,
      };
      await this.patchTelephony(tenantId, { sms: state });
      this.logger.log(`SMS activated for tenant ${tenantId}: ${phoneNumber}`);
      return this.stripInternal(state);
    } catch (err: any) {
      await this.patchTelephony(tenantId, { sms: { status: 'error', errorMessage: err.message } });
      throw err;
    }
  }

  async deactivateSms(tenantId: string): Promise<void> {
    this.requireTwilioEnv();
    const tenant = await this.tenantsService.getTenant(tenantId);
    const tel: TelephonyConfig = (tenant as any)?.telephony ?? {};
    const sid = tel.sms?._twilioSid;

    if (!sid) {
      await this.patchTelephony(tenantId, { sms: null });
      return;
    }

    try {
      await this.releaseTwilioNumber(sid);
    } catch (err: any) {
      this.logger.warn(`Could not release Twilio number ${sid}: ${err.message}`);
    }
    await this.patchTelephony(tenantId, { sms: null });
    this.logger.log(`SMS deactivated for tenant ${tenantId}`);
  }

  async activateVoice(tenantId: string, countryCode = 'US'): Promise<TelephonyStatusResponse['voice']> {
    this.requireTwilioEnv();
    this.requireVapiEnv();
    const tenant = await this.tenantsService.getTenant(tenantId);
    const tel: TelephonyConfig = (tenant as any)?.telephony ?? {};

    if (tel.voice?.status === 'active') {
      throw new ConflictException('Flyn Voice is already active for this workspace.');
    }

    await this.patchTelephony(tenantId, { voice: { status: 'provisioning' } });

    try {
      // 1. Provision a Twilio number for voice
      const available = await this.searchTwilioNumbers(countryCode, 'voice');
      if (!available) throw new BadRequestException(`No available voice-capable phone numbers in ${countryCode}.`);
      const { sid: twilioSid, phoneNumber } = await this.buyTwilioNumber(available.phoneNumber, countryCode);

      // 2. Create a VAPI assistant under Flyn's account
      const vapiAssistantId = await this.createVapiAssistant(tenantId);

      // 3. Import the Twilio number into VAPI and link the assistant
      const vapiPhoneNumberId = await this.importNumberIntoVapi(phoneNumber, twilioSid, vapiAssistantId);

      // 4. Configure Twilio voice webhook URL (TwiML bridge to VAPI)
      const voiceWebhookUrl = `${this.backendUrl}/api/telephony/webhook/voice?tenantId=${tenantId}`;
      await this.configureTwilioVoiceWebhook(twilioSid, voiceWebhookUrl);

      // 5. Persist
      const state: TelephonyVoiceState = {
        status: 'active',
        phoneNumber,
        activatedAt: Date.now(),
        _twilioSid: twilioSid,
        _vapiAssistantId: vapiAssistantId,
        _vapiPhoneNumberId: vapiPhoneNumberId,
      };
      await this.patchTelephony(tenantId, { voice: state });
      this.logger.log(`Voice activated for tenant ${tenantId}: ${phoneNumber}`);
      return this.stripInternal(state);
    } catch (err: any) {
      await this.patchTelephony(tenantId, { voice: { status: 'error', errorMessage: err.message } });
      throw err;
    }
  }

  async deactivateVoice(tenantId: string): Promise<void> {
    this.requireTwilioEnv();
    const tenant = await this.tenantsService.getTenant(tenantId);
    const tel: TelephonyConfig = (tenant as any)?.telephony ?? {};
    const voice = tel.voice;

    if (voice?._vapiPhoneNumberId) {
      await this.deleteVapiResource('phone-number', voice._vapiPhoneNumberId);
    }
    if (voice?._vapiAssistantId) {
      await this.deleteVapiResource('assistant', voice._vapiAssistantId);
    }
    if (voice?._twilioSid) {
      await this.releaseTwilioNumber(voice._twilioSid).catch((e) =>
        this.logger.warn(`Could not release Twilio voice number: ${e.message}`),
      );
    }

    await this.patchTelephony(tenantId, { voice: null });
    this.logger.log(`Voice deactivated for tenant ${tenantId}`);
  }

  /**
   * Returns VAPI public config for the Dialer (only public-safe fields).
   * Checks Flyn-provisioned voice first, falls back to tenant's own VAPI creds.
   */
  async getVoiceConfig(tenantId: string): Promise<{
    provider: 'flyn' | 'tenant';
    vapiPublicKey?: string;
    vapiAssistantId?: string;
    phoneNumber?: string;
  }> {
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const tel: TelephonyConfig = (tenant as any)?.telephony ?? {};

    if (tel.voice?.status === 'active' && tel.voice._vapiAssistantId) {
      return {
        provider: 'flyn',
        // Return Flyn's public VAPI key — safe to expose
        vapiPublicKey: process.env.FLYN_VAPI_PUBLIC_KEY ?? '',
        vapiAssistantId: tel.voice._vapiAssistantId,
        phoneNumber: tel.voice.phoneNumber,
      };
    }
    return { provider: 'tenant' };
  }

  async updateVoiceProvider(tenantId: string, aiProvider: 'twilio' | 'vapi'): Promise<TelephonyStatusResponse['voice']> {
    const tenant = await this.tenantsService.getTenant(tenantId);
    const tel: TelephonyConfig = (tenant as any)?.telephony ?? {};
    if (!tel.voice || tel.voice.status !== 'active') {
      throw new BadRequestException('Flyn Voice is not active. Activate it first.');
    }
    const state: TelephonyVoiceState = {
      ...tel.voice,
      aiProvider,
    };
    await this.patchTelephony(tenantId, { voice: state });
    return this.stripInternal(state);
  }

  // ─── Twilio helpers ────────────────────────────────────────────────────────

  private twilioUrl(path: string) {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.twSid}${path}`;
  }

  private twilioAuth() {
    return 'Basic ' + Buffer.from(`${this.twSid}:${this.twToken}`).toString('base64');
  }

  private async searchTwilioNumbers(
    countryCode: string,
    capability: 'sms' | 'voice',
  ): Promise<{ phoneNumber: string } | null> {
    const cap = capability === 'sms' ? 'SmsEnabled=true' : 'VoiceEnabled=true';
    const url = `${this.twilioUrl(`/AvailablePhoneNumbers/${countryCode}/Local.json?${cap}&Limit=1`)}`;
    const res = await fetch(url, { headers: { Authorization: this.twilioAuth() } });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any;
      throw new BadRequestException(body?.message ?? `Twilio search failed: HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    const numbers: any[] = data.available_phone_numbers ?? [];
    return numbers[0] ? { phoneNumber: numbers[0].phone_number } : null;
  }

  private async buyTwilioNumber(
    phoneNumber: string,
    friendlyNameSuffix: string,
  ): Promise<{ sid: string; phoneNumber: string }> {
    const body = new URLSearchParams({
      PhoneNumber: phoneNumber,
      FriendlyName: `Flyn-${friendlyNameSuffix}-${Date.now()}`,
    });

    const res = await fetch(this.twilioUrl('/IncomingPhoneNumbers.json'), {
      method: 'POST',
      headers: {
        Authorization: this.twilioAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new BadRequestException(err?.message ?? `Could not provision phone number: HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    return { sid: data.sid, phoneNumber: data.phone_number };
  }

  private async configureTwilioSmsWebhook(numberSid: string, webhookUrl: string): Promise<void> {
    const body = new URLSearchParams({ SmsUrl: webhookUrl, SmsMethod: 'POST' });
    const res = await fetch(this.twilioUrl(`/IncomingPhoneNumbers/${numberSid}.json`), {
      method: 'POST',
      headers: {
        Authorization: this.twilioAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      this.logger.warn(`SMS webhook config failed for ${numberSid}: ${err?.message}`);
    }
  }

  private async configureTwilioVoiceWebhook(numberSid: string, webhookUrl: string): Promise<void> {
    const body = new URLSearchParams({ VoiceUrl: webhookUrl, VoiceMethod: 'POST' });
    const res = await fetch(this.twilioUrl(`/IncomingPhoneNumbers/${numberSid}.json`), {
      method: 'POST',
      headers: {
        Authorization: this.twilioAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      this.logger.warn(`Voice webhook config failed for ${numberSid}: ${err?.message}`);
    }
  }

  private async releaseTwilioNumber(sid: string): Promise<void> {
    const res = await fetch(this.twilioUrl(`/IncomingPhoneNumbers/${sid}.json`), {
      method: 'DELETE',
      headers: { Authorization: this.twilioAuth() },
    });
    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(err?.message ?? `Could not release number ${sid}: HTTP ${res.status}`);
    }
  }

  // ─── VAPI helpers ──────────────────────────────────────────────────────────

  private vapiHeaders() {
    return {
      Authorization: `Bearer ${this.vapiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async createVapiAssistant(tenantId: string): Promise<string> {
    const res = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: this.vapiHeaders(),
      body: JSON.stringify({
        name: `Flyn Voice — Tenant ${tenantId.slice(0, 8)}`,
        voice: { provider: 'azure', voiceId: 'en-US-JennyNeural' },
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a professional business assistant. Answer questions concisely, warmly, and helpfully. If you cannot help, offer to take a message.',
            },
          ],
        },
        firstMessage: 'Hello, thank you for calling. How can I assist you today?',
        endCallMessage: 'Thank you for calling. Have a great day!',
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 1800,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new BadRequestException(err?.message ?? `VAPI assistant creation failed: HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    return data.id as string;
  }

  private async importNumberIntoVapi(
    phoneNumber: string,
    twilioSid: string,
    assistantId: string,
  ): Promise<string> {
    const res = await fetch('https://api.vapi.ai/phone-number', {
      method: 'POST',
      headers: this.vapiHeaders(),
      body: JSON.stringify({
        provider: 'twilio',
        number: phoneNumber,
        twilioAccountSid: this.twSid,
        twilioAuthToken: this.twToken,
        assistantId,
        name: `Flyn-${twilioSid.slice(-8)}`,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      // Non-fatal: some VAPI plans don't support number import — log and continue
      this.logger.warn(`VAPI phone number import failed: ${err?.message ?? res.status}`);
      return `vapi-fallback-${Date.now()}`;
    }

    const data = await res.json() as any;
    return data.id as string;
  }

  private async deleteVapiResource(resource: 'phone-number' | 'assistant', id: string): Promise<void> {
    const res = await fetch(`https://api.vapi.ai/${resource}/${id}`, {
      method: 'DELETE',
      headers: this.vapiHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      this.logger.warn(`VAPI ${resource} ${id} delete returned HTTP ${res.status}`);
    }
  }

  // ─── Tenant patch helper ───────────────────────────────────────────────────

  private async patchTelephony(tenantId: string, patch: Partial<TelephonyConfig>): Promise<void> {
    const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
    const current: TelephonyConfig = (tenant as any)?.telephony ?? {};
    await this.tenantsService.updateTenant(tenantId, {
      telephony: { ...current, ...patch },
    } as any);
  }

  private stripInternal<T extends Record<string, any>>(state: T): Omit<T, `_${string}`> {
    const result: any = {};
    for (const [k, v] of Object.entries(state)) {
      if (!k.startsWith('_')) result[k] = v;
    }
    return result;
  }

  // ─── Env guards ───────────────────────────────────────────────────────────

  private requireTwilioEnv() {
    if (!this.twSid || !this.twToken) {
      throw new BadRequestException(
        'Flyn telephony is not configured on this server. Contact your administrator.',
      );
    }
  }

  private requireVapiEnv() {
    if (!this.vapiKey) {
      throw new BadRequestException(
        'Flyn AI Voice is not configured on this server. Contact your administrator.',
      );
    }
  }
}
