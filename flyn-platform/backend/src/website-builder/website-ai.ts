// ─── FLYN AI Website Builder — Generation Engine + CMS/Drag-and-Drop Support ──
// Model: Claude Haiku 4.5 (standard) | Claude Sonnet 4.6 (premium)
// Cost:  ~$0.02–0.06 per full website (Haiku) | ~$0.15–0.30 (Sonnet)
//
// The AI generates structured page data (sections JSON) alongside the
// compiled HTML. This enables the drag-and-drop CMS editor to:
//   - Move sections up/down
//   - Edit text/images inline
//   - Add/remove sections
//   - Re-style individual sections
//   - Re-generate any single section without rebuilding the whole page
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

type Model = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';

async function claude(
  system: string,
  userPrompt: string,
  model: Model = 'claude-haiku-4-5-20251001',
  maxTokens    = 12000,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY env var is not set');

  const res = await fetch(ANTHROPIC_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userPrompt }] }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find(b => b.type === 'text')?.text ?? '';
}

// ══════════════════════════════════════════════════════════════════════════════
// CMS-READY SECTION SCHEMA
// Every generated website is stored both as compiled HTML AND as structured
// section data, enabling the drag-and-drop CMS editor.
// ══════════════════════════════════════════════════════════════════════════════

export interface CmsSection {
  id:       string;         // unique slug: 'hero', 'features', 'team-1', etc.
  type:     string;         // 'hero' | 'features' | 'testimonials' | 'contact' | etc.
  order:    number;         // display order (0-indexed)
  label:    string;         // Human name: "Hero Section", "About Us", etc.
  visible:  boolean;        // toggle visibility without deleting
  html:     string;         // compiled HTML for this section only
  // Editable fields (CMS editor shows these as form inputs)
  fields: {
    [key: string]: {
      type:    'text' | 'textarea' | 'image' | 'color' | 'url' | 'boolean' | 'select' | 'list';
      label:   string;
      value:   string | boolean | string[];
      options?: string[];   // for 'select' type
    };
  };
  // Style overrides (CMS editor → style panel)
  styles: {
    backgroundColor?: string;
    textColor?:       string;
    paddingTop?:      string;
    paddingBottom?:   string;
    backgroundImage?: string;
    layout?:          string;
  };
}

export interface CmsPage {
  id:          string;
  slug:        string;      // 'homepage', 'about', 'contact', etc.
  title:       string;
  sections:    CmsSection[];
  seo: {
    title:       string;
    description: string;
    keywords:    string;
    ogImage?:    string;
  };
  // Compiled full HTML (reassembled from sections)
  compiledHtml: string;
  // Global styles (CSS variables — shared across all sections)
  cssVariables: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN GENERATION — produces both HTML + CMS section data
// ══════════════════════════════════════════════════════════════════════════════

export interface WebsiteInput {
  businessName:       string;
  industry:           string;
  purpose:            string;
  description:        string;
  location?:          string;
  colorScheme?:       string;
  fontStyle?:         string;
  features:           Record<string, boolean>;
  pageType?:          string;
  quality?:           'standard' | 'premium';
  additionalContext?: string;
  templateId?:        string;
}

export interface GenerationResult {
  html:         string;
  cmsPage:      CmsPage;
  cssVariables: string;
  title:        string;
  tokensUsed:   number;
  costUsd:      number;
  pageType:     string;
}

const WORLD_CLASS_SYSTEM = `You are an expert web developer who builds stunning, fully-designed websites.

CRITICAL OUTPUT RULES:
1. Your response MUST start with exactly "<!DOCTYPE html>" — no backticks, no markdown, no JSON, no explanation, no code fences.
2. You MUST end your response with </body></html> — never leave the document incomplete.
3. Keep your HTML compact and efficient. Inline all CSS in one <style> block. No external CSS files.

The website must include:
1. A <style> block in <head> with ALL CSS (colors, typography, layout, hover effects, animations, responsive breakpoints)
2. Real hex color values in :root CSS variables (e.g. --primary: #2563eb; --accent: #f59e0b; --bg: #ffffff; --text: #1e293b;)
3. Google Fonts via ONE combined <link rel="stylesheet"> with font-display:swap so text shows instantly with fallbacks
4. Navigation with logo, links, CTA button, mobile hamburger toggle
5. Hero section with full-width background, large headline, subheadline, 2 CTA buttons
6. Feature/benefits cards with SVG icons and hover effects
7. Footer with columns and copyright
8. JavaScript in ONE <script> tag before </body> for hamburger menu and scroll animations
9. Every major section in a <section id="..."> tag

CSS must use CSS custom properties. Example :root:
:root {
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --accent: #f59e0b;
  --bg: #ffffff;
  --surface: #f8fafc;
  --text: #1e293b;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --radius: 8px;
}

Font fallbacks REQUIRED: always add system fallbacks after each Google Font (e.g. font-family: 'Inter', system-ui, sans-serif).
Use actual hex/rgb values matching the requested color scheme. Make the page visually impressive.`;

function buildFeaturePrompt(features: Record<string, boolean>): string {
  const map: Record<string, string> = {
    members:      'MEMBERSHIP REGISTRATION: Tier pricing cards + full signup form (name, email, password, tier selection, terms) + "Already a member? Sign in" link',
    donations:    'DONATIONS: Impact headline, preset amounts ($25/$50/$100/$250/Custom), one-time/monthly toggle, goal progress bar, secure payment badges, donor count',
    volunteers:   'VOLUNTEER SECTION: Opportunity cards (role, commitment, skills needed, spots), application form with availability checkboxes + skills multi-select',
    registration: 'EVENT REGISTRATION: Event details sidebar, ticket type selection, attendee form, payment summary, confirmation design',
    leadCapture:  'LEAD CAPTURE: Value proposition section, email+name form, lead magnet description, social proof subscriber count, privacy assurance',
    ecommerce:    'PRODUCT GRID: Category filter tabs, product cards (image, name, price, rating stars, Add to Cart), sale badges',
    blog:         'BLOG SECTION: 3 featured article cards (category, date, reading time, title, excerpt, author), View All button',
    booking:      'BOOKING: Service cards, CSS calendar widget, time slot grid, booking form, summary sidebar',
    gallery:      'GALLERY: CSS masonry grid, hover overlay with zoom icon + caption, category filter tabs',
    events:       'EVENTS: Featured event card + upcoming events list (date chip, title, location, RSVP button)',
    testimonials: 'TESTIMONIALS: 3 cards with 5-star rating, quote, client name + title + company, avatar initials circle',
    pricing:      'PRICING TABLE: 3 tiers, monthly/annual JS toggle, feature comparison, "Most Popular" badge, CTAs',
    team:         'TEAM: Cards with avatar circle, name, role, bio, LinkedIn SVG icon',
    faq:          'FAQ ACCORDION: 7 Q&A pairs, smooth JS height animation (max-height), category tabs',
    contact:      'CONTACT: Split layout (form left, info+map right), floating label inputs, success state, validation',
    newsletter:   'NEWSLETTER BANNER: Full-width, compelling headline, email input + subscribe, subscriber count, privacy note',
    portfolio:    'PORTFOLIO GRID: Category filter, project cards with hover overlay, featured case study',
    stats:        'STATS BAR: 4 animated counters via IntersectionObserver, specific industry numbers',
  };

  const active = Object.entries(features).filter(([, v]) => v).map(([k]) => map[k]).filter(Boolean);
  if (!active.length) return '';
  return `\n\nREQUIRED SECTIONS (build ALL — complete and functional):\n${active.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

export async function generateWebsite(input: WebsiteInput): Promise<GenerationResult> {
  const model = input.quality === 'premium' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  const t0    = Date.now();

  const colorHint = input.colorScheme || `professional palette for ${input.industry} industry`;
  const fontHint  = input.fontStyle   || 'modern clean sans-serif';
  const location  = input.location    ? `\nLocation: ${input.location}` : '';
  const extra     = input.additionalContext ? `\nAdditional context: ${input.additionalContext}` : '';
  const features  = buildFeaturePrompt(input.features);

  const prompt = `Generate a complete, world-class ${input.pageType ?? 'homepage'} for:

Business Name: ${input.businessName}
Industry: ${input.industry}
Purpose: ${input.purpose}
Description: ${input.description}${location}${extra}
Color scheme: ${colorHint}
Typography: ${fontHint}
${features}

ALWAYS INCLUDE (every website):
1. Sticky nav: logo + links + CTA + mobile hamburger (JS toggle)
2. Hero: full-viewport, power headline, subtext, 2 CTAs, visual element (CSS/SVG)
3. Features/Benefits: 3+ cards with SVG icons
4. Social proof: stats bar OR testimonials OR logo strip
5. Pre-footer CTA section
6. Multi-column footer: nav columns, social SVGs, newsletter input, copyright

COPY RULE: Every word must be specific to ${input.businessName} in the ${input.industry} industry. No generic filler.

Return ONLY the complete HTML document starting with <!DOCTYPE html>.`;

  // Haiku max output = 8192 tokens; Sonnet 4.6 supports much larger output
  const maxToks = model === 'claude-sonnet-4-6' ? 16000 : 8000;
  const raw = await claude(WORLD_CLASS_SYSTEM, prompt, model, maxToks);

  // Strip code fences — trim first so leading whitespace doesn't block the match
  let html = raw.trim();
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    const firstNewline = html.indexOf('\n');
    if (firstNewline !== -1 && html.slice(0, firstNewline).includes('`')) {
      html = html.slice(firstNewline + 1);
    }
    const lastFence = html.lastIndexOf('\n```');
    if (lastFence !== -1) html = html.slice(0, lastFence);
    html = html.trim();
  }

  if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
    throw new Error('AI returned invalid HTML. Please try again.');
  }

  // Detect truncated output (model hit token limit mid-generation)
  const hasClosingBody = /<\/body\s*>/i.test(html);
  const hasClosingHtml = /<\/html\s*>/i.test(html);
  if (!hasClosingBody || !hasClosingHtml) {
    // Close any open section/div and append proper closing tags
    if (!hasClosingBody) html += '\n</body>';
    if (!hasClosingHtml) html += '\n</html>';
    console.warn(`[WebsiteAI] HTML was truncated and auto-closed for: ${input.businessName}`);
  }

  // Extract sections from <section> tags in the HTML
  const cmsSections: CmsSection[] = [];
  const sectionRegex = /<section([^>]*)>([\s\S]*?)<\/section>/gi;
  let sectionMatch: RegExpExecArray | null;
  let sectionIdx = 0;
  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const attrs = sectionMatch[1];
    const idMatch   = attrs.match(/id=["']([^"']+)["']/i);
    const typeMatch = attrs.match(/data-section-type=["']([^"']+)["']/i);
    const id    = idMatch?.[1]   ?? `section-${sectionIdx}`;
    const type  = typeMatch?.[1] ?? id;
    const label = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    cmsSections.push({
      id, type, order: sectionIdx, label, visible: true,
      html:   sectionMatch[0],
      fields: {},
      styles: {},
    });
    sectionIdx++;
  }

  // Extract CSS variables from the compiled HTML for re-use in additional pages
  const cssVarMatch = html.match(/:root\s*{([^}]+)}/);
  const cssVariables = cssVarMatch ? `:root{${cssVarMatch[1]}}` : '';

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title      = titleMatch?.[1]?.trim() ?? input.businessName;

  // Extract SEO fields
  const metaDesc   = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';

  const inputToks  = Math.round(prompt.length / 4);
  const outputToks = Math.round(html.length / 4);
  const rate       = model === 'claude-haiku-4-5-20251001' ? { in: 1, out: 5 } : { in: 3, out: 15 };
  const costUsd    = ((inputToks * rate.in) + (outputToks * rate.out)) / 1_000_000;

  console.log(`[WebsiteAI] ${input.businessName} | ${Date.now() - t0}ms | $${costUsd.toFixed(4)} | ${model}`);

  const cmsPage: CmsPage = {
    id:           `page-${Date.now()}`,
    slug:         input.pageType ?? 'homepage',
    title,
    sections:     cmsSections,
    seo: { title, description: metaDesc, keywords: input.industry, ogImage: '' },
    compiledHtml: html,
    cssVariables,
  };

  return { html, cmsPage, cssVariables, title, tokensUsed: inputToks + outputToks, costUsd, pageType: input.pageType ?? 'homepage' };
}

// ══════════════════════════════════════════════════════════════════════════════
// REGENERATE A SINGLE SECTION (CMS editor "Regenerate" button)
// ══════════════════════════════════════════════════════════════════════════════

export async function regenerateSection(params: {
  sectionType:   string;
  sectionLabel:  string;
  instruction:   string;
  businessName:  string;
  industry:      string;
  cssVariables:  string;
}): Promise<{ html: string; fields: CmsSection['fields'] }> {
  const system = `You are a web developer improving one section of a website.
Return JSON only: {"html": "<section>...</section>", "fields": {}}
Match the CSS variables provided. No explanation.`;

  const prompt = `Regenerate the ${params.sectionLabel} section for ${params.businessName} (${params.industry}).
Instruction: ${params.instruction}
Use these CSS variables: ${params.cssVariables}
Return JSON with "html" and "fields" keys.`;

  const raw   = await claude(system, prompt, 'claude-haiku-4-5-20251001', 6000);
  const clean = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return { html: parsed.html ?? clean, fields: parsed.fields ?? {} };
  } catch {
    return { html: clean, fields: {} };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPILE HTML FROM CMS SECTIONS (reassemble after drag-and-drop edits)
// ══════════════════════════════════════════════════════════════════════════════

export function compileCmsPage(page: CmsPage): string {
  const visibleSections = page.sections
    .filter(s => s.visible)
    .sort((a, b) => a.order - b.order)
    .map(s => s.html)
    .join('\n');

  // Rebuild full HTML with updated sections
  const originalHtml = page.compiledHtml;

  // Find the body content and replace it
  const bodyMatch = originalHtml.match(/(<body[^>]*>)([\s\S]*)(<\/body>)/i);
  if (bodyMatch) {
    return originalHtml.replace(bodyMatch[0], `${bodyMatch[1]}\n${visibleSections}\n${bodyMatch[3]}`);
  }

  // Fallback: wrap sections in a minimal HTML shell
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title}</title>
<style>${page.cssVariables}</style></head>
<body>${visibleSections}</body></html>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE ADDITIONAL PAGE (maintains style consistency with homepage)
// ══════════════════════════════════════════════════════════════════════════════

export async function generateAdditionalPage(params: {
  pageType:     string;
  businessName: string;
  industry:     string;
  description:  string;
  cssVariables: string;
  features?:    Record<string, boolean>;
}): Promise<GenerationResult> {
  return generateWebsite({
    businessName:       params.businessName,
    industry:           params.industry,
    purpose:            params.pageType,
    description:        params.description,
    features:           params.features ?? { contact: true },
    pageType:           params.pageType,
    additionalContext:  `Use these CSS variables to match the homepage style: ${params.cssVariables.slice(0, 500)}`,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// AI CONTENT EDITOR — update any text field via natural language
// ══════════════════════════════════════════════════════════════════════════════

export async function rewriteContent(params: {
  currentText:  string;
  instruction:  string;
  businessName: string;
  tone?:        string;
}): Promise<string> {
  const system = 'You are a professional copywriter. Rewrite the provided text per the instruction. Return ONLY the rewritten text. No explanation.';
  const prompt = `Business: ${params.businessName}
Tone: ${params.tone ?? 'professional and engaging'}
Instruction: ${params.instruction}
Current text: ${params.currentText}
Return the rewritten text only.`;

  return claude(system, prompt, 'claude-haiku-4-5-20251001', 2000);
}

// ══════════════════════════════════════════════════════════════════════════════
// SEO ANALYSIS + OPTIMIZATION
// ══════════════════════════════════════════════════════════════════════════════

export async function analyzeSeo(params: { html: string; businessName: string; industry: string }): Promise<Record<string, unknown>> {
  const system = 'You are an SEO expert. Return only valid JSON. No markdown.';
  const prompt = `Analyze SEO for ${params.businessName} (${params.industry}).
HTML excerpt: ${params.html.slice(0, 6000)}
Return JSON: {"score":0-100,"title":{"current":"","score":0-100,"suggestion":""},"metaDescription":{"current":"","score":0-100,"suggestion":""},"issues":[{"severity":"high|medium|low","issue":"","fix":""}],"keywords":[],"suggestions":[]}`;

  const raw = await claude(system, prompt, 'claude-haiku-4-5-20251001', 3000);
  try { return JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')); }
  catch { return { score: 0, error: 'Analysis failed' }; }
}

export async function applySeOptimizations(params: { html: string; businessName: string; industry: string }): Promise<string> {
  const system = `You are an SEO developer. Apply SEO improvements to the HTML.
Return ONLY the complete updated HTML file starting with <!DOCTYPE html>. No explanation.`;

  const prompt = `Optimize SEO for ${params.businessName} (${params.industry}):
- Title: 50-60 chars with primary keyword
- Meta description: 150-160 chars, compelling
- OG tags: og:title, og:description, og:type, og:url
- JSON-LD schema: LocalBusiness or Organization markup
- H1 with primary keyword
- Alt text on all images
- Canonical URL
- robots meta tag

HTML: ${params.html.slice(0, 14000)}

Return complete optimized HTML.`;

  return claude(system, prompt, 'claude-haiku-4-5-20251001', 12000);
}

// ══════════════════════════════════════════════════════════════════════════════
// CLONE FROM URL (like 10Web's "Recreate from URL")
// ══════════════════════════════════════════════════════════════════════════════

export async function cloneFromUrl(params: {
  sourceHtml:   string;
  businessName: string;
  industry:     string;
  description:  string;
  colorScheme?: string;
}): Promise<GenerationResult> {
  const system = `You are a web developer. You analyze an existing website's layout structure and recreate it for a new brand.
Return ONLY the complete HTML document starting with <!DOCTYPE html>. No explanation. No JSON. No code fences.`;

  const prompt = `Analyze this website's LAYOUT STRUCTURE (sections, navigation style, card grids, footer pattern):

SOURCE HTML (excerpt):
${params.sourceHtml.slice(0, 10000)}

Recreate the SAME LAYOUT STRUCTURE but with completely new content for:
Business: ${params.businessName}
Industry: ${params.industry}
Description: ${params.description}
Colors: ${params.colorScheme ?? 'choose appropriate for industry'}

Rules:
- Keep the same section order and layout patterns
- Replace ALL content — no copied text from source
- Mobile responsive, Google Fonts, CSS custom properties in <style> tag
- Each section wrapped in <section> tag with id attribute
- Return complete <!DOCTYPE html>…</html> document only`;

  const raw      = await claude(system, prompt, 'claude-haiku-4-5-20251001', 8000);
  let cloneHtml  = raw.trim();
  if (!cloneHtml.startsWith('<!DOCTYPE') && !cloneHtml.startsWith('<html')) {
    const nl = cloneHtml.indexOf('\n');
    if (nl !== -1 && cloneHtml.slice(0, nl).includes('`')) cloneHtml = cloneHtml.slice(nl + 1);
    const lf = cloneHtml.lastIndexOf('\n```');
    if (lf !== -1) cloneHtml = cloneHtml.slice(0, lf);
    cloneHtml = cloneHtml.trim();
  }
  const html = cloneHtml;

  const cssVarMatch = html.match(/:root\s*{([^}]+)}/);
  const cssVariables = cssVarMatch ? `:root{${cssVarMatch[1]}}` : '';
  const titleMatch   = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title        = titleMatch?.[1]?.trim() ?? params.businessName;

  const cmsSections: CmsSection[] = [];
  const cloneSectionRx = /<section([^>]*)>([\s\S]*?)<\/section>/gi;
  let cloneMatch: RegExpExecArray | null;
  let cloneIdx = 0;
  while ((cloneMatch = cloneSectionRx.exec(html)) !== null) {
    const idM = cloneMatch[1].match(/id=["']([^"']+)["']/i);
    const id  = idM?.[1] ?? `section-${cloneIdx}`;
    cmsSections.push({
      id, type: id, order: cloneIdx,
      label:   id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      visible: true, html: cloneMatch[0], fields: {}, styles: {},
    });
    cloneIdx++;
  }

  return {
    html, title, cssVariables, pageType: 'homepage',
    tokensUsed: Math.round((prompt.length + html.length) / 4),
    costUsd:    ((prompt.length + html.length) / 4 * 6) / 1_000_000,
    cmsPage: {
      id: `page-${Date.now()}`, slug: 'homepage', title,
      sections: cmsSections,
      seo: { title, description: params.description, keywords: params.industry },
      compiledHtml: html, cssVariables,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT REVISE — AI chatbot revisions on the live editor HTML
// Supports multi-turn conversation and targeted section editing.
// ══════════════════════════════════════════════════════════════════════════════

export interface ChatMessage {
  role: 'user' | 'ai' | 'system';
  content: string;
}

export async function chatRevise(params: {
  messages:     ChatMessage[];
  html:         string;
  selectedId?:  string;
  model?:       Model;
}): Promise<{ html: string; reply: string }> {
  const system = `You are an expert AI Website Editor. The user has an existing website and wants revisions.

CURRENT STATE:
1. HTML: Provided in the user prompt.
2. SELECTED SECTION: ${params.selectedId || 'None'} (If specified, prioritize changes here).

RULES:
- Apply ONLY the changes asked for. Keep design, structure, and CSS identical otherwise.
- If you add a new section, ensure it follows the existing design system (CSS variables).
- Return valid JSON only. No explanation.
- JSON schema: {"html": "complete updated <!DOCTYPE html>...", "reply": "short confirmation of what you did"}
`;

  // Filter history to last 5 turns to keep context window clean
  const history = params.messages.slice(-10);
  const userMsg = history[history.length - 1].content;
  const context = history.slice(0, -1).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

  // Trim HTML to fit within token budget: Haiku max output = 8192, reserve ~500 for reply overhead
  const htmlBudget = params.model === 'claude-sonnet-4-6' ? 40000 : 10000;
  const prompt = `CONVERSATION HISTORY:
${context}

LATEST USER REQUEST: ${userMsg}

CURRENT HTML:
${params.html.slice(0, htmlBudget)}

Apply the requested changes and return the JSON.`;

  // Haiku max output = 8192 tokens; Sonnet 4.6 can output much more
  const maxToks = params.model === 'claude-sonnet-4-6' ? 16000 : 8000;
  const raw = await claude(system, prompt, params.model ?? 'claude-haiku-4-5-20251001', maxToks);

  let parsed: { html?: string; reply?: string } = {};
  try {
    const clean = raw.trim()
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim();
    parsed = JSON.parse(clean);
  } catch {
    // Fallback: Model returned HTML directly or poorly formatted JSON
    let h = raw.trim();
    if (h.includes('<!DOCTYPE') || h.includes('<html')) {
      // Basic cleanup
      if (!h.startsWith('<!DOCTYPE')) h = h.slice(h.indexOf('<!DOCTYPE'));
      return { html: h, reply: 'Changes applied.' };
    }
    return { html: params.html, reply: "I couldn't process that change. Please try to be more specific!" };
  }

  return {
    html: parsed.html ?? params.html,
    reply: parsed.reply ?? 'Changes applied.',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FORM CREATOR — AI-generated custom forms
// ══════════════════════════════════════════════════════════════════════════════

export async function generateForm(params: {
  prompt:       string;
  businessName?: string;
  style?:       string;
}): Promise<{ html: string; fields: any[] }> {
  const system = `You are a web developer specializing in high-conversion forms.
Return ONLY valid JSON: {"html": "<form>...</form>", "fields": [{"name": "email", "label": "Email Address", "type": "email"}]}

CRITICAL STYLING RULES — you MUST follow these exactly:
- Every <label> must have: style="display:block;font-size:14px;font-weight:600;color:#374151;margin-bottom:6px;"
- Every <input> and <select> and <textarea> must have: style="display:block;width:100%;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px;color:#111827;background:#fff;outline:none;box-sizing:border-box;margin-bottom:16px;transition:border-color 0.2s;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#d1d5db'"
- The submit button must have: style="display:block;width:100%;padding:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;margin-top:8px;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'"
- Each field group must be wrapped in: <div style="margin-bottom:4px;">
- The <form> itself should have no styling (parent page handles it).
- Do NOT use Tailwind. Use ONLY inline styles as specified above.`;

  const userPrompt = `Generate a form for ${params.businessName || 'a business'}.
Requirement: ${params.prompt}
Style: ${params.style || 'modern and clean'}

Include proper name and id attributes on every input. Required fields must have the required attribute.
Return JSON with "html" (the <form> element) and "fields" ([{name, label, type}]) keys.`;

  const raw = await claude(system, userPrompt, 'claude-haiku-4-5-20251001', 4000);
  const clean = raw.trim()
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  
  try {
    return JSON.parse(clean);
  } catch {
    return { html: raw, fields: [] };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CMS SYNC — Update HTML sections with real data from CMS/CRM
// ══════════════════════════════════════════════════════════════════════════════

export async function syncCmsData(params: {
  html:         string;
  cmsData:      Record<string, any[]>; // Mapping of sectionId -> data array
  businessName: string;
}): Promise<string> {
  const system = `You are an AI Website Content Synchronizer. 
Your task is to update specific sections of an HTML document with REAL data provided from a database.

RULES:
1. Maintain the EXACT layout, classes, and CSS of the sections.
2. Replace placeholder content (names, descriptions, images) with the provided data.
3. If more data items are provided than placeholders exist, duplicate the item elements (e.g., cards, list items) to fit the data.
4. Return ONLY the complete updated HTML document starting with <!DOCTYPE html>.
5. Do NOT change any CSS variables or global styles unless it's necessary for the new content.
`;

  const dataContext = Object.entries(params.cmsData)
    .map(([sectionId, items]) => `Section ID: "${sectionId}"\nData to inject:\n${JSON.stringify(items, null, 2)}`)
    .join('\n\n');

  const prompt = `Synchronize the following website with live CMS data for ${params.businessName}.

LIVE DATA CONTEXT:
${dataContext}

CURRENT HTML:
${params.html.slice(0, 15000)}

Please update the HTML to reflect the live data for the specified sections. 
Return the complete updated <!DOCTYPE html> document.`;

  const raw = await claude(system, prompt, 'claude-haiku-4-5-20251001', 12000);
  
  let html = raw.trim();
  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    const nl = html.indexOf('\n');
    if (nl !== -1 && html.slice(0, nl).includes('`')) html = html.slice(nl + 1);
    const lf = html.lastIndexOf('\n```');
    if (lf !== -1) html = html.slice(0, lf);
    html = html.trim();
  }

  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEMA INFERENCE — Infer CMS collections and fields from generated HTML
// ══════════════════════════════════════════════════════════════════════════════

export async function inferCmsSchema(params: {
  html: string;
  businessName: string;
}): Promise<Array<{ sectionId: string; name: string; fields: any[] }>> {
  const system = `You are a Website Schema Architect. 
Analyze the provided HTML and identify sections that would benefit from a CMS (e.g., Team, Features, Testimonials, Pricing, Portfolio).
For each section, define a collection name and a list of fields (name, label, type) that match the content in the HTML.

Valid field types: 'text', 'textarea', 'image', 'number', 'url', 'boolean', 'date'.

Return JSON ONLY in this format:
[
  {
    "sectionId": "string (the id attribute of the <section>)",
    "name": "string (Human readable name, e.g. 'Our Team')",
    "fields": [
      { "name": "fieldName", "label": "Human Label", "type": "fieldType", "required": true }
    ]
  }
]`;

  const prompt = `Infer a CMS schema for the following website: ${params.businessName}.

HTML EXCERPT:
${params.html.slice(0, 15000)}

Return only the JSON array.`;

  const raw = await claude(system, prompt, 'claude-haiku-4-5-20251001', 4000);
  const clean = raw.trim().replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '');

  try {
    return JSON.parse(clean);
  } catch (err) {
    console.error('[WebsiteAI] Failed to parse inferred schema:', err);
    return [];
  }
}
