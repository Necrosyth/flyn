import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Landing from "./Landing";

const Index = () => {
  const { isAuthenticated } = useAuth();

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isAppHostname = hostname === "app.myflynai.com" || hostname.startsWith("app.");

  // Show landing page for non-authenticated users
  // Redirect to dashboard if logged in
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isAppHostname) {
    return <Navigate to="/login" replace />;
  }

  return <Landing />;
};

export default Index;
