/**
 * Data Sources Page
 *
 * NocoBase-style data source manager.
 * - Register MongoDB connections
 * - Test connectivity
 * - Browse collections & documents
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Database,
    Plus,
    RefreshCw,
    Trash2,
    CheckCircle2,
    XCircle,
    AlertCircle,
    HelpCircle,
    Loader2,
    ChevronRight,
    ChevronLeft,
    Search,
    Edit2,
    Eye,
    X,
    Layers,
    Table2,
    ArrowLeft,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
    dataSourcesService,
    DataSource,
    CollectionInfo,
    PaginatedDocuments,
} from '@/services/dataSources';

// ============================================================================
// STATUS HELPERS
// ============================================================================

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    connected: {
        icon: <CheckCircle2 className="w-4 h-4" />,
        color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20',
        label: 'Connected',
    },
    error: {
        icon: <XCircle className="w-4 h-4" />,
        color: 'text-red-400 bg-red-500/15 border-red-500/20',
        label: 'Error',
    },
    disconnected: {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-amber-400 bg-amber-500/15 border-amber-500/20',
        label: 'Disconnected',
    },
    untested: {
        icon: <HelpCircle className="w-4 h-4" />,
        color: 'text-muted-foreground bg-slate-500/15 border-slate-500/20',
        label: 'Untested',
    },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DataSources = () => {
    // ── State ──────────────────────────────────────────────────────────
    const [dataSources, setDataSources] = useState<DataSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingDs, setEditingDs] = useState<DataSource | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Detail view
    const [selectedDs, setSelectedDs] = useState<DataSource | null>(null);
    const [collections, setCollections] = useState<CollectionInfo[]>([]);
    const [collectionsLoading, setCollectionsLoading] = useState(false);
    const [selectedDb, setSelectedDb] = useState<string>('');
    const [databases, setDatabases] = useState<string[]>([]);

    // Document viewer
    const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
    const [documents, setDocuments] = useState<PaginatedDocuments | null>(null);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsPage, setDocsPage] = useState(1);
    const [filterText, setFilterText] = useState('');

    // Form state
    const [formName, setFormName] = useState('');
    const [formConnStr, setFormConnStr] = useState('');
    const [formDb, setFormDb] = useState('');
    const [formTestResult, setFormTestResult] = useState<{ success: boolean; error?: string; databases?: string[] } | null>(null);
    const [formTesting, setFormTesting] = useState(false);
    const [formSaving, setFormSaving] = useState(false);

    // ── Fetch ──────────────────────────────────────────────────────────

    const fetchDataSources = useCallback(async () => {
        try {
            setLoading(true);
            const list = await dataSourcesService.list();
            setDataSources(list);
        } catch (err) {
            console.error('Failed to load data sources', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDataSources();
    }, [fetchDataSources]);

    // ── CRUD Handlers ──────────────────────────────────────────────────

    const openCreateModal = () => {
        setEditingDs(null);
        setFormName('');
        setFormConnStr('mongodb://localhost:27017');
        setFormDb('');
        setFormTestResult(null);
        setShowModal(true);
    };

    const openEditModal = (ds: DataSource) => {
        setEditingDs(ds);
        setFormName(ds.name);
        setFormConnStr(ds.connectionString);
        setFormDb(ds.defaultDatabase || '');
        setFormTestResult(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formName.trim() || !formConnStr.trim()) return;
        setFormSaving(true);
        try {
            if (editingDs) {
                await dataSourcesService.update(editingDs.id, {
                    name: formName.trim(),
                    connectionString: formConnStr.trim(),
                    defaultDatabase: formDb.trim() || undefined,
                });
            } else {
                await dataSourcesService.create({
                    name: formName.trim(),
                    connectionString: formConnStr.trim(),
                    defaultDatabase: formDb.trim() || undefined,
                });
            }
            setShowModal(false);
            fetchDataSources();
        } catch (err) {
            console.error('Save failed', err);
        } finally {
            setFormSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await dataSourcesService.remove(id);
            setDataSources(prev => prev.filter(d => d.id !== id));
            if (selectedDs?.id === id) {
                setSelectedDs(null);
                setCollections([]);
                setSelectedCollection(null);
                setDocuments(null);
            }
        } catch (err) {
            console.error('Delete failed', err);
        } finally {
            setDeletingId(null);
        }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const result = await dataSourcesService.testConnection(id);
            fetchDataSources();
            if (selectedDs?.id === id && result.databases) {
                setDatabases(result.databases);
            }
        } catch (err) {
            console.error('Test failed', err);
        } finally {
            setTestingId(null);
        }
    };

    const handleFormTest = async () => {
        if (!formConnStr.trim()) return;
        setFormTesting(true);
        setFormTestResult(null);
        try {
            // Create a temporary data source for testing
            const temp = await dataSourcesService.create({
                name: `_test_${Date.now()}`,
                connectionString: formConnStr.trim(),
                defaultDatabase: formDb.trim() || undefined,
            });
            const result = await dataSourcesService.testConnection(temp.id);
            setFormTestResult({
                success: result.success,
                error: result.error,
                databases: result.databases,
            });
            // Cleanup temp
            await dataSourcesService.remove(temp.id);
        } catch (err) {
            setFormTestResult({ success: false, error: (err as Error).message });
        } finally {
            setFormTesting(false);
        }
    };

    // ── Collection & Document Browsing ──────────────────────────────────

    const openDetail = async (ds: DataSource) => {
        setSelectedDs(ds);
        setSelectedCollection(null);
        setDocuments(null);
        setCollectionsLoading(true);
        setSelectedDb(ds.defaultDatabase || '');
        try {
            // Also test to get databases list
            if (ds.status === 'connected') {
                const result = await dataSourcesService.testConnection(ds.id);
                if (result.databases) setDatabases(result.databases);
            }
            const cols = await dataSourcesService.getCollections(ds.id, ds.defaultDatabase);
            setCollections(cols);
        } catch (err) {
            console.error('Failed to load collections', err);
            setCollections([]);
        } finally {
            setCollectionsLoading(false);
        }
    };

    const switchDatabase = async (dbName: string) => {
        if (!selectedDs) return;
        setSelectedDb(dbName);
        setSelectedCollection(null);
        setDocuments(null);
        setCollectionsLoading(true);
        try {
            const cols = await dataSourcesService.getCollections(selectedDs.id, dbName);
            setCollections(cols);
        } catch (err) {
            console.error('Failed to load collections', err);
            setCollections([]);
        } finally {
            setCollectionsLoading(false);
        }
    };

    const openCollectionData = async (collectionName: string, page = 1) => {
        if (!selectedDs) return;
        setSelectedCollection(collectionName);
        setDocsLoading(true);
        setDocsPage(page);
        try {
            const result = await dataSourcesService.getCollectionData(
                selectedDs.id,
                collectionName,
                {
                    database: selectedDb || selectedDs.defaultDatabase,
                    page,
                    limit: 20,
                    filter: filterText.trim() || undefined,
                },
            );
            setDocuments(result);
        } catch (err) {
            console.error('Failed to load documents', err);
            setDocuments(null);
        } finally {
            setDocsLoading(false);
        }
    };

    // ── Render: Header ─────────────────────────────────────────────────

    const renderHeader = () => (
        <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/10 via-teal-600/5 to-transparent" />
            <div className="relative px-8 pt-10 pb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg shadow-cyan-500/20">
                                <Database className="w-6 h-6" />
                            </div>
                            <h1 className="text-3xl font-bold text-foreground tracking-tight">Data Sources</h1>
                        </div>
                        <p className="text-muted-foreground text-base max-w-xl mt-2">
                            Connect to external databases, browse collections, and use them in your workflows. Similar to NocoBase's data source manager.
                        </p>
                    </div>
                    <button
                        id="add-data-source-btn"
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-white font-medium shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.02] transition-all duration-200"
                    >
                        <Plus className="w-5 h-5" />
                        Add Data Source
                    </button>
                </div>
            </div>
        </div>
    );

    // ── Render: Data Source Cards ───────────────────────────────────────

    const renderCards = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                </div>
            );
        }

        if (dataSources.length === 0) {
            return (
                <div className="text-center py-20">
                    <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-foreground mb-2">No Data Sources Yet</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                        Connect to a local MongoDB instance to browse data and use it in your automation workflows.
                    </p>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-white font-medium shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        Add Your First Data Source
                    </button>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {dataSources.map((ds) => {
                    const status = statusConfig[ds.status] || statusConfig.untested;
                    const isSelected = selectedDs?.id === ds.id;

                    return (
                        <div
                            key={ds.id}
                            id={`ds-card-${ds.id}`}
                            className={`group relative rounded-2xl border transition-all duration-300 cursor-pointer ${isSelected
                                    ? 'border-cyan-500/40 bg-cyan-500/[0.06] shadow-lg shadow-cyan-500/10'
                                    : 'border-border bg-muted/40 hover:bg-muted/50 hover:border-border hover:shadow-xl hover:shadow-black/20'
                                }`}
                            onClick={() => openDetail(ds)}
                        >
                            {/* Gradient glow */}
                            <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 opacity-0 group-hover:opacity-10 transition-opacity duration-300 blur-sm" />

                            <div className="relative p-6">
                                {/* Top row */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg" style={{ boxShadow: '0 8px 24px rgba(6, 182, 212, 0.15)' }}>
                                        <Database className="w-7 h-7" />
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                                        {status.icon} {status.label}
                                    </span>
                                </div>

                                {/* Name */}
                                <h3 className="text-lg font-semibold text-foreground mb-1">{ds.name}</h3>
                                <p className="text-sm text-muted-foreground mb-1 truncate font-mono">{ds.connectionString.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}</p>
                                {ds.defaultDatabase && (
                                    <p className="text-xs text-muted-foreground mb-4">Database: {ds.defaultDatabase}</p>
                                )}

                                {/* Tags */}
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/40 text-foreground border border-border">
                                        MongoDB
                                    </span>
                                    {ds.lastTestedAt && (
                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/40 text-muted-foreground border border-border">
                                            Tested {new Date(ds.lastTestedAt).toLocaleString()}
                                        </span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        onClick={() => handleTest(ds.id)}
                                        disabled={testingId === ds.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/40 hover:bg-muted text-foreground hover:text-foreground border border-border hover:border-border transition-all disabled:opacity-50"
                                    >
                                        {testingId === ds.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                        Test
                                    </button>
                                    <button
                                        onClick={() => openEditModal(ds)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/40 hover:bg-muted text-foreground hover:text-foreground border border-border hover:border-border transition-all"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(ds.id)}
                                        disabled={deletingId === ds.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/40 hover:bg-red-500/20 text-foreground hover:text-red-400 border border-border hover:border-red-500/20 transition-all disabled:opacity-50"
                                    >
                                        {deletingId === ds.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ── Render: Detail Panel (Collections + Documents) ──────────────────

    const renderDetailPanel = () => {
        if (!selectedDs) return null;

        return (
            <div className="mt-8 rounded-2xl border border-border bg-muted/30 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                        {selectedCollection ? (
                            <button
                                onClick={() => { setSelectedCollection(null); setDocuments(null); }}
                                className="flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>
                        ) : (
                            <Layers className="w-5 h-5 text-cyan-400" />
                        )}
                        <h3 className="text-lg font-semibold text-foreground">
                            {selectedCollection
                                ? <><span className="text-muted-foreground">{selectedDb || selectedDs.defaultDatabase || 'test'}</span> / {selectedCollection}</>
                                : <>Collections — <span className="text-cyan-400">{selectedDs.name}</span></>
                            }
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Database selector */}
                        {databases.length > 0 && !selectedCollection && (
                            <select
                                value={selectedDb}
                                onChange={(e) => switchDatabase(e.target.value)}
                                className="px-3 py-1.5 rounded-lg text-sm bg-muted/40 border border-border text-foreground focus:outline-none focus:border-cyan-500/50"
                            >
                                {databases.map(db => (
                                    <option key={db} value={db} className="bg-slate-900">{db}</option>
                                ))}
                            </select>
                        )}
                        <button
                            onClick={() => setSelectedDs(null)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {selectedCollection ? renderDocumentViewer() : renderCollectionList()}
                </div>
            </div>
        );
    };

    const renderCollectionList = () => {
        if (collectionsLoading) {
            return (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                    <span className="ml-3 text-muted-foreground">Loading collections…</span>
                </div>
            );
        }

        if (collections.length === 0) {
            return (
                <div className="text-center py-12 text-muted-foreground">
                    <Table2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No collections found in this database.</p>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {collections.map((col) => (
                    <button
                        key={col.name}
                        onClick={() => openCollectionData(col.name)}
                        className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted hover:border-white/15 transition-all group text-left"
                    >
                        <div className="flex items-center gap-3">
                            <Table2 className="w-5 h-5 text-cyan-400/70" />
                            <div>
                                <p className="font-medium text-foreground text-sm">{col.name}</p>
                                <p className="text-xs text-muted-foreground">{col.documentCount.toLocaleString()} docs</p>
                            </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                    </button>
                ))}
            </div>
        );
    };

    const renderDocumentViewer = () => {
        return (
            <div>
                {/* Filter bar */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder='Filter (JSON), e.g. {"age":{"$gt":30}}'
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && selectedCollection) openCollectionData(selectedCollection, 1);
                            }}
                            className="w-full pl-10 pr-4 py-2 rounded-lg text-sm bg-muted/40 border border-border text-foreground placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                        />
                    </div>
                    <button
                        onClick={() => selectedCollection && openCollectionData(selectedCollection, 1)}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-500/20 transition-all"
                    >
                        Apply
                    </button>
                </div>

                {docsLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                        <span className="ml-3 text-muted-foreground">Loading documents…</span>
                    </div>
                ) : documents && documents.data.length > 0 ? (
                    <>
                        {/* Documents table */}
                        <div className="rounded-xl border border-border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted/40">
                                            {getDocumentColumns(documents.data).map((col) => (
                                                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-b border-border">
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {documents.data.map((doc, i) => (
                                            <tr key={i} className="hover:bg-muted/30 transition-colors">
                                                {getDocumentColumns(documents.data).map((col) => (
                                                    <td key={col} className="px-4 py-2.5 text-foreground whitespace-nowrap max-w-[200px] truncate font-mono text-xs">
                                                        {formatCellValue(doc[col])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between mt-4">
                            <p className="text-sm text-muted-foreground">
                                Showing {((documents.page - 1) * documents.limit) + 1}–{Math.min(documents.page * documents.limit, documents.total)} of {documents.total.toLocaleString()}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => selectedCollection && openCollectionData(selectedCollection, docsPage - 1)}
                                    disabled={docsPage <= 1}
                                    className="p-2 rounded-lg bg-muted/40 hover:bg-muted text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-sm text-muted-foreground px-2">
                                    Page {documents.page} of {documents.totalPages}
                                </span>
                                <button
                                    onClick={() => selectedCollection && openCollectionData(selectedCollection, docsPage + 1)}
                                    disabled={docsPage >= documents.totalPages}
                                    className="p-2 rounded-lg bg-muted/40 hover:bg-muted text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No documents found.</p>
                    </div>
                )}
            </div>
        );
    };

    // ── Render: Modal ──────────────────────────────────────────────────

    const renderModal = () => {
        if (!showModal) return null;

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center">
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />

                {/* Panel */}
                <div className="relative w-full max-w-lg rounded-2xl border border-border bg-slate-900 shadow-2xl shadow-black/50">
                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                        <h2 className="text-lg font-semibold text-foreground">
                            {editingDs ? 'Edit Data Source' : 'Add Data Source'}
                        </h2>
                        <button
                            onClick={() => setShowModal(false)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Form */}
                    <div className="p-6 space-y-5">
                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                            <input
                                id="ds-name-input"
                                type="text"
                                placeholder="e.g. Local MongoDB"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl text-sm bg-muted/40 border border-border text-foreground placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                            />
                        </div>

                        {/* Connection String */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">Connection String</label>
                            <input
                                id="ds-connection-input"
                                type="text"
                                placeholder="mongodb://localhost:27017"
                                value={formConnStr}
                                onChange={(e) => setFormConnStr(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl text-sm bg-muted/40 border border-border text-foreground placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors"
                            />
                        </div>

                        {/* Default Database */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">Default Database <span className="text-muted-foreground">(optional)</span></label>
                            <input
                                id="ds-database-input"
                                type="text"
                                placeholder="e.g. flyn_workflow_demo"
                                value={formDb}
                                onChange={(e) => setFormDb(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl text-sm bg-muted/40 border border-border text-foreground placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500/50 transition-colors"
                            />
                        </div>

                        {/* Test button */}
                        <button
                            id="ds-test-btn"
                            onClick={handleFormTest}
                            disabled={formTesting || !formConnStr.trim()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-muted/40 hover:bg-muted text-foreground hover:text-foreground border border-border hover:border-border transition-all disabled:opacity-50"
                        >
                            {formTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Test Connection
                        </button>

                        {/* Test result */}
                        {formTestResult && (
                            <div className={`flex items-start gap-3 p-4 rounded-xl border ${formTestResult.success
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                                }`}>
                                {formTestResult.success ? <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" /> : <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />}
                                <div>
                                    <p className="text-sm font-medium">{formTestResult.success ? 'Connection successful!' : 'Connection failed'}</p>
                                    {formTestResult.error && <p className="text-xs mt-1 opacity-80">{formTestResult.error}</p>}
                                    {formTestResult.databases && (
                                        <p className="text-xs mt-1 opacity-80">
                                            {formTestResult.databases.length} database(s): {formTestResult.databases.slice(0, 5).join(', ')}
                                            {formTestResult.databases.length > 5 && ` +${formTestResult.databases.length - 5} more`}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                        <button
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            id="ds-save-btn"
                            onClick={handleSave}
                            disabled={formSaving || !formName.trim() || !formConnStr.trim()}
                            className="px-5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {formSaving ? <Loader2 className="w-4 h-4 animate-spin mx-6" /> : editingDs ? 'Update' : 'Create'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ── Main Render ────────────────────────────────────────────────────

    return (
        <AppLayout>
            <div className="flex-1 overflow-auto">
                {renderHeader()}
                <div className="px-8 pb-10">
                    {renderCards()}
                    {renderDetailPanel()}
                </div>
            </div>
            {renderModal()}
        </AppLayout>
    );
};

// ============================================================================
// UTILITIES
// ============================================================================

function getDocumentColumns(docs: Record<string, unknown>[]): string[] {
    const columnSet = new Set<string>();
    // Gather keys from first 20 documents
    for (const doc of docs.slice(0, 20)) {
        for (const key of Object.keys(doc)) {
            columnSet.add(key);
        }
    }
    // Put _id first if present
    const cols = Array.from(columnSet);
    const idIdx = cols.indexOf('_id');
    if (idIdx > 0) {
        cols.splice(idIdx, 1);
        cols.unshift('_id');
    }
    return cols.slice(0, 12); // Limit columns to prevent horizontal overflow
}

function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') {
        try {
            const s = JSON.stringify(value);
            return s.length > 50 ? s.substring(0, 47) + '…' : s;
        } catch {
            return String(value);
        }
    }
    const s = String(value);
    return s.length > 50 ? s.substring(0, 47) + '…' : s;
}

export default DataSources;
