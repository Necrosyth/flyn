import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';

// ── LOCAL DEV BYPASS ──────────────────────────────────────────────────────────
// On localhost, Firebase phone auth (MFA) doesn't work due to invalid-app-credential.
// This flag disables the email + MFA enrollment checks so you can access the dashboard.
// This NEVER applies on production because the hostname is never 'localhost' there.
// DO NOT push this bypass to production.
const IS_LOCALHOST =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';
// ─────────────────────────────────────────────────────────────────────────────

export const RequireVerification = ({ children }: { children: React.ReactNode }) => {
  const { user, fbUser, isAuthInitializing } = useAuth();
  const location = useLocation();

  if (isAuthInitializing) return null;

  // Skip all checks on localhost — _devToken synthesis in AuthContext sets user
  // without a real Firebase session, so fbUser will be null here.
  if (IS_LOCALHOST) return <>{children}</>;

  if (!user || !fbUser) return <Navigate to="/login" state={{ from: location }} replace />;

  // 1. Check Email Verification
  if (!user.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // 2. MFA is OPT-IN — never force enrollment. Users enable Phone Verification (OTP)
  // from Settings → Security; once enabled, Firebase enforces it at login
  // (multi-factor-auth-required → /verify-mfa). Disabling it means no OTP at all.
  // (Previously this hard-redirected unenrolled users to /setup-mfa, making MFA
  // mandatory and trapping anyone who disabled it.)

  return <>{children}</>;
};

