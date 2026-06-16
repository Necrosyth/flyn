import { motion } from "framer-motion";

const PILLARS = [
  { icon: "💬", label: "Omnichannel Inbox" },
  { icon: "🤖", label: "AI Agents" },
  { icon: "⚡", label: "Workflow Automation" },
  { icon: "📊", label: "CRM & Analytics" },
  { icon: "🌐", label: "AI Website Builder" },
  { icon: "📅", label: "Bookings & Calendar" },
  { icon: "📂", label: "HR & Operations" },
];

export const TrustStrip = () => {
  return (
    <section className="py-12 lg:py-16 bg-muted/30 border-y border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-muted-foreground mb-8"
        >
          Everything your business needs — built into one platform by Flyn.
        </motion.p>

        <div className="relative overflow-hidden">
          <motion.div
            className="flex items-center gap-10 justify-center flex-wrap"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            {PILLARS.map((p, index) => (
              <motion.div
                key={p.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base">
                  {p.icon}
                </div>
                {p.label}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
};
