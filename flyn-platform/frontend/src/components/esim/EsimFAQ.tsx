import { motion } from "framer-motion";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

export const EsimFAQ = () => {
    const faqs = [
        {
            question: "What is an eSIM?",
            answer:
                "An eSIM (embedded SIM) is a digital SIM that allows you to activate a cellular plan without needing a physical SIM card. It's built into your phone and can be activated by scanning a QR code.",
        },
        {
            question: "How do I install an eSIM?",
            answer:
                "After purchasing a plan, you'll receive a QR code via email. Go to your phone's Settings → Cellular → Add eSIM → Scan QR Code. The entire process takes under 2 minutes.",
        },
        {
            question: "Is my phone eSIM compatible?",
            answer:
                "Most modern smartphones support eSIM, including iPhone XS and later, Google Pixel 3 and later, Samsung Galaxy S20 and later, and many more. Check our compatibility section or contact support.",
        },
        {
            question: "Can I use my regular SIM and eSIM at the same time?",
            answer:
                "Yes! Most eSIM-compatible phones support Dual SIM — meaning you can keep your regular number active while using the eSIM for data. This is perfect for international travel.",
        },
        {
            question: "When does my data plan start?",
            answer:
                "Your data plan starts only when you activate it on your device, not when you purchase it. You can buy your eSIM before your trip and activate it when you arrive at your destination.",
        },
        {
            question: "Can I get a refund?",
            answer:
                "Yes, you can request a full refund if you haven't activated or installed the eSIM. Once the eSIM is installed and activated, refunds are handled on a case-by-case basis.",
        },
        {
            question: "What happens when my data runs out?",
            answer:
                "You can easily top up your existing plan through our platform. No need to purchase a new eSIM — just add more data to your current one.",
        },
        {
            question: "How do I become an eSIM reseller?",
            answer:
                "Sign up for our reseller program through the platform. You'll get access to our API, white-label options, and volume pricing. Perfect for travel agencies, MVNOs, and telecom businesses.",
        },
    ];

    return (
        <section id="faq" className="py-20 lg:py-28 bg-[#0a0a1a] relative">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

            <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-12"
                >
                    <p className="text-xs font-medium text-emerald-400 tracking-widest uppercase mb-4">
                        FAQ
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
                        Frequently Asked{" "}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            Questions
                        </span>
                    </h2>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                >
                    <Accordion type="single" collapsible className="space-y-3">
                        {faqs.map((faq, index) => (
                            <AccordionItem
                                key={index}
                                value={`faq-${index}`}
                                className="rounded-2xl bg-white/[0.02] border border-white/[0.06] px-6 data-[state=open]:border-emerald-500/20 data-[state=open]:bg-white/[0.04] transition-all"
                            >
                                <AccordionTrigger className="text-left text-white hover:text-emerald-300 hover:no-underline py-5 text-base font-medium [&[data-state=open]>svg]:text-emerald-400">
                                    {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-white/40 text-sm leading-relaxed pb-5">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </motion.div>
            </div>
        </section>
    );
};
