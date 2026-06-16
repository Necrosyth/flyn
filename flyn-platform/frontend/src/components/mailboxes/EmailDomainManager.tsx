/**
 * EmailDomainManager — "Your Domains": add a domain, publish the TXT record we show, click Verify
 * (a real DNS lookup on the backend), and watch the badge flip Pending → Verified. Only verified
 * domains can host mailboxes (enforced backend-side). Lives in White Label ▸ Email, above Team
 * Mailboxes. Mirrors the app-domains "show DNS record → verify" UX.
 *
 * onDomainsChange lets the parent (MailboxManager) refresh its verified-domain dropdown.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Globe, Plus, Loader2, Trash2, Check, Copy, ShieldCheck, Clock, Send } from "lucide-react";
import { emailDomainsService, type TenantEmailDomain, type DomainVerifyRecord, type DomainDnsRecord } from "@/services/emailDomains";

export function EmailDomainManager({ onDomainsChange }: { onDomainsChange?: () => void }) {
  const { toast } = useToast();
  const [domains, setDomains] = useState<TenantEmailDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, DomainVerifyRecord>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [sendingBusy, setSendingBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setDomains(await emailDomainsService.list()); }
    catch (err) { toast({ title: "Couldn't load domains", description: err instanceof Error ? err.message : "", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const d = input.trim().toLowerCase();
    if (!d) return;
    setAdding(true);
    try {
      const { domain, record } = await emailDomainsService.add(d);
      setDomains((prev) => prev.some((x) => x.id === domain.id) ? prev : [...prev, domain].sort((a, b) => a.domain.localeCompare(b.domain)));
      setRecords((prev) => ({ ...prev, [domain.id]: record }));
      setInput("");
      onDomainsChange?.();
    } catch (err) {
      toast({ title: "Couldn't add domain", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally { setAdding(false); }
  };

  const handleVerify = async (d: TenantEmailDomain) => {
    setVerifying(d.id);
    try {
      const res = await emailDomainsService.verify(d.id);
      setDomains((prev) => prev.map((x) => (x.id === d.id ? res.domain : x)));
      if (res.verified) {
        toast({ title: "Domain verified ✓", description: `${d.domain} is verified. You can now create mailboxes on it.` });
        onDomainsChange?.();
      } else {
        toast({ title: "Not verified yet", description: res.reason || "TXT record not found yet.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Verify failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally { setVerifying(null); }
  };

  const handleStartSending = async (d: TenantEmailDomain) => {
    setSendingBusy(d.id);
    try {
      const res = await emailDomainsService.authenticateSending(d.id);
      setDomains((prev) => prev.map((x) => (x.id === d.id ? res.domain : x)));
      toast({ title: "Sending setup started", description: `Add the DNS records shown for ${d.domain}, then click Verify sending.` });
    } catch (err) {
      toast({ title: "Couldn't start sending setup", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally { setSendingBusy(null); }
  };

  const handleVerifySending = async (d: TenantEmailDomain) => {
    setSendingBusy(d.id);
    try {
      const res = await emailDomainsService.verifySending(d.id);
      setDomains((prev) => prev.map((x) => (x.id === d.id ? res.domain : x)));
      if (res.authenticated) {
        const n = res.activated.activated;
        toast({ title: "Sending verified ✓", description: `${d.domain} can now send.${n ? ` Activated ${n} mailbox${n === 1 ? "" : "es"}.` : ""}` });
        onDomainsChange?.();
      } else {
        toast({ title: "Not authenticated yet", description: res.reason || "DNS records not all live yet.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Verify sending failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally { setSendingBusy(null); }
  };

  const handleDelete = async (d: TenantEmailDomain) => {
    if (!confirm(`Remove ${d.domain}? Mailboxes on it will no longer be creatable.`)) return;
    try { await emailDomainsService.remove(d.id); setDomains((prev) => prev.filter((x) => x.id !== d.id)); onDomainsChange?.(); }
    catch (err) { toast({ title: "Couldn't remove", description: err instanceof Error ? err.message : "", variant: "destructive" }); }
  };

  const copy = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Globe className="w-4 h-4 text-primary" /> Your Domains</CardTitle>
        <CardDescription>
          Add a domain you own and verify it with a DNS TXT record. You can only create mailboxes on
          a verified domain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} placeholder="yourcompany.com" className="flex-1" />
          <Button onClick={handleAdd} disabled={adding || !input.trim()}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : domains.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No domains yet. Add one to start.</p>
        ) : (
          <div className="space-y-2">
            {domains.map((d) => {
              const rec = records[d.id];
              const isVerified = d.status === "verified";
              return (
                <div key={d.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium flex-1 truncate">{d.domain}</span>
                    {isVerified ? (
                      <Badge variant="secondary" className="text-[10px] gap-1"><ShieldCheck className="w-2.5 h-2.5" /> Verified</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1"><Clock className="w-2.5 h-2.5" /> Pending</Badge>
                    )}
                    {isVerified && d.sendingStatus === "verified" && (
                      <Badge className="text-[10px] gap-1 bg-green-600 hover:bg-green-600"><Send className="w-2.5 h-2.5" /> Sending ready</Badge>
                    )}
                    {isVerified && d.sendingStatus === "pending" && (
                      <Badge variant="outline" className="text-[10px] gap-1"><Send className="w-2.5 h-2.5" /> Sending pending</Badge>
                    )}
                    {!isVerified && (
                      <Button variant="outline" size="sm" onClick={() => handleVerify(d)} disabled={verifying === d.id}>
                        {verifying === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify"}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(d)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {!isVerified && rec && (
                    <div className="rounded-md bg-muted/40 p-2.5 text-xs space-y-1.5">
                      <p className="text-muted-foreground">Add this DNS record at your domain, then click Verify:</p>
                      <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 font-mono text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-background border">TXT</span>
                        <span className="text-muted-foreground">{rec.host}</span>
                        <span className="truncate" title={rec.value}>{rec.value}</span>
                        <button type="button" onClick={() => copy(d.id, rec.value)} className="text-muted-foreground hover:text-foreground">
                          {copied === d.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                  {!isVerified && !rec && (
                    <p className="text-[11px] text-muted-foreground">Re-add the domain to see its TXT record, or click Verify if you've already added it.</p>
                  )}

                  {/* Sending authentication (DKIM) — only after ownership is verified. */}
                  {isVerified && d.sendingStatus === "none" && (
                    <div className="flex items-center justify-between rounded-md bg-muted/40 p-2.5 text-xs">
                      <span className="text-muted-foreground">Authenticate this domain to actually send & receive email from its mailboxes.</span>
                      <Button variant="outline" size="sm" onClick={() => handleStartSending(d)} disabled={sendingBusy === d.id}>
                        {sendingBusy === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1" /> Set up sending</>}
                      </Button>
                    </div>
                  )}

                  {isVerified && d.sendingStatus === "pending" && d.sendingRecords && d.sendingRecords.length > 0 && (() => {
                    const dkimRecs = d.sendingRecords.filter((r: DomainDnsRecord) => r.type !== "MX");
                    const mxRecs   = d.sendingRecords.filter((r: DomainDnsRecord) => r.type === "MX");
                    return (
                    <div className="rounded-md bg-muted/40 p-2.5 text-xs space-y-3">
                      {/* DKIM / brevo-code / DMARC — Brevo verifies these */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-muted-foreground font-medium">1. For sending (DKIM) — add these, then Verify:</p>
                          <Button variant="outline" size="sm" onClick={() => handleVerifySending(d)} disabled={sendingBusy === d.id}>
                            {sendingBusy === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify sending"}
                          </Button>
                        </div>
                        {dkimRecs.map((r: DomainDnsRecord) => {
                          const ck = `${d.id}:${r.key}`;
                          return (
                            <div key={r.key} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 font-mono text-[11px]">
                              <span className="px-1.5 py-0.5 rounded bg-background border">{r.type}</span>
                              <span className="text-muted-foreground truncate" title={r.host}>{r.host}</span>
                              <span className="truncate" title={r.value}>{r.value}</span>
                              <button type="button" onClick={() => copy(ck, r.value)} className="text-muted-foreground hover:text-foreground">
                                {copied === ck ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {/* MX records for mail.<domain> — for receiving replies via Brevo inbound */}
                      {mxRecs.length > 0 && (
                        <div className="space-y-1.5 border-t border-border/40 pt-2">
                          <p className="text-muted-foreground font-medium">2. For receiving replies — add to <span className="font-mono">mail.{d.domain}</span>:</p>
                          <p className="text-muted-foreground text-[10px]">These let reply emails reach Flyn. Your existing apex email (Gmail/Outlook) is untouched.</p>
                          {mxRecs.map((r: DomainDnsRecord) => {
                            const ck = `${d.id}:${r.key}`;
                            return (
                              <div key={r.key} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 font-mono text-[11px]">
                                <span className="px-1.5 py-0.5 rounded bg-background border">{r.type}</span>
                                <span className="text-muted-foreground truncate" title={r.host}>{r.host}</span>
                                <span className="truncate" title={r.value}>{r.value}</span>
                                <button type="button" onClick={() => copy(ck, r.value)} className="text-muted-foreground hover:text-foreground">
                                  {copied === ck ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* keep old verified sending records display (sendingStatus verified) */}
                  {isVerified && d.sendingStatus === "verified" && d.sendingRecords && d.sendingRecords.length > 0 && (() => {
                    const mxRecs = d.sendingRecords.filter((r: DomainDnsRecord) => r.type === "MX");
                    if (!mxRecs.length) return null;
                    return (
                    <div className="rounded-md bg-muted/40 p-2.5 text-xs space-y-1.5 border-t border-border/40 mt-1">
                      <p className="text-muted-foreground font-medium">Reply routing — <span className="font-mono">mail.{d.domain}</span> MX:</p>
                      {mxRecs.map((r: DomainDnsRecord) => {
                        const ck = `${d.id}:${r.key}`;
                        return (
                          <div key={r.key} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 font-mono text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-background border">{r.type}</span>
                            <span className="text-muted-foreground truncate" title={r.host}>{r.host}</span>
                            <span className="truncate" title={r.value}>{r.value}</span>
                            <button type="button" onClick={() => copy(ck, r.value)} className="text-muted-foreground hover:text-foreground">
                              {copied === ck ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
