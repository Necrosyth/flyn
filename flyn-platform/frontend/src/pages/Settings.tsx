import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  User, Bell, Shield, Palette, Globe,
  CreditCard, Users, Mail, Sparkles, Code2, Database, Bot,
  Workflow, Building2, ChevronDown, CheckCircle2, Loader2, ArrowLeft, Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { tenantsService } from "@/services/tenants";
import type { NotificationPrefs, AiConfig, AutomationLimits } from "@/services/tenants";
import { integrationsService, type IntegrationKey, type IntegrationsStatusResponse } from "@/services/integrations";
import { telephonyService, type TelephonyStatusResponse } from "@/services/telephony";
import { auth } from "@/lib/firebase";
import { RecaptchaVerifier, linkWithPhoneNumber, multiFactor, type ConfirmationResult, sendEmailVerification } from "firebase/auth";
import { WORLD_COUNTRIES, getCountryName, getCurrencyForCountry } from "@/lib/countries";
import { authedFetch } from "@/services/authApi";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api';

const PREFS_KEY = "flyn_settings_prefs";

const TIMEZONE_OPTIONS = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Dubai",
  "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney",
];

const INDUSTRY_OPTIONS = [
  "SaaS", "E-commerce", "Healthcare", "Finance", "Education",
  "Real Estate", "Travel", "Logistics", "Professional Services", "Retail", "Other",
];

const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'NGN', label: 'NGN — Nigerian Naira' },
  { code: 'GHS', label: 'GHS — Ghanaian Cedi' },
  { code: 'KES', label: 'KES — Kenyan Shilling' },
  { code: 'ZAR', label: 'ZAR — South African Rand' },
  { code: 'NAD', label: 'NAD — Namibian Dollar' },
  { code: 'ZMW', label: 'ZMW — Zambian Kwacha' },
  { code: 'RWF', label: 'RWF — Rwandan Franc' },
  { code: 'ETB', label: 'ETB — Ethiopian Birr' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'PKR', label: 'PKR — Pakistani Rupee' },
  { code: 'BDT', label: 'BDT — Bangladeshi Taka' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SAR', label: 'SAR — Saudi Riyal' },
  { code: 'QAR', label: 'QAR — Qatari Riyal' },
  { code: 'KWD', label: 'KWD — Kuwaiti Dinar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
  { code: 'KRW', label: 'KRW — South Korean Won' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'THB', label: 'THB — Thai Baht' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah' },
  { code: 'PHP', label: 'PHP — Philippine Peso' },
  { code: 'BRL', label: 'BRL — Brazilian Real' },
  { code: 'MXN', label: 'MXN — Mexican Peso' },
  { code: 'COP', label: 'COP — Colombian Peso' },
  { code: 'ARS', label: 'ARS — Argentine Peso' },
  { code: 'EGP', label: 'EGP — Egyptian Pound' },
  { code: 'MAD', label: 'MAD — Moroccan Dirham' },
  { code: 'TZS', label: 'TZS — Tanzanian Shilling' },
  { code: 'UGX', label: 'UGX — Ugandan Shilling' },
  { code: 'SEK', label: 'SEK — Swedish Krona' },
  { code: 'NOK', label: 'NOK — Norwegian Krone' },
  { code: 'DKK', label: 'DKK — Danish Krone' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'TRY', label: 'TRY — Turkish Lira' },
  { code: 'RUB', label: 'RUB — Russian Ruble' },
  { code: 'PLN', label: 'PLN — Polish Zloty' },
  { code: 'CZK', label: 'CZK — Czech Koruna' },
  { code: 'HUF', label: 'HUF — Hungarian Forint' },
  { code: 'RON', label: 'RON — Romanian Leu' },
  { code: 'XOF', label: 'XOF — West African CFA Franc' },
  { code: 'XAF', label: 'XAF — Central African CFA Franc' },
  { code: 'BHD', label: 'BHD — Bahraini Dinar' },
  { code: 'OMR', label: 'OMR — Omani Rial' },
  { code: 'KZT', label: 'KZT — Kazakhstani Tenge' },
  { code: 'GEL', label: 'GEL — Georgian Lari' },
  { code: 'VND', label: 'VND — Vietnamese Dong' },
  { code: 'LKR', label: 'LKR — Sri Lankan Rupee' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { code: 'TWD', label: 'TWD — New Taiwan Dollar' },
  { code: 'DZD', label: 'DZD — Algerian Dinar' },
  { code: 'TND', label: 'TND — Tunisian Dinar' },
  { code: 'BWP', label: 'BWP — Botswana Pula' },
  { code: 'ETB', label: 'ETB — Ethiopian Birr' },
  { code: 'RWF', label: 'RWF — Rwandan Franc' },
  { code: 'ZMW', label: 'ZMW — Zambian Kwacha' },
];

const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const savePrefs = (prefs: Record<string, unknown>) => {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
};

// ─── Section Panel Components ───────────────────────────────────────────────

const SectionRow = ({
  label, description, children,
}: { label: string; description?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-1">
    <div className="flex-1 min-w-0">
      <p className="font-medium text-sm">{label}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider pt-6 pb-2 border-t border-border/40 first:border-0 first:pt-0">
    {children}
  </p>
);

const ComingSoonBadge = () => (
  <Badge variant="outline" className="text-[10px] text-muted-foreground/60 border-border/40 py-0">
    coming soon
  </Badge>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const Settings = () => {
  const navigate = useNavigate();
  const { section: urlSection } = useParams();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, updateUserProfile, changePassword, fbUser } = useAuth();

  const [prefs, setPrefs] = useState(() => ({
    notif_newLead: true,
    notif_missedCall: true,
    notif_leadNotContacted: false,
    notif_whatsappFailed: true,
    notif_appointmentBooked: true,
    notif_appointmentCancelled: true,
    notif_dealStageChanged: false,
    notif_newContact: false,
    notif_workflowError: true,
    notif_integrationDisconnected: true,
    notif_lowCredits: true,
    notif_paymentFailed: true,
    notif_newTeamMember: false,
    notif_apiKeyUnknownIP: true,
    notif_ch_email: true,
    notif_ch_sms: false,
    notif_ch_whatsapp: false,
    occ_org_anniversary: true,
    occ_join_anniversary: true,
    occ_milestone: true,
    occ_national_holiday: true,
    occ_religious_holiday: false,
    occ_birthday: true,
    occ_work_anniversary: true,
    occ_role_promotion: true,
    occ_ch_in_app: true,
    occ_ch_email: true,
    occ_emoji: true,
    occ_tone: "warm",
    occ_logoMode: "logo",
    notif_ch_inapp: true,
    notif_ch_slack: false,
    qs_whatsappBot: true,
    qs_aiCalling: true,
    qs_autoCRM: true,
    qs_autoAppointment: false,
    qs_leadCapture: true,
    qs_sandbox: false,
    qs_fallbackHuman: true,
    qs_smsFallback: false,
    qs_emailNotifications: true,
    ap_reduceAnimations: false,
    ap_highContrast: false,
    ap_compactDensity: false,
    ap_collapsedSidebar: false,
    ai_profanityFilter: true,
    ai_abTesting: false,
    auto_autoPauseOnError: true,
    auto_duplicateDetect: true,
    ...loadPrefs(),
  }));

  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profilePhone, setProfilePhone] = useState(user?.phoneNumber || "");
  const [profileJobTitle, setProfileJobTitle] = useState("");
  const [profileDepartment, setProfileDepartment] = useState("");
  const [profileTimezone, setProfileTimezone] = useState("UTC");
  const [profileDateFormat, setProfileDateFormat] = useState("12hr");
  const [profileCurrency, setProfileCurrency] = useState("USD");
  const [profileSignature, setProfileSignature] = useState("");

  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceIndustry, setWorkspaceIndustry] = useState("");
  const [workspaceSize, setWorkspaceSize] = useState("");
  const [workspaceCurrency, setWorkspaceCurrency] = useState("USD");
  const [workspaceTimezone, setWorkspaceTimezone] = useState("UTC");
  const [workspaceSupportEmail, setWorkspaceSupportEmail] = useState("");
  const [isSavingTenant, setIsSavingTenant] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [phoneOtpSending, setPhoneOtpSending] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const occTone = (prefs.occ_tone as "formal" | "warm" | "founder") || "warm";
  const [celebSaving, setCelebSaving] = useState(false);
  const [celebTesting, setCelebTesting] = useState(false);
  const [aiModel, setAiModel] = useState("gemini-1.5-flash");
  const [aiTone, setAiTone] = useState("friendly");
  const [aiLanguage, setAiLanguage] = useState("en");
  const [aiResponseLength, setAiResponseLength] = useState("medium");
  const [aiConfidenceThreshold, setAiConfidenceThreshold] = useState("80");
  const [aiSystemPrompt, setAiSystemPrompt] = useState("");

  const [dailyCallCap, setDailyCallCap] = useState("100");
  const [msgRateLimit, setMsgRateLimit] = useState("10");
  const [retryCount, setRetryCount] = useState("3");
  const [retryInterval, setRetryInterval] = useState("30");
  const [notifFrequency, setNotifFrequency] = useState("instant");
  const [quietFrom, setQuietFrom] = useState("22:00");
  const [quietUntil, setQuietUntil] = useState("08:00");
  const [businessHoursStart, setBusinessHoursStart] = useState("09:00");
  const [businessHoursEnd, setBusinessHoursEnd] = useState("18:00");

  const [convRetention, setConvRetention] = useState("365");
  const [callRetention, setCallRetention] = useState("180");
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Onboarding / Profile fields
  const [profileDateOfBirth, setProfileDateOfBirth] = useState("");
  const [profileGender, setProfileGender] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [profilePictureUploading, setProfilePictureUploading] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement>(null);

  // Workspace branding fields
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState("");
  const [workspaceLogoUploading, setWorkspaceLogoUploading] = useState(false);
  const workspaceLogoInputRef = useRef<HTMLInputElement>(null);

  const [companyStartDate, setCompanyStartDate] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [workspaceCountry, setWorkspaceCountry] = useState("US");
  // IP Detection
  const [newIpAlertEnabled, setNewIpAlertEnabled] = useState(false);
  const [suspiciousLoginBlock, setSuspiciousLoginBlock] = useState(false);
  const [ipWhitelistText, setIpWhitelistText] = useState("");
  const [verifiedIps, setVerifiedIps] = useState<string[]>([]);
  // Voice & Chat Providers (AI Config)
  const [voiceProvider, setVoiceProvider] = useState<'twilio' | 'vapi'>('twilio');
  const [chatbotAgent, setChatbotAgent] = useState('ai-sales-agent');
  // MFA
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaDisabling, setMfaDisabling] = useState(false);

  const [integrationStatus, setIntegrationStatus] = useState<IntegrationsStatusResponse>({});
  const [integrationConnectKey, setIntegrationConnectKey] = useState<IntegrationKey | null>(null);
  const [integrationConnectForm, setIntegrationConnectForm] = useState({ name: "", callbackUrl: "" });
  const [isConnectingIntegration, setIsConnectingIntegration] = useState(false);

  const loadIntegrationStatus = useCallback(async () => {
    try {
      const status = await integrationsService.getStatus();
      setIntegrationStatus(status || {});
    } catch { }
  }, []);

  useEffect(() => {
    const loadTenant = async () => {
      if (!user) return;
      try {
        const t = await tenantsService.getMe();
        setWorkspaceName((t.workspaceName ?? "") as string);
        setWorkspaceTimezone((t.timezone ?? "UTC") as string);
        setWorkspaceIndustry((t.industry ?? "") as string);
        if (t.teamSize) setWorkspaceSize(t.teamSize);
        if (t.workspaceCurrency) setWorkspaceCurrency(t.workspaceCurrency);
        if (t.supportEmail) setWorkspaceSupportEmail(t.supportEmail);
        if (t.phone) setProfilePhone(t.phone);
        if (t.jobTitle) setProfileJobTitle(t.jobTitle);
        if (t.department) setProfileDepartment(t.department);
        if (t.userTimezone) setProfileTimezone(t.userTimezone);
        if (t.timeFormat) setProfileDateFormat(t.timeFormat);
        if (t.currency) setProfileCurrency(t.currency);
        if (t.signature) setProfileSignature(t.signature);
        if (t.dateOfBirth) setProfileDateOfBirth(t.dateOfBirth);
        if (t.gender) setProfileGender(t.gender);
        if (t.profilePictureUrl) setProfilePictureUrl(t.profilePictureUrl);
        if (t.logoUrl) setWorkspaceLogoUrl(t.logoUrl);
        if (t.companyStartDate) setCompanyStartDate(t.companyStartDate);
        if (t.companyAddress) setCompanyAddress(t.companyAddress);
        if (t.companyEmail) setCompanyEmail(t.companyEmail);
        if (t.country) setWorkspaceCountry(t.country);
        if (fbUser) setMfaEnrolled(multiFactor(fbUser).enrolledFactors.length > 0);
        // Server truth — the client fbUser can report 0 factors while Firebase still has one.
        tenantsService.getMfaStatus().then((s) => setMfaEnrolled(s.enrolled)).catch(() => {});
        if (t.notificationPrefs) {
          const np = t.notificationPrefs;
          setPrefs((prev: any) => ({
            ...prev,
            ...(np.newLead !== undefined && { notif_newLead: np.newLead }),
            ...(np.missedCall !== undefined && { notif_missedCall: np.missedCall }),
            ...(np.leadNotContacted !== undefined && { notif_leadNotContacted: np.leadNotContacted }),
            ...(np.whatsappFailed !== undefined && { notif_whatsappFailed: np.whatsappFailed }),
            ...(np.appointmentBooked !== undefined && { notif_appointmentBooked: np.appointmentBooked }),
            ...(np.appointmentCancelled !== undefined && { notif_appointmentCancelled: np.appointmentCancelled }),
            ...(np.dealStageChanged !== undefined && { notif_dealStageChanged: np.dealStageChanged }),
            ...(np.newContact !== undefined && { notif_newContact: np.newContact }),
            ...(np.workflowError !== undefined && { notif_workflowError: np.workflowError }),
            ...(np.integrationDisconnected !== undefined && { notif_integrationDisconnected: np.integrationDisconnected }),
            ...(np.lowCredits !== undefined && { notif_lowCredits: np.lowCredits }),
            ...(np.paymentFailed !== undefined && { notif_paymentFailed: np.paymentFailed }),
            ...(np.newTeamMember !== undefined && { notif_newTeamMember: np.newTeamMember }),
            ...(np.apiKeyUnknownIP !== undefined && { notif_apiKeyUnknownIP: np.apiKeyUnknownIP }),
            ...(np.ch_email !== undefined && { notif_ch_email: np.ch_email }),
            ...(np.ch_sms !== undefined && { notif_ch_sms: np.ch_sms }),
            ...(np.ch_whatsapp !== undefined && { notif_ch_whatsapp: np.ch_whatsapp }),
            ...(np.ch_inapp !== undefined && { notif_ch_inapp: np.ch_inapp }),
            ...(np.ch_slack !== undefined && { notif_ch_slack: np.ch_slack }),
          }));
          if (np.frequency) setNotifFrequency(np.frequency);
          if (np.quietFrom) setQuietFrom(np.quietFrom);
          if (np.quietUntil) setQuietUntil(np.quietUntil);
        }
        if (t.aiConfig) {
          const ai = t.aiConfig;
          if (ai.model) setAiModel(ai.model);
          if (ai.tone) setAiTone(ai.tone);
          if (ai.language) setAiLanguage(ai.language);
          if (ai.responseLength) setAiResponseLength(ai.responseLength);
          if (ai.confidenceThreshold) setAiConfidenceThreshold(ai.confidenceThreshold);
          if (ai.systemPrompt) setAiSystemPrompt(ai.systemPrompt);
          if (ai.voiceProvider) setVoiceProvider(ai.voiceProvider);
          if (ai.chatbotAgent) setChatbotAgent(ai.chatbotAgent);
          setPrefs((prev: any) => ({
            ...prev,
            ...(ai.profanityFilter !== undefined && { ai_profanityFilter: ai.profanityFilter }),
            ...(ai.abTesting !== undefined && { ai_abTesting: ai.abTesting }),
          }));
        }
        // Load celebration prefs from backend
        authedFetch(`${API_BASE}/occasions/prefs`)
          .then(r => r.ok ? r.json() : null)
          .then((p: any) => {
            if (!p) return;
            setPrefs((prev: any) => ({
              ...prev,
              ...(p.birthday !== undefined && { occ_birthday: p.birthday }),
              ...(p.workAnniversary !== undefined && { occ_work_anniversary: p.workAnniversary }),
              ...(p.orgAnniversary !== undefined && { occ_org_anniversary: p.orgAnniversary }),
              ...(p.emoji !== undefined && { occ_emoji: p.emoji }),
              ...(p.tone !== undefined && { occ_tone: p.tone }),
              ...(p.logoMode !== undefined && { occ_logoMode: p.logoMode }),
            }));
          })
          .catch(() => {});

        // IP detection settings
        if (t.ipVerificationEnabled !== undefined) setSuspiciousLoginBlock(t.ipVerificationEnabled);
        if ((t as any).newIpAlertEnabled !== undefined) setNewIpAlertEnabled((t as any).newIpAlertEnabled);
        if ((t as any).ipWhitelist?.length) setIpWhitelistText(((t as any).ipWhitelist as string[]).join("\n"));
        if (t.verifiedIps) setVerifiedIps(t.verifiedIps);
        if (t.automationLimits) {
          const al = t.automationLimits;
          if (al.dailyCallCap) setDailyCallCap(al.dailyCallCap);
          if (al.msgRateLimit) setMsgRateLimit(al.msgRateLimit);
          if (al.retryCount) setRetryCount(al.retryCount);
          if (al.retryInterval) setRetryInterval(al.retryInterval);
          if (al.businessHoursStart) setBusinessHoursStart(al.businessHoursStart);
          if (al.businessHoursEnd) setBusinessHoursEnd(al.businessHoursEnd);
          setPrefs((prev: any) => ({
            ...prev,
            ...(al.autoPauseOnError !== undefined && { auto_autoPauseOnError: al.autoPauseOnError }),
            ...(al.duplicateDetect !== undefined && { auto_duplicateDetect: al.duplicateDetect }),
          }));
        }
      } catch { }
    };
    loadTenant();
    loadIntegrationStatus();
  }, [user?.id, loadIntegrationStatus]);

  const applyAppearance = useCallback((p: Record<string, unknown>) => {
    const html = document.documentElement;
    html.classList.toggle('compact', !!p.ap_compactDensity);
    html.classList.toggle('high-contrast', !!p.ap_highContrast);
    html.classList.toggle('reduce-motion', !!p.ap_reduceAnimations);
  }, []);

  // Apply on mount from stored prefs
  useEffect(() => { applyAppearance(prefs); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updatePref = useCallback((key: string, value: boolean | string) => {
    setPrefs((prev: any) => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      if (key.startsWith('ap_')) applyAppearance(next);
      // Only collapse immediately when the pref is turned ON; turning it OFF just changes the default for next load
      if (key === 'ap_collapsedSidebar' && value === true) {
        window.dispatchEvent(new CustomEvent('flyn-sidebar-pref-change', { detail: { collapsed: true } }));
      }
      return next;
    });
  }, [applyAppearance]);

  const handleSaveProfile = async () => {
    try {
      await Promise.all([
        updateUserProfile({ name: profileName, email: profileEmail }),
        tenantsService.patchMe({
          phone: profilePhone || null,
          jobTitle: profileJobTitle || null,
          department: profileDepartment || null,
          dateOfBirth: profileDateOfBirth || null,
          gender: profileGender || null,
          profilePictureUrl: profilePictureUrl || null,
          userTimezone: profileTimezone || null,
          timeFormat: profileDateFormat || null,
          currency: profileCurrency || null,
          signature: profileSignature || null,
        }),
      ]);
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    }
  };

  const handleSaveTenantProfile = async () => {
    setIsSavingTenant(true);
    try {
      await tenantsService.patchMe({
        workspaceName: workspaceName || null,
        timezone: workspaceTimezone || null,
        industry: workspaceIndustry || null,
        teamSize: workspaceSize || null,
        workspaceCurrency: workspaceCurrency || null,
        supportEmail: workspaceSupportEmail || null,
        logoUrl: workspaceLogoUrl || null,
        companyStartDate: companyStartDate || null,
        companyAddress: companyAddress || null,
        companyEmail: companyEmail || null,
        country: workspaceCountry || null,
      });
      toast({ title: "Workspace updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    } finally {
      setIsSavingTenant(false);
    }
  };

  const handleSaveNotifications = async () => {
    const np: NotificationPrefs = {
      newLead: !!prefs.notif_newLead,
      missedCall: !!prefs.notif_missedCall,
      leadNotContacted: !!prefs.notif_leadNotContacted,
      whatsappFailed: !!prefs.notif_whatsappFailed,
      appointmentBooked: !!prefs.notif_appointmentBooked,
      appointmentCancelled: !!prefs.notif_appointmentCancelled,
      dealStageChanged: !!prefs.notif_dealStageChanged,
      newContact: !!prefs.notif_newContact,
      workflowError: !!prefs.notif_workflowError,
      integrationDisconnected: !!prefs.notif_integrationDisconnected,
      lowCredits: !!prefs.notif_lowCredits,
      paymentFailed: !!prefs.notif_paymentFailed,
      newTeamMember: !!prefs.notif_newTeamMember,
      apiKeyUnknownIP: !!prefs.notif_apiKeyUnknownIP,
      ch_email: !!prefs.notif_ch_email,
      ch_sms: !!prefs.notif_ch_sms,
      ch_whatsapp: !!prefs.notif_ch_whatsapp,
      ch_inapp: !!prefs.notif_ch_inapp,
      ch_slack: !!prefs.notif_ch_slack,
      frequency: notifFrequency,
      quietFrom,
      quietUntil,
    };
    try {
      await tenantsService.patchMe({ notificationPrefs: np });
      toast({ title: "Notification preferences saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    }
  };

  const handleSaveAiConfig = async () => {
    const config: AiConfig = {
      model: aiModel,
      tone: aiTone,
      language: aiLanguage,
      responseLength: aiResponseLength,
      confidenceThreshold: aiConfidenceThreshold,
      systemPrompt: aiSystemPrompt,
      profanityFilter: !!prefs.ai_profanityFilter,
      abTesting: !!prefs.ai_abTesting,
      voiceProvider,
      chatbotAgent,
    };
    try {
      await tenantsService.patchMe({ aiConfig: config });
      toast({ title: "AI configuration saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    }
  };

  const handleSaveIpSettings = async () => {
    try {
      const ipWhitelist = ipWhitelistText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await tenantsService.patchMe({
        ipVerificationEnabled: suspiciousLoginBlock,
        newIpAlertEnabled,
        ipWhitelist,
      } as any);
      toast({ title: "Security settings saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    }
  };

  const handleRemoveIp = async (ip: string) => {
    const updated = verifiedIps.filter(v => v !== ip);
    try {
      await tenantsService.patchMe({ verifiedIps: updated } as any);
      setVerifiedIps(updated);
      toast({ title: "IP removed", description: `${ip} removed from trusted devices.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to remove IP", description: err.message });
    }
  };

  const handleSaveAutomationLimits = async () => {
    const limits: AutomationLimits = {
      dailyCallCap,
      msgRateLimit,
      retryCount,
      retryInterval,
      businessHoursStart,
      businessHoursEnd,
      autoPauseOnError: !!prefs.auto_autoPauseOnError,
      duplicateDetect: !!prefs.auto_duplicateDetect,
    };
    try {
      await tenantsService.patchMe({ automationLimits: limits });
      toast({ title: "Automation limits saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      await tenantsService.exportMe();
      toast({ title: "Export downloaded" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export failed", description: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("This permanently deletes all data. Continue?")) return;
    setIsDeletingAccount(true);
    try {
      await tenantsService.deleteMe();
      navigate("/");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
      setIsDeletingAccount(false);
    }
  };

  const handleSaveRetention = async () => {
    setIsSavingRetention(true);
    try {
      const current = await tenantsService.getMe();
      await tenantsService.patchMe({
        automationLimits: {
          ...(current.automationLimits ?? {}),
          convRetention,
          callRetention,
        } as any,
      });
      toast({ title: "Retention policy saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setIsSavingRetention(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    const success = await changePassword(currentPassword, newPassword);
    if (success) {
      toast({ title: "Password updated" });
      setCurrentPassword(""); setNewPassword("");
    } else {
      toast({ variant: "destructive", title: "Incorrect current password" });
    }
  };

  const uploadImage = async (file: File, fieldname: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fieldname', fieldname);
    const response = await authedFetch(`${API_BASE}/tenants/me/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
    const data = await response.json();
    return data.url;
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfilePictureUploading(true);
    try {
      const url = await uploadImage(file, 'profilePicture');
      setProfilePictureUrl(url);
      toast({ title: "Profile picture updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err.message });
    } finally {
      setProfilePictureUploading(false);
    }
  };

  const handleWorkspaceLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWorkspaceLogoUploading(true);
    try {
      const url = await uploadImage(file, 'companyLogo');
      setWorkspaceLogoUrl(url);
      toast({ title: "Company logo updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err.message });
    } finally {
      setWorkspaceLogoUploading(false);
    }
  };

  const handleSendEmailVerification = async () => {
    if (!fbUser) return;
    try {
      await sendEmailVerification(fbUser);
      toast({ title: "Verification email sent", description: "Please check your inbox." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to send verification email", description: err.message });
    }
  };

  const handleSendOtp = async () => {
    if (!profilePhone || !auth?.currentUser) return;
    setPhoneOtpSending(true);
    try {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const confirmation = await linkWithPhoneNumber(auth.currentUser, profilePhone, recaptchaVerifierRef.current);
      setPhoneConfirmation(confirmation);
      toast({ title: "OTP sent" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    } finally {
      setPhoneOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!phoneConfirmation || !phoneOtp) return;
    setPhoneVerifying(true);
    try {
      await phoneConfirmation.confirm(phoneOtp);
      setPhoneConfirmation(null); setPhoneOtp("");
      toast({ title: "Phone verified" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Invalid OTP" });
    } finally {
      setPhoneVerifying(false);
    }
  };

  const handleDisableMfa = async () => {
    setMfaDisabling(true);
    try {
      // Server-side: Admin SDK clears ALL enrolled factors — no recent-login needed,
      // removes every factor (the old client path only removed the first).
      await tenantsService.disableMfa();
      setMfaEnrolled(false);
      toast({ title: "Phone verification disabled", description: "You won't be asked for OTP on next login." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to disable", description: err.message });
    } finally {
      setMfaDisabling(false);
    }
  };

  const handleConnectIntegration = async (key: IntegrationKey) => {
    setIsConnectingIntegration(true);
    try {
      await integrationsService.connect({
        key, mode: "api_connector", name: integrationConnectForm.name, callbackUrl: integrationConnectForm.callbackUrl,
      });
      toast({ title: "Connected" });
      setIntegrationConnectKey(null);
      await loadIntegrationStatus();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setIsConnectingIntegration(false);
    }
  };

  const handleDisconnectIntegration = async (key: IntegrationKey) => {
    try {
      await integrationsService.disconnect({ key });
      toast({ title: "Disconnected" });
      await loadIntegrationStatus();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    }
  };

  // ─── Section definitions ───────────────────────────────────────────────────

  const settingsSections = [
    { icon: User, title: "Profile", description: "Personal info and preferences", href: "/settings/profile", key: "profile" },
    { icon: Building2, title: "Workspace", description: "Business and organization details", href: "/settings/workspace", key: "workspace" },
    { icon: Users, title: "Team", description: "Manage members and roles", href: "/settings/team", key: "team" },
    { icon: Bell, title: "Notifications", description: "Alerts and delivery channels", href: "/settings/notifications", key: "notifications" },
    { icon: Sparkles, title: "Celebrations", description: "Lifecycle and occasion messages", href: "/settings/celebrations", key: "celebrations" },
    { icon: Shield, title: "Security", description: "Password and access control", href: "/settings/security", key: "security" },
    { icon: Palette, title: "Appearance", description: "Theme and display options", href: "/settings/appearance", key: "appearance" },
    { icon: Globe, title: "Integrations", description: "Connect external channels", href: "/settings/channels", key: "integrations" },
    { icon: CreditCard, title: "Billing", description: "Plans and payment methods", href: "/settings/billing", key: "billing" },
    { icon: Sparkles, title: "White Label", description: "Branding and reseller tools", href: "/settings/white-label", key: "whiteLabel" },
    { icon: Bot, title: "AI Config", description: "Model and tone settings", href: "/settings/ai-config", key: "aiConfig" },
    { icon: Workflow, title: "Auto Limits", description: "Rate limits and retry logic", href: "/settings/auto-limits", key: "autoLimits" },
    { icon: Database, title: "Data Privacy", description: "GDPR and data retention", href: "/settings/data-privacy", key: "dataPrivacy" },
    { icon: Code2, title: "Developer", description: "API keys and webhooks", href: "/settings/developer", key: "developer" },
  ];

  const renderPanel = (key: string) => {
    switch (key) {
      case "profile":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => profilePictureInputRef.current?.click()}
                disabled={profilePictureUploading}
                className="relative group"
                title="Click to change profile picture"
              >
                {profilePictureUrl ? (
                  <img src={profilePictureUrl} alt="Profile" className="w-14 h-14 rounded-full object-cover border border-border group-hover:opacity-75 transition-opacity" />
                ) : (
                  <div className="w-14 h-14 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-muted/30 group-hover:bg-muted/50 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                {profilePictureUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  </div>
                )}
              </button>
              <div>
                <p className="text-sm font-medium">Profile picture</p>
                <p className="text-xs text-muted-foreground">Click to upload</p>
              </div>
              <input
                ref={profilePictureInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePictureUpload}
                className="hidden"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Full Name</Label><Input value={profileName} onChange={(e) => setProfileName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Timezone</Label>
                <Select value={profileTimezone} onValueChange={setProfileTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIMEZONE_OPTIONS.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={profileDateOfBirth} onChange={(e) => setProfileDateOfBirth(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Gender</Label>
                <Select value={profileGender} onValueChange={setProfileGender}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
                    <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSaveProfile} size="sm" className="flyn-button-gradient">Save Profile</Button>
            <SectionHeading>Account Security</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Current Password</Label><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
            </div>
            <Button onClick={handleChangePassword} size="sm" variant="outline">Update Password</Button>
          </div>
        );
      case "workspace":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => workspaceLogoInputRef.current?.click()}
                disabled={workspaceLogoUploading}
                className="relative group"
                title="Click to change company logo"
              >
                {workspaceLogoUrl ? (
                  <img src={workspaceLogoUrl} alt="Company Logo" className="w-14 h-14 rounded-lg object-contain border border-border bg-muted p-1 group-hover:opacity-75 transition-opacity" />
                ) : (
                  <div className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 group-hover:bg-muted/50 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                {workspaceLogoUploading && (
                  <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  </div>
                )}
              </button>
              <div>
                <p className="text-sm font-medium">Company logo</p>
                <p className="text-xs text-muted-foreground">Click to upload</p>
              </div>
              <input
                ref={workspaceLogoInputRef}
                type="file"
                accept="image/*"
                onChange={handleWorkspaceLogoUpload}
                className="hidden"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Workspace Name</Label><Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Industry</Label>
                <Select value={workspaceIndustry} onValueChange={setWorkspaceIndustry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INDUSTRY_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Workspace Timezone</Label>
                <Select value={workspaceTimezone} onValueChange={setWorkspaceTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIMEZONE_OPTIONS.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Country</Label>
                <Select value={workspaceCountry} onValueChange={(v) => {
                  setWorkspaceCountry(v);
                  setWorkspaceCurrency(getCurrencyForCountry(v));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {WORLD_COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Workspace Currency</Label>
                <Select key={workspaceCurrency} value={workspaceCurrency} onValueChange={setWorkspaceCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Auto-detected from country. Used in CRM, accounting, and invoices.</p>
              </div>
              <div className="space-y-1.5"><Label>Company Email</Label><Input type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="contact@company.com" /></div>
              <div className="space-y-1.5"><Label>Company Start Date</Label><Input type="date" value={companyStartDate} onChange={(e) => setCompanyStartDate(e.target.value)} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Company Address</Label><Input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="123 Main St, City, State 12345" /></div>
            </div>
            <Button onClick={handleSaveTenantProfile} size="sm" className="flyn-button-gradient" disabled={isSavingTenant}>Save Workspace</Button>
          </div>
        );
      case "notifications":
        return (
          <div className="space-y-4">
            <SectionRow label="New lead assigned"><Switch checked={!!prefs.notif_newLead} onCheckedChange={(v) => updatePref("notif_newLead", v)} /></SectionRow>
            <SectionRow label="Missed AI call"><Switch checked={!!prefs.notif_missedCall} onCheckedChange={(v) => updatePref("notif_missedCall", v)} /></SectionRow>
            <SectionRow label="Appointment booked"><Switch checked={!!prefs.notif_appointmentBooked} onCheckedChange={(v) => updatePref("notif_appointmentBooked", v)} /></SectionRow>
            <SectionRow label="Workflow failure"><Switch checked={!!prefs.notif_workflowError} onCheckedChange={(v) => updatePref("notif_workflowError", v)} /></SectionRow>
            <SectionHeading>Channels</SectionHeading>
            <SectionRow label="In-app Toast"><Switch checked={!!prefs.notif_ch_inapp} onCheckedChange={(v) => updatePref("notif_ch_inapp", v)} /></SectionRow>
            <SectionRow label="Email"><Switch checked={!!prefs.notif_ch_email} onCheckedChange={(v) => updatePref("notif_ch_email", v)} /></SectionRow>
            <SectionRow label="SMS"><Switch checked={!!prefs.notif_ch_sms} onCheckedChange={(v) => updatePref("notif_ch_sms", v)} /></SectionRow>
            <SectionRow label="WhatsApp"><Switch checked={!!prefs.notif_ch_whatsapp} onCheckedChange={(v) => updatePref("notif_ch_whatsapp", v)} /></SectionRow>
            <SectionRow label="Slack" description="Coming soon"><ComingSoonBadge /></SectionRow>
            <Button onClick={handleSaveNotifications} size="sm" className="flyn-button-gradient mt-4">Save Notifications</Button>
          </div>
        );
      case "celebrations":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Automatically send personalised greeting emails to your CRM contacts on their special days.
              Greetings are sent every morning at 8 AM. Contacts need a <strong>Date of Birth</strong> or <strong>Join Date</strong> set in the Phonebook.
            </p>
            <SectionRow label="Birthdays" description="Email contacts on their birthday"><Switch checked={!!prefs.occ_birthday} onCheckedChange={(v) => updatePref("occ_birthday", v)} /></SectionRow>
            <SectionRow label="Work Anniversaries" description="Email contacts on their join date anniversary"><Switch checked={!!prefs.occ_work_anniversary} onCheckedChange={(v) => updatePref("occ_work_anniversary", v)} /></SectionRow>
            <SectionRow label="Organization Anniversary" description="Show an in-app banner on your account's founding anniversary"><Switch checked={!!prefs.occ_org_anniversary} onCheckedChange={(v) => updatePref("occ_org_anniversary", v)} /></SectionRow>
            <SectionHeading>Greeting Tone</SectionHeading>
            <Select value={occTone} onValueChange={(v: any) => updatePref("occ_tone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warm">Warm & Friendly</SelectItem>
                <SelectItem value="formal">Professional</SelectItem>
                <SelectItem value="founder">From the Founder</SelectItem>
              </SelectContent>
            </Select>
            <SectionRow label="Include Emojis"><Switch checked={!!prefs.occ_emoji} onCheckedChange={(v) => updatePref("occ_emoji", v)} /></SectionRow>
            <div className="flex items-center gap-3 mt-4">
              <Button
                size="sm"
                className="flyn-button-gradient"
                disabled={celebSaving}
                onClick={async () => {
                  setCelebSaving(true);
                  try {
                    await authedFetch(`${API_BASE}/occasions/prefs`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        birthday: !!prefs.occ_birthday,
                        workAnniversary: !!prefs.occ_work_anniversary,
                        orgAnniversary: !!prefs.occ_org_anniversary,
                        emoji: !!prefs.occ_emoji,
                        tone: occTone,
                      }),
                    });
                    toast({ title: "Celebration settings saved" });
                  } catch {
                    toast({ variant: 'destructive', title: 'Save failed', description: 'Please try again.' });
                  } finally {
                    setCelebSaving(false);
                  }
                }}
              >
                {celebSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Saving…</> : 'Save Celebrations'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={celebTesting}
                onClick={async () => {
                  setCelebTesting(true);
                  try {
                    const res = await authedFetch(`${API_BASE}/occasions/send-now`, { method: 'POST' });
                    const { sent, skipped } = await res.json();
                    toast({ title: `Test run complete`, description: `${sent} greeting${sent !== 1 ? 's' : ''} sent, ${skipped} contacts skipped (no email).` });
                  } catch {
                    toast({ variant: 'destructive', title: 'Test failed' });
                  } finally {
                    setCelebTesting(false);
                  }
                }}
              >
                {celebTesting ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Running…</> : 'Send Test Greetings'}
              </Button>
            </div>
          </div>
        );
      case "security":
        return (
          <div className="space-y-6">
            <div>
              <SectionHeading>Change Password</SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div className="space-y-1.5"><Label>Current Password</Label><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
              </div>
              <Button onClick={handleChangePassword} size="sm" variant="outline" className="mt-4">Update Password</Button>
            </div>
            <div className="pt-4">
              <SectionHeading>Two-Factor Authentication</SectionHeading>
              <SectionRow label="Phone Verification (OTP)" description={mfaEnrolled ? `OTP required on login — ${profilePhone || "phone enrolled"}` : "Enable to require OTP on every login"}>
                {mfaEnrolled ? (
                  <Button size="sm" variant="destructive" disabled={mfaDisabling} onClick={handleDisableMfa}>
                    {mfaDisabling ? "Disabling..." : "Disable OTP"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => navigate("/settings/profile")}>
                    Enable
                  </Button>
                )}
              </SectionRow>
              <SectionRow label="Email Verification" description={fbUser?.emailVerified ? "Your email address is verified" : "Verify your email to secure your account"}>
                {fbUser?.emailVerified ? (
                  <Badge variant="outline" className="text-green-500 border-green-500 bg-green-500/10">
                    Verified
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleSendEmailVerification}>
                    Send Verification Email
                  </Button>
                )}
              </SectionRow>
            </div>
            <div className="pt-4">
              <SectionHeading>IP Detection</SectionHeading>
              <SectionRow label="New IP Alert" description="Get notified when your account is accessed from an unrecognised IP address">
                <Switch checked={newIpAlertEnabled} onCheckedChange={(v) => { setNewIpAlertEnabled(v); }} />
              </SectionRow>
              <SectionRow label="Suspicious Login Block" description="Require email verification for logins from IP addresses you've never accessed from. Leave off to never be blocked.">
                <Switch checked={suspiciousLoginBlock} onCheckedChange={(v) => { setSuspiciousLoginBlock(v); }} />
              </SectionRow>
              {(suspiciousLoginBlock || newIpAlertEnabled) && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">Whitelisted IPs / Ranges</p>
                  <Textarea
                    value={ipWhitelistText}
                    onChange={(e) => setIpWhitelistText(e.target.value)}
                    placeholder={"One per line — exact IP or CIDR range, e.g.\n203.0.113.42\n157.34.0.0/16"}
                    className="text-xs font-mono min-h-[80px]"
                  />
                  <p className="text-[11px] text-muted-foreground/60 mt-1">These always bypass the IP check — no email, no block. Use a CIDR range (e.g. <span className="font-mono">157.34.0.0/16</span>) to cover your whole office/ISP block.</p>
                </div>
              )}
              {verifiedIps.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Trusted IP Addresses</p>
                  {verifiedIps.map(ip => (
                    <div key={ip} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/50 border border-border">
                      <span className="text-xs font-mono text-foreground">{ip}</span>
                      <Button size="sm" variant="ghost" className="text-destructive h-6 text-xs px-2" onClick={() => handleRemoveIp(ip)}>Remove</Button>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={handleSaveIpSettings} size="sm" variant="outline" className="mt-3">Save IP Settings</Button>
            </div>
            <div className="pt-4">
              <SectionHeading>Sessions</SectionHeading>
              <SectionRow label="Active Sessions" description={"Current device: " + (navigator.platform || "Unknown")}>
                <Button size="sm" variant="ghost" className="text-destructive">Log out others</Button>
              </SectionRow>
            </div>
          </div>
        );
      case "appearance":
        return (
          <div className="space-y-6">
            <div>
              <SectionHeading>Theme Mode</SectionHeading>
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">Interface Theme</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Switch between light and dark modes</p>
                </div>
                <ThemeToggle />
              </div>
            </div>
            <div className="pt-4">
              <SectionHeading>Display Preferences</SectionHeading>
              <SectionRow label="Compact Density" description="Show more items on screen with less padding"><Switch checked={!!prefs.ap_compactDensity} onCheckedChange={(v) => updatePref("ap_compactDensity", v)} /></SectionRow>
              <SectionRow label="High Contrast" description="Increase contrast for better accessibility"><Switch checked={!!prefs.ap_highContrast} onCheckedChange={(v) => updatePref("ap_highContrast", v)} /></SectionRow>
              <SectionRow label="Reduce Animations" description="Minimize motion for smoother performance"><Switch checked={!!prefs.ap_reduceAnimations} onCheckedChange={(v) => updatePref("ap_reduceAnimations", v)} /></SectionRow>
              <SectionRow label="Default Collapsed Sidebar"><Switch checked={!!prefs.ap_collapsedSidebar} onCheckedChange={(v) => updatePref("ap_collapsedSidebar", v)} /></SectionRow>
            </div>
          </div>
        );
      case "aiConfig":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Default Model</Label>
                <Select value={aiModel} onValueChange={setAiModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                    <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Response Tone</Label>
                <Select value={aiTone} onValueChange={setAiTone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Language</Label>
                <Select value={aiLanguage} onValueChange={setAiLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Response Length</Label>
                <Select value={aiResponseLength} onValueChange={setAiResponseLength}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="long">Long</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Confidence Threshold (%)</Label>
                <Input type="number" min="0" max="100" value={aiConfidenceThreshold} onChange={(e) => setAiConfidenceThreshold(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>System Prompt</Label><textarea value={aiSystemPrompt} onChange={(e) => setAiSystemPrompt(e.target.value)} rows={4} className="w-full rounded-md border p-2 text-sm bg-background" /></div>
            <SectionRow label="Profanity Filter" description="Block inappropriate language in AI responses"><Switch checked={!!prefs.ai_profanityFilter} onCheckedChange={(v) => updatePref("ai_profanityFilter", v)} /></SectionRow>
            <SectionRow label="A/B Testing" description="Test multiple AI response variants"><Switch checked={!!prefs.ai_abTesting} onCheckedChange={(v) => updatePref("ai_abTesting", v)} /></SectionRow>
            <div className="pt-2">
              <SectionHeading>Voice &amp; Chat Providers</SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div className="space-y-1.5">
                  <Label>Voice Provider</Label>
                  <Select key={voiceProvider} value={voiceProvider} onValueChange={(v) => setVoiceProvider(v as 'twilio' | 'vapi')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twilio">Twilio (Recommended — FLYN default for staff)</SelectItem>
                      <SelectItem value="vapi">VAPI</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">FLYN uses Twilio internally for staff communications. Customers can choose either provider.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Chatbot AI Agent</Label>
                  <Select key={chatbotAgent} value={chatbotAgent} onValueChange={setChatbotAgent}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai-front-desk">AI Front Desk</SelectItem>
                      <SelectItem value="ai-sales-agent">AI Sales Agent</SelectItem>
                      <SelectItem value="ai-marketing-agent">AI Marketing Agent</SelectItem>
                      <SelectItem value="ai-support-agent">AI Support Agent</SelectItem>
                      <SelectItem value="custom-agent">Custom Agent</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Which AI agent powers your website chatbot and contact page live chat.</p>
                </div>
              </div>
            </div>
            <Button onClick={handleSaveAiConfig} size="sm" className="flyn-button-gradient">Save AI Config</Button>
          </div>
        );
      case "autoLimits":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Daily Call Cap</Label><Input type="number" value={dailyCallCap} onChange={(e) => setDailyCallCap(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Msg Rate Limit (per min)</Label><Input type="number" value={msgRateLimit} onChange={(e) => setMsgRateLimit(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Retry Attempts</Label><Input type="number" value={retryCount} onChange={(e) => setRetryCount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Retry Interval (sec)</Label><Input type="number" value={retryInterval} onChange={(e) => setRetryInterval(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Business Hours Start</Label><Input type="time" value={businessHoursStart} onChange={(e) => setBusinessHoursStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Business Hours End</Label><Input type="time" value={businessHoursEnd} onChange={(e) => setBusinessHoursEnd(e.target.value)} /></div>
            </div>
            <SectionRow label="Auto-pause on Error"><Switch checked={!!prefs.auto_autoPauseOnError} onCheckedChange={(v) => updatePref("auto_autoPauseOnError", v)} /></SectionRow>
            <SectionRow label="Duplicate Detection"><Switch checked={!!prefs.auto_duplicateDetect} onCheckedChange={(v) => updatePref("auto_duplicateDetect", v)} /></SectionRow>
            <Button onClick={handleSaveAutomationLimits} size="sm" className="flyn-button-gradient">Save Limits</Button>
          </div>
        );
      case "dataPrivacy":
        return (
          <div className="space-y-6">
            <SectionRow label="Conversation Retention">
              <Select value={convRetention} onValueChange={setConvRetention}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="90">90 Days</SelectItem><SelectItem value="365">1 Year</SelectItem><SelectItem value="forever">Forever</SelectItem></SelectContent>
              </Select>
            </SectionRow>
            <Button onClick={handleSaveRetention} size="sm" className="flyn-button-gradient" disabled={isSavingRetention}>Save Retention</Button>
            <SectionHeading>Danger Zone</SectionHeading>
            <Button variant="outline" className="text-destructive border-destructive/30" onClick={handleDeleteAccount} disabled={isDeletingAccount}>Delete Account & All Data</Button>
          </div>
        );
      default: return null;
    }
  };

  // Detail View
  if (urlSection) {
    const section = settingsSections.find(s => s.key === urlSection || s.href?.includes(urlSection));
    if (section) {
      return (
        <AppLayout>
          <div className="max-w-4xl mx-auto">
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="mb-6 gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
            <div className="mb-8"><h1 className="text-2xl font-bold">{section.title}</h1><p className="text-muted-foreground">{section.description}</p></div>
            <Card><CardContent className="p-6">{renderPanel(section.key)}</CardContent></Card>
          </div>
        </AppLayout>
      );
    }
  }

  // Overview Grid
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8"><h1 className="text-3xl font-bold">{t("settings.title")}</h1><p className="text-muted-foreground">{t("settings.subtitle")}</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settingsSections.map((s) => (
            <Card key={s.key} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(s.href)}>
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-primary/10"><s.icon className="h-5 w-5 text-primary" /></div>
                  <div><h3 className="font-semibold text-sm">{s.title}</h3><p className="text-xs text-muted-foreground">{s.description}</p></div>
                </div>
                <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground/30" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
