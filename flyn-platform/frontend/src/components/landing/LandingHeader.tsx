import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronDown, 
  Menu, 
  X, 
  MessageSquare, 
  Calendar, 
  Church, 
  Bot, 
  BarChart3, 
  Shield, 
  Zap, 
  Globe, 
  MessageCircle, 
  Mail, 
  Phone, 
  Instagram, 
  Globe2, 
  Code2, 
  Webhook, 
  Key, 
  Terminal, 
  BookOpen, 
  GitBranch, 
  Users, 
  Building2, 
  Briefcase, 
  HeartHandshake, 
  TrendingUp, 
  LifeBuoy, 
  Cpu, 
  CreditCard, 
  GraduationCap,
  LogIn,
  Scale,
  Cookie,
  Network,
  Activity,
  FileText,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FlynLogo from "@/components/FlynLogo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface MegaMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProductMegaMenu = ({ isOpen, onClose }: MegaMenuProps) => {
  const coreCapabilities = [
    { icon: MessageSquare, label: "Unified Inbox", href: "/product/unified-inbox" },
    { icon: Bot, label: "AI Agents", href: "/product/ai-agents" },
    { icon: Users, label: "CRM", href: "/product/crm" },
    { icon: Briefcase, label: "HR", href: "/product/hr" },
    { icon: Calendar, label: "Events", href: "/product/events" },
    { icon: Church, label: "Church", href: "/product/church" },
    { icon: GraduationCap, label: "Coaches", href: "/product/coaches" },
    { icon: Zap, label: "Automation", href: "/product/automation" },
    { icon: BarChart3, label: "Analytics", href: "/product/analytics" },
    { icon: CreditCard, label: "Billing & Usage", href: "/product/billing-usage" },
  ];

  const keyFeatures = [
    { icon: Bot, label: "AI Agents", description: "Automate workflows with human-like AI", href: "/product/ai-agents" },
    { icon: Users, label: "CRM", description: "Full-featured contact and pipeline management", href: "/product/crm" },
    { icon: Briefcase, label: "HR Management", description: "Payroll, leave, onboarding, and AI HR assistant", href: "/product/hr" },
    { icon: Calendar, label: "Events & Ticketing", description: "RSVP, check-in, QR tickets, and event CRM", href: "/product/events" },
    { icon: Globe, label: "Multiple Channels", description: "Manage WhatsApp, SMS, Email, Voice, Webchat and more", href: "/product/unified-inbox" },
  ];

  const channels = [
    { label: "WhatsApp", icon: MessageCircle, href: "/channels/whatsapp" },
    { label: "SMS", icon: MessageSquare, href: "/channels/sms" },
    { label: "Voice", icon: Phone, href: "/channels/voice" },
    { label: "Email", icon: Mail, href: "/channels/email" },
    { label: "Instagram", icon: Instagram, href: "/channels/instagram" },
    { label: "Webchat", icon: Globe2, href: "/channels/webchat" },
    { label: "Telegram", icon: MessageCircle, href: "/channels/telegram" },
    { label: "Facebook", icon: Globe2, href: "/channels/facebook" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-1/2 -translate-x-1/2 w-[860px] max-w-[95vw] bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl z-50"
          >
            <div className="px-6 py-5">
              <p className="text-muted-foreground text-sm mb-4">
                Everything modern teams need — modular, scalable, and powered by AI.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                      Core Capability Links
                    </p>
                    <div className="space-y-2">
                      {coreCapabilities.map((item) => (
                        <Link
                          key={item.label}
                          to={item.href}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors group"
                          onClick={onClose}
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <item.icon className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {item.label}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Link to="/signup">
                      <Button className="flyn-button-gradient">
                        Start Free Trial
                        <ChevronDown className="w-4 h-4 ml-1 rotate-[-90deg]" />
                      </Button>
                    </Link>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                    <span className="text-sm text-muted-foreground">Channels:</span>
                    {channels.map((channel) => (
                      <Link
                        key={channel.label}
                        to={channel.href}
                        onClick={onClose}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        <channel.icon className="w-3.5 h-3.5" />
                        {channel.label}
                      </Link>
                    ))}
                  </div>
                </div>
                
                {/* Right Column */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                    Key Features
                  </p>
                  <div className="space-y-1">
                    {keyFeatures.map((item) => (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
                        onClick={onClose}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <item.icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                              {item.label}
                            </p>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-muted-foreground rotate-[-90deg] group-hover:translate-x-1 transition-transform" />
                      </Link>
                    ))}
                  </div>
                  <Link
                    to="/product"
                    className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-primary hover:underline"
                    onClick={onClose}
                  >
                    See All Capabilities
                    <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const DevelopersMegaMenu = ({ isOpen, onClose }: MegaMenuProps) => {
  const quickLinks = [
    { icon: BookOpen, label: "Documentation", description: "Guides, tutorials, and integration walkthroughs", href: "/developers/docs" },
    { icon: Code2, label: "API Reference", description: "30+ REST endpoints with live try-it explorer", href: "/developers/api" },
    { icon: Webhook, label: "Webhooks", description: "Real-time event delivery for 40+ platform events", href: "/developers/webhooks" },
    { icon: Terminal, label: "SDKs", description: "Native SDKs for Node, Python, and more", href: "/developers/sdks" },
    { icon: Key, label: "Authentication", description: "Scoped keys for live and sandbox environments", href: "/developers/authentication" },
    { icon: GitBranch, label: "Rate Limits", description: "Understand and manage API rate limits", href: "/developers/rate-limits" },
  ];

  const codeSnippet = `POST /api/orchestrator/run
Authorization: Bearer sk_live_••••

{
  "workflowId": "wf_abc123",
  "input": { "channel": "whatsapp" }
}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-1/2 -translate-x-1/2 w-[820px] max-w-[95vw] bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl z-50"
          >
            <div className="px-6 py-5">
              <p className="text-muted-foreground text-sm mb-4">
                Full REST API, webhooks, and an in-app developer portal. Integrate FLYN AI in minutes.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Links */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                    Developer Resources
                  </p>
                  <div className="space-y-1">
                    {quickLinks.map((item) => (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
                        onClick={onClose}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <item.icon className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors text-sm">
                              {item.label}
                            </p>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-muted-foreground rotate-[-90deg] group-hover:translate-x-1 transition-transform" />
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Right: Code preview + CTA */}
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                      Quick Start
                    </p>
                    <div className="rounded-xl overflow-hidden border border-white/10">
                      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 border-b border-white/5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                        <span className="ml-2 text-xs text-white/30 font-mono">example.http</span>
                      </div>
                      <pre className="bg-zinc-950 p-4 text-xs font-mono text-white/70 overflow-x-auto leading-relaxed">
                        <code>{codeSnippet}</code>
                      </pre>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 pt-2 border-t border-border">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5 text-primary" /> 30+ endpoints</span>
                      <span className="flex items-center gap-1.5"><Webhook className="w-3.5 h-3.5 text-primary" /> 40+ events</span>
                      <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /> 99.9% uptime</span>
                    </div>
                    <Link to="/signup" onClick={onClose}>
                      <Button className="flyn-button-gradient w-full">
                        Get API Access
                        <ChevronDown className="w-4 h-4 ml-1 rotate-[-90deg]" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const SolutionsMegaMenu = ({ isOpen, onClose }: MegaMenuProps) => {
  const useCases = [
    { icon: TrendingUp, label: "Sales", description: "Close more deals with AI-powered pipelines", href: "/solutions/sales" },
    { icon: LifeBuoy, label: "Customer Support", description: "Resolve issues faster with intelligent inbox", href: "/solutions/customer-support" },
    { icon: Calendar, label: "Event Marketing", description: "Drive registrations across every channel", href: "/solutions/event-marketing" },
    { icon: Users, label: "Community Engagement", description: "Grow and engage your audience at scale", href: "/solutions/community-engagement" },
    { icon: Bot, label: "AI Customer Agents", description: "Automate conversations 24/7 without code", href: "/solutions/ai-customer-agents" },
  ];

  const industries = [
    { label: "Churches", href: "/solutions/churches" },
    { label: "Events", href: "/solutions/events" },
    { label: "Coaches", href: "/solutions/coaches" },
    { label: "Enterprises", href: "/solutions/enterprises" },
    { label: "Startups", href: "/solutions/startups" },
  ];

  const byTeam = [
    { label: "Founders", href: "/solutions/founders" },
    { label: "Marketing", href: "/solutions/marketing" },
    { label: "Support Teams", href: "/solutions/support" },
    { label: "Operations", href: "/solutions/operations" },
    { label: "IT Teams", href: "/solutions/it" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-1/2 -translate-x-1/2 w-[820px] max-w-[95vw] bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl z-50"
          >
            <div className="px-6 py-5">
              <p className="text-muted-foreground text-sm mb-4">
                FLYN AI helps every team achieve outcomes — not just features.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Use Cases */}
                <div className="lg:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">By Use Case</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {useCases.map((item) => (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                        onClick={onClose}
                      >
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <item.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground group-hover:text-primary transition-colors text-sm">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                {/* Industries + Teams */}
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">By Industry</p>
                    <div className="space-y-1">
                      {industries.map((item) => (
                        <Link key={item.label} to={item.href} onClick={onClose}
                          className="block px-3 py-2 text-sm text-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors">
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">By Team</p>
                    <div className="space-y-1">
                      {byTeam.map((item) => (
                        <Link key={item.label} to={item.href} onClick={onClose}
                          className="block px-3 py-2 text-sm text-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors">
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <Link to="/demo" onClick={onClose}>
                    <Button className="flyn-button-gradient w-full mt-2">
                      Request Demo
                      <ChevronDown className="w-4 h-4 ml-1 rotate-[-90deg]" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const CompanyMegaMenu = ({ isOpen, onClose }: MegaMenuProps) => {
  const pages = [
    { icon: Building2, label: "About Us", description: "Our mission, vision, and values", href: "/company/about" },
    { icon: Briefcase, label: "Careers", description: "Join the team building the future", href: "/company/careers" },
    { icon: HeartHandshake, label: "Customers", description: "Stories from teams using FLYN AI", href: "/company/customers" },
    { icon: BookOpen, label: "Case Studies", description: "Deep-dive results and outcomes", href: "/company/case-studies" },
    { icon: Users, label: "Partners", description: "Resellers, integrators, and alliances", href: "/company/partners" },
    { icon: Shield, label: "Security", description: "How we protect your data", href: "/company/security" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-1/2 -translate-x-1/2 w-[640px] max-w-[95vw] bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl z-50"
          >
            <div className="px-6 py-5">
              <p className="text-muted-foreground text-sm mb-4">
                The people and mission behind FLYN AI.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-2xl">
                {pages.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                    onClick={onClose}
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export const LandingHeader = () => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const footerLinks = useMemo(
    () => ({
      Product: [
        { label: "Unified Inbox", href: "/product/unified-inbox", icon: MessageSquare },
        { label: "AI Agents", href: "/product/ai-agents", icon: Bot },
        { label: "CRM", href: "/product/crm", icon: Users },
        { label: "Automation", href: "/product/automation", icon: Zap },
        { label: "Analytics", href: "/product/analytics", icon: BarChart3 },
        { label: "Billing & Usage", href: "/product/billing-usage", icon: CreditCard },
        { icon: Briefcase, label: "HR Management", href: "/product/hr" },
        { icon: Calendar, label: "Events & Ticketing", href: "/product/events" },
        { icon: Church, label: "Church Management", href: "/product/church" },
        { icon: GraduationCap, label: "Coaching Platforms", href: "/product/coaches" },
        { label: "Security", href: "/product/security", icon: Shield },
        { label: "Website Builder", href: "/product/website-builder", icon: Globe },
      ],
      Company: [
        { label: "About Us", href: "/company/about", icon: Building2 },
        { label: "Careers", href: "/company/careers", icon: Briefcase },
        { label: "Customers", href: "/company/customers", icon: Users },
        { label: "Case Studies", href: "/company/case-studies", icon: BookOpen },
        { label: "Partners", href: "/company/partners", icon: HeartHandshake },
        { label: "Security", href: "/company/security", icon: Shield },
        { label: "Blog", href: "/blog", icon: FileText },
        { label: "Pricing", href: "/pricing", icon: Zap },
        { label: "Contact Us", href: "/contact", icon: Phone },
      ],
      Legal: [
        { label: "Terms of Service", href: "/legal/terms", icon: Scale },
        { label: "Privacy Policy", href: "/legal/privacy", icon: Lock },
        { label: "Data Processing Agreement", href: "/legal/dpa", icon: FileText },
        { label: "Cookie Policy", href: "/legal/cookies", icon: Cookie },
        { label: "SLA", href: "/legal/sla", icon: Shield },
        { label: "Security", href: "/legal/security", icon: Shield },
      ],
      Developers: [
        { label: "Documentation", href: "/developers/docs", icon: BookOpen },
        { label: "API Reference", href: "/developers/api", icon: Code2 },
        { label: "Webhooks", href: "/developers/webhooks", icon: Webhook },
        { label: "SDKs", href: "/developers/sdks", icon: Cpu },
        { label: "Authentication", href: "/developers/authentication", icon: Key },
      ],
    }),
    []
  );

  const navItems = [
    { label: "Product", hasDropdown: true },
    { label: "Solutions", hasDropdown: true },
    { label: "Developers", hasDropdown: true },
    { label: "Company", hasDropdown: true },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact", href: "/contact" },
    { label: "Compare", href: "/compare" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-[60] bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <FlynLogo size="lg" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              item.hasDropdown ? (
                <button
                  key={item.label}
                  className={`flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeMenu === item.label
                      ? "text-primary bg-primary/5"
                      : "text-foreground hover:text-primary hover:bg-muted"
                  }`}
                  onMouseEnter={() => setActiveMenu(item.label)}
                  onClick={() => setActiveMenu(activeMenu === item.label ? null : item.label)}
                >
                  {item.label}
                  <ChevronDown className={`w-4 h-4 transition-transform ${activeMenu === item.label ? "rotate-180" : ""}`} />
                </button>
              ) : item.external ? (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.href || "#"}
                  className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                >
                  {item.label}
                </Link>
              )
            ))}
          </nav>

          {/* Right Actions - Desktop Only */}
          <div className="hidden lg:flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Login
              </Button>
            </Link>
            <Link to="/signup">
              <Button className="flyn-button-gradient animate-blink-red" size="sm">
                Start Free Trial
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button - Hamburger always visible on phone */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors ml-auto"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mega Menus */}
      <div onMouseLeave={() => setActiveMenu(null)}>
        <ProductMegaMenu isOpen={activeMenu === "Product"} onClose={() => setActiveMenu(null)} />
        <SolutionsMegaMenu isOpen={activeMenu === "Solutions"} onClose={() => setActiveMenu(null)} />
        <DevelopersMegaMenu isOpen={activeMenu === "Developers"} onClose={() => setActiveMenu(null)} />
        <CompanyMegaMenu isOpen={activeMenu === "Company"} onClose={() => setActiveMenu(null)} />
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="lg:hidden fixed inset-0 z-[100] bg-background flex flex-col h-[100dvh]"
          >
            <div className="flex items-center justify-between h-16 px-4 border-b border-border bg-background shrink-0">
              <FlynLogo size="lg" />
              <button
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-6 bg-background custom-scrollbar">
              {/* Login at top for mobile */}
              <div className="mb-6">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold shadow-sm active:scale-95 transition-transform"
                >
                  <div className="flex items-center gap-3">
                    <LogIn className="w-5 h-5" />
                    <span>Login to Dashboard</span>
                  </div>
                  <ChevronDown className="-rotate-90 w-5 h-5" />
                </Link>
              </div>

              {/* Categorized Menu using Accordion */}
              <Accordion type="single" collapsible className="w-full space-y-3">
                {Object.entries(footerLinks).map(([category, links]) => (
                  <AccordionItem 
                    key={category} 
                    value={category} 
                    className="border border-border/50 rounded-xl overflow-hidden bg-muted/30"
                  >
                    <AccordionTrigger className="flex px-4 py-4 hover:bg-muted/50 transition-all font-bold text-lg text-foreground hover:no-underline [&[data-state=open]]:bg-muted/50">
                      {category}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 px-2">
                      <div className="grid grid-cols-1 gap-1">
                        {links.map((link) => (
                          <Link
                            key={link.label}
                            to={link.href || "#"}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex items-center gap-4 p-3 rounded-lg hover:bg-primary/10 transition-all group"
                          >
                            <div className="p-2 rounded-lg bg-background border border-border group-hover:bg-primary/20 transition-colors">
                              {link.icon && <link.icon className="w-4 h-4 text-primary" />}
                            </div>
                            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                              {link.label}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
                
                {/* Additional flat links */}
                <div className="pt-2 space-y-3 pb-20">
                  <Link
                    to="/pricing"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block p-4 rounded-xl bg-muted/30 text-lg font-bold text-foreground border border-border/50 shadow-sm active:bg-muted/50 transition-colors"
                  >
                    Pricing
                  </Link>
                  <Link
                    to="/contact"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block p-4 rounded-xl bg-muted/30 text-lg font-bold text-foreground border border-border/50 shadow-sm active:bg-muted/50 transition-colors"
                  >
                    Contact
                  </Link>
                  <Link
                    to="/compare"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block p-4 rounded-xl bg-muted/30 text-lg font-bold text-foreground border border-border/50 shadow-sm active:bg-muted/50 transition-colors"
                  >
                    Compare
                  </Link>
                </div>
              </Accordion>
            </div>
            
            <div className="p-6 border-t border-border bg-background shrink-0 mt-auto">
               <p className="text-center text-xs text-muted-foreground">© {new Date().getFullYear()} FLYN AI. All rights reserved.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
