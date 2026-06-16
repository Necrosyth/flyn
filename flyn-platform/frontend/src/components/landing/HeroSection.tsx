import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Clock, CreditCard, Zap, Star, Check, Lock, Globe, Users, Award, type LucideIcon } from "lucide-react";
import { useLandingContent } from "@/contexts/LandingContentContext";

const ICON_MAP: Record<string, LucideIcon> = {
  CreditCard, Shield, Clock, Zap, Star, Check, Lock, Globe, Users, Award, ArrowRight,
};

export const HeroSection = () => {
  const { content } = useLandingContent();
  const { hero } = content;

  const trustBadges = hero.trustBadges.map((b) => ({
    Icon: ICON_MAP[b.icon] ?? Shield,
    text: b.text,
  }));

  return (
    <section className="relative min-h-screen pt-20 lg:pt-24 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center lg:text-left"
          >
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-foreground">
              {hero.headline}{" "}
              <span className="flyn-gradient-text">{hero.highlightedText}</span>,{" "}
              {hero.subheadline}
            </h2>

            <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto lg:mx-0">
              {hero.description}
            </p>

            {/* CTAs */}
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">
              <Link to="/signup">
                <Button size="default" className="flyn-button-gradient text-sm px-6 py-2.5 h-auto">
                  {hero.primaryCta}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/demo">
                <Button size="default" variant="outline" className="text-sm px-6 py-2.5 h-auto border">
                  {hero.secondaryCta}
                </Button>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="mt-8 flex flex-wrap items-center gap-4 justify-center lg:justify-start">
              {trustBadges.map((badge, index) => (
                <motion.div
                  key={badge.text}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <badge.Icon className="w-4 h-4 text-primary" />
                  <span>{badge.text}</span>
                  {index < trustBadges.length - 1 && (
                    <span className="hidden sm:inline text-border ml-2">•</span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Column - Product Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative hidden sm:block"
          >
            {/* Main Dashboard Mockup */}
            <div className="relative">
              {/* Floating Cards Effect */}
              <div className="absolute -top-4 -left-4 w-48 h-32 bg-card rounded-xl shadow-lg border border-border p-4 z-10 hidden md:block">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">AI</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium">Smart Reply</p>
                    <p className="text-[10px] text-muted-foreground">Suggested</p>
                  </div>
                </div>
                <div className="h-2 bg-primary/20 rounded-full w-full" />
                <div className="h-2 bg-primary/10 rounded-full w-3/4 mt-1" />
              </div>

              <div className="absolute -bottom-4 -right-4 w-40 h-28 bg-card rounded-xl shadow-lg border border-border p-3 z-10">
                <p className="text-xs font-medium mb-2">Live Analytics</p>
                <div className="flex items-end gap-1">
                  {[40, 65, 45, 80, 55, 70, 85].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-primary to-accent rounded-t"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>

              {/* Main Mockup Container */}
              <div className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
                {/* Browser Header */}
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

                {/* Dashboard Preview */}
                <div className="p-4 bg-background">
                  <div className="flex gap-4">
                    {/* Sidebar Mini */}
                    <div className="w-12 bg-sidebar rounded-lg p-2 space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`w-8 h-8 rounded-lg ${
                            i === 1 ? "bg-primary" : "bg-sidebar-accent"
                          }`}
                        />
                      ))}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 space-y-3">
                      {/* Stats Row */}
                      <div className="grid grid-cols-4 gap-2">
                        {["$12.4K", "1,230", "89%", "24"].map((stat, i) => (
                          <div key={i} className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">
                              {["Revenue", "Messages", "Response", "Active"][i]}
                            </p>
                            <p className="text-sm font-bold mt-1">{stat}</p>
                          </div>
                        ))}
                      </div>

                      {/* Messages Preview */}
                      <div className="bg-muted/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full bg-primary/20" />
                          <div className="flex-1">
                            <div className="h-2 bg-foreground/10 rounded w-24" />
                            <div className="h-1.5 bg-foreground/5 rounded w-16 mt-1" />
                          </div>
                          <span className="text-[10px] text-muted-foreground">2m</span>
                        </div>
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="flex items-center gap-2 py-2 border-t border-border/50">
                            <div className="w-6 h-6 rounded-full bg-accent/20" />
                            <div className="flex-1">
                              <div className="h-1.5 bg-foreground/10 rounded w-20" />
                              <div className="h-1 bg-foreground/5 rounded w-32 mt-1" />
                            </div>
                          </div>
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
  );
};
