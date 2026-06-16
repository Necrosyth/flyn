import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { esimService, EsimPackageSummary } from "@/services/esim.service";

export const EsimPlans = () => {
    const [popularPackages, setPopularPackages] = useState<EsimPackageSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const data = await esimService.getPopularPackages(3);
                setPopularPackages(data);
            } catch (err) {
                console.error("Failed to load popular packages:", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Map popular packages into display format, with middle one as "popular"
    const plans = popularPackages.map((pkg, index) => {
        const isRegional = pkg.countryCount > 1 && pkg.countryCount <= 40;
        const isGlobal = pkg.countryCount > 40;
        const type = isGlobal ? "Global" : isRegional ? "Regional" : "Local";
        const badge = isGlobal ? "Worldwide" : isRegional ? "Multi-Country" : "Single Country";

        return {
            type,
            badge,
            example: isGlobal
                ? `${pkg.countryCount}+ Countries`
                : isRegional
                    ? `${pkg.countryCount} Countries`
                    : pkg.countries[0] || "Worldwide",
            flag: isGlobal ? "🌍" : isRegional ? "🌐" : "",
            data: pkg.unlimited ? "Unlimited" : `${pkg.dataQuantity} ${pkg.dataUnit}`,
            validity: `${pkg.validity} ${pkg.validityUnit}${pkg.validity > 1 ? "s" : ""}`,
            price: `$${pkg.price.toFixed(2)}`,
            features: [
                `${pkg.connectivity} data`,
                pkg.tether ? "Hotspot capable" : null,
                pkg.countryCount > 1 ? `Coverage in ${pkg.countryCount} countries` : null,
                "Instant QR delivery",
                "No contract required",
                pkg.unlimited ? "Unlimited data" : null,
            ].filter(Boolean) as string[],
            popular: index === 1, // Middle plan is popular
            pkg,
        };
    });

    // Fallback static plans if API fails or is loading
    const fallbackPlans = [
        {
            type: "Local",
            badge: "Single Country",
            example: "USA",
            flag: "🇺🇸",
            data: "5 GB",
            validity: "7 Days",
            price: "$4.50",
            features: [
                "High-speed 4G/5G data",
                "Instant QR delivery",
                "Hotspot capable",
                "No contract required",
            ],
            popular: false,
        },
        {
            type: "Regional",
            badge: "Multi-Country",
            example: "Europe (39 countries)",
            flag: "🇪🇺",
            data: "10 GB",
            validity: "30 Days",
            price: "$19.00",
            features: [
                "Coverage in 39+ countries",
                "One plan, one QR code",
                "Automatic carrier switching",
                "High-speed 4G/5G data",
                "Top-up anytime",
            ],
            popular: true,
        },
        {
            type: "Global",
            badge: "Worldwide",
            example: "120+ Countries",
            flag: "🌍",
            data: "20 GB",
            validity: "30 Days",
            price: "$49.00",
            features: [
                "Coverage in 120+ countries",
                "Unlimited carrier switching",
                "Priority support",
                "High-speed 4G/5G data",
                "Flexible top-ups",
                "Business-ready",
            ],
            popular: false,
        },
    ];

    const displayPlans = plans.length > 0 ? plans : fallbackPlans;

    return (
        <section id="plans" className="py-20 lg:py-28 bg-[#0a0a1a] relative overflow-hidden">
            {/* Gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            <div className="absolute bottom-1/3 right-0 w-[500px] h-[500px] bg-gradient-radial from-cyan-500/5 to-transparent rounded-full blur-3xl" />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <p className="text-xs font-medium text-emerald-400 tracking-widest uppercase mb-4">
                        Pricing
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                        Affordable{" "}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            Data Plans
                        </span>
                    </h2>
                    <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
                        Choose from Local, Regional, or Global plans. All plans include instant delivery and no contracts.
                    </p>
                </motion.div>

                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                        <span className="ml-3 text-white/40">Loading plans...</span>
                    </div>
                )}

                <div className={`grid md:grid-cols-3 gap-6 lg:gap-8 ${loading ? "opacity-50" : ""}`}>
                    {displayPlans.map((plan, index) => (
                        <motion.div
                            key={plan.type}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className={`relative group rounded-3xl p-[1px] ${plan.popular
                                    ? "bg-gradient-to-b from-emerald-500/50 via-cyan-500/50 to-emerald-500/50"
                                    : "bg-white/[0.06]"
                                }`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                                    <span className="flex items-center gap-1 px-4 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-xs font-bold text-white shadow-lg shadow-emerald-500/30">
                                        <Star className="w-3 h-3 fill-white" /> Most Popular
                                    </span>
                                </div>
                            )}

                            <div className={`relative rounded-3xl p-6 lg:p-8 h-full ${plan.popular ? "bg-[#0c1420]" : "bg-[#0a0a1a]"
                                }`}>
                                {/* Badge */}
                                <span className="inline-block px-3 py-1 rounded-lg bg-white/[0.05] text-xs font-medium text-white/50 mb-4 border border-white/[0.06]">
                                    {plan.badge}
                                </span>

                                {/* Type & example */}
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl">{plan.flag}</span>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{plan.type} eSIM</h3>
                                        <p className="text-xs text-white/30">{plan.example}</p>
                                    </div>
                                </div>

                                {/* Pricing */}
                                <div className="mt-6 mb-6">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                            {plan.price}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-sm text-white/30">
                                        <span>{plan.data}</span>
                                        <span className="w-1 h-1 rounded-full bg-white/20" />
                                        <span>{plan.validity}</span>
                                    </div>
                                </div>

                                {/* Features */}
                                <ul className="space-y-3 mb-8">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2.5">
                                            <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                            <span className="text-sm text-white/50">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA */}
                                <Button
                                    className={`w-full h-12 rounded-xl font-medium transition-all ${plan.popular
                                            ? "bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white shadow-lg shadow-emerald-500/20"
                                            : "bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1]"
                                        }`}
                                >
                                    Get This Plan
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
