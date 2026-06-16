import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Code2,
  Webhook,
  Key,
  Zap,
  ArrowRight,
  Terminal,
  GitBranch,
  Globe,
  Lock,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";

const CODE_SNIPPET = `// Trigger an AI automation via FLYN API
const response = await fetch("https://api.myflynai.com/api/orchestrator/run", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_live_••••••••••••",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    workflowId: "wf_abc123",
    input: { contact_id: "c_789", channel: "whatsapp" },
  }),
});

const { runId, status } = await response.json();
// → { runId: "run_xyz", status: "running" }`;

const features = [
  {
    icon: Key,
    title: "API Keys",
    description: "Generate scoped API keys for live and sandbox environments. Full audit trail on every request.",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    description: "Real-time event delivery to your systems — message received, call ended, automation triggered.",
  },
  {
    icon: GitBranch,
    title: "Workflow API",
    description: "Trigger, pause, and inspect automation runs programmatically from any backend.",
  },
  {
    icon: Globe,
    title: "Channel Integrations",
    description: "Connect WhatsApp, Telegram, Slack and more via REST. Full send/receive message control.",
  },
  {
    icon: Terminal,
    title: "Live API Explorer",
    description: "Try every endpoint in-app with your real credentials. No Postman needed.",
  },
  {
    icon: Lock,
    title: "OAuth & SSO",
    description: "Enterprise-grade auth. White-label your login with custom SSO providers.",
  },
];

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
      aria-label="Copy code"
    >
      {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

export const DeveloperSection = () => {
  return (
    <section className="py-20 lg:py-28 bg-gradient-to-b from-background via-muted/20 to-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-5">
            <Code2 className="w-4 h-4" />
            Built for Developers
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
            A platform you can{" "}
            <span className="flyn-gradient-text">build on top of</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Full REST API, real-time webhooks, and an in-app developer portal. Integrate FLYN AI
            into your existing stack in minutes.
          </p>
        </motion.div>

        {/* Main content: code + features */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          {/* Code block */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="relative rounded-xl overflow-hidden border border-border shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 bg-zinc-900 border-b border-white/5">
                <span className="w-3 h-3 rounded-full bg-red-500/70" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
                <span className="ml-3 text-xs text-white/30 font-mono">trigger-workflow.ts</span>
              </div>
              {/* Code */}
              <div className="relative bg-zinc-950 p-5">
                <CopyButton text={CODE_SNIPPET} />
                <pre className="text-sm font-mono text-white/80 overflow-x-auto leading-relaxed">
                  <code>{CODE_SNIPPET}</code>
                </pre>
              </div>
            </div>

            {/* Endpoint badges */}
            <div className="mt-5 flex flex-wrap gap-2">
              {["POST /api/orchestrator/run", "GET /api/channels/list", "POST /api/channels/broadcast", "DELETE /api/billing/keys/:id"].map((ep) => (
                <span key={ep} className="px-3 py-1 rounded-full bg-muted text-xs font-mono text-muted-foreground border border-border/50">
                  {ep}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Feature grid */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-5"
          >
            {features.map((feat, i) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <feat.icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{feat.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{feat.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border border-primary/10 p-8"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center mb-8">
            {[
              { label: "API Endpoints", value: "30+" },
              { label: "Webhook Events", value: "40+" },
              { label: "Avg Response", value: "<80ms" },
              { label: "Uptime SLA", value: "99.9%" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/signup">
              <Button className="flyn-button-gradient gap-2">
                <Zap className="w-4 h-4" />
                Get API Access
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/support/knowledge-base">
              <Button variant="outline" className="gap-2">
                <Code2 className="w-4 h-4" />
                Read the Docs
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
