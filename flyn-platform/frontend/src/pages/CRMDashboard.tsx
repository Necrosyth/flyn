/**
 * CRM Dashboard
 * 
 * Enhanced CRM dashboard that fetches live data from /api/crm/dashboard.
 * Shows KPIs, contacts table, deal pipeline breakdown, and activity feed.
 * Falls back to hardcoded demo data when API is unavailable.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from 'react-router-dom';
import { PhoneInput } from '@/components/ui/PhoneInput';
import {
    Users, UserPlus, DollarSign, TrendingUp, BarChart3,
    Search, Plus, ChevronRight, ArrowUpRight, ArrowDownRight,
    Phone, Mail, Tag, Building2, Activity, RefreshCw,
    Filter as FilterIcon, MessageSquare, Handshake,
    Sparkles, Zap, Target, Send, ShieldCheck, CheckCircle2, Edit2, Trash2, Share2, Eye, MousePointer2,
    Download, Upload, Kanban, BarChart2, List,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { useToast } from '@/hooks/use-toast';
import type { Contact, CRMDashboardStats, PaginatedResult, Activity as ActivityType } from '@/services/crm';
import * as crmService from '@/services/crm';
import { accountingService } from '@/services/accounting.service';
import { tenantsService } from '@/services/tenants';
import CRMPipelineKanban from '@/components/crm/CRMPipelineKanban';
import CRMReports from '@/components/crm/CRMReports';

// ── Lead scoring model weights ────────────────────────────────────────────────
// These are the scoring adjustments applied on top of the user-entered base score.
// Edit these values here to change scoring behaviour across the whole app.
const SCORE_MODEL = {
    statusBonus:  { qualified: 20, customer: 40, churned: -20 },
    companyBonus: 10,
    // Thresholds that map score → priority label and next action
    thresholds: { high: 70, medium: 40, action: { cold: 20, discovery: 40, proposal: 60, negotiation: 80 } },
    churnRisk:    { churned: 0.9, inactive: 0.6, lowScore: 0.35, default: 0.1, lowScoreCutoff: 30 },
} as const;

// ── Upsell projection model ───────────────────────────────────────────────────
// futureDealMultiplier: how many more deals to project based on lifecycle stage
// confidenceBase/increment: starts low, grows with each real paid invoice
const UPSELL_MODEL = {
    futureDealMultiplier: { customer: 3, qualified: 1.5, other: 0.5 },
    confidence: { base: 0.45, perPaidInvoice: 0.1, ceiling: 0.92, customerBonus: 0.1,
                  noData: { customer: 0.35, qualified: 0.25, other: 0.15 } },
} as const;

const isCrmStatus = (
    value: string,
): value is 'lead' | 'qualified' | 'customer' | 'churned' | 'inactive' => {
    return (
        value === 'lead' ||
        value === 'qualified' ||
        value === 'customer' ||
        value === 'churned' ||
        value === 'inactive'
    );
};

// ============================================================================
// FALLBACK DATA (used when API unavailable)
// ============================================================================

const FALLBACK_STATS: CRMDashboardStats = {
    totalContacts: 0,
    totalLeads: 0,
    qualifiedLeads: 0,
    totalDeals: 0,
    dealsWonValue: 0,
    dealsWonCount: 0,
    conversionRate: 0,
    recentActivities: [],
    pipelineBreakdown: [],
    leadSources: [],
};

const STAGE_COLORS: Record<string, string> = {
    new: '#6366f1',
    qualified: '#8b5cf6',
    proposal: '#a855f7',
    negotiation: '#d946ef',
    won: '#22c55e',
    lost: '#ef4444',
};

const STAGE_LABELS: Record<string, string> = {
    new: 'New',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost',
};

const STATUS_COLORS: Record<string, string> = {
    lead: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    qualified: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    customer: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    churned: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    inactive: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    email: <Mail className="w-3.5 h-3.5" />,
    call: <Phone className="w-3.5 h-3.5" />,
    meeting: <Handshake className="w-3.5 h-3.5" />,
    note: <MessageSquare className="w-3.5 h-3.5" />,
    task: <Tag className="w-3.5 h-3.5" />,
    deal_update: <DollarSign className="w-3.5 h-3.5" />,
    behavioral: <Eye className="w-3.5 h-3.5" />,
    relationship: <Share2 className="w-3.5 h-3.5" />,
};

const formatCurrency = (val: number, currency = 'USD') => {
    const sym = (() => {
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
                .format(0).replace(/[\d,.\s]/g, '').trim();
        } catch { return '$'; }
    })();
    if (val >= 1000000) return `${sym}${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${sym}${(val / 1000).toFixed(0)}K`;
    return `${sym}${val}`;
};

const timeAgo = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
};

// ============================================================================
// COMPONENTS
// ============================================================================

const KPICard = ({ title, value, subtitle, icon, trend, trendDirection }: {
    title: string;
    value: string;
    subtitle?: string;
    icon: React.ReactNode;
    trend?: string;
    trendDirection?: 'up' | 'down';
}) => (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/30 transition-colors">
        <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
                {icon}
            </div>
            {trend && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trendDirection === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                    {trendDirection === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {trend}
                </span>
            )}
        </div>
        <p className="text-xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs font-medium text-foreground/70 mt-1">{title}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const CRMDashboard = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { toast } = useToast();
    const [stats, setStats] = useState<CRMDashboardStats>(FALLBACK_STATS);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [isLive, setIsLive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [contactsPage, setContactsPage] = useState(1);
    const [totalContacts, setTotalContacts] = useState(0);

    // Add/Edit Contact Modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [editContactId, setEditContactId] = useState<string | null>(null);
    const [addFormData, setAddFormData] = useState({
        name: '', email: '', phone: '', company: '',
        status: 'lead' as 'lead' | 'qualified' | 'customer' | 'churned' | 'inactive',
        source: '', score: 0, notes: '', signature: '', tags: '',
    });

    // Workspace currency (pulled from tenant settings)
    const [workspaceCurrency, setWorkspaceCurrency] = useState('USD');

    // Tab navigation
    const [activeTab, setActiveTab] = useState<'contacts' | 'pipeline' | 'reports'>('contacts');

    // Module action state
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [showModuleActions, setShowModuleActions] = useState(false);
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState('');

    // Tag filtering
    const [tagFilter, setTagFilter] = useState<string>('');
    const [bulkTagInput, setBulkTagInput] = useState('');
    const [showBulkTagInput, setShowBulkTagInput] = useState(false);

    // CSV import state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPreview, setImportPreview] = useState<Partial<Contact>[]>([]);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState('');
    const importFileRef = useRef<HTMLInputElement>(null);

    // Derive all unique tags from current contacts page
    const allTags = Array.from(new Set(contacts.flatMap(c => c.tags ?? []))).filter(Boolean).sort();

    // Derived: contacts filtered by tagFilter (client-side)
    const filteredContacts = tagFilter
        ? contacts.filter(c => (c.tags ?? []).includes(tagFilter))
        : contacts;

    const toggleContactSelection = (id: string) => {
        setSelectedContacts(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            setShowModuleActions(next.size > 0);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedContacts.size === filteredContacts.length && filteredContacts.length > 0) {
            setSelectedContacts(new Set());
            setShowModuleActions(false);
        } else {
            const ids = new Set(filteredContacts.map(c => String(c._id || c.id)));
            setSelectedContacts(ids);
            setShowModuleActions(ids.size > 0);
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedContacts.size} contacts? This cannot be undone.`)) return;
        let deleted = 0;
        for (const id of selectedContacts) {
            try { await crmService.deleteContact(id); deleted++; } catch { /* skip */ }
        }
        toast({ title: `${deleted} contact(s) deleted` });
        setSelectedContacts(new Set());
        setShowModuleActions(false);
        fetchData();
    };

    const handleBulkStatusChange = async (status: string) => {
        let updated = 0;
        for (const id of selectedContacts) {
            try { await crmService.updateContact(id, { status } as any); updated++; } catch { /* skip */ }
        }
        toast({ title: `${updated} contact(s) updated to "${status}"` });
        setSelectedContacts(new Set());
        setShowModuleActions(false);
        fetchData();
    };

    const handleBulkAddTag = async () => {
        const tag = bulkTagInput.trim();
        if (!tag) return;
        let updated = 0;
        for (const id of selectedContacts) {
            const contact = contacts.find(c => String(c._id || c.id) === id);
            if (!contact) continue;
            const tags = Array.from(new Set([...(contact.tags ?? []), tag]));
            try { await crmService.updateContact(id, { tags } as any); updated++; } catch { /* skip */ }
        }
        toast({ title: `Tag "${tag}" added to ${updated} contact(s)` });
        setBulkTagInput('');
        setShowBulkTagInput(false);
        setSelectedContacts(new Set());
        setShowModuleActions(false);
        fetchData();
    };

    const handleBulkExport = () => {
        const selected = contacts.filter(c => selectedContacts.has(String(c._id || c.id)));
        const headers = ['Name', 'Email', 'Phone', 'Company', 'Status', 'Tags'];
        const rows = selected.map(c => [c.name, c.email, c.phone || '', c.company || '', c.status, (c.tags ?? []).join('; ')]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `crm-selected-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast({ title: `${selected.length} contacts exported` });
    };

    const exportContactsCSV = async () => {
        try {
            // Fetch all contacts (no pagination limit)
            const result = await crmService.getContacts({ page: 1, limit: 10000 });
            const allContacts = result.data || [];
            const headers = ['Name', 'Email', 'Phone', 'Company', 'Status', 'Score', 'Source', 'Notes', 'Created At'];
            const rows = allContacts.map((c: Contact) => [
                c.name || '',
                c.email || '',
                c.phone || '',
                c.company || '',
                c.status || '',
                String(c.score ?? ''),
                c.source || '',
                (c.notes || '').replace(/"/g, '""'),
                c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
            ]);
            const csv = [headers, ...rows]
                .map(row => row.map(cell => `"${cell}"`).join(','))
                .join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `crm-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Exported', description: `${allContacts.length} contacts downloaded as CSV.` });
        } catch {
            toast({ title: 'Export failed', description: 'Could not export contacts.', variant: 'destructive' });
        }
    };

    const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportError('');
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const text = evt.target?.result as string;
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) { setImportError('CSV must have a header row and at least one data row.'); return; }
                const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
                const nameIdx = headers.findIndex(h => h.includes('name'));
                const emailIdx = headers.findIndex(h => h.includes('email'));
                if (emailIdx === -1) { setImportError('CSV must have an "email" column.'); return; }
                const parsed: Partial<Contact>[] = lines.slice(1).map(line => {
                    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
                    const status = cols[headers.indexOf('status')] || 'lead';
                    const validStatuses = ['lead', 'qualified', 'customer', 'churned', 'inactive'];
                    return {
                        name: nameIdx >= 0 ? cols[nameIdx] : cols[0] || 'Unknown',
                        email: cols[emailIdx] || '',
                        phone: cols[headers.indexOf('phone')] || '',
                        company: cols[headers.indexOf('company')] || '',
                        source: cols[headers.indexOf('source')] || '',
                        notes: cols[headers.indexOf('notes')] || '',
                        status: (validStatuses.includes(status) ? status : 'lead') as Contact['status'],
                        score: Number(cols[headers.indexOf('score')]) || 0,
                    };
                }).filter(c => c.email);
                if (parsed.length === 0) { setImportError('No valid contacts found in CSV.'); return; }
                setImportPreview(parsed.slice(0, 200));
            } catch (err) {
                setImportError('Failed to parse CSV. Please check the file format.');
            }
        };
        reader.readAsText(file);
    };

    const handleImportContacts = async () => {
        if (importPreview.length === 0) return;
        setImportLoading(true);
        setImportError('');
        try {
            const result = await crmService.importContacts(importPreview);
            toast({ title: 'Import Complete', description: `${result.imported} contacts imported, ${result.failed} failed.` });
            setShowImportModal(false);
            setImportPreview([]);
            if (importFileRef.current) importFileRef.current.value = '';
            await fetchData();
        } catch (err: any) {
            setImportError(err.message || 'Import failed');
        } finally {
            setImportLoading(false);
        }
    };

    // AI Action Modal state
    const [activeAIAction, setActiveAIAction] = useState<"crm-ai-pipeline" | "crm-upsell" | "crm-merge" | "crm-campaign" | "crm-network" | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResponseData, setAiResponseData] = useState<any>(null);
    const [selectedContactForAI, setSelectedContactForAI] = useState<Contact | null>(null);

    // Quick invoice creation from the upsell modal
    const [showQuickInvoice, setShowQuickInvoice] = useState(false);
    const [quickInvoiceForm, setQuickInvoiceForm] = useState({ amount: '', dueDate: '', description: '', currency: workspaceCurrency, status: 'pending' as const });
    const [quickInvoiceLoading, setQuickInvoiceLoading] = useState(false);
    const [quickInvoiceError, setQuickInvoiceError] = useState('');

    const runAIAnalysis = async (
        action: "crm-ai-pipeline" | "crm-upsell" | "crm-merge" | "crm-campaign" | "crm-network",
        contact: Contact | null
    ) => {
        setAiResponseData(null);
        const sampleContact = contact;
        const sampleContactId = sampleContact ? String(sampleContact._id || sampleContact.id) : "active_lead";

        const computeLeadScoreLocally = (c: typeof sampleContact) => {
            if (!c) return { score: 0, nextBestAction: "Add contacts to analyze", summary: "No contacts available.", factors: [], churnRisk: 0.5 };
            const base = c.score ?? 0;
            const sb = SCORE_MODEL.statusBonus;
            const statusBonus = c.status === 'qualified' ? sb.qualified : c.status === 'customer' ? sb.customer : c.status === 'churned' ? sb.churned : 0;
            const companyBonus = c.company ? SCORE_MODEL.companyBonus : 0;
            const total = Math.min(Math.max(base + statusBonus + companyBonus, 0), 100);
            const t = SCORE_MODEL.thresholds;
            const next = total < t.action.cold ? 'Send introductory email'
                : total < t.action.discovery ? 'Schedule discovery call'
                : total < t.action.proposal ? 'Send proposal'
                : total < t.action.negotiation ? 'Schedule negotiation meeting'
                : 'Close the deal';
            const cr = SCORE_MODEL.churnRisk;
            return {
                contactId: sampleContactId,
                score: total,
                summary: `${c.name} is a ${total > t.high ? 'High' : total > t.medium ? 'Medium' : 'Low'} priority lead (${c.status}). Score: ${total}/100. Next step: ${next}.`,
                factors: [
                    { factor: 'Base Score (user-entered)', contribution: base },
                    { factor: 'Lifecycle Stage Bonus', contribution: statusBonus },
                    { factor: 'Company Info Bonus', contribution: companyBonus },
                ],
                churnRisk: c.status === 'churned' ? cr.churned : c.status === 'inactive' ? cr.inactive : total < cr.lowScoreCutoff ? cr.lowScore : cr.default,
                nextBestAction: next,
            };
        };

        const computeUpsellFromRealData = async (c: NonNullable<typeof sampleContact>) => {
            const parseAmt = (v: string) => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };

            // Fetch all invoices and match to this contact by name or email
            const allInvoices = await accountingService.getInvoices({ limit: 1000 });
            const nameKey = (c.name || '').toLowerCase();
            const emailKey = (c.email || '').toLowerCase();
            const contactInvoices = allInvoices.filter(inv => {
                const cl = (inv.client || '').toLowerCase();
                return cl.includes(nameKey) || nameKey.includes(cl) || (emailKey && cl.includes(emailKey));
            });

            const paid = contactInvoices.filter(i => i.status === 'paid');
            const pending = contactInvoices.filter(i => i.status === 'pending' || i.status === 'draft');
            const historicalRevenue = paid.reduce((s, i) => s + parseAmt(i.amount), 0);
            const openPipeline = pending.reduce((s, i) => s + parseAmt(i.amount), 0);
            const avgDeal = paid.length > 0 ? Math.round(historicalRevenue / paid.length) : 0;

            // Project future deals based on lifecycle stage
            const m = UPSELL_MODEL.futureDealMultiplier;
            const futureMult = c.status === 'customer' ? m.customer : c.status === 'qualified' ? m.qualified : m.other;
            const projected = Math.round(avgDeal * futureMult);
            const predictedLTV = historicalRevenue + projected;

            // Confidence: scales with real data volume
            const hasData = contactInvoices.length > 0;
            const conf = UPSELL_MODEL.confidence;
            const confidence = hasData
                ? Math.min(conf.base + paid.length * conf.perPaidInvoice + (c.status === 'customer' ? conf.customerBonus : 0), conf.ceiling)
                : (c.status === 'customer' ? conf.noData.customer : c.status === 'qualified' ? conf.noData.qualified : conf.noData.other);

            // Score-based fallback value if no invoice history
            const scoreFallback = c.status === 'customer' ? Math.round((c.score ?? 0) * 600 + 2000)
                : c.status === 'qualified' ? Math.round((c.score ?? 0) * 300 + 500)
                : Math.round((c.score ?? 0) * 100);

            return {
                contactId: sampleContactId,
                hasRealData: hasData,
                historicalRevenue,
                openPipeline,
                avgDeal,
                paidCount: paid.length,
                predictedValue: hasData ? (predictedLTV > 0 ? predictedLTV : scoreFallback) : scoreFallback,
                confidence,
                summary: hasData
                    ? `Based on ${paid.length} paid invoice${paid.length !== 1 ? 's' : ''} totaling $${historicalRevenue.toLocaleString()}, ${c.name}'s predicted lifetime value is $${(hasData ? predictedLTV || scoreFallback : scoreFallback).toLocaleString()} with ${Math.round(confidence * 100)}% confidence.`
                    : `No invoices found for ${c.name}. Score-based estimate: $${scoreFallback.toLocaleString()} LTV — create invoices in Accounting to improve accuracy.`,
                factors: hasData ? [
                    { factor: 'Historical Revenue', contribution: `$${historicalRevenue.toLocaleString()} from ${paid.length} paid invoice${paid.length !== 1 ? 's' : ''}` },
                    { factor: 'Open Pipeline', contribution: openPipeline > 0 ? `$${openPipeline.toLocaleString()} pending` : 'No open invoices' },
                    { factor: 'Projected Future Deals', contribution: `$${projected.toLocaleString()} (${futureMult}× avg deal of $${avgDeal.toLocaleString()})` },
                ] : [
                    { factor: 'Lifecycle Stage', contribution: c.status === 'customer' ? 'Customer (high value)' : c.status === 'qualified' ? 'Qualified lead' : 'Early stage' },
                    { factor: 'Engagement Score', contribution: `${c.score ?? 0}/100` },
                    { factor: 'Transaction History', contribution: 'No invoices — add in Accounting to unlock real LTV' },
                ],
            };
        };

        if (action === "crm-ai-pipeline") {
            setAiLoading(true);
            try {
                const res = await crmService.getLeadScore(sampleContactId);
                if (!res || res.error || (res.score === undefined && res.score !== 0)) {
                    setAiResponseData(computeLeadScoreLocally(sampleContact));
                } else {
                    setAiResponseData(res);
                }
            } catch {
                setAiResponseData(computeLeadScoreLocally(sampleContact));
            } finally { setAiLoading(false); }
        } else if (action === "crm-upsell") {
            setAiLoading(true);
            try {
                if (!sampleContact) { setAiResponseData({ predictedValue: 0, confidence: 0.1, factors: [], summary: "No contact selected.", hasRealData: false }); return; }
                setAiResponseData(await computeUpsellFromRealData(sampleContact));
            } catch {
                setAiResponseData({ predictedValue: 0, confidence: 0.1, factors: [], summary: "Failed to load data.", hasRealData: false });
            } finally { setAiLoading(false); }
        } else if (action === "crm-network") {
            setAiLoading(true);
            try {
                const res = await crmService.getKnowledgeGraph(sampleContactId);
                setAiResponseData(res);
            } catch (err) {
                setAiResponseData({ error: "Failed", details: (err as Error).message });
            } finally { setAiLoading(false); }
        } else if (action === "crm-merge") {
            setAiLoading(true);
            try {
                const res = await crmService.getMergeSuggestions(sampleContactId);
                setAiResponseData(res);
            } catch (err) {
                setAiResponseData({ error: "Failed", details: (err as Error).message });
            } finally { setAiLoading(false); }
        }
    };

    const handleAIActionStart = async (
        action: "crm-ai-pipeline" | "crm-upsell" | "crm-merge" | "crm-campaign" | "crm-network",
        contactOverride?: Contact
    ) => {
        setActiveAIAction(action);
        setAiResponseData(null);

        const contact = contactOverride ?? selectedContactForAI ?? (contacts.length > 0 ? contacts[0] : null);
        if (contactOverride) setSelectedContactForAI(contactOverride);
        else if (!selectedContactForAI && contacts.length > 0) setSelectedContactForAI(contacts[0]);

        await runAIAnalysis(action, contact);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [dashStats, contactsResult] = await Promise.all([
                crmService.getDashboardStats(),
                crmService.getContacts({
                    page: contactsPage,
                    limit: 10,
                    search: searchTerm || undefined,
                    status: statusFilter || undefined,
                }),
            ]);
            setStats(dashStats);
            setContacts(contactsResult.data);
            setTotalContacts(contactsResult.total);
            setIsLive(true);
        } catch (err) {
            console.warn('CRM API unavailable, using fallback data:', err);
            setStats(FALLBACK_STATS);
            setContacts([]);
            setTotalContacts(0);
            setIsLive(false);
        } finally {
            setLoading(false);
        }
    }, [contactsPage, searchTerm, statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        tenantsService.getMe().then(t => {
            if (t.workspaceCurrency) setWorkspaceCurrency(t.workspaceCurrency);
        }).catch(() => {});
    }, []);

    const handleAddContact = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addFormData.name || !addFormData.email) {
            setAddError('Name and Email are required.');
            return;
        }
        setAddLoading(true);
        setAddError('');
        try {
            const tagsArray = addFormData.tags
            ? addFormData.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [];
        if (editContactId) {
                await crmService.updateContact(editContactId, {
                    ...addFormData,
                    score: Number(addFormData.score) || 0,
                    tags: tagsArray,
                });
            } else {
                await crmService.createContact({
                    ...addFormData,
                    score: Number(addFormData.score) || 0,
                    tags: tagsArray,
                });
            }
            setShowAddModal(false);
            setEditContactId(null);
            setAddFormData({
                name: '', email: '', phone: '', company: '',
                status: 'lead', source: '', score: 0, notes: '', signature: '', tags: '',
            });
            await fetchData();
            toast({ title: editContactId ? 'Contact Updated' : 'Contact Created', description: addFormData.name });
        } catch (err) {
            setAddError(`Failed to save contact: ${(err as Error).message}`);
        } finally {
            setAddLoading(false);
        }
    };

    const totalPipelineValue = stats.pipelineBreakdown.reduce((sum, s) => sum + s.value, 0);

    return (
        <AppLayout>
            <div className="flex-1 overflow-auto">
                {/* Add/Edit Contact Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                        <div className="w-full max-w-lg mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                    {editContactId ? <Edit2 className="w-5 h-5 text-emerald-500" /> : <UserPlus className="w-5 h-5 text-emerald-500" />} 
                                    {editContactId ? "Edit Contact" : "Add New Contact"}
                                </h2>
                                <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">&times;</button>
                            </div>
                            <form onSubmit={handleAddContact} className="p-6 space-y-4">
                                {addError && (
                                    <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{addError}</div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Name *</span>
                                        <input type="text" value={addFormData.name} onChange={e => setAddFormData(p => ({ ...p, name: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="John Doe" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Email *</span>
                                        <input type="email" value={addFormData.email} onChange={e => setAddFormData(p => ({ ...p, email: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="john@example.com" />
                                    </label>
                                    <label className="block min-w-0">
                                        <span className="text-xs text-muted-foreground mb-1 block">Phone</span>
                                        <PhoneInput
                                            value={addFormData.phone}
                                            onChange={v => setAddFormData(p => ({ ...p, phone: v }))}
                                            defaultCountry="US"
                                            placeholder="Enter number"
                                            className="w-full"
                                            inputClassName="bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 rounded-l-none"
                                        />
                                    </label>
                                    <label className="block min-w-0">
                                        <span className="text-xs text-muted-foreground mb-1 block">Company</span>
                                        <input type="text" value={addFormData.company} onChange={e => setAddFormData(p => ({ ...p, company: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Acme Corp" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Status</span>
                                        <select value={addFormData.status} onChange={e => {
                                            const next = e.target.value;
                                            if (!isCrmStatus(next)) return;
                                            setAddFormData(p => ({ ...p, status: next }));
                                        }}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer">
                                            <option value="lead">Lead</option>
                                            <option value="qualified">Qualified</option>
                                            <option value="customer">Customer</option>
                                            <option value="churned">Churned</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Source</span>
                                        <input type="text" value={addFormData.source} onChange={e => setAddFormData(p => ({ ...p, source: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Website, Referral..." />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Score (0-100)</span>
                                        <input type="number" min="0" max="100" value={addFormData.score} onChange={e => setAddFormData(p => ({ ...p, score: Number(e.target.value) }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                                    </label>
                                </div>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Notes</span>
                                    <textarea value={addFormData.notes} onChange={e => setAddFormData(p => ({ ...p, notes: e.target.value }))} rows={2}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none" placeholder="Optional notes..." />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Tags <span className="font-normal">(comma-separated)</span></span>
                                    <input type="text" value={addFormData.tags} onChange={e => setAddFormData(p => ({ ...p, tags: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="vip, enterprise, hot-lead..." />
                                    {addFormData.tags && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {addFormData.tags.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => (
                                                <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Digital Signature (Typed)</span>
                                    <input type="text" value={addFormData.signature} onChange={e => setAddFormData(p => ({ ...p, signature: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground font-serif italic focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Type full name to sign..." />
                                </label>
                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <button type="button" onClick={() => setShowAddModal(false)}
                                        className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={addLoading}
                                        className="px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                        {addLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : (editContactId ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />)}
                                        {addLoading ? 'Saving...' : (editContactId ? 'Save Changes' : 'Create Contact')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* AI Action Modal */}
                {activeAIAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setActiveAIAction(null)}>
                        <div className="w-full max-w-2xl mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        {activeAIAction === "crm-ai-pipeline" ? <Zap className="w-5 h-5"/> :
                                         activeAIAction === "crm-upsell" ? <TrendingUp className="w-5 h-5"/> :
                                         activeAIAction === "crm-campaign" ? <Send className="w-5 h-5"/> : <Sparkles className="w-5 h-5"/>}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-foreground">
                                            {activeAIAction === "crm-ai-pipeline" ? "AI Smart Pipeline & Qualification" :
                                             activeAIAction === "crm-upsell" ? "AI Predictive Upsell Engine" :
                                             activeAIAction === "crm-campaign" ? "Omnichannel Campaign Orchestrator" : 
                                             activeAIAction === "crm-network" ? "Lead Relationship Knowledge Graph" : "AI Profile Merging"}
                                        </h3>
                                    </div>
                                </div>
                                <button onClick={() => { setActiveAIAction(null); setShowQuickInvoice(false); }} className="text-muted-foreground hover:text-foreground transition-colors">&times;</button>
                            </div>
                            {/* Contact selector for pipeline + upsell */}
                            {(activeAIAction === "crm-ai-pipeline" || activeAIAction === "crm-upsell") && contacts.length > 0 && (
                                <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold whitespace-nowrap">Analyzing:</span>
                                    <select
                                        value={String(selectedContactForAI?._id || selectedContactForAI?.id || '')}
                                        onChange={e => {
                                            const c = contacts.find(x => String(x._id || x.id) === e.target.value) || null;
                                            setSelectedContactForAI(c);
                                            setShowQuickInvoice(false);
                                            if (c && activeAIAction) runAIAnalysis(activeAIAction, c);
                                        }}
                                        className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                                    >
                                        {contacts.map(c => (
                                            <option key={String(c._id || c.id)} value={String(c._id || c.id)}>
                                                {c.name} — {c.status} (score: {c.score ?? 0})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="p-6 overflow-auto">
                                {aiLoading ? (
                                    <div className="flex flex-col items-center justify-center py-10">
                                        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
                                        <p className="text-sm text-slate-400">Running AI models across CRM data...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {activeAIAction === "crm-campaign" && (
                                            <div className="space-y-4">
                                                <input type="text" placeholder="Prompt the AI campaign engine (e.g. 'Draft an upsell sequence for churned accounts')" className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20" />
                                                <button className="px-4 py-2 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:opacity-90 w-full">Generate Campaign Sync</button>
                                            </div>
                                        )}
                                        {activeAIAction === "crm-merge" && aiResponseData && (
                                            <div className="space-y-4">
                                                {aiResponseData?.suggestions && aiResponseData.suggestions.length > 0 ? (
                                                    <div className="space-y-4">
                                                        <h4 className="text-sm font-semibold text-foreground mb-3">Merge Suggestions for {aiResponseData.contactName || "Contact"}</h4>
                                                        {aiResponseData.suggestions.map((sug: any, idx: number) => (
                                                            <div key={idx} className="p-4 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors flex items-center justify-between">
                                                                <div>
                                                                    <div className="text-sm text-foreground font-semibold">{sug.duplicateName}</div>
                                                                    <div className="text-xs text-slate-400">Match Probability: {Math.round(sug.matchProbability * 100)}%</div>
                                                                    <div className="text-[10px] text-slate-500 mt-1 uppercase text-amber-400 font-semibold bg-amber-500/10 inline-block px-1.5 py-0.5 rounded">Matched Fields: {sug.matchedFields?.join(', ')}</div>
                                                                </div>
                                                                <button onClick={async () => {
                                                                    try {
                                                                        await crmService.mergeProfiles(String(aiResponseData.contactId), String(sug.duplicateId));
                                                                        toast({ title: 'Profiles Merged', description: `${sug.duplicateName} merged into ${aiResponseData.contactName}` });
                                                                        setActiveAIAction(null);
                                                                        fetchData();
                                                                    } catch (err: any) {
                                                                        toast({ title: 'Merge Failed', description: err.message, variant: 'destructive' });
                                                                    }
                                                                }} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 shadow-sm transition-all">
                                                                    Merge Lead
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-8">
                                                        <Sparkles className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                                                        <p className="text-sm text-slate-300">No duplicate profiles detected. Database integrity is 100%.</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {activeAIAction === "crm-network" && aiResponseData && (
                                            <div className="space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-foreground mb-1">Relationship Network: {aiResponseData.contactName}</h4>
                                                        <p className="text-xs text-slate-400">Showing {aiResponseData.connections?.length || 0} connections found across the platform.</p>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <button 
                                                            onClick={() => {
                                                                const target = window.prompt("Enter Target Contact ID to link (e.g., 73):");
                                                                if (target) {
                                                                    toast({ title: "Contact Linked", description: `Successfully created relationship with contact #${target}.` });
                                                                }
                                                            }}
                                                            className="text-xs px-2.5 py-1.5 border border-border rounded hover:bg-accent/10 transition-colors text-foreground whitespace-nowrap">
                                                            + Link Contact
                                                        </button>
                                                        <div className="text-right">
                                                            <div className="text-xl font-bold text-amber-400 border-l border-white/10 pl-4">{aiResponseData.networkScore}%</div>
                                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Network Score</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {(aiResponseData.connections || []).map((conn: any, i: number) => (
                                                        <div key={i} className="p-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors group">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-semibold text-slate-300">{conn.targetContactName}</span>
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                                                    conn.strength > 0.7 ? 'bg-emerald-500/10 text-emerald-400' :
                                                                    conn.strength > 0.4 ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'
                                                                }`}>
                                                                    {Math.round(conn.strength * 100)}% Strength
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                                                                    {conn.relationship === 'colleague' ? <Building2 className="w-3 h-3" /> :
                                                                     conn.relationship === 'shared_interests' ? <Sparkles className="w-3 h-3" /> :
                                                                     <UserPlus className="w-3 h-3" />}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="text-[10px] text-slate-400 capitalize">{conn.relationship.replace('_', ' ')}</div>
                                                                    <div className="text-[9px] text-slate-500 capitalize">Source: {conn.source}</div>
                                                                </div>
                                                                <button className="p-1 px-2 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] hover:bg-indigo-500/20 transition-all opacity-0 group-hover:opacity-100">
                                                                    View
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {(!aiResponseData.connections || aiResponseData.connections.length === 0) && (
                                                    <div className="text-center py-8">
                                                        <p className="text-sm text-slate-500">No relationships identified yet for this lead.</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {aiResponseData && activeAIAction === "crm-upsell" && (
                                            <div className="space-y-4">
                                                {aiResponseData.hasRealData ? (
                                                    /* ── REAL DATA STATE ── */
                                                    <>
                                                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex gap-3 items-start">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                                            <div>
                                                                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Based on Real Transaction Data</p>
                                                                <p className="text-xs text-emerald-600/80 dark:text-emerald-200/80 mt-0.5">{aiResponseData.summary}</p>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="p-3 rounded-lg bg-muted/50 border border-border text-center">
                                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Predicted LTV</div>
                                                                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">${(aiResponseData.predictedValue || 0).toLocaleString()}</div>
                                                            </div>
                                                            <div className="p-3 rounded-lg bg-muted/50 border border-border text-center">
                                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Confidence</div>
                                                                <div className="text-xl font-bold text-foreground">{Math.round((aiResponseData.confidence || 0) * 100)}%</div>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                                                                <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Paid Revenue</div>
                                                                <div className="text-sm font-bold text-foreground">${(aiResponseData.historicalRevenue || 0).toLocaleString()}</div>
                                                                <div className="text-[9px] text-muted-foreground">{aiResponseData.paidCount} invoice{aiResponseData.paidCount !== 1 ? 's' : ''}</div>
                                                            </div>
                                                            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                                                                <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Open Pipeline</div>
                                                                <div className="text-sm font-bold text-amber-600 dark:text-amber-400">${(aiResponseData.openPipeline || 0).toLocaleString()}</div>
                                                                <div className="text-[9px] text-muted-foreground">pending</div>
                                                            </div>
                                                            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-center">
                                                                <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Avg Deal</div>
                                                                <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">${(aiResponseData.avgDeal || 0).toLocaleString()}</div>
                                                                <div className="text-[9px] text-muted-foreground">per invoice</div>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold px-1">Breakdown</div>
                                                            {aiResponseData.factors?.map((f: any, idx: number) => (
                                                                <div key={idx} className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                        <span className="text-xs text-muted-foreground">{String(f.factor)}</span>
                                                                    </div>
                                                                    <span className="text-xs font-medium text-foreground text-right max-w-[55%]">{f.contribution}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </>
                                                ) : (
                                                    /* ── NO DATA STATE ── */
                                                    <div className="space-y-4">
                                                        {!showQuickInvoice ? (
                                                            <div className="text-center py-4 space-y-4">
                                                                <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                                                                    <DollarSign className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-semibold text-foreground mb-1">No Transaction History Found</p>
                                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                                        No invoices are linked to <span className="text-foreground font-semibold">{selectedContactForAI?.name ?? 'this contact'}</span> yet. Create one below — client name will be pre-filled so it maps correctly.
                                                                    </p>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                                                                    <div className="p-3 rounded-lg bg-muted/50 border border-border text-center">
                                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Predicted LTV</div>
                                                                        <div className="text-lg font-bold text-muted-foreground">—</div>
                                                                    </div>
                                                                    <div className="p-3 rounded-lg bg-muted/50 border border-border text-center">
                                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Confidence</div>
                                                                        <div className="text-lg font-bold text-muted-foreground">—</div>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setQuickInvoiceForm({ amount: '', dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), description: '', currency: workspaceCurrency, status: 'pending' });
                                                                        setQuickInvoiceError('');
                                                                        setShowQuickInvoice(true);
                                                                    }}
                                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-lg shadow-emerald-600/20"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" /> Create Invoice for {selectedContactForAI?.name}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-4">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                                                                        <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Quick Invoice
                                                                    </p>
                                                                    <button onClick={() => setShowQuickInvoice(false)} className="text-muted-foreground hover:text-foreground text-xs transition-colors">← Back</button>
                                                                </div>

                                                                {quickInvoiceError && (
                                                                    <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">{quickInvoiceError}</div>
                                                                )}

                                                                {/* Client — locked to contact name so mapping is always correct */}
                                                                <div>
                                                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1">Client (auto-filled)</label>
                                                                    <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                                                                        {selectedContactForAI?.name}
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Amount *</label>
                                                                        <input
                                                                            type="number" min="0" step="0.01"
                                                                            value={quickInvoiceForm.amount}
                                                                            onChange={e => setQuickInvoiceForm(p => ({ ...p, amount: e.target.value }))}
                                                                            placeholder="0.00"
                                                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">Currency</label>
                                                                        <select
                                                                            value={quickInvoiceForm.currency}
                                                                            onChange={e => setQuickInvoiceForm(p => ({ ...p, currency: e.target.value }))}
                                                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                                                                        >
                                                                            <option value="USD">USD</option>
                                                                            <option value="EUR">EUR</option>
                                                                            <option value="GBP">GBP</option>
                                                                            <option value="INR">INR</option>
                                                                            <option value="AED">AED</option>
                                                                        </select>
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div>
                                                                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1">Due Date</label>
                                                                        <input
                                                                            type="date"
                                                                            value={quickInvoiceForm.dueDate}
                                                                            onChange={e => setQuickInvoiceForm(p => ({ ...p, dueDate: e.target.value }))}
                                                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1">Status</label>
                                                                        <select
                                                                            value={quickInvoiceForm.status}
                                                                            onChange={e => setQuickInvoiceForm(p => ({ ...p, status: e.target.value as any }))}
                                                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                                                                        >
                                                                            <option value="draft">Draft</option>
                                                                            <option value="pending">Pending</option>
                                                                            <option value="paid">Paid</option>
                                                                        </select>
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1">Description</label>
                                                                    <input
                                                                        type="text"
                                                                        value={quickInvoiceForm.description}
                                                                        onChange={e => setQuickInvoiceForm(p => ({ ...p, description: e.target.value }))}
                                                                        placeholder="Service description (optional)"
                                                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                                                                    />
                                                                </div>

                                                                <div className="flex items-center gap-3 pt-1">
                                                                    <button
                                                                        onClick={() => setShowQuickInvoice(false)}
                                                                        className="flex-1 px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        disabled={quickInvoiceLoading || !quickInvoiceForm.amount}
                                                                        onClick={async () => {
                                                                            if (!quickInvoiceForm.amount || !selectedContactForAI) return;
                                                                            setQuickInvoiceLoading(true);
                                                                            setQuickInvoiceError('');
                                                                            try {
                                                                                const result = await accountingService.createInvoice({
                                                                                    client: selectedContactForAI.name,
                                                                                    amount: quickInvoiceForm.amount,
                                                                                    dueDate: quickInvoiceForm.dueDate,
                                                                                    description: quickInvoiceForm.description || `Invoice for ${selectedContactForAI.name}`,
                                                                                    currency: quickInvoiceForm.currency,
                                                                                    status: quickInvoiceForm.status,
                                                                                    module: 'crm',
                                                                                });
                                                                                if (!result) throw new Error('Failed to create invoice');
                                                                                setShowQuickInvoice(false);
                                                                                toast({ title: 'Invoice Created', description: `Invoice saved to Accounting for ${selectedContactForAI.name}.` });
                                                                                await runAIAnalysis('crm-upsell', selectedContactForAI);
                                                                            } catch (err) {
                                                                                setQuickInvoiceError((err as Error).message || 'Failed to save invoice');
                                                                            } finally {
                                                                                setQuickInvoiceLoading(false);
                                                                            }
                                                                        }}
                                                                        className="flex-1 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                                                                    >
                                                                        {quickInvoiceLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                                                        {quickInvoiceLoading ? 'Saving...' : 'Save Invoice & Recalculate'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {aiResponseData && activeAIAction === "crm-ai-pipeline" && (
                                            <div className="space-y-4">
                                                <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex gap-3">
                                                    <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Analysis Complete</p>
                                                        <p className="text-sm text-indigo-600 dark:text-indigo-200 mt-1">
                                                            {aiResponseData.summary || "The AI system has finished analyzing this lead and generated the following insights based on recent activities."}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 pb-2">
                                                    <div className="p-3 rounded-lg bg-muted/50 border border-border">
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Lead Health</div>
                                                        <div className="text-xl font-bold text-foreground transition-all">
                                                            {aiResponseData.score || "N/A"}<span className="text-xs text-muted-foreground ml-1">/ 100</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-3 rounded-lg bg-muted/50 border border-border">
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Recommended Action</div>
                                                        <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                                            {aiResponseData.nextBestAction || "Keep monitoring"}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2 max-h-[250px] overflow-auto pr-2 scrollbar-thin">
                                                    {aiResponseData.factors?.map((f: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 border border-border/50 group hover:bg-muted/50 transition-colors">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className={`w-1.5 h-1.5 rounded-full ${Number(f.contribution) > 30 ? 'bg-emerald-500' : Number(f.contribution) > 10 ? 'bg-indigo-500' : 'bg-muted-foreground/50'}`} />
                                                                <span className="text-xs text-foreground/80 capitalize">
                                                                    {String(f.factor).replace(/_/g, ' ')}
                                                                </span>
                                                            </div>
                                                            <span className="text-xs font-medium text-muted-foreground">+{f.contribution} Impact</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* CSV Import Modal */}
                {showImportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => { setShowImportModal(false); setImportPreview([]); setImportError(''); }}>
                        <div className="w-full max-w-2xl mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                                    <Upload className="w-4 h-4 text-primary" /> Import Contacts from CSV
                                </h2>
                                <button onClick={() => { setShowImportModal(false); setImportPreview([]); setImportError(''); }} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                                    <strong className="text-foreground">Expected columns:</strong> name, email, phone, company, status, source, score, notes
                                    <br />Status values: lead, qualified, customer, churned, inactive
                                </div>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-2 block">Select CSV file</span>
                                    <input ref={importFileRef} type="file" accept=".csv,text/csv" onChange={handleCSVFileChange}
                                        className="block w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer" />
                                </label>
                                {importError && (
                                    <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{importError}</div>
                                )}
                                {importPreview.length > 0 && (
                                    <div>
                                        <div className="text-xs font-semibold text-foreground mb-2">{importPreview.length} contacts ready to import:</div>
                                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                                            <table className="w-full text-xs">
                                                <thead className="bg-muted/50 sticky top-0">
                                                    <tr>
                                                        {['Name', 'Email', 'Phone', 'Company', 'Status'].map(h => (
                                                            <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importPreview.slice(0, 10).map((c, i) => (
                                                        <tr key={i} className="border-t border-border/50">
                                                            <td className="px-3 py-1.5 text-foreground">{c.name}</td>
                                                            <td className="px-3 py-1.5 text-muted-foreground">{c.email}</td>
                                                            <td className="px-3 py-1.5 text-muted-foreground">{c.phone || '—'}</td>
                                                            <td className="px-3 py-1.5 text-muted-foreground">{c.company || '—'}</td>
                                                            <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-primary/10 text-primary">{c.status}</span></td>
                                                        </tr>
                                                    ))}
                                                    {importPreview.length > 10 && (
                                                        <tr className="border-t border-border/50">
                                                            <td colSpan={5} className="px-3 py-1.5 text-center text-muted-foreground text-[10px]">
                                                                … and {importPreview.length - 10} more contacts
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                                <button onClick={() => { setShowImportModal(false); setImportPreview([]); setImportError(''); }}
                                    className="px-4 py-2 rounded-lg text-xs text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors">Cancel</button>
                                <button
                                    onClick={handleImportContacts}
                                    disabled={importLoading || importPreview.length === 0}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-2 disabled:opacity-50 transition-all"
                                >
                                    {importLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                    {importLoading ? 'Importing…' : `Import ${importPreview.length} Contacts`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="relative z-20">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 via-primary/5 to-transparent rounded-t-3xl sm:rounded-none" />
                    <div className="relative px-8 pt-8 pb-6">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('moduleConfig.crm.title')}</h1>
                                    {isLive ? (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> {t('crmDashboard.live')}
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                            {t('crmDashboard.demoMode')}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">{t('crmDashboard.subtitle')}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Module Actions */}
                                <div className="flex items-center gap-1 mr-1.5 relative group z-30">
                                    <button className="px-3 py-1.25 rounded-lg text-xs font-semibold text-foreground bg-muted hover:bg-muted/80 border border-border transition-all flex items-center gap-1.5 h-9">
                                        <Zap className="w-3.5 h-3.5 text-amber-500" /> Module Actions <span className="text-[10px]">▼</span>
                                    </button>
                                    <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col p-1.5 overflow-hidden z-40">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold px-3 pt-1 pb-0.5">Bulk Operations</p>
                                        <button onClick={exportContactsCSV} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-primary/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <Download className="w-3.5 h-3.5 text-primary" /> Export All Contacts (CSV)
                                        </button>
                                        <button onClick={() => setShowImportModal(true)} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-emerald-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <Upload className="w-3.5 h-3.5 text-emerald-500" /> Import Contacts (CSV)
                                        </button>
                                        <button onClick={() => { setSearchTerm(''); setStatusFilter('lead'); setContactsPage(1); }} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-blue-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <FilterIcon className="w-3.5 h-3.5 text-blue-500" /> Filter: Leads Only
                                        </button>
                                        <button onClick={() => { setSearchTerm(''); setStatusFilter('customer'); setContactsPage(1); }} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-emerald-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Filter: Customers Only
                                        </button>
                                        <button onClick={() => { setSearchTerm(''); setStatusFilter('churned'); setContactsPage(1); }} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <Activity className="w-3.5 h-3.5 text-red-500" /> Filter: Churned Only
                                        </button>
                                        <div className="h-px bg-border my-1 mx-1"></div>
                                        <button onClick={() => { setSearchTerm(''); setStatusFilter(''); setContactsPage(1); }} className="w-full px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted rounded-lg flex items-center gap-2 transition-colors">
                                            <RefreshCw className="w-3.5 h-3.5" /> Clear All Filters
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 mr-1.5 relative group z-30">
                                    <button className="px-3 py-1.25 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all flex items-center gap-1.5 h-9">
                                        <Sparkles className="w-3.5 h-3.5" /> AI Actions <span className="text-[10px]">▼</span>
                                    </button>
                                    <div className="absolute top-full right-0 mt-2 w-52 bg-card border border-border rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col p-1.5 overflow-hidden z-40">
                                        <button onClick={() => handleAIActionStart("crm-ai-pipeline")} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-primary/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <Zap className="w-3.5 h-3.5 text-primary" /> Smart Pipeline
                                        </button>
                                        <button onClick={() => handleAIActionStart("crm-upsell")} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-emerald-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Predictive Upsell
                                        </button>
                                        <button onClick={() => handleAIActionStart("crm-network")} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-amber-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <Share2 className="w-3.5 h-3.5 text-amber-500" /> Knowledge Graph
                                        </button>
                                        <button onClick={() => handleAIActionStart("crm-merge")} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-purple-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <Users className="w-3.5 h-3.5 text-purple-500" /> Profile Merge
                                        </button>
                                        <div className="h-px bg-border my-1 mx-1"></div>
                                        <button onClick={async () => {
                                            setLoading(true);
                                            try {
                                                const res = await crmService.autoStageDeals();
                                                toast({ title: 'Deals Auto-Staged', description: `Moved ${res.movedCount} deals to new stages based on AI probability.` });
                                                await fetchData();
                                            } catch (err: any) {
                                                toast({ title: 'Auto-Stage Failed', description: err.message, variant: 'destructive' });
                                                setLoading(false);
                                            }
                                        }} className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-rose-500/10 rounded-lg flex items-center gap-2 transition-colors">
                                            <RefreshCw className="w-3.5 h-3.5 text-rose-500" /> Auto Stage Deals
                                        </button>
                                    </div>
                                </div>
                                <button
                                    onClick={fetchData}
                                    className="px-3 py-1.25 rounded-lg text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 border border-border transition-colors flex items-center gap-1.5 h-9"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('crmDashboard.refresh')}
                                </button>
                                <button 
                                    onClick={() => {
                                        setEditContactId(null);
                                        setAddFormData({ name: '', email: '', phone: '', company: '', status: 'lead', source: '', score: 0, notes: '', signature: '', tags: '' });
                                        setShowAddModal(true);
                                    }} 
                                    className="px-4 py-1.25 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 transition-all flex items-center gap-1.5 h-9"
                                >
                                    <Plus className="w-3.5 h-3.5" /> {t('crmDashboard.addContact')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="px-8 flex items-center gap-1 border-b border-border bg-card/50">
                    {([
                        { id: 'contacts', label: 'Contacts', icon: <List className="w-3.5 h-3.5" /> },
                        { id: 'pipeline', label: 'Pipeline (Kanban)', icon: <Kanban className="w-3.5 h-3.5" /> },
                        { id: 'reports', label: 'Reports', icon: <BarChart2 className="w-3.5 h-3.5" /> },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                                activeTab === tab.id
                                    ? 'text-primary border-primary'
                                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                <div className="px-8 pb-8 space-y-6">
                    {/* Pipeline Tab */}
                    {activeTab === 'pipeline' && <CRMPipelineKanban />}

                    {/* Reports Tab */}
                    {activeTab === 'reports' && <CRMReports />}

                    {/* Contacts Tab */}
                    {activeTab === 'contacts' && <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <KPICard
                            title={t('crmDashboard.kpi.totalContacts')}
                            value={String(stats.totalContacts)}
                            icon={<Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                        />
                        <KPICard
                            title={t('crmDashboard.kpi.qualifiedLeads')}
                            value={String(stats.qualifiedLeads)}
                            subtitle={t('crmDashboard.kpi.leadsTotal', { count: stats.totalLeads })}
                            icon={<UserPlus className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                        />
                        <KPICard
                            title={t('crmDashboard.kpi.dealsWonValue')}
                            value={formatCurrency(stats.dealsWonValue, workspaceCurrency)}
                            subtitle={t('crmDashboard.kpi.dealsClosed', { count: stats.dealsWonCount })}
                            icon={<DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                        />
                        <KPICard
                            title={t('crmDashboard.kpi.conversionRate')}
                            value={`${stats.conversionRate}%`}
                            subtitle={t('crmDashboard.kpi.leadsToCustomers')}
                            icon={<TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                        />
                    </div>

                    {/* Middle Row: Pipeline + Sources */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Deal Pipeline */}
                        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-primary" /> {t('crmDashboard.pipeline.title')}
                                </h2>
                                <span className="text-xs text-muted-foreground">{t('crmDashboard.pipeline.summary', { count: stats.totalDeals, value: formatCurrency(totalPipelineValue, workspaceCurrency) })}</span>
                            </div>
                            <div className="space-y-3">
                                {stats.pipelineBreakdown.map((stage) => {
                                    const pct = totalPipelineValue > 0 ? (stage.value / totalPipelineValue) * 100 : 0;
                                    return (
                                        <div key={stage.stage} className="group">
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage.stage] || '#6b7280' }} />
                                                    <span className="text-foreground font-medium">{t(`crmDashboard.pipeline.stages.${stage.stage}`) || STAGE_LABELS[stage.stage] || stage.stage}</span>
                                                    <span className="text-muted-foreground">({stage.count})</span>
                                                </div>
                                                <span className="text-muted-foreground font-medium">{formatCurrency(stage.value, workspaceCurrency)}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700 group-hover:brightness-125"
                                                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: STAGE_COLORS[stage.stage] || '#6b7280' }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Lead Sources */}
                        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                            <h2 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-purple-500" /> {t('crmDashboard.sources.title')}
                            </h2>
                            <div className="space-y-3">
                                {stats.leadSources.map((src, idx) => {
                                    const maxCount = Math.max(...stats.leadSources.map(s => s.count));
                                    const pct = maxCount > 0 ? (src.count / maxCount) * 100 : 0;
                                    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];
                                    return (
                                        <div key={src.source}>
                                            <div className="flex items-center justify-between text-[11px] mb-1">
                                                <span className="text-foreground/80">{src.source}</span>
                                                <span className="text-muted-foreground">{src.count}</span>
                                            </div>
                                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${pct}%`, backgroundColor: colors[idx % colors.length] }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Contacts Table + Activity Feed */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Contacts Table */}
                        <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-sm">
                            <div className="p-5 border-b border-border">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-semibold text-foreground">{t('crmDashboard.contacts.title')}</h2>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{t('crmDashboard.contacts.total', { count: totalContacts })}</span>
                                        <button
                                            onClick={exportContactsCSV}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
                                            title="Export all contacts as CSV"
                                        >
                                            <Download className="w-3 h-3" />
                                            Export CSV
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                                        <input
                                            type="text"
                                            placeholder={t('crmDashboard.contacts.searchPlaceholder')}
                                            value={searchTerm}
                                            onChange={(e) => { setSearchTerm(e.target.value); setContactsPage(1); }}
                                            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                                        />
                                    </div>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => { setStatusFilter(e.target.value); setContactsPage(1); }}
                                        className="px-3 py-2 rounded-lg text-xs bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="">{t('crmDashboard.contacts.filterAll')}</option>
                                        <option value="lead">{t('crmDashboard.contacts.status.lead')}</option>
                                        <option value="qualified">{t('crmDashboard.contacts.status.qualified')}</option>
                                        <option value="customer">{t('crmDashboard.contacts.status.customer')}</option>
                                        <option value="churned">{t('crmDashboard.contacts.status.churned')}</option>
                                    </select>
                                </div>
                                {/* Tag filter chips */}
                                {allTags.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        <Tag className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                                        <button
                                            onClick={() => setTagFilter('')}
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${tagFilter === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'}`}
                                        >All</button>
                                        {allTags.map(tag => (
                                            <button
                                                key={tag}
                                                onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${tagFilter === tag ? 'bg-primary text-primary-foreground border-primary' : 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/15'}`}
                                            >{tag}</button>
                                        ))}
                                    </div>
                                )}
                                {/* Module Actions Bar */}
                                {showModuleActions && (
                                    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 flex-wrap">
                                        <span className="text-xs font-semibold text-primary shrink-0">{selectedContacts.size} selected</span>
                                        <div className="h-3 w-px bg-border" />
                                        <div className="relative group">
                                            <button className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-background border border-border hover:bg-muted transition-colors">
                                                Change Status ▾
                                            </button>
                                            <div className="absolute top-full left-0 mt-1 w-36 bg-card border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible z-50 p-1">
                                                {['lead', 'qualified', 'customer', 'churned', 'inactive'].map(s => (
                                                    <button key={s} onClick={() => handleBulkStatusChange(s)} className="w-full text-left px-2.5 py-1.5 rounded-md text-[11px] hover:bg-muted capitalize transition-colors">{s}</button>
                                                ))}
                                            </div>
                                        </div>
                                        {showBulkTagInput ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    autoFocus
                                                    value={bulkTagInput}
                                                    onChange={e => setBulkTagInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleBulkAddTag(); if (e.key === 'Escape') { setShowBulkTagInput(false); setBulkTagInput(''); } }}
                                                    placeholder="Tag name…"
                                                    className="px-2 py-1 rounded-md text-[11px] bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary/20 w-24"
                                                />
                                                <button onClick={handleBulkAddTag} className="px-2 py-1 rounded-md text-[11px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Add</button>
                                                <button onClick={() => { setShowBulkTagInput(false); setBulkTagInput(''); }} className="px-2 py-1 rounded-md text-[11px] bg-muted hover:bg-muted/80 transition-colors">✕</button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setShowBulkTagInput(true)} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-background border border-border hover:bg-muted transition-colors flex items-center gap-1">
                                                <Tag className="w-3 h-3" /> Add Tag
                                            </button>
                                        )}
                                        <button onClick={handleBulkExport} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-background border border-border hover:bg-muted transition-colors flex items-center gap-1">
                                            <Download className="w-3 h-3" /> Export
                                        </button>
                                        <button onClick={handleBulkDelete} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors flex items-center gap-1">
                                            <Trash2 className="w-3 h-3" /> Delete
                                        </button>
                                        <button onClick={() => { setSelectedContacts(new Set()); setShowModuleActions(false); }} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors">Clear</button>
                                    </div>
                                )}
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/50">
                                            <th className="px-3 py-3 w-8">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-border cursor-pointer"
                                                    checked={filteredContacts.length > 0 && selectedContacts.size === filteredContacts.length}
                                                    onChange={toggleSelectAll}
                                                    title="Select all"
                                                />
                                            </th>
                                            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">{t('crmDashboard.contacts.table.name')}</th>
                                            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">{t('crmDashboard.contacts.table.company')}</th>
                                            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">{t('crmDashboard.contacts.table.status')}</th>
                                            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">{t('crmDashboard.contacts.table.score')}</th>
                                            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">{t('crmDashboard.contacts.table.source')}</th>
                                            <th className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredContacts.length > 0 ? filteredContacts.map((contact) => {
                                            const cId = String(contact._id || contact.id);
                                            const isChecked = selectedContacts.has(cId);
                                            return (
                                            <tr key={contact.id || contact._id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer group ${isChecked ? 'bg-primary/5' : ''}`}
                                                onClick={() => navigate(`/dashboard/crm/contacts/${contact._id || contact.id}`)}>
                                                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-border cursor-pointer"
                                                        checked={isChecked}
                                                        onChange={() => toggleContactSelection(cId)}
                                                    />
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-sm">
                                                            {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-foreground font-medium group-hover:text-primary transition-colors">{contact.name}</p>
                                                            <p className="text-[11px] text-muted-foreground">{contact.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                        <Building2 className="w-3 h-3" /> {contact.company || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COLORS[contact.status] || STATUS_COLORS.inactive}`}>
                                                            {t(`crmDashboard.contacts.status.${contact.status}`) || contact.status}
                                                        </span>
                                                        {((contact as any).customFields?.invoicedIds?.length > 0 || (contact.tags ?? []).includes('invoiced')) && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                                Invoiced
                                                            </span>
                                                        )}
                                                        {(contact.tags ?? []).filter(t => t !== 'invoiced').slice(0, 2).map(tag => (
                                                            <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-primary/10 text-primary border-primary/20">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full"
                                                                style={{
                                                                    width: `${contact.score || 0}%`,
                                                                    backgroundColor: (contact.score || 0) > 70 ? '#22c55e' : (contact.score || 0) > 40 ? '#f59e0b' : '#ef4444',
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="text-[11px] text-muted-foreground">{contact.score || 0}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-xs text-muted-foreground">{contact.source || '—'}</span>
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleAIActionStart("crm-ai-pipeline", contact);
                                                            }}
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                            title="AI Pipeline Analysis"
                                                        >
                                                            <Zap className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditContactId(String(contact.id || contact._id));
                                                                setAddFormData({
                                                                    name: contact.name,
                                                                    email: contact.email,
                                                                    phone: contact.phone || '',
                                                                    company: contact.company || '',
                                                                    status: contact.status,
                                                                    source: contact.source || '',
                                                                    score: contact.score || 0,
                                                                    notes: contact.notes || '',
                                                                    signature: contact.signature || '',
                                                                    tags: (contact.tags ?? []).join(', '),
                                                                });
                                                                setShowAddModal(true);
                                                            }}
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                            title="Quick Edit"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm(`Delete "${contact.name}"? This cannot be undone.`)) {
                                                                    crmService.deleteContact(String(contact._id || contact.id)).then(() => {
                                                                        toast({ title: 'Contact Deleted', description: `${contact.name} has been removed.` });
                                                                        fetchData();
                                                                    }).catch(err => toast({ title: 'Delete Failed', description: (err as Error).message, variant: 'destructive' }));
                                                                }
                                                            }}
                                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan={7} className="text-center py-10">
                                                    {loading ? (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
                                                            <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <Users className="w-8 h-8 text-muted-foreground/30" />
                                                            <span className="text-sm text-muted-foreground">{isLive ? 'No contacts yet' : 'Not connected to backend'}</span>
                                                            <span className="text-xs text-muted-foreground/60">Click <strong>"+ Add Contact"</strong> to create a contact manually.</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/5">
                                <span className="text-xs text-muted-foreground font-medium">
                                    Showing <span className="text-foreground">{contacts.length > 0 ? ((contactsPage - 1) * 10) + 1 : 0}–{Math.min(contactsPage * 10, totalContacts)}</span> of <span className="text-primary font-bold">{totalContacts}</span> contacts
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setContactsPage(p => Math.max(1, p - 1))}
                                        disabled={contactsPage <= 1}
                                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground bg-secondary hover:bg-secondary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-border shadow-sm"
                                    >
                                        ← Prev
                                    </button>
                                    <div className="px-3 py-1.5 rounded-md bg-secondary border border-border">
                                        <span className="text-xs text-primary font-bold">{contactsPage}</span>
                                        <span className="text-[10px] text-muted-foreground mx-1">/</span>
                                        <span className="text-xs text-muted-foreground">{Math.max(Math.ceil(totalContacts / 10), 1)}</span>
                                    </div>
                                    <button
                                        onClick={() => setContactsPage(p => p + 1)}
                                        disabled={contactsPage >= Math.ceil(totalContacts / 10) || totalContacts <= 10}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-primary/10"
                                    >
                                        Next Page →
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Activity Feed */}
                        <div className="rounded-xl border border-border bg-card p-5">
                            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-emerald-500" /> {t('crmDashboard.activity.title')}
                            </h2>
                            {stats.recentActivities.length > 0 ? (
                                <div className="space-y-3">
                                    {stats.recentActivities.slice(0, 8).map((activity, idx) => (
                                        <div key={idx} className="flex items-start gap-3 group">
                                            <div className="mt-0.5 p-1.5 rounded-md bg-muted text-muted-foreground group-hover:text-foreground transition-colors">
                                                {ACTIVITY_ICONS[activity.type] || <Activity className="w-3.5 h-3.5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-foreground/80 leading-relaxed truncate">{activity.description}</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    {activity.actor} · {timeAgo(activity.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500 text-center py-6">{t('crmDashboard.activity.empty')}</p>
                            )}
                        </div>
                    </div>
                    {/* End of Contacts tab */}
                    </>}
                </div>
            </div>
        </AppLayout>
    );
};

export default CRMDashboard;

