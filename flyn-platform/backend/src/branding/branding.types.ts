export type BrandingSettings = {
  logoUrl: string | null;
  logoText: string;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  sidebarBgColor: string;
  fontFamily: string;
  customDomain: string;
  appName: string;
  showPoweredBy: boolean;
  emailFromName: string;
  emailFooterText: string;
  // Email-tab fields the White-Label UI persists (merged via upsert). Optional so existing
  // docs without them stay valid; the email-branding resolver reads them.
  customEmailDomain?: string;
  emailLogoMode?: 'logo' | 'name';
};
