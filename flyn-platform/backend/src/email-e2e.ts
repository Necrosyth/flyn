import 'dotenv/config';

import * as Imap from 'node-imap';
import * as nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function envString(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length ? v : undefined;
}

function envNumber(name: string, fallback?: number): number {
  const v = process.env[name];
  if (!v) {
    if (fallback === undefined) throw new Error(`Missing required env var: ${name}`);
    return fallback;
  }
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number (got: ${v})`);
  return n;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type E2EConfig = {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  imap: {
    host: string;
    port: number;
    tls: boolean;
    user: string;
    pass: string;
  };
  mail: {
    from: string;
    to: string;
  };
  poll: {
    timeoutMs: number;
    intervalMs: number;
  };
};

async function loadConfigFromFirestore(tenantId: string): Promise<E2EConfig> {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH not set');

  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();
  const credsDoc = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('channel_credentials')
    .doc('email')
    .get();

  if (!credsDoc.exists) {
    throw new Error(`No email credentials found in Firestore for tenant ${tenantId}`);
  }

  const creds = credsDoc.data() as any;
  
  // Map stored credentials to E2EConfig
  const imapUser = creds.imapUsername || creds.username || creds.auth?.user;
  const smtpUser = creds.smtpUsername || creds.username || creds.auth?.user;
  const imapPass = creds.imapPassword || creds.password || creds.auth?.pass;
  const smtpPass = creds.smtpPassword || creds.password || creds.auth?.pass;

  if (!imapUser || !imapPass || !creds.imapHost) {
    throw new Error(`Incomplete IMAP credentials for tenant ${tenantId}: ${JSON.stringify(creds)}`);
  }
  if (!smtpUser || !smtpPass || !creds.smtpHost) {
    throw new Error(`Incomplete SMTP credentials for tenant ${tenantId}: ${JSON.stringify(creds)}`);
  }

  return {
    smtp: {
      host: creds.smtpHost,
      port: creds.smtpPort || 587,
      secure: creds.smtpPort === 465,
      user: smtpUser,
      pass: smtpPass,
    },
    imap: {
      host: creds.imapHost,
      port: creds.imapPort || 993,
      tls: true,
      user: imapUser,
      pass: imapPass,
    },
    mail: {
      from: smtpUser,
      to: imapUser,
    },
    poll: {
      timeoutMs: envNumber('E2E_POLL_TIMEOUT_MS', 120_000),
      intervalMs: envNumber('E2E_POLL_INTERVAL_MS', 5_000),
    },
  };
}

async function sendEmail(cfg: E2EConfig, subject: string, text: string) {
  const transporter = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: {
      user: cfg.smtp.user,
      pass: cfg.smtp.pass,
    },
  });

  const info = await transporter.sendMail({
    from: cfg.mail.from,
    to: cfg.mail.to,
    subject,
    text,
  });

  return info;
}

async function searchImapOnce(cfg: E2EConfig, token: string): Promise<{ found: boolean; subject?: string; from?: string; messageId?: string }> {
  const imap = new Imap({
    user: cfg.imap.user,
    password: cfg.imap.pass,
    host: cfg.imap.host,
    port: cfg.imap.port,
    tls: cfg.imap.tls,
    tlsOptions: { rejectUnauthorized: false },
  });

  return new Promise((resolve, reject) => {
    const done = (err?: any, result?: any) => {
      try {
        imap.end();
      } catch {
        // ignore
      }
      if (err) return reject(err);
      resolve(result);
    };

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) return done(err);

        // Search for messages that contain token in subject or body.
        // TEXT is broad and should match body headers etc.
        imap.search([['TEXT', token]], (err, results) => {
          if (err) return done(err);
          if (!results || results.length === 0) return done(undefined, { found: false });

          const latest = results[results.length - 1];
          const f = imap.fetch([latest], { bodies: '' });

          let resolved = false;

          f.on('message', (msg) => {
            msg.on('body', (stream) => {
              const readable = Readable.from(stream as any);
              simpleParser(readable, (err, parsed) => {
                if (resolved) return;
                resolved = true;
                if (err) return done(undefined, { found: true });

                const from = parsed.from?.text;
                const subject = parsed.subject;
                const messageId = parsed.messageId;
                return done(undefined, { found: true, from, subject, messageId });
              });
            });
          });

          f.once('error', (err) => {
            if (resolved) return;
            resolved = true;
            return done(err);
          });

          f.once('end', () => {
            if (resolved) return;
            resolved = true;
            return done(undefined, { found: true });
          });
        });
      });
    });

    imap.once('error', (err) => done(err));
    imap.connect();
  });
}

async function pollImapForToken(cfg: E2EConfig, token: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < cfg.poll.timeoutMs) {
    const res = await searchImapOnce(cfg, token).catch(() => ({ found: false }));
    if (res.found) return res;
    await sleep(cfg.poll.intervalMs);
  }
  return { found: false };
}

async function main() {
  const tenantId = process.env.E2E_TENANT_ID || '0qf9jPKHsbovXIMDL0Q3';
  // eslint-disable-next-line no-console
  console.log(`Loading credentials from Firestore for tenant: ${tenantId}...`);
  
  const cfg = await loadConfigFromFirestore(tenantId);
  
  const token = `FLOWHUB-E2E-${randomUUID()}`;
  const subject = `FlowHub Email E2E ${token}`;
  const text = `Self-verifying email E2E token: ${token}`;

  // SMTP send
  const info = await sendEmail(cfg, subject, text);

  // IMAP verify
  const verify = await pollImapForToken(cfg, token);

  // Output is intentionally minimal but deterministic for CI parsing
  const output = {
    ok: verify.found,
    token,
    smtp: {
      messageId: (info as any)?.messageId,
      accepted: (info as any)?.accepted,
      rejected: (info as any)?.rejected,
      response: (info as any)?.response,
    },
    imap: verify,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(output, null, 2));

  if (!verify.found) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
