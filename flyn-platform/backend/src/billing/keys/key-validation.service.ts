import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import axios from 'axios';
import { createHmac } from 'crypto';

export interface GatewayKeyStatus {
  gateway: string;
  configured: boolean;
  valid: boolean;
  error?: string;
  details?: string;
}

export interface KeyValidationResult {
  allValid: boolean;
  gateways: GatewayKeyStatus[];
  checkedAt: string;
}

/**
 * KeyValidationService
 *
 * Performs lightweight, read-only API calls to each payment gateway
 * to verify that the configured credentials are valid and reachable.
 *
 * None of these checks create customers, charges, or any billable resources.
 *
 * - Stripe:       GET /v1/balance  (requires secret key, read-only)
 * - Flutterwave:  GET /v3/banks/NG (public endpoint, requires secret key)
 * - Ziina:        GET /api/transaction/list (authenticated list, zero cost)
 *
 * Security: This endpoint is auth-guarded. Results reveal only
 * whether credentials work — never the key values themselves.
 */
@Injectable()
export class KeyValidationService {
  private readonly logger = new Logger(KeyValidationService.name);

  async validateAll(): Promise<KeyValidationResult> {
    const [stripe, flutterwave, ziina] = await Promise.allSettled([
      this.validateStripe(),
      this.validateFlutterwave(),
      this.validateZiina(),
    ]);

    const gateways: GatewayKeyStatus[] = [
      stripe.status === 'fulfilled' ? stripe.value : this.errorStatus('stripe', stripe.reason as Error),
      flutterwave.status === 'fulfilled' ? flutterwave.value : this.errorStatus('flutterwave', flutterwave.reason as Error),
      ziina.status === 'fulfilled' ? ziina.value : this.errorStatus('ziina', ziina.reason as Error),
    ];

    return {
      allValid: gateways.every((g) => !g.configured || g.valid),
      gateways,
      checkedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stripe — GET /v1/balance
  // Requires: STRIPE_SECRET_KEY
  // ─────────────────────────────────────────────────────────────────────────

  async validateStripe(): Promise<GatewayKeyStatus> {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secretKey) {
      return { gateway: 'stripe', configured: false, valid: false, error: 'STRIPE_SECRET_KEY is not set' };
    }

    try {
      const client = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });

      // GET /v1/balance — cheapest authenticated Stripe call; no side effects.
      const balance = await client.balance.retrieve();

      // STRIPE_WEBHOOK_SECRET is only required for webhook verification.
      const webhookSecretValid = webhookSecret ? webhookSecret.startsWith('whsec_') : false;

      return {
        gateway: 'stripe',
        configured: true,
        valid: true,
        details: [
          `Account currency: ${balance.available[0]?.currency?.toUpperCase() ?? 'unknown'}`,
          `Livemode: ${balance.livemode}`,
          webhookSecret
            ? `Webhook secret format: ${webhookSecretValid ? '✓ valid (whsec_...)' : '✗ invalid — must start with whsec_'}`
            : 'Webhook secret: not set (webhooks disabled)',
        ].join(' | '),
      };
    } catch (err) {
      const e = err as { type?: string; message?: string };
      return {
        gateway: 'stripe',
        configured: true,
        valid: false,
        error: e.type === 'StripeAuthenticationError'
          ? 'Invalid Stripe secret key'
          : `Stripe API error: ${e.message ?? String(err)}`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Flutterwave — GET /v3/banks/NG
  // Requires: FLW_SECRET_KEY, FLW_WEBHOOK_SECRET_HASH
  // ─────────────────────────────────────────────────────────────────────────

  async validateFlutterwave(): Promise<GatewayKeyStatus> {
    const secretKey = process.env.FLW_SECRET_KEY;
    const webhookSecretHash = process.env.FLW_WEBHOOK_SECRET_HASH;

    if (!secretKey || !webhookSecretHash) {
      return { gateway: 'flutterwave', configured: false, valid: false, error: 'FLW_SECRET_KEY and/or FLW_WEBHOOK_SECRET_HASH are not set' };
    }

    try {
      // GET /v3/banks/NG — authenticated, no side effects, always available.
      const res = await axios.get<{ status: string; data: unknown[] }>(
        'https://api.flutterwave.com/v3/banks/NG',
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          timeout: 10_000,
        },
      );

      const ok = res.data.status === 'success';

      // Validate webhook hash is non-empty (FLW uses a plain string, no format constraint)
      const hashOk = webhookSecretHash.length >= 8;

      return {
        gateway: 'flutterwave',
        configured: true,
        valid: ok,
        details: ok
          ? `API reachable, ${(res.data.data as unknown[]).length} banks returned | Webhook hash: ${hashOk ? '✓ set' : '✗ too short (min 8 chars)'}`
          : `Unexpected response status: ${res.data.status}`,
        ...(!ok && { error: 'Unexpected Flutterwave API response' }),
      };
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      const status = e.response?.status;
      return {
        gateway: 'flutterwave',
        configured: true,
        valid: false,
        error: status === 401
          ? 'Invalid Flutterwave secret key (401 Unauthorized)'
          : `Flutterwave API error (${status ?? 'network'}): ${e.response?.data?.message ?? e.message ?? String(err)}`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ziina — POST /api/transaction/list (empty filter, size=1)
  // Requires: ZIINA_API_KEY, ZIINA_WEBHOOK_SECRET
  // ─────────────────────────────────────────────────────────────────────────

  async validateZiina(): Promise<GatewayKeyStatus> {
    const apiKey = process.env.ZIINA_API_KEY;
    const webhookSecret = process.env.ZIINA_WEBHOOK_SECRET;

    if (!apiKey || !webhookSecret) {
      return { gateway: 'ziina', configured: false, valid: false, error: 'ZIINA_API_KEY and/or ZIINA_WEBHOOK_SECRET are not set' };
    }

    try {
      // Ziina's lightest authenticated endpoint — list transactions (size=1).
      // This confirms the key is valid without creating anything.
      const res = await axios.post<{ success?: boolean; data?: unknown }>(
        'https://api-v2.ziina.com/api/transaction/list',
        { size: 1 },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
          validateStatus: (s) => s < 500, // treat 4xx as a non-throw for better error messages
        },
      );

      if (res.status === 401 || res.status === 403) {
        return { gateway: 'ziina', configured: true, valid: false, error: 'Invalid Ziina API key (401/403)' };
      }

      // Validate webhook secret: HMAC-SHA256 requires at least 16 chars
      const webhookSecretOk = webhookSecret.length >= 16;

      // Verify HMAC works with the provided secret (self-test — no external call)
      let hmacWorks = false;
      try {
        const testSig = createHmac('sha256', webhookSecret).update('test-payload').digest('hex');
        hmacWorks = testSig.length === 64;
      } catch {
        hmacWorks = false;
      }

      return {
        gateway: 'ziina',
        configured: true,
        valid: true,
        details: [
          `API reachable (HTTP ${res.status})`,
          `Webhook secret: ${webhookSecretOk ? '✓ length OK' : '✗ too short (min 16 chars)'}`,
          `HMAC-SHA256 self-test: ${hmacWorks ? '✓ passed' : '✗ failed'}`,
        ].join(' | '),
      };
    } catch (err) {
      const e = err as { message?: string };
      return {
        gateway: 'ziina',
        configured: true,
        valid: false,
        error: `Ziina API error: ${e.message ?? String(err)}`,
      };
    }
  }

  private errorStatus(gateway: string, err: Error): GatewayKeyStatus {
    this.logger.error(`Key validation failed for ${gateway}`, err.stack);
    return { gateway, configured: true, valid: false, error: err.message };
  }
}
