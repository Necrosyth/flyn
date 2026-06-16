import React from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export const VerifyEmailPage = () => {
  const { fbUser, refreshUser } = useAuth();
  
  const resendEmail = async () => {
    if (fbUser) await sendEmailVerification(fbUser);
    alert("Verification email resent!");
  };

  const checkStatus = async () => {
    try {
      await refreshUser();
      if (fbUser?.emailVerified) {
        window.location.href = '/dashboard';
      } else {
        alert("Still not verified.");
      }
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>Please check your inbox to verify your email address before continuing.</p>
          <Button onClick={checkStatus} className="w-full">I've verified my email</Button>
          <Button onClick={resendEmail} variant="outline" className="w-full">Resend Verification Email</Button>
        </CardContent>
      </Card>
    </div>
  );
};
