import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  Globe, Layout, Database, RefreshCw, Plus, Trash2, Edit3, 
  ExternalLink, Settings, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, ArrowRight, Sparkles, FileText, Image as ImageIcon
} from 'lucide-react';
import { websiteBuilderApi, type SavedWebsite } from '@/services/websiteBuilderApi';
import { websiteCmsApi, type CmsCollection, type CmsRecord, type CmsField } from '@/services/websiteCmsApi';
import { listDomains, listCustomHostnames } from '@/services/domainApi';
import { withPlanGate } from "@/components/PlanGate";

// ── Components ───────────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: 'text', label: 'Short Text', icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'textarea', label: 'Long Text', icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'image', label: 'Image URL', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { value: 'number', label: 'Number', icon: <span className="text-[10px] font-bold">#</span> },
  { value: 'url', label: 'Link/URL', icon: <ExternalLink className="w-3.5 h-3.5" /> },
];

function WebsiteManager() {
  const [websites, setWebsites] = useState<SavedWebsite[]>([]);
  const [selectedSite, setSelectedSite] = useState<SavedWebsite | null>(null);
  const [collections, setCollections] = useState<CmsCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // CRUD State
  const [isColModalOpen, setIsColModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [activeCollection, setActiveCollection] = useState<CmsCollection | null>(null);
  const [activeRecords, setActiveRecords] = useState<CmsRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { websites: ws } = await websiteBuilderApi.listWebsites();
      setWebsites(ws);
      if (ws.length > 0 && !selectedSite) {
        setSelectedSite(ws[0]);
      }
    } catch (err) {
      toast({ title: "Failed to load websites", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedSite) {
      websiteCmsApi.listCollections(selectedSite.id).then(setCollections);
    }
  }, [selectedSite]);

  const handleSync = async () => {
    if (!selectedSite) return;
    setSyncing(true);
    try {
      const res = await websiteBuilderApi.syncCms(selectedSite.id);
      if (res.success) {
        toast({ title: "Website Synced!", description: "AI has updated your site with latest CMS data." });
        setSelectedSite({ ...selectedSite, html: res.html });
      }
    } catch (err) {
      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const loadRecords = async (col: CmsCollection) => {
    setActiveCollection(col);
    setRecordsLoading(true);
    try {
      const recs = await websiteCmsApi.listRecords(col.id);
      setActiveRecords(recs);
      setIsRecordModalOpen(true);
    } catch {
      toast({ title: "Failed to load records", variant: "destructive" });
    } finally {
      setRecordsLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse font-medium">Loading your digital real estate...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8 pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Layout className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Website Manager</h1>
              <p className="text-muted-foreground">Manage your AI-generated sites and content tables.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select 
              className="bg-background border border-input rounded-xl px-4 py-2 text-sm focus:ring-2 ring-primary/20 outline-none min-w-[200px]"
              value={selectedSite?.id || ""}
              onChange={(e) => setSelectedSite(websites.find(w => w.id === e.target.value) || null)}
            >
              {websites.map(w => <option key={w.id} value={w.id}>{w.businessName}</option>)}
            </select>
            <Button variant="outline" className="rounded-xl" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {!selectedSite ? (
          <Card className="border-dashed border-2 bg-muted/30">
            <CardContent className="flex flex-col items-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No Websites Found</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mb-6">You haven't generated any websites with AI yet.</p>
              <Button asChild className="flyn-button-gradient px-8 py-6 text-lg rounded-2xl font-bold">
                <a href="/website-builder">Launch AI Builder <ArrowRight className="ml-2 w-5 h-5" /></a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Status & Live Link */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="overflow-hidden border-primary/10 shadow-xl shadow-primary/5">
                <CardHeader className="bg-primary/5 pb-6">
                  <div className="flex items-center justify-between">
                    <Badge className={selectedSite.status === 'published' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}>
                      {selectedSite.status.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">ID: {selectedSite.id.split('-')[0]}</span>
                  </div>
                  <CardTitle className="text-xl mt-4">{selectedSite.businessName}</CardTitle>
                  <CardDescription>{selectedSite.industry} · {selectedSite.pageType}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  {selectedSite.publishedUrl ? (
                    <div className="space-y-3">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground">Live URL</Label>
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border border-border group overflow-hidden">
                        <Globe className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs truncate font-mono flex-1">{selectedSite.publishedUrl}</span>
                        <a href={selectedSite.publishedUrl} target="_blank" rel="noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-background rounded-lg">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                       <p className="text-xs text-amber-700">This site is currently in draft mode and not visible to the public.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-4">
                    <Button variant="outline" className="rounded-xl h-12 font-bold text-xs" asChild>
                      <a href="/website-builder">EDIT IN AI BUILDER</a>
                    </Button>
                    <Button className="flyn-button-gradient rounded-xl h-12 font-bold text-xs" disabled={syncing} onClick={handleSync}>
                      {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      {syncing ? 'SYNCING...' : 'SYNC CONTENT'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Stats/Metrics (Mocked for now) */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-widest">Site Metrics</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                   <div className="p-4 rounded-2xl bg-secondary/30 text-center">
                      <p className="text-[10px] text-muted-foreground font-black mb-1 uppercase">Visitors</p>
                      <p className="text-xl font-bold">1.2k</p>
                   </div>
                   <div className="p-4 rounded-2xl bg-secondary/30 text-center">
                      <p className="text-[10px] text-muted-foreground font-black mb-1 uppercase">Tokens</p>
                      <p className="text-xl font-bold">{selectedSite.tokensUsed.toLocaleString()}</p>
                   </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Content Collections */}
            <div className="lg:col-span-2 space-y-6">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Database className="w-5 h-5 text-primary" />
                     <h2 className="text-lg font-bold">Content Collections</h2>
                  </div>
                  <Button onClick={() => setIsColModalOpen(true)} size="sm" className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 rounded-lg">
                    <Plus className="w-4 h-4 mr-2" /> New Table
                  </Button>
               </div>

               {collections.length === 0 ? (
                 <div className="flex flex-col items-center justify-center p-12 rounded-3xl border-2 border-dashed border-border bg-secondary/10">
                    <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4">
                       <Database className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No Collections Yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px] text-center">Create your first content table to start feeding live data to your site.</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {collections.map(col => (
                      <Card key={col.id} className="group hover:border-primary/30 transition-all cursor-pointer overflow-hidden" onClick={() => loadRecords(col)}>
                         <div className="p-5 flex items-start justify-between">
                            <div className="space-y-1">
                               <h3 className="font-bold group-hover:text-primary transition-colors">{col.name}</h3>
                               <p className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter">Linked to Section: #{col.sectionId}</p>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                               <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                            </div>
                         </div>
                         <div className="px-5 pb-5 flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                               <Database className="w-3.5 h-3.5 text-muted-foreground" />
                               <span className="text-xs text-muted-foreground">{col.fields.length} Fields</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                               <Badge variant="secondary" className="text-[10px] py-0">{col.slug}</Badge>
                            </div>
                         </div>
                      </Card>
                    ))}
                 </div>
               )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {/* New Collection Modal */}
      <CreateCollectionModal 
        isOpen={isColModalOpen} 
        onClose={() => setIsColModalOpen(false)} 
        websiteId={selectedSite?.id || ""} 
        onCreated={(col) => {
          setCollections([...collections, col]);
          setIsColModalOpen(false);
          toast({ title: "Collection Created" });
        }}
      />

      {/* Record Manager Modal */}
      <RecordManagerModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        collection={activeCollection}
        records={activeRecords}
        onRefresh={() => activeCollection && loadRecords(activeCollection)}
      />

    </AppLayout>
  );
}

export default withPlanGate("website.builder")(WebsiteManager);

// ── Sub-Components ───────────────────────────────────────────────────────────

function CreateCollectionModal({ isOpen, onClose, websiteId, onCreated }: { 
  isOpen: boolean; onClose: () => void; websiteId: string; onCreated: (c: CmsCollection) => void 
}) {
  const [name, setName] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [fields, setFields] = useState<CmsField[]>([
    { name: 'name', label: 'Title', type: 'text', required: true }
  ]);
  const [loading, setLoading] = useState(false);

  const addField = () => setFields([...fields, { name: '', label: '', type: 'text', required: false }]);
  const removeField = (idx: number) => setFields(fields.filter((_, i) => i !== idx));
  const updateField = (idx: number, data: Partial<CmsField>) => {
    const newFields = [...fields];
    newFields[idx] = { ...newFields[idx], ...data };
    setFields(newFields);
  };

  const handleCreate = async () => {
    if (!name || !sectionId) return;
    setLoading(true);
    try {
      const col = await websiteCmsApi.createCollection({
        websiteId,
        sectionId,
        name,
        slug: name.toLowerCase().replace(/ /g, '-'),
        fields: fields.filter(f => f.name && f.label)
      });
      onCreated(col);
      setName(''); setSectionId(''); setFields([{ name: 'name', label: 'Title', type: 'text', required: true }]);
    } catch (e) {
      toast({ title: "Error creating collection", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Content Table</DialogTitle>
          <DialogDescription>Define the structure for a section of your website.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Collection Name</Label>
              <Input placeholder="e.g. Our Team" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target Section ID</Label>
              <Input placeholder="e.g. team or products" value={sectionId} onChange={e => setSectionId(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">The ID used in your site's HTML &lt;section id="..."&gt;</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold uppercase tracking-widest text-primary">Fields / Schema</Label>
              <Button size="sm" variant="ghost" onClick={addField} className="text-xs"><Plus className="w-3.5 h-3.5 mr-1" /> Add Field</Button>
            </div>
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-secondary/30 border border-border group">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Input placeholder="Label" value={f.label} onChange={e => updateField(i, { label: e.target.value, name: e.target.value.toLowerCase().replace(/ /g, '_') })} />
                  <Input placeholder="Variable Name" value={f.name} onChange={e => updateField(i, { name: e.target.value })} />
                  <select 
                    className="bg-background border border-input rounded-md px-3 text-sm h-10 outline-none"
                    value={f.type}
                    onChange={e => updateField(i, { type: e.target.value as any })}
                  >
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 text-destructive" onClick={() => removeField(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button className="w-full flyn-button-gradient py-6 rounded-2xl font-black" onClick={handleCreate} disabled={loading || !name}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            CREATE CONTENT COLLECTION
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordManagerModal({ isOpen, onClose, collection, records, onRefresh }: { 
  isOpen: boolean; onClose: () => void; collection: CmsCollection | null; records: CmsRecord[]; onRefresh: () => void 
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  if (!collection) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await websiteCmsApi.createRecord(collection.id, formData);
      toast({ title: "Record Saved" });
      setFormData({});
      setIsAdding(false);
      onRefresh();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await websiteCmsApi.deleteRecord(id);
      onRefresh();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle>{collection.name}</DialogTitle>
              <DialogDescription>Manage the entries for this content section.</DialogDescription>
            </div>
            {!isAdding && <Button size="sm" className="flyn-button-gradient" onClick={() => setIsAdding(true)}><Plus className="w-4 h-4 mr-2" /> Add Item</Button>}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pt-6 px-1">
          {isAdding ? (
            <div className="space-y-6 border p-6 rounded-3xl bg-secondary/20">
               <div className="flex items-center justify-between">
                  <h4 className="font-bold">Add New Entry</h4>
                  <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {collection.fields.map(f => (
                    <div key={f.name} className="space-y-2">
                       <Label className="text-xs uppercase font-black text-muted-foreground">{f.label}</Label>
                       {f.type === 'textarea' ? (
                         <textarea 
                           className="w-full bg-background border border-input rounded-xl px-4 py-2 text-sm min-h-[100px] focus:ring-2 ring-primary/20 outline-none"
                           value={formData[f.name] || ''}
                           onChange={e => setFormData({ ...formData, [f.name]: e.target.value })}
                         />
                       ) : (
                         <Input 
                           type={f.type === 'number' ? 'number' : 'text'}
                           className="h-12 rounded-xl"
                           value={formData[f.name] || ''}
                           onChange={e => setFormData({ ...formData, [f.name]: e.target.value })}
                         />
                       )}
                    </div>
                  ))}
               </div>
               <Button className="w-full h-12 flyn-button-gradient rounded-xl font-bold" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                  SAVE TO TABLE
               </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
               <Database className="w-12 h-12 mb-4 opacity-20" />
               <p>No records found in this collection.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden">
               <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 border-b border-border">
                     <tr>
                        {collection.fields.slice(0, 3).map(f => (
                          <th key={f.name} className="px-4 py-3 font-black text-[10px] uppercase tracking-widest text-muted-foreground">{f.label}</th>
                        ))}
                        <th className="px-4 py-3 w-[100px]" />
                     </tr>
                  </thead>
                  <tbody>
                     {records.map(rec => (
                       <tr key={rec.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                          {collection.fields.slice(0, 3).map(f => (
                            <td key={f.name} className="px-4 py-4 max-w-[200px] truncate font-medium">
                               {f.type === 'image' && rec.data[f.name] ? (
                                 <img src={rec.data[f.name]} className="w-8 h-8 rounded-lg object-cover bg-muted" alt="" />
                               ) : String(rec.data[f.name] || '-')}
                            </td>
                          ))}
                          <td className="px-4 py-4 text-right">
                             <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(rec.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                             </div>
                          </td>
                       </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
