import { ProductPageLayout } from "@/components/product/ProductPageLayout";
import { Calendar, Ticket, Users, BarChart3, Mail, CreditCard } from "lucide-react";

const EventsPage = () => {
  const features = [
    {
      icon: Calendar,
      title: "Easy Event Creation",
      items: [
        "Unlimited free & paid events",
        "Teams, locations, automation recurring",
        "Custom event pages and branding",
      ],
    },
    {
      icon: Ticket,
      title: "RSVP + Ticketing",
      items: [
        "RSVP & ticketing management",
        "QR check-ins tracking",
        "Engagement automations",
      ],
    },
    {
      icon: Users,
      title: "Grow and Engage",
      items: [
        "Email & SMS broadcasts",
        "Generate donations",
        "Event analytics & growth tools",
      ],
    },
    {
      icon: BarChart3,
      title: "Event Analytics",
      items: [
        "Real-time attendance tracking",
        "Revenue and sales reports",
        "Attendee insights",
      ],
    },
    {
      icon: Mail,
      title: "Marketing Automation",
      items: [
        "Automated reminders and follow-ups",
        "Pre and post-event campaigns",
        "Segmented communications",
      ],
    },
    {
      icon: CreditCard,
      title: "Payments & Donations",
      items: [
        "Secure payment processing",
        "Donation collection",
        "Refund management",
      ],
    },
  ];

  const pricing = [
    {
      name: "Starter",
      price: "$29",
      period: "user/month",
      features: [
        "Unlimited free & Paid events",
        "RSVP + Ticketing",
        "Event CRM + automations",
        "Basic Analytics",
        "Email notifications",
      ],
      cta: "Get Started",
    },
    {
      name: "Pro",
      price: "$69",
      period: "organizer/month",
      highlighted: true,
      features: [
        "Everything in Starter",
        "Advanced automations",
        "Custom branding",
        "Analytics & Growth Tools",
        "Priority support",
        "API access",
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
        "White-label solution",
        "Priority Encryption",
        "Full Analytics Suite",
        "Dedicated support",
        "SLA guarantees",
      ],
      cta: "Contact Sales",
    },
  ];

  return (
    <ProductPageLayout
      title="Events & Ticketing Platform for"
      titleHighlight="Paid and Free Events"
      subtitle="FLYN AI simplifies your event management — from RSVPs to check-ins to analytics, all in one intelligent event marketing platform."
      features={features}
      pricing={pricing}
    />
  );
};

export default EventsPage;
