import { motion } from "framer-motion";
import { ShoppingCart, QrCode, Wifi, ArrowRight } from "lucide-react";

export const EsimHowItWorks = () => {
    const steps = [
        {
            icon: ShoppingCart,
            number: "01",
            title: "Buy a Data Plan",
            description: "Search for your destination and pick any data pack that suits your needs. Local, regional, and global plans available.",
            color: "from-emerald-400 to-emerald-600",
            glow: "emerald",
        },
        {
            icon: QrCode,
            number: "02",
            title: "Install the eSIM",
            description: "Easy installation via QR code. Simply scan the code from your device settings — no physical SIM card needed.",
            color: "from-cyan-400 to-cyan-600",
            glow: "cyan",
        },
        {
            icon: Wifi,
            number: "03",
            title: "Activate & Connect",
            description: "Activate your plan when you're ready. Enjoy fast, reliable internet connection — stream, browse, and stay in touch.",
            color: "from-emerald-400 to-cyan-500",
            glow: "emerald",
        },
    ];

    return (
        <section id="how-it-works" className="py-20 lg:py-28 bg-[#0a0a1a] relative overflow-hidden">
            {/* Background accent */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] bg-gradient-radial from-emerald-500/5 to-transparent rounded-full blur-3xl" />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <p className="text-xs font-medium text-emerald-400 tracking-widest uppercase mb-4">
                        Simple Setup
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                        How Does{" "}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            eSIM Work?
                        </span>
                    </h2>
                    <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
                        Set up your eSIM in minutes with three simple steps. No store visit required.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-8 lg:gap-12 relative">
                    {/* Connector line */}
                    <div className="hidden md:block absolute top-24 left-[20%] right-[20%] h-px bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20" />

                    {steps.map((step, index) => (
                        <motion.div
                            key={step.number}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.15 }}
                            className="relative group"
                        >
                            <div className="text-center">
                                {/* Numbered icon */}
                                <div className="relative mx-auto w-20 h-20 mb-6">
                                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${step.color} opacity-10 group-hover:opacity-20 transition-opacity blur-xl`} />
                                    <div className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br ${step.color} bg-opacity-10 border border-white/10 flex items-center justify-center`}
                                        style={{ background: `linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.1))` }}
                                    >
                                        <step.icon className="w-8 h-8 text-emerald-400" />
                                    </div>
                                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white shadow-lg">
                                        {step.number.replace("0", "")}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                                <p className="text-white/40 leading-relaxed text-sm">{step.description}</p>
                            </div>

                            {/* Arrow between steps */}
                            {index < steps.length - 1 && (
                                <div className="hidden md:flex absolute top-24 -right-6 lg:-right-8 items-center justify-center z-10">
                                    <ArrowRight className="w-5 h-5 text-emerald-500/30" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
