import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  multiFactor,
  RecaptchaVerifier,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from 'react-router-dom';
import { tenantsService } from '@/services/tenants';

export const SetupMfaPage = () => {
  const { fbUser, refreshUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'phone' | 'code' | 'reauth'>('phone');
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthLoading, setReauthLoading] = useState(false);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      recaptchaVerifier.current?.clear();
    };
  }, []);

  const initRecaptcha = () => {
    if (!auth) return null;

    if (recaptchaVerifier.current) {
      try { recaptchaVerifier.current.clear(); } catch {}
      recaptchaVerifier.current = null;
    }

    // Clear DOM too — Firebase leaves reCAPTCHA iframe fragments behind even
    // after .clear(), causing "already been rendered" on the next attempt.
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';

    try {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
      });
      recaptchaVerifier.current = verifier;
      return verifier;
    } catch (err) {
      console.error("Error initializing reCAPTCHA", err);
      return null;
    }
  };

  const handleSendCode = async () => {
    if (!fbUser || !auth) return;
    if (!phone.startsWith('+')) {
      toast({ variant: "destructive", title: "Invalid phone number", description: "Please use international format, e.g. +919131716117" });
      return;
    }

    setLoading(true);
    try {
      const verifier = initRecaptcha();
      if (!verifier) throw new Error("Failed to initialize reCAPTCHA");

      const mfaSession = await multiFactor(fbUser).getSession();
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const vId = await phoneAuthProvider.verifyPhoneNumber(
        { phoneNumber: phone, session: mfaSession },
        verifier,
      );

      setVerificationId(vId);
      setStep('code');
      toast({ title: "Code sent", description: "Check your phone for a 6-digit verification code." });
    } catch (err: any) {
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;

      if (err.code === 'auth/requires-recent-login') {
        setStep('reauth');
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "For security, please re-enter your password to continue setting up MFA.",
        });
      } else {
        toast({ variant: "destructive", title: "Failed to send code", description: err.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReauth = async () => {
    if (!fbUser?.email) return;
    setReauthLoading(true);
    try {
      const credential = EmailAuthProvider.credential(fbUser.email, reauthPassword);
      await reauthenticateWithCredential(fbUser, credential);
      setReauthPassword("");
      setStep('phone');
      toast({ title: "Identity confirmed", description: "You can now continue setting up MFA." });
      // Retry sending the code immediately if phone is already filled
      if (phone.startsWith('+')) {
        await handleSendCode();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Re-authentication failed", description: "Incorrect password. Please try again." });
    } finally {
      setReauthLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!fbUser || !verificationId) return;
    setLoading(true);
    try {
      const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);

      await multiFactor(fbUser).enroll(assertion, "Primary Phone");

      try {
        await tenantsService.patchMe({ phone } as any);
      } catch (err: any) {
        console.error("[MFA] Failed to store phone:", err);
      }

      await refreshUser();

      toast({ title: "MFA enrolled", description: "Your account is now secured with two-factor authentication." });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Invalid code", description: "The code you entered is incorrect or expired. Try resending." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>OTP Verification</CardTitle>
          <CardDescription>
            {step === 'phone' && "Enter your phone number to receive a secure verification code via SMS."}
            {step === 'code' && "Enter the 6-digit code we sent to your phone."}
            {step === 'reauth' && "Your session has expired. Re-enter your password to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id="recaptcha-container" />

          {step === 'reauth' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="reauth-password">Password</Label>
                <Input
                  id="reauth-password"
                  type="password"
                  placeholder="Your current password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReauth()}
                />
              </div>
              <Button onClick={handleReauth} className="w-full" disabled={reauthLoading || !reauthPassword}>
                {reauthLoading ? "Verifying..." : "Confirm Identity"}
              </Button>
            </>
          )}

          {step === 'phone' && (
            <>
              <Input
                type="tel"
                placeholder="+1 234 567 8900"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Button onClick={handleSendCode} className="w-full" disabled={loading || !phone}>
                {loading ? "Sending SMS..." : "Send Verification Code"}
              </Button>
            </>
          )}

          {step === 'code' && (
            <>
              <Input
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
              <Button onClick={handleVerifyCode} className="w-full" disabled={loading || !verificationCode}>
                {loading ? "Verifying..." : "Confirm & Access Dashboard"}
              </Button>
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={handleSendCode} className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Resend OTP"}
                </Button>
                <Button variant="ghost" onClick={() => setStep('phone')} className="w-full text-xs text-muted-foreground">
                  Back to change phone number
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
