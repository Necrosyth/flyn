/**
 * Contracts Encryption Utility — AES-256-CBC
 * ────────────────────────────────────────────
 * From FLYN_AI_Contracts_Module_Implementation.pdf Section 10:
 *   "AES-256 encryption for contract data at rest"
 *
 * Provides encrypt/decrypt helpers for sensitive contract content,
 * signature data, and PII stored in the Contracts module.
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size

/**
 * Returns the 32-byte encryption key from env or a deterministic fallback.
 * In production, CONTRACTS_ENCRYPTION_KEY must be a 64-char hex string.
 */
function getKey(): Buffer {
    const envKey = process.env.CONTRACTS_ENCRYPTION_KEY;
    if (envKey && envKey.length === 64) {
        return Buffer.from(envKey, 'hex');
    }
    // Deterministic dev fallback (NOT for production)
    return crypto.createHash('sha256').update('flyn-contracts-dev-key').digest();
}

/**
 * Encrypt plaintext using AES-256-CBC.
 * Returns base64-encoded string: iv:encrypted
 */
export function encryptContractData(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt ciphertext produced by encryptContractData.
 */
export function decryptContractData(ciphertext: string): string {
    const key = getKey();
    const [ivHex, encryptedData] = ciphertext.split(':');
    if (!ivHex || !encryptedData) throw new Error('Invalid encrypted data format');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Hash sensitive data (e.g. for audit trail fingerprinting).
 */
export function hashContractFingerprint(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a secure signing token (32-byte random hex).
 */
export function generateSigningToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate signed URL with expiry (HMAC-SHA256).
 */
export function generateSignedUrl(contractId: string, signerEmail: string, expiresAt: Date): string {
    const key = getKey();
    const payload = `${contractId}:${signerEmail}:${expiresAt.getTime()}`;
    const signature = crypto.createHmac('sha256', key).update(payload).digest('hex');
    return `${payload}:${signature}`;
}

/**
 * Verify a signed URL's integrity and expiry.
 */
export function verifySignedUrl(signedUrl: string): { valid: boolean; expired: boolean; contractId?: string; signerEmail?: string } {
    const parts = signedUrl.split(':');
    if (parts.length < 4) return { valid: false, expired: false };

    const [contractId, signerEmail, expiryStr, signature] = parts;
    const key = getKey();
    const payload = `${contractId}:${signerEmail}:${expiryStr}`;
    const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');

    const valid = signature === expected;
    const expired = Date.now() > parseInt(expiryStr, 10);

    return { valid, expired, contractId, signerEmail };
}
