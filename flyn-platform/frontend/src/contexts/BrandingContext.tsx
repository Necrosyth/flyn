import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";
import { isDemoModeEnabled } from "@/lib/demo-mode";

export interface BrandingSettings {
  // Logo
  logoUrl: string | null;
  logoDarkUrl: string | null;      // separate dark-mode logo
  logoText: string;
  faviconUrl: string | null;

  // Login page
  loginBgUrl: string | null;       // custom login background image

  // Colors (HSL format: "hue saturation% lightness%")
  primaryColor: string;
  accentColor: string;
  sidebarBgColor: string;

  // Typography
  fontFamily: string;

  // Custom domain
  customDomain: string;

  // App name
  appName: string;

  // Feature visibility
  showPoweredBy: boolean;

  // Email branding
  emailFromName: string;
  emailFooterText: string;
  customEmailDomain: string;
  emailLogoMode: 'logo' | 'name';

  // Legal URLs
  termsUrl: string;
  privacyUrl: string;

  // Chatbot identity
  chatbotName: string;
  chatbotAvatarUrl: string | null;

  // WhatsApp business profile
  whatsappBusinessName: string;
}

const defaultBranding: BrandingSettings = {
  logoUrl: null,
  logoDarkUrl: null,
  logoText: "Flyn",
  faviconUrl: null,
  loginBgUrl: null,
  primaryColor: "252 85% 60%",
  accentColor: "187 85% 53%",
  sidebarBgColor: "257 75% 10%",
  fontFamily: "Inter",
  customDomain: "",
  appName: "Flyn",
  showPoweredBy: true,
  emailFromName: "Flyn",
  emailFooterText: "Powered by Flyn AI",
  customEmailDomain: "",
  emailLogoMode: 'logo',
  termsUrl: "",
  privacyUrl: "",
  chatbotName: "Flyn Assistant",
  chatbotAvatarUrl: null,
  whatsappBusinessName: "",
};

interface BrandingContextType {
  branding: BrandingSettings;
  updateBranding: (updates: Partial<BrandingSettings>) => void;
  resetBranding: () => void;
  isCustomized: boolean;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const demoMode = isDemoModeEnabled();
  const [branding, setBranding] = useState<BrandingSettings>(() => {
    const stored = localStorage.getItem("flyn_branding");
    return stored ? { ...defaultBranding, ...JSON.parse(stored) } : defaultBranding;
  });

  const isCustomized = JSON.stringify(branding) !== JSON.stringify(defaultBranding);

  // Apply CSS variables when branding changes
  useEffect(() => {
    const root = document.documentElement;
    
    // Primary color
    root.style.setProperty("--primary", branding.primaryColor);
    root.style.setProperty("--flyn-purple", branding.primaryColor);
    root.style.setProperty("--ring", branding.primaryColor);
    root.style.setProperty("--sidebar-primary", branding.primaryColor);
    
    // Accent color
    root.style.setProperty("--accent", branding.accentColor);
    root.style.setProperty("--flyn-cyan", branding.accentColor);
    
    // Sidebar background
    root.style.setProperty("--sidebar-background", branding.sidebarBgColor);
    
    // Gradient update - match brand/logo gradient: purple -> blue -> cyan
    const deepBlueHsl = "220 100% 60%";
    root.style.setProperty(
      "--flyn-gradient",
      `linear-gradient(135deg, hsl(${branding.primaryColor}) 0%, hsl(${deepBlueHsl}) 50%, hsl(${branding.accentColor}) 100%)`
    );
    // Accent gradient token remains for secondary UI where cyan is intended
    root.style.setProperty(
      "--flyn-gradient-accent",
      `linear-gradient(135deg, hsl(${branding.primaryColor}) 0%, hsl(${branding.accentColor}) 100%)`
    );
    
    // Font
    root.style.setProperty("--font-family", branding.fontFamily);
    document.body.style.fontFamily = `'${branding.fontFamily}', system-ui, sans-serif`;
    
    // Favicon
    if (branding.faviconUrl) {
      const favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (favicon) {
        favicon.href = branding.faviconUrl;
      }
    }
    
    // App title
    document.title = branding.appName;
  }, [branding]);

  // Load from backend (per-tenant) when available
  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    const loadRemote = async () => {
      try {
        const resp = await authedFetch(`${API_BASE_URL}/branding`);
        if (!resp.ok) return;
        const remote = (await resp.json()) as BrandingSettings | null;
        if (cancelled) return;
        if (remote) {
          const merged = { ...defaultBranding, ...remote };
          setBranding(merged);
          localStorage.setItem("flyn_branding", JSON.stringify(merged));
        }
      } catch {
        // ignore (fallback to local cache)
      }
    };

    loadRemote();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateBranding = (updates: Partial<BrandingSettings>) => {
    setBranding((prev) => {
      const updated = { ...prev, ...updates };
      localStorage.setItem("flyn_branding", JSON.stringify(updated));

      // Best-effort remote save — saved locally already, log if server sync fails
      authedFetch(`${API_BASE_URL}/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).then(r => { if (!r.ok) console.warn(`[Branding] Server sync failed: HTTP ${r.status}`); })
        .catch((err: Error) => console.warn("[Branding] Server sync error:", err.message));
      return updated;
    });
  };

  const resetBranding = () => {
    setBranding(defaultBranding);
    localStorage.removeItem("flyn_branding");

    authedFetch(`${API_BASE_URL}/branding`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(defaultBranding),
    }).then(r => { if (!r.ok) console.warn(`[Branding] Reset sync failed: HTTP ${r.status}`); })
      .catch((err: Error) => console.warn("[Branding] Reset sync error:", err.message));
  };

  return (
    <BrandingContext.Provider value={{ branding, updateBranding, resetBranding, isCustomized }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used within BrandingProvider");
  }
  return context;
};
