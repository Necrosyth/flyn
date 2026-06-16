import { ProductPageLayout } from "@/components/product/ProductPageLayout";
import { Phone, PhoneCall, Bot, BarChart3, Users, Globe } from "lucide-react";

const TelephonyPage = () => {
  const features = [
    {
      icon: Phone,
      title: "VOIP Calling & Softphone Dialer",
      items: [
        "Record and transcribe calls including free transcripts",
        "Easy ready-to-use softphones and auto-dialers",
        "Multi-line management",
      ],
    },
    {
      icon: PhoneCall,
      title: "Power & Auto Dialer",
      items: [
        "Auto-dial lists effectively connects on-first-touch",
        "Smart call queuing and distribution",
        "Real-time call monitoring",
      ],
    },
    {
      icon: Bot,
      title: "AI-Powered Call Autopilot",
      items: [
        "AI voicemail and call summaries",
        "Automated follow-ups and scheduling",
        "Smart call routing based on context",
      ],
    },
    {
      icon: BarChart3,
      title: "Smart Call Routing & IVR",
      items: [
        "Create intelligent IVR flows",
        "Skills-based routing",
        "Queue management and overflow",
      ],
    },
    {
      icon: Users,
      title: "Call Monitor & Whisper",
      items: [
        "Live call monitoring for managers",
        "Whisper coaching without caller hearing",
        "Barge-in capability for assistance",
      ],
    },
    {
      icon: Globe,
      title: "Org-Wide Local & Toll-Free Calling",
      items: [
        "Local presence dialing",
        "Toll-free number management",
        "International calling support",
      ],
    },
  ];

  const pricing = [
    {
      name: "Starter",
      price: "$29",
      period: "user/month",
      description: "6,000 free outbound minutes",
      features: [
        "VOIP + SIP calling",
        "CRM integrations",
        "Power Dialer",
        "Local and toll-free numbers",
        "Real-time analytics",
      ],
      cta: "Get Started",
    },
    {
      name: "Pro",
      price: "$69",
      period: "user/month",
      description: "20,000 free outbound minutes",
      highlighted: true,
      features: [
        "Everything in Starter",
        "Call routing & IVR",
        "Local presence dialing",
        "Zapier + Webhooks",
        "AI-powered automations",
        "Priority support",
      ],
      cta: "Start Free Trial",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "Price First Scalable",
      features: [
        "Unlimited minutes",
        "Advanced analytics",
        "Custom IVR flows",
        "Dedicated account manager",
        "SLA guarantees",
        "Custom integrations",
      ],
      cta: "Contact Sales",
    },
  ];

  return (
    <ProductPageLayout
      title="Complete Telephony Software for"
      titleHighlight="Sales Teams"
      subtitle="Boost your connect rates, productivity, and revenue with FLYN AI's all-in-one call center and telephony platform — powered by AI."
      features={features}
      pricing={pricing}
    />
  );
};

export default TelephonyPage;
