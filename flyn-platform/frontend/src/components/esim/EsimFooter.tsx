import { Link } from "react-router-dom";
import { Wifi, Twitter, Linkedin, Instagram, Facebook, Youtube } from "lucide-react";

export const EsimFooter = () => {
    const footerLinks = {
        Product: [
            { label: "Local eSIM", href: "#plans" },
            { label: "Regional eSIM", href: "#plans" },
            { label: "Global eSIM", href: "#plans" },
            { label: "Business Plans", href: "#plans" },
        ],
        Support: [
            { label: "Help Center", href: "#faq" },
            { label: "Installation Guide", href: "#how-it-works" },
            { label: "Compatible Devices", href: "#compatibility" },
            { label: "Contact Us", href: "#" },
        ],
        Reseller: [
            { label: "Become a Reseller", href: "/signup" },
            { label: "API Documentation", href: "#" },
            { label: "Pricing", href: "#plans" },
            { label: "Partner Dashboard", href: "/login" },
        ],
        Company: [
            { label: "About FLYN AI", href: "/" },
            { label: "Careers", href: "#" },
            { label: "Blog", href: "#" },
            { label: "Press", href: "#" },
        ],
    };

    const socialLinks = [
        { icon: Twitter, href: "#", label: "Twitter" },
        { icon: Linkedin, href: "#", label: "LinkedIn" },
        { icon: Instagram, href: "#", label: "Instagram" },
        { icon: Facebook, href: "#", label: "Facebook" },
        { icon: Youtube, href: "#", label: "YouTube" },
    ];

    return (
        <footer className="bg-[#060612] border-t border-white/5">
            {/* Main footer */}
            <div className="py-12 lg:py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
                        {/* Brand column */}
                        <div className="col-span-2 md:col-span-1">
                            <Link to="/esim" className="flex items-center gap-2.5 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
                                    <Wifi className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-base font-bold text-white">
                                    FLYN <span className="text-emerald-400">eSIM</span>
                                </span>
                            </Link>
                            <p className="text-sm text-white/30 leading-relaxed mb-6">
                                Global connectivity made simple. eSIM data plans for 200+ countries.
                            </p>
                            <div className="flex items-center gap-3">
                                {socialLinks.map((social) => (
                                    <a
                                        key={social.label}
                                        href={social.href}
                                        className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/30 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20 transition-all"
                                        aria-label={social.label}
                                    >
                                        <social.icon className="w-3.5 h-3.5" />
                                    </a>
                                ))}
                            </div>
                        </div>

                        {/* Link columns */}
                        {Object.entries(footerLinks).map(([category, links]) => (
                            <div key={category}>
                                <h4 className="text-sm font-semibold text-white/70 mb-4">{category}</h4>
                                <ul className="space-y-2.5">
                                    {links.map((link) => (
                                        <li key={link.label}>
                                            {link.href.startsWith("#") || link.href.startsWith("http") ? (
                                                <a
                                                    href={link.href}
                                                    className="text-sm text-white/30 hover:text-emerald-400 transition-colors"
                                                >
                                                    {link.label}
                                                </a>
                                            ) : (
                                                <Link
                                                    to={link.href}
                                                    className="text-sm text-white/30 hover:text-emerald-400 transition-colors"
                                                >
                                                    {link.label}
                                                </Link>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-white/5 py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-white/20">
                        © {new Date().getFullYear()} FLYN AI. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6">
                        <a href="#" className="text-xs text-white/20 hover:text-white/40 transition-colors">
                            Terms of Service
                        </a>
                        <a href="#" className="text-xs text-white/20 hover:text-white/40 transition-colors">
                            Privacy Policy
                        </a>
                        <a href="#" className="text-xs text-white/20 hover:text-white/40 transition-colors">
                            Cookie Policy
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
};
