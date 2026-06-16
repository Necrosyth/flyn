import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

interface Feature {
  icon: React.ElementType;
  title: string;
  items: string[];
}

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description?: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}

interface ProductPageLayoutProps {
  title: string;
  titleHighlight: string;
  subtitle: string;
  features: Feature[];
  pricing: PricingTier[];
  ctaPrimary?: string;
  ctaSecondary?: string;
}

export const ProductPageLayout = ({
  title,
  titleHighlight,
  subtitle,
  features,
  pricing,
  ctaPrimary = "Start Free Trial",
  ctaSecondary = "Book Demo",
}: ProductPageLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      
      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative py-16 lg:py-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center lg:text-left"
              >
                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
                  {title}{" "}
                  <span className="flyn-gradient-text">{titleHighlight}</span>
                </h1>
                <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0">
                  {subtitle}
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                  <Link to="/signup">
                    <Button className="flyn-button-gradient px-6">
                      {ctaPrimary}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <Link to="/demo">
                    <Button variant="outline" className="px-6">
                      {ctaSecondary}
                    </Button>
                  </Link>
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                  Visit our Pricing Page for full comparison.
                </p>
              </motion.div>

              {/* Product Mockup */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="relative"
              >
                <div className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-destructive/60" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                      <div className="w-3 h-3 rounded-full bg-green-500/60" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="px-4 py-1 bg-background rounded-md text-xs text-muted-foreground">
                        app.myflynai.com
                      </div>
                    </div>
                  </div>
                  <div className="aspect-[4/3] bg-gradient-to-br from-muted/50 to-muted p-6">
                    <div className="h-full flex gap-4">
                      <div className="w-48 bg-card rounded-lg p-3 space-y-2">
                        {["Dashboard", "Inbox", "Members", "Settings"].map((item, i) => (
                          <div key={item} className={`p-2 rounded-lg text-sm ${i === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                            {item}
                          </div>
                        ))}
                      </div>
                      <div className="flex-1 space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-card rounded-lg p-4">
                              <div className="h-3 w-16 bg-muted rounded mb-2" />
                              <div className="h-6 w-12 bg-primary/20 rounded" />
                            </div>
                          ))}
                        </div>
                        <div className="bg-card rounded-lg p-4 flex-1">
                          <div className="flex items-end gap-2 h-32">
                            {[40, 65, 45, 80, 55, 70, 85].map((h, i) => (
                              <div
                                key={i}
                                className="flex-1 bg-gradient-to-t from-primary to-accent rounded-t"
                                style={{ height: `${h}%` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 lg:py-24 bg-muted/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-card rounded-2xl border border-border p-6 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-display text-lg font-bold">{feature.title}</h3>
                  </div>
                  <ul className="space-y-2">
                    {feature.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-16 lg:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="font-display text-2xl sm:text-3xl font-bold">
                Flexible Pricing for Any Size Team
              </h2>
              <p className="mt-2 text-muted-foreground">
                Visit our Pricing Page for full comparison.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {pricing.map((tier, index) => (
                <motion.div
                  key={tier.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`bg-card rounded-2xl border p-6 ${
                    tier.highlighted
                      ? "border-primary shadow-lg shadow-primary/10 relative"
                      : "border-border"
                  }`}
                >
                  {tier.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                      Most Popular
                    </div>
                  )}
                  <div className="text-center mb-6">
                    <h3 className="font-display text-xl font-bold">{tier.name}</h3>
                    <div className="mt-2">
                      <span className="text-4xl font-bold">{tier.price}</span>
                      {tier.period && (
                        <span className="text-muted-foreground text-sm">/{tier.period}</span>
                      )}
                    </div>
                    {tier.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-6">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to="/signup" className="block">
                    <Button
                      className={`w-full ${tier.highlighted ? "flyn-button-gradient" : ""}`}
                      variant={tier.highlighted ? "default" : "outline"}
                    >
                      {tier.cta}
                    </Button>
                  </Link>
                </motion.div>
              ))}
            </div>

            <p className="text-center mt-8 text-sm text-muted-foreground">
              Visit our Pricing Page for full comparison.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};
