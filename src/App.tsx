import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { PlanProvider } from "@/contexts/PlanContext";
import { UsageProvider } from "@/contexts/UsageContext";
import { NotificationProvider } from "@/contexts/NotificationContext";

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Dialer from "./pages/Dialer";
import Automations from "./pages/Automations";
import AIAgents from "./pages/AIAgents";
import DashboardModule from "./pages/DashboardModule";
import Settings from "./pages/Settings";
import WhiteLabel from "./pages/WhiteLabel";
import LandingAdmin from "./pages/admin/LandingAdmin";
import NotFound from "./pages/NotFound";

// Product Pages
import { ChurchPage, TelephonyPage, CoachingPage, EventsPage, InboxPage } from "./pages/product";

const queryClient = new QueryClient();

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      
      {/* Product Pages (Public) */}
      <Route path="/product/church" element={<ChurchPage />} />
      <Route path="/product/telephony" element={<TelephonyPage />} />
      <Route path="/product/coaches" element={<CoachingPage />} />
      <Route path="/product/events" element={<EventsPage />} />
      <Route path="/product/inbox" element={<InboxPage />} />
      
      {/* Protected Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dashboard/:module" element={<ProtectedRoute><DashboardModule /></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
      <Route path="/dialer" element={<ProtectedRoute><Dialer /></ProtectedRoute>} />
      <Route path="/automations" element={<ProtectedRoute><Automations /></ProtectedRoute>} />
      <Route path="/ai-agents" element={<ProtectedRoute><AIAgents /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/admin/landing" element={<ProtectedRoute><LandingAdmin /></ProtectedRoute>} />
      <Route path="/settings/white-label" element={<ProtectedRoute><WhiteLabel /></ProtectedRoute>} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <PlanProvider>
        <UsageProvider>
          <NotificationProvider>
            <BrandingProvider>
              <TooltipProvider delayDuration={300}>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </TooltipProvider>
            </BrandingProvider>
          </NotificationProvider>
        </UsageProvider>
      </PlanProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
