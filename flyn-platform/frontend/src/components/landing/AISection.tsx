import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Clock, 
  BellOff, 
  TrendingUp,
  Sparkles,
  ArrowRight
} from "lucide-react";

interface AIFeatureProps {
  icon: React.ElementType;
  title: string;
  features: string[];
  position: "left" | "right";
  delay: number;
}

const AIFeature = ({ icon: Icon, title, features, position, delay }: AIFeatureProps) => (
  <motion.div
    initial={{ opacity: 0, x: position === "left" ? -20 : 20 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ delay }}
    className="bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 p-4 shadow-lg"
  >
    <div className="flex items-center gap-3 mb-2">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h4 className="font-display font-semibold">{title}</h4>
    </div>
    <ul className="space-y-1">
      {features.map((feature, i) => (
        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
          {feature}
        </li>
      ))}
    </ul>
  </motion.div>
);

export const AISection = () => {
  const leftFeatures = [
    {
      icon: MessageSquare,
      title: "AI Reply Suggestions",
      features: ["WhatsApp, SMS, Email, Voice", "Social DMs"]
    },
    {
      icon: BellOff,
      title: "AI Alert Suppression",
      features: ["SLA tracking", "Smart filtering"]
    }
  ];

  const rightFeatures = [
    {
      icon: Clock,
      title: "Smart Message Timing",
      features: ["Smart routing, timeline priorities", "Predictive insights, heatmapping"]
    },
    {
      icon: TrendingUp,
      title: "Usage Forecasting",
      features: ["Real time reporting", "Predictive insights"]
    }
  ];

  return (
    <section className="py-20 lg:py-32 relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/20 to-accent/20 rounded-full blur-3xl opacity-50" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">
            Built With <span className="flyn-gradient-text">AI at the Core</span> —{" "}
            <br className="hidden sm:block" />
            Not Added Later
          </h2>
        </motion.div>

        <div className="relative">
          {/* Center orb */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 lg:w-64 lg:h-64"
          >
            <div className="w-full h-full rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-2xl animate-pulse-slow" />
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/50 to-accent/50 blur-xl animate-pulse-slow" style={{ animationDelay: "0.5s" }} />
            <div className="absolute inset-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-8 h-8 lg:w-12 lg:h-12 text-white" />
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8 items-center min-h-[400px]">
            {/* Left Features */}
            <div className="space-y-4 lg:pr-8">
              {leftFeatures.map((feature, i) => (
                <AIFeature
                  key={feature.title}
                  {...feature}
                  position="left"
                  delay={i * 0.1}
                />
              ))}
            </div>

            {/* Center - empty space for orb */}
            <div className="hidden lg:block" />

            {/* Right Features */}
            <div className="space-y-4 lg:pl-8">
              {rightFeatures.map((feature, i) => (
                <AIFeature
                  key={feature.title}
                  {...feature}
                  position="right"
                  delay={0.2 + i * 0.1}
                />
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <Link to="/product/ai">
            <Button size="lg" variant="outline" className="border-2 border-primary/50 hover:bg-primary/5">
              See AI in Action
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};
