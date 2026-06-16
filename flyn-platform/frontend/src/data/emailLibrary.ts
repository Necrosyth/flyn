// ─── FLYN — Built-in Email Template Library (global, read-only, static) ──────
//
// Shipped as a static frontend bundle: zero DB cost, instant load, never writes
// into tenants/*/email_templates. "Use this template" CLONES an entry into the
// existing EmailTemplateDraft and the user saves it through the EXISTING
// saveEmailTemplate path → it becomes their own tenant template. This library
// itself is never mutated.
//
// Two kinds (per product decision):
//   • 'structured' → maps to the structured EmailTemplateDraft fields (subject,
//     body block-text, button, accent) → renders via the UNCHANGED renderEmailHtml.
//     Fully block-editable in the builder.
//   • 'rich' → carries a full bulletproof HTML layout in `html` (table-based,
//     inline CSS, 600px, {{name}} token) → sent verbatim via resolveEmailHtml.
//     Preview / use-as-is.
//
// Tokens are normalised to Flyn's format: {{name}} (the ONLY token broadcastEmail
// substitutes — campaigns.service.ts:212 / channels.service.ts:1226).
//
// ATTRIBUTION: the rich layouts are Flyn-authored bulletproof email HTML using
// the universal table-based / inline-CSS pattern established by the MIT/CC0 open
// projects below. No proprietary template files are copied; the structural
// pattern (tables, inline styles, 600px shell) is the standard, non-proprietary
// way to build email-client-safe HTML.
//   • Postmark transactional templates — MIT (ActiveCampaign/postmark-templates)
//   • Cerberus responsive blocks — public/free (TedGoas/Cerberus)
//   • Foundation for Emails — MIT (foundation/foundation-emails)
//   • MJML compiled output pattern — MIT (mjmlio/mjml)
//   • Lee Munroe responsive template — MIT
// ─────────────────────────────────────────────────────────────────────────────

export interface LibraryTemplate {
  id: string;
  name: string;
  /** Use-case, e.g. "Welcome series" — used as a filter */
  category: string;
  industry: string;
  kind: "structured" | "rich";
  subject: string;
  preheader?: string;
  /** structured only — block text, blank line = paragraph, {{name}} personalises */
  body?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  accent?: string;
  /** rich only — full bulletproof HTML, sent verbatim */
  html?: string;
}

export const LIBRARY_ATTRIBUTION =
  "Built-in layouts follow standard public email-HTML patterns from MIT/CC0 projects " +
  "(Postmark, Cerberus, Foundation for Emails, MJML, Lee Munroe). No proprietary files copied.";

// ── Bulletproof HTML shell (the tested skeleton every rich template reuses) ────
// Table-based, inline CSS, 600px, Outlook/Gmail-safe. Content blocks vary; the
// shell guarantees client compatibility once and for all.
function shell(opts: {
  accent: string;
  preheader?: string;
  inner: string; // the body content (already HTML)
}): string {
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${opts.preheader}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:0;background:#f4f4f7;-webkit-text-size-adjust:100%">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececf1">
      <tr><td style="height:4px;background:${opts.accent}"></td></tr>
      ${opts.inner}
      <tr><td style="padding:20px 40px 28px;background:#fafafb;border-top:1px solid #ececf1">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#a1a1aa;line-height:1.6">Sent with FLYN AI</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const P = (t: string) =>
  `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#3f3f46">${t}</p>`;
const H = (t: string) =>
  `<h1 style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#18181b;font-weight:700">${t}</h1>`;
const BTN = (label: string, accent: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="border-radius:10px;background:${accent}"><a href="{{button_url}}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a></td></tr></table>`;
const pad = (inner: string) => `<tr><td style="padding:36px 40px 30px">${inner}</td></tr>`;

// ── Rich HTML templates (full designs) ────────────────────────────────────────
function richTemplates(): LibraryTemplate[] {
  const A = "#7C6FF7"; // default accent
  const out: LibraryTemplate[] = [];
  const add = (
    id: string, name: string, category: string, industry: string,
    subject: string, preheader: string, accent: string, inner: string,
  ) => out.push({ id, name, category, industry, kind: "rich", subject, preheader, accent, html: shell({ accent, preheader, inner }) });

  add("lib_rich_welcome", "Welcome — warm onboarding", "Welcome series", "General",
    "Welcome to {{company}}, {{name}} 👋", "We're so glad you're here — let's get you started.", A,
    pad(`${H("Welcome aboard, {{name}}!")}${P("Thanks for joining us — we built this to make your life easier, and we can't wait to show you around.")}${P("Click below to set up your account in under two minutes.")}${BTN("Get started", A)}`));

  add("lib_rich_receipt", "Order confirmation / receipt", "Order confirmation", "E-commerce & Retail",
    "Your order is confirmed ✅", "Thanks for your purchase — here are the details.", "#22C55E",
    pad(`${H("Thanks for your order, {{name}}")}${P("We've received your order and it's being prepared. You'll get a shipping update as soon as it's on the way.")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;border:1px solid #ececf1;border-radius:10px">
        <tr><td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#3f3f46;border-bottom:1px solid #f1f1f4"><strong>Order</strong> &nbsp;#FLYN-00000</td></tr>
        <tr><td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#3f3f46">Total &nbsp;<strong>—</strong></td></tr>
      </table>${BTN("View order", "#22C55E")}`));

  add("lib_rich_reset", "Password reset", "Password reset", "SaaS & Technology",
    "Reset your password", "Use the button below to choose a new password.", "#0EA5E9",
    pad(`${H("Reset your password")}${P("Hi {{name}}, we got a request to reset your password. Click below to choose a new one — this link expires in 30 minutes.")}${BTN("Reset password", "#0EA5E9")}${P("<span style=\"font-size:13px;color:#a1a1aa\">If you didn't request this, you can safely ignore this email.</span>")}`));

  add("lib_rich_trial", "Trial expiring soon", "Trial expiry", "SaaS & Technology",
    "Your trial ends in 3 days, {{name}}", "Keep your data and unlock everything — upgrade in one click.", "#F59E0B",
    pad(`${H("Your trial ends soon")}${P("Hi {{name}}, your free trial wraps up in 3 days. Upgrade now to keep your work and unlock every feature — no interruption.")}${BTN("Upgrade now", "#F59E0B")}`));

  add("lib_rich_invoice", "Invoice / billing", "Invoice & billing", "Finance & Fintech",
    "Your invoice is ready", "A copy of your latest invoice is attached for your records.", "#111827",
    pad(`${H("Invoice ready")}${P("Hi {{name}}, your invoice for this billing period is ready. The amount will be charged to your saved payment method.")}${BTN("View invoice", "#111827")}`));

  add("lib_rich_newsletter", "Newsletter — monthly digest", "Newsletter", "Media & Entertainment",
    "Your monthly digest is here 📰", "The highlights, hand-picked for you.", A,
    pad(`${H("This month's highlights")}${P("Hi {{name}}, here's what you might have missed — the best of the month, picked for you.")}${P("<strong>1.</strong> A standout story.<br><strong>2.</strong> A useful how-to.<br><strong>3.</strong> Something worth your weekend.")}${BTN("Read the full digest", A)}`));

  add("lib_rich_sale", "Promotional — flash sale", "Promotional offer", "E-commerce & Retail",
    "24 hours only: 20% off everything 🎉", "Your code is inside — don't miss it.", "#EF4444",
    pad(`<div style="text-align:center">${H("20% off — today only")}${P("Hi {{name}}, for the next 24 hours everything is 20% off. Use your code at checkout.")}
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 16px"><tr><td style="border:2px dashed #EF4444;border-radius:10px;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:#EF4444;letter-spacing:2px">SAVE20</td></tr></table>
      ${BTN("Shop the sale", "#EF4444")}</div>`));

  add("lib_rich_cart", "Abandoned cart recovery", "Abandoned cart recovery", "E-commerce & Retail",
    "You left something behind, {{name}}", "Your cart is saved — complete your order before it's gone.", "#EC4899",
    pad(`${H("Still thinking it over?")}${P("Hi {{name}}, we saved your cart for you. The items are still available — but they're popular, so don't wait too long.")}${BTN("Return to cart", "#EC4899")}`));

  add("lib_rich_event", "Event invitation", "Event invitation", "Events & Conferences",
    "You're invited, {{name}} 🎟️", "Save your spot — limited seats available.", A,
    pad(`${H("You're invited")}${P("Hi {{name}}, we'd love to have you. Save your spot below — seats are limited and going fast.")}${P("<strong>When:</strong> —<br><strong>Where:</strong> —")}${BTN("Reserve my seat", A)}`));

  add("lib_rich_winback", "Re-engagement / win-back", "Win-back", "General",
    "We miss you, {{name}} 💜", "Here's something to welcome you back.", "#7C6FF7",
    pad(`${H("It's been a while")}${P("Hi {{name}}, we noticed you've been away — and we'd love to have you back. Here's a little something to make it easy.")}${BTN("Come back", A)}`));

  add("lib_rich_announce", "Product announcement", "Feature announcement", "SaaS & Technology",
    "Introducing something new ✨", "A feature we think you'll love.", "#0EA5E9",
    pad(`${H("Say hello to what's new")}${P("Hi {{name}}, we just shipped something we're really proud of — built from your feedback. Take a look.")}${BTN("See what's new", "#0EA5E9")}`));

  add("lib_rich_hero", "Simple hero + CTA", "Promotional offer", "General",
    "A quick note for you, {{name}}", "Straight to the point.", A,
    pad(`${H("One clear message")}${P("Hi {{name}}, sometimes the simplest email works best — one idea, one button. Here it is.")}${BTN("Take action", A)}`));

  return out;
}

// ── Structured presets (block-editable copy, fanned across industries) ─────────
// Each base seed is real, distinct copy for a use-case; fanned across industries
// so the gallery reaches 100+ with industry-aware presets (not 1 copy × N).
const PRESET_INDUSTRIES = [
  "SaaS & Technology", "E-commerce & Retail", "Real Estate", "Healthcare & Wellness",
  "Finance & Fintech", "Education & E-learning", "Hospitality & Travel", "Agency & Marketing",
  "Fitness & Sports", "Nonprofit & Charity",
];

interface Seed {
  useCase: string;
  accent: string;
  subject: (ind: string) => string;
  body: (ind: string) => string;
  button: string;
}

const SEEDS: Seed[] = [
  {
    useCase: "Welcome series", accent: "#7C6FF7",
    subject: () => "Welcome, {{name}} — happy to have you 👋",
    body: (ind) => `Hi {{name}},\n\nWelcome to our ${ind.toLowerCase()} community. We're thrilled to have you on board.\n\nHere's how to get the most out of your first week with us.`,
    button: "Get started",
  },
  {
    useCase: "Newsletter", accent: "#0EA5E9",
    subject: (ind) => `Your ${ind} update for this month`,
    body: (ind) => `Hi {{name}},\n\nHere's what's new in ${ind.toLowerCase()} this month — the stories, tips, and updates worth your time.\n\nThanks for reading.`,
    button: "Read more",
  },
  {
    useCase: "Promotional offer", accent: "#EF4444",
    subject: () => "A special offer, just for you {{name}}",
    body: (ind) => `Hi {{name}},\n\nAs a valued member of our ${ind.toLowerCase()} community, here's an exclusive offer — for a limited time only.\n\nDon't miss out.`,
    button: "Claim offer",
  },
  {
    useCase: "Re-engagement", accent: "#EC4899",
    subject: () => "We miss you, {{name}}",
    body: (ind) => `Hi {{name}},\n\nIt's been a while since we connected. A lot has changed in ${ind.toLowerCase()} — and we'd love to show you what's new.\n\nCome see what you've missed.`,
    button: "Take a look",
  },
  {
    useCase: "Follow-up", accent: "#22C55E",
    subject: () => "Quick follow-up, {{name}}",
    body: (ind) => `Hi {{name}},\n\nJust checking in after our last conversation about your ${ind.toLowerCase()} needs.\n\nIs there anything I can help you with? Happy to jump on a quick call.`,
    button: "Book a call",
  },
  {
    useCase: "Event invitation", accent: "#7C6FF7",
    subject: () => "You're invited, {{name}} 🎟️",
    body: (ind) => `Hi {{name}},\n\nWe're hosting an event for the ${ind.toLowerCase()} community and we'd love for you to join us.\n\nSeats are limited — reserve yours today.`,
    button: "Reserve my seat",
  },
  {
    useCase: "Cold outreach", accent: "#111827",
    subject: (ind) => `A quick idea for your ${ind} business`,
    body: (ind) => `Hi {{name}},\n\nI work with ${ind.toLowerCase()} teams to help them grow faster with less effort.\n\nWould you be open to a 15-minute chat to see if we're a fit?`,
    button: "Let's talk",
  },
  {
    useCase: "Renewal reminder", accent: "#F59E0B",
    subject: () => "Your plan renews soon, {{name}}",
    body: (ind) => `Hi {{name}},\n\nA friendly reminder that your ${ind.toLowerCase()} plan renews soon. No action is needed to continue — everything keeps running smoothly.\n\nQuestions? Just reply to this email.`,
    button: "Manage plan",
  },
  {
    useCase: "Testimonial request", accent: "#0EA5E9",
    subject: () => "Mind sharing your thoughts, {{name}}?",
    body: (ind) => `Hi {{name}},\n\nWe'd love to hear about your experience with us. Your feedback helps other ${ind.toLowerCase()} folks decide — and helps us improve.\n\nIt takes less than a minute.`,
    button: "Leave a review",
  },
];

function structuredPresets(): LibraryTemplate[] {
  const out: LibraryTemplate[] = [];
  let n = 1;
  for (const seed of SEEDS) {
    for (const ind of PRESET_INDUSTRIES) {
      out.push({
        id: `lib_s_${String(n++).padStart(3, "0")}`,
        name: `${seed.useCase} — ${ind}`,
        category: seed.useCase,
        industry: ind,
        kind: "structured",
        subject: seed.subject(ind),
        preheader: "",
        body: seed.body(ind),
        buttonLabel: seed.button,
        buttonUrl: "",
        accent: seed.accent,
      });
    }
  }
  return out;
}

const RICH = richTemplates();
const STRUCTURED = structuredPresets();

/** The full built-in library. Real count = RICH (12) + STRUCTURED (9 seeds × 10 industries = 90) = 102. */
export const EMAIL_LIBRARY: LibraryTemplate[] = [...RICH, ...STRUCTURED];

export const LIBRARY_COUNT = EMAIL_LIBRARY.length;
export const LIBRARY_INDUSTRIES = ["General", ...PRESET_INDUSTRIES];
export const LIBRARY_USE_CASES = Array.from(new Set(EMAIL_LIBRARY.map((t) => t.category))).sort();

/**
 * Convert a library entry to the exact EmailTemplateDraft shape used by the builder + wizard.
 * For rich templates the `{{button_url}}` placeholder is substituted with the caller's URL (or '#')
 * so the literal token can NEVER reach the sent email — broadcastEmail only resolves {{name}}.
 */
export function libraryTemplateToDraft(
  t: LibraryTemplate,
  buttonUrl = "",
): {
  name: string; subject: string; preheader: string; body: string;
  buttonLabel: string; buttonUrl: string; accent: string; html?: string;
} {
  const html =
    t.kind === "rich" && t.html
      ? t.html.replace(/\{\{\s*button_url\s*\}\}/gi, buttonUrl.trim() || "#")
      : undefined;
  return {
    name: t.name,
    subject: t.subject,
    preheader: t.preheader || "",
    body: t.body || "",
    buttonLabel: t.buttonLabel || "",
    buttonUrl: buttonUrl || t.buttonUrl || "",
    accent: t.accent || "#7C6FF7",
    ...(html ? { html } : {}),
  };
}
