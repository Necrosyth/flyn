import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Globe, Zap, Headphones, Sparkles } from "lucide-react";

export const EsimHero = () => {
    const trustBadges = [
        { icon: Globe, text: "200+ Countries" },
        { icon: Zap, text: "Instant Activation" },
        { icon: Headphones, text: "24/7 Support" },
    ];

    const popularDestinations = [
        { name: "USA", flag: "🇺🇸" },
        { name: "UK", flag: "🇬🇧" },
        { name: "Japan", flag: "🇯🇵" },
        { name: "UAE", flag: "🇦🇪" },
        { name: "Turkey", flag: "🇹🇷" },
        { name: "Spain", flag: "🇪🇸" },
        { name: "France", flag: "🇫🇷" },
        { name: "Germany", flag: "🇩🇪" },
    ];

    return (
        <section className="relative min-h-screen pt-24 lg:pt-32 overflow-hidden bg-[#0a0a1a]">
            {/* Animated backgrounds */}
            <div className="absolute inset-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-emerald-500/15 via-cyan-500/5 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-radial from-cyan-500/10 to-transparent rounded-full blur-3xl" />
                <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-gradient-radial from-emerald-500/8 to-transparent rounded-full blur-3xl" />
            </div>

            {/* Subtle grid pattern */}
            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20">
                <div className="text-center max-w-4xl mx-auto">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-400 tracking-wide">Powered by FLYN AI</span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight text-white"
                    >
                        Global Connectivity,{" "}
                        <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                            One eSIM
                        </span>
                    </motion.h1>

                    {/* Subtext */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="mt-6 text-lg sm:text-xl text-white/50 leading-relaxed max-w-2xl mx-auto"
                    >
                        Travel smart with affordable eSIM data plans and high-speed internet.
                        Coverage in nearly every corner of the world — no physical SIM needed.
                    </motion.p>

                    {/* CTAs */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="mt-8 flex flex-col sm:flex-row items-center gap-4 justify-center"
                    >
                        <Link to="/signup">
                            <Button
                                size="lg"
                                className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white border-0 shadow-xl shadow-emerald-500/25 text-base px-8 py-3 h-auto"
                            >
                                Get Your eSIM Now
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </Link>
                        <a href="#countries">
                            <Button
                                size="lg"
                                variant="outline"
                                className="border-white/10 text-white hover:bg-white/5 text-base px-8 py-3 h-auto bg-transparent"
                            >
                                Explore All Countries
                            </Button>
                        </a>
                    </motion.div>

                    {/* Trust Badges */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="mt-10 flex flex-wrap items-center justify-center gap-6"
                    >
                        {trustBadges.map((badge, index) => (
                            <div key={badge.text} className="flex items-center gap-2 text-sm text-white/40">
                                <badge.icon className="w-4 h-4 text-emerald-400" />
                                <span>{badge.text}</span>
                                {index < trustBadges.length - 1 && (
                                    <span className="hidden sm:inline text-white/10 ml-4">|</span>
                                )}
                            </div>
                        ))}
                    </motion.div>

                    {/* Popular Destinations */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                        className="mt-16"
                    >
                        <p className="text-xs font-medium text-white/30 tracking-widest uppercase mb-4">
                            Popular Destinations
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            {popularDestinations.map((dest) => (
                                <a
                                    key={dest.name}
                                    href="#countries"
                                    className="group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all duration-300"
                                >
                                    <span className="text-lg">{dest.flag}</span>
                                    <span className="text-sm font-medium text-white/60 group-hover:text-white transition-colors">
                                        {dest.name}
                                    </span>
                                </a>
                            ))}
                        </div>
                    </motion.div>

                    {/* Stats strip */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.6 }}
                        className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto"
                    >
                        {[
                            { value: "200+", label: "Countries" },
                            { value: "500K+", label: "Downloads" },
                            { value: "4.8★", label: "Rating" },
                            { value: "24/7", label: "Support" },
                        ].map((stat) => (
                            <div key={stat.label} className="text-center">
                                <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                    {stat.value}
                                </p>
                                <p className="text-xs text-white/30 mt-1 tracking-wide">{stat.label}</p>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </div>

            {/* Bottom fade */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a1a] to-transparent" />
        </section>
    );
};
