import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, MessageSquare, Users, Zap, CreditCard, Bot, BarChart3 } from "lucide-react";

export const ReplacementSection = () => {
  const replacedTools = [
    { name: "WhatsApp CRM", replaced: true },
    { name: "Event Tools", replaced: true },
    { name: "Church Software", replaced: true },
    { name: "Email + SMS Tools", replaced: true },
    { name: "Coaching Platforms", replaced: true },
    { name: "Analytics Tools", replaced: true },
    { name: "Billing Systems", replaced: true },
    { name: "AI Automation", replaced: true },
  ];

  const features = [
    { icon: MessageSquare, label: "WhatsApp, SMS, Email, Voice, Social DMs" },
    { icon: Users, label: "Team assignment" },
    { icon: Zap, label: "SLA tracking" },
    { icon: Bot, label: "AI replies" },
    { icon: CreditCard, label: "Usage-based controls" },
  ];

  return (
    <section className="py-20 lg:py-32 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">
            Replace 10+ Tools With One{" "}
            <span className="flyn-gradient-text">Intelligent Platform</span>
          </h3>
          <p className="mt-3 text-base text-muted-foreground max-w-3xl mx-auto">
            FLYN AI consolidates what used to require multiple vendors — without compromising flexibility or enterprise control.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left - Feature List */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">Unified Inbox</h3>
                  <p className="text-sm text-muted-foreground">Every conversation. One workspace.</p>
                </div>
              </div>

              <ul className="space-y-3">
                {features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-muted-foreground">{feature.label}</span>
                  </li>
                ))}
              </ul>

              <Link to="/product/inbox" className="mt-5 inline-block">
                <Button size="sm" className="flyn-button-gradient text-sm">
                  See Full Platform Breakdown
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Right - Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
              {/* Browser Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-3 py-1 bg-background rounded text-xs text-muted-foreground flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-primary/20" />
                    FLYN.AI
                  </div>
                </div>
              </div>

              {/* Inbox Preview */}
              <div className="p-4 bg-background">
                <div className="flex gap-4">
                  {/* Sidebar */}
                  <div className="w-48 space-y-2">
                    <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg">
                      <span className="text-sm font-medium">Inbox</span>
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">12</span>
                    </div>
                    {["Moses", "Elenina", "Kat Green", "Carmen", "Nael Heer", "Ceasar Lion"].map((name, i) => (
                      <div key={name} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center text-xs font-medium">
                          {name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            {["$130", "20 min", "20 min", "30 min", "10 min", "19 min"][i]}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent" />
                        <span className="font-medium">Chester Johnson</span>
                      </div>
                      <span className="text-xs text-muted-foreground">2m ago</span>
                    </div>
                    
                    {/* Message bubbles */}
                    <div className="space-y-2">
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%]">
                          <p className="text-sm">Hi, I wanted to follow up...</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%]">
                          <p className="text-sm">Thanks for reaching out! I'll review and get back to you shortly.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-accent/10 rounded-lg border border-accent/30">
                        <Bot className="w-4 h-4 text-accent" />
                        <span className="text-xs text-muted-foreground">AI suggested reply ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating label */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-sm text-muted-foreground">
              <span>Unified Inbox</span>
              <span>•</span>
              <span>Inbox live priority</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
