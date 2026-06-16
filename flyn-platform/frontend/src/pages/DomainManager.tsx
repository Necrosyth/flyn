import { useState, useEffect } from "react";
import { withPlanGate } from "@/components/PlanGate";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Globe, Search, Plus, Loader2, Check, X, RefreshCw,
  ShieldCheck, Settings, Trash2, ExternalLink, Info,
  Copy, CheckCircle2, AlertCircle, Clock
} from "lucide-react";
import {
  checkDomainAvailability,
  searchDomains,
  registerDomain,
  createDomainCheckout,
  listDomains,
  listCustomHostnames,
  addCustomHostname,
  deleteCustomHostname,
  getCustomHostnameStatus,
  getDnsRecords,
  addDnsRecord,
  deleteDnsRecord,
  linkWebsiteToDomain,
  type DomainAvailability,
  type RegisteredDomain,
  type CustomHostname,
  type DnsRecord,
} from "@/services/domainApi";
import { websiteBuilderApi, type SavedWebsite } from "@/services/websiteBuilderApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-500/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  expired: "bg-destructive/10 text-destructive border-destructive/20",
  transferring: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

const sslStatusIcon = (status: string) => {
  if (status === "active") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "expired") return <AlertCircle className="w-4 h-4 text-destructive" />;
  return <Clock className="w-4 h-4 text-amber-500 animate-pulse" />;
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function WebsiteLinkSelector({
  currentWebsiteId,
  onLink,
  websites
}: {
  currentWebsiteId?: string;
  onLink: (websiteId: string | null) => void;
  websites: SavedWebsite[];
}) {
  const [showLinkDetails, setShowLinkDetails] = useState(false);
  const currentWebsite = websites.find(w => w.id === currentWebsiteId);

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          className="text-xs bg-secondary/50 border border-border rounded px-2 py-1 outline-none max-w-[150px] truncate"
          value={currentWebsiteId || ""}
          onChange={(e) => onLink(e.target.value || null)}
        >
          <option value="">No website linked</option>
          {websites.map(w => (
            <option key={w.id} value={w.id}>{w.businessName}</option>
          ))}
        </select>
        {currentWebsite && (
          <button
            onClick={() => setShowLinkDetails(true)}
            className="hover:opacity-80 transition-opacity"
          >
            <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20 cursor-pointer">
              Linked
            </Badge>
          </button>
        )}
      </div>

      {currentWebsite && (
        <Dialog open={showLinkDetails} onOpenChange={setShowLinkDetails}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Website Link Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-3 text-sm font-mono">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Website:</span>
                  <span className="font-semibold">{currentWebsite.businessName}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Website ID:</span>
                  <span className="font-semibold truncate">{currentWebsiteId}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Has HTML:</span>
                  <span className={currentWebsite.html ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                    {currentWebsite.html ? 'Yes' : 'No ⚠️'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Published:</span>
                  <span className={currentWebsite.publishedAt ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                    {currentWebsite.publishedAt ? 'Yes' : 'No ⚠️'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span className="text-xs">{new Date(currentWebsite.updatedAt).toLocaleString()}</span>
                </div>
              </div>

              {!currentWebsite.html && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-700 dark:text-amber-300">
                  ⚠️ <strong>No HTML content found.</strong> Make sure the website is published before accessing the domain.
                </div>
              )}

              {currentWebsite.html && !currentWebsite.publishedAt && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-700 dark:text-amber-300">
                  ⚠️ <strong>Website not marked as published.</strong> Publish the website to serve it on the domain.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── Domain Search Tab ─────────────────────────────────────────────────────────

function DomainSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DomainAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [confirmDomain, setConfirmDomain] = useState<DomainAvailability | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await searchDomains(query.trim());
      setResults(data);
    } catch (error: any) {
      toast({ 
        title: "Search failed", 
        description: "Server API is unavailable right now", 
        variant: "destructive" 
      });
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (domain: DomainAvailability) => {
    setRegistering(domain.domain);
    try {
      const { paymentUrl } = await createDomainCheckout({
        domain: domain.domain,
        price: domain.price,
        currency: domain.currency,
      });
      window.location.href = paymentUrl;
    } catch (error: any) {
      toast({ 
        title: "Checkout failed", 
        description: "Could not initiate payment. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setRegistering(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Find a Domain
          </CardTitle>
          <CardDescription>Search for your perfect domain name. Powered by Flyn.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="yourbusiness.com"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={loading} className="flyn-button-gradient">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              {!loading && "Search"}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="mt-6 space-y-2">
              {results.map(r => (
                <div
                  key={r.domain}
                  className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r.available ? "bg-green-500/10" : "bg-muted"}`}>
                      {r.available
                        ? <Check className="w-4 h-4 text-green-500" />
                        : <X className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className={`font-medium ${!r.available && "line-through text-muted-foreground"}`}>{r.domain}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.available ? (r.premium ? "Premium domain" : "Available") : "Taken"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.available && (
                      <>
                        <span className="font-semibold">${r.price}<span className="text-xs text-muted-foreground">/yr</span></span>
                        <Button size="sm" className="flyn-button-gradient" onClick={() => setConfirmDomain(r)}>
                          Register
                        </Button>
                      </>
                    )}
                    {!r.available && (
                      <Badge variant="secondary">Taken</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!confirmDomain} onOpenChange={() => setConfirmDomain(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register {confirmDomain?.domain}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Domain</span>
                <span className="font-medium">{confirmDomain?.domain}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Registration period</span>
                <span className="font-medium">1 year</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Auto-renewal</span>
                <span className="font-medium">Enabled</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>${confirmDomain?.price} {confirmDomain?.currency}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDomain(null)}>Cancel</Button>
              <Button
                className="flex-1 flyn-button-gradient"
                disabled={!!registering}
                onClick={() => confirmDomain && handleRegister(confirmDomain)}
              >
                {registering ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm & Register
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── My Domains Tab ────────────────────────────────────────────────────────────

function MyDomains() {
  const [domains, setDomains] = useState<RegisteredDomain[]>([]);
  const [websites, setWebsites] = useState<SavedWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dnsTarget, setDnsTarget] = useState<RegisteredDomain | null>(null);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [newRecord, setNewRecord] = useState<{
    type: DnsRecord["type"];
    host: string;
    value: string;
    ttl: number;
  }>({ type: "A", host: "@", value: "", ttl: 300 });
  const [addingRecord, setAddingRecord] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [dData, wData] = await Promise.all([
        listDomains(),
        websiteBuilderApi.listWebsites()
      ]);
      setDomains(dData);
      setWebsites(wData.websites);
    } catch (error: any) {
      toast({ title: "Failed to load", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkWebsite = async (domainId: string, websiteId: string | null, domainType: 'registered' | 'custom' = 'registered') => {
    try {
      await linkWebsiteToDomain({ type: domainType, id: domainId, websiteId });
      if (domainType === 'registered') {
        setDomains(prev => prev.map(d => d.id === domainId ? { ...d, websiteId: websiteId || undefined } : d));
      } else {
        setHostnames(prev => prev.map(h => h.id === domainId ? { ...h, websiteId: websiteId || undefined } : h));
      }
      // Refresh websites list to get latest publishedAt status
      const wData = await websiteBuilderApi.listWebsites();
      setWebsites(wData.websites);
      toast({ title: websiteId ? "Website linked" : "Website unlinked" });
    } catch {
      toast({ title: "Failed to update link", variant: "destructive" });
    }
  };

  useEffect(() => { load(); }, []);

  const openDns = async (domain: RegisteredDomain) => {
    setDnsTarget(domain);
    setDnsLoading(true);
    try {
      const records = await getDnsRecords(domain.domain);
      setDnsRecords(records);
    } catch (error: any) {
      toast({ title: "Failed to load DNS records", variant: "destructive" });
    } finally {
      setDnsLoading(false);
    }
  };

  const handleAddRecord = async () => {
    if (!dnsTarget) return;
    setAddingRecord(true);
    try {
      const created = await addDnsRecord(dnsTarget.domain, newRecord);
      setDnsRecords(prev => [...prev, created]);
      setNewRecord({ type: "A", host: "@", value: "", ttl: 300 });
      toast({ title: "DNS record added" });
    } catch {
      toast({ title: "Failed to add record", variant: "destructive" });
    } finally {
      setAddingRecord(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!dnsTarget) return;
    try {
      await deleteDnsRecord(dnsTarget.domain, id);
      setDnsRecords(prev => prev.filter(r => r.id !== id));
      toast({ title: "Record deleted" });
    } catch {
      toast({ title: "Failed to delete record", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                My Domains
              </CardTitle>
              <CardDescription>Domains registered through Flyn</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No domains yet. Search for one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map(d => (
                <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{d.domain}</p>
                      <p className="text-xs text-muted-foreground">Expires {new Date(d.expiresAt).toLocaleDateString()}</p>
                      <div className="mt-2">
                        <WebsiteLinkSelector 
                          currentWebsiteId={d.websiteId} 
                          websites={websites}
                          onLink={(wId) => handleLinkWebsite(d.id, wId)} 
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColor[d.status] ?? ""}>{d.status}</Badge>
                    <Button variant="outline" size="sm" onClick={() => openDns(d)}>
                      <Settings className="w-4 h-4 mr-1" />
                      DNS
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dnsTarget} onOpenChange={() => setDnsTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>DNS Records — {dnsTarget?.domain}</DialogTitle>
          </DialogHeader>
          {dnsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">Type</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">Host</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">Value</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase">TTL</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {dnsRecords.map(r => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-3"><Badge variant="outline">{r.type}</Badge></td>
                        <td className="p-3 font-mono text-xs">{r.host}</td>
                        <td className="p-3 font-mono text-xs truncate max-w-[200px]">{r.value}</td>
                        <td className="p-3 text-muted-foreground">{r.ttl}s</td>
                        <td className="p-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteRecord(r.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-medium">Add Record</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <select
                    className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                    value={newRecord.type}
                    onChange={e => setNewRecord(p => ({ ...p, type: e.target.value as DnsRecord["type"] }))}
                  >
                    {["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map(t => <option key={t}>{t}</option>)}
                  </select>
                  <Input placeholder="Host (@)" value={newRecord.host} onChange={e => setNewRecord(p => ({ ...p, host: e.target.value }))} />
                  <Input placeholder="Value / IP" value={newRecord.value} onChange={e => setNewRecord(p => ({ ...p, value: e.target.value }))} />
                  <Input type="number" placeholder="TTL" value={newRecord.ttl} onChange={e => setNewRecord(p => ({ ...p, ttl: parseInt(e.target.value) || 300 }))} />
                </div>
                <Button size="sm" onClick={handleAddRecord} disabled={addingRecord || !newRecord.value}>
                  {addingRecord ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Record
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Custom Domain Tab ─────────────────────────────────────────────────────────

function CustomDomains() {
  const [hostnames, setHostnames] = useState<CustomHostname[]>([]);
  const [websites, setWebsites] = useState<SavedWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHostname, setNewHostname] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedHostname, setSelectedHostname] = useState<CustomHostname | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);

  const CNAME_TARGET = "customers.myflynai.com";

  const load = async () => {
    setLoading(true);
    try {
      const [hData, wData] = await Promise.all([
        listCustomHostnames(),
        websiteBuilderApi.listWebsites()
      ]);
      setHostnames(hData);
      setWebsites(wData.websites);
    } catch {
      setHostnames([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkWebsite = async (id: string, websiteId: string | null) => {
    try {
      await linkWebsiteToDomain({ type: 'custom', id, websiteId });
      setHostnames(prev => prev.map(h => h.id === id ? { ...h, websiteId: websiteId || undefined } : h));
      // Refresh websites list to get latest publishedAt status
      const wData = await websiteBuilderApi.listWebsites();
      setWebsites(wData.websites);
      toast({ title: websiteId ? "Website linked" : "Website unlinked" });
    } catch {
      toast({ title: "Failed to update link", variant: "destructive" });
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newHostname.trim()) return;
    setAdding(true);
    try {
      const hostname = await addCustomHostname(newHostname.trim());
      setHostnames(prev => [...prev, hostname]);
      setSelectedHostname(hostname);
      setNewHostname("");
      toast({ title: "Custom domain added" });
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to add domain";
      toast({ title: "Failed to add domain", description: errorMessage, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleCheckStatus = async (h: CustomHostname) => {
    setCheckingStatus(h.id);
    try {
      const updated = await getCustomHostnameStatus(h.id);
      setHostnames(prev => prev.map(x => x.id === h.id ? updated : x));
      toast({ title: updated.status === "active" ? "Domain is active!" : "Pending verification" });
    } catch {
      toast({ title: "Could not check status", variant: "destructive" });
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCustomHostname(id);
      setHostnames(prev => prev.filter(h => h.id !== id));
      if (selectedHostname?.id === id) setSelectedHostname(null);
      toast({ title: "Custom domain removed" });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Connect Your Domain
          </CardTitle>
          <CardDescription>
            Let your clients use their own domain — powered by Flyn with automatic SSL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-semibold">How it works</p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Enter the custom domain below</li>
              <li>Add a <code className="bg-muted px-1 rounded text-xs">CNAME</code> record pointing to <span className="font-mono text-primary text-xs">{CNAME_TARGET}</span></li>
              <li>SSL is provisioned automatically by Flyn</li>
            </ol>
          </div>
          <div className="flex gap-3">
            <Input placeholder="yourdomain.com" value={newHostname} onChange={e => setNewHostname(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <Button onClick={handleAdd} disabled={adding || !newHostname.trim()} className="flyn-button-gradient">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {!adding && "Connect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Connected Domains</CardTitle>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : hostnames.length === 0 ? (
            <div className="text-center py-10">
              <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No custom domains connected yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hostnames.map(h => (
                <div key={h.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedHostname(h)}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {sslStatusIcon(h.ssl.status)}
                      <div className="text-xs font-medium">
                        SSL: <span className={h.ssl.status === 'active' ? 'text-green-600' : 'text-amber-600'}>{h.ssl.status === 'active' ? 'active' : 'pending'}</span>
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">{h.hostname}</p>
                      <div className="mt-1" onClick={e => e.stopPropagation()}>
                        <WebsiteLinkSelector currentWebsiteId={h.websiteId} websites={websites} onLink={(wId) => handleLinkWebsite(h.id, wId, 'custom')} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Badge variant="outline" className={statusColor[h.status] ?? ""}>{h.status}</Badge>
                    <Button variant="outline" size="sm" disabled={checkingStatus === h.id} onClick={() => handleCheckStatus(h)}>
                      {checkingStatus === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(h.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedHostname} onOpenChange={() => setSelectedHostname(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>DNS Setup — {selectedHostname?.hostname}</DialogTitle>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-sm text-muted-foreground">SSL Status:</span>
              <div className="flex items-center gap-2">
                {sslStatusIcon(selectedHostname?.ssl?.status || 'pending_validation')}
                <span className="text-sm font-medium">{selectedHostname?.ssl?.status === 'active' ? 'Active' : 'Pending Validation'}</span>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Add the following CNAME record at your domain registrar.</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3 font-mono text-sm">
              <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground uppercase"><span>Type</span><span>Host</span><span>Value</span></div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span>CNAME</span>
                <span className="flex items-center">{selectedHostname?.hostname.split(".").slice(0, -2).join(".") || "@"}<CopyButton value={selectedHostname?.hostname.split(".").slice(0, -2).join(".") || "@"} /></span>
                <span className="flex items-center">{CNAME_TARGET}<CopyButton value={CNAME_TARGET} /></span>
              </div>
            </div>
            {selectedHostname?.verificationRecords && selectedHostname.verificationRecords.length > 0 && (
              <>
                <p className="text-sm font-medium">Required DNS Records</p>
                {selectedHostname.verificationRecords.map((v, i) => {
                  const isCname = v.type === 'CNAME';
                  const isTxt = v.type === 'TXT';
                  const isAcme = isTxt && v.name?.includes('_acme-challenge');
                  const isDcvCname = isCname && v.name?.includes('_acme-challenge');

                  let label = '';
                  if (i === 0) label = '1. Initial Setup (Required)';
                  else if (isAcme) label = `2. SSL Validation - Record ${selectedHostname.verificationRecords.filter(r => r.type === 'TXT' && r.name?.includes('_acme-challenge')).indexOf(v) + 1}`;
                  else if (isDcvCname) label = '3. SSL Validation (Alternative - Faster)';

                  return (
                    <div key={i}>
                      {label && <p className="text-xs font-semibold text-muted-foreground uppercase mt-2">{label}</p>}
                      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 font-mono text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{v.type}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="flex items-center">{v.name}<CopyButton value={v.name} /></span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span className="flex items-center truncate max-w-[200px]">{v.value}<CopyButton value={v.value} /></span></div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground mt-3">
                  <strong>Steps:</strong> Add record #1 first (CNAME). Then add either all of #2 (TXT records) OR #3 (CNAME delegation) for SSL validation. Using #3 CNAME delegation is faster.
                </p>
              </>
            )}
            {selectedHostname?.ssl?.validationErrors && selectedHostname.ssl.validationErrors.length > 0 && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">SSL Validation Errors</p>
                {selectedHostname.ssl.validationErrors.map((err, i) => (
                  <div key={i} className="text-xs text-red-600 dark:text-red-400">
                    {err.message || JSON.stringify(err)}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedHostname(null)}>Close</Button>
              <Button className="flex-1 flyn-button-gradient" disabled={!selectedHostname || checkingStatus === selectedHostname?.id} onClick={() => selectedHostname && handleCheckStatus(selectedHostname)}>
                {checkingStatus === selectedHostname?.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Check Status
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DomainManager() {
  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Globe className="w-5 h-5 text-primary" /></div>
          <div><h1 className="text-xl font-bold">Domain Manager</h1><p className="text-sm text-muted-foreground">Search, register, and manage domains for your business</p></div>
        </div>
        <Tabs defaultValue="search" className="space-y-6">
          <TabsList><TabsTrigger value="search">Find a Domain</TabsTrigger><TabsTrigger value="mydomains">My Domains</TabsTrigger><TabsTrigger value="custom">Connect Domain</TabsTrigger></TabsList>
          <TabsContent value="search"><DomainSearch /></TabsContent>
          <TabsContent value="mydomains"><MyDomains /></TabsContent>
          <TabsContent value="custom"><CustomDomains /></TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}

export default withPlanGate("branding.custom_domain")(DomainManager);
