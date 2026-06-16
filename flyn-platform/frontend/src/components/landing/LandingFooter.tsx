import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import FlynLogo from "@/components/FlynLogo";
import { ArrowRight, Twitter, Linkedin, Instagram, Facebook, Youtube } from "lucide-react";
import { useLandingContent } from "@/contexts/LandingContentContext";

export const LandingFooter = () => {
  const { content } = useLandingContent();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const footerLinks = useMemo(
    () => ({
      Product: [
        { label: "Unified Inbox", href: "/product/unified-inbox" },
        { label: "AI Agents", href: "/product/ai-agents" },
        { label: "CRM", href: "/product/crm" },
        { label: "Automation", href: "/product/automation" },
        { label: "Analytics", href: "/product/analytics" },
        { label: "Billing & Usage", href: "/product/billing-usage" },
        { label: "Security", href: "/product/security" },
        { label: "Website Builder", href: "/product/website-builder" },
        { label: "Domain + Hosting", href: "/product/domain-hosting" },
      ],
      Company: [
        { label: "About Us", href: "/company/about" },
        { label: "Careers", href: "/company/careers" },
        { label: "Customers", href: "/company/customers" },
        { label: "Case Studies", href: "/company/case-studies" },
        { label: "Partners", href: "/company/partners" },
        { label: "Security", href: "/company/security" },
        { label: "Blog", href: "/blog" },
        { label: "Pricing", href: "/pricing" },
        { label: "Contact Us", href: "/contact" },
      ],
      Legal: [
        { label: "Terms of Service", href: "/legal/terms" },
        { label: "Privacy Policy", href: "/legal/privacy" },
        { label: "Data Processing Agreement", href: "/legal/dpa" },
        { label: "Cookie Policy", href: "/legal/cookies" },
        { label: "SLA", href: "/legal/sla" },
        { label: "Security", href: "/legal/security" },
        { label: "Sub-processors", href: "/legal/subprocessors" },
      ],
      Developers: [
        { label: "Documentation", href: "/developers/docs" },
        { label: "API Reference", href: "/developers/api" },
        { label: "Webhooks", href: "/developers/webhooks" },
        { label: "SDKs", href: "/developers/sdks" },
        { label: "Authentication", href: "/developers/authentication" },
        { label: "Rate Limits", href: "/developers/rate-limits" },
      ],
    }),
    []
  );

  const socialLinks = [
    { icon: Twitter, href: content.social.twitter, label: "Twitter" },
    { icon: Linkedin, href: content.social.linkedin, label: "LinkedIn" },
    { icon: Instagram, href: content.social.instagram, label: "Instagram" },
    { icon: Facebook, href: content.social.facebook, label: "Facebook" },
    { icon: Youtube, href: content.social.youtube, label: "YouTube" },
  ];

  const legalLinks = [
    { label: "Terms", href: "/legal/terms" },
    { label: "Privacy", href: "/legal/privacy" },
    { label: "DPA", href: "/legal/dpa" },
    { label: "Cookies", href: "/legal/cookies" },
    { label: "SLA", href: "/legal/sla" },
    { label: "Security", href: "/legal/security" },
  ];

  return (
    <footer className="bg-muted/30 border-t border-border">
      {/* CTA Section */}
      <div className="py-16 lg:py-24 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">
              {content.footer.ctaHeadline}{" "}
              <span className="flyn-gradient-text">{content.footer.ctaHighlightedText}</span>
            </h3>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 justify-center">
              <Link to="/signup">
                <Button size="default" className="flyn-button-gradient text-sm px-6 py-2.5 h-auto">
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/demo">
                <Button size="default" variant="outline" className="text-sm px-6 py-2.5 h-auto border">
                  Book Enterprise Demo
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Links Section */}
      <div className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="flex items-center gap-2">
                <FlynLogo size="lg" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm">
                {content.hero.description}
              </p>
              <div className="mt-5 flex items-center gap-4">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                    aria-label={social.label}
                  >
                    <social.icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>

            {/* Desktop columns */}
            <div className="hidden md:grid md:col-span-8 grid-cols-2 lg:grid-cols-4 gap-8">
              {Object.entries(footerLinks).map(([category, links]) => (
                <div key={category}>
                  <h4 className="font-display font-semibold text-foreground mb-4">
                    {category}
                  </h4>
                  <ul className="space-y-2">
                    {links.map((link) => (
                      <li key={link.label}>
                        <Link
                          to={link.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Mobile accordion */}
            <div className="md:hidden lg:col-span-8">
              <div className="divide-y divide-border rounded-lg border border-border bg-background/40">
                {Object.entries(footerLinks).map(([category, links]) => {
                  const isOpen = openSection === category;
                  return (
                    <div key={category} className="px-4">
                      <button
                        type="button"
                        className="w-full py-4 flex items-center justify-between text-left"
                        onClick={() => setOpenSection(isOpen ? null : category)}
                        aria-expanded={isOpen}
                        aria-controls={`footer-section-${category}`}
                      >
                        <span className="font-display font-semibold text-foreground">
                          {category}
                        </span>
                        <span className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}>
                          ▾
                        </span>
                      </button>
                      {isOpen && (
                        <ul id={`footer-section-${category}`} className="pb-4 space-y-2">
                          {links.map((link) => (
                            <li key={link.label}>
                              <Link
                                to={link.href}
                                className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            {/* Legal Links (Left) */}
            <div className="flex flex-wrap justify-center sm:justify-start items-center gap-4 order-2 sm:order-1">
              {legalLinks.map((link, i) => (
                <span key={link.label} className="flex items-center gap-4">
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                  {i < legalLinks.length - 1 && (
                    <span className="text-border">·</span>
                  )}
                </span>
              ))}
            </div>

            {/* Copyright (Right) */}
            <div className="order-1 sm:order-2">
              <p className="text-sm text-muted-foreground text-center sm:text-right">
                © {new Date().getFullYear()} {content.footer.copyrightText}
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
