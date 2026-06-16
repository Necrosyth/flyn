import { createHmac } from 'crypto';

/** Secret for signing the relay wss `?token=` (HMAC). Dedicated var; falls back to the Flyn Twilio token. */
function relaySecret(): string {
  return process.env.RELAY_WS_SECRET || process.env.FLYN_TWILIO_AUTH_TOKEN || 'flyn-relay-dev-secret';
}

/**
 * Sign a relay WS token for a call — the ONE scheme used by BOTH the TwiML builder (ChannelsService,
 * which puts it on the wss URL) and the gateway (which verifies it at setup). HMAC-SHA256 over the
 * callSid. Kept in its own dependency-free module so neither side creates an import cycle.
 */
export function signRelayToken(callSid: string): string {
  return createHmac('sha256', relaySecret()).update(callSid).digest('hex');
}
