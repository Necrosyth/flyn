import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface HeroContent {
  headline: string;
  highlightedText: string;
  subheadline: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
  trustBadges: Array<{ icon: string; text: string }>;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  highlighted: boolean;
  ctaText: string;
}

export interface ModuleContent {
  id: string;
  icon: string;
  title: string;
  features: string[];
  cta: string;
  href: string;
  enabled: boolean;
}

export interface ContactInfo {
  email: string;
  phone: string;
  address: string;
  supportEmail: string;
  salesEmail: string;
  brandEmail: string;
  careersEmail: string;
}

export interface SocialLinks {
  twitter: string;
  linkedin: string;
  instagram: string;
  facebook: string;
  youtube: string;
}

export interface FooterContent {
  ctaHeadline: string;
  ctaHighlightedText: string;
  copyrightText: string;
}

export interface PublicPageContent {
  title: string;
  body: string;
  metaTitle?: string;       // <title> tag — defaults to title if empty
  metaDescription?: string; // <meta name="description">
  ogTitle?: string;         // <meta property="og:title">
  ogDescription?: string;   // <meta property="og:description">
  canonicalUrl?: string;    // <link rel="canonical">
}

export interface LandingContent {
  hero: HeroContent;
  pricing: PricingPlan[];
  modules: ModuleContent[];
  contact: ContactInfo;
  social: SocialLinks;
  footer: FooterContent;
  pages: Record<string, PublicPageContent>;
  siteTitle: string;
  seoDescription: string;
  robotsTxt: string;
}

interface LandingContentContextType {
  content: LandingContent;
  updateHero: (hero: Partial<HeroContent>) => Promise<void>;
  updatePricing: (plans: PricingPlan[]) => Promise<void>;
  updatePricingPlan: (plan: PricingPlan) => Promise<void>;
  addPricingPlan: (plan: Omit<PricingPlan, "id">) => Promise<void>;
  deletePricingPlan: (planId: string) => Promise<void>;
  updateModules: (modules: ModuleContent[]) => Promise<void>;
  updateContact: (contact: Partial<ContactInfo>) => Promise<void>;
  updateSocial: (social: Partial<SocialLinks>) => Promise<void>;
  updateFooter: (footer: Partial<FooterContent>) => Promise<void>;
  updatePage: (pageKey: string, page: Partial<PublicPageContent>) => Promise<void>;
  updateRobotsTxt: (robotsTxt: string) => Promise<void>;
  patchContent: (patch: (current: LandingContent) => LandingContent) => Promise<void>;
  saveToFirebase: (updatedContent: LandingContent) => Promise<void>;
  isLoading: boolean;
  isSaving: boolean;
}

const defaultContent: LandingContent = {
  hero: {
    headline: "One AI Platform to Run",
    highlightedText: "Conversations",
    subheadline: "Events, Communities, and Growth — at Global Scale",
    description: "FLYN AI unifies messaging, events, churches, coaching, automation, billing, and analytics into a single intelligent platform — built for modern organizations that want to scale without complexity.",
    primaryCta: "Start Free Trial",
    secondaryCta: "Request Enterprise Demo",
    trustBadges: [
      { icon: "CreditCard", text: "No credit card required" },
      { icon: "Shield", text: "GDPR & SOC-ready" },
      { icon: "Clock", text: "Live in minutes" },
    ],
  },
  pricing: [
    {
      id: "free",
      name: "Free",
      description: "For individuals getting started",
      monthlyPrice: 0,
      yearlyPrice: 0,
      features: ["Up to 100 messages/month", "1 team member", "Basic inbox", "Email support"],
      highlighted: false,
      ctaText: "Get Started",
    },
    {
      id: "starter",
      name: "Starter",
      description: "For small teams starting out",
      monthlyPrice: 39,
      yearlyPrice: 374,
      features: ["Up to 1,000 messages/month", "2 team members", "Standard channels", "Basic AI tools", "Usage Metering"],
      highlighted: false,
      ctaText: "Start Free Trial",
    },
    {
      id: "growth",
      name: "Growth",
      description: "For scaling operations",
      monthlyPrice: 89,
      yearlyPrice: 854,
      features: ["Up to 5,000 messages/month", "5 team members", "All channels", "AI Agents", "Automation builder"],
      highlighted: true,
      ctaText: "Start Free Trial",
    },
    {
      id: "professional",
      name: "Professional",
      description: "For scaling businesses",
      monthlyPrice: 99,
      yearlyPrice: 1069,
      features: ["Up to 50,000 messages/month", "15 team members", "AI Agents suite", "Telephony/IVR", "Dedicated manager"],
      highlighted: false,
      ctaText: "Start Free Trial",
    },
    {
      id: "enterprise",
      name: "Enterprise",
      description: "For large organizations",
      monthlyPrice: 0,
      yearlyPrice: 0,
      features: ["Unlimited messages", "White-labeling", "SSO/SAML", "Dedicated support", "SLA guarantee"],
      highlighted: false,
      ctaText: "Contact Sales",
    },
  ],
  modules: [
    { id: "inbox", icon: "MessageSquare", title: "Unified Inbox", features: ["WhatsApp, SMS, Email, Voice", "Team assignment", "SLA tracking", "Usage-based controls"], cta: "Explore Inbox", href: "/product/inbox", enabled: true },
    { id: "crm", icon: "Users", title: "CRM", features: ["Contact & pipeline management", "Lead scoring & nurturing", "Deal tracking", "Automated follow-ups"], cta: "Explore CRM", href: "/product/crm", enabled: true },
    { id: "hr", icon: "Briefcase", title: "HR Management", features: ["Employee records & onboarding", "Leave & payroll management", "AI HR assistant", "Performance tracking"], cta: "Explore HR", href: "/product/hr", enabled: true },
    { id: "events", icon: "Calendar", title: "Events & Ticketing", features: ["Free & paid events", "RSVP + check-in", "QR tickets", "Event CRM"], cta: "Explore Events", href: "/product/events", enabled: true },
    { id: "church", icon: "Church", title: "Church Management", features: ["Member management", "Giving & donations", "Groups & attendance", "Multi-church support"], cta: "Explore Church", href: "/product/church", enabled: true },
    { id: "coaches", icon: "GraduationCap", title: "Coaching Platforms", features: ["Coach profiles", "Sessions & scheduling", "Client portals", "Progress tracking"], cta: "Explore Coaches", href: "/product/coaches", enabled: true },
    { id: "telephony", icon: "Phone", title: "Telephony", features: ["AI receptionist", "Call routing & IVR", "Call recording", "Voice analytics"], cta: "Explore Telephony", href: "/product/telephony", enabled: true },
    { id: "ai", icon: "Bot", title: "AI Automation", features: ["AI agents", "Workflow automation", "Smart routing", "Predictive insights"], cta: "Explore AI", href: "/product/ai", enabled: true },
  ],
  contact: {
    email: "hello@flyn.ai",
    phone: "+1 (555) 123-4567",
    address: "123 Innovation Drive, San Francisco, CA 94105",
    supportEmail: "support@flyn.ai",
    salesEmail: "sales@flyn.ai",
    brandEmail: "brand@flyn.ai",
    careersEmail: "careers@flyn.ai",
  },
  social: {
    twitter: "https://twitter.com/flynai",
    linkedin: "https://linkedin.com/company/flynai",
    instagram: "https://instagram.com/flynai",
    facebook: "https://facebook.com/flynai",
    youtube: "https://youtube.com/@flynai",
  },
  footer: {
    ctaHeadline: "Start Running Your Organization Smarter —",
    ctaHighlightedText: "Today",
    copyrightText: "Flyn.AI. All rights reserved.",
  },
  pages: {
    "product": {
      title: "Product",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Explore FLYN AI’s modular platform — unified communications, automation, and insights built for organizations that need to move fast.
    </p>
    <div class="mt-5 grid gap-3 sm:grid-cols-2">
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Unified Inbox</p>
        <p class="mt-1 text-sm text-muted-foreground">One place for WhatsApp, SMS, email, voice, and webchat.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">AI Automation</p>
        <p class="mt-1 text-sm text-muted-foreground">Agents, routing, and workflow automation with human override.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Telephony</p>
        <p class="mt-1 text-sm text-muted-foreground">Call routing, IVR, recording, and AI voice intelligence.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Events & Communities</p>
        <p class="mt-1 text-sm text-muted-foreground">Ticketing, check-ins, groups, and member engagement.</p>
      </div>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">How teams use FLYN AI</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Respond faster with shared inboxes and assignment</li>
      <li>Reduce repetitive work with automation and AI agents</li>
      <li>Measure performance with real-time analytics</li>
      <li>Scale securely with roles, auditability, and tenant boundaries</li>
    </ul>
  </div>
</div>
`,
    },

    "product/inbox": {
      title: "Unified Inbox",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Handle every conversation in one place — assign, collaborate, and resolve with clear ownership.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Channel coverage</h2>
      <p class="mt-2 text-sm text-muted-foreground">Bring WhatsApp, SMS, email, voice, and webchat together with consistent workflows.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Team collaboration</h2>
      <p class="mt-2 text-sm text-muted-foreground">Mentions, internal notes, and assignments keep everyone aligned.</p>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-muted/20 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Built for operations</h2>
    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">SLA & priorities</p>
        <p class="mt-1 text-sm text-muted-foreground">Track response targets with clear severity levels.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Templates</p>
        <p class="mt-1 text-sm text-muted-foreground">Fast replies that stay on-brand.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Auditability</p>
        <p class="mt-1 text-sm text-muted-foreground">Know what changed, when, and by whom.</p>
      </div>
    </div>
  </div>
</div>
`,
    },

    "product/events": {
      title: "Events",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Create free or paid events, send updates, and manage check-ins — with a workflow that scales.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Registration & ticketing</h2>
      <p class="mt-2 text-sm text-muted-foreground">RSVP, payments, confirmations, and reminders — with clean attendee records.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Check-in & operations</h2>
      <p class="mt-2 text-sm text-muted-foreground">QR check-ins, staff roles, and real-time attendance insights.</p>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Tip: connect your inbox channels to send attendee updates where they’re most responsive.</p>
  </div>
</div>
`,
    },

    "product/church": {
      title: "Church",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Manage members, giving, and engagement with modern communication workflows.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">People & groups</h2>
      <p class="mt-2 text-sm text-muted-foreground">Profiles, attendance, groups, and outreach — organized and searchable.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Giving & stewardship</h2>
      <p class="mt-2 text-sm text-muted-foreground">Track giving flows and communications with privacy-conscious defaults.</p>
    </div>
  </div>
</div>
`,
    },

    "product/coaches": {
      title: "Coaches",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Run a coaching business with scheduling, messaging, and automation that keeps clients engaged.
    </p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Client experience</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Centralize conversations and follow-ups</li>
      <li>Automate reminders and onboarding sequences</li>
      <li>Track sessions and outcomes with simple reporting</li>
    </ul>
  </div>
</div>
`,
    },

    "product/ai": {
      title: "AI Automation",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Use AI to handle repetitive conversations and workflows — with clear guardrails, human handoff, and visibility.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">AI agents</h2>
      <p class="mt-2 text-sm text-muted-foreground">Resolve FAQs, collect info, and route to the right team when needed.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Workflow automation</h2>
      <p class="mt-2 text-sm text-muted-foreground">Trigger actions based on message intent, metadata, and events.</p>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Safety: keep humans in the loop for high-impact actions (billing, account changes, sensitive data).
    </p>
  </div>
</div>
`,
    },

    "product/telephony": {
      title: "Telephony",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      A modern voice layer for your operations — route calls, record key interactions, and understand outcomes.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Routing & IVR</h2>
      <p class="mt-2 text-sm text-muted-foreground">Direct callers to the right team with rules and schedules.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Recording & insights</h2>
      <p class="mt-2 text-sm text-muted-foreground">Capture context, review performance, and improve quality.</p>
    </div>
  </div>
</div>
`,
    },

    "product/analytics": {
      title: "Analytics & Billing",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Track performance, usage, and costs with dashboards designed for operators — not analysts.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Real-time reporting</h2>
      <p class="mt-2 text-sm text-muted-foreground">Response time, resolution, volume, and team activity in one view.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Usage visibility</h2>
      <p class="mt-2 text-sm text-muted-foreground">Understand message/call usage and plan capacity confidently.</p>
    </div>
  </div>
</div>
`,
    },

    "features/ai-agents": {
      title: "AI Agents",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Deploy AI agents that handle common requests, gather context, and hand off to humans with full conversation history.
    </p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Key capabilities</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Intent detection and structured data capture</li>
      <li>Smart escalation to the right team</li>
      <li>Guardrails and confidence thresholds</li>
      <li>Audit-friendly logs</li>
    </ul>
  </div>
</div>
`,
    },
    "features/automation": {
      title: "Automation",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Automate routing, follow-ups, and workflows across teams — without losing control.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Triggers</h2>
      <p class="mt-2 text-sm text-muted-foreground">Message intent, tags, customer attributes, and time-based rules.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Actions</h2>
      <p class="mt-2 text-sm text-muted-foreground">Assign, notify, respond, create tasks, and enrich records.</p>
    </div>
  </div>
</div>
`,
    },
    "features/security": {
      title: "Enterprise Security",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Security features designed for enterprise requirements — access controls, auditability, and operational safeguards.
    </p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Highlights</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Roles & permissions</li>
      <li>Workspace boundaries</li>
      <li>Monitoring and incident response</li>
      <li>Secure-by-default data handling</li>
    </ul>
  </div>
</div>
`,
    },
    "features/analytics": {
      title: "Analytics",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Dashboards that make performance obvious — response times, resolution, volume, and trends.
    </p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">What you can measure</h2>
    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Speed</p>
        <p class="mt-1 text-sm text-muted-foreground">First response and resolution times.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Quality</p>
        <p class="mt-1 text-sm text-muted-foreground">Escalations, reopen rates, and outcomes.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Volume</p>
        <p class="mt-1 text-sm text-muted-foreground">Messages/calls by channel and time.</p>
      </div>
    </div>
  </div>
</div>
`,
    },
    "features/channels": {
      title: "Multiple Channels",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Meet customers where they are — manage messages and calls across channels with consistent routing and reporting.
    </p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Common channels</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>WhatsApp</li>
      <li>SMS</li>
      <li>Email</li>
      <li>Voice</li>
      <li>Instagram</li>
      <li>Webchat</li>
    </ul>
  </div>
</div>
`,
    },

    "brand": {
      title: "Brand Assets",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Use these guidelines to keep FLYN AI branding consistent across campaigns, partner pages, and press mentions.
    </p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Usage guidelines</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Do not modify the logo proportions</li>
      <li>Maintain clear spacing around marks</li>
      <li>Use brand colors from the official palette</li>
      <li>Do not place the logo on low-contrast backgrounds</li>
    </ul>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Need official files? Contact <span class="text-foreground">brand@flyn.ai</span>.</p>
  </div>
</div>
`,
    },
    "customers": {
      title: "Customers",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Teams use FLYN AI to run support, operations, events, and communities — with reliable automation and clear reporting.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What customers value</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Faster response times and clear ownership</li>
        <li>Fewer manual steps through automation</li>
        <li>Centralized visibility into performance</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Common use cases</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Multi-channel customer support</li>
        <li>Event registration and attendee comms</li>
        <li>Community engagement workflows</li>
      </ul>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Want a reference call? Email <span class="text-foreground">sales@flyn.ai</span>.</p>
  </div>
</div>
`,
    },
    "events": {
      title: "Events",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      See what’s happening at FLYN AI — webinars, community sessions, product updates, and partner events.
    </p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Upcoming</h2>
    <div class="mt-4 grid gap-3">
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Product walkthrough</p>
        <p class="mt-1 text-sm text-muted-foreground">A guided tour of inbox, automation, and analytics.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Automation clinic</p>
        <p class="mt-1 text-sm text-muted-foreground">Best practices for routing, SLAs, and handoffs.</p>
      </div>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Want to host a session with us? Email <span class="text-foreground">hello@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "about": {
      title: "About us",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      FLYN AI is building practical automation for modern operations — combining unified communications, AI, and analytics in one platform.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What we believe</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Operators deserve tools that are fast, simple, and reliable</li>
        <li>AI should be useful, observable, and controllable</li>
        <li>Security and privacy are non-negotiable defaults</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What we build</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Multi-channel inbox + assignment workflows</li>
        <li>Automation and AI agents with safe handoffs</li>
        <li>Telephony and voice workflows</li>
        <li>Reporting built for real teams</li>
      </ul>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Want to learn more? Reach us at <span class="text-foreground">hello@flyn.ai</span>.
    </p>
  </div>
</div>
`,
    },

    "legal/privacy": {
      title: "Privacy Policy",
      body: `
<div class="space-y-8">
  <div class="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p class="text-sm text-muted-foreground">Effective date</p>
      <div class="inline-flex items-center rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
        [Month Day, Year]
      </div>
    </div>
    <p class="mt-3 text-sm sm:text-base text-muted-foreground">
      This Privacy Policy explains how <span class="text-foreground font-medium">FLYN AI</span> ("we", "us", "our") collects, uses,
      and protects information when you use our websites, applications, and services (the "Services").
    </p>
  </div>

  <div class="space-y-6">
    <div>
      <h2 class="text-xl sm:text-2xl font-display font-semibold text-foreground">What we collect</h2>
      <p class="mt-2 text-muted-foreground">We collect information to operate the Services reliably and securely.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Account information</p>
        <p class="mt-1 text-sm text-muted-foreground">Name, email, organization details, role, and authentication data.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Usage & device data</p>
        <p class="mt-1 text-sm text-muted-foreground">Feature usage, logs, device/browser information, and performance metrics.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Communications</p>
        <p class="mt-1 text-sm text-muted-foreground">Support tickets, emails, and other messages you send to us.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Customer Data</p>
        <p class="mt-1 text-sm text-muted-foreground">Content you or your users submit to the Services while using the product.</p>
      </div>
    </div>
  </div>

  <div class="space-y-4">
    <h2 class="text-xl sm:text-2xl font-display font-semibold text-foreground">How we use information</h2>
    <ul class="list-disc pl-5 space-y-2 text-muted-foreground">
      <li>Provide, maintain, and improve the Services</li>
      <li>Secure the platform, prevent fraud/abuse, and enforce our terms</li>
      <li>Communicate service notices, support updates, and product changes</li>
      <li>Analyze usage to improve reliability, performance, and user experience</li>
      <li>Comply with legal obligations</li>
    </ul>
  </div>

  <div class="space-y-4">
    <h2 class="text-xl sm:text-2xl font-display font-semibold text-foreground">How we share information</h2>
    <p class="text-muted-foreground">We do not sell personal information. We may share information with:</p>
    <ul class="list-disc pl-5 space-y-2 text-muted-foreground">
      <li>Service providers (hosting, analytics, customer support tools) under contractual safeguards</li>
      <li>Partners and integrations you enable (only as directed by you)</li>
      <li>Authorities or third parties when required by law or to protect rights, safety, and security</li>
    </ul>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-xl border border-border bg-muted/20 p-4">
      <h3 class="font-medium text-foreground">Cookies & analytics</h3>
      <p class="mt-1 text-sm text-muted-foreground">
        We use cookies and similar technologies to keep you signed in, remember preferences, and understand usage.
      </p>
    </div>
    <div class="rounded-xl border border-border bg-muted/20 p-4">
      <h3 class="font-medium text-foreground">Retention</h3>
      <p class="mt-1 text-sm text-muted-foreground">
        We retain information as long as needed to provide the Services and for legitimate business and legal purposes.
      </p>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <h3 class="font-medium text-foreground">Questions?</h3>
    <p class="mt-1 text-sm text-muted-foreground">
      Contact our privacy team at <span class="text-foreground">privacy@flyn.ai</span>.
    </p>
  </div>
</div>
`,
    },
    "legal/security": {
      title: "Security",
      body: `
<div class="space-y-8">
  <div class="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
    <p class="text-muted-foreground">
      Security is built into how we design, build, and operate FLYN AI. This page highlights our approach at a high level.
      For detailed questionnaires or enterprise reviews, contact <span class="text-foreground">security@flyn.ai</span>.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Platform protections</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li><span class="text-foreground font-medium">Encryption in transit</span> via HTTPS/TLS</li>
        <li><span class="text-foreground font-medium">Encryption at rest</span> where supported by underlying systems</li>
        <li><span class="text-foreground font-medium">Access control</span> with roles, least privilege, and audit trails</li>
        <li><span class="text-foreground font-medium">Logging & monitoring</span> to detect anomalies</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Operational security</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>Secure SDLC and review practices</li>
        <li>Dependency and vulnerability management</li>
        <li>Backups and disaster recovery procedures</li>
        <li>Incident response process with escalation and post-incident review</li>
      </ul>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-muted/20 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Data handling</h2>
    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Tenant boundaries</p>
        <p class="mt-1 text-sm text-muted-foreground">Customer data is logically segmented by organization/workspace.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Admin access</p>
        <p class="mt-1 text-sm text-muted-foreground">Restricted, reviewed, and audited for sensitive operations.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Retention</p>
        <p class="mt-1 text-sm text-muted-foreground">Aligned to operational needs, security, and legal requirements.</p>
      </div>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-primary/5 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Report a vulnerability</h2>
    <p class="mt-2 text-sm text-muted-foreground">
      Email <span class="text-foreground">security@flyn.ai</span> with details and steps to reproduce.
      Please avoid public disclosure until we’ve investigated.
    </p>
  </div>
</div>
`,
    },
    "legal/terms": {
      title: "Terms of Service",
      body: `
<div class="space-y-8">
  <div class="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p class="text-sm text-muted-foreground">Last updated</p>
      <div class="inline-flex items-center rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
        [Month Day, Year]
      </div>
    </div>
    <p class="mt-3 text-muted-foreground">
      These Terms govern your access to and use of the Services. If you use FLYN AI, you agree to these Terms.
    </p>
  </div>

  <div class="grid gap-4">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Accounts</h2>
      <p class="mt-2 text-sm text-muted-foreground">
        You’re responsible for safeguarding credentials and for activity under your account.
      </p>
    </div>

    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Acceptable use</h2>
      <p class="mt-2 text-sm text-muted-foreground">You agree not to misuse the Services, including:</p>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Attempting to gain unauthorized access to systems or data</li>
        <li>Transmitting malware, spam, or abusive content</li>
        <li>Interfering with normal operation or performance</li>
        <li>Using the Services in violation of applicable laws</li>
      </ul>
    </div>

    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Customer Data</h2>
      <p class="mt-2 text-sm text-muted-foreground">
        You retain ownership of Customer Data. We process Customer Data to provide the Services and improve reliability,
        as described in our Privacy Policy.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-2xl border border-border bg-card p-5">
        <h2 class="text-lg font-display font-semibold text-foreground">Billing</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Paid plans are billed as described at checkout or in an order form. Fees are non-refundable except where required by law.
        </p>
      </div>
      <div class="rounded-2xl border border-border bg-card p-5">
        <h2 class="text-lg font-display font-semibold text-foreground">Third-party services</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          If you connect integrations, their terms and privacy policies govern your use of those services.
        </p>
      </div>
    </div>

    <div class="rounded-2xl border border-border bg-muted/20 p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Warranty disclaimer & liability</h2>
      <p class="mt-2 text-sm text-muted-foreground">
        The Services are provided “as is” and “as available”. To the maximum extent permitted by law, FLYN AI disclaims warranties
        and limits liability for indirect or consequential damages.
      </p>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Questions about these Terms? Email <span class="text-foreground">contact@flyn.ai</span>.
    </p>
  </div>
</div>
`,
    },
    "company": {
      title: "Our Company",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      FLYN AI is building an operating system for modern organizations — unified messaging, automation, analytics, and workflows in one place.
    </p>
    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="text-xs text-muted-foreground">Mission</p>
        <p class="mt-1 font-medium text-foreground">Run conversations & operations at global scale</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="text-xs text-muted-foreground">Built for</p>
        <p class="mt-1 font-medium text-foreground">Teams that need speed, control, and reliability</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="text-xs text-muted-foreground">Focus</p>
        <p class="mt-1 font-medium text-foreground">Security, uptime, and a clean operator experience</p>
      </div>
    </div>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What we believe</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li><span class="text-foreground font-medium">Reliability</span> — workflows must work when it matters</li>
        <li><span class="text-foreground font-medium">Simplicity</span> — powerful doesn’t need to be complicated</li>
        <li><span class="text-foreground font-medium">Security</span> — trust is earned with strong controls</li>
        <li><span class="text-foreground font-medium">Customer-first</span> — we build with feedback</li>
      </ul>
    </div>

    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What we do</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>Unified Inbox across channels</li>
        <li>Automation and AI to reduce repetitive work</li>
        <li>Analytics for visibility and growth</li>
        <li>Tools for events, communities, and operational teams</li>
      </ul>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-muted/20 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Global by design</h2>
    <p class="mt-2 text-sm text-muted-foreground">
      We support distributed teams, multi-region operations, and organizations serving customers across time zones.
    </p>
  </div>
</div>
`,
    },
    "contact": {
      title: "Contact Us",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      We’d love to hear from you. Choose the best channel below and we’ll route your request to the right team.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Sales</h2>
      <p class="mt-2 text-sm text-muted-foreground">Demos, enterprise pricing, and procurement.</p>
      <div class="mt-3 rounded-xl border border-border bg-muted/20 p-4">
        <p class="text-sm text-muted-foreground">Email</p>
        <p class="mt-1 font-medium text-foreground">sales@flyn.ai</p>
      </div>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Support</h2>
      <p class="mt-2 text-sm text-muted-foreground">Product issues, troubleshooting, and account help.</p>
      <div class="mt-3 rounded-xl border border-border bg-muted/20 p-4">
        <p class="text-sm text-muted-foreground">Email</p>
        <p class="mt-1 font-medium text-foreground">support@flyn.ai</p>
      </div>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Security</h2>
      <p class="mt-2 text-sm text-muted-foreground">Report vulnerabilities or request security docs.</p>
      <div class="mt-3 rounded-xl border border-border bg-muted/20 p-4">
        <p class="text-sm text-muted-foreground">Email</p>
        <p class="mt-1 font-medium text-foreground">security@flyn.ai</p>
      </div>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Partnerships</h2>
      <p class="mt-2 text-sm text-muted-foreground">Integrations, resellers, and strategic partnerships.</p>
      <div class="mt-3 rounded-xl border border-border bg-muted/20 p-4">
        <p class="text-sm text-muted-foreground">Email</p>
        <p class="mt-1 font-medium text-foreground">partners@flyn.ai</p>
      </div>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-muted/20 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">What to include</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Your organization name</li>
      <li>Short description of the request</li>
      <li>Screenshots/logs (if applicable)</li>
      <li>Best contact details and time zone</li>
    </ul>
  </div>
</div>
`,
    },
    "blog": {
      title: "Blog",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Updates, product notes, and practical playbooks from the team building FLYN AI.
    </p>
    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Releases</p>
        <p class="mt-1 text-sm text-muted-foreground">New features and improvements.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">Guides</p>
        <p class="mt-1 text-sm text-muted-foreground">Best practices for support and operations.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">AI Playbooks</p>
        <p class="mt-1 text-sm text-muted-foreground">Automation patterns that scale.</p>
      </div>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Topics we cover</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Omnichannel messaging operations</li>
      <li>Automation workflows and AI agent design</li>
      <li>Analytics, quality, and performance</li>
      <li>Security and reliability best practices</li>
    </ul>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Want a topic covered? Send suggestions to <span class="text-foreground">marketing@flyn.ai</span>.
    </p>
  </div>
</div>
`,
    },
    "jobs": {
      title: "Jobs",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      We’re building a high-trust team focused on product quality, customer outcomes, and strong engineering fundamentals.
    </p>
    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="text-xs text-muted-foreground">Culture</p>
        <p class="mt-1 font-medium text-foreground">High ownership</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="text-xs text-muted-foreground">Principle</p>
        <p class="mt-1 font-medium text-foreground">Security & reliability first</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="text-xs text-muted-foreground">Work style</p>
        <p class="mt-1 font-medium text-foreground">Remote-friendly</p>
      </div>
    </div>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">How we work</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>Remote-friendly and async-first where possible</li>
        <li>Clear ownership and fast iteration</li>
        <li>Quality, security, and reliability are non-negotiable</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Teams we hire for</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>Engineering (frontend, backend, platform)</li>
        <li>Product and design</li>
        <li>Customer success and support</li>
        <li>Sales and partnerships</li>
      </ul>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-muted/20 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">How to apply</h2>
    <p class="mt-2 text-sm text-muted-foreground">
      Email <span class="text-foreground">careers@flyn.ai</span> with your resume/LinkedIn and links to work you’re proud of.
    </p>
  </div>
</div>
`,
    },
    "support/global": {
      title: "Global Support",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      FLYN AI Support helps you keep critical conversations and workflows running reliably.
    </p>
    <div class="mt-4 rounded-xl border border-border bg-background/40 p-4">
      <p class="text-xs text-muted-foreground">Primary contact</p>
      <p class="mt-1 font-medium text-foreground">support@flyn.ai</p>
    </div>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What we can help with</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Access and account issues</li>
        <li>Product troubleshooting and bug reports</li>
        <li>Integration and configuration guidance</li>
        <li>Best practices for setup and workflows</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What to include</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Organization name</li>
        <li>Affected users/workspace</li>
        <li>Impact, urgency, and deadline</li>
        <li>Steps to reproduce and screenshots/logs</li>
      </ul>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-muted/20 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Priority guidelines</h2>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">P1</p>
        <p class="mt-1 text-sm text-muted-foreground">Service unavailable or critical business impact.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">P2</p>
        <p class="mt-1 text-sm text-muted-foreground">Major feature degraded or large-scale impact.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">P3</p>
        <p class="mt-1 text-sm text-muted-foreground">Non-critical issue with workaround available.</p>
      </div>
      <div class="rounded-xl border border-border bg-background/40 p-4">
        <p class="font-medium text-foreground">P4</p>
        <p class="mt-1 text-sm text-muted-foreground">Questions, requests, and general guidance.</p>
      </div>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Escalation: For urgent incidents, add <span class="text-foreground font-medium">P1</span> in the subject line and include a callback number.
    </p>
  </div>
</div>
`,
    },
    "support/africa": {
      title: "Africa Support",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Regional support for Africa focuses on timely assistance during local business hours, with clear escalation for critical incidents.
    </p>
    <div class="mt-4 rounded-xl border border-border bg-background/40 p-4">
      <p class="text-xs text-muted-foreground">Email</p>
      <p class="mt-1 font-medium text-foreground">support@flyn.ai</p>
      <p class="mt-1 text-xs text-muted-foreground">Use subject prefix: <span class="text-foreground">AFRICA</span></p>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Recommended details</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Country and time zone</li>
      <li>WhatsApp/SMS number (if relevant)</li>
      <li>Impact level (P1–P4) and any deadlines</li>
      <li>Steps to reproduce and screenshots/logs</li>
    </ul>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Escalation: For urgent incidents, include <span class="text-foreground font-medium">P1</span> in the subject line and provide a callback number.
    </p>
  </div>
</div>
`,
    },
    "support/north-america": {
      title: "North America Support",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Regional support for North America helps teams operating across multiple time zones with consistent troubleshooting and escalation.
    </p>
    <div class="mt-4 rounded-xl border border-border bg-background/40 p-4">
      <p class="text-xs text-muted-foreground">Email</p>
      <p class="mt-1 font-medium text-foreground">support@flyn.ai</p>
      <p class="mt-1 text-xs text-muted-foreground">Use subject prefix: <span class="text-foreground">NA</span></p>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">What to include</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Organization name and admin email</li>
      <li>Affected workspace/module</li>
      <li>Steps to reproduce and screenshots/logs</li>
      <li>Impact level (P1–P4)</li>
    </ul>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Escalation: For critical incidents, use subject prefix <span class="text-foreground font-medium">P1</span> and provide a phone number for real-time coordination.
    </p>
  </div>
</div>
`,
    },
    "support/uae": {
      title: "UAE Support",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Regional support for UAE is designed for fast response during local business hours and clear escalation for critical issues.
    </p>
    <div class="mt-4 rounded-xl border border-border bg-background/40 p-4">
      <p class="text-xs text-muted-foreground">Email</p>
      <p class="mt-1 font-medium text-foreground">support@flyn.ai</p>
      <p class="mt-1 text-xs text-muted-foreground">Use subject prefix: <span class="text-foreground">UAE</span></p>
    </div>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Escalation</h2>
    <p class="mt-2 text-sm text-muted-foreground">
      For urgent incidents, include <span class="text-foreground font-medium">P1</span> in the subject line and provide a callback number.
    </p>
  </div>
</div>
`,
    },
    "support/knowledge-base": {
      title: "Knowledge Base",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Find answers, guides, and setup checklists — built for operators.</p>
  </div>

  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Common topics</h2>
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Getting started</p>
        <p class="mt-1 text-sm text-muted-foreground">Workspace setup, roles, and first channel connection.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Channels & integrations</p>
        <p class="mt-1 text-sm text-muted-foreground">WhatsApp, SMS, email, voice, webchat, and external tools.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Automation & AI</p>
        <p class="mt-1 text-sm text-muted-foreground">Workflows, routing, AI agents, and best practices.</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Billing & usage</p>
        <p class="mt-1 text-sm text-muted-foreground">Plans, limits, invoices, and metered usage.</p>
      </div>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Need help right now? Email <span class="text-foreground">support@flyn.ai</span> with a short description and screenshots.
    </p>
  </div>
</div>
`,
    },

    // ── Static pages ──────────────────────────────────────────────────────────

    "demo": {
      title: "Request a Demo",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      See FLYN AI in action — a live walkthrough tailored to your team's use case, with time for questions.
    </p>
  </div>
  <div class="grid gap-4 sm:grid-cols-3">
    <div class="rounded-2xl border border-border bg-card p-5">
      <p class="font-medium text-foreground">Unified Inbox</p>
      <p class="mt-1 text-sm text-muted-foreground">Multi-channel messaging, assignment, and SLA tracking.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <p class="font-medium text-foreground">AI Automation</p>
      <p class="mt-1 text-sm text-muted-foreground">Agents, routing, and workflow automation with human handoff.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <p class="font-medium text-foreground">Analytics</p>
      <p class="mt-1 text-sm text-muted-foreground">Real-time performance dashboards for operations teams.</p>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">
      Email <span class="text-foreground">sales@flyn.ai</span> to schedule your demo session.
    </p>
  </div>
</div>
`,
    },

    "pricing": {
      title: "Pricing",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      Start free. Scale as you grow. Enterprise contracts available for large organizations.
    </p>
  </div>
  <div class="grid gap-4 sm:grid-cols-3">
    <div class="rounded-2xl border border-border bg-card p-5">
      <p class="font-semibold text-foreground text-lg">Free</p>
      <p class="mt-1 text-2xl font-bold text-foreground">$0<span class="text-sm font-normal text-muted-foreground">/mo</span></p>
      <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
        <li>Up to 100 messages/month</li>
        <li>1 team member</li>
        <li>Basic inbox</li>
        <li>Email support</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-primary bg-primary/5 p-5 ring-1 ring-primary">
      <p class="font-semibold text-foreground text-lg">Pro</p>
      <p class="mt-1 text-2xl font-bold text-foreground">$49<span class="text-sm font-normal text-muted-foreground">/mo</span></p>
      <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
        <li>10,000 messages/month</li>
        <li>Up to 10 team members</li>
        <li>All channels + AI agents</li>
        <li>Priority support</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <p class="font-semibold text-foreground text-lg">Enterprise</p>
      <p class="mt-1 text-2xl font-bold text-foreground">Custom</p>
      <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
        <li>Unlimited messages</li>
        <li>Unlimited team members</li>
        <li>Custom integrations + SLA</li>
        <li>Dedicated support</li>
      </ul>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Questions about pricing? Email <span class="text-foreground">sales@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    // ── Product sub-pages ─────────────────────────────────────────────────────

    "product/unified-inbox": {
      title: "Unified Inbox",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">One inbox for WhatsApp, SMS, email, voice, and webchat — with clear ownership and SLA tracking.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Team collaboration</h2>
      <p class="mt-2 text-sm text-muted-foreground">Assignments, mentions, and internal notes keep everyone aligned.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">SLA & priorities</h2>
      <p class="mt-2 text-sm text-muted-foreground">Track response targets with severity levels and automated escalation.</p>
    </div>
  </div>
</div>
`,
    },

    "product/ai-agents": {
      title: "AI Agents",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Deploy AI agents that handle common requests and hand off to humans with full conversation history.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Intent detection</h2>
      <p class="mt-2 text-sm text-muted-foreground">Understand what customers need and route accurately.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Safe escalation</h2>
      <p class="mt-2 text-sm text-muted-foreground">Guardrails and confidence thresholds control when humans step in.</p>
    </div>
  </div>
</div>
`,
    },

    "product/crm": {
      title: "CRM",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">A CRM built around conversations — contacts, pipelines, and engagement history in one view.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Contact intelligence</h2>
      <p class="mt-2 text-sm text-muted-foreground">Profile enrichment, tags, segmentation, and interaction history.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Pipeline tracking</h2>
      <p class="mt-2 text-sm text-muted-foreground">Move deals through stages with automation triggers at every step.</p>
    </div>
  </div>
</div>
`,
    },

    "product/automation": {
      title: "Automation",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Automate routing, follow-ups, and multi-step workflows — without losing visibility.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Visual builder</h2>
      <p class="mt-2 text-sm text-muted-foreground">Build workflows with a drag-and-drop canvas — no code required.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Triggers & actions</h2>
      <p class="mt-2 text-sm text-muted-foreground">Message intent, tags, attributes, schedules, and webhook events.</p>
    </div>
  </div>
</div>
`,
    },

    "product/security": {
      title: "Security",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Enterprise-grade security features built into every layer of the platform.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Access controls</h2>
      <p class="mt-2 text-sm text-muted-foreground">Roles, permissions, workspace boundaries, and audit trails.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Data protection</h2>
      <p class="mt-2 text-sm text-muted-foreground">Encryption in transit and at rest, with tenant-level isolation.</p>
    </div>
  </div>
</div>
`,
    },

    "product/billing-usage": {
      title: "Billing & Usage",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Transparent billing and real-time usage visibility — no surprises at month end.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Usage dashboard</h2>
      <p class="mt-2 text-sm text-muted-foreground">Track messages, calls, and API usage in real time.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Plan management</h2>
      <p class="mt-2 text-sm text-muted-foreground">Upgrade, downgrade, or add seats without contacting sales.</p>
    </div>
  </div>
</div>
`,
    },

    "product/hr": {
      title: "HR Management",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">
      A complete HR suite — employee records, leave management, payroll, onboarding, and an AI-powered HR assistant built for modern teams.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Employee records</h2>
      <p class="mt-2 text-sm text-muted-foreground">Centralized profiles with documents, roles, and history — searchable and always up to date.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Leave & attendance</h2>
      <p class="mt-2 text-sm text-muted-foreground">Approve leave requests, track balances, and view attendance in one dashboard.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Payroll management</h2>
      <p class="mt-2 text-sm text-muted-foreground">Run payroll with deductions, bonuses, and audit-ready records — no spreadsheets needed.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">AI HR assistant</h2>
      <p class="mt-2 text-sm text-muted-foreground">Ask HR questions, generate offer letters, policies, and reports instantly.</p>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Onboarding workflows, performance reviews, and team communication — all connected to your inbox channels.</p>
  </div>
</div>
`,
    },

    // ── Company sub-pages ─────────────────────────────────────────────────────

    "company/about": {
      title: "About FLYN AI",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">FLYN AI is building practical automation for modern operations — unified communications, AI, and analytics in one platform.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What we believe</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Operators deserve fast, simple, reliable tools</li>
        <li>AI should be observable and controllable</li>
        <li>Security and privacy are non-negotiable defaults</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What we build</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Multi-channel inbox + assignment workflows</li>
        <li>Automation and AI agents with safe handoffs</li>
        <li>Reporting built for real teams</li>
      </ul>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Reach us at <span class="text-foreground">hello@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "company/careers": {
      title: "Careers",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">We're building a high-trust team focused on product quality, customer outcomes, and strong engineering fundamentals.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">How we work</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>Remote-friendly and async-first</li>
        <li>Clear ownership and fast iteration</li>
        <li>Quality and reliability are non-negotiable</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Open roles</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>Engineering (frontend, backend, platform)</li>
        <li>Product and design</li>
        <li>Customer success and sales</li>
      </ul>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Apply by emailing <span class="text-foreground">careers@flyn.ai</span> with your resume and links to work you're proud of.</p>
  </div>
</div>
`,
    },

    "company/customers": {
      title: "Customers",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Teams use FLYN AI to run support, operations, events, and communities — with reliable automation and clear reporting.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Common use cases</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Multi-channel customer support</li>
        <li>Event registration and attendee comms</li>
        <li>Community engagement workflows</li>
        <li>Church and coaching operations</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">What customers value</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>Faster response with clear ownership</li>
        <li>Fewer manual steps through automation</li>
        <li>Centralized performance visibility</li>
      </ul>
    </div>
  </div>
</div>
`,
    },

    "company/case-studies": {
      title: "Case Studies",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Real outcomes from teams using FLYN AI to streamline operations and improve customer experience.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Coming soon</h2>
    <p class="mt-2 text-sm text-muted-foreground">We're documenting detailed case studies with our customers. Check back soon or reach out to speak with a reference.</p>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Interested in a reference call? Email <span class="text-foreground">sales@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "company/partners": {
      title: "Partners",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">We partner with resellers, system integrators, and technology companies to extend FLYN AI's reach.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Reseller program</h2>
      <p class="mt-2 text-sm text-muted-foreground">Sell and support FLYN AI for your customers with co-selling support and margins.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Technology partners</h2>
      <p class="mt-2 text-sm text-muted-foreground">Build integrations and workflows on top of FLYN AI's platform APIs.</p>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Interested in partnering? Email <span class="text-foreground">partners@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "company/security": {
      title: "Security",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Security is built into how we design, build, and operate FLYN AI. This page gives an overview of our approach.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Platform protections</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>HTTPS/TLS encryption in transit</li>
        <li>Encryption at rest</li>
        <li>Role-based access with audit trails</li>
        <li>Tenant-level data isolation</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Operational security</h2>
      <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
        <li>Secure SDLC and code review</li>
        <li>Dependency scanning</li>
        <li>Incident response procedures</li>
        <li>Regular backups and recovery testing</li>
      </ul>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Report a vulnerability to <span class="text-foreground">security@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    // ── Channel pages ─────────────────────────────────────────────────────────

    "channels/whatsapp": {
      title: "WhatsApp",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Connect WhatsApp Business to FLYN AI — handle conversations, send campaigns, and automate responses at scale.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Inbound & outbound</h2>
      <p class="mt-2 text-sm text-muted-foreground">Manage customer replies in the unified inbox and send proactive messages with approved templates.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Automation</h2>
      <p class="mt-2 text-sm text-muted-foreground">Trigger workflows based on WhatsApp messages, buttons, and list responses.</p>
    </div>
  </div>
</div>
`,
    },

    "channels/sms": {
      title: "SMS",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Send and receive SMS with the same workflows you use for every other channel — no context switching.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Key capabilities</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Two-way SMS in the unified inbox</li>
      <li>Broadcast campaigns to contact lists</li>
      <li>Automation triggers on incoming messages</li>
      <li>Delivery tracking and opt-out handling</li>
    </ul>
  </div>
</div>
`,
    },

    "channels/voice": {
      title: "Voice",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">A modern voice layer — route calls, record interactions, and understand outcomes with AI-powered analytics.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Call routing & IVR</h2>
      <p class="mt-2 text-sm text-muted-foreground">Direct callers to the right team with rules, schedules, and AI routing.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Recording & transcription</h2>
      <p class="mt-2 text-sm text-muted-foreground">Capture and review calls with AI-generated summaries.</p>
    </div>
  </div>
</div>
`,
    },

    "channels/email": {
      title: "Email",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Manage email conversations alongside every other channel — same assignment, routing, and reporting.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Shared inbox</h2>
      <p class="mt-2 text-sm text-muted-foreground">Team-wide visibility with clear ownership and no email forwarding chains.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Automations</h2>
      <p class="mt-2 text-sm text-muted-foreground">Auto-assign, tag, and respond based on subject, sender, or content.</p>
    </div>
  </div>
</div>
`,
    },

    "channels/instagram": {
      title: "Instagram",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Handle Instagram DMs and comments from the unified inbox — respond faster and keep conversations organized.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">What's included</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Instagram DM inbox integration</li>
      <li>Team assignment and internal notes</li>
      <li>Automation triggers on messages</li>
    </ul>
  </div>
</div>
`,
    },

    "channels/webchat": {
      title: "Webchat",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Embed a live chat widget on your website — route conversations to the right team or hand off to AI.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Easy setup</h2>
      <p class="mt-2 text-sm text-muted-foreground">One script tag — no backend changes required.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">AI-first option</h2>
      <p class="mt-2 text-sm text-muted-foreground">Deploy an AI agent to handle common queries before routing to a human.</p>
    </div>
  </div>
</div>
`,
    },

    "channels/telegram": {
      title: "Telegram",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Connect a Telegram bot to FLYN AI and manage conversations with the same workflows as every other channel.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">What's included</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Telegram bot message routing</li>
      <li>Unified inbox with assignment</li>
      <li>Automation triggers on incoming messages</li>
    </ul>
  </div>
</div>
`,
    },

    "channels/facebook": {
      title: "Facebook",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Handle Facebook Messenger conversations in the FLYN AI inbox — same routing, assignment, and reporting.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">What's included</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Facebook Messenger integration</li>
      <li>Shared team inbox with ownership</li>
      <li>Automation based on message content</li>
    </ul>
  </div>
</div>
`,
    },

    // ── Solutions pages ───────────────────────────────────────────────────────

    "solutions/sales": {
      title: "Sales Teams",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Give your sales team a unified view of prospects across every channel — with automation that keeps follow-ups on track.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Pipeline automation</h2>
      <p class="mt-2 text-sm text-muted-foreground">Move leads through stages automatically based on responses and activity.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Multi-channel outreach</h2>
      <p class="mt-2 text-sm text-muted-foreground">WhatsApp, email, and SMS sequences in one workflow.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/customer-support": {
      title: "Customer Support",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Resolve customer issues faster with a shared inbox, smart routing, and AI that handles tier-1 queries automatically.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">SLA tracking</h2>
      <p class="mt-2 text-sm text-muted-foreground">Monitor response and resolution targets in real time.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">AI deflection</h2>
      <p class="mt-2 text-sm text-muted-foreground">Let AI answer common questions before escalating to your team.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/event-marketing": {
      title: "Event Marketing",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Promote events, manage registrations, and keep attendees engaged — all from one platform.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Campaign automation</h2>
      <p class="mt-2 text-sm text-muted-foreground">Pre-event reminders, day-of updates, and post-event follow-ups on autopilot.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Registration CRM</h2>
      <p class="mt-2 text-sm text-muted-foreground">Track who registered, who attended, and who needs follow-up.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/community-engagement": {
      title: "Community Engagement",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Keep your community connected — broadcast updates, manage groups, and automate member touchpoints.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">What FLYN AI provides</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Broadcast messaging via WhatsApp and SMS</li>
      <li>Member segmentation and tagging</li>
      <li>Automated onboarding and re-engagement sequences</li>
    </ul>
  </div>
</div>
`,
    },

    "solutions/ai-customer-agents": {
      title: "AI Customer Agents",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Deploy AI agents that handle queries 24/7 — with safe escalation and full conversation context on handoff.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Intent handling</h2>
      <p class="mt-2 text-sm text-muted-foreground">Understand what customers need and respond accurately.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Safe escalation</h2>
      <p class="mt-2 text-sm text-muted-foreground">Confidence thresholds and guardrails control when humans step in.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/churches": {
      title: "Churches",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Manage members, giving, events, and pastoral communications in one platform built for ministry teams.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Member management</h2>
      <p class="mt-2 text-sm text-muted-foreground">Profiles, groups, attendance, and giving — organized and searchable.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Communications</h2>
      <p class="mt-2 text-sm text-muted-foreground">Send announcements via WhatsApp, SMS, and email from one place.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/events": {
      title: "Events & Ticketing",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Run free and paid events with registration, QR check-in, and attendee communication built in.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Registration & ticketing</h2>
      <p class="mt-2 text-sm text-muted-foreground">RSVP, payments, confirmations, and reminders in one workflow.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Check-in & ops</h2>
      <p class="mt-2 text-sm text-muted-foreground">QR check-ins, staff roles, and real-time attendance insights.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/coaches": {
      title: "Coaches & Trainers",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Run a coaching business with scheduling, messaging, and automation that keeps clients engaged.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Client management</h2>
      <p class="mt-2 text-sm text-muted-foreground">Profiles, session history, and follow-up tracking in one place.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Automated sequences</h2>
      <p class="mt-2 text-sm text-muted-foreground">Onboarding, reminders, and check-ins on autopilot.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/enterprises": {
      title: "Enterprise",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Enterprise-grade security, SLAs, and multi-workspace support for large organizations.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Enterprise controls</h2>
      <p class="mt-2 text-sm text-muted-foreground">Custom roles, SSO, audit logs, and compliance-ready configurations.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Dedicated support</h2>
      <p class="mt-2 text-sm text-muted-foreground">SLA guarantees, dedicated account management, and onboarding assistance.</p>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Email <span class="text-foreground">sales@flyn.ai</span> for enterprise pricing and contracts.</p>
  </div>
</div>
`,
    },

    "solutions/startups": {
      title: "Startups",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Move fast without technical debt — FLYN AI gives startups a full communications and automation stack from day one.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Why startups choose FLYN AI</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Start free — upgrade as you scale</li>
      <li>No engineering required for most workflows</li>
      <li>All channels in one platform from the start</li>
      <li>AI that works out of the box</li>
    </ul>
  </div>
</div>
`,
    },

    "solutions/founders": {
      title: "Founders",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Run customer conversations, operations, and automations without hiring a big team — FLYN AI scales with you.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Built for lean teams</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Single inbox for all customer channels</li>
      <li>Automation that handles repetitive work</li>
      <li>AI agents that work 24/7 without adding headcount</li>
    </ul>
  </div>
</div>
`,
    },

    "solutions/marketing": {
      title: "Marketing Teams",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Run campaigns, track engagement, and automate follow-ups — across WhatsApp, SMS, and email.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Campaign tools</h2>
      <p class="mt-2 text-sm text-muted-foreground">Broadcast to segments with templates, scheduling, and delivery tracking.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Engagement analytics</h2>
      <p class="mt-2 text-sm text-muted-foreground">Track open rates, responses, and conversions per channel and campaign.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/support": {
      title: "Support Teams",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">A support inbox that works — shared assignments, SLAs, AI deflection, and real-time reporting.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Team efficiency</h2>
      <p class="mt-2 text-sm text-muted-foreground">Assignment rules, templates, and internal notes reduce handle time.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">AI assistance</h2>
      <p class="mt-2 text-sm text-muted-foreground">Suggested replies and auto-deflection of common questions.</p>
    </div>
  </div>
</div>
`,
    },

    "solutions/operations": {
      title: "Operations Teams",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Automate operational workflows across teams — routing, approvals, notifications, and reporting in one platform.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Common ops use cases</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Incident notification and escalation workflows</li>
      <li>Internal approval chains with audit trails</li>
      <li>Cross-team task routing and assignment</li>
      <li>Usage monitoring and capacity alerts</li>
    </ul>
  </div>
</div>
`,
    },

    "solutions/it": {
      title: "IT Teams",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Manage internal helpdesk tickets, incident communications, and IT workflows with one secure platform.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Helpdesk inbox</h2>
      <p class="mt-2 text-sm text-muted-foreground">Route internal requests to the right team with SLAs and priority levels.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Security & compliance</h2>
      <p class="mt-2 text-sm text-muted-foreground">Audit trails, role-based access, and tenant boundaries meet IT governance requirements.</p>
    </div>
  </div>
</div>
`,
    },

    // ── Developer pages ───────────────────────────────────────────────────────

    "developers/docs": {
      title: "Documentation",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Everything you need to integrate, extend, and automate with FLYN AI — guides, references, and examples.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Getting started</h2>
      <p class="mt-2 text-sm text-muted-foreground">Authentication, your first API call, and connecting a channel.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">API reference</h2>
      <p class="mt-2 text-sm text-muted-foreground">Full endpoint documentation with request/response examples.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Webhooks</h2>
      <p class="mt-2 text-sm text-muted-foreground">Receive real-time events for messages, conversations, and workflow triggers.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">SDKs</h2>
      <p class="mt-2 text-sm text-muted-foreground">Client libraries for popular languages to speed up integration.</p>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Questions? Email <span class="text-foreground">dev@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "developers/api": {
      title: "API Reference",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">A RESTful API for messaging, contacts, workflows, and analytics — built for developers who need reliability and predictability.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">API basics</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Base URL: <code class="bg-muted rounded px-1">https://api.myflynai.com/v1</code></li>
      <li>Authentication: Bearer tokens (API keys)</li>
      <li>Format: JSON request and response bodies</li>
      <li>Rate limits: 1,000 req/min on Pro plans</li>
    </ul>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Request API access at <span class="text-foreground">dev@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "developers/webhooks": {
      title: "Webhooks",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Subscribe to real-time events — new messages, status changes, workflow completions, and more.</p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Event types</h2>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
        <li>message.received / message.sent</li>
        <li>conversation.assigned / conversation.resolved</li>
        <li>workflow.completed / workflow.failed</li>
      </ul>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Reliability</h2>
      <p class="mt-2 text-sm text-muted-foreground">Events are signed with HMAC-SHA256. Automatic retries with exponential backoff on failures.</p>
    </div>
  </div>
</div>
`,
    },

    "developers/sdks": {
      title: "SDKs",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Client libraries that wrap the FLYN AI API — so you can integrate without writing boilerplate.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Available SDKs</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Node.js / TypeScript</li>
      <li>Python</li>
      <li>More coming soon</li>
    </ul>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Need a language we don't support? Email <span class="text-foreground">dev@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "developers/authentication": {
      title: "Authentication",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">All API requests are authenticated using Bearer tokens. Generate API keys from your workspace settings.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">How it works</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Create an API key in Settings → Developer</li>
      <li>Pass the key as <code class="bg-muted rounded px-1">Authorization: Bearer YOUR_KEY</code></li>
      <li>Keys are scoped to a workspace and can be revoked at any time</li>
      <li>Webhook signatures use HMAC-SHA256 with your signing secret</li>
    </ul>
  </div>
</div>
`,
    },

    "developers/rate-limits": {
      title: "Rate Limits",
      body: `
<div class="space-y-8">
  <div class="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
    <p class="text-muted-foreground">Rate limits protect platform reliability for all customers. Limits scale with your plan.</p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Limits by plan</h2>
    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Free</p>
        <p class="mt-1 text-sm text-muted-foreground">100 req/min</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Pro</p>
        <p class="mt-1 text-sm text-muted-foreground">1,000 req/min</p>
      </div>
      <div class="rounded-xl border border-border bg-muted/20 p-4">
        <p class="font-medium text-foreground">Enterprise</p>
        <p class="mt-1 text-sm text-muted-foreground">Custom limits</p>
      </div>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Rate limit headers are included in every response. Contact <span class="text-foreground">dev@flyn.ai</span> for higher limits.</p>
  </div>
</div>
`,
    },

    // ── Legal pages ───────────────────────────────────────────────────────────

    "legal/dpa": {
      title: "Data Processing Agreement",
      body: `
<div class="space-y-8">
  <div class="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
    <p class="text-muted-foreground">
      This Data Processing Agreement ("DPA") governs how FLYN AI processes personal data on behalf of customers
      ("Controller") in connection with the Services.
    </p>
  </div>
  <div class="grid gap-4">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Processing scope</h2>
      <p class="mt-2 text-sm text-muted-foreground">FLYN AI processes Customer Data only as instructed by the Controller and to provide the Services. Processing includes storing, transmitting, and analyzing data as necessary for platform operation.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Data subject rights</h2>
      <p class="mt-2 text-sm text-muted-foreground">FLYN AI assists Controllers in meeting obligations related to data subject requests (access, correction, deletion) within reasonable timeframes.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Sub-processors</h2>
      <p class="mt-2 text-sm text-muted-foreground">We use sub-processors to deliver the Services. A current list is available upon request. We notify customers of material sub-processor changes.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Security measures</h2>
      <p class="mt-2 text-sm text-muted-foreground">We implement technical and organizational measures appropriate to the risk — including encryption, access controls, and incident response procedures.</p>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">To execute a formal DPA, email <span class="text-foreground">privacy@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "legal/cookies": {
      title: "Cookie Policy",
      body: `
<div class="space-y-8">
  <div class="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
    <p class="text-muted-foreground">
      This Cookie Policy explains how FLYN AI uses cookies and similar tracking technologies on our websites and applications.
    </p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Essential cookies</h2>
      <p class="mt-2 text-sm text-muted-foreground">Required for the site to function — authentication sessions, security tokens, and preference storage. Cannot be disabled.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Analytics cookies</h2>
      <p class="mt-2 text-sm text-muted-foreground">Help us understand how the product is used so we can improve it. Data is aggregated and anonymized where possible.</p>
    </div>
  </div>
  <div class="rounded-2xl border border-border bg-muted/20 p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Managing cookies</h2>
    <p class="mt-2 text-sm text-muted-foreground">You can control cookie preferences in your browser settings. Disabling essential cookies may affect product functionality.</p>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Questions? Email <span class="text-foreground">privacy@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "legal/sla": {
      title: "Service Level Agreement",
      body: `
<div class="space-y-8">
  <div class="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
    <p class="text-muted-foreground">
      This SLA describes the uptime commitments and support response targets for FLYN AI Services.
    </p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Uptime commitment</h2>
      <p class="mt-2 text-sm text-muted-foreground">We target 99.9% monthly uptime for core messaging and inbox features on Pro and Enterprise plans. Scheduled maintenance is excluded.</p>
    </div>
    <div class="rounded-2xl border border-border bg-card p-5">
      <h2 class="text-lg font-display font-semibold text-foreground">Support response</h2>
      <div class="mt-3 space-y-2">
        <div class="flex justify-between text-sm"><span class="text-muted-foreground">P1 (Critical)</span><span class="text-foreground font-medium">2 hours</span></div>
        <div class="flex justify-between text-sm"><span class="text-muted-foreground">P2 (Major)</span><span class="text-foreground font-medium">8 hours</span></div>
        <div class="flex justify-between text-sm"><span class="text-muted-foreground">P3 (Minor)</span><span class="text-foreground font-medium">24 hours</span></div>
        <div class="flex justify-between text-sm"><span class="text-muted-foreground">P4 (General)</span><span class="text-foreground font-medium">72 hours</span></div>
      </div>
    </div>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">Enterprise customers can negotiate custom SLAs. Email <span class="text-foreground">sales@flyn.ai</span>.</p>
  </div>
</div>
`,
    },

    "legal/subprocessors": {
      title: "Sub-processors",
      body: `
<div class="space-y-8">
  <div class="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
    <p class="text-muted-foreground">
      FLYN AI uses the following third-party sub-processors to deliver the Services. We require all sub-processors to meet the same data protection standards we commit to with customers.
    </p>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Infrastructure & cloud</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Amazon Web Services — cloud hosting and storage</li>
      <li>Google Cloud Platform — compute and data services</li>
      <li>Cloudflare — CDN, DNS, and DDoS protection</li>
    </ul>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">Communications</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Meta (WhatsApp Business API) — WhatsApp messaging</li>
      <li>Twilio — SMS and voice telephony</li>
    </ul>
  </div>
  <div class="rounded-2xl border border-border bg-card p-5">
    <h2 class="text-lg font-display font-semibold text-foreground">AI & analytics</h2>
    <ul class="mt-3 list-disc pl-5 space-y-2 text-sm text-muted-foreground">
      <li>Anthropic / OpenAI — AI language model processing</li>
      <li>Google Firebase — real-time database and auth</li>
    </ul>
  </div>
  <div class="rounded-xl border border-border bg-primary/5 p-4">
    <p class="text-sm text-muted-foreground">For questions about sub-processors or to be notified of changes, email <span class="text-foreground">privacy@flyn.ai</span>.</p>
  </div>
</div>
`,
    },
  },
  siteTitle: "Flyn | All-in-One Business Automation Platform",
  seoDescription: "Flyn unifies messaging, events, churches, coaching, automation, billing, and analytics into a single intelligent platform — built for modern organizations.",
  robotsTxt: `# robots.txt for https://myflynai.com/
# Last updated: April 2026

# -----------------------------------------------
# Allow major legitimate search engines only
# -----------------------------------------------

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: DuckDuckBot
Allow: /

# Social media preview bots (for link sharing)
User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: LinkedInBot
Allow: /

# -----------------------------------------------
# Block ALL AI training & scraping bots
# -----------------------------------------------

# OpenAI / ChatGPT
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: OAI-SearchBot
Disallow: /

# Anthropic (Claude)
User-agent: ClaudeBot
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: anthropic-ai
Disallow: /

# Google AI / Gemini
User-agent: Google-Extended
Disallow: /

User-agent: Googlebot-Image
Disallow: /

# Meta AI
User-agent: Meta-ExternalAgent
Disallow: /

User-agent: Meta-ExternalFetcher
Disallow: /

# Apple
User-agent: Applebot-Extended
Disallow: /

# Amazon / Internet Archive
User-agent: ia_archiver
Disallow: /

# Cohere
User-agent: cohere-ai
Disallow: /

# Perplexity
User-agent: PerplexityBot
Disallow: /

# Common AI dataset crawlers
User-agent: CCBot
Disallow: /

User-agent: DataForSeoBot
Disallow: /

User-agent: omgili
Disallow: /

User-agent: omgilibot
Disallow: /

User-agent: Diffbot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: ImagesiftBot
Disallow: /

User-agent: YouBot
Disallow: /

User-agent: PetalBot
Disallow: /

User-agent: Scrapy
Disallow: /

User-agent: TurnitinBot
Disallow: /

# -----------------------------------------------
# Block known SEO scrapers & cloning tools
# -----------------------------------------------

User-agent: AhrefsBot
Disallow: /

User-agent: SemrushBot
Disallow: /

User-agent: MJ12bot
Disallow: /

User-agent: DotBot
Disallow: /

User-agent: BLEXBot
Disallow: /

User-agent: SiteAuditBot
Disallow: /

User-agent: HTTrack
Disallow: /

User-agent: WebCopier
Disallow: /

User-agent: WebReaper
Disallow: /

User-agent: Teleport
Disallow: /

User-agent: larbin
Disallow: /

User-agent: EmailCollector
Disallow: /

User-agent: EmailSiphon
Disallow: /

User-agent: WebBandit
Disallow: /

User-agent: EmailWolf
Disallow: /

User-agent: ExtractorPro
Disallow: /

# -----------------------------------------------
# Default: block all unrecognized bots
# -----------------------------------------------

User-agent: *
Disallow: /

# -----------------------------------------------
# Disallow private / system paths for allowed bots
# -----------------------------------------------

User-agent: Googlebot
Disallow: /admin/
Disallow: /dashboard/
Disallow: /api/
Disallow: /private/
Disallow: /_next/
Disallow: /static/chunks/
Disallow: /login
Disallow: /signup
Disallow: /register
Disallow: /reset-password
Disallow: /verify-email
Disallow: /account/
Disallow: /settings/
Disallow: /404
Disallow: /500

User-agent: Bingbot
Disallow: /admin/
Disallow: /dashboard/
Disallow: /api/
Disallow: /private/
Disallow: /login
Disallow: /signup
Disallow: /account/
Disallow: /settings/

# -----------------------------------------------
# Sitemap
# -----------------------------------------------

Sitemap: https://myflynai.com/sitemap.xml`,
};

const LandingContentContext = createContext<LandingContentContextType | undefined>(undefined);

export function LandingContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<LandingContent>(defaultContent);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const contentRef = useRef<LandingContent>(defaultContent);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    setIsLoading(true);

    if (db) {
      const unsub = onSnapshot(
        doc(db, "landing", "content"),
        (snap) => {
          if (snap.exists()) {
            const parsed = snap.data() as LandingContent;
            const merged = { ...defaultContent, ...parsed, pages: { ...defaultContent.pages, ...(parsed.pages ?? {}) } };
            contentRef.current = merged;
            setContent(merged);
          }
          setIsLoading(false);
        },
        () => {
          setIsLoading(false);
        },
      );
      return () => unsub();
    }

    try {
      const raw = window.localStorage.getItem("flyn_landing_content");
      if (raw) {
        const parsed = JSON.parse(raw) as LandingContent;
        const merged = { ...defaultContent, ...parsed, pages: { ...defaultContent.pages, ...(parsed.pages ?? {}) } };
        contentRef.current = merged;
        setContent(merged);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const enqueueSave = (op: () => Promise<void>) => {
    const run = async () => {
      await op();
    };

    saveQueueRef.current = saveQueueRef.current.then(run, run);
    return saveQueueRef.current;
  };

  const persistContent = async (updatedContent: LandingContent) => {
    setIsSaving(true);
    console.log("Saving to Firestore...", updatedContent);

    contentRef.current = updatedContent;
    setContent(updatedContent);

    try {
      if (db) {
        await setDoc(doc(db, "landing", "content"), updatedContent, { merge: true });
        console.log("Firestore save successful");
        return;
      }
    } catch (error) {
      console.error("Error saving to Firestore:", error);
    }

    try {
      window.localStorage.setItem("flyn_landing_content", JSON.stringify(updatedContent));
      console.log("LocalStorage save successful");
    } catch (e) {
      console.error("Error saving to LocalStorage:", e);
    }

    if (!db) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const saveToFirebase = async (updatedContent: LandingContent) => {
    return enqueueSave(() => persistContent(updatedContent)).finally(() => {
      setIsSaving(false);
    });
  };

  const patchContent = async (patch: (current: LandingContent) => LandingContent) => {
    return enqueueSave(async () => {
      const next = patch(contentRef.current);
      await persistContent(next);
    }).finally(() => {
      setIsSaving(false);
    });
  };

  const updateHero = async (hero: Partial<HeroContent>) => {
    await patchContent((current) => ({ ...current, hero: { ...current.hero, ...hero } }));
  };

  const updatePricing = async (plans: PricingPlan[]) => {
    await patchContent((current) => ({ ...current, pricing: plans }));
  };

  const updatePricingPlan = async (plan: PricingPlan) => {
    await patchContent((current) => {
      const updatedPlans = current.pricing.map((p) => (p.id === plan.id ? plan : p));
      return { ...current, pricing: updatedPlans };
    });
  };

  const addPricingPlan = async (plan: Omit<PricingPlan, "id">) => {
    const newPlan = { ...plan, id: `plan-${Date.now()}` };
    await patchContent((current) => ({ ...current, pricing: [...current.pricing, newPlan] }));
  };

  const deletePricingPlan = async (planId: string) => {
    await patchContent((current) => ({ ...current, pricing: current.pricing.filter((p) => p.id !== planId) }));
  };

  const updateModules = async (modules: ModuleContent[]) => {
    await patchContent((current) => ({ ...current, modules }));
  };

  const updateContact = async (contact: Partial<ContactInfo>) => {
    await patchContent((current) => ({ ...current, contact: { ...current.contact, ...contact } }));
  };

  const updateSocial = async (social: Partial<SocialLinks>) => {
    await patchContent((current) => ({ ...current, social: { ...current.social, ...social } }));
  };

  const updateFooter = async (footer: Partial<FooterContent>) => {
    await patchContent((current) => ({ ...current, footer: { ...current.footer, ...footer } }));
  };

  const updatePage = async (pageKey: string, page: Partial<PublicPageContent>) => {
    await patchContent((current) => {
      const existing = current.pages[pageKey] ?? { title: pageKey, body: "" };
      return {
        ...current,
        pages: {
          ...current.pages,
          [pageKey]: { ...existing, ...page },
        },
      };
    });
  };

  const updateRobotsTxt = async (robotsTxt: string) => {
    await patchContent((current) => ({ ...current, robotsTxt }));
  };

  return (
    <LandingContentContext.Provider
      value={{
        content,
        updateHero,
        updatePricing,
        updatePricingPlan,
        addPricingPlan,
        deletePricingPlan,
        updateModules,
        updateContact,
        updateSocial,
        updateFooter,
        updatePage,
        updateRobotsTxt,
        patchContent,
        saveToFirebase,
        isLoading,
        isSaving,
      }}
    >
      {children}
    </LandingContentContext.Provider>
  );
}

export function useLandingContent() {
  const context = useContext(LandingContentContext);
  if (context === undefined) {
    throw new Error("useLandingContent must be used within a LandingContentProvider");
  }
  return context;
}
