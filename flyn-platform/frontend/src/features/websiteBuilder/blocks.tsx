/**
 * Puck block definitions for the FLYN website builder.
 * Each block maps to a Puck component with fields + a React render.
 */
import type { Config } from "@measured/puck";

// ── Helpers ──────────────────────────────────────────────────────────────────

const cn = (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(" ");

// ── Hero Block ────────────────────────────────────────────────────────────────

const HeroBlock = ({ headline, subheadline, description, primaryCta, primaryCtaUrl, secondaryCta, secondaryCtaUrl, background }: {
  headline: string;
  subheadline: string;
  description: string;
  primaryCta: string;
  primaryCtaUrl: string;
  secondaryCta: string;
  secondaryCtaUrl: string;
  background: "gradient" | "white" | "dark";
}) => (
  <section className={cn(
    "py-20 px-4 text-center",
    background === "gradient" && "bg-gradient-to-br from-primary/10 via-background to-accent/10",
    background === "white" && "bg-background",
    background === "dark" && "bg-foreground text-background",
  )}>
    <div className="max-w-4xl mx-auto space-y-6">
      {subheadline && (
        <p className="text-sm font-semibold text-primary uppercase tracking-widest">{subheadline}</p>
      )}
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">{headline}</h1>
      {description && (
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{description}</p>
      )}
      <div className="flex flex-wrap gap-3 justify-center pt-2">
        {primaryCta && (
          <a href={primaryCtaUrl || "#"} className="inline-flex items-center px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
            {primaryCta}
          </a>
        )}
        {secondaryCta && (
          <a href={secondaryCtaUrl || "#"} className="inline-flex items-center px-6 py-3 rounded-xl border border-border font-semibold hover:bg-muted transition-colors">
            {secondaryCta}
          </a>
        )}
      </div>
    </div>
  </section>
);

// ── Text Block ────────────────────────────────────────────────────────────────

const TextBlock = ({ content, align, size }: {
  content: string;
  align: "left" | "center" | "right";
  size: "sm" | "base" | "lg" | "xl";
}) => (
  <section className="py-10 px-4">
    <div className={cn("max-w-4xl mx-auto", `text-${align}`)}>
      <div
        className={cn("prose max-w-none text-foreground", `prose-${size}`)}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  </section>
);

// ── Image Block ───────────────────────────────────────────────────────────────

const ImageBlock = ({ src, alt, caption, width, rounded }: {
  src: string;
  alt: string;
  caption: string;
  width: "full" | "large" | "medium" | "small";
  rounded: boolean;
}) => {
  const maxW = { full: "max-w-full", large: "max-w-4xl", medium: "max-w-2xl", small: "max-w-sm" }[width];
  return (
    <section className="py-6 px-4">
      <div className={cn("mx-auto", maxW)}>
        {src ? (
          <img
            src={src}
            alt={alt}
            className={cn("w-full h-auto object-cover", rounded && "rounded-2xl")}
          />
        ) : (
          <div className={cn("w-full h-48 bg-muted flex items-center justify-center text-muted-foreground", rounded && "rounded-2xl")}>
            No image set
          </div>
        )}
        {caption && <p className="text-sm text-muted-foreground text-center mt-2">{caption}</p>}
      </div>
    </section>
  );
};

// ── Features Grid Block ───────────────────────────────────────────────────────

const FeaturesBlock = ({ headline, description, columns, features }: {
  headline: string;
  description: string;
  columns: 2 | 3 | 4;
  features: Array<{ icon: string; title: string; body: string }>;
}) => (
  <section className="py-16 px-4">
    <div className="max-w-6xl mx-auto">
      {(headline || description) && (
        <div className="text-center mb-12 space-y-3">
          {headline && <h2 className="text-3xl font-bold">{headline}</h2>}
          {description && <p className="text-muted-foreground max-w-2xl mx-auto">{description}</p>}
        </div>
      )}
      <div className={cn("grid gap-6", {
        2: "sm:grid-cols-2",
        3: "sm:grid-cols-2 lg:grid-cols-3",
        4: "sm:grid-cols-2 lg:grid-cols-4",
      }[columns])}>
        {features.map((f, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6 space-y-3 hover:shadow-md transition-shadow">
            {f.icon && <div className="text-2xl">{f.icon}</div>}
            <h3 className="font-semibold text-lg">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ── CTA Banner Block ──────────────────────────────────────────────────────────

const CtaBlock = ({ headline, description, buttonText, buttonUrl, background }: {
  headline: string;
  description: string;
  buttonText: string;
  buttonUrl: string;
  background: "primary" | "dark" | "muted";
}) => (
  <section className={cn(
    "py-16 px-4",
    background === "primary" && "bg-primary text-primary-foreground",
    background === "dark" && "bg-foreground text-background",
    background === "muted" && "bg-muted",
  )}>
    <div className="max-w-3xl mx-auto text-center space-y-6">
      <h2 className="text-3xl font-bold">{headline}</h2>
      {description && <p className="opacity-80">{description}</p>}
      {buttonText && (
        <a
          href={buttonUrl || "#"}
          className={cn(
            "inline-flex items-center px-8 py-3 rounded-xl font-semibold transition-opacity hover:opacity-90",
            background === "primary" && "bg-background text-foreground",
            background === "dark" && "bg-primary text-primary-foreground",
            background === "muted" && "bg-primary text-primary-foreground",
          )}
        >
          {buttonText}
        </a>
      )}
    </div>
  </section>
);

// ── Pricing Block ─────────────────────────────────────────────────────────────

const PricingBlock = ({ headline, plans }: {
  headline: string;
  plans: Array<{ name: string; price: string; period: string; description: string; features: string; ctaText: string; ctaUrl: string; highlighted: boolean }>;
}) => (
  <section className="py-16 px-4">
    <div className="max-w-6xl mx-auto">
      {headline && <h2 className="text-3xl font-bold text-center mb-12">{headline}</h2>}
      <div className={cn("grid gap-6", plans.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {plans.map((p, i) => (
          <div key={i} className={cn(
            "rounded-2xl border p-8 space-y-6",
            p.highlighted ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border bg-card",
          )}>
            <div>
              <h3 className="font-bold text-xl">{p.name}</h3>
              <p className="text-muted-foreground text-sm mt-1">{p.description}</p>
            </div>
            <div>
              <span className="text-4xl font-bold">{p.price}</span>
              {p.period && <span className="text-muted-foreground ml-1">/{p.period}</span>}
            </div>
            <ul className="space-y-2">
              {p.features.split("\n").filter(Boolean).map((f, j) => (
                <li key={j} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-0.5">✓</span>
                  {f.trim()}
                </li>
              ))}
            </ul>
            {p.ctaText && (
              <a
                href={p.ctaUrl || "#"}
                className={cn(
                  "block text-center py-3 rounded-xl font-semibold transition-opacity hover:opacity-90",
                  p.highlighted ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
                )}
              >
                {p.ctaText}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ── Columns Block ─────────────────────────────────────────────────────────────

const ColumnsBlock = ({ columns }: {
  columns: Array<{ heading: string; body: string }>;
}) => (
  <section className="py-12 px-4">
    <div className={cn("max-w-6xl mx-auto grid gap-8", columns.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
      {columns.map((col, i) => (
        <div key={i} className="space-y-3">
          {col.heading && <h3 className="text-xl font-semibold">{col.heading}</h3>}
          <div className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: col.body }} />
        </div>
      ))}
    </div>
  </section>
);

// ── Spacer Block ──────────────────────────────────────────────────────────────

const SpacerBlock = ({ size }: { size: "sm" | "md" | "lg" | "xl" }) => {
  const h = { sm: "h-8", md: "h-16", lg: "h-24", xl: "h-32" }[size];
  return <div className={h} />;
};

// ── Divider Block ─────────────────────────────────────────────────────────────

const DividerBlock = ({ style }: { style: "line" | "dots" | "gradient" }) => (
  <div className="px-4 py-6">
    {style === "line" && <hr className="border-border" />}
    {style === "dots" && <div className="flex justify-center gap-2">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-border" />)}</div>}
    {style === "gradient" && <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />}
  </div>
);

// ── Stats Block ───────────────────────────────────────────────────────────────

const StatsBlock = ({ headline, stats }: {
  headline: string;
  stats: Array<{ value: string; label: string }>;
}) => (
  <section className="py-16 px-4 bg-primary/5">
    <div className="max-w-6xl mx-auto">
      {headline && <h2 className="text-3xl font-bold text-center mb-12">{headline}</h2>}
      <div className={cn("grid gap-8 text-center", stats.length <= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {stats.map((s, i) => (
          <div key={i}>
            <p className="text-4xl font-bold text-primary">{s.value}</p>
            <p className="text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ── Testimonial Block ─────────────────────────────────────────────────────────

const TestimonialBlock = ({ headline, testimonials }: {
  headline: string;
  testimonials: Array<{ quote: string; name: string; role: string; company: string }>;
}) => (
  <section className="py-16 px-4">
    <div className="max-w-6xl mx-auto">
      {headline && <h2 className="text-3xl font-bold text-center mb-12">{headline}</h2>}
      <div className={cn("grid gap-6", testimonials.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {testimonials.map((t, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <p className="text-muted-foreground italic">"{t.quote}"</p>
            <div>
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-muted-foreground">{t.role}{t.company && `, ${t.company}`}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ── Contact Form Block ────────────────────────────────────────────────────────

const ContactFormBlock = ({ headline, description, submitLabel, recipientEmail }: {
  headline: string;
  description: string;
  submitLabel: string;
  recipientEmail: string;
}) => (
  <section className="py-16 px-4">
    <div className="max-w-xl mx-auto">
      {headline && <h2 className="text-3xl font-bold text-center mb-3">{headline}</h2>}
      {description && <p className="text-muted-foreground text-center mb-8">{description}</p>}
      <form className="space-y-4 rounded-2xl border border-border bg-card p-6">
        {recipientEmail && <input type="hidden" name="_to" value={recipientEmail} />}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Your name" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input type="email" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="your@email.com" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Message</label>
          <textarea rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y" placeholder="How can we help?" />
        </div>
        <button type="submit" className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
          {submitLabel || "Send Message"}
        </button>
      </form>
    </div>
  </section>
);

// ── Video Embed Block ─────────────────────────────────────────────────────────

const VideoBlock = ({ url, caption, rounded }: { url: string; caption: string; rounded: boolean }) => {
  const getEmbedUrl = (raw: string) => {
    if (!raw) return "";
    if (raw.includes("youtube.com/watch")) {
      const id = new URLSearchParams(raw.split("?")[1]).get("v");
      return `https://www.youtube.com/embed/${id}`;
    }
    if (raw.includes("youtu.be/")) return `https://www.youtube.com/embed/${raw.split("youtu.be/")[1]}`;
    if (raw.includes("vimeo.com/")) return `https://player.vimeo.com/video/${raw.split("vimeo.com/")[1]}`;
    return raw;
  };
  const embedUrl = getEmbedUrl(url);
  return (
    <section className="py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className={cn("relative w-full overflow-hidden bg-muted", rounded && "rounded-2xl")} style={{ paddingTop: "56.25%" }}>
          {embedUrl
            ? <iframe src={embedUrl} className="absolute inset-0 w-full h-full border-0" allowFullScreen title={caption || "Video"} />
            : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">Paste a YouTube or Vimeo URL</div>
          }
        </div>
        {caption && <p className="text-sm text-muted-foreground text-center mt-2">{caption}</p>}
      </div>
    </section>
  );
};

// ── Puck Config export ────────────────────────────────────────────────────────

export const puckConfig: Config = {
  components: {
    Hero: {
      label: "Hero Section",
      fields: {
        headline: { type: "text", label: "Headline" },
        subheadline: { type: "text", label: "Subheadline (above title)" },
        description: { type: "textarea", label: "Description" },
        primaryCta: { type: "text", label: "Primary Button Text" },
        primaryCtaUrl: { type: "text", label: "Primary Button URL" },
        secondaryCta: { type: "text", label: "Secondary Button Text" },
        secondaryCtaUrl: { type: "text", label: "Secondary Button URL" },
        background: {
          type: "select",
          label: "Background",
          options: [
            { value: "gradient", label: "Gradient" },
            { value: "white", label: "Light" },
            { value: "dark", label: "Dark" },
          ],
        },
      },
      defaultProps: {
        headline: "Welcome to Our Website",
        subheadline: "Built with Flyn",
        description: "Tell your story here. Edit this text to describe what you offer.",
        primaryCta: "Get Started",
        primaryCtaUrl: "#",
        secondaryCta: "Learn More",
        secondaryCtaUrl: "#",
        background: "gradient",
      },
      render: HeroBlock,
    },

    Text: {
      label: "Text / Rich Text",
      fields: {
        content: { type: "textarea", label: "Content (HTML supported)" },
        align: {
          type: "select",
          label: "Alignment",
          options: [
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ],
        },
        size: {
          type: "select",
          label: "Text Size",
          options: [
            { value: "sm", label: "Small" },
            { value: "base", label: "Normal" },
            { value: "lg", label: "Large" },
            { value: "xl", label: "Extra Large" },
          ],
        },
      },
      defaultProps: {
        content: "<p>Start writing your content here. You can use <strong>HTML</strong> for formatting.</p>",
        align: "left",
        size: "base",
      },
      render: TextBlock,
    },

    Image: {
      label: "Image",
      fields: {
        src: { type: "text", label: "Image URL" },
        alt: { type: "text", label: "Alt Text" },
        caption: { type: "text", label: "Caption (optional)" },
        width: {
          type: "select",
          label: "Width",
          options: [
            { value: "full", label: "Full Width" },
            { value: "large", label: "Large" },
            { value: "medium", label: "Medium" },
            { value: "small", label: "Small" },
          ],
        },
        rounded: { type: "radio", label: "Rounded corners", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
      },
      defaultProps: { src: "", alt: "", caption: "", width: "large", rounded: true },
      render: ImageBlock,
    },

    Features: {
      label: "Features Grid",
      fields: {
        headline: { type: "text", label: "Section Headline" },
        description: { type: "textarea", label: "Section Description" },
        columns: {
          type: "select",
          label: "Columns",
          options: [
            { value: 2, label: "2 Columns" },
            { value: 3, label: "3 Columns" },
            { value: 4, label: "4 Columns" },
          ],
        },
        features: {
          type: "array",
          label: "Features",
          arrayFields: {
            icon: { type: "text", label: "Emoji / Icon" },
            title: { type: "text", label: "Title" },
            body: { type: "textarea", label: "Description" },
          },
          defaultItemProps: { icon: "✨", title: "Feature Name", body: "Describe this feature in a sentence or two." },
        },
      },
      defaultProps: {
        headline: "Why Choose Us",
        description: "Here's what makes us different.",
        columns: 3,
        features: [
          { icon: "🚀", title: "Fast & Reliable", body: "Built for speed and uptime you can count on." },
          { icon: "🔒", title: "Secure by Default", body: "Enterprise-grade security out of the box." },
          { icon: "💬", title: "24/7 Support", body: "We're here whenever you need us." },
        ],
      },
      render: FeaturesBlock,
    },

    CTA: {
      label: "Call to Action Banner",
      fields: {
        headline: { type: "text", label: "Headline" },
        description: { type: "textarea", label: "Description" },
        buttonText: { type: "text", label: "Button Text" },
        buttonUrl: { type: "text", label: "Button URL" },
        background: {
          type: "select",
          label: "Background",
          options: [
            { value: "primary", label: "Brand Color" },
            { value: "dark", label: "Dark" },
            { value: "muted", label: "Muted" },
          ],
        },
      },
      defaultProps: {
        headline: "Ready to get started?",
        description: "Join thousands of businesses already on Flyn.",
        buttonText: "Start Free Trial",
        buttonUrl: "#",
        background: "primary",
      },
      render: CtaBlock,
    },

    Pricing: {
      label: "Pricing Table",
      fields: {
        headline: { type: "text", label: "Section Headline" },
        plans: {
          type: "array",
          label: "Plans",
          arrayFields: {
            name: { type: "text", label: "Plan Name" },
            price: { type: "text", label: "Price (e.g. $49)" },
            period: { type: "text", label: "Period (e.g. mo)" },
            description: { type: "text", label: "Tagline" },
            features: { type: "textarea", label: "Features (one per line)" },
            ctaText: { type: "text", label: "Button Text" },
            ctaUrl: { type: "text", label: "Button URL" },
            highlighted: { type: "radio", label: "Highlighted", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
          },
          defaultItemProps: {
            name: "Starter",
            price: "$29",
            period: "mo",
            description: "Perfect for getting started",
            features: "5 Users\n10 GB Storage\nEmail Support",
            ctaText: "Get Started",
            ctaUrl: "#",
            highlighted: false,
          },
        },
      },
      defaultProps: {
        headline: "Simple, Transparent Pricing",
        plans: [
          { name: "Starter", price: "$29", period: "mo", description: "Great for small teams", features: "5 Users\n10 GB Storage\nEmail Support", ctaText: "Get Started", ctaUrl: "#", highlighted: false },
          { name: "Pro", price: "$79", period: "mo", description: "For growing businesses", features: "Unlimited Users\n100 GB Storage\nPriority Support\nCustom Domain", ctaText: "Start Pro", ctaUrl: "#", highlighted: true },
        ],
      },
      render: PricingBlock,
    },

    Columns: {
      label: "Columns",
      fields: {
        columns: {
          type: "array",
          label: "Columns",
          arrayFields: {
            heading: { type: "text", label: "Heading" },
            body: { type: "textarea", label: "Content (HTML)" },
          },
          defaultItemProps: { heading: "Column Title", body: "<p>Add your content here.</p>" },
        },
      },
      defaultProps: {
        columns: [
          { heading: "Column One", body: "<p>Your content here.</p>" },
          { heading: "Column Two", body: "<p>Your content here.</p>" },
        ],
      },
      render: ColumnsBlock,
    },

    Stats: {
      label: "Stats / Numbers",
      fields: {
        headline: { type: "text", label: "Headline" },
        stats: {
          type: "array",
          label: "Stats",
          arrayFields: {
            value: { type: "text", label: "Value (e.g. 10,000+)" },
            label: { type: "text", label: "Label" },
          },
          defaultItemProps: { value: "100+", label: "Customers" },
        },
      },
      defaultProps: {
        headline: "Trusted by Thousands",
        stats: [
          { value: "10,000+", label: "Active Users" },
          { value: "99.9%", label: "Uptime" },
          { value: "150+", label: "Countries" },
          { value: "4.9★", label: "Avg Rating" },
        ],
      },
      render: StatsBlock,
    },

    Testimonials: {
      label: "Testimonials",
      fields: {
        headline: { type: "text", label: "Section Headline" },
        testimonials: {
          type: "array",
          label: "Testimonials",
          arrayFields: {
            quote: { type: "textarea", label: "Quote" },
            name: { type: "text", label: "Name" },
            role: { type: "text", label: "Role" },
            company: { type: "text", label: "Company" },
          },
          defaultItemProps: { quote: "This product changed the way we work. Highly recommend!", name: "Jane Smith", role: "CEO", company: "Acme Corp" },
        },
      },
      defaultProps: {
        headline: "What Our Customers Say",
        testimonials: [
          { quote: "Flyn completely transformed our customer engagement.", name: "Sarah M.", role: "Marketing Director", company: "TechCorp" },
          { quote: "The automation features alone saved us 20 hours a week.", name: "James K.", role: "Founder", company: "StartupXYZ" },
        ],
      },
      render: TestimonialBlock,
    },

    ContactForm: {
      label: "Contact Form",
      fields: {
        headline: { type: "text", label: "Headline" },
        description: { type: "textarea", label: "Description" },
        submitLabel: { type: "text", label: "Submit Button Text" },
        recipientEmail: { type: "text", label: "Recipient Email" },
      },
      defaultProps: {
        headline: "Get in Touch",
        description: "Fill out the form and we'll get back to you within 24 hours.",
        submitLabel: "Send Message",
        recipientEmail: "",
      },
      render: ContactFormBlock,
    },

    Video: {
      label: "Video Embed",
      fields: {
        url: { type: "text", label: "YouTube or Vimeo URL" },
        caption: { type: "text", label: "Caption" },
        rounded: { type: "radio", label: "Rounded corners", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
      },
      defaultProps: { url: "", caption: "", rounded: true },
      render: VideoBlock,
    },

    Spacer: {
      label: "Spacer",
      fields: {
        size: {
          type: "select",
          label: "Size",
          options: [
            { value: "sm", label: "Small (32px)" },
            { value: "md", label: "Medium (64px)" },
            { value: "lg", label: "Large (96px)" },
            { value: "xl", label: "Extra Large (128px)" },
          ],
        },
      },
      defaultProps: { size: "md" },
      render: SpacerBlock,
    },

    Divider: {
      label: "Divider",
      fields: {
        style: {
          type: "select",
          label: "Style",
          options: [
            { value: "line", label: "Line" },
            { value: "dots", label: "Dots" },
            { value: "gradient", label: "Gradient" },
          ],
        },
      },
      defaultProps: { style: "line" },
      render: DividerBlock,
    },
  },
};
