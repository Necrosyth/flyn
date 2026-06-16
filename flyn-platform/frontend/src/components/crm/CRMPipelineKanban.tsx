import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import * as crmService from '@/services/crm';
import type { Deal, Contact } from '@/services/crm';
import {
    Plus, DollarSign, User, Calendar, RefreshCw, Edit2, Trash2, X, Save, AlertCircle,
} from 'lucide-react';

const STAGES: { id: Deal['stage']; label: string; color: string; headerColor: string }[] = [
    { id: 'new',         label: 'New',         color: 'border-indigo-500/30 bg-indigo-500/5',   headerColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
    { id: 'qualified',   label: 'Qualified',   color: 'border-purple-500/30 bg-purple-500/5',   headerColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
    { id: 'proposal',    label: 'Proposal',    color: 'border-violet-500/30 bg-violet-500/5',   headerColor: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
    { id: 'negotiation', label: 'Negotiation', color: 'border-pink-500/30 bg-pink-500/5',       headerColor: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20' },
    { id: 'won',         label: 'Won',         color: 'border-emerald-500/30 bg-emerald-500/5', headerColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
    { id: 'lost',        label: 'Lost',        color: 'border-red-500/30 bg-red-500/5',         headerColor: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
];

const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val}`;
};

interface DealModalState {
    mode: 'add' | 'edit';
    stage: Deal['stage'];
    deal?: Deal;
}

const CRMPipelineKanban = () => {
    const { toast } = useToast();
    const [deals, setDeals] = useState<Deal[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverStage, setDragOverStage] = useState<string | null>(null);
    const [dealModal, setDealModal] = useState<DealModalState | null>(null);
    const [dealForm, setDealForm] = useState({
        title: '', value: 0, contactId: '', probability: 50,
        expectedCloseDate: '', owner: '', notes: '', lostReason: '', wonReason: '',
    });
    const [dealLoading, setDealLoading] = useState(false);
    const dragDealRef = useRef<Deal | null>(null);

    const loadDeals = useCallback(async () => {
        setLoading(true);
        try {
            const [allDeals, contactsResult] = await Promise.all([
                crmService.getDeals(),
                crmService.getContacts({ limit: 200 }),
            ]);
            setDeals(allDeals);
            setContacts(contactsResult.data);
        } catch (err) {
            toast({ title: 'Failed to load deals', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { loadDeals(); }, [loadDeals]);

    const openAddModal = (stage: Deal['stage']) => {
        setDealForm({ title: '', value: 0, contactId: '', probability: 50, expectedCloseDate: '', owner: '', notes: '', lostReason: '', wonReason: '' });
        setDealModal({ mode: 'add', stage });
    };

    const openEditModal = (deal: Deal) => {
        setDealForm({
            title: deal.title,
            value: deal.value,
            contactId: deal.contactId,
            probability: deal.probability ?? 50,
            expectedCloseDate: deal.expectedCloseDate || '',
            owner: deal.owner || '',
            notes: deal.notes || '',
            lostReason: deal.lostReason || '',
            wonReason: deal.wonReason || '',
        });
        setDealModal({ mode: 'edit', stage: deal.stage, deal });
    };

    const handleSaveDeal = async () => {
        if (!dealModal || !dealForm.title) return;
        setDealLoading(true);
        try {
            const contactName = contacts.find(c => (c._id || String(c.id)) === dealForm.contactId)?.name;
            const { updatedAt: _u, createdAt: _c, ...formFields } = dealForm as any;
            const payload: Partial<Deal> = {
                ...formFields,
                stage: dealModal.stage,
                value: Number(dealForm.value) || 0,
                contactName,
            };
            if (dealModal.mode === 'add') {
                const created = await crmService.createDeal(payload);
                setDeals(prev => [...prev, created]);
            } else if (dealModal.deal) {
                const dealId = String(dealModal.deal._id || dealModal.deal.id);
                const updated = await crmService.updateDeal(dealId, payload);
                if (updated) setDeals(prev => prev.map(d => (d._id || String(d.id)) === dealId ? updated : d));
            }
            toast({ title: dealModal.mode === 'add' ? 'Deal created' : 'Deal updated' });
            setDealModal(null);
        } catch (err) {
            toast({ title: 'Failed to save deal', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setDealLoading(false);
        }
    };

    const handleDeleteDeal = async (deal: Deal) => {
        if (!window.confirm(`Delete "${deal.title}"?`)) return;
        const dealId = String(deal._id || deal.id);
        try {
            await crmService.deleteDeal(dealId);
            setDeals(prev => prev.filter(d => (d._id || String(d.id)) !== dealId));
            toast({ title: 'Deal deleted' });
        } catch (err) {
            toast({ title: 'Failed to delete', description: (err as Error).message, variant: 'destructive' });
        }
    };

    const handleDragStart = (deal: Deal) => {
        dragDealRef.current = deal;
        setDraggingId(String(deal._id || deal.id));
    };

    const handleDragOver = (e: React.DragEvent, stage: string) => {
        e.preventDefault();
        setDragOverStage(stage);
    };

    const handleDrop = async (e: React.DragEvent, targetStage: Deal['stage']) => {
        e.preventDefault();
        setDragOverStage(null);
        const deal = dragDealRef.current;
        if (!deal || deal.stage === targetStage) { setDraggingId(null); return; }

        const dealId = String(deal._id || deal.id);
        const needsReason = targetStage === 'won' || targetStage === 'lost';

        if (needsReason) {
            const reason = window.prompt(
                targetStage === 'won'
                    ? 'Won reason (optional):'
                    : 'Lost reason (required):'
            );
            if (targetStage === 'lost' && !reason?.trim()) {
                toast({ title: 'Please provide a lost reason', variant: 'destructive' });
                setDraggingId(null);
                return;
            }
            const updateData: Partial<Deal> = { stage: targetStage };
            if (targetStage === 'won') updateData.wonReason = reason || '';
            if (targetStage === 'lost') updateData.lostReason = reason || '';
            // Optimistic update
            setDeals(prev => prev.map(d => (d._id || String(d.id)) === dealId ? { ...d, ...updateData } : d));
            try {
                const updated = await crmService.updateDeal(dealId, updateData);
                if (updated) setDeals(prev => prev.map(d => (d._id || String(d.id)) === dealId ? updated : d));
            } catch (err) {
                toast({ title: 'Failed to move deal', description: 'Could not save stage change. Please try again.', variant: 'destructive' });
                loadDeals();
            }
        } else {
            setDeals(prev => prev.map(d => (d._id || String(d.id)) === dealId ? { ...d, stage: targetStage } : d));
            try {
                await crmService.updateDeal(dealId, { stage: targetStage });
            } catch (err) {
                toast({ title: 'Failed to update stage', description: 'Could not save the new stage. Please try again.', variant: 'destructive' });
                loadDeals();
            }
        }
        setDraggingId(null);
        dragDealRef.current = null;
    };

    const handleDragEnd = () => {
        setDraggingId(null);
        setDragOverStage(null);
        dragDealRef.current = null;
    };

    const dealsByStage = (stage: string) => deals.filter(d => d.stage === stage);
    const stageValue = (stage: string) => dealsByStage(stage).reduce((s, d) => s + (d.value || 0), 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div>
            {/* Deal Modal */}
            {dealModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setDealModal(null)}>
                    <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-emerald-500" />
                                {dealModal.mode === 'add' ? `New Deal — ${STAGES.find(s => s.id === dealModal.stage)?.label}` : 'Edit Deal'}
                            </h2>
                            <button onClick={() => setDealModal(null)} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
                        </div>
                        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
                            <label className="block">
                                <span className="text-xs text-muted-foreground mb-1 block">Title *</span>
                                <input type="text" value={dealForm.title} onChange={e => setDealForm(p => ({ ...p, title: e.target.value }))}
                                    placeholder="e.g. Enterprise Plan Upgrade"
                                    className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Value ($)</span>
                                    <input type="number" min={0} value={dealForm.value} onChange={e => setDealForm(p => ({ ...p, value: Number(e.target.value) }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Probability %</span>
                                    <input type="number" min={0} max={100} value={dealForm.probability} onChange={e => setDealForm(p => ({ ...p, probability: Number(e.target.value) }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs text-muted-foreground mb-1 block">Contact</span>
                                <select value={dealForm.contactId} onChange={e => setDealForm(p => ({ ...p, contactId: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none">
                                    <option value="">— Select contact —</option>
                                    {contacts.map(c => (
                                        <option key={c._id || c.id} value={String(c._id || c.id)}>{c.name}</option>
                                    ))}
                                </select>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Expected Close</span>
                                    <input type="date" value={dealForm.expectedCloseDate} onChange={e => setDealForm(p => ({ ...p, expectedCloseDate: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Owner</span>
                                    <input type="text" value={dealForm.owner} onChange={e => setDealForm(p => ({ ...p, owner: e.target.value }))}
                                        placeholder="Assign to..."
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                </label>
                            </div>
                            {(dealModal.stage === 'won') && (
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Won Reason</span>
                                    <input type="text" value={dealForm.wonReason} onChange={e => setDealForm(p => ({ ...p, wonReason: e.target.value }))}
                                        placeholder="Why did we win this deal?"
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                </label>
                            )}
                            {(dealModal.stage === 'lost') && (
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Lost Reason</span>
                                    <input type="text" value={dealForm.lostReason} onChange={e => setDealForm(p => ({ ...p, lostReason: e.target.value }))}
                                        placeholder="Why did we lose this deal?"
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                </label>
                            )}
                            <label className="block">
                                <span className="text-xs text-muted-foreground mb-1 block">Notes</span>
                                <textarea value={dealForm.notes} onChange={e => setDealForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                                    className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none resize-none" />
                            </label>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
                            <button onClick={() => setDealModal(null)} className="px-4 py-2 rounded-lg text-xs text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border">Cancel</button>
                            <button onClick={handleSaveDeal} disabled={dealLoading || !dealForm.title}
                                className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-2 disabled:opacity-50">
                                {dealLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                {dealModal.mode === 'add' ? 'Create Deal' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kanban Board */}
            <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]" style={{ scrollbarWidth: 'thin' }}>
                {STAGES.map(stage => {
                    const stageDeals = dealsByStage(stage.id);
                    const total = stageValue(stage.id);
                    const isOver = dragOverStage === stage.id;

                    return (
                        <div
                            key={stage.id}
                            className={`flex-shrink-0 w-64 rounded-xl border transition-all ${stage.color} ${isOver ? 'ring-2 ring-primary/30 scale-[1.01]' : ''}`}
                            onDragOver={e => handleDragOver(e, stage.id)}
                            onDrop={e => handleDrop(e, stage.id)}
                            onDragLeave={() => setDragOverStage(null)}
                        >
                            {/* Column Header */}
                            <div className={`px-3 py-2.5 rounded-t-xl border-b ${stage.headerColor} flex items-center justify-between`}>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold">{stage.label}</span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${stage.headerColor}`}>{stageDeals.length}</span>
                                    </div>
                                    <div className="text-[10px] opacity-70 font-medium">{formatCurrency(total)}</div>
                                </div>
                                <button
                                    onClick={() => openAddModal(stage.id)}
                                    className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                                    title={`Add deal to ${stage.label}`}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Deal Cards */}
                            <div className="p-2 space-y-2 min-h-[200px]">
                                {stageDeals.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <DollarSign className="w-6 h-6 text-muted-foreground/20 mb-1" />
                                        <p className="text-[10px] text-muted-foreground/60">Drop deals here</p>
                                    </div>
                                )}
                                {stageDeals.map(deal => {
                                    const dealId = String(deal._id || deal.id);
                                    const isDragging = draggingId === dealId;

                                    return (
                                        <div
                                            key={dealId}
                                            draggable
                                            onDragStart={() => handleDragStart(deal)}
                                            onDragEnd={handleDragEnd}
                                            className={`rounded-lg border border-border bg-card p-3 cursor-grab active:cursor-grabbing group transition-all hover:shadow-md hover:border-primary/20 ${isDragging ? 'opacity-40 scale-95' : ''}`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="text-xs font-semibold text-foreground leading-tight pr-2 line-clamp-2">{deal.title}</div>
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); openEditModal(deal); }}
                                                        className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                                    >
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleDeleteDeal(deal); }}
                                                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                                                {formatCurrency(deal.value)}
                                            </div>

                                            <div className="space-y-1">
                                                {deal.contactName && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                        <User className="w-3 h-3 shrink-0" />
                                                        <span className="truncate">{deal.contactName}</span>
                                                    </div>
                                                )}
                                                {deal.expectedCloseDate && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                        <Calendar className="w-3 h-3 shrink-0" />
                                                        <span>{new Date(deal.expectedCloseDate).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                                {deal.probability !== undefined && (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-primary/60"
                                                                style={{ width: `${deal.probability}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[9px] text-muted-foreground">{deal.probability}%</span>
                                                    </div>
                                                )}
                                                {deal.lostReason && (
                                                    <div className="flex items-center gap-1 text-[10px] text-red-400">
                                                        <AlertCircle className="w-3 h-3 shrink-0" />
                                                        <span className="truncate">{deal.lostReason}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CRMPipelineKanban;
