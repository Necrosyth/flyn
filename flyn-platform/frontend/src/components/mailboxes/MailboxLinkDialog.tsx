/**
 * MailboxLinkDialog — the checkbox picker that links a mailbox to a flexible access set.
 *
 * Members are grouped by their team label. Each team row has a tri-state checkbox: clicking it
 * bulk-selects/clears all its members; it shows checked (all), a dash (some), or empty (none).
 * Individual members can be toggled freely — any mix of whole teams + specific people.
 *
 * On save we derive the backend model { teams[], uids[] }:
 *   • a team whose every member is selected → stored as a TEAM (dynamic: future joiners included)
 *   • a partially-selected team → its selected members are stored as individual uids
 *   • members with no team → uids
 * So "link the whole Marketing team" stays dynamic, while "pick three people" is an explicit list.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Minus, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mailboxesService, type TenantMailbox } from "@/services/mailboxes";
import type { TeamMemberRecord } from "@/services/team";

const NO_TEAM = "__no_team__";

interface Props {
  mailbox: TenantMailbox;
  members: TeamMemberRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: (updated: TenantMailbox) => void;
}

export function MailboxLinkDialog({ mailbox, members, open, onOpenChange, onLinked }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Group members by team label (members without one fall into a "No team" bucket).
  const groups = useMemo(() => {
    const byTeam = new Map<string, TeamMemberRecord[]>();
    for (const m of members) {
      const key = (m.team || "").trim() || NO_TEAM;
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key)!.push(m);
    }
    return Array.from(byTeam.entries()).sort(([a], [b]) =>
      a === NO_TEAM ? 1 : b === NO_TEAM ? -1 : a.localeCompare(b),
    );
  }, [members]);

  // Initial selection = members covered by the mailbox's current linkage (team OR uid).
  const initialSelected = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      const inTeam = !!m.team && mailbox.teams.includes(m.team.trim());
      if (inTeam || mailbox.uids.includes(m.uid)) set.add(m.uid);
    }
    return set;
  }, [members, mailbox]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);

  const toggleMember = (uid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });

  const toggleTeam = (teamMembers: TeamMemberRecord[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = teamMembers.every((m) => next.has(m.uid));
      teamMembers.forEach((m) => (allOn ? next.delete(m.uid) : next.add(m.uid)));
      return next;
    });

  const teamState = (teamMembers: TeamMemberRecord[]): "all" | "some" | "none" => {
    const on = teamMembers.filter((m) => selected.has(m.uid)).length;
    return on === 0 ? "none" : on === teamMembers.length ? "all" : "some";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const teams: string[] = [];
      const uids: string[] = [];
      for (const [key, ms] of groups) {
        if (key !== NO_TEAM && ms.every((m) => selected.has(m.uid))) {
          teams.push(key); // whole team → dynamic
        } else {
          ms.forEach((m) => selected.has(m.uid) && uids.push(m.uid)); // specific people
        }
      }
      const updated = await mailboxesService.link(mailbox.id, { teams, uids });
      toast({ title: "Mailbox linked", description: `${mailbox.address} → ${teams.length} team(s), ${uids.length} person(s).` });
      onLinked(updated);
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Couldn't link mailbox", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalSelected = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" /> Link <span className="font-mono text-sm">{mailbox.address}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Tick a team to give everyone in it access, or pick specific people. Whoever's ticked can use this mailbox's inbox + outbox.
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-3 -mr-3">
          <div className="space-y-4">
            {groups.map(([key, ms]) => {
              const isNoTeam = key === NO_TEAM;
              const state = teamState(ms);
              return (
                <div key={key} className="space-y-1.5">
                  {!isNoTeam ? (
                    <button
                      type="button"
                      onClick={() => toggleTeam(ms)}
                      className="flex items-center gap-2 w-full text-left group"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                          state === "none" ? "border-primary" : "border-primary bg-primary text-primary-foreground"
                        }`}
                      >
                        {state === "all" && <Check className="h-3 w-3" />}
                        {state === "some" && <Minus className="h-3 w-3" />}
                      </span>
                      <span className="text-sm font-semibold capitalize">{key}</span>
                      <span className="text-[11px] text-muted-foreground">({ms.length})</span>
                    </button>
                  ) : (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">No team</p>
                  )}

                  <div className={isNoTeam ? "space-y-1" : "space-y-1 pl-6"}>
                    {ms.map((m) => (
                      <label key={m.uid} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <Checkbox checked={selected.has(m.uid)} onCheckedChange={() => toggleMember(m.uid)} />
                        <span className="text-sm">{m.name || m.email.split("@")[0]}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{m.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No team members yet. Invite people first.</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">{totalSelected} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</> : "Save access"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
