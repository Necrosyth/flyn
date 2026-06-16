import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { useContactActions } from '@/hooks/useContactActions';
import * as crmService from '@/services/crm';
import type { Contact, Deal, Activity } from '@/services/crm';
import {
    ArrowLeft, Mail, Phone, Building2, Tag, Edit2, Trash2,
    Plus, MessageSquare, Handshake, DollarSign, Calendar,
    CheckSquare, Activity as ActivityIcon, RefreshCw, Send,
    User, Star, Clock, TrendingUp, X, Save, ChevronRight,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
    lead: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    qualified: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    customer: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    churned: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    inactive: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

const STAGE_COLORS: Record<string, string> = {
    new: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    qualified: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    proposal: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    negotiation: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    lost: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    email: <Mail className="w-3.5 h-3.5" />,
    call: <Phone className="w-3.5 h-3.5" />,
    meeting: <Handshake className="w-3.5 h-3.5" />,
    note: <MessageSquare className="w-3.5 h-3.5" />,
    task: <CheckSquare className="w-3.5 h-3.5" />,
    deal_update: <DollarSign className="w-3.5 h-3.5" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
    email: 'bg-blue-500/10 text-blue-500',
    call: 'bg-green-500/10 text-green-500',
    meeting: 'bg-purple-500/10 text-purple-500',
    note: 'bg-amber-500/10 text-amber-500',
    task: 'bg-teal-500/10 text-teal-500',
    deal_update: 'bg-emerald-500/10 text-emerald-500',
};

const timeAgo = (date: string) => {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
};

const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val}`;
};

type ActivityModalType = 'email' | 'call' | 'sms' | 'note' | 'meeting' | 'task' | null;

const ContactProfile = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { makeVapiCall, sendTwilioSms, callingPhone, sendingSms } = useContactActions();

    const [contact, setContact] = useState<Contact | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'deals' | 'tasks'>('overview');

    // Edit contact state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', email: '', phone: '', company: '',
        status: 'lead' as Contact['status'],
        source: '', score: 0, notes: '', tags: '',
    });
    const [editLoading, setEditLoading] = useState(false);

    // Activity log modal
    const [activityModal, setActivityModal] = useState<ActivityModalType>(null);
    const [activityForm, setActivityForm] = useState({ description: '', dueDate: '', title: '' });
    const [activityLoading, setActivityLoading] = useState(false);

    // Add deal modal
    const [showDealModal, setShowDealModal] = useState(false);
    const [dealForm, setDealForm] = useState({
        title: '', value: 0, stage: 'new' as Deal['stage'],
        probability: 50, expectedCloseDate: '', owner: '', notes: '',
    });
    const [dealLoading, setDealLoading] = useState(false);

    // SMS quick compose
    const [smsBody, setSmsBody] = useState('');

    const loadData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [c, acts, allDeals] = await Promise.all([
                crmService.getContact(id),
                crmService.getActivities(id),
                crmService.getDeals(),
            ]);
            setContact(c);
            setActivities(acts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setDeals(allDeals.filter(d => d.contactId === id));
            setEditForm({
                name: c.name,
                email: c.email,
                phone: c.phone || '',
                company: c.company || '',
                status: c.status,
                source: c.source || '',
                score: c.score || 0,
                notes: c.notes || '',
                tags: (c.tags ?? []).join(', '),
            });
        } catch (err) {
            toast({ title: 'Failed to load contact', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [id, toast]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSaveContact = async () => {
        if (!id || !editForm.name || !editForm.email) return;
        setEditLoading(true);
        try {
            await crmService.updateContact(id, {
                ...editForm,
                score: Number(editForm.score) || 0,
                tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
            });
            toast({ title: 'Contact updated' });
            setShowEditModal(false);
            loadData();
        } catch (err) {
            toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setEditLoading(false);
        }
    };

    const handleDeleteContact = async () => {
        if (!id || !window.confirm(`Delete "${contact?.name}"? This cannot be undone.`)) return;
        try {
            await crmService.deleteContact(id);
            toast({ title: 'Contact deleted' });
            navigate('/dashboard/crm');
        } catch (err) {
            toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
        }
    };

    const handleLogActivity = async () => {
        if (!id || !activityForm.description) return;
        setActivityLoading(true);
        try {
            const type = activityModal === 'note' ? 'note'
                : activityModal === 'meeting' ? 'meeting'
                : activityModal === 'task' ? 'task'
                : activityModal === 'call' ? 'call'
                : 'email';
            await crmService.createActivity({
                type,
                contactId: id,
                description: activityForm.description,
                actor: 'You',
                createdAt: new Date().toISOString(),
            });
            toast({ title: 'Activity logged' });
            setActivityModal(null);
            setActivityForm({ description: '', dueDate: '', title: '' });
            loadData();
        } catch (err) {
            toast({ title: 'Failed to log activity', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setActivityLoading(false);
        }
    };

    const handleCall = async () => {
        if (!contact?.phone) {
            toast({ title: 'No phone number', variant: 'destructive' });
            return;
        }
        await makeVapiCall(contact.phone);
        await crmService.createActivity({
            type: 'call',
            contactId: id!,
            description: `Outbound call to ${contact.phone}`,
            actor: 'You',
            createdAt: new Date().toISOString(),
        });
        loadData();
    };

    const handleSendSms = async () => {
        if (!contact?.phone || !smsBody.trim()) return;
        const result = await sendTwilioSms(contact.phone, smsBody);
        if (result.success) {
            await crmService.createActivity({
                type: 'note',
                contactId: id!,
                description: `SMS sent: "${smsBody}"`,
                actor: 'You',
                createdAt: new Date().toISOString(),
            });
            setSmsBody('');
            setActivityModal(null);
            loadData();
        }
    };

    const handleAddDeal = async () => {
        if (!id || !dealForm.title) return;
        setDealLoading(true);
        try {
            await crmService.createDeal({
                ...dealForm,
                contactId: id,
                contactName: contact?.name,
                value: Number(dealForm.value) || 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            toast({ title: 'Deal created' });
            setShowDealModal(false);
            setDealForm({ title: '', value: 0, stage: 'new', probability: 50, expectedCloseDate: '', owner: '', notes: '' });
            loadData();
        } catch (err) {
            toast({ title: 'Failed to create deal', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setDealLoading(false);
        }
    };

    if (loading) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-64">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            </AppLayout>
        );
    }

    if (!contact) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                    <User className="w-12 h-12 text-muted-foreground/30" />
                    <p className="text-muted-foreground">Contact not found</p>
                    <button onClick={() => navigate('/dashboard/crm')} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to CRM
                    </button>
                </div>
            </AppLayout>
        );
    }

    const totalDealValue = deals.reduce((s, d) => s + (d.value || 0), 0);
    const wonDeals = deals.filter(d => d.stage === 'won');
    const openDeals = deals.filter(d => !['won', 'lost'].includes(d.stage));

    const initials = contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const scoreColor = (contact.score || 0) > 70 ? '#22c55e' : (contact.score || 0) > 40 ? '#f59e0b' : '#ef4444';

    return (
        <AppLayout>
            <div className="flex-1 overflow-auto">
                {/* Edit Contact Modal */}
                {showEditModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowEditModal(false)}>
                        <div className="w-full max-w-lg mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                                    <Edit2 className="w-4 h-4 text-primary" /> Edit Contact
                                </h2>
                                <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
                            </div>
                            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Name *</span>
                                        <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Email *</span>
                                        <input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Phone</span>
                                        <input type="tel" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Company</span>
                                        <input type="text" value={editForm.company} onChange={e => setEditForm(p => ({ ...p, company: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Status</span>
                                        <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as Contact['status'] }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none">
                                            <option value="lead">Lead</option>
                                            <option value="qualified">Qualified</option>
                                            <option value="customer">Customer</option>
                                            <option value="churned">Churned</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Score (0–100)</span>
                                        <input type="number" min={0} max={100} value={editForm.score} onChange={e => setEditForm(p => ({ ...p, score: Number(e.target.value) }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Source</span>
                                        <input type="text" value={editForm.source} onChange={e => setEditForm(p => ({ ...p, source: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" placeholder="e.g. Website, Referral" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Tags (comma-separated)</span>
                                        <input type="text" value={editForm.tags} onChange={e => setEditForm(p => ({ ...p, tags: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" placeholder="vip, upsell, hot" />
                                    </label>
                                </div>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Notes</span>
                                    <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none resize-none" />
                                </label>
                            </div>
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                                <button onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors">Cancel</button>
                                <button onClick={handleSaveContact} disabled={editLoading} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-2 transition-all">
                                    {editLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Activity Modal */}
                {activityModal && activityModal !== 'call' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setActivityModal(null)}>
                        <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                                <h2 className="text-sm font-semibold text-foreground capitalize flex items-center gap-2">
                                    {ACTIVITY_ICONS[activityModal] || <MessageSquare className="w-4 h-4" />}
                                    {activityModal === 'sms' ? 'Send SMS' : activityModal === 'email' ? 'Log Email' : `Log ${activityModal}`}
                                </h2>
                                <button onClick={() => setActivityModal(null)} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
                            </div>
                            <div className="p-5 space-y-3">
                                {activityModal === 'sms' ? (
                                    <>
                                        <div className="text-xs text-muted-foreground">Sending to: <span className="text-foreground font-medium">{contact.phone || 'No phone number'}</span></div>
                                        <textarea
                                            value={smsBody}
                                            onChange={e => setSmsBody(e.target.value)}
                                            placeholder="Type your SMS message..."
                                            rows={4}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                                        />
                                    </>
                                ) : (
                                    <textarea
                                        value={activityForm.description}
                                        onChange={e => setActivityForm(p => ({ ...p, description: e.target.value }))}
                                        placeholder={
                                            activityModal === 'email' ? 'Describe the email sent/received...'
                                            : activityModal === 'meeting' ? 'Meeting summary and outcomes...'
                                            : activityModal === 'task' ? 'Task description...'
                                            : 'Note content...'
                                        }
                                        rows={4}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                                    />
                                )}
                            </div>
                            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
                                <button onClick={() => setActivityModal(null)} className="px-4 py-2 rounded-lg text-xs text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors">Cancel</button>
                                <button
                                    onClick={activityModal === 'sms' ? handleSendSms : handleLogActivity}
                                    disabled={activityLoading || sendingSms !== null}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-2 transition-all"
                                >
                                    {activityLoading || sendingSms ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    {activityModal === 'sms' ? 'Send SMS' : 'Log Activity'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Deal Modal */}
                {showDealModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowDealModal(false)}>
                        <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-emerald-500" /> Add Deal
                                </h2>
                                <button onClick={() => setShowDealModal(false)} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
                            </div>
                            <div className="p-5 space-y-3">
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Deal Title *</span>
                                    <input type="text" value={dealForm.title} onChange={e => setDealForm(p => ({ ...p, title: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="e.g. Enterprise Plan Upgrade" />
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Value ($)</span>
                                        <input type="number" min={0} value={dealForm.value} onChange={e => setDealForm(p => ({ ...p, value: Number(e.target.value) }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Stage</span>
                                        <select value={dealForm.stage} onChange={e => setDealForm(p => ({ ...p, stage: e.target.value as Deal['stage'] }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none">
                                            <option value="new">New</option>
                                            <option value="qualified">Qualified</option>
                                            <option value="proposal">Proposal</option>
                                            <option value="negotiation">Negotiation</option>
                                            <option value="won">Won</option>
                                            <option value="lost">Lost</option>
                                        </select>
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Probability (%)</span>
                                        <input type="number" min={0} max={100} value={dealForm.probability} onChange={e => setDealForm(p => ({ ...p, probability: Number(e.target.value) }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-muted-foreground mb-1 block">Expected Close</span>
                                        <input type="date" value={dealForm.expectedCloseDate} onChange={e => setDealForm(p => ({ ...p, expectedCloseDate: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" />
                                    </label>
                                </div>
                                <label className="block">
                                    <span className="text-xs text-muted-foreground mb-1 block">Owner</span>
                                    <input type="text" value={dealForm.owner} onChange={e => setDealForm(p => ({ ...p, owner: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:outline-none" placeholder="Assign to team member" />
                                </label>
                            </div>
                            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
                                <button onClick={() => setShowDealModal(false)} className="px-4 py-2 rounded-lg text-xs text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border">Cancel</button>
                                <button onClick={handleAddDeal} disabled={dealLoading || !dealForm.title}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-2">
                                    {dealLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    Create Deal
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Page Content */}
                <div>
                    {/* Header */}
                    <div className="px-8 pt-8 pb-6 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
                        <button onClick={() => navigate('/dashboard/crm')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
                            <ArrowLeft className="w-3.5 h-3.5" /> Back to CRM
                        </button>

                        <div className="flex items-start justify-between flex-wrap gap-4">
                            <div className="flex items-start gap-4">
                                {/* Avatar */}
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-primary/20 shrink-0">
                                    {initials}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <h1 className="text-2xl font-bold text-foreground">{contact.name}</h1>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COLORS[contact.status] || STATUS_COLORS.inactive}`}>
                                            {contact.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                                        {contact.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{contact.email}</span>}
                                        {contact.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{contact.phone}</span>}
                                        {contact.company && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{contact.company}</span>}
                                    </div>
                                    {(contact.tags ?? []).length > 0 && (
                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                            {(contact.tags ?? []).map(tag => (
                                                <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-primary/10 text-primary border-primary/20">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={handleCall} disabled={callingPhone !== null}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors">
                                    <Phone className="w-3.5 h-3.5" /> {callingPhone ? 'Calling…' : 'Call'}
                                </button>
                                <button onClick={() => setActivityModal('sms')}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
                                    <MessageSquare className="w-3.5 h-3.5" /> SMS
                                </button>
                                <button onClick={() => setActivityModal('email')}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors">
                                    <Mail className="w-3.5 h-3.5" /> Log Email
                                </button>
                                <button onClick={() => setActivityModal('meeting')}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
                                    <Handshake className="w-3.5 h-3.5" /> Meeting
                                </button>
                                <button onClick={() => setActivityModal('note')}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-muted text-foreground border border-border hover:bg-muted/80 transition-colors">
                                    <MessageSquare className="w-3.5 h-3.5" /> Note
                                </button>
                                <button onClick={() => setShowEditModal(true)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" /> Edit
                                </button>
                                <button onClick={handleDeleteContact}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="px-8 py-5 border-b border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="text-center">
                            <div className="text-lg font-bold text-foreground">{contact.score || 0}</div>
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${contact.score || 0}%`, backgroundColor: scoreColor }} />
                                </div>
                                <span className="text-[10px] text-muted-foreground">/100</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">Lead Score</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-foreground">{deals.length}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Total Deals</div>
                            <div className="text-[10px] text-emerald-500">{wonDeals.length} won</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalDealValue)}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Total Deal Value</div>
                            <div className="text-[10px] text-muted-foreground">{openDeals.length} open</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-foreground">{activities.length}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Activities</div>
                            <div className="text-[10px] text-muted-foreground">{contact.source && `via ${contact.source}`}</div>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="px-8 pt-4 flex items-center gap-1 border-b border-border">
                        {(['overview', 'timeline', 'deals'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 text-xs font-semibold rounded-t-lg capitalize transition-colors ${
                                    activeTab === tab
                                        ? 'text-primary border-b-2 border-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="px-8 py-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Contact Details */}
                                <div className="lg:col-span-1 space-y-4">
                                    <div className="rounded-xl border border-border bg-card p-5">
                                        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                                            <User className="w-4 h-4 text-primary" /> Contact Details
                                        </h3>
                                        <div className="space-y-3">
                                            {[
                                                { label: 'Email', value: contact.email, icon: <Mail className="w-3.5 h-3.5" /> },
                                                { label: 'Phone', value: contact.phone, icon: <Phone className="w-3.5 h-3.5" /> },
                                                { label: 'Company', value: contact.company, icon: <Building2 className="w-3.5 h-3.5" /> },
                                                { label: 'Source', value: contact.source, icon: <Tag className="w-3.5 h-3.5" /> },
                                            ].map(row => row.value ? (
                                                <div key={row.label} className="flex items-start gap-3">
                                                    <span className="p-1.5 rounded-md bg-muted text-muted-foreground mt-0.5">{row.icon}</span>
                                                    <div>
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{row.label}</div>
                                                        <div className="text-sm text-foreground">{row.value}</div>
                                                    </div>
                                                </div>
                                            ) : null)}
                                            {contact.createdAt && (
                                                <div className="flex items-start gap-3">
                                                    <span className="p-1.5 rounded-md bg-muted text-muted-foreground mt-0.5"><Clock className="w-3.5 h-3.5" /></span>
                                                    <div>
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Created</div>
                                                        <div className="text-sm text-foreground">{new Date(contact.createdAt).toLocaleDateString()}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {contact.notes && (
                                        <div className="rounded-xl border border-border bg-card p-5">
                                            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4 text-amber-500" /> Notes
                                            </h3>
                                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Recent Activity + Quick Deals */}
                                <div className="lg:col-span-2 space-y-4">
                                    <div className="rounded-xl border border-border bg-card p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                                <ActivityIcon className="w-4 h-4 text-emerald-500" /> Recent Activity
                                            </h3>
                                            <button onClick={() => setActiveTab('timeline')} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                                                View all <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                        {activities.length > 0 ? (
                                            <div className="space-y-3">
                                                {activities.slice(0, 5).map((act, idx) => (
                                                    <div key={idx} className="flex items-start gap-3">
                                                        <span className={`p-1.5 rounded-md mt-0.5 ${ACTIVITY_COLORS[act.type] || 'bg-muted text-muted-foreground'}`}>
                                                            {ACTIVITY_ICONS[act.type] || <ActivityIcon className="w-3.5 h-3.5" />}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-foreground/80 leading-relaxed">{act.description}</p>
                                                            <p className="text-[10px] text-muted-foreground mt-0.5">{act.actor} · {timeAgo(act.createdAt)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-6">
                                                <ActivityIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                                <p className="text-xs text-muted-foreground">No activity yet. Log a call, email, or note above.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="rounded-xl border border-border bg-card p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                                <DollarSign className="w-4 h-4 text-emerald-500" /> Deals
                                            </h3>
                                            <button onClick={() => setShowDealModal(true)} className="flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors">
                                                <Plus className="w-3 h-3" /> Add Deal
                                            </button>
                                        </div>
                                        {deals.length > 0 ? (
                                            <div className="space-y-2">
                                                {deals.slice(0, 4).map((deal) => (
                                                    <div key={deal._id || deal.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
                                                        <div>
                                                            <div className="text-sm font-medium text-foreground">{deal.title}</div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {deal.expectedCloseDate && `Close: ${new Date(deal.expectedCloseDate).toLocaleDateString()}`}
                                                                {deal.owner && ` · ${deal.owner}`}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(deal.value)}</div>
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border uppercase font-bold ${STAGE_COLORS[deal.stage] || ''}`}>
                                                                {deal.stage}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-6">
                                                <DollarSign className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                                <p className="text-xs text-muted-foreground">No deals yet.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Timeline Tab */}
                        {activeTab === 'timeline' && (
                            <div className="max-w-2xl">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-primary" /> Activity Timeline
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setActivityModal('note')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all">
                                            <Plus className="w-3.5 h-3.5" /> Log Activity
                                        </button>
                                    </div>
                                </div>
                                {activities.length > 0 ? (
                                    <div className="relative space-y-0">
                                        <div className="absolute left-4 top-0 bottom-0 w-px bg-border/60" />
                                        {activities.map((act, idx) => (
                                            <div key={idx} className="flex items-start gap-4 pb-6 relative">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0 ${ACTIVITY_COLORS[act.type] || 'bg-muted text-muted-foreground'}`}>
                                                    {ACTIVITY_ICONS[act.type] || <ActivityIcon className="w-3.5 h-3.5" />}
                                                </div>
                                                <div className="flex-1 pt-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-sm text-foreground leading-relaxed">{act.description}</p>
                                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(act.createdAt)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] text-muted-foreground">{act.actor}</span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${ACTIVITY_COLORS[act.type] || ''}`}>{act.type}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <Clock className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                                        <p className="text-sm text-muted-foreground">No activity logged yet.</p>
                                        <p className="text-xs text-muted-foreground/60 mt-1">Use the action buttons above to log calls, emails, notes and meetings.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Deals Tab */}
                        {activeTab === 'deals' && (
                            <div>
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-primary" /> Deals ({deals.length})
                                    </h3>
                                    <button onClick={() => setShowDealModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all">
                                        <Plus className="w-3.5 h-3.5" /> New Deal
                                    </button>
                                </div>
                                {deals.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {deals.map((deal) => (
                                            <div key={deal._id || deal.id} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="font-semibold text-foreground text-sm">{deal.title}</div>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold ${STAGE_COLORS[deal.stage] || ''}`}>
                                                        {deal.stage}
                                                    </span>
                                                </div>
                                                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mb-3">
                                                    {formatCurrency(deal.value)}
                                                </div>
                                                <div className="space-y-1 text-xs text-muted-foreground">
                                                    {deal.probability !== undefined && (
                                                        <div className="flex items-center gap-2">
                                                            <span>Probability:</span>
                                                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                                <div className="h-full rounded-full bg-primary" style={{ width: `${deal.probability}%` }} />
                                                            </div>
                                                            <span>{deal.probability}%</span>
                                                        </div>
                                                    )}
                                                    {deal.expectedCloseDate && <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />Expected: {new Date(deal.expectedCloseDate).toLocaleDateString()}</div>}
                                                    {deal.owner && <div className="flex items-center gap-1"><User className="w-3 h-3" />{deal.owner}</div>}
                                                    {deal.lostReason && <div className="text-red-400">Lost reason: {deal.lostReason}</div>}
                                                    {deal.wonReason && <div className="text-emerald-400">Won reason: {deal.wonReason}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <DollarSign className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                                        <p className="text-sm text-muted-foreground">No deals yet for this contact.</p>
                                        <button onClick={() => setShowDealModal(true)} className="mt-3 text-xs text-primary hover:underline flex items-center gap-1 mx-auto">
                                            <Plus className="w-3.5 h-3.5" /> Create first deal
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default ContactProfile;
