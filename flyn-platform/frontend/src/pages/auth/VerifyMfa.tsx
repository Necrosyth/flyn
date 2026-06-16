import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneAuthProvider, PhoneMultiFactorGenerator, RecaptchaVerifier } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from 'react-router-dom';
import { useMfa } from '@/contexts/MfaContext';

export const VerifyMfaPage = () => {
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const navigate = useNavigate();
  const { resolver, from } = useMfa();

  useEffect(() => {
    if (!resolver) {
      navigate('/login');
      return;
    }
    // Auto-send code on mount
    handleSendCode();

    return () => {
      if (recaptchaVerifier.current) {
        recaptchaVerifier.current.clear();
      }
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
      });
      recaptchaVerifier.current = verifier;
      return verifier;
    } catch (err) {
      console.error("Error initializing reCAPTCHA", err);
      return null;
    }
  };

  const handleSendCode = async () => {
    if (!resolver || !auth) return;
    setLoading(true);
    try {
      const verifier = initRecaptcha();
      if (!verifier) throw new Error("Failed to initialize reCAPTCHA");

      const phoneInfoOptions = {
        multiFactorHint: resolver.hints[0],
        session: resolver.session
      };

      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const vId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, verifier);

      setVerificationId(vId);
      toast({ title: "Code Sent", description: "Please check your phone for a verification code." });
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Failed to send code", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!resolver || !verificationId) return;
    setLoading(true);
    try {
      const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);

      await resolver.resolveSignIn(assertion);
      toast({ title: "Success", description: "Signed in successfully." });
      navigate(from || '/dashboard', { replace: true });
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Invalid code", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>MFA Verification</CardTitle>
          <CardDescription>
            Enter the 6-digit code we sent to your registered phone number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id="recaptcha-container"></div>
          <Input
            placeholder="123456"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && verificationCode && handleVerifyCode()}
            autoFocus
          />
          <Button onClick={handleVerifyCode} className="w-full" disabled={loading || !verificationCode}>
            {loading ? "Verifying..." : "Confirm & Access Dashboard"}
          </Button>
          <Button variant="outline" onClick={handleSendCode} className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Resend OTP"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
