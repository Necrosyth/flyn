import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useMfa } from "@/contexts/MfaContext";
import { useToast } from "@/hooks/use-toast";
import { getMultiFactorResolver } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FlynLogo from "@/components/FlynLogo";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const { branding } = useBranding();
  const { setResolver, setFrom } = useMfa();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const state = location.state as unknown;
  const fromPathname =
    state &&
    typeof state === 'object' &&
    'from' in state &&
    (state as { from?: unknown }).from &&
    typeof (state as { from?: unknown }).from === 'object' &&
    (state as { from?: { pathname?: unknown } }).from?.pathname &&
    typeof (state as { from?: { pathname?: unknown } }).from?.pathname === 'string'
      ? (state as { from?: { pathname: string } }).from.pathname
      : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    console.log("%c[ADMIN LOGIN] Starting login attempt", "color: blue; font-weight: bold;", { email });

    try {
      const success = await login(email, password);
      if (success) {
        console.log("%c[ADMIN LOGIN] Login successful, navigating to admin dashboard", "color: green; font-weight: bold;");
        const nextRaw = searchParams.get("next") || undefined;
        const next = nextRaw ? decodeURIComponent(nextRaw) : undefined;
        toast({ title: "Welcome!", description: "Signed in successfully." });
        navigate(next || fromPathname || "/admin/landing", { replace: true });
      } else {
        console.log("%c[ADMIN LOGIN] Login failed: Invalid credentials", "color: red;");
        setError("Invalid credentials");
        toast({ variant: "destructive", title: "Login Failed", description: "Invalid email or password" });
      }
    } catch (err: any) {
      console.log("%c[ADMIN LOGIN] Error during login", "color: red; font-weight: bold;", {
        code: err.code,
        message: err.message,
      });

      // Support MFA for admin login
      if (err.code === "auth/multi-factor-auth-required") {
        console.log("%c[ADMIN LOGIN] MFA required - redirecting to MFA verification", "color: purple; font-weight: bold;");
        const resolver = getMultiFactorResolver(auth, err);
        setResolver(resolver);
        setFrom(fromPathname || "/admin/landing");
        navigate("/verify-mfa", { replace: true });
      } else {
        setError("Login failed. Please try again.");
        toast({ variant: "destructive", title: "Login Failed", description: err.message || "An error occurred" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex justify-center">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.appName} className="h-12 object-contain" />
          ) : (
            <FlynLogo size="lg" customText={branding.logoText} />
          )}
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground">Owner Admin Login</h2>
          <p className="text-muted-foreground mt-2">Sign in to manage the global landing + marketing dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-destructive text-sm text-center">
              {error}
            </motion.p>
          )}

          <Button type="submit" disabled={isLoading} className="w-full h-12 flyn-button-gradient text-base">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </div>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Back to app login?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Go to /login
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
