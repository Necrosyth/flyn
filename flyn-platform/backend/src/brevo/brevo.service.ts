import { Injectable, Logger } from '@nestjs/common';
import { request as httpsRequest } from 'https';

/**
 * Thin REST client for the Brevo API (api-key auth, IP-independent transport for per-mailbox mail).
 * Zero new deps — calls the documented REST endpoints directly. Every endpoint here is traced to
 * Brevo's official docs:
 *   • GET  /v3/account                                  — validate the key / account info
 *   • POST /v3/senders/domains                          — register a sender domain
 *   • GET  /v3/senders/domains/{domain}                 — domain config + auth status + DNS records
 *   • PUT  /v3/senders/domains/{domain}/authenticate    — kick off authentication
 *   • POST /v3/smtp/email                               — send a transactional email
 *   (https://developers.brevo.com/docs/domain-authentication-and-verification,
 *    https://developers.brevo.com/docs/send-a-transactional-email)
 *
 * ⚠️ This account enforces "Authorised IPs": API calls from a non-allowlisted IP get 401
 * "unrecognised IP address". isAuthorizedIpError() flags that so callers/logs can say so plainly
 * rather than treat it as a generic failure. The key lives ONLY in env (BREVO_API_KEY).
 */
export interface BrevoResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  /** true when the failure is the account's IP allowlist rejecting this machine. */
  ipBlocked?: boolean;
  error?: string;
}

export interface BrevoSendParams {
  sender: { email: string; name?: string };
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent?: string;
  textContent?: string;
  replyTo?: { email: string; name?: string };
  headers?: Record<string, string>;
  tags?: string[];
}

/**
 * One DNS record Brevo requires for domain authentication. Shape confirmed LIVE (2026-06-05) against
 * POST/GET /v3/senders/domains — keys are dkim1Record, dkim2Record, brevo_code, dmarc_record.
 * `status` is Brevo's own per-record "found in DNS yet?" flag at last check.
 */
export interface BrevoDnsRecord {
  type: string;       // 'CNAME' | 'TXT'
  value: string;      // the record value to publish
  host_name: string;  // the host/name to publish at ('@', 'brevo1._domainkey', '_dmarc', …)
  status: boolean;    // Brevo says this record is live in DNS
}

/** GET/POST /v3/senders/domains response (single domain). Field names confirmed live. */
export interface BrevoSenderDomain {
  id?: string;
  domain?: string;
  domain_name?: string;
  verified?: boolean;        // brevo-code TXT proven (Brevo ownership)
  authenticated?: boolean;   // DKIM live → domain is sendable
  message?: string;
  dns_records?: Record<string, BrevoDnsRecord | null>;
}

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);
  private readonly apiKey = process.env.BREVO_API_KEY || '';
  private readonly host = 'api.brevo.com';

  /** Whether the API key is present (so callers can no-op cleanly in envs without it). */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private req<T = any>(method: string, path: string, body?: any): Promise<BrevoResponse<T>> {
    return new Promise((resolve) => {
      if (!this.apiKey) {
        resolve({ ok: false, status: 0, data: null as any, error: 'BREVO_API_KEY not configured' });
        return;
      }
      const payload = body ? JSON.stringify(body) : undefined;
      const r = httpsRequest(
        {
          hostname: this.host,
          path,
          method,
          headers: {
            'api-key': this.apiKey,
            accept: 'application/json',
            ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          },
          timeout: 15000,
        },
        (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            const status = res.statusCode || 0;
            let data: any = null;
            try { data = d ? JSON.parse(d) : null; } catch { data = d; }
            const ok = status >= 200 && status < 300;
            const msg = !ok ? (data?.message || data?.code || `HTTP ${status}`) : undefined;
            const ipBlocked = !ok && typeof msg === 'string' && /unrecognised IP|unrecognized IP|IP address/i.test(msg);
            if (!ok) this.logger.warn(`[brevo] ${method} ${path} → ${status} ${ipBlocked ? '(IP NOT AUTHORIZED)' : ''} ${String(msg).slice(0, 160)}`);
            resolve({ ok, status, data, ...(msg ? { error: String(msg) } : {}), ...(ipBlocked ? { ipBlocked: true } : {}) });
          });
        },
      );
      r.on('timeout', () => { r.destroy(); resolve({ ok: false, status: 0, data: null as any, error: 'Brevo request timed out' }); });
      r.on('error', (e) => resolve({ ok: false, status: 0, data: null as any, error: e.message }));
      if (payload) r.write(payload);
      r.end();
    });
  }

  /** GET /v3/account — validates the key + returns account info. */
  getAccount() {
    return this.req('GET', '/v3/account');
  }

  /** POST /v3/senders/domains — register a domain for sending. Returns dns_records to publish. */
  createSenderDomain(domain: string) {
    return this.req<BrevoSenderDomain>('POST', '/v3/senders/domains', { name: domain });
  }

  /** GET /v3/senders/domains/{domain} — config + verified/authenticated status + DNS records. */
  getSenderDomain(domain: string) {
    return this.req<BrevoSenderDomain>('GET', `/v3/senders/domains/${encodeURIComponent(domain)}`);
  }

  /** PUT /v3/senders/domains/{domain}/authenticate — ask Brevo to re-check DNS + authenticate. */
  authenticateSenderDomain(domain: string) {
    return this.req<BrevoSenderDomain>('PUT', `/v3/senders/domains/${encodeURIComponent(domain)}/authenticate`);
  }

  /** DELETE /v3/senders/domains/{domain} — deregister (best-effort cleanup when a domain is removed). */
  deleteSenderDomain(domain: string) {
    return this.req('DELETE', `/v3/senders/domains/${encodeURIComponent(domain)}`);
  }

  /** POST /v3/smtp/email — send a transactional email. Returns { messageId } on success. */
  sendTransactional(params: BrevoSendParams): Promise<BrevoResponse<{ messageId?: string }>> {
    return this.req('POST', '/v3/smtp/email', {
      sender: params.sender,
      to: params.to,
      subject: params.subject,
      ...(params.htmlContent ? { htmlContent: params.htmlContent } : {}),
      ...(params.textContent ? { textContent: params.textContent } : {}),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.headers ? { headers: params.headers } : {}),
      ...(params.tags ? { tags: params.tags } : {}),
    });
  }
}
