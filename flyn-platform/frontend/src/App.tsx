import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { PlanProvider } from "@/contexts/PlanContext";
import { UsageProvider } from "@/contexts/UsageContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { WalletProvider } from "@/contexts/WalletContext";
import { TenantPlanProvider } from "@/contexts/TenantPlanContext";
import { MfaProvider } from "@/contexts/MfaContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useSmoothScroll } from "@/hooks/useSmoothScroll";
import { useEffect, useState } from "react";
import { useBehavioralTracking } from "./hooks/useBehavioralTracking";
import { authedFetch } from "@/services/authApi";

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import CRMDashboard from "./pages/CRMDashboard";
import Inbox from "./pages/Inbox";
import Dialer from "./pages/Dialer";
import Automations from "./pages/AutomationsV2";
import AIAgents from "./pages/AIAgents";
import DashboardModule from "./pages/DashboardModule";
import Tasks from "./pages/Tasks";
import FileManager from "./pages/FileManager";
import KnowledgeBase from "./pages/KnowledgeBase";
import Settings from "./pages/Settings";
import TeamManagement from "./pages/TeamManagement";
import Billing from "./pages/Billing";
import WhiteLabel from "./pages/WhiteLabel";
import ChannelSettings from "./pages/ChannelSettings";
import LandingAdmin from "./pages/admin/LandingAdmin";
import AdminLogin from "./pages/admin/AdminLogin";
import PlansList from "./pages/admin/PlansList";
import PlanEditor from "./pages/admin/PlanEditor";
import ChatbotAdminPage from "./pages/admin/ChatbotAdminPage";
import ContactSubmissionsPage from "./pages/admin/ContactSubmissionsPage";
import { ChatWidget } from "./components/chatbot/ChatWidget";
import ExecutionViewer from "./pages/ExecutionViewer";
import NotFound from "./pages/NotFound";
import { RequireVerification } from "./components/auth/RequireVerification";
import { RequireModule } from "@/components/auth/RequireModule";
import { VerifyEmailPage } from "./pages/auth/VerifyEmail";
import { SetupMfaPage } from "./pages/auth/SetupMfa";
import { VerifyMfaPage } from "./pages/auth/VerifyMfa";
import { ChurchPage, CoachingPage, EventsPage, InboxPage, TelephonyPage } from "./pages/product";

// Public Content Pages (Legal / Support / Company)
import PublicContentPageWithProvider, { RoutedPublicContentPage } from "./pages/PublicContentPage";
import PricingPage from "./pages/PricingPage";
import ContactPage from "./pages/ContactPage";
import { LandingContentProvider } from "./contexts/LandingContentContext";
import PluginRegistry from "./pages/PluginRegistry";
import CreateMetaTemplate from "./pages/CreateMetaTemplate";
import CampaignManager from "./pages/CampaignManager";
import AIChurchAgent from "./pages/AIChurchAgent";
import ChurchCMS from "./pages/ChurchCMS";
import ChurchKiosk from "./pages/ChurchKiosk";
import DeveloperPortal from "./pages/DeveloperPortal";
import EventRegisterPage from "./pages/EventRegisterPage";
import EventCheckInPage from "./pages/EventCheckInPage";
import AIContentCreator from "./pages/AIContentCreator";
import AISocialMedia from "./pages/AISocialMedia";
import AIFrontDesk from "./pages/AIFrontDesk";
import EsimLanding from "./pages/EsimLanding";
import ComparisonPage from "./components/ComparisonPage";
import DataSources from "./pages/DataSources";
import Phonebook from "./pages/Phonebook";
import PulseSurveyPage from "./pages/PulseSurveyPage";
import CalendarPage from "./pages/CalendarPage";
import AIWebsiteBuilder from "./pages/AIWebsiteBuilder";
import WebsiteManager from "./pages/WebsiteManager";
import DomainManager from "./pages/DomainManager";
import { API_BASE_URL } from "@/lib/api";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAuthInitializing, isTenantFetching, tenant } = useAuth();
  const location = useLocation();
  if (isAuthInitializing || isTenantFetching) {
    return null;
  }
  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  const onboardingDone =
    tenant?.onboardingComplete ||
    localStorage.getItem("flyn_onboarding_complete") === "true";
  if (!onboardingDone && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

const OwnerRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isFlynAdmin, isAuthInitializing } = useAuth();
  const location = useLocation();

  if (isAuthInitializing) {
    return null;
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }

  if (!isFlynAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  useSmoothScroll();
  const hostname = window.location.hostname.toLowerCase();
  const isEsimSubdomain = hostname.startsWith('esim.') || hostname.includes('esim-');

  const { user, isAuthenticated } = useAuth();

  // If user hits app-only routes on the marketing domain, redirect to app subdomain.
  // This avoids Cloudflare Pages redirect loops when the same build is served on app.myflynai.com.
  const location = useLocation();
  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    const isAppHost = host === 'app.myflynai.com' || host.startsWith('app.');
    const isMarketingHost = host === 'myflynai.com' || host === 'www.myflynai.com';

    if (!isMarketingHost || isAppHost) return;

    const p = location.pathname;
    const isAppRoute =
      p === '/login' ||
      p === '/signup' ||
      p === '/onboarding' ||
      p === '/reset-password' ||
      p.startsWith('/dashboard') ||
      p.startsWith('/settings') ||
      p.startsWith('/inbox') ||
      p.startsWith('/dialer') ||
      p.startsWith('/automations') ||
      p.startsWith('/ai-agents') ||
      p.startsWith('/plugins') ||
      p.startsWith('/data-sources') ||
      p.startsWith('/execution-viewer') ||
      p.startsWith('/admin') ||
      p.startsWith('/tasks') ||
      p.startsWith('/files') ||
      p.startsWith('/knowledge') ||
      p.startsWith('/phonebook') ||
      p.startsWith('/ai') ||
      p.startsWith('/calendars') ||
      p.startsWith('/website-builder') ||
      p.startsWith('/domains');

    // 1. If on marketing domain and it's an app route -> Redirect to app subdomain
    if (isMarketingHost && isAppRoute) {
      const target = `https://app.myflynai.com${p}${location.search}${location.hash}`;
      window.location.replace(target);
      return;
    }

    // 2. If on app domain and it's NOT an app route (and not root) -> Redirect to marketing domain
    if (isAppHost && !isAppRoute && p !== '/') {
      const target = `https://myflynai.com${p}${location.search}${location.hash}`;
      window.location.replace(target);
      return;
    }

    // 3. Handle root path on app subdomain
    if (isAppHost && p === '/') {
      // If we are on app.myflynai.com/ we should be in the app flow
      // The ProtectedRoute or Dashboard itself will handle authenticated state
      return;
    }
  }, [location.hash, location.pathname, location.search]);

  const [channelsTenantId, setChannelsTenantId] = useState<string>('');
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setChannelsTenantId('');
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      const tid = window.localStorage.getItem('tenantId');
      if (tid) {
        if (!cancelled) setChannelsTenantId(tid);
        return;
      }

      try {
        const resp = await authedFetch(`${API_BASE_URL}/tenants`);
        if (!resp.ok) {
          if (!cancelled) setChannelsTenantId('');
          return;
        }
        const list = await resp.json();
        const firstId = Array.isArray(list) && list.length > 0 ? String(list[0]?.id || '') : '';
        if (firstId) {
          window.localStorage.setItem('tenantId', firstId);
          if (!cancelled) setChannelsTenantId(firstId);
        } else {
          if (!cancelled) setChannelsTenantId('');
        }
      } catch {
        if (!cancelled) setChannelsTenantId('');
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  useBehavioralTracking();

  return (
    <LandingContentProvider>
      <Routes>
        <Route 
          path="/" 
          element={
            isEsimSubdomain ? <EsimLanding /> : 
            (window.location.hostname.toLowerCase().startsWith('app.') ? <Navigate to="/dashboard" replace /> : <Index />)
          } 
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/setup-mfa" element={<SetupMfaPage />} />
        <Route path="/verify-mfa" element={<VerifyMfaPage />} />
        <Route path="/esim" element={<EsimLanding />} />
        <Route path="/compare" element={<ComparisonPage />} />
        <Route path="/onboarding" element={<ProtectedRoute><RequireVerification><Onboarding /></RequireVerification></ProtectedRoute>} />

        {/* Owner Admin (Global) */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<OwnerRoute><Navigate to="/admin/landing" replace /></OwnerRoute>} />
        <Route path="/admin/landing" element={<OwnerRoute><LandingAdmin /></OwnerRoute>} />
        <Route path="/admin/plans" element={<OwnerRoute><PlansList /></OwnerRoute>} />
        <Route path="/admin/plans/:planId" element={<OwnerRoute><PlanEditor /></OwnerRoute>} />
        <Route path="/admin/chatbot" element={<OwnerRoute><ChatbotAdminPage /></OwnerRoute>} />
        <Route path="/admin/contact-submissions" element={<OwnerRoute><ContactSubmissionsPage /></OwnerRoute>} />

        {/* Public Content Pages */}
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/product" element={<PublicContentPageWithProvider pageKey="product" />} />
        <Route path="/product/:slug" element={<RoutedPublicContentPage baseKey="product" />} />
        <Route path="/solutions/:slug" element={<RoutedPublicContentPage baseKey="solutions" />} />
        <Route path="/company/:slug" element={<RoutedPublicContentPage baseKey="company" />} />
        <Route path="/channels/:slug" element={<RoutedPublicContentPage baseKey="channels" />} />
        <Route path="/legal/:slug" element={<RoutedPublicContentPage baseKey="legal" />} />
        <Route path="/support/:slug" element={<RoutedPublicContentPage baseKey="support" />} />
        <Route path="/blog" element={<PublicContentPageWithProvider pageKey="blog" />} />

        {/* Specific Product Pages (Optional overrides if preferred over CMS) */}
        <Route path="/product/church" element={<ChurchPage />} />
        <Route path="/product/coaches" element={<CoachingPage />} />
        <Route path="/product/events" element={<EventsPage />} />
        <Route path="/product/unified-inbox" element={<InboxPage />} />
        <Route path="/product/telephony" element={<TelephonyPage />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><RequireVerification><Dashboard /></RequireVerification></ProtectedRoute>} />
        <Route path="/dashboard/crm" element={<ProtectedRoute><RequireVerification><RequireModule module="crm"><CRMDashboard /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/dashboard/calendars" element={<ProtectedRoute><RequireVerification><RequireModule module="calendar"><CalendarPage /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/dashboard/:module" element={<ProtectedRoute><RequireVerification><DashboardModule /></RequireVerification></ProtectedRoute>} />
        <Route path="/inbox" element={<ProtectedRoute><RequireVerification><RequireModule module="unified_inbox"><Inbox /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/dialer" element={<ProtectedRoute><RequireVerification><RequireModule module="telephony"><Dialer /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/automations" element={<ProtectedRoute><RequireVerification><RequireModule module="automations"><Automations /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/ai-agents" element={<ProtectedRoute><RequireVerification><RequireModule module="ai_agents"><AIAgents /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><RequireVerification><RequireModule module="tasks"><Tasks /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/files" element={<ProtectedRoute><RequireVerification><FileManager /></RequireVerification></ProtectedRoute>} />
        <Route path="/knowledge" element={<ProtectedRoute><RequireVerification><KnowledgeBase /></RequireVerification></ProtectedRoute>} />
        <Route path="/plugins" element={<ProtectedRoute><RequireVerification><PluginRegistry /></RequireVerification></ProtectedRoute>} />
        <Route path="/campaigns" element={<ProtectedRoute><RequireVerification><CampaignManager /></RequireVerification></ProtectedRoute>} />
        <Route path="/plugins/whatsapp-crm/create-template" element={<ProtectedRoute><RequireVerification><CreateMetaTemplate /></RequireVerification></ProtectedRoute>} />
        {/* Legacy plugin pages replaced by the unified Campaign Manager */}
        <Route path="/plugins/whatsapp-crm" element={<Navigate to="/campaigns" replace />} />
        <Route path="/plugins/telegram" element={<Navigate to="/campaigns" replace />} />
        <Route path="/plugins/church-cms" element={<ProtectedRoute><RequireVerification><ChurchCMS /></RequireVerification></ProtectedRoute>} />
        <Route path="/dashboard/church-ai" element={<ProtectedRoute><RequireVerification><AIChurchAgent /></RequireVerification></ProtectedRoute>} />
        <Route path="/kiosk/:eventId" element={<ChurchKiosk />} />
        <Route path="/events/register/:eventId" element={<EventRegisterPage />} />
        <Route path="/checkin/:eventId" element={<EventCheckInPage />} />
        <Route path="/surveys/pulse" element={<PulseSurveyPage />} />
        <Route path="/data-sources" element={<ProtectedRoute><RequireVerification><DataSources /></RequireVerification></ProtectedRoute>} />
        <Route path="/phonebook" element={<ProtectedRoute><RequireVerification><RequireModule module="phonebook"><Phonebook /></RequireModule></RequireVerification></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><RequireVerification><Settings /></RequireVerification></ProtectedRoute>} />
        <Route path="/settings/:section" element={<ProtectedRoute><RequireVerification><Settings /></RequireVerification></ProtectedRoute>} />
        <Route path="/settings/team" element={<ProtectedRoute><RequireVerification><TeamManagement /></RequireVerification></ProtectedRoute>} />
        <Route path="/settings/billing" element={<ProtectedRoute><RequireVerification><Billing /></RequireVerification></ProtectedRoute>} />
        <Route path="/settings/white-label" element={<ProtectedRoute><RequireVerification><WhiteLabel /></RequireVerification></ProtectedRoute>} />
        <Route path="/settings/channels" element={<ProtectedRoute><RequireVerification><ChannelSettings /></RequireVerification></ProtectedRoute>} />
        <Route path="/settings/developer" element={<ProtectedRoute><RequireVerification><RequireModule module="api_access"><DeveloperPortal /></RequireModule></RequireVerification></ProtectedRoute>} />
        {/* AI Marketing retired — lead scoring + activity now live in Campaign Manager */}
        <Route path="/ai/marketing" element={<Navigate to="/campaigns" replace />} />
        <Route path="/ai/content" element={<ProtectedRoute><RequireVerification><AIContentCreator /></RequireVerification></ProtectedRoute>} />
        <Route path="/ai/social" element={<ProtectedRoute><RequireVerification><AISocialMedia /></RequireVerification></ProtectedRoute>} />
        <Route path="/ai/frontdesk" element={<ProtectedRoute><RequireVerification><AIFrontDesk /></RequireVerification></ProtectedRoute>} />
        <Route path="/execution-viewer" element={<ExecutionViewer />} />
        <Route path="/website-builder" element={<ProtectedRoute><RequireVerification><AIWebsiteBuilder /></RequireVerification></ProtectedRoute>} />
        <Route path="/website-manager" element={<ProtectedRoute><RequireVerification><WebsiteManager /></RequireVerification></ProtectedRoute>} />
        <Route path="/domains" element={<ProtectedRoute><RequireVerification><RequireModule module="custom_domains"><DomainManager /></RequireModule></RequireVerification></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </LandingContentProvider>
  );
};

const App = () => (
  <ThemeProvider defaultTheme="system" attribute="class">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MfaProvider>
          <PlanProvider>
            <UsageProvider>
              <NotificationProvider>
                <BrandingProvider>
                  <WalletProvider>
                    <TenantPlanProvider>
                      <TooltipProvider delayDuration={300}>
                    <Toaster />
                    <Sonner />
                    <BrowserRouter
                    future={{
                      v7_startTransition: true,
                      v7_relativeSplatPath: true,
                    }}
                  >
                    <ScrollToTop />
                    <AppRoutes />
                    <ChatWidget />
                  </BrowserRouter>
                      </TooltipProvider>
                    </TenantPlanProvider>
                  </WalletProvider>
                </BrandingProvider>
              </NotificationProvider>
            </UsageProvider>
          </PlanProvider>
        </MfaProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
