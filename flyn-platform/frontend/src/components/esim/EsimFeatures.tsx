import { motion } from "framer-motion";
import { DollarSign, Globe, Wifi, Smartphone, Headphones, Repeat } from "lucide-react";

export const EsimFeatures = () => {
    const features = [
        {
            icon: DollarSign,
            title: "Affordable Plans",
            description: "Enjoy global connectivity without overspending. Plans start as low as $3.00 for select destinations.",
        },
        {
            icon: Globe,
            title: "Free Roaming",
            description: "Say goodbye to roaming charges. Use your plan across covered regions with no extra fees.",
        },
        {
            icon: Wifi,
            title: "Reliable & Fast Internet",
            description: "Stream, browse, and connect with high-speed 4G/5G data on trusted local carrier networks.",
        },
        {
            icon: Smartphone,
            title: "Easy Installation",
            description: "Get connected in a few taps. Scan a QR code from your device settings — no physical SIM needed.",
        },
        {
            icon: Headphones,
            title: "24/7 Support",
            description: "Our support team is always available to help via chat, email, or phone. Quick resolutions guaranteed.",
        },
        {
            icon: Repeat,
            title: "Flexible Top-Ups",
            description: "Running low on data? Top up your existing plan anytime, anywhere — no new eSIM required.",
        },
    ];

    return (
        <section className="py-20 lg:py-28 bg-[#0a0a1a] relative overflow-hidden">
            {/* Gradient accents */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
            <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-gradient-radial from-emerald-500/5 to-transparent rounded-full blur-3xl -translate-y-1/2" />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <p className="text-xs font-medium text-emerald-400 tracking-widest uppercase mb-4">
                        Why Choose Us
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                        Why Travelers Trust{" "}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            FLYN eSIM
                        </span>
                    </h2>
                    <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
                        Tour internationally with FLYN eSIM. The world knows no borders — just one tap to travel through nations.
                    </p>
                </motion.div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.08 }}
                            className="group relative p-6 lg:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-emerald-500/20 hover:bg-white/[0.04] transition-all duration-500"
                        >
                            {/* Glassmorphism glow on hover */}
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className="relative">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                                    <feature.icon className="w-6 h-6 text-emerald-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-300 transition-colors">
                                    {feature.title}
                                </h3>
                                <p className="text-sm text-white/40 leading-relaxed">
                                    {feature.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
