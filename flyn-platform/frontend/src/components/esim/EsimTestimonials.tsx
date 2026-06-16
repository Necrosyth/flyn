import { useState } from "react";
import { motion } from "framer-motion";
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";

interface Testimonial {
    name: string;
    date: string;
    title: string;
    text: string;
    rating: number;
    destination: string;
}

const testimonials: Testimonial[] = [
    {
        name: "Sakura M.",
        date: "Aug 2025",
        title: "Ease of Internet Access",
        text: "I recently traveled to Spain and used this eSIM service. It was my lifesaver. It makes it easy to access the internet during my trip. If you're going to travel abroad, I highly recommend this service.",
        rating: 5,
        destination: "Spain",
    },
    {
        name: "Fergus E.",
        date: "Sep 2025",
        title: "Big Savings",
        text: "After getting a $60 roaming bill in Turkey, I decided to find affordable alternatives. On my next trip to Uzbekistan, I used FLYN eSIM and found it very reasonable with a good connection. Highly recommend!",
        rating: 5,
        destination: "Uzbekistan",
    },
    {
        name: "Amelia J.",
        date: "Sep 2025",
        title: "One Plan, Many Countries",
        text: "I used to buy local eSIMs for every country. Then I discovered their Regional eSIM — I can travel to multiple countries with one package. Super useful and genuinely exceptional.",
        rating: 5,
        destination: "Europe",
    },
    {
        name: "David A.",
        date: "Aug 2025",
        title: "Excellent Customer Service",
        text: "Had some initial issues with activation but the support team resolved it in minutes with clear instructions. After that, I experienced high-quality internet. Completely satisfied!",
        rating: 4,
        destination: "Germany",
    },
    {
        name: "John W.",
        date: "Jun 2025",
        title: "Smooth Activation",
        text: "Right after landing in Barcelona, I activated my FLYN eSIM connection. Smooth experience with immediate access to texts, WhatsApp, and more. Fan of unthrottled connectivity!",
        rating: 5,
        destination: "Spain",
    },
    {
        name: "Maria L.",
        date: "Jul 2025",
        title: "Multiple Plans Available",
        text: "I traveled across Europe with a single Regional eSIM plan. No high roaming charges and no plan changes during the entire tour. Will definitely use again.",
        rating: 5,
        destination: "Europe",
    },
];

export const EsimTestimonials = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const visibleCount = typeof window !== "undefined" && window.innerWidth >= 768 ? 3 : 1;
    const maxIndex = Math.max(0, testimonials.length - visibleCount);

    const prev = () => setCurrentIndex((i) => Math.max(0, i - 1));
    const next = () => setCurrentIndex((i) => Math.min(maxIndex, i + 1));

    return (
        <section className="py-20 lg:py-28 bg-[#0a0a1a] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-gradient-radial from-emerald-500/5 to-transparent rounded-full blur-3xl -translate-y-1/2" />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex items-end justify-between mb-12">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <p className="text-xs font-medium text-emerald-400 tracking-widest uppercase mb-4">
                            Testimonials
                        </p>
                        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                            What Our Customers{" "}
                            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                Say
                            </span>
                        </h2>
                    </motion.div>

                    <div className="hidden sm:flex items-center gap-2">
                        <button
                            onClick={prev}
                            disabled={currentIndex === 0}
                            className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={next}
                            disabled={currentIndex >= maxIndex}
                            className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Cards */}
                <div className="overflow-hidden">
                    <motion.div
                        className="flex gap-6"
                        animate={{ x: `-${currentIndex * (100 / visibleCount + 2)}%` }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        {testimonials.map((testimonial, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="flex-shrink-0 w-full md:w-[calc(33.333%-16px)]"
                            >
                                <div className="h-full p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-emerald-500/20 transition-all duration-300">
                                    {/* Quote icon */}
                                    <Quote className="w-8 h-8 text-emerald-500/20 mb-4" />

                                    {/* Stars */}
                                    <div className="flex items-center gap-1 mb-3">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star
                                                key={i}
                                                className={`w-4 h-4 ${i < testimonial.rating
                                                        ? "text-yellow-400 fill-yellow-400"
                                                        : "text-white/10"
                                                    }`}
                                            />
                                        ))}
                                    </div>

                                    <h4 className="text-base font-semibold text-white mb-2">{testimonial.title}</h4>
                                    <p className="text-sm text-white/40 leading-relaxed mb-6">{testimonial.text}</p>

                                    <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                                        <div>
                                            <p className="text-sm font-medium text-white/70">{testimonial.name}</p>
                                            <p className="text-xs text-white/30">{testimonial.date}</p>
                                        </div>
                                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/10">
                                            📍 {testimonial.destination}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>

                {/* Mobile navigation dots */}
                <div className="flex sm:hidden items-center justify-center gap-2 mt-6">
                    {testimonials.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? "bg-emerald-400 w-6" : "bg-white/20"
                                }`}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};
