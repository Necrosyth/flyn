import { motion } from "framer-motion";
import { Smartphone, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const EsimCompatibility = () => {
    const brands = [
        {
            name: "Apple",
            devices: ["iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro", "iPhone 14", "iPhone 13", "iPhone SE (3rd gen)", "iPad Pro (2022)", "iPad Air (5th gen)"],
            icon: "🍎",
        },
        {
            name: "Samsung",
            devices: ["Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24", "Galaxy S23 Ultra", "Galaxy Z Fold5", "Galaxy Z Flip5", "Galaxy A54 5G"],
            icon: "📱",
        },
        {
            name: "Google",
            devices: ["Pixel 8 Pro", "Pixel 8", "Pixel 7 Pro", "Pixel 7", "Pixel 7a", "Pixel 6 Pro", "Pixel 6"],
            icon: "🔍",
        },
        {
            name: "Others",
            devices: ["Motorola Razr+", "OnePlus 11", "Sony Xperia 1 V", "Huawei P50 Pro", "OPPO Find X5 Pro"],
            icon: "📲",
        },
    ];

    return (
        <section id="compatibility" className="py-20 lg:py-28 bg-[#0a0a1a] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <p className="text-xs font-medium text-emerald-400 tracking-widest uppercase mb-4">
                        Device Support
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                        Is Your Phone{" "}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            eSIM Compatible?
                        </span>
                    </h2>
                    <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
                        Most modern smartphones support eSIM technology. Check if your device is on the list.
                    </p>
                </motion.div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {brands.map((brand, index) => (
                        <motion.div
                            key={brand.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-emerald-500/20 transition-all duration-300"
                        >
                            <div className="flex items-center gap-3 mb-5">
                                <span className="text-2xl">{brand.icon}</span>
                                <h3 className="text-lg font-bold text-white">{brand.name}</h3>
                            </div>
                            <ul className="space-y-2.5">
                                {brand.devices.map((device) => (
                                    <li key={device} className="flex items-center gap-2">
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
                                        <span className="text-sm text-white/40">{device}</span>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    ))}
                </div>

                {/* CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mt-12"
                >
                    <div className="inline-flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                        <Smartphone className="w-5 h-5 text-emerald-400" />
                        <span className="text-sm text-white/50">Don't see your device?</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        >
                            Check Full List →
                        </Button>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
