import { ProductPageLayout } from "@/components/product/ProductPageLayout";
import { GraduationCap, Calendar, CreditCard, Users, BarChart3, MessageSquare } from "lucide-react";

const CoachingPage = () => {
  const features = [
    {
      icon: GraduationCap,
      title: "Coaching Programs",
      items: [
        "Manage 1-on-1 or group coaching",
        "Offer packages, self-paced programs, memberships",
        "Automated content delivery",
      ],
    },
    {
      icon: Calendar,
      title: "Sessions & Scheduling",
      items: [
        "Smart calendar and scheduling tools",
        "Client reminders & automations",
        "Session notes and progress tracking",
      ],
    },
    {
      icon: CreditCard,
      title: "Client Portal & Payments",
      items: [
        "Client portal & resource library",
        "Invoices, packages, subscriptions",
        "Secure payments (Debit, CC, PayPal)",
      ],
    },
    {
      icon: Users,
      title: "Client Management CRM",
      items: [
        "Full client profiles and history",
        "Progress tracking and milestones",
        "Custom fields and tags",
      ],
    },
    {
      icon: BarChart3,
      title: "Analytics & Reporting",
      items: [
        "Revenue and session analytics",
        "Client engagement metrics",
        "Growth forecasting",
      ],
    },
    {
      icon: MessageSquare,
      title: "Communication Hub",
      items: [
        "In-app messaging with clients",
        "Email and SMS notifications",
        "Automated follow-ups",
      ],
    },
  ];

  const pricing = [
    {
      name: "Starter",
      price: "$29",
      period: "coach/month",
      features: [
        "Coaching Programs",
        "Client Management CRM",
        "Scheduling & Sessions",
        "Payments",
        "Progress Tracking",
      ],
      cta: "Get Started",
    },
    {
      name: "Pro",
      price: "$69",
      period: "coach/month",
      highlighted: true,
      features: [
        "Everything in Starter",
        "Advanced Analytics",
        "Custom Branding",
        "Priority Support",
        "API + Webhook access",
        "Automated Workflows",
      ],
      cta: "Start Free Trial",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "Price Best Flexible",
      features: [
        "API + Webhook access",
        "Scheduling & Sessions",
        "Progress Tracking",
        "Deposit Payments",
        "Full Analytics Suite",
        "Dedicated Support",
      ],
      cta: "Contact Sales",
    },
  ];

  return (
    <ProductPageLayout
      title="The All-in-One Platform for"
      titleHighlight="Coaches and Courses"
      subtitle="Scale your coaching business overnight with FLYN AI — completely manage clients, sessions, and programs from one intelligent platform."
      features={features}
      pricing={pricing}
    />
  );
};

export default CoachingPage;
