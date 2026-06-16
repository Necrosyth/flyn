/**
 * MailboxManager — owner/admin UI to create org-domain mailboxes and link each to a team or
 * specific people (via MailboxLinkDialog). Lives in White Label ▸ Email.
 *
 * Create just needs the address; linking happens after, through the checkbox picker. A mailbox is
 * 'pending' until its domain is authenticated with the email provider (send/receive go live then) —
 * surfaced as a badge so the admin knows it's not sending yet.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Plus, Loader2, Link2, Trash2, Users, Clock, AlertTriangle } from "lucide-react";
import { mailboxesService, type TenantMailbox } from "@/services/mailboxes";
import { emailDomainsService, type TenantEmailDomain } from "@/services/emailDomains";
import { teamService, type TeamMemberRecord } from "@/services/team";
import { MailboxLinkDialog } from "./MailboxLinkDialog";

const LOCALPART_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export function MailboxManager({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const { toast } = useToast();
  const [mailboxes, setMailboxes] = useState<TenantMailbox[]>([]);
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [verifiedDomains, setVerifiedDomains] = useState<TenantEmailDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [localPart, setLocalPart] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [linkTarget, setLinkTarget] = useState<TenantMailbox | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [mb, mem, doms] = await Promise.all([
        mailboxesService.list(),
        teamService.listMembers().catch(() => []),
        emailDomainsService.list().catch(() => []),
      ]);
      setMailboxes(mb);
      setMembers(mem || []);
      const verified = (doms || []).filter((d) => d.status === "verified");
      setVerifiedDomains(verified);
      // keep a sensible default selected
      setSelectedDomain((cur) => (cur && verified.some((d) => d.domain === cur) ? cur : verified[0]?.domain || ""));
    } catch (err) {
      toast({ title: "Couldn't load mailboxes", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [refreshSignal]);

  const nameByUid = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.uid, m.name || m.email.split("@")[0]));
    return map;
  }, [members]);

  const lp = localPart.trim().toLowerCase();
  const localPartValid = !lp || LOCALPART_RE.test(lp);
  const canCreate = verifiedDomains.length > 0 && !!lp && localPartValid && !!selectedDomain;

  const handleCreate = async () => {
    if (!canCreate) return;
    // The domain can ONLY be one of the tenant's verified domains — the UI cannot express a
    // foreign domain, and the backend rejects one regardless. localPart is validated client-side.
    const addr = `${lp}@${selectedDomain}`;
    setCreating(true);
    try {
      const mb = await mailboxesService.create(addr);
      setMailboxes((prev) => [...prev, mb].sort((a, b) => a.address.localeCompare(b.address)));
      setLocalPart("");
      setLinkTarget(mb); // jump straight to the Link picker after creating
      toast({ title: "Mailbox created", description: `Now choose who can use ${mb.address}.` });
    } catch (err) {
      toast({ title: "Couldn't create mailbox", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (mb: TenantMailbox) => {
    if (!confirm(`Delete ${mb.address}? This removes the mailbox and its access links.`)) return;
    try {
      await mailboxesService.remove(mb.id);
      setMailboxes((prev) => prev.filter((m) => m.id !== mb.id));
    } catch (err) {
      toast({ title: "Couldn't delete", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // Orphans = mailboxes on a domain that is NOT currently verified-owned (junk from before the gate).
  const verifiedSet = useMemo(() => new Set(verifiedDomains.map((d) => d.domain)), [verifiedDomains]);
  const orphans = useMemo(() => mailboxes.filter((m) => !verifiedSet.has(m.domain)), [mailboxes, verifiedSet]);

  const handleCleanup = async () => {
    if (!confirm(`Delete ${orphans.length} mailbox(es) on unverified domains? You can recreate them after verifying the domain.`)) return;
    try {
      const res = await mailboxesService.cleanupOrphans();
      setMailboxes((prev) => prev.filter((m) => verifiedSet.has(m.domain)));
      toast({ title: "Cleaned up", description: `Removed ${res.deleted} mailbox(es) on unverified domains.` });
    } catch (err) {
      toast({ title: "Cleanup failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const linkedSummary = (mb: TenantMailbox): string => {
    const parts: string[] = [];
    if (mb.teams.length) parts.push(mb.teams.map((t) => `${t} team`).join(", "));
    if (mb.uids.length) parts.push(mb.uids.map((u) => nameByUid.get(u) || "1 person").join(", "));
    return parts.length ? parts.join(" + ") : "Not linked yet";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="w-4 h-4 text-primary" /> Team Mailboxes
        </CardTitle>
        <CardDescription>
          Create addresses on your domain (e.g. marketing@yourcompany.com) and link each to a team or
          specific people. They get its inbox + outbox once your domain is verified.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create — local-part + a VERIFIED-domain dropdown. A foreign domain isn't expressible. */}
        {verifiedDomains.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Verify a domain first (under <span className="font-medium text-foreground">Your Domains</span> above) to create mailboxes on it.
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="marketing"
                className="flex-1"
              />
              <span className="text-muted-foreground">@</span>
              <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="domain" /></SelectTrigger>
                <SelectContent>
                  {verifiedDomains.map((d) => <SelectItem key={d.id} value={d.domain}>{d.domain}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={handleCreate} disabled={creating || !canCreate}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Create</>}
              </Button>
            </div>
            {!localPartValid && <p className="text-[11px] text-destructive">Use letters, digits, dots, hyphens or underscores.</p>}
          </div>
        )}

        {/* Orphan warning — mailboxes on a domain that isn't verified-owned */}
        {orphans.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs flex-1">
              {orphans.length} mailbox{orphans.length > 1 ? "es" : ""} on an unverified domain
              ({orphans.map((o) => o.domain).filter((v, i, a) => a.indexOf(v) === i).join(", ")}). Verify the domain, or clean up.
            </p>
            <Button variant="outline" size="sm" onClick={handleCleanup}>Clean up</Button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : mailboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No mailboxes yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {mailboxes.map((mb) => (
              <div key={mb.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium truncate">{mb.address}</span>
                    {mb.status === "active" ? (
                      <Badge variant="secondary" className="text-[10px]">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1"><Clock className="w-2.5 h-2.5" /> Pending domain</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3 shrink-0" /> {linkedSummary(mb)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLinkTarget(mb)}>
                  <Link2 className="w-3.5 h-3.5 mr-1" /> Link
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(mb)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {linkTarget && (
        <MailboxLinkDialog
          mailbox={linkTarget}
          members={members}
          open={!!linkTarget}
          onOpenChange={(o) => !o && setLinkTarget(null)}
          onLinked={(updated) => setMailboxes((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))}
        />
      )}
    </Card>
  );
}
