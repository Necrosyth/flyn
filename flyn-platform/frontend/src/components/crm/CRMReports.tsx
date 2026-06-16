import { useState, useEffect, useCallback } from 'react';
import * as crmService from '@/services/crm';
import type { Deal, CRMDashboardStats } from '@/services/crm';
import {
    TrendingUp, DollarSign, Target, BarChart3, Users, RefreshCw, Award,
} from 'lucide-react';

const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
};

const STAGE_COLORS: Record<string, string> = {
    new: '#6366f1',
    qualified: '#8b5cf6',
    proposal: '#a855f7',
    negotiation: '#d946ef',
    won: '#22c55e',
    lost: '#ef4444',
};

const CRMReports = () => {
    const [deals, setDeals] = useState<Deal[]>([]);
    const [stats, setStats] = useState<CRMDashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [allDeals, dashStats] = await Promise.all([
                crmService.getDeals(),
                crmService.getDashboardStats(),
            ]);
            setDeals(allDeals);
            setStats(dashStats);
        } catch (err) {
            console.warn('Reports data unavailable');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Compute metrics
    const wonDeals = deals.filter(d => d.stage === 'won');
    const lostDeals = deals.filter(d => d.stage === 'lost');
    const openDeals = deals.filter(d => !['won', 'lost'].includes(d.stage));
    const totalRevenue = wonDeals.reduce((s, d) => s + (d.value || 0), 0);
    const openPipeline = openDeals.reduce((s, d) => s + (d.value || 0), 0);
    const avgDealSize = wonDeals.length > 0 ? Math.round(totalRevenue / wonDeals.length) : 0;
    const winRate = deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0;

    // Pipeline breakdown
    const stages = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
    const pipelineData = stages.map(stage => ({
        stage,
        count: deals.filter(d => d.stage === stage).length,
        value: deals.filter(d => d.stage === stage).reduce((s, d) => s + (d.value || 0), 0),
    }));
    const maxStageValue = Math.max(...pipelineData.map(p => p.value), 1);

    // Revenue by source
    const sourceMap: Record<string, number> = {};
    if (stats?.leadSources) {
        stats.leadSources.forEach(s => { sourceMap[s.source] = s.count; });
    }
    const maxSourceCount = Math.max(...Object.values(sourceMap), 1);

    // Rep performance (by deal owner)
    const repMap: Record<string, { deals: number; won: number; value: number }> = {};
    deals.forEach(deal => {
        const rep = deal.owner || 'Unassigned';
        if (!repMap[rep]) repMap[rep] = { deals: 0, won: 0, value: 0 };
        repMap[rep].deals++;
        if (deal.stage === 'won') { repMap[rep].won++; repMap[rep].value += deal.value || 0; }
    });
    const repData = Object.entries(repMap)
        .sort((a, b) => b[1].value - a[1].value)
        .slice(0, 8);

    // Won/lost reasons
    const lostReasons: Record<string, number> = {};
    lostDeals.forEach(d => {
        const r = d.lostReason || 'Not specified';
        lostReasons[r] = (lostReasons[r] || 0) + 1;
    });

    // Monthly deals (group by creation month)
    const monthlyMap: Record<string, number> = {};
    deals.forEach(d => {
        if (!d.createdAt) return;
        const month = new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthlyMap[month] = (monthlyMap[month] || 0) + 1;
    });
    const monthlyData = Object.entries(monthlyMap).slice(-6);
    const maxMonthly = Math.max(...monthlyData.map(m => m[1]), 1);

    return (
        <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Won Revenue', value: formatCurrency(totalRevenue), sub: `${wonDeals.length} deals`, icon: <DollarSign className="w-4 h-4 text-emerald-500" />, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Open Pipeline', value: formatCurrency(openPipeline), sub: `${openDeals.length} deals`, icon: <TrendingUp className="w-4 h-4 text-indigo-500" />, color: 'text-indigo-600 dark:text-indigo-400' },
                    { label: 'Win Rate', value: `${winRate}%`, sub: `${wonDeals.length} won / ${lostDeals.length} lost`, icon: <Target className="w-4 h-4 text-purple-500" />, color: 'text-purple-600 dark:text-purple-400' },
                    { label: 'Avg Deal Size', value: formatCurrency(avgDealSize), sub: 'Per closed deal', icon: <BarChart3 className="w-4 h-4 text-amber-500" />, color: 'text-amber-600 dark:text-amber-400' },
                ].map(kpi => (
                    <div key={kpi.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2 rounded-lg bg-primary/10">{kpi.icon}</div>
                        </div>
                        <p className={`text-xl font-bold tracking-tight ${kpi.color}`}>{kpi.value}</p>
                        <p className="text-xs font-medium text-foreground/70 mt-0.5">{kpi.label}</p>
                        <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Pipeline Velocity by Stage */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" /> Pipeline Value by Stage
                    </h3>
                    <div className="space-y-3">
                        {pipelineData.map(row => (
                            <div key={row.stage}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[row.stage] || '#6b7280' }} />
                                        <span className="capitalize text-foreground font-medium">{row.stage}</span>
                                        <span className="text-muted-foreground">({row.count})</span>
                                    </div>
                                    <span className="text-muted-foreground font-medium">{formatCurrency(row.value)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                            width: `${Math.max((row.value / maxStageValue) * 100, row.count > 0 ? 3 : 0)}%`,
                                            backgroundColor: STAGE_COLORS[row.stage] || '#6b7280',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Revenue by Lead Source */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Target className="w-4 h-4 text-purple-500" /> Contacts by Lead Source
                    </h3>
                    {Object.keys(sourceMap).length > 0 ? (
                        <div className="space-y-3">
                            {Object.entries(sourceMap)
                                .sort((a, b) => b[1] - a[1])
                                .map(([source, count], idx) => {
                                    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];
                                    return (
                                        <div key={source}>
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-foreground/80 capitalize">{source || 'Unknown'}</span>
                                                <span className="text-muted-foreground">{count} contacts</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{ width: `${(count / maxSourceCount) * 100}%`, backgroundColor: colors[idx % colors.length] }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-xs text-muted-foreground">No source data available</div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Rep Performance */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500" /> Rep Performance
                    </h3>
                    {repData.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2">Rep</th>
                                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2">Deals</th>
                                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2">Won</th>
                                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2">Revenue</th>
                                        <th className="text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2">Win %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {repData.map(([rep, data], idx) => (
                                        <tr key={rep} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                            <td className="py-2.5">
                                                <div className="flex items-center gap-2">
                                                    {idx === 0 && <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                                    <span className="text-xs font-medium text-foreground">{rep}</span>
                                                </div>
                                            </td>
                                            <td className="text-right text-xs text-muted-foreground py-2.5">{data.deals}</td>
                                            <td className="text-right text-xs text-emerald-600 dark:text-emerald-400 font-medium py-2.5">{data.won}</td>
                                            <td className="text-right text-xs font-bold text-foreground py-2.5">{formatCurrency(data.value)}</td>
                                            <td className="text-right py-2.5">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                                                    {data.deals > 0 ? Math.round((data.won / data.deals) * 100) : 0}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Users className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">Assign owners to deals to see rep performance</p>
                        </div>
                    )}
                </div>

                {/* Deals Created Per Month */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-500" /> Deals Created (Last 6 Months)
                    </h3>
                    {monthlyData.length > 0 ? (
                        <div className="flex items-end gap-2 h-32">
                            {monthlyData.map(([month, count]) => (
                                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[9px] text-muted-foreground font-medium">{count}</span>
                                    <div
                                        className="w-full rounded-t-md bg-primary/60 hover:bg-primary transition-colors"
                                        style={{ height: `${Math.max((count / maxMonthly) * 100, 4)}%` }}
                                        title={`${month}: ${count} deals`}
                                    />
                                    <span className="text-[9px] text-muted-foreground">{month}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-xs text-muted-foreground">No deal history yet</div>
                    )}
                </div>
            </div>

            {/* Lost Reasons */}
            {Object.keys(lostReasons).length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Target className="w-4 h-4 text-red-500" /> Lost Deal Reasons
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries(lostReasons)
                            .sort((a, b) => b[1] - a[1])
                            .map(([reason, count]) => (
                                <div key={reason} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                                    <div className="text-base font-bold text-red-600 dark:text-red-400">{count}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{reason}</div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Forecasting summary */}
            <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-500" /> Sales Forecast
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalRevenue)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Closed Revenue</div>
                    </div>
                    <div className="p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-center">
                        <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                            {formatCurrency(openDeals.reduce((s, d) => s + (d.value || 0) * ((d.probability || 50) / 100), 0))}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Weighted Pipeline</div>
                    </div>
                    <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20 text-center">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{formatCurrency(openPipeline)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Best Case Pipeline</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CRMReports;
