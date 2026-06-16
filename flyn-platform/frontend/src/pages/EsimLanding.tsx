import { LandingFooter } from "@/components/landing/LandingFooter";
import {
    EsimHeader,
    EsimHero,
    EsimCountrySearch,
    EsimHowItWorks,
    EsimPlans,
    EsimFeatures,
    EsimCompatibility,
    EsimTestimonials,
    EsimFAQ,
    EsimCTA,
} from "@/components/esim";

const EsimLanding = () => {
    // Detect if we are on the esim subdomain
    const isSubdomain = window.location.hostname === 'esim.myflynai.com' || window.location.hostname.startsWith('esim.');

    return (
        <div className="min-h-screen bg-[#0a0a1a] scroll-smooth">
            <EsimHeader />
            <main>
                <EsimHero />
                <EsimCountrySearch />
                <EsimHowItWorks />
                <EsimPlans />
                <EsimFeatures />
                <EsimCompatibility />
                <EsimTestimonials />
                <EsimFAQ />
                <EsimCTA />
            </main>
            <LandingFooter />
        </div>
    );
};

export default EsimLanding;
