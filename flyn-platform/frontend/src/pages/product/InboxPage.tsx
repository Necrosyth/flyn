import { ProductPageLayout } from "@/components/product/ProductPageLayout";
import { MessageSquare, Bot, Megaphone, Zap, ShoppingCart, Users } from "lucide-react";

const InboxPage = () => {
  const features = [
    {
      icon: MessageSquare,
      title: "Unified Inbox & Cart Recovery",
      items: [
        "Manage multi-agent conversations seamlessly",
        "Automate abandoned cart recovery for WhatsApp",
        "All channels in one place",
      ],
    },
    {
      icon: Megaphone,
      title: "Broadcasts & Bulk Messaging",
      items: [
        "Send targeted campaigns to thousands of customers",
        "Use click-to-WhatsApp widgets for seamless opt-ins",
        "Schedule and automate broadcasts",
      ],
    },
    {
      icon: Bot,
      title: "Smart Auto-Follow-up Sequences",
      items: [
        "AI-Powered Chat Agents Hub",
        "Automated conversation flows",
        "Intelligent response suggestions",
      ],
    },
    {
      icon: Zap,
      title: "Marketing & Sales Automation",
      items: [
        "Automate follow-ups, cart recovery",
        "Customer re-engagement, sales funnels",
        "Upselling in one flow",
      ],
    },
    {
      icon: ShoppingCart,
      title: "E-commerce Integration",
      items: [
        "Shopify, WooCommerce, custom stores",
        "Order notifications and tracking",
        "Product catalogs in chat",
      ],
    },
    {
      icon: Users,
      title: "Team Collaboration",
      items: [
        "Assign conversations to team members",
        "Internal notes and mentions",
        "Performance analytics",
      ],
    },
  ];

  const pricing = [
    {
      name: "Starter",
      price: "$29",
      period: "user/month",
      features: [
        "Unified Inbox",
        "Cart recovery",
        "Bulk messaging",
        "Click-to-chat widgets",
        "Sales automations",
      ],
      cta: "Get Started",
    },
    {
      name: "Pro",
      price: "$69",
      period: "user/month",
      highlighted: true,
      features: [
        "Everything in Starter",
        "AI-powered chat agents",
        "Advanced automations",
        "Custom workflows",
        "Priority support",
        "Analytics dashboard",
      ],
      cta: "Start Free Trial",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "Price Best Scalable",
      features: [
        "Unlimited agents",
        "Custom integrations",
        "Dedicated support",
        "SLA guarantees",
        "White-label option",
        "Advanced security",
      ],
      cta: "Contact Sales",
    },
  ];

  return (
    <ProductPageLayout
      title="All-in-One WhatsApp CRM to"
      titleHighlight="Engage and Convert"
      subtitle="Easily manage contacts, automate marketing, and boost conversions on WhatsApp using FLYN AI's intelligent all-in-one CRM platform for businesses."
      features={features}
      pricing={pricing}
    />
  );
};

export default InboxPage;
