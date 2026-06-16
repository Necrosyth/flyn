/**
 * FLYN AI — Automated Messaging Templates v2.0
 * Source of truth for all lifecycle email + WhatsApp templates.
 *
 * Each template maps to a NotificationEventType trigger and is delivered
 * via Email (SendGrid/SES) and/or WhatsApp (Twilio/360dialog).
 *
 * Dynamic variables use {{variable_name}} syntax throughout.
 * UTM parameters must be appended to all email CTA links.
 *
 * WhatsApp templates require Meta Business API pre-approval before use.
 * Send window for WhatsApp: 9 AM – 8 PM recipient local time.
 *
 * Frequency rules:
 *  - Max 1 marketing email per user per 24-hour window
 *  - Priority (highest → lowest): Billing > Trial > Usage > Upgrade > Feature > Re-engagement
 *  - Transactional emails (payment failed, renewed, account verified) bypass the 24h cap
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type MessagingChannel = "email" | "whatsapp";
export type TemplateCategory =
  | "onboarding"
  | "trial"
  | "usage"
  | "upgrade"
  | "engagement"
  | "feature"
  | "billing";

export interface EmailTemplate {
  subject: string;
  preheader: string;
  /** Full HTML-ready body. Newlines separate visual sections; {{variables}} are injected at send time. */
  body: string;
  cta: {
    label: string;
    /** Relative path — UTM params are appended by the mailer service */
    url: string;
  };
}

export interface WhatsAppTemplate {
  /** Approved template name as registered in Meta Business Manager */
  templateName: string;
  /** Plain-text message body (≤1024 chars) */
  body: string;
  /** Button label if template uses a CTA button component */
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface MessagingTemplate {
  id: string;
  /** Maps to NotificationEventType */
  trigger: string;
  category: TemplateCategory;
  /** Whether this bypasses the 24h marketing frequency cap */
  transactional: boolean;
  email: EmailTemplate;
  whatsapp: WhatsAppTemplate;
}

// ─── UTM Base ───────────────────────────────────────────────────────────────

export const UTM_BASE = "utm_source=flyn_email&utm_medium=lifecycle";

/** Append UTM params to a CTA URL. utm_campaign is the template trigger id. */
export const withUtm = (url: string, templateId: string): string => {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${UTM_BASE}&utm_campaign=${templateId}`;
};

// ─── Templates ──────────────────────────────────────────────────────────────

export const MESSAGING_TEMPLATES: MessagingTemplate[] = [
  // ── Section 1: Onboarding ─────────────────────────────────────────────────

  {
    id: "onboarding.welcome",
    trigger: "account.created",
    category: "onboarding",
    transactional: true,
    email: {
      subject: "Welcome to FLYN AI — Let's Get You Set Up",
      preheader: "Your AI-powered workspace is ready. Here's how to get started.",
      body: `Hi {{first_name}},

Welcome to FLYN AI — the AI-native platform built for businesses that want to move faster without losing the human touch.

Your workspace is live in Explore Mode. This means:
  • All features are accessible
  • No real messages are sent
  • No costs are incurred

Here's what to do first:
  1. Connect your first channel (WhatsApp, Email, or Phone)
  2. Set up your AI agent
  3. Run a simulation to test your first automation

When you're ready to go live, select a plan and activate real messaging in seconds.

If you need help, our support team is available in-app or via email at support@flyn.ai.

We're glad you're here.

— The FLYN AI Team`,
      cta: { label: "Start Exploring", url: "/dashboard" },
    },
    whatsapp: {
      templateName: "flyn_onboarding_welcome",
      body: `Hi {{first_name}} 👋 Welcome to FLYN AI!\n\nYour workspace is ready in Explore Mode — test everything before you go live.\n\nTap below to get started.`,
      ctaLabel: "Open My Dashboard",
      ctaUrl: "/dashboard",
    },
  },

  {
    id: "onboarding.account_verified",
    trigger: "onboarding.account_verified",
    category: "onboarding",
    transactional: true,
    email: {
      subject: "Your Email Is Confirmed — FLYN AI",
      preheader: "You're all set. Your account is fully activated.",
      body: `Hi {{first_name}},

Great news — your email address has been verified.

Your FLYN AI account is now fully activated. You can now:
  • Connect live channels and send real messages
  • Invite team members to your workspace
  • Access all features available on your plan

Next step: complete your profile to personalise your AI agent's tone and identity.

— The FLYN AI Team`,
      cta: { label: "Complete My Profile", url: "/settings" },
    },
    whatsapp: {
      templateName: "flyn_email_verified",
      body: `✅ Email confirmed, {{first_name}}! Your FLYN AI account is fully activated.\n\nComplete your profile to personalise your AI agent.`,
      ctaLabel: "Complete Profile",
      ctaUrl: "/settings",
    },
  },

  {
    id: "onboarding.profile_incomplete",
    trigger: "onboarding.profile_incomplete",
    category: "onboarding",
    transactional: false,
    email: {
      subject: "You're Almost Ready — Finish Your FLYN AI Setup",
      preheader: "One more step to unlock your full workspace.",
      body: `Hi {{first_name}},

Your FLYN AI workspace is set up but a few things are still missing.

To get the most out of the platform, complete these steps:
  {{#if missing_channel}}• Connect a messaging channel (WhatsApp, Email, or SMS){{/if}}
  {{#if missing_business_name}}• Add your business name and logo{{/if}}
  {{#if missing_ai_tone}}• Set your AI agent's tone and persona{{/if}}

It only takes a few minutes — and once done, you'll be ready to go live.

— The FLYN AI Team`,
      cta: { label: "Finish Setup", url: "/settings" },
    },
    whatsapp: {
      templateName: "flyn_profile_incomplete",
      body: `Hi {{first_name}}, your FLYN AI setup isn't quite done.\n\nFinish your profile to connect channels and activate your AI agent. Tap below.`,
      ctaLabel: "Finish Setup",
      ctaUrl: "/settings",
    },
  },

  // ── Section 2: Free Trial ─────────────────────────────────────────────────

  {
    id: "trial.started",
    trigger: "trial.started",
    category: "trial",
    transactional: true,
    email: {
      subject: "Your FLYN AI Trial Has Started",
      preheader: "14 days of live messaging, AI automations, and more — starting now.",
      body: `Hi {{first_name}},

Your free trial is now active. For the next {{trial_days}} days, you have full access to:
  • Live messaging across WhatsApp, Email, and SMS
  • AI-powered automations and agents
  • CRM, pipeline management, and analytics
  • All integrations available on the {{plan_name}} plan

Make the most of your trial:
  → Connect your first channel today
  → Run your first automation tomorrow
  → Invite your team by day 3

Your trial ends on {{trial_end_date}}. We'll remind you before it expires.

— The FLYN AI Team`,
      cta: { label: "Go to Dashboard", url: "/dashboard" },
    },
    whatsapp: {
      templateName: "flyn_trial_started",
      body: `🚀 Your FLYN AI trial is live, {{first_name}}!\n\nYou have {{trial_days}} days of full access. Connect a channel and send your first real message today.\n\nTrial ends: {{trial_end_date}}`,
      ctaLabel: "Open Dashboard",
      ctaUrl: "/dashboard",
    },
  },

  {
    id: "trial.midpoint",
    trigger: "trial.midpoint",
    category: "trial",
    transactional: false,
    email: {
      subject: "Halfway Through — Make the Most of Your Trial",
      preheader: "{{trial_days_left}} days left. Here's what to try before your trial ends.",
      body: `Hi {{first_name}},

You're halfway through your FLYN AI trial.

Here's a quick check — have you tried these yet?
  {{#unless has_sent_message}}→ Send your first message via a connected channel{{/unless}}
  {{#unless has_automation}}→ Set up and run an AI automation{{/unless}}
  {{#unless has_invited_team}}→ Invite a teammate to collaborate{{/unless}}

You have {{trial_days_left}} days remaining. After that, a plan is required to keep live operations running.

If you'd like to talk to someone before you decide, reply to this email — we're happy to help.

— The FLYN AI Team`,
      cta: { label: "Resume My Trial", url: "/dashboard" },
    },
    whatsapp: {
      templateName: "flyn_trial_midpoint",
      body: `⏱ Halfway there, {{first_name}}!\n\nYou have {{trial_days_left}} days left in your FLYN AI trial. Have you sent a live message yet?\n\nTap to pick up where you left off.`,
      ctaLabel: "Continue Trial",
      ctaUrl: "/dashboard",
    },
  },

  {
    id: "trial.ending.3_days",
    trigger: "trial.ending.3_days",
    category: "trial",
    transactional: false,
    email: {
      subject: "3 Days Left on Your FLYN AI Trial",
      preheader: "Select a plan before {{trial_end_date}} to keep everything running.",
      body: `Hi {{first_name}},

Your trial ends in 3 days — on {{trial_end_date}}.

After that, live messaging and automations will pause until you select a plan.

Our most popular choice for your stage:
  → {{recommended_plan}} — from {{recommended_plan_price}}/month
     Includes everything you've been using, plus priority support.

Not ready to commit? Let us know if you have questions — reply to this email.

— The FLYN AI Team`,
      cta: { label: "Choose My Plan", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_trial_3days",
      body: `⚠️ {{first_name}}, your FLYN AI trial ends in 3 days ({{trial_end_date}}).\n\nSelect a plan to keep your messages and automations running without interruption.`,
      ctaLabel: "Choose Plan",
      ctaUrl: "/settings?tab=billing",
    },
  },

  {
    id: "trial.expired",
    trigger: "trial.expired",
    category: "trial",
    transactional: false,
    email: {
      subject: "Your Trial Has Ended — Choose a Plan to Continue",
      preheader: "Your data and automations are safe. Upgrade to reactivate them.",
      body: `Hi {{first_name}},

Your FLYN AI trial ended on {{trial_end_date}}.

Your workspace data, contacts, and automation settings are all preserved — nothing has been deleted.

To reactivate live messaging and automations, select a plan that fits your needs. All plans include:
  • Unlimited contacts
  • Multi-channel messaging
  • AI automations and agents
  • Team collaboration tools

Plans start from {{starter_plan_price}}/month.

— The FLYN AI Team`,
      cta: { label: "View Plans", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_trial_expired",
      body: `Your FLYN AI trial has ended, {{first_name}}.\n\nYour data is safe. Select a plan to reactivate your automations and live messaging.`,
      ctaLabel: "View Plans",
      ctaUrl: "/settings?tab=billing",
    },
  },

  // ── Section 3: Usage & Limits ─────────────────────────────────────────────

  {
    id: "usage.threshold.50",
    trigger: "usage.threshold.50",
    category: "usage",
    transactional: false,
    email: {
      subject: "Usage Update — 50% of {{resource}} Used",
      preheader: "You're halfway through this month's {{resource}} allowance.",
      body: `Hi {{first_name}},

Just a heads up — your workspace has used 50% of its {{resource}} allowance for {{billing_period}}.

Current usage: {{used_amount}} / {{total_amount}} {{resource_unit}}

No action required. This is an informational notice.

If your usage is higher than expected, you can review your automations in the dashboard or upgrade your plan for more capacity.

— The FLYN AI Team`,
      cta: { label: "View Usage", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_usage_50",
      body: `📊 Usage update for {{org_name}}: you've used 50% of your {{resource}} for {{billing_period}}.\n\n{{used_amount}} / {{total_amount}} {{resource_unit}} used. No action needed yet.`,
    },
  },

  {
    id: "usage.threshold.90",
    trigger: "usage.threshold.90",
    category: "usage",
    transactional: false,
    email: {
      subject: "Action Recommended — 90% of {{resource}} Used",
      preheader: "You're close to your limit. Upgrade now to avoid any interruption.",
      body: `Hi {{first_name}},

Your workspace has used 90% of its {{resource}} allowance for {{billing_period}}.

Current usage: {{used_amount}} / {{total_amount}} {{resource_unit}}

If you reach 100%, live delivery of {{resource}} will pause automatically — as per your plan's fair-use policy.

To avoid interruption, upgrade your plan before the cap is reached.

— The FLYN AI Team`,
      cta: { label: "Upgrade Plan", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_usage_90",
      body: `⚠️ {{org_name}} has used 90% of {{resource}} for {{billing_period}}.\n\n{{used_amount}} / {{total_amount}} {{resource_unit}} used. Upgrade now to avoid delivery pausing.`,
      ctaLabel: "Upgrade Plan",
      ctaUrl: "/settings?tab=billing",
    },
  },

  {
    id: "usage.exhausted",
    trigger: "usage.exhausted",
    category: "usage",
    transactional: true,
    email: {
      subject: "Usage Limit Reached — {{resource}} Paused",
      preheader: "Upgrade to resume live delivery immediately.",
      body: `Hi {{first_name}},

Your workspace has reached its {{resource}} limit for {{billing_period}}.

Current usage: {{used_amount}} / {{total_amount}} {{resource_unit}}

Live {{resource}} delivery has been paused automatically. No messages or calls will be processed until:
  (a) Your billing period resets on {{reset_date}}, or
  (b) You upgrade to a plan with a higher limit

To resume immediately, upgrade your plan below.

— The FLYN AI Team`,
      cta: { label: "Upgrade Now", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_usage_exhausted",
      body: `🔴 {{resource}} limit reached for {{org_name}}.\n\nLive delivery is paused. Upgrade to resume now, or wait for your cycle to reset on {{reset_date}}.`,
      ctaLabel: "Upgrade Plan",
      ctaUrl: "/settings?tab=billing",
    },
  },

  // ── Section 4: Upgrade & Conversion ──────────────────────────────────────

  {
    id: "upgrade.prompt",
    trigger: "upgrade.prompt",
    category: "upgrade",
    transactional: false,
    email: {
      subject: "You're Growing — It's Time to Level Up",
      preheader: "Your usage shows you're ready for more. Here's what's waiting for you.",
      body: `Hi {{first_name}},

Based on your usage over the past {{days_active}} days, you're getting serious results with FLYN AI.

Your current plan is {{current_plan}}. Here's what you'd unlock by upgrading to {{recommended_plan}}:
  • {{upgrade_benefit_1}}
  • {{upgrade_benefit_2}}
  • {{upgrade_benefit_3}}

Starting from {{recommended_plan_price}}/month — and you can switch back at any time.

— The FLYN AI Team`,
      cta: { label: "Explore Upgrade Options", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_upgrade_prompt",
      body: `📈 You're growing, {{first_name}}!\n\nYour FLYN AI usage over the last {{days_active}} days shows you're ready for more. Upgrade to {{recommended_plan}} and unlock higher limits and AI features.`,
      ctaLabel: "See Plans",
      ctaUrl: "/settings?tab=billing",
    },
  },

  {
    id: "feature.locked",
    trigger: "feature.locked.click",
    category: "upgrade",
    transactional: false,
    email: {
      subject: "{{feature_name}} Is Available on {{required_plan}}",
      preheader: "Unlock this feature today — your data stays exactly where it is.",
      body: `Hi {{first_name}},

You tried to access {{feature_name}}, which is available on the {{required_plan}} plan.

Here's what {{feature_name}} can do for your business:
  • {{feature_benefit_1}}
  • {{feature_benefit_2}}

Your current plan is {{current_plan}}. Upgrading is instant — no downtime and no data migration.

— The FLYN AI Team`,
      cta: { label: "Unlock This Feature", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_feature_locked",
      body: `🔒 {{feature_name}} is available on {{required_plan}}, {{first_name}}.\n\nUpgrade to unlock it instantly — no data loss, no downtime.`,
      ctaLabel: "Upgrade Now",
      ctaUrl: "/settings?tab=billing",
    },
  },

  {
    id: "upgrade.success",
    trigger: "upgrade.success",
    category: "upgrade",
    transactional: true,
    email: {
      subject: "Welcome to {{new_plan}} — You're All Set",
      preheader: "Your new plan is active. Higher limits are live right now.",
      body: `Hi {{first_name}},

Your upgrade to {{new_plan}} is confirmed and active.

What's changed:
  • {{new_limit_1}}
  • {{new_limit_2}}
  • {{new_feature_1}}

Your first invoice under the new plan will be generated on {{next_billing_date}}.

Thank you for growing with FLYN AI.

— The FLYN AI Team`,
      cta: { label: "Explore Your New Features", url: "/dashboard" },
    },
    whatsapp: {
      templateName: "flyn_upgrade_confirmed",
      body: `🎉 You're now on {{new_plan}}, {{first_name}}!\n\nHigher limits and new features are live right now. Open your dashboard to see what's new.`,
      ctaLabel: "Open Dashboard",
      ctaUrl: "/dashboard",
    },
  },

  // ── Section 5: Re-engagement ──────────────────────────────────────────────

  {
    id: "engagement.inactive.7d",
    trigger: "engagement.inactive.7d",
    category: "engagement",
    transactional: false,
    email: {
      subject: "You've Been Away — Your Automations Are Still Running",
      preheader: "7 days since your last login. Here's a quick summary of what happened.",
      body: `Hi {{first_name}},

It's been 7 days since you last logged into FLYN AI.

While you were away:
  • {{messages_sent}} messages were sent automatically
  • {{automations_triggered}} automations were triggered
  • {{new_contacts}} new contacts were added

Everything is running smoothly. Log back in to review conversations, check AI performance, and stay on top of your business.

— The FLYN AI Team`,
      cta: { label: "See What's Happened", url: "/dashboard" },
    },
    whatsapp: {
      templateName: "flyn_inactive_7d",
      body: `Hi {{first_name}}, it's been 7 days! Your FLYN AI automations sent {{messages_sent}} messages while you were away.\n\nLog in to review your conversations.`,
      ctaLabel: "Log In",
      ctaUrl: "/dashboard",
    },
  },

  {
    id: "engagement.inactive.14d",
    trigger: "engagement.inactive.14d",
    category: "engagement",
    transactional: false,
    email: {
      subject: "We Miss You — A Lot Has Changed in 14 Days",
      preheader: "Your workspace is active. Come back and see what your AI has been doing.",
      body: `Hi {{first_name}},

Two weeks without a login. Your automations have been working hard in the background, but some things might need your attention.

  • {{pending_conversations}} conversations are waiting for review
  • {{failed_messages}} messages failed to deliver
  • {{unused_feature}} feature hasn't been set up yet

We want to make sure FLYN AI is working for you — not the other way around. Log in and let us know if there's anything we can help with.

— The FLYN AI Team`,
      cta: { label: "Come Back", url: "/dashboard" },
    },
    whatsapp: {
      templateName: "flyn_inactive_14d",
      body: `{{first_name}}, it's been 2 weeks. 👀\n\n{{pending_conversations}} conversations need your review in FLYN AI. Come back and check in.`,
      ctaLabel: "Review Now",
      ctaUrl: "/dashboard",
    },
  },

  {
    id: "engagement.winback.30d",
    trigger: "engagement.winback.30d",
    category: "engagement",
    transactional: false,
    email: {
      subject: "It's Been a Month — We'd Love to Have You Back",
      preheader: "Your account is still active. Here's what's new since you left.",
      body: `Hi {{first_name}},

It's been 30 days. We've missed having you around.

While you were away, FLYN AI released:
  • {{new_feature_1}}
  • {{new_feature_2}}

Your workspace is still active and your data is all there. If you've been busy or things changed — we get it. Come back when you're ready.

And if something wasn't working for you, we'd genuinely like to know. Reply to this email and a real person will respond.

— The FLYN AI Team`,
      cta: { label: "Log Back In", url: "/dashboard" },
    },
    whatsapp: {
      templateName: "flyn_winback_30d",
      body: `It's been a month, {{first_name}}. Your FLYN AI workspace is still active and ready for you.\n\nWe'd love to have you back. Here's what's new: {{new_feature_1}}.`,
      ctaLabel: "See What's New",
      ctaUrl: "/dashboard",
    },
  },

  // ── Section 6: Feature Adoption ───────────────────────────────────────────

  {
    id: "feature.new_launch",
    trigger: "feature.new_launch",
    category: "feature",
    transactional: false,
    email: {
      subject: "New: {{feature_name}} Is Now Live on Your Plan",
      preheader: "We just launched something we think you'll love.",
      body: `Hi {{first_name}},

We just launched {{feature_name}} — and it's available on your {{current_plan}} plan right now.

What it does:
  {{feature_description}}

Why we built it:
  {{feature_rationale}}

No setup required. Log in and try it today.

— The FLYN AI Team`,
      cta: { label: "Try {{feature_name}}", url: "{{feature_url}}" },
    },
    whatsapp: {
      templateName: "flyn_feature_launch",
      body: `✨ New in FLYN AI: {{feature_name}} is live on your plan!\n\n{{feature_description}}\n\nTry it now — no setup needed.`,
      ctaLabel: "Try It Now",
      ctaUrl: "{{feature_url}}",
    },
  },

  {
    id: "feature.nudge",
    trigger: "feature.nudge",
    category: "feature",
    transactional: false,
    email: {
      subject: "You Haven't Tried {{feature_name}} Yet",
      preheader: "It's included in your plan and could save you {{estimated_time_saved}} every week.",
      body: `Hi {{first_name}},

We noticed you haven't set up {{feature_name}} yet.

This feature is included in your {{current_plan}} plan and {{feature_value_prop}}.

Teams that use {{feature_name}} typically see:
  • {{result_1}}
  • {{result_2}}

It only takes {{setup_time}} to set up.

— The FLYN AI Team`,
      cta: { label: "Set Up {{feature_name}}", url: "{{feature_url}}" },
    },
    whatsapp: {
      templateName: "flyn_feature_nudge",
      body: `💡 {{first_name}}, {{feature_name}} is included in your plan but hasn't been set up yet.\n\nIt takes {{setup_time}} and {{feature_value_prop}}. Try it now.`,
      ctaLabel: "Set Up Now",
      ctaUrl: "{{feature_url}}",
    },
  },

  // ── Section 7: Billing ────────────────────────────────────────────────────

  {
    id: "billing.payment.failed",
    trigger: "billing.payment.failed",
    category: "billing",
    transactional: true,
    email: {
      subject: "Payment Failed — Action Required",
      preheader: "Update your payment method to avoid service interruption.",
      body: `Hi {{first_name}},

We were unable to process a payment of {{amount}} for your {{plan_name}} subscription on {{payment_date}}.

Reason: {{failure_reason}}

Your account remains active for now. If this isn't resolved within {{grace_period_days}} days (by {{grace_period_end}}), live messaging and automations will be paused.

To update your payment method:
  1. Go to Settings → Billing
  2. Update your card or payment details
  3. Re-attempt the payment

If you believe this is an error, contact us at billing@flyn.ai.

— The FLYN AI Team`,
      cta: { label: "Update Payment Method", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_payment_failed",
      body: `⚠️ Payment of {{amount}} failed for {{org_name}} on {{payment_date}}.\n\nUpdate your payment method before {{grace_period_end}} to avoid service interruption.`,
      ctaLabel: "Fix Payment",
      ctaUrl: "/settings?tab=billing",
    },
  },

  {
    id: "billing.renewed",
    trigger: "billing.renewed",
    category: "billing",
    transactional: true,
    email: {
      subject: "Subscription Renewed — {{plan_name}}",
      preheader: "Your FLYN AI subscription has been successfully renewed.",
      body: `Hi {{first_name}},

Your {{plan_name}} subscription has been renewed successfully.

Renewal details:
  • Amount charged: {{amount}}
  • Billing date: {{billing_date}}
  • Next renewal: {{next_renewal_date}}
  • Payment method: {{payment_method_last4}}

A receipt has been sent to {{billing_email}}.

Thank you for staying with FLYN AI.

— The FLYN AI Team`,
      cta: { label: "View Receipt", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_billing_renewed",
      body: `✅ {{plan_name}} renewed for {{org_name}}.\n\n{{amount}} charged on {{billing_date}}. Next renewal: {{next_renewal_date}}.\n\nThank you for staying with FLYN AI!`,
    },
  },

  {
    id: "billing.downgrade_warning",
    trigger: "billing.downgrade_warning",
    category: "billing",
    transactional: true,
    email: {
      subject: "Plan Downgrade Scheduled — Action May Be Required",
      preheader: "Your plan will change at the end of this billing cycle. Here's what to expect.",
      body: `Hi {{first_name}},

A plan downgrade has been scheduled for your workspace. At the end of your current billing cycle ({{cycle_end_date}}), your plan will change from {{current_plan}} to {{new_plan}}.

What changes on {{new_plan}}:
  • {{limit_change_1}}
  • {{limit_change_2}}
  • {{feature_removed_1}} will no longer be available

Your data will not be deleted. However, some features and limits will be reduced.

If you'd like to keep your current plan, you can cancel the downgrade below before {{cycle_end_date}}.

— The FLYN AI Team`,
      cta: { label: "Keep My Current Plan", url: "/settings?tab=billing" },
    },
    whatsapp: {
      templateName: "flyn_downgrade_warning",
      body: `📋 Plan downgrade notice for {{org_name}}.\n\nYour plan will change from {{current_plan}} → {{new_plan}} on {{cycle_end_date}}.\n\nTap to review or cancel the downgrade.`,
      ctaLabel: "Review Change",
      ctaUrl: "/settings?tab=billing",
    },
  },
];

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/** Get a template by its trigger event type */
export const getTemplateByTrigger = (trigger: string): MessagingTemplate | undefined =>
  MESSAGING_TEMPLATES.find((t) => t.trigger === trigger);

/** Get all templates for a category */
export const getTemplatesByCategory = (category: TemplateCategory): MessagingTemplate[] =>
  MESSAGING_TEMPLATES.filter((t) => t.category === category);

// ─── Variable Reference ──────────────────────────────────────────────────────

/**
 * All dynamic variables used across templates.
 * Variables are injected at send time by the mailer / WhatsApp delivery service.
 */
export const TEMPLATE_VARIABLES = {
  // User
  first_name: "Recipient's first name",
  email: "Recipient's email address",

  // Workspace
  org_name: "Organisation / workspace name",
  current_plan: "Active plan name (e.g. Starter, Growth, Pro)",
  recommended_plan: "Suggested upgrade plan name",
  recommended_plan_price: "Starting price of recommended plan",
  starter_plan_price: "Starting price of the Starter plan",
  new_plan: "Plan after upgrade/downgrade",

  // Trial
  trial_days: "Total trial duration in days",
  trial_days_left: "Days remaining in trial",
  trial_end_date: "Trial expiry date (formatted)",

  // Usage
  resource: "Resource type (e.g. messages, call minutes, AI tokens)",
  resource_unit: "Unit label (e.g. messages, minutes, tokens)",
  used_amount: "Amount used this billing cycle",
  total_amount: "Total monthly allowance",
  billing_period: "Current billing period label (e.g. March 2026)",
  reset_date: "Date the usage cycle resets",

  // Upgrade
  upgrade_benefit_1: "First upgrade benefit description",
  upgrade_benefit_2: "Second upgrade benefit description",
  upgrade_benefit_3: "Third upgrade benefit description",
  new_limit_1: "New limit description after upgrade",
  new_limit_2: "Second new limit description",
  new_feature_1: "New feature unlocked by upgrade",
  days_active: "Number of days the user has been active",

  // Feature
  feature_name: "Name of the feature being promoted",
  feature_url: "Relative URL to the feature page",
  feature_description: "Short description of the feature",
  feature_rationale: "Why the feature was built",
  feature_value_prop: "Value proposition (e.g. saves you 2 hours/week)",
  feature_benefit_1: "First feature benefit",
  feature_benefit_2: "Second feature benefit",
  required_plan: "Plan required to unlock the feature",
  estimated_time_saved: "Estimated time saved per week",
  setup_time: "Estimated setup time (e.g. 5 minutes)",
  result_1: "First result teams typically see",
  result_2: "Second result teams typically see",

  // Billing
  amount: "Payment amount (e.g. $49.00)",
  payment_date: "Date payment was attempted",
  failure_reason: "Reason for payment failure",
  grace_period_days: "Days before service is paused",
  grace_period_end: "Date grace period ends",
  billing_date: "Date of successful billing",
  next_renewal_date: "Next scheduled renewal date",
  next_billing_date: "Date of next invoice",
  payment_method_last4: "Last 4 digits of payment method",
  billing_email: "Email address invoices are sent to",
  plan_name: "Subscription plan name",
  cycle_end_date: "End of current billing cycle",
  limit_change_1: "First limit change description",
  limit_change_2: "Second limit change description",
  feature_removed_1: "Feature name being removed",

  // Engagement
  messages_sent: "Number of messages sent while user was away",
  automations_triggered: "Number of automations triggered",
  new_contacts: "Number of new contacts added",
  pending_conversations: "Number of conversations awaiting review",
  failed_messages: "Number of failed message deliveries",
  unused_feature: "Name of a feature the user hasn't set up",
  new_feature_2: "Second new feature released recently",
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;
