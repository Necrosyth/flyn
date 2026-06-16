import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Code, Layers, Users } from "lucide-react";

export const EsimCTA = () => {
    const resellerBenefits = [
        {
            icon: Code,
            title: "Easy API Integration",
            description: "RESTful API with comprehensive documentation, SDKs, and webhooks for seamless integration.",
        },
        {
            icon: Layers,
            title: "White-Label Ready",
            description: "Full white-label solution. Customize branding, pricing, and user experience for your platform.",
        },
        {
            icon: Users,
            title: "Volume Pricing",
            description: "Competitive wholesale rates with tiered pricing. The more you sell, the more you earn.",
        },
    ];

    return (
        <section className="py-20 lg:py-28 bg-[#0a0a1a] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

            {/* Gradient bg */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-radial from-emerald-500/10 to-transparent rounded-full blur-3xl" />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                {/* Reseller section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
                        <span className="text-xs font-medium text-emerald-400 tracking-wide">For Business Partners</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                        Become an{" "}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            eSIM Reseller
                        </span>
                    </h2>
                    <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
                        Join our reseller program and offer eSIM services to your customers.
                        Perfect for travel agencies, MVNOs, and telecom businesses.
                    </p>
                </motion.div>

                {/* Benefits grid */}
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                    {resellerBenefits.map((benefit, index) => (
                        <motion.div
                            key={benefit.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center"
                        >
                            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/10 flex items-center justify-center mb-4">
                                <benefit.icon className="w-6 h-6 text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{benefit.title}</h3>
                            <p className="text-sm text-white/40">{benefit.description}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Final CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center"
                >
                    <div className="max-w-xl mx-auto p-8 rounded-3xl bg-gradient-to-b from-white/[0.04] to-white/[0.02] border border-white/[0.08]">
                        <h3 className="text-2xl font-bold text-white mb-3">
                            Ready to Start Selling?
                        </h3>
                        <p className="text-white/40 mb-6 text-sm">
                            Get started in minutes. Full API documentation, sandbox environment, and dedicated support included.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                            <Link to="/signup">
                                <Button
                                    size="lg"
                                    className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white border-0 shadow-xl shadow-emerald-500/25 px-8"
                                >
                                    Apply as Reseller
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                            </Link>
                            <Button
                                size="lg"
                                variant="outline"
                                className="border-white/10 text-white hover:bg-white/5 px-8 bg-transparent"
                            >
                                View API Docs
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
