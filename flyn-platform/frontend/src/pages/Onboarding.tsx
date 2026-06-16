import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { WORLD_COUNTRIES, getCurrencyForCountry } from "@/lib/countries";
import {
  ArrowRight,
  Check,
  Building2,
  Code,
  Home,
  GraduationCap,
  Hotel,
  Briefcase,
  Scale,
  DollarSign,
  ShoppingCart,
  Stethoscope,
  ChevronRight,
  ChevronLeft,
  Church,
  Calendar,
  FileText,
  Users,
  UserCog,
  Upload,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FlynLogo from "@/components/FlynLogo";
import { tenantsService } from "@/services/tenants";
import { usePlan, type AppKey } from "@/contexts/PlanContext";
import { authedFetch } from "@/services/authApi";
import { API_BASE_URL } from "@/lib/api";

interface OnboardingData {
  // Profile
  profilePictureUrl: string;
  dateOfBirth: string;
  gender: string;
  // Workspace info
  logoUrl: string;
  companyStartDate: string;
  companyAddress: string;
  companyEmail: string;
  country: string;
  workspaceCurrency: string;
  // Existing
  workspaceName: string;
  timezone: string;
  industry: string;
  integrations: string[];
  selectedModules: AppKey[];
}

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Central European Time" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

const INDUSTRIES = [
  { id: "ecommerce", labelKey: "onboarding.industries.ecommerce", icon: ShoppingCart },
  { id: "saas", labelKey: "onboarding.industries.saas", icon: Code },
  { id: "realestate", labelKey: "onboarding.industries.realestate", icon: Home },
  { id: "healthcare", labelKey: "onboarding.industries.healthcare", icon: Stethoscope },
  { id: "education", labelKey: "onboarding.industries.education", icon: GraduationCap },
  { id: "hospitality", labelKey: "onboarding.industries.hospitality", icon: Hotel },
  { id: "nonprofit", labelKey: "onboarding.industries.nonprofit", icon: Briefcase },
  { id: "legal", labelKey: "onboarding.industries.legal", icon: Scale },
  { id: "finance", labelKey: "onboarding.industries.finance", icon: DollarSign },
];

const INTEGRATIONS: { id: string; label: string; color: string; icon: string; category: string }[] = [
  // Channels
  { id: "whatsapp",   label: "WhatsApp",           color: "#25D366", icon: "💬", category: "Channels" },
  { id: "facebook",   label: "Facebook Messenger", color: "#0084FF", icon: "📘", category: "Channels" },
  { id: "instagram",  label: "Instagram",          color: "#E1306C", icon: "📸", category: "Channels" },
  { id: "telegram",   label: "Telegram",           color: "#2AABEE", icon: "✈️", category: "Channels" },
  { id: "email",      label: "Email / SMTP",       color: "#EA4335", icon: "📧", category: "Channels" },
  { id: "sms",        label: "SMS / Voice",        color: "#F22F46", icon: "📱", category: "Channels" },
  // Calendar
  { id: "calendly",   label: "Calendly",           color: "#006BFF", icon: "📅", category: "Calendar" },
  { id: "zoom",       label: "Zoom",               color: "#2D8CFF", icon: "🎥", category: "Calendar" },
  // Accounting
  { id: "xero",       label: "Xero",               color: "#13B5EA", icon: "📊", category: "Accounting" },
  { id: "quickbooks", label: "QuickBooks",         color: "#2CA01C", icon: "💰", category: "Accounting" },
];

const MODULES: { id: AppKey; label: string; desc: string; icon: React.ComponentType<{ className?: string }>; alwaysOn?: boolean }[] = [
  { id: "crm", label: "CRM & Contacts", desc: "Manage leads, deals, and customers", icon: Users, alwaysOn: true },
  { id: "events", label: "Events & Calendar", desc: "Schedule events and appointments", icon: Calendar },
  { id: "hr", label: "HR & People Ops", desc: "Team management, hiring, and payroll", icon: UserCog },
  { id: "church", label: "Church Management", desc: "Engage members and track giving", icon: Church },
  { id: "coaches", label: "Coaching Programs", desc: "Manage clients and sessions", icon: GraduationCap },
  { id: "freelancers", label: "Freelancers & Projects", desc: "Track projects and invoices", icon: FileText },
];

const Onboarding = () => {
  // Load from localStorage or use defaults
  const getInitialData = (): OnboardingData => {
    try {
      const saved = localStorage.getItem("flyn_onboarding_data");
      return saved ? JSON.parse(saved) : {
        profilePictureUrl: "",
        dateOfBirth: "",
        gender: "",
        logoUrl: "",
        companyStartDate: "",
        companyAddress: "",
        companyEmail: "",
        country: "US",
        workspaceCurrency: "USD",
        workspaceName: "",
        timezone: "America/New_York",
        industry: "",
        integrations: [],
        selectedModules: ["crm"],
      };
    } catch {
      return {
        profilePictureUrl: "",
        dateOfBirth: "",
        gender: "",
        logoUrl: "",
        companyStartDate: "",
        companyAddress: "",
        companyEmail: "",
        country: "US",
        workspaceCurrency: "USD",
        workspaceName: "",
        timezone: "America/New_York",
        industry: "",
        integrations: [],
        selectedModules: ["crm"],
      };
    }
  };

  const getInitialStep = (): number => {
    try {
      const saved = localStorage.getItem("flyn_onboarding_step");
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  };

  const [step, setStep] = useState(getInitialStep);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [data, setData] = useState<OnboardingData>(getInitialData);

  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setSelectedApps } = usePlan();
  const { refreshUser } = useAuth();

  // Auto-save data and step to localStorage
  useEffect(() => {
    localStorage.setItem("flyn_onboarding_data", JSON.stringify(data));
    localStorage.setItem("flyn_onboarding_step", String(step));
  }, [data, step]);

  const uploadImage = async (file: File, fieldname: string): Promise<string> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldname', fieldname);

      const response = await authedFetch(`${API_BASE_URL}/tenants/me/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.url;
    } finally {
      setUploading(false);
    }
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file, 'profilePicture');
      setData(prev => ({ ...prev, profilePictureUrl: url }));
    } catch (err) {
      console.error("Profile picture upload failed:", err);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file, 'companyLogo');
      setData(prev => ({ ...prev, logoUrl: url }));
    } catch (err) {
      console.error("Logo upload failed:", err);
    }
  };

  const handleNext = () => {
    if (step < 6) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setSelectedApps(data.selectedModules);
    localStorage.setItem("flyn_onboarding_data", JSON.stringify(data));

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), ms),
        ),
      ]);

    try {
      await withTimeout(
        tenantsService.patchMe({
          profilePictureUrl: data.profilePictureUrl,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          logoUrl: data.logoUrl,
          companyStartDate: data.companyStartDate,
          companyAddress: data.companyAddress,
          companyEmail: data.companyEmail,
          country: data.country,
          workspaceCurrency: data.workspaceCurrency || getCurrencyForCountry(data.country),
          workspaceName: data.workspaceName,
          timezone: data.timezone,
          industry: data.industry,
          integrations: data.integrations,
          aiAgents: data.selectedModules,
          onboardingComplete: true,
        }),
        15000,
      );
    } catch (err) {
      console.error("Failed to save onboarding data:", err);
      // Don't block navigation — data is saved locally, proceed to dashboard
    }

    // Sync logo and workspace name to tenant_branding so WhiteLabel page
    // and email preview reflect what was uploaded during onboarding.
    if (data.logoUrl || data.workspaceName) {
      authedFetch(`${API_BASE_URL}/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(data.logoUrl && { logoUrl: data.logoUrl }),
          ...(data.workspaceName && { appName: data.workspaceName }),
        }),
      }).catch(() => {});
    }

    // Refresh tenant in context so ProtectedRoute sees onboardingComplete=true.
    // Best-effort: failures must not block navigation.
    await refreshUser().catch(() => {});

    // Persist a local flag so ProtectedRoute can let the user through even if
    // the tenant fetch above failed (e.g. network error after Firestore fallback).
    localStorage.setItem("flyn_onboarding_complete", "true");

    // Clear the saved onboarding progress since we're now complete
    localStorage.removeItem("flyn_onboarding_data");
    localStorage.removeItem("flyn_onboarding_step");

    navigate("/dashboard");
  };

  const toggleIntegration = (id: string) => {
    setData(prev => ({
      ...prev,
      integrations: prev.integrations.includes(id)
        ? prev.integrations.filter(i => i !== id)
        : [...prev.integrations, id]
    }));
  };

  const toggleModule = (id: AppKey) => {
    setData(prev => ({
      ...prev,
      selectedModules: prev.selectedModules.includes(id)
        ? prev.selectedModules.filter(m => m !== id)
        : [...prev.selectedModules, id]
    }));
  };

  const canProceed = () => {
    switch (step) {
      case 0: return true;
      case 1: return data.dateOfBirth && data.gender; // Profile picture is optional
      case 2: return data.companyStartDate && data.companyAddress && data.companyEmail; // Logo is optional
      case 3: return data.workspaceName.length > 0;
      case 4: return data.industry.length > 0;
      case 5: return true;
      case 6: return true;
      default: return true;
    }
  };

  const handlePrevious = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-3 sm:p-4 py-8 sm:py-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-6 sm:mb-8">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`h-2 w-6 sm:w-8 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"
                }`}
            />
          ))}
        </div>

        {/* Back button - only show on steps > 0 and mobile */}
        {step > 0 && (
          <button
            onClick={handlePrevious}
            className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-card rounded-2xl border border-border p-4 sm:p-8 shadow-lg"
          >
            {/* Step 0: Welcome */}
            {step === 0 && (
              <div className="text-center">
                <div className="flex justify-center mb-6">
                  <FlynLogo size="lg" showText={false} />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  {t("onboarding.getStarted")}
                </h1>
                <p className="text-muted-foreground mb-8">
                  {t("onboarding.setupSteps")}
                </p>
                <Button
                  onClick={handleNext}
                  className="w-48 h-12 flyn-button-gradient"
                >
                  {t("common.next")}
                </Button>
              </div>
            )}

            {/* Step 1: Profile Setup */}
            {step === 1 && (
              <div>
                <h2 className="text-xl font-bold text-foreground text-center mb-2">
                  Complete Your Profile
                </h2>
                <p className="text-muted-foreground text-center mb-6">
                  Let's set up your personal profile information.
                </p>

                <div className="space-y-4">
                  {/* Profile Picture Upload */}
                  <div className="space-y-2">
                    <Label>Profile Picture</Label>
                    <div className="flex flex-col items-center gap-3">
                      {data.profilePictureUrl ? (
                        <img
                          src={data.profilePictureUrl}
                          alt="Profile"
                          className="h-20 w-20 rounded-full object-cover border-2 border-primary"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                          <User className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProfilePictureUpload}
                          disabled={uploading}
                          className="hidden"
                          id="profile-pic-input"
                        />
                        <Label
                          htmlFor="profile-pic-input"
                          className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-border hover:border-primary/50 transition-colors"
                        >
                          <Upload className="h-4 w-4" />
                          {uploading ? "Uploading..." : "Choose Photo"}
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* Date of Birth */}
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={data.dateOfBirth}
                      onChange={(e) => setData({ ...data, dateOfBirth: e.target.value })}
                      className="h-12"
                    />
                  </div>

                  {/* Gender */}
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Select value={data.gender} onValueChange={(value) => setData({ ...data, gender: value })}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="non-binary">Non-binary</SelectItem>
                        <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full h-12 mt-6 flyn-button-gradient"
                >
                  {t("common.continue")}
                </Button>
              </div>
            )}

            {/* Step 2: Workspace Setup */}
            {step === 2 && (
              <div>
                <h2 className="text-xl font-bold text-foreground text-center mb-2">
                  Set Up Your Workspace
                </h2>
                <p className="text-muted-foreground text-center mb-6">
                  Add your company details and branding.
                </p>

                <div className="space-y-4">
                  {/* Company Logo Upload */}
                  <div className="space-y-2">
                    <Label>Company Logo</Label>
                    <div className="flex flex-col items-center gap-3">
                      {data.logoUrl ? (
                        <img
                          src={data.logoUrl}
                          alt="Logo"
                          className="h-20 w-20 rounded-lg object-cover border-2 border-primary"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center border-2 border-border">
                          <Building2 className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploading}
                          className="hidden"
                          id="logo-input"
                        />
                        <Label
                          htmlFor="logo-input"
                          className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-border hover:border-primary/50 transition-colors"
                        >
                          <Upload className="h-4 w-4" />
                          {uploading ? "Uploading..." : "Choose Logo"}
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* Company Start Date */}
                  <div className="space-y-2">
                    <Label htmlFor="start-date">Company Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={data.companyStartDate}
                      onChange={(e) => setData({ ...data, companyStartDate: e.target.value })}
                      className="h-12"
                    />
                  </div>

                  {/* Company Address */}
                  <div className="space-y-2">
                    <Label htmlFor="address">Company Address</Label>
                    <textarea
                      id="address"
                      placeholder="123 Main Street, City, State 12345"
                      value={data.companyAddress}
                      onChange={(e) => setData({ ...data, companyAddress: e.target.value })}
                      className="w-full min-h-20 px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Company Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Company Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="contact@company.com"
                      value={data.companyEmail}
                      onChange={(e) => setData({ ...data, companyEmail: e.target.value })}
                      className="h-12"
                    />
                  </div>

                  {/* Country */}
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select value={data.country} onValueChange={(v) => setData({ ...data, country: v, workspaceCurrency: getCurrencyForCountry(v) })}>
                      <SelectTrigger className="h-12" id="country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {WORLD_COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full h-12 mt-6 flyn-button-gradient"
                >
                  {t("common.continue")}
                </Button>
              </div>
            )}

            {/* Step 3: Create Workspace */}
            {step === 3 && (
              <div>
                <h2 className="text-xl font-bold text-foreground text-center mb-2">
                  {t("onboarding.createWorkspace")}
                </h2>
                <p className="text-muted-foreground text-center mb-6">
                  {t("onboarding.workspaceDescription")}
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="workspaceName">{t("onboarding.workspaceName")}</Label>
                    <Input
                      id="workspaceName"
                      placeholder={t("onboarding.workspacePlaceholder")}
                      value={data.workspaceName}
                      onChange={(e) => setData({ ...data, workspaceName: e.target.value })}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timezone">{t("onboarding.timeZone")}</Label>
                    <Select
                      value={data.timezone}
                      onValueChange={(value) => setData({ ...data, timezone: value })}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full h-12 mt-6 flyn-button-gradient"
                >
                  {t("common.continue")}
                </Button>
              </div>
            )}

            {/* Step 4: Choose Industry */}
            {step === 4 && (
              <div>
                <h2 className="text-xl font-bold text-foreground text-center mb-2">
                  {t("onboarding.chooseIndustry")}
                </h2>
                <p className="text-muted-foreground text-center mb-6">
                  {t("onboarding.industryDescription")}
                </p>

                <div className="grid grid-cols-3 gap-3">
                  {INDUSTRIES.map((industry) => {
                    const Icon = industry.icon;
                    const isSelected = data.industry === industry.id;
                    return (
                      <button
                        key={industry.id}
                        onClick={() => setData({ ...data, industry: industry.id })}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                          }`}
                      >
                        <Icon className={`h-6 w-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-xs font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {t(industry.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="w-full h-12 mt-6 flyn-button-gradient"
                >
                  {t("common.continue")}
                </Button>
              </div>
            )}

            {/* Step 5: Connect Integrations */}
            {step === 5 && (
              <div>
                <h2 className="text-xl font-bold text-foreground text-center mb-2">
                  {t("onboarding.connectIntegrations")}
                </h2>
                <p className="text-muted-foreground text-center mb-4">
                  Select the tools you plan to use. You can connect them properly from Settings later.
                </p>

                {(["Channels", "Calendar", "Accounting"] as const).map(category => (
                  <div key={category} className="mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{category}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {INTEGRATIONS.filter(i => i.category === category).map((integration) => {
                        const isSelected = data.integrations.includes(integration.id);
                        return (
                          <button
                            key={integration.id}
                            onClick={() => toggleIntegration(integration.id)}
                            className={`p-3 rounded-xl border transition-all flex items-center gap-2.5 text-left ${
                              isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                            }`}
                          >
                            <span className="text-lg shrink-0">{integration.icon}</span>
                            <span className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {integration.label}
                            </span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <Button
                  onClick={handleNext}
                  className="w-full h-12 mt-2 flyn-button-gradient"
                >
                  {t("common.continue")}
                </Button>
              </div>
            )}

            {/* Step 6: Choose Modules */}
            {step === 6 && (
              <div>
                <h2 className="text-xl font-bold text-foreground text-center mb-2">
                  Choose Your Modules
                </h2>
                <p className="text-muted-foreground text-center mb-6">
                  Select the tools you need. These will appear in your dashboard. You can add more later.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {MODULES.map((mod) => {
                    const Icon = mod.icon;
                    const isSelected = mod.alwaysOn || data.selectedModules.includes(mod.id);
                    return (
                      <button
                        key={mod.id}
                        onClick={() => !mod.alwaysOn && toggleModule(mod.id)}
                        disabled={mod.alwaysOn}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-2 text-left ${isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                          } ${mod.alwaysOn ? "opacity-80 cursor-default" : ""}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </div>
                        <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {mod.label}
                          {mod.alwaysOn && <span className="ml-1 text-xs text-muted-foreground">(always on)</span>}
                        </span>
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {mod.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <Button
                  onClick={handleComplete}
                  disabled={completing}
                  className="w-full h-12 mt-6 flyn-button-gradient disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2">
                    {completing ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Loading Dashboard...
                      </>
                    ) : (
                      <>
                        {t("onboarding.completeSetup")} <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </span>
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Skip link - only for optional steps */}
        {step >= 3 && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            <button
              onClick={handleComplete}
              className="hover:text-foreground transition-colors"
            >
              {t("onboarding.skipForNow")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
