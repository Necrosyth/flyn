/**
 * useContactActions
 * -----------------
 * Shared hook for triggering Vapi AI voice calls and Twilio SMS from anywhere
 * in the app (Inbox, CRM, etc.). Uses the tenant's own connected credentials.
 */

import { useState } from "react";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface CallResult {
  success: boolean;
  error?: string;
}

export function useContactActions() {
  const { toast } = useToast();
  const [callingPhone, setCallingPhone] = useState<string | null>(null);
  const [sendingSms, setSendingSms] = useState<string | null>(null);

  /** Initiate an AI voice call — uses VAPI if connected, otherwise falls back to Twilio AI call */
  const makeVapiCall = async (phone: string, assistantId?: string): Promise<CallResult> => {
    if (!phone?.trim()) {
      toast({ variant: "destructive", title: "No phone number", description: "This contact has no phone number." });
      return { success: false };
    }

    setCallingPhone(phone);
    try {
      // Check which service is available
      const vapiConfig = await authedFetch(`${API_BASE_URL}/channels/vapi/config`)
        .then((r) => r.json())
        .catch(() => ({ connected: false }));

      const endpoint = vapiConfig?.connected
        ? { url: `${API_BASE_URL}/channels/vapi/call`, body: { to: phone, assistantId } }
        : { url: `${API_BASE_URL}/channels/twilio/ai-call`, body: { to: phone } };

      const res = await authedFetch(endpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(endpoint.body),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.message || data?.error || "Could not place call.";
        toast({ variant: "destructive", title: "Call failed", description: msg });
        return { success: false, error: msg };
      }
      toast({ title: "Call initiated", description: `Connecting AI voice call to ${phone}…` });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast({ variant: "destructive", title: "Call failed", description: msg });
      return { success: false, error: msg };
    } finally {
      setCallingPhone(null);
    }
  };

  /** Send SMS via the tenant's Twilio account */
  const sendTwilioSms = async (phone: string, body: string): Promise<CallResult> => {
    if (!phone?.trim()) {
      toast({ variant: "destructive", title: "No phone number", description: "This contact has no phone number." });
      return { success: false };
    }
    if (!body?.trim()) {
      return { success: false, error: "Message is empty" };
    }

    setSendingSms(phone);
    try {
      const res = await authedFetch(`${API_BASE_URL}/channels/twilio/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.message || data?.error || "Could not send SMS.";
        toast({ variant: "destructive", title: "SMS failed", description: msg });
        return { success: false, error: msg };
      }
      toast({ title: "SMS sent", description: `Message delivered to ${phone}.` });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast({ variant: "destructive", title: "SMS failed", description: msg });
      return { success: false, error: msg };
    } finally {
      setSendingSms(null);
    }
  };

  return {
    makeVapiCall,
    sendTwilioSms,
    callingPhone,
    sendingSms,
  };
}
