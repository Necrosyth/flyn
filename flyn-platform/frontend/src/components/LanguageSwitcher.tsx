import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGUAGES, loadLanguage } from "@/i18n";
import { motion, AnimatePresence } from "framer-motion";

interface LanguageSwitcherProps {
    collapsed?: boolean;
    variant?: "sidebar" | "page";
}

const LanguageSwitcher = ({ collapsed = false, variant = "sidebar" }: LanguageSwitcherProps) => {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = async (code: string) => {
        try {
            if (code !== 'en' && !i18n.hasResourceBundle(code, 'translation')) {
                setIsLoading(true);
                await loadLanguage(code);
            }
            await i18n.changeLanguage(code);
            setIsOpen(false);
        } catch (error) {
            console.error("Failed to switch language:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (variant === "page") {
        return (
            <div ref={ref} className="relative inline-block">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm"
                >
                    <span>{currentLang.flag}</span>
                    <span className="font-medium">{currentLang.label}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full mt-1 right-0 w-40 bg-popover border border-border rounded-lg shadow-lg py-1 z-50"
                        >
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => handleSelect(lang.code)}
                                    className={cn(
                                        "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted",
                                        i18n.language === lang.code && "bg-primary/5 text-primary"
                                    )}
                                >
                                    <span>{lang.flag}</span>
                                    <span className="flex-1 text-left">{lang.label}</span>
                                    {i18n.language === lang.code && <Check className="h-3.5 w-3.5" />}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    // Sidebar variant
    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    "text-sidebar-foreground hover:bg-sidebar-accent",
                    collapsed && "justify-center"
                )}
            >
                <Globe className="h-5 w-5 flex-shrink-0" />
                {!collapsed && (
                    <>
                        <span className="font-medium flex-1 text-left text-sm">
                            {currentLang.flag} {currentLang.label}
                        </span>
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                    </>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                            "absolute bg-popover border border-border rounded-lg shadow-lg py-1 z-50",
                            collapsed
                                ? "left-full ml-2 bottom-0 w-40"
                                : "bottom-full mb-1 left-0 right-0"
                        )}
                    >
                        {LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleSelect(lang.code)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted",
                                    i18n.language === lang.code && "bg-primary/5 text-primary"
                                )}
                            >
                                <span>{lang.flag}</span>
                                <span className="flex-1 text-left">{lang.label}</span>
                                {i18n.language === lang.code && <Check className="h-3.5 w-3.5" />}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LanguageSwitcher;
