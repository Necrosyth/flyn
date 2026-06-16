import { UnauthorizedException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

const logger = new Logger('IpVerification');

/** /24 subnet (IPv4) — used so ISP/mobile rotation within a block doesn't re-prompt. */
const slash24 = (a: string) => (a.split('.').length === 4 ? a.split('.').slice(0, 3).join('.') : a);

/** IPv4 → 32-bit int. Returns null for non-IPv4. */
function ipToInt(ip: string): number | null {
  const parts = ip.replace(/^::ffff:/, '').split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

/** Match an IP against an exact IP or a CIDR range (IPv4). */
function ipMatchesEntry(ip: string, entry: string): boolean {
  entry = entry.trim();
  if (!entry) return false;
  if (!entry.includes('/')) return ip === entry;  // exact IP
  const [range, bitsStr] = entry.split('/');
  const bits = Number(bitsStr);
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  if (ipInt === null || rangeInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

interface TenantIpSettings {
  verifiedIps?: string[];
  ipWhitelist?: string[];
  ipVerificationEnabled?: boolean;   // "Suspicious Login Block" — hard block on unknown IP
  newIpAlertEnabled?: boolean;       // notify-only on unknown IP
  companyEmail?: string;
  supportEmail?: string;
}

interface EnforceDeps {
  db: FirebaseFirestore.Firestore | undefined | null;
  sendEmail: (opts: { to: string; subject: string; html: string }) => Promise<unknown>;
}

/**
 * Per-tenant IP policy. Default is OFF (opt-in) — a tenant that never configured
 * it is never blocked. Three modes, set in Settings → Security:
 *   - block off + alert off → no-op (allow)
 *   - alert on  + block off → email a heads-up, but ALLOW the request
 *   - block on              → email a verify link and BLOCK until verified
 * Verified IPs match by /24; whitelist supports exact IPs and CIDR ranges.
 * Throws UnauthorizedException only when blocking is enabled and the IP is unknown.
 */
export async function enforceIpPolicy(
  deps: EnforceDeps,
  params: { tenant: TenantIpSettings; tenantId: string; ip: string; email?: string },
): Promise<void> {
  const { tenant, tenantId, ip } = params;
  const blockEnabled = tenant.ipVerificationEnabled === true;   // explicit opt-in only
  const alertEnabled = tenant.newIpAlertEnabled === true;
  if (!blockEnabled && !alertEnabled) return;                   // feature off → allow

  // Known IP? (verified /24, or whitelist exact/CIDR)
  const verifiedIps = tenant.verifiedIps || [];
  const whitelist = tenant.ipWhitelist || [];
  const known =
    verifiedIps.some((v) => v === ip || (ip.includes('.') && slash24(v) === slash24(ip))) ||
    whitelist.some((entry) => ipMatchesEntry(ip, entry));
  if (known) return;

  // Unknown IP — throttle one email per /24 per 30 min, then alert and/or block.
  const db = deps.db;
  if (db) {
    try {
      const pendingSnap = await db.collection('ip_verification_tokens').where('tenantId', '==', tenantId).get();
      const now = Date.now();
      const throttleWindow = now - 30 * 60 * 1000;
      const recentlySent = pendingSnap.docs.some((doc) => {
        const d = doc.data();
        return d.createdAt > throttleWindow && slash24(String(d.ip || '')) === slash24(ip);
      });

      if (!recentlySent) {
        const token = randomUUID();
        await db.collection('ip_verification_tokens').add({ token, tenantId, ip, createdAt: now });
        const email = params.email || tenant.companyEmail || tenant.supportEmail;
        if (email) {
          const backendUrl = process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3000';
          const verifyUrl = `${backendUrl}/api/tenants/verify-ip?token=${token}`;
          const cta = blockEnabled
            ? `<p>For your security, we require you to verify this IP before accessing the dashboard.</p>
               <div style="margin:24px 0;"><a href="${verifyUrl}" style="background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:500;display:inline-block;">Verify IP Address</a></div>`
            : `<p>This is a heads-up only — no action needed. If this wasn't you, secure your account.</p>`;
          try {
            await deps.sendEmail({
              to: email,
              subject: blockEnabled ? 'New IP Address Detected - Verification Required' : 'New sign-in to your FLYNAI account',
              html: `<div style="font-family:sans-serif;padding:20px;color:#333;max-width:600px;border:1px solid #e4e4e7;border-radius:8px;">
                <h2 style="color:#18181b;">Security Alert: New IP Address</h2>
                <p>We noticed a sign-in from a new location or device with IP address: <strong>${ip}</strong>.</p>
                ${cta}
                <br/><p style="color:#71717a;font-size:14px;">— The FLYNAI Team</p></div>`,
            });
            logger.log(`IP ${blockEnabled ? 'verify' : 'alert'} email sent to ${email} for tenant ${tenantId} (ip ${ip})`);
          } catch (mailErr: any) {
            logger.error(`IP email FAILED to ${email} for tenant ${tenantId}: ${mailErr?.message ?? mailErr}`);
          }
        } else {
          logger.warn(`IP policy: no email on file for tenant ${tenantId} — cannot send IP ${blockEnabled ? 'verification' : 'alert'}.`);
        }
      }
    } catch (err: any) {
      logger.error(`IP policy token/throttle error for tenant ${tenantId}: ${err?.message ?? err}`);
      // On infra error, do NOT hard-block (avoid locking users out due to Firestore hiccups).
      if (blockEnabled) return;
    }
  }

  if (blockEnabled) {
    throw new UnauthorizedException(`New IP address detected (${ip}). A verification email has been sent to authorize this device.`);
  }
  // alert-only → allow through
}
