export type TelephonyServiceStatus = 'active' | 'inactive' | 'provisioning' | 'error';

export interface TelephonySmsState {
  status: TelephonyServiceStatus;
  phoneNumber?: string;
  activatedAt?: number;
  errorMessage?: string;
  // Internal — stripped before returning to frontend
  _twilioSid?: string;
}

export interface TelephonyVoiceState {
  status: TelephonyServiceStatus;
  phoneNumber?: string;
  activatedAt?: number;
  errorMessage?: string;
  aiProvider?: 'twilio' | 'vapi';
  // Internal — stripped before returning to frontend
  _twilioSid?: string;
  _vapiPhoneNumberId?: string;
  _vapiAssistantId?: string;
}

export interface TelephonyConfig {
  sms?: TelephonySmsState | null;
  voice?: TelephonyVoiceState | null;
}

export interface TelephonyStatusResponse {
  sms: { status: TelephonyServiceStatus; phoneNumber?: string; activatedAt?: number } | null;
  voice: { status: TelephonyServiceStatus; phoneNumber?: string; activatedAt?: number; aiProvider?: 'twilio' | 'vapi' } | null;
}
