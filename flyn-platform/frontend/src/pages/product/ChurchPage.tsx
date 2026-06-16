import { ProductPageLayout } from "@/components/product/ProductPageLayout";
import { Church, Users, Heart, MessageSquare, Calendar, Shield } from "lucide-react";

const ChurchPage = () => {
  const features = [
    {
      icon: Church,
      title: "Multi-Church Dashboard",
      items: [
        "Manage multiple sites, locations, and pastors",
        "Detailed reports on all campuses",
        "Connect WhatsApp, SMS, Email, Webchat",
      ],
    },
    {
      icon: Users,
      title: "Full Member CRM",
      items: [
        "Member directory + custom fields",
        "Attendance tracking, families, photos, tags",
        "Volunteer activity, segment + message",
      ],
    },
    {
      icon: Heart,
      title: "Giving & Donations",
      items: [
        "Online donations with recurring giving",
        "Child check-ins",
        "Sermons & media",
      ],
    },
    {
      icon: Calendar,
      title: "Groups & Attendance",
      items: [
        "Small groups management",
        "Attendance tracking",
        "Volunteer scheduling",
      ],
    },
    {
      icon: MessageSquare,
      title: "Unified Messaging",
      items: [
        "WhatsApp, SMS, Email integration",
        "Broadcast to congregation",
        "Prayer request management",
      ],
    },
    {
      icon: Shield,
      title: "Security & Compliance",
      items: [
        "GDPR compliant data handling",
        "Role-based access control",
        "Secure member data",
      ],
    },
  ];

  const pricing = [
    {
      name: "Small Church",
      price: "Free",
      period: "month",
      features: [
        "Multiple Churches Support",
        "Member Directory",
        "Attendance & Groups",
        "Donations & Recurring Giving",
        "Child Check-ins",
        "Sermons & Media",
        "Unified Messaging",
      ],
      cta: "Get Started Free",
    },
    {
      name: "Growing Church",
      price: "$99",
      period: "month",
      highlighted: true,
      features: [
        "Everything in Small Church",
        "Advanced Analytics",
        "Custom Branding",
        "Priority Support",
        "API Access",
        "Webhook integrations",
        "Multi-campus reports",
      ],
      cta: "Start Free Trial",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "Price Best Scalable",
      features: [
        "API + Webhook access",
        "Priority Encryption",
        "Unified Messaging",
        "Full Analytics Suite",
        "Dedicated Account Manager",
        "Custom Integrations",
      ],
      cta: "Contact Sales",
    },
  ];

  return (
    <ProductPageLayout
      title="The Best"
      titleHighlight="Church Management Software"
      subtitle="Run your church, grow your community, and increase engagement with FLYN AI's intelligent all-in-one church management platform."
      features={features}
      pricing={pricing}
    />
  );
};

export default ChurchPage;
