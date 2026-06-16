import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";

export const EsimHeader = () => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const navLinks = [
        { label: "Plans", href: "#plans" },
        { label: "How It Works", href: "#how-it-works" },
        { label: "Countries", href: "#countries" },
        { label: "Compatibility", href: "#compatibility" },
        { label: "FAQ", href: "#faq" },
    ];

    const scrollToSection = (href: string) => {
        const el = document.querySelector(href);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
            setMobileMenuOpen(false);
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a1a]/90 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex items-center justify-between h-16 lg:h-20">
                    {/* Logo */}
                    <Link to="/esim" className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
                            <Wifi className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-lg font-bold text-white tracking-tight leading-none">
                                FLYN <span className="text-emerald-400">eSIM</span>
                            </span>
                            <span className="text-[10px] text-white/40 tracking-widest uppercase">Global Connectivity</span>
                        </div>
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden lg:flex items-center gap-1">
                        {navLinks.map((item) => (
                            <button
                                key={item.label}
                                onClick={() => scrollToSection(item.href)}
                                className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>

                    {/* Right Actions */}
                    <div className="hidden lg:flex items-center gap-3">
                        <Link to="/login">
                            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/5">
                                Login
                            </Button>
                        </Link>
                        <Link to="/signup">
                            <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white border-0 shadow-lg shadow-emerald-500/25">
                                Become a Reseller
                            </Button>
                        </Link>
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        className="lg:hidden p-2 rounded-lg text-white/70 hover:bg-white/5 transition-colors"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="lg:hidden bg-[#0a0a1a] border-b border-white/5"
                    >
                        <div className="px-4 py-6 space-y-2">
                            {navLinks.map((item) => (
                                <button
                                    key={item.label}
                                    onClick={() => scrollToSection(item.href)}
                                    className="flex items-center w-full px-4 py-3 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    {item.label}
                                </button>
                            ))}
                            <div className="pt-4 border-t border-white/10 space-y-3">
                                <Link to="/login" className="block">
                                    <Button variant="outline" className="w-full border-white/10 text-white hover:bg-white/5">
                                        Login
                                    </Button>
                                </Link>
                                <Link to="/signup" className="block">
                                    <Button className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-0">
                                        Become a Reseller
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};
