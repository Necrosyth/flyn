import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Calendar,
  Church,
  GraduationCap,
  Phone,
  Bot,
  ArrowRight,
  Check,
  Zap,
  Users,
  Star,
  Globe,
  Mail,
  CreditCard,
  Shield,
  Clock,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { useLandingContent } from "@/contexts/LandingContentContext";

const ICON_MAP: Record<string, LucideIcon> = {
  MessageSquare, Calendar, Church, GraduationCap, Phone, Bot,
  Zap, Users, Star, Globe, Mail, CreditCard, Shield, Clock, ArrowRight, Check, Briefcase,
};

interface ModuleCardProps {
  icon: React.ElementType;
  title: string;
  features: string[];
  cta: string;
  href: string;
  delay: number;
  gradient?: string;
}

const ModuleCard = ({ icon: Icon, title, features, cta, href, delay, gradient }: ModuleCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay }}
    className="group relative bg-card rounded-2xl border border-border p-6 hover:border-primary/50 hover:shadow-lg transition-all duration-300"
  >
    {/* Decorative gradient */}
    {gradient && (
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full ${gradient} blur-2xl opacity-30 group-hover:opacity-50 transition-opacity`} />
    )}
    
    <div className="relative">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-display text-lg font-bold">{title}</h3>
      </div>

      <ul className="space-y-2 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link to={href}>
        <Button size="sm" className="flyn-button-gradient w-full group-hover:shadow-md transition-shadow text-sm">
          {cta}
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </Link>
    </div>
  </motion.div>
);

export const ModulesSection = () => {
  const { content } = useLandingContent();

  const modules = content.modules
    .filter((m) => m.enabled)
    .map((m, index) => ({
      icon: ICON_MAP[m.icon] ?? Bot,
      title: m.title,
      features: m.features,
      cta: m.cta,
      href: m.href,
      gradient: index % 2 === 0 ? "bg-primary" : "bg-accent",
    }));

  return (
    <section className="py-20 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">
            Everything You Need —{" "}
            <span className="flyn-gradient-text">Modular, Scalable, AI-Powered</span>
          </h3>
          <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
            Enable only what you need. Scale as you grow. Let AI handle the rest.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module, index) => (
            <ModuleCard
              key={module.title}
              {...module}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
