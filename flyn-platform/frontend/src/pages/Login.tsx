import { GoogleAuthProvider, OAuthProvider, signInWithPopup, getIdTokenResult, getIdToken, getMultiFactorResolver, signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useMfa } from "@/contexts/MfaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import FlynLogo from "@/components/FlynLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { API_BASE_URL } from "@/lib/api";
import { enableDemoMode } from "@/lib/demo-mode";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const { login, isAuthenticated } = useAuth();
  const { branding } = useBranding();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setResolver, setFrom } = useMfa();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const nextRaw = searchParams.get("next");
  const next = nextRaw ? decodeURIComponent(nextRaw) : undefined;

  const state = location.state as any;
  const fromPathname = state?.from?.pathname || undefined;

  // Redirect if already authenticated
  useEffect(() => {
    console.log("%c[LOGIN] useEffect - Checking authentication state", "color: gray; font-size: 12px;", {
      isAuthenticated,
      isLoading,
      next,
      fromPathname,
      timestamp: new Date().toISOString(),
    });

    if (isAuthenticated && !isLoading) {
      let destination = next || fromPathname || "/dashboard";
      console.log("%c[LOGIN] ✅ isAuthenticated detected from useEffect, destination:", "color: green;", destination);

      // Prevent redirecting back to auth pages
      if (["/login", "/signup", "/verify-mfa", "/verify-email", "/setup-mfa"].includes(destination)) {
        console.log("%c[LOGIN] Destination is auth page, redirecting to /dashboard instead", "color: blue;");
        destination = "/dashboard";
      }

      console.log("%c[LOGIN] useEffect navigating to:", "color: green;", destination);
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, fromPathname, next]);

  const handleSocialSignIn = async (providerName: 'google' | 'apple') => {
    console.log(`%c[LOGIN] Starting ${providerName} sign-in`, "color: blue; font-weight: bold;");
    setIsLoading(true);
    setError("");
    try {
      const provider = providerName === 'google'
        ? new GoogleAuthProvider()
        : new OAuthProvider('apple.com');

      console.log("%c[LOGIN] OAuth popup started", "color: blue;");
      const result = await signInWithPopup(auth, provider);
      console.log("%c[LOGIN] OAuth popup returned", "color: green;", {
        userEmail: result.user?.email,
        userUid: result.user?.uid,
        timestamp: new Date().toISOString(),
      });

      if (result.user) {
        // Immediately redirect for authenticated users - don't wait for context update
        const nextDest = next || fromPathname || "/dashboard";
        const finalDest = ["/login", "/signup", "/verify-mfa", "/verify-email", "/setup-mfa"].includes(nextDest)
          ? "/dashboard"
          : nextDest;

        console.log("%c[LOGIN] Authenticated user detected", "color: green; font-weight: bold;", {
          email: result.user.email,
          nextDest,
          finalDest,
          timestamp: new Date().toISOString(),
        });

        // Check if this user has already been provisioned (has an organization_id custom claim)
        console.log("%c[LOGIN] Checking if user is provisioned (has organization_id claim)", "color: blue;");
        let tokenResult = await getIdTokenResult(result.user, false);
        console.log("%c[LOGIN] Initial token claims", "color: blue;", {
          hasOrgId: !!tokenResult.claims.organization_id,
          orgId: tokenResult.claims.organization_id,
          allClaims: tokenResult.claims,
        });

        // If organization_id is missing, try a force-refresh once (claim may have just been set)
        if (!tokenResult.claims.organization_id) {
          console.log("%c[LOGIN] No organization_id found, attempting force-refresh", "color: orange;");
          try {
            tokenResult = await getIdTokenResult(result.user, true);
            console.log("%c[LOGIN] After force-refresh:", "color: orange;", {
              hasOrgId: !!tokenResult.claims.organization_id,
              orgId: tokenResult.claims.organization_id,
              allClaims: tokenResult.claims,
            });
          } catch (err) {
            console.log("%c[LOGIN] Force-refresh failed:", "color: red;", err);
            // keep original token result if refresh fails
          }
        }

        if (!tokenResult.claims.organization_id) {
          // No org linked — this is a brand-new user who hasn't signed up yet.
          // Sign them out immediately and send them to /signup so they go through
          // the invite code / org creation step first.
          await auth.signOut();
          toast({
            variant: "destructive",
            title: "No account found",
            description: "Please sign up first and enter your invite code or create an organisation.",
          });
          navigate("/signup", { replace: true });
          return;
        }

        // For existing users, navigate immediately to avoid race conditions
        console.log("%c[LOGIN] ✅ EXISTING USER - Navigating to dashboard", "color: green; font-weight: bold; font-size: 14px;", {
          destination: finalDest,
        });
        toast({ title: "Welcome back!", description: "Signed in successfully." });
        // Use setTimeout to ensure toast is shown before redirect
        setTimeout(() => {
          console.log("%c[LOGIN] ✅ EXECUTING NAVIGATION to " + finalDest, "color: green; font-weight: bold;", {
            destination: finalDest,
            timestamp: new Date().toISOString(),
          });
          navigate(finalDest, { replace: true });
        }, 100);
      }
    } catch (err: any) {
      console.log("%c[LOGIN] ❌ ERROR DURING SIGN-IN", "color: red; font-weight: bold; font-size: 14px;", {
        code: err.code,
        message: err.message,
        fullError: err,
        timestamp: new Date().toISOString(),
        stack: err.stack,
      });

      if (err.code === "auth/multi-factor-auth-required") {
        console.log("%c[LOGIN] 🔐 MFA REQUIRED", "color: purple; font-weight: bold;");
        // ── LOCAL DEV BYPASS ─────────────────────────────────────────────────
        // Firebase phone auth doesn't work on localhost. Skip MFA on local dev.
        // DO NOT push this bypass to production.
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          console.log("%c[LOGIN] 🚧 LOCALHOST: MFA bypassed", "color: orange; font-weight: bold;");
          try {
            // Google OAuth MFA errors may not expose email — try uid (localId) first
            const serverResponse = (err as any)?.customData?._serverResponse ?? (err as any)?._serverResponse;
            const oauthEmail = (err as any)?.customData?.email ?? serverResponse?.email;
            const oauthUid = serverResponse?.localId;
            console.log("[LOGIN] Dev bypass identifiers:", { oauthEmail, oauthUid });
            const res = await fetch(`${API_BASE_URL}/auth/dev-token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: oauthEmail, uid: oauthUid }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Dev token failed');
            await signInWithCustomToken(auth, data.customToken);
            toast({ title: "Dev Mode", description: "MFA bypassed on localhost." });
            navigate(next || fromPathname || "/dashboard", { replace: true });
          } catch (bypassErr: any) {
            console.error("[LOGIN] Dev MFA bypass failed:", bypassErr);
            setError(bypassErr.message || "Dev MFA bypass failed");
          }
        } else {
          const resolver = getMultiFactorResolver(auth, err);
          setResolver(resolver);
          setFrom(fromPathname || next || "/dashboard");
          navigate("/verify-mfa", { replace: true });
        }
        // ─────────────────────────────────────────────────────────────────────
      } else if (err.code === "auth/popup-closed-by-user") {
        console.log("%c[LOGIN] User closed OAuth popup - ignoring", "color: blue;");
        // Do nothing, user just closed the popup
      } else {
        console.log("%c[LOGIN] ❌ Sign-in failed - showing error to user", "color: red;", err.message);
        setError(err.message || `Failed to sign in with ${providerName}`);
        toast({ variant: "destructive", title: "Sign-in Failed", description: err.message });
      }
    } finally {
      console.log("%c[LOGIN] Finally block - setting isLoading to false", "color: gray;");
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const success = await login(email, password);
      if (success) {
        const nextRaw = searchParams.get("next") || undefined;
        const next = nextRaw ? decodeURIComponent(nextRaw) : undefined;
        navigate(next || fromPathname || "/dashboard", { replace: true });
      } else {
        setError(t("auth.invalidCredentials"));
      }
    } catch (err: any) {
      if (err.code === "auth/multi-factor-auth-required") {
        // ── LOCAL DEV BYPASS ─────────────────────────────────────────────────
        // Firebase phone auth doesn't work on localhost (invalid-app-credential).
        // Skip MFA entirely when running locally so we can access the dashboard.
        // DO NOT push this bypass to production.
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          try {
            const res = await fetch(`${API_BASE_URL}/auth/dev-token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Dev token failed');
            await signInWithCustomToken(auth, data.customToken);
            toast({ title: "Dev Mode", description: "MFA bypassed on localhost." });
            const nextRaw = searchParams.get("next") || undefined;
            const nextDest = nextRaw ? decodeURIComponent(nextRaw) : undefined;
            navigate(nextDest || fromPathname || "/dashboard", { replace: true });
          } catch (bypassErr: any) {
            setError(bypassErr.message || "Dev MFA bypass failed");
          }
        } else {
          const resolver = getMultiFactorResolver(auth, err);
          setResolver(resolver);
          setFrom(fromPathname);
          navigate("/verify-mfa", { replace: true });
        }
        // ─────────────────────────────────────────────────────────────────────
      } else {
        setError(t("auth.loginFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoAccess = () => {
    enableDemoMode();
    window.location.reload();
  };

  return (
    <div className="min-h-[100svh] flex items-center justify-center p-4 sm:p-8 bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Language Switcher */}
        <div className="flex justify-end mb-4">
          <LanguageSwitcher variant="page" />
        </div>

        <div className="mb-5 flex justify-center">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.appName} className="h-12 object-contain" />
          ) : (
            <FlynLogo size="lg" customText={branding.logoText} />
          )}
        </div>

        <div className="text-center mb-5">
          <h2 className="text-2xl font-bold text-foreground">{t("auth.welcomeBack")}</h2>
          <p className="text-muted-foreground mt-2">
            {t("auth.signInTo", { appName: branding.appName })}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 h-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-destructive text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 flyn-button-gradient text-base"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("auth.signingIn")}
              </div>
            ) : (
              t("auth.signIn")
            )}
          </Button>
        </form>

        <Button
          type="button"
          variant="secondary"
          className="w-full h-11 mt-3"
          onClick={handleDemoAccess}
        >
          Continue as Demo
        </Button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border"></span>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Button
            variant="outline"
            className="h-10 flex items-center gap-2 text-sm"
            onClick={() => handleSocialSignIn('google')}
            disabled={isLoading}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google
          </Button>
          <Button
            variant="outline"
            className="h-10 flex items-center gap-2 text-sm"
            onClick={() => handleSocialSignIn('apple')}
            disabled={isLoading}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.11.78.9-.11 2.21-.92 3.84-.73 2.1.25 3.58 1.48 4.29 3.11-4.32 2.38-3.32 8.44.8 10.05-.51 1.3-1.14 2.38-2.04 3.36zM15.42 1.5c.03 2.13-1.74 3.82-3.8 3.82-.03-2.13 1.74-3.82 3.8-3.82z" />
            </svg>
            Apple
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t("auth.noAccount")}{" "}
          <Link to="/signup" className="text-primary hover:underline font-medium">
            {t("auth.getStarted")}
          </Link>
        </p>

      </motion.div>
    </div>
  );
};

export default Login;
