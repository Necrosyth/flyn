import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowRight, Loader2, X, Wifi, Globe, Package } from "lucide-react";
import { esimService, EsimCountry, EsimPackageSummary } from "@/services/esim.service";
import { Button } from "@/components/ui/button";

const DEFAULT_REGIONS = ["All", "Americas", "Europe", "Asia", "Middle East", "Africa", "Oceania"];

export const EsimCountrySearch = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeRegion, setActiveRegion] = useState("All");
    const [countries, setCountries] = useState<EsimCountry[]>([]);
    const [regions, setRegions] = useState<string[]>(DEFAULT_REGIONS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Selected country for package drill-down
    const [selectedCountry, setSelectedCountry] = useState<EsimCountry | null>(null);
    const [countryPackages, setCountryPackages] = useState<EsimPackageSummary[]>([]);
    const [packagesLoading, setPackagesLoading] = useState(false);
    const [packagesPage, setPackagesPage] = useState(1);
    const [packagesTotalPages, setPackagesTotalPages] = useState(1);

    // Fetch countries on mount
    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const [countriesData, regionsData] = await Promise.all([
                    esimService.getCountries(),
                    esimService.getRegions(),
                ]);
                setCountries(countriesData);
                if (regionsData.length > 0) setRegions(regionsData);
            } catch (err: any) {
                console.error("Failed to load eSIM countries:", err);
                setError("Unable to load countries. Please try again later.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Filter countries by search & region
    const filtered = useMemo(() => {
        return countries.filter((c) => {
            const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.code.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRegion = activeRegion === "All" || c.region === activeRegion;
            return matchesSearch && matchesRegion;
        });
    }, [countries, searchQuery, activeRegion]);

    // Load packages when a country is selected
    const selectCountry = useCallback(async (country: EsimCountry) => {
        setSelectedCountry(country);
        setPackagesPage(1);
        setPackagesLoading(true);
        try {
            const result = await esimService.getPackagesByCountry(country.code, 1, 12);
            setCountryPackages(result.data);
            setPackagesTotalPages(result.lastPage);
        } catch (err) {
            console.error("Failed to load packages:", err);
        } finally {
            setPackagesLoading(false);
        }
    }, []);

    const loadMorePackages = useCallback(async () => {
        if (!selectedCountry || packagesPage >= packagesTotalPages) return;
        setPackagesLoading(true);
        try {
            const nextPage = packagesPage + 1;
            const result = await esimService.getPackagesByCountry(selectedCountry.code, nextPage, 12);
            setCountryPackages((prev) => [...prev, ...result.data]);
            setPackagesPage(nextPage);
        } catch (err) {
            console.error("Failed to load more packages:", err);
        } finally {
            setPackagesLoading(false);
        }
    }, [selectedCountry, packagesPage, packagesTotalPages]);

    return (
        <section id="countries" className="py-20 lg:py-28 bg-[#0a0a1a] relative">
            <div className="absolute inset-0">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-12"
                >
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">
                        Which Country is{" "}
                        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            Calling You?
                        </span>
                    </h2>
                    <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
                        Browse our coverage in {countries.length || "200+"}  countries. Find affordable data plans for your destination.
                    </p>
                </motion.div>

                {/* Search Bar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                    className="max-w-xl mx-auto mb-10"
                >
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                        <input
                            type="text"
                            placeholder="Search for a country..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setSelectedCountry(null); }}
                            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-muted/40 border border-white/[0.08] text-foreground placeholder-white/30 focus:outline-none focus:border-emerald-500/40 focus:bg-muted/50 transition-all text-base"
                        />
                    </div>
                </motion.div>

                {/* Region Tabs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 }}
                    className="flex flex-wrap items-center justify-center gap-2 mb-10"
                >
                    {regions.map((region) => (
                        <button
                            key={region}
                            onClick={() => { setActiveRegion(region); setSelectedCountry(null); }}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${activeRegion === region
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-muted/40 text-white/40 border border-white/[0.06] hover:text-foreground/60 hover:border-border"
                                }`}
                        >
                            {region}
                        </button>
                    ))}
                </motion.div>

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                        <span className="ml-3 text-white/40">Loading countries...</span>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="text-center py-12">
                        <p className="text-red-400/70 text-lg">{error}</p>
                        <Button
                            variant="ghost"
                            className="mt-4 text-emerald-400 hover:text-emerald-300"
                            onClick={() => window.location.reload()}
                        >
                            Retry
                        </Button>
                    </div>
                )}

                {/* Country Grid */}
                {!loading && !error && !selectedCountry && (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {filtered.map((country, index) => (
                                <motion.div
                                    key={country.code}
                                    initial={{ opacity: 0, y: 15 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: Math.min(index * 0.02, 0.3) }}
                                    onClick={() => selectCountry(country)}
                                    className="group relative p-4 rounded-2xl bg-muted/30 border border-white/[0.06] hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] transition-all duration-300 cursor-pointer"
                                >
                                    <div className="text-center">
                                        <img
                                            src={country.imageUrl}
                                            alt={country.name}
                                            className="w-10 h-7 object-cover rounded mx-auto"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <p className="mt-2 text-sm font-medium text-white/70 group-hover:text-foreground transition-colors">
                                            {country.name}
                                        </p>
                                        <p className="mt-1 text-xs text-emerald-400/70">
                                            From ${country.priceFrom.toFixed(2)}
                                        </p>
                                        <p className="mt-0.5 text-[10px] text-white/20">
                                            {country.packagesCount} plans
                                        </p>
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-emerald-500/10 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <span className="flex items-center gap-1 text-sm font-medium text-emerald-400">
                                            View Plans <ArrowRight className="w-3.5 h-3.5" />
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {filtered.length === 0 && (
                            <div className="text-center py-12">
                                <p className="text-white/30 text-lg">No countries found matching your search.</p>
                            </div>
                        )}
                    </>
                )}

                {/* Country Packages Detail View */}
                <AnimatePresence>
                    {selectedCountry && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            {/* Back button & country header */}
                            <div className="flex items-center gap-4 mb-8">
                                <button
                                    onClick={() => setSelectedCountry(null)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/40 border border-white/[0.08] text-white/60 hover:text-foreground hover:border-border transition-all"
                                >
                                    <X className="w-4 h-4" />
                                    Back to Countries
                                </button>
                                <div className="flex items-center gap-3">
                                    <img
                                        src={selectedCountry.imageUrl}
                                        alt={selectedCountry.name}
                                        className="w-8 h-6 object-cover rounded"
                                    />
                                    <div>
                                        <h3 className="text-xl font-bold text-foreground">{selectedCountry.name}</h3>
                                        <div className="flex items-center gap-3 text-xs text-white/30">
                                            <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {selectedCountry.packagesCount} plans</span>
                                            <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> {selectedCountry.networks.join(", ")}</span>
                                            <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {selectedCountry.region}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Packages Grid */}
                            {packagesLoading && countryPackages.length === 0 ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                                    <span className="ml-3 text-white/40">Loading plans...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {countryPackages.map((pkg) => (
                                            <motion.div
                                                key={pkg.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-5 rounded-2xl bg-muted/40 border border-white/[0.08] hover:border-emerald-500/30 transition-all duration-300"
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <span className="inline-block px-2 py-0.5 rounded-lg bg-emerald-500/10 text-[10px] font-medium text-emerald-400 uppercase">
                                                            {pkg.type}
                                                        </span>
                                                        {pkg.unlimited && (
                                                            <span className="ml-1 inline-block px-2 py-0.5 rounded-lg bg-cyan-500/10 text-[10px] font-medium text-cyan-400 uppercase">
                                                                Unlimited
                                                            </span>
                                                        )}
                                                    </div>
                                                    {pkg.countryCount > 1 && (
                                                        <span className="text-[10px] text-white/30">{pkg.countryCount} countries</span>
                                                    )}
                                                </div>

                                                <h4 className="text-sm font-medium text-white/80 mb-3 line-clamp-2">
                                                    {pkg.name}
                                                </h4>

                                                <div className="flex items-baseline gap-2 mb-3">
                                                    <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                                        ${pkg.price.toFixed(2)}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap gap-2 mb-4">
                                                    <span className="px-2 py-1 rounded-lg bg-muted/40 text-xs text-white/40">
                                                        {pkg.unlimited ? "Unlimited" : `${pkg.dataQuantity} ${pkg.dataUnit}`}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg bg-muted/40 text-xs text-white/40">
                                                        {pkg.validity} {pkg.validityUnit}{pkg.validity > 1 ? "s" : ""}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg bg-muted/40 text-xs text-white/40">
                                                        {pkg.connectivity}
                                                    </span>
                                                </div>

                                                {pkg.tether && (
                                                    <p className="text-[10px] text-emerald-400/50 mb-3">Hotspot enabled</p>
                                                )}

                                                <Button
                                                    className="w-full h-9 rounded-xl text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white border-0"
                                                >
                                                    Get This Plan
                                                </Button>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Load More */}
                                    {packagesPage < packagesTotalPages && (
                                        <div className="text-center mt-8">
                                            <Button
                                                variant="outline"
                                                onClick={loadMorePackages}
                                                disabled={packagesLoading}
                                                className="border-border text-white/60 hover:text-foreground hover:bg-muted bg-transparent"
                                            >
                                                {packagesLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                ) : null}
                                                Load More Plans
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
};
