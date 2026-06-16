// ─────────────────────────────────────────────
// comparison.data.ts
// Default data. The admin panel at /admin/comparison
// can override any field. This file is the fallback.
// ─────────────────────────────────────────────

import type { ComparisonPageData } from '../types/comparison.types';

export const defaultComparisonData: ComparisonPageData = {
  hero: {
    eyebrow: 'FLYN vs The Industry',
    heading: 'One Platform to Replace',
    headingAccent: 'All of Them',
    subheading:
      'See why fast-growing businesses are switching to FLYN — the AI-powered all-in-one platform that outperforms every CRM and automation tool on the market.',
    chips: [
      { label: 'FLYN', isFlyn: true },
      { label: 'vs', isSeparator: true },
      { label: 'GoHighLevel' },
      { label: 'vs', isSeparator: true },
      { label: 'HubSpot' },
      { label: 'vs', isSeparator: true },
      { label: 'Salesforce' },
      { label: 'vs', isSeparator: true },
      { label: 'Zoho' },
      { label: 'vs', isSeparator: true },
      { label: 'Odoo' },
      { label: 'vs', isSeparator: true },
      { label: 'RingCentral' },
      { label: 'vs', isSeparator: true },
      { label: 'Kommo' },
      { label: '+ 20 more' },
    ],
  },

  winCards: [
    {
      id: 'pricing',
      emoji: '💰',
      iconBg: '#EEF2FF',
      title: 'Per-Workspace, Not Per-User',
      description:
        'Every competitor charges per seat. FLYN charges per workspace — your whole team for one flat price. A 10-person team saves 80%+ vs HubSpot.',
    },
    {
      id: 'ai',
      emoji: '🤖',
      iconBg: '#F0FDF4',
      title: 'Native AI — Not Bolted On',
      description:
        'AI Agents, AI Marketing, AI Content, AI Social Media, and Voice Agents are built into the platform — not expensive add-ons or third-party integrations.',
    },
    {
      id: 'verticals',
      emoji: '🏢',
      iconBg: '#FFF7ED',
      title: 'Vertical Modules Built In',
      description:
        'Church, Coaches, Freelancers, Events, HR — no competitor offers industry-specific modules at this price. No plugins. No configuration. Ready out of the box.',
    },
    {
      id: 'channels',
      emoji: '📱',
      iconBg: '#FDF2F8',
      title: 'WhatsApp + Telegram Native',
      description:
        'Built-in WhatsApp CRM and Telegram — not third-party integrations. Most competitors charge $30–$100/mo extra for these channels, or don\'t offer them at all.',
    },
  ],

  competitors: [
    { id: 'ghl',        name: 'GoHighLevel', startingPrice: '$97',  pricingNote: 'per account/mo' },
    { id: 'hubspot',    name: 'HubSpot',     startingPrice: '$50+', pricingNote: 'per user/mo' },
    { id: 'salesforce', name: 'Salesforce',  startingPrice: '$25+', pricingNote: 'per user/mo' },
    { id: 'zoho',       name: 'Zoho CRM',    startingPrice: '$14+', pricingNote: 'per user/mo' },
    { id: 'odoo',       name: 'Odoo',        startingPrice: '$13+', pricingNote: 'per user/mo' },
    { id: 'ringcentral',name: 'RingCentral', startingPrice: '$20+', pricingNote: 'per user/mo' },
    { id: 'kommo',      name: 'Kommo',       startingPrice: '$15+', pricingNote: 'per user/mo' },
  ],

  categories: [
    {
      id: 'pricing',
      emoji: '💲',
      label: 'Pricing Model',
      rows: [
        {
          id: 'per-workspace',
          label: 'Per-workspace pricing',
          values: {
            flyn:        { type: 'yes' },
            ghl:         { type: 'no' },
            hubspot:     { type: 'no' },
            salesforce:  { type: 'no' },
            zoho:        { type: 'no' },
            odoo:        { type: 'no' },
            ringcentral: { type: 'no' },
            kommo:       { type: 'no' },
          },
        },
        {
          id: 'under-50',
          label: 'Starts under $50/mo (team)',
          values: {
            flyn:        { type: 'yes' },
            ghl:         { type: 'partial', label: '$97 min' },
            hubspot:     { type: 'partial', label: '$50/user' },
            salesforce:  { type: 'no' },
            zoho:        { type: 'partial', label: 'Per user' },
            odoo:        { type: 'partial', label: 'Per user' },
            ringcentral: { type: 'no' },
            kommo:       { type: 'partial', label: 'Per user' },
          },
        },
        {
          id: 'billing-periods',
          label: 'Multi-period billing (1/3/6/12 mo)',
          values: {
            flyn:        { type: 'yes' },
            ghl:         { type: 'partial', label: 'Annual only' },
            hubspot:     { type: 'partial', label: 'Annual only' },
            salesforce:  { type: 'partial', label: 'Annual only' },
            zoho:        { type: 'partial', label: 'Annual only' },
            odoo:        { type: 'partial', label: 'Annual only' },
            ringcentral: { type: 'no' },
            kommo:       { type: 'partial', label: 'Annual only' },
          },
        },
        {
          id: 'no-hidden-fees',
          label: 'No hidden per-usage fees',
          values: {
            flyn:        { type: 'yes' },
            ghl:         { type: 'partial', label: 'SMS/AI fees' },
            hubspot:     { type: 'no' },
            salesforce:  { type: 'no' },
            zoho:        { type: 'check' },
            odoo:        { type: 'check' },
            ringcentral: { type: 'partial', label: 'Min. fees' },
            kommo:       { type: 'check' },
          },
        },
      ],
    },
    {
      id: 'crm',
      emoji: '📬',
      label: 'CRM & Communication',
      rows: [
        {
          id: 'crm-core',
          label: 'CRM & contact management',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'check' }, hubspot: { type: 'check' },
            salesforce: { type: 'check' }, zoho: { type: 'check' }, odoo: { type: 'check' },
            ringcentral: { type: 'check' }, kommo: { type: 'check' },
          },
        },
        {
          id: 'inbox',
          label: 'Unified Inbox',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'check' }, hubspot: { type: 'check' },
            salesforce: { type: 'partial', label: 'Add-on' }, zoho: { type: 'check' },
            odoo: { type: 'partial', label: 'Limited' }, ringcentral: { type: 'check' },
            kommo: { type: 'check' },
          },
        },
        {
          id: 'dialer',
          label: 'Built-in Dialer / VoIP',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'check' },
            hubspot: { type: 'partial', label: 'Add-on' },
            salesforce: { type: 'partial', label: 'Add-on' },
            zoho: { type: 'partial', label: 'Add-on' },
            odoo: { type: 'partial', label: 'Module' },
            ringcentral: { type: 'check' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'whatsapp',
          label: 'WhatsApp CRM (native)',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'partial', label: '3rd party' },
            hubspot: { type: 'partial', label: '3rd party' },
            salesforce: { type: 'partial', label: '3rd party' },
            zoho: { type: 'partial', label: 'Add-on' },
            odoo: { type: 'partial', label: '3rd party' },
            ringcentral: { type: 'no' }, kommo: { type: 'check' },
          },
        },
        {
          id: 'telegram',
          label: 'Telegram integration (native)',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'no' }, zoho: { type: 'partial', label: '3rd party' },
            odoo: { type: 'no' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
      ],
    },
    {
      id: 'ai',
      emoji: '🤖',
      label: 'AI & Automation',
      rows: [
        {
          id: 'ai-agents',
          label: 'Native AI Agents',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'partial', label: 'Add-on $97' },
            hubspot: { type: 'partial', label: 'Add-on' },
            salesforce: { type: 'partial', label: 'Einstein AI' },
            zoho: { type: 'partial', label: 'Zia AI' }, odoo: { type: 'no' },
            ringcentral: { type: 'partial', label: 'Limited' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'ai-marketing',
          label: 'AI Marketing campaigns',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'partial', label: 'Limited' },
            hubspot: { type: 'partial', label: 'Higher tier' },
            salesforce: { type: 'partial', label: 'Mktg Cloud' },
            zoho: { type: 'partial', label: 'Add-on' },
            odoo: { type: 'partial', label: 'Module' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'ai-content',
          label: 'AI Content generation',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'partial', label: 'Limited' },
            hubspot: { type: 'partial', label: 'Content Hub' },
            salesforce: { type: 'no' }, zoho: { type: 'partial', label: 'Limited' },
            odoo: { type: 'no' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'ai-social',
          label: 'AI Social Media scheduler',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'partial', label: 'Social planner' },
            hubspot: { type: 'partial', label: 'Separate tool' },
            salesforce: { type: 'no' }, zoho: { type: 'partial', label: 'Social module' },
            odoo: { type: 'no' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'voice-agents',
          label: 'Voice Agents / AI IVR',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'partial', label: 'Basic IVR' },
            hubspot: { type: 'no' }, salesforce: { type: 'no' }, zoho: { type: 'no' },
            odoo: { type: 'no' }, ringcentral: { type: 'check' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'automation',
          label: 'Visual workflow automation',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'check' },
            hubspot: { type: 'partial', label: 'Higher tier' },
            salesforce: { type: 'partial', label: 'Flow Builder' },
            zoho: { type: 'check' }, odoo: { type: 'check' }, ringcentral: { type: 'no' },
            kommo: { type: 'check' },
          },
        },
        {
          id: 'ai-credits',
          label: 'AI credits shared by workspace',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'no' }, zoho: { type: 'no' }, odoo: { type: 'no' },
            ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
      ],
    },
    {
      id: 'verticals',
      emoji: '🏢',
      label: 'Vertical Modules (Base Plan)',
      rows: [
        {
          id: 'hr',
          label: 'HR management module',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'partial', label: 'Separate app' },
            zoho: { type: 'partial', label: 'Zoho People' },
            odoo: { type: 'partial', label: 'Paid module' },
            ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'events',
          label: 'Events management',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'no' }, zoho: { type: 'partial', label: 'Limited' },
            odoo: { type: 'partial', label: 'Paid module' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'church',
          label: 'Church / ministry tools',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'no' }, zoho: { type: 'no' }, odoo: { type: 'no' },
            ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'coaches',
          label: 'Coaching / client sessions',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'no' }, zoho: { type: 'no' }, odoo: { type: 'no' },
            ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'freelancers',
          label: 'Freelancers & project invoicing',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'no' }, zoho: { type: 'partial', label: 'Zoho Invoice' },
            odoo: { type: 'partial', label: 'Paid module' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'accounting',
          label: 'Accounting / invoices built-in',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' }, hubspot: { type: 'no' },
            salesforce: { type: 'partial', label: 'Separate app' },
            zoho: { type: 'partial', label: 'Zoho Books' },
            odoo: { type: 'check' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
      ],
    },
    {
      id: 'website',
      emoji: '🌐',
      label: 'Website & Content',
      rows: [
        {
          id: 'website-builder',
          label: 'Website builder built-in',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'check' },
            hubspot: { type: 'partial', label: 'CMS Hub' },
            salesforce: { type: 'no' }, zoho: { type: 'partial', label: 'Zoho Sites' },
            odoo: { type: 'partial', label: 'Website mod.' }, ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'domains',
          label: 'Domain management',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'check' },
            hubspot: { type: 'partial', label: 'CMS only' }, salesforce: { type: 'no' },
            zoho: { type: 'partial', label: 'Separate' }, odoo: { type: 'partial', label: 'Limited' },
            ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'asset-hub',
          label: 'Asset Hub (media library)',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'no' },
            hubspot: { type: 'partial', label: 'File manager' },
            salesforce: { type: 'partial', label: 'Files mod.' },
            zoho: { type: 'check' }, odoo: { type: 'partial', label: 'Attachments' },
            ringcentral: { type: 'no' }, kommo: { type: 'no' },
          },
        },
        {
          id: 'developer',
          label: 'Developer portal & API access',
          values: {
            flyn: { type: 'yes' }, ghl: { type: 'partial', label: 'Unlimited+ plan' },
            hubspot: { type: 'partial', label: 'Enterprise only' },
            salesforce: { type: 'check' }, zoho: { type: 'check' }, odoo: { type: 'check' },
            ringcentral: { type: 'check' }, kommo: { type: 'partial', label: 'Limited' },
          },
        },
      ],
    },
  ],

  pricingCards: [
    {
      id: 'flyn',
      brand: '🚀 FLYN',
      price: '$49.99',
      note: 'flat / workspace',
      tag: 'All 10 users included',
      highlight: true,
    },
    { id: 'ghl',        brand: 'GoHighLevel', price: '$297',  note: 'Unlimited plan needed',  tag: '6× more expensive' },
    { id: 'hubspot',    brand: 'HubSpot',     price: '$500+', note: '$50/user × 10 users',    tag: '10× more expensive' },
    { id: 'salesforce', brand: 'Salesforce',  price: '$250+', note: '$25/user × 10 users',    tag: '5× more expensive' },
    { id: 'zoho',       brand: 'Zoho CRM',    price: '$140+', note: '$14/user × 10 users',    tag: '3× + per-user limits' },
  ],

  uniqueFeatures: [
    {
      id: 'church',
      title: 'Church & Ministry Module',
      description:
        'Congregation management, ministry tools, and RSVP tracking — purpose-built for churches. Zero competitors offer this natively.',
    },
    {
      id: 'coaches',
      title: 'Coaches Module',
      description:
        'Session booking, client progress tracking, and coaching workflows — all in the same platform as your CRM and billing.',
    },
    {
      id: 'freelancers',
      title: 'Freelancers Module',
      description:
        'Projects, invoicing, and client management specifically designed for freelancers — no need for separate tools like Bonsai or HoneyBook.',
    },
    {
      id: 'workspace-pricing',
      title: 'Flat Per-Workspace Pricing',
      description:
        'The only platform where your entire team runs on one flat fee. No per-seat shocks when you grow. Unlimited users on the right plan.',
    },
    {
      id: 'messaging',
      title: 'Native WhatsApp + Telegram CRM',
      description:
        'Not integrations — built into your inbox. Manage leads, send campaigns, and reply to customers on WhatsApp and Telegram without leaving FLYN.',
    },
    {
      id: 'ai-credits',
      title: 'AI Credits Shared by Workspace',
      description:
        'Every competing platform charges AI credits per user. FLYN shares your workspace credit pool — so a 10-person team gets 10× the value.',
    },
  ],

  cta: {
    heading: 'Stop paying for 10 tools.\nGet everything in FLYN.',
    subheading:
      'CRM, AI agents, WhatsApp, Telegram, website builder, accounting, HR, and more — under one roof, one price, one login.',
    primaryLabel: 'Start Free Trial',
    primaryHref: 'https://app.myflynai.com',
    secondaryLabel: 'See Pricing',
    secondaryHref: 'https://app.myflynai.com/pricing',
  },

  footerNote:
    '✦ = Native FLYN feature, included in base plan · ✓ = Available on competitor · Partial = Requires add-on, higher tier, or 3rd-party integration · ✗ = Not available. All competitor pricing reflects publicly listed rates as of May 2026. Prices subject to change.',
};
