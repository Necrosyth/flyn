/**
 * Voice Provisioning — pool + admin-approval model.
 *
 * Flyn owns ONE platform Twilio account (FLYN_TWILIO_ACCOUNT_SID / FLYN_TWILIO_AUTH_TOKEN).
 * An admin pre-purchases a pool of numbers. Clients request "Flyn Voice"; an admin
 * approves and a number is assigned from the pool. All calls then route through the
 * platform account + the in-house channels AI flow (Gemini/Polly/Deepgram). Clients
 * never see a Twilio credential.
 *
 * This lives in the telephony module (extends it) but is independent of the legacy
 * VAPI auto-buy path in telephony.service.ts.
 */

export type PoolNumberStatus = 'available' | 'assigned' | 'reserved';

/** Firestore: platform_phone_pool/{E.164 number} */
export interface PoolNumber {
  number: string; // E.164 "+14155551234"
  twilioSid: string; // Twilio IncomingPhoneNumber SID (PNxxxx)
  status: PoolNumberStatus;
  assignedTo: string | null; // tenantId when assigned/reserved
  assignedAt: string | null; // ISO timestamp
  country: string; // 'US', 'IN', ...
  capabilities: { voice: boolean; sms: boolean };
  addedAt: string; // ISO timestamp
  addedBy: string; // admin uid
}

export type ActivationStatus =
  | 'pending' // client requested, awaiting admin approval
  | 'pending_number' // admin approved but pool was empty — waitlisted
  | 'active' // number assigned + webhooks configured
  | 'rejected'
  | 'inactive';

/** Firestore: voice_activation_requests/{tenantId} */
export interface VoiceActivationRequest {
  tenantId: string;
  tenantName: string;
  requestedBy: string; // uid
  requestedAt: string; // ISO timestamp
  status: ActivationStatus;
  assignedNumber: string | null; // E.164
  assignedNumberSid: string | null;
  approvedBy: string | null; // admin uid
  approvedAt: string | null; // ISO timestamp
  rejectedReason: string | null;
  webhookConfigured: boolean;
}

/** Stored on tenants/{tenantId}.flynVoice */
export interface FlynVoiceState {
  status: 'inactive' | 'pending' | 'active';
  phoneNumber: string | null;
  phoneNumberSid: string | null;
  selectedAgentId?: string | null; // which Flyn agent answers inbound calls
  activatedAt: string | null; // ISO timestamp
}

export interface PoolCounts {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
}

/**
 * One number held by a tenant: tenants/{tenantId}/flynVoiceNumbers/{e164}.
 * First number is free (billable=false). Additional numbers are paid
 * ($X/mo Stripe subscription) and locked until period end.
 */
export interface TenantVoiceNumber {
  number: string; // E.164
  twilioSid: string;
  source: 'pool' | 'purchased';
  billable: boolean; // false = free first number, true = paid add-on
  allocatedAt: string; // ISO
  allocatedBy: string; // uid | 'stripe-webhook'
  // Paid-only fields:
  stripeSubscriptionId?: string;
  stripeCustomerId?: string | null;
  priceCents?: number;
  periodStart?: number; // ms
  periodEnd?: number; // ms — locked until this; cancellation effective here
  cancelAtPeriodEnd?: boolean;
  status?: 'active' | 'canceling';
  /** Inbound AI agent that answers calls to THIS number. */
  agentId?: string | null;
}

/** Reverse lookup for webhook-driven release: flyn_voice_subscriptions/{stripeSubscriptionId}. */
export interface VoiceSubscriptionMap {
  tenantId: string;
  number: string;
  twilioSid: string;
  periodEnd: number;
  status: 'active' | 'canceling';
  createdAt: string;
}
