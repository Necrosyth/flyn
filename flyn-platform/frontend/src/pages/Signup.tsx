import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FlynLogo from "@/components/FlynLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { auth } from "@/lib/firebase";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getIdToken,
  sendEmailVerification,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { API_BASE_URL } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Step = "invite-entry" | "invite-join" | "regular";

interface InviteInfo {
  orgName: string;
  invitedEmail: string;
  role: string;
  expiresAt: number;
}

const firebaseAuthErrorMessage = (err: FirebaseError): string => {
  switch (err.code) {
    case "auth/email-already-in-use":
      return "Email already in use.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Please use at least 6 characters.";
    default:
      return "Signup failed. Please try again.";
  }
};

const PageShell = ({ step, children }: { step: string; children: React.ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center p-8 bg-background">
    <motion.div
      key={step}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md"
    >
      <div className="flex justify-end mb-4">
        <LanguageSwitcher variant="page" />
      </div>
      <div className="mb-8 flex justify-center">
        <FlynLogo size="lg" />
      </div>
      {children}
    </motion.div>
  </div>
);

const Signup = () => {
  const [searchParams] = useSearchParams();
  const urlInvite = searchParams.get("invite");

  const [step, setStep] = useState<Step>("invite-entry");
  const [inviteCode, setInviteCode] = useState(urlInvite?.trim().toUpperCase() || "");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [isValidating, setIsValidating] = useState(!!urlInvite);

  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  // Auto-validate invite from URL on mount — skip Step 1 if valid
  useEffect(() => {
    if (!urlInvite) return;
    const code = urlInvite.trim();
    fetch(`${API_BASE_URL}/team/invite/${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "Invalid or expired invite code");
          return;
        }
        const info: InviteInfo = await res.json();
        setInviteInfo(info);
        setEmail(info.invitedEmail);
        setStep("invite-join");
      })
      .catch(() => setError("Could not validate invite code. Check your connection."))
      .finally(() => setIsValidating(false));
  }, []);

  // ── Invite: Step 1 — validate code ──────────────────────────────────────────

  const handleValidateCode = async () => {
    const trimmed = inviteCode.trim().toUpperCase();
    if (!trimmed) { setError("Enter your invite code"); return; }
    setIsValidating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/team/invite/${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Invalid or expired invite code");
        return;
      }
      const info: InviteInfo = await res.json();
      setInviteInfo(info);
      setInviteCode(trimmed);
      setEmail(info.invitedEmail);
      setStep("invite-join");
    } catch {
      setError("Could not validate invite code. Check your connection.");
    } finally {
      setIsValidating(false);
    }
  };

  // ── Invite: Step 2 — email + password join ───────────────────────────────────

  const handleInviteJoin = async () => {
    if (!email?.trim()) {
      toast({ variant: "destructive", title: "Email required", description: "Enter the email the invite was sent to." });
      return;
    }
    if (!password || password.length < 8) {
      toast({ variant: "destructive", title: "Password required", description: "Choose a password with at least 8 characters." });
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        currentUser = cred.user;
        await sendEmailVerification(cred.user).catch(() => {});
      }
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE_URL}/team/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ inviteCode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to join team");
      }
      // Force-refresh so new organization_id claim is in token before navigation
      await currentUser.getIdToken(true).catch(() => {});
      window.location.href = "/dashboard";
    } catch (err: any) {
      if (err instanceof FirebaseError) {
        setError(firebaseAuthErrorMessage(err));
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Invite: Step 2 — Google join ─────────────────────────────────────────────

  const handleGoogleJoin = async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const token = await result.user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/team/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ inviteCode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        await signOut(auth);
        throw new Error(data.message || "Failed to join team");
      }
      await result.user.getIdToken(true).catch(() => {});
      window.location.href = "/dashboard";
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user") return;
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Regular signup handlers (unchanged) ──────────────────────────────────────

  const handleSocialSignUp = async (providerName: "google" | "apple") => {
    setIsLoading(true);
    setError("");
    try {
      const provider = providerName === "google"
        ? new GoogleAuthProvider()
        : new OAuthProvider("apple.com");

      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        const idToken = await getIdToken(result.user, true);
        const orgName = companyName.trim() || result.user.displayName || result.user.email?.split("@")[0] || "My Workspace";

        const res = await fetch(`${API_BASE_URL}/tenants/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, name: orgName }),
        });

        if (res.ok) {
          const provisionData = await res.json().catch(() => null);
          if (provisionData?.tenant?.id) {
            localStorage.setItem("tenantId", provisionData.tenant.id);
          }
          await getIdToken(result.user, true).catch(() => {});
          navigate("/onboarding");
        } else {
          const data = await res.json().catch(() => ({ message: "Provisioning failed" }));
          throw new Error(data?.message || "Failed to provision account");
        }
      }
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user") {
        // Do nothing
      } else {
        setError(err.message || `Failed to sign up with ${providerName}`);
        toast({ variant: "destructive", title: "Sign-up Failed", description: err.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (!auth) {
      setError(t("auth.firebaseNotConfigured"));
      setIsLoading(false);
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const idToken = await getIdToken(cred.user, true);
      const res = await fetch(`${API_BASE_URL}/tenants/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, name: companyName }),
      });
      if (!res.ok) {
        throw new Error(
          "Provisioning failed. Your account was created, but setup didn't complete. Please log in, or contact support if this persists."
        );
      }
      const provisionData = await res.json().catch(() => null);
      if (provisionData?.tenant?.id) {
        localStorage.setItem("tenantId", provisionData.tenant.id);
      }
      await getIdToken(cred.user, true).catch(() => {});
      await sendEmailVerification(cred.user).catch(() => {});
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(firebaseAuthErrorMessage(err));
      } else if (err instanceof Error) {
        setError(err.message || t("auth.signupFailed"));
      } else {
        setError(t("auth.signupFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Shared UI fragments ───────────────────────────────────────────────────────

  const googleIcon = (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );

  const spinner = (
    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  );

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
    >
      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );

  const errorMessage = error ? (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-destructive text-sm text-center"
    >
      {error}
    </motion.p>
  ) : null;

  const signInLink = (
    <p className="text-sm text-muted-foreground">
      {t("auth.alreadyHaveAccount")}{" "}
      <Link to="/login" className="text-primary hover:underline font-medium">
        {t("auth.signInLink")}
      </Link>
    </p>
  );

  // ── STEP: invite-entry ────────────────────────────────────────────────────────

  if (step === "invite-entry") {
    return (
      <PageShell step={step}>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground">Get started</h2>
          <p className="text-muted-foreground mt-2">Have an invite code? Enter it below.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inviteCode">Invite Code</Label>
            <Input
              id="inviteCode"
              placeholder="FLYN-XXXXXXXX"
              value={inviteCode}
              onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleValidateCode()}
              className="h-12 font-mono tracking-widest text-center"
              disabled={isValidating}
              autoFocus
            />
          </div>

          {errorMessage}

          <Button
            onClick={handleValidateCode}
            disabled={isValidating || !inviteCode.trim()}
            className="w-full h-12 flyn-button-gradient text-base"
          >
            {isValidating ? (
              <div className="flex items-center gap-2">{spinner} Validating...</div>
            ) : (
              <span className="flex items-center gap-2">
                Continue <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>

        {/* Or divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-3 text-muted-foreground">Or</span>
          </div>
        </div>

        {/* New org path */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization Name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="orgName"
                type="text"
                placeholder="Acme Inc."
                value={companyName}
                onChange={(e) => { setCompanyName(e.target.value); setError(""); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && companyName.trim()) {
                    setStep("regular");
                    setError("");
                  }
                }}
                className="pl-10 h-12"
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={!companyName.trim()}
            className="w-full h-12 text-base"
            onClick={() => { setStep("regular"); setError(""); }}
          >
            <span className="flex items-center gap-2">
              Create Organization <ArrowRight className="h-4 w-4" />
            </span>
          </Button>
        </div>

        <div className="mt-6 text-center">
          {signInLink}
        </div>
      </PageShell>
    );
  }

  // ── STEP: invite-join ─────────────────────────────────────────────────────────

  if (step === "invite-join") {
    return (
      <PageShell step={step}>
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">Create your account</h2>
          <p className="text-muted-foreground mt-2">Accept your invitation to get started.</p>
        </div>

        {inviteInfo && (
          <div className="mb-5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
            You were invited to join <strong>{inviteInfo.orgName}</strong> as{" "}
            <strong className="capitalize">{inviteInfo.role}</strong>.
          </div>
        )}

        <div className="space-y-4">
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
                minLength={8}
              />
              {passwordToggle}
            </div>
          </div>

          {errorMessage}

          <Button
            onClick={handleInviteJoin}
            disabled={isLoading}
            className="w-full h-12 flyn-button-gradient text-base"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">{spinner} Joining...</div>
            ) : (
              "Join Team"
            )}
          </Button>

          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full h-12 flex items-center justify-center gap-2"
            onClick={handleGoogleJoin}
            disabled={isLoading}
            type="button"
          >
            {googleIcon}
            Continue with Google
          </Button>
        </div>

        <div className="mt-6 text-center space-y-3">
          {!urlInvite && (
            <button
              type="button"
              onClick={() => { setStep("invite-entry"); setError(""); }}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto text-sm transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}
          {signInLink}
        </div>
      </PageShell>
    );
  }

  // ── STEP: regular (unchanged) ─────────────────────────────────────────────────

  return (
    <PageShell step={step}>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground">{t("auth.createAccount")}</h2>
        <p className="text-muted-foreground mt-2">{t("auth.startJourney")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email-reg">{t("auth.email")}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="email-reg"
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
          <Label htmlFor="password-reg">{t("auth.password")}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="password-reg"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10 h-12"
              required
              minLength={8}
            />
            {passwordToggle}
          </div>
        </div>

        {errorMessage}

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 flyn-button-gradient text-base"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">{spinner} {t("auth.creatingAccount")}</div>
          ) : (
            <span className="flex items-center gap-2">
              {t("auth.getStarted")} <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          className="h-12 flex items-center gap-2"
          onClick={() => handleSocialSignUp("google")}
          disabled={isLoading}
          type="button"
        >
          {googleIcon}
          Google
        </Button>
        <Button
          variant="outline"
          className="h-12 flex items-center gap-2"
          onClick={() => handleSocialSignUp("apple")}
          disabled={isLoading}
          type="button"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.11.78.9-.11 2.21-.92 3.84-.73 2.1.25 3.58 1.48 4.29 3.11-4.32 2.38-3.32 8.44.8 10.05-.51 1.3-1.14 2.38-2.04 3.36zM15.42 1.5c.03 2.13-1.74 3.82-3.8 3.82-.03-2.13 1.74-3.82 3.8-3.82z" />
          </svg>
          Apple
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {t("auth.alreadyHaveAccount")}{" "}
        <Link to="/login" className="text-primary hover:underline font-medium">
          {t("auth.signInLink")}
        </Link>
      </p>
    </PageShell>
  );
};

export default Signup;
