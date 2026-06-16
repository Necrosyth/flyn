import { useEffect } from "react";
import { useTheme } from "next-themes";
import {
  LandingHeader,
  HeroSection,
  TrustStrip,
  ReplacementSection,
  ModulesSection,
  AISection,
  ProductScreens,
  DeveloperSection,
  LandingFooter,
} from "@/components/landing";
import { useLandingContent } from "@/contexts/LandingContentContext";

const Landing = () => {
  const { content } = useLandingContent();
  const { setTheme } = useTheme();

  // Always follow the OS preference on the landing page.
  // next-themes stores the last chosen theme in localStorage which would
  // otherwise override the system setting — this clears that on every visit.
  useEffect(() => {
    setTheme("system");
  }, [setTheme]);

  useEffect(() => {
    if (content.siteTitle) {
      document.title = content.siteTitle;
    }
    const descEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (descEl && content.seoDescription) {
      descEl.content = content.seoDescription;
    }
  }, [content.siteTitle, content.seoDescription]);

  return (
    <div className="min-h-screen bg-background scroll-smooth">
      <LandingHeader />
      <main>
        <HeroSection />
        <TrustStrip />
        <ReplacementSection />
        <ModulesSection />
        <AISection />
        <ProductScreens />
        <DeveloperSection />
      </main>
      <LandingFooter />
    </div>
  );
};

export default Landing;
