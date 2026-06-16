import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  UserPlus,
  Mail,
  Check,
  X,
  ChevronRight,
  UserX,
  Clock,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { teamService, type TeamMemberRecord, type PendingInvite, type TeamRole, type ModuleAccessLevel } from "@/services/team";
import { auth } from "@/lib/firebase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "admin":
      return "default";
    case "manager":
      return "secondary";
    default:
      return "outline";
  }
};

const roleLabel = (role: TeamRole): string => {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return "Agent";
};

const labelToRole = (value: string): TeamRole => {
  if (value === "Admin") return "admin";
  if (value === "Manager") return "manager";
  return "agent";
};

const MODULE_CATEGORIES = {
  core: {
    label: "Core Modules",
    modules: ["crm", "unified_inbox", "phonebook", "dashboard"],
  },
  communication: {
    label: "Communication",
    modules: ["whatsapp", "telegram", "email"],
  },
  ai: {
    label: "AI Features",
    modules: ["ai_agents", "ai_summaries", "ai_sentiment"],
  },
  automation: {
    label: "Automation & Workflows",
    modules: ["workflows", "automations"],
  },
  platform: {
    label: "Platform & Integrations",
    modules: ["api_access", "white_label", "custom_domains"],
  },
  telephony: {
    label: "Telephony",
    modules: ["telephony", "ivr"],
  },
  other: {
    label: "Other",
    modules: ["tasks", "calendar", "contracts", "branding"],
  },
};

const moduleLabel = (module: string): string => {
  return module
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const TeamManagement = () => {
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"Admin" | "Manager" | "Agent">("Agent");
  const [inviteTeam, setInviteTeam] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [expandedModuleAccess, setExpandedModuleAccess] = useState<string | null>(null);
  const [updatingModuleAccess, setUpdatingModuleAccess] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ uid: string; name: string } | null>(null);
  const [revokeInviteTarget, setRevokeInviteTarget] = useState<PendingInvite | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const currentUid = auth.currentUser?.uid;
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isFlynAdmin } = useAuth();

  const displayMembers = useMemo(() => members, [members]);

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const [list, invites] = await Promise.all([
        teamService.listMembers(),
        teamService.listPendingInvites().catch(() => []),
      ]);
      setMembers(list || []);
      setPendingInvites(invites || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load team";
      toast({ title: "Unable to load team", description: msg, variant: "destructive" });
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail || !inviteTeam) return;
    setIsInviting(true);
    try {
      const res = await teamService.inviteMember({
        email: inviteEmail,
        role: labelToRole(inviteRole),
        team: inviteTeam,
      });

      try {
        await navigator.clipboard.writeText(res.inviteCode);
      } catch {
        void 0;
      }

      toast({
        title: "Invitation sent",
        description: `Invite code copied to clipboard for ${res.email}: ${res.inviteCode}`,
      });

      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("Agent");
      setInviteTeam("");
      await loadMembers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to invite";
      toast({ title: "Invite failed", description: msg, variant: "destructive" });
    } finally {
      setIsInviting(false);
    }
  };

  const togglePermission = async (
    memberUid: string,
    permission: keyof NonNullable<TeamMemberRecord["permissions"]>,
  ) => {
    const member = members.find((m) => m.uid === memberUid);
    if (!member || !member.permissions) return;
    const nextValue = !member.permissions[permission];
    try {
      const updated = await teamService.updateMember(memberUid, {
        permissions: { [permission]: nextValue },
      });
      setMembers((prev) => prev.map((m) => (m.uid === memberUid ? updated : m)));
      toast({
        title: "Permission updated",
        description: `${permission.replace(/([A-Z])/g, " $1").trim()} ${nextValue ? "granted" : "revoked"}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update permission";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    }
  };

  const updateModuleAccess = async (
    memberUid: string,
    module: string,
    level: ModuleAccessLevel,
  ) => {
    const member = members.find((m) => m.uid === memberUid);
    if (!member) return;

    setUpdatingModuleAccess(memberUid);
    try {
      const updated = await teamService.updateMemberModuleAccess(memberUid, {
        [module]: level,
      });
      setMembers((prev) => prev.map((m) => (m.uid === memberUid ? updated : m)));
      toast({
        title: "Module access updated",
        description: `${moduleLabel(module)} set to ${level}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update module access";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    } finally {
      setUpdatingModuleAccess(null);
    }
  };

  const memberDisplayName = (member: TeamMemberRecord) => {
    const base = member.name?.trim() || member.email?.split("@")[0] || "User";
    return base;
  };

  const memberInitials = (member: TeamMemberRecord) => {
    const name = memberDisplayName(member);
    const parts = name.split(" ").filter(Boolean);
    const initials = parts.slice(0, 2).map((p) => p[0]).join("");
    return (initials || name[0] || "U").toUpperCase();
  };

  const handleRevokeMember = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await teamService.removeMember(revokeTarget.uid);
      setMembers((prev) => prev.filter((m) => m.uid !== revokeTarget.uid));
      toast({ title: "Access revoked", description: `${revokeTarget.name}'s access has been revoked.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to revoke access";
      toast({ title: "Revoke failed", description: msg, variant: "destructive" });
    } finally {
      setIsRevoking(false);
      setRevokeTarget(null);
    }
  };

  const handleRevokeInvite = async () => {
    if (!revokeInviteTarget) return;
    setIsRevoking(true);
    try {
      await teamService.revokeInvite(revokeInviteTarget.code);
      setPendingInvites((prev) => prev.filter((i) => i.code !== revokeInviteTarget.code));
      toast({ title: "Invite cancelled", description: `Invite for ${revokeInviteTarget.email} has been cancelled.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel invite";
      toast({ title: "Cancel failed", description: msg, variant: "destructive" });
    } finally {
      setIsRevoking(false);
      setRevokeInviteTarget(null);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-start justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {t("team.title")}<br />&amp; {t("team.permissions")}
            </h1>
          </div>

          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flyn-button-gradient">
                <UserPlus className="h-4 w-4 mr-2" />
                {t("team.inviteUser")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("team.inviteTeamMember")}</DialogTitle>
                <DialogDescription>
                  {t("team.inviteDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("team.emailAddress")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("team.role")}</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">{t("team.admin")}</SelectItem>
                      <SelectItem value="Manager">{t("team.manager")}</SelectItem>
                      <SelectItem value="Agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("team.teamLabel")}</Label>
                  <Select value={inviteTeam} onValueChange={setInviteTeam}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("team.selectTeam")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Product">Product</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Support">Support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleInvite}
                  className="w-full flyn-button-gradient"
                  disabled={!inviteEmail || !inviteTeam || isInviting}
                >
                  {t("team.sendInvitation")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Team Members Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">{t("team.teamMembers")}</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">{t("team.role")}</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">{t("team.teams")}</th>
                      <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr className="border-b last:border-0">
                        <td className="p-4 text-sm text-muted-foreground" colSpan={4}>Loading...</td>
                      </tr>
                    ) : displayMembers.length === 0 ? (
                      <tr className="border-b last:border-0">
                        <td className="p-4 text-sm text-muted-foreground" colSpan={4}>No team members yet.</td>
                      </tr>
                    ) : displayMembers.map((member) => (
                      <tr key={member.uid} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={undefined} alt={memberDisplayName(member)} />
                              <AvatarFallback>{memberInitials(member)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{memberDisplayName(member)}</div>
                              <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge
                            variant={getRoleBadgeVariant(member.role)}
                            className={member.role === "admin" ? "bg-primary" : member.role === "manager" ? "bg-primary/80" : ""}
                          >
                            {roleLabel(member.role)}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">{member.team || "—"}</Badge>
                        </td>
                        <td className="p-4 text-right">
                          {member.uid !== currentUid && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setRevokeTarget({ uid: member.uid, name: memberDisplayName(member) })}
                            >
                              <UserX className="h-3.5 w-3.5 mr-1" />
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Permissions Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8"
        >
          <h2 className="text-xl font-bold text-foreground mb-4">{t("team.permissions")}</h2>
          <Card className="border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Member</th>
                      <th className="text-center p-4 text-sm font-medium text-muted-foreground">{t("team.accessCRM")}</th>
                      <th className="text-center p-4 text-sm font-medium text-muted-foreground">{t("team.manageUsers")}</th>
                      <th className="text-center p-4 text-sm font-medium text-muted-foreground">{t("team.editSettings")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(displayMembers.length ? displayMembers : members).slice(0, 5).map((member) => (
                      <tr key={member.uid} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="p-4">
                          <span className="font-medium">{memberDisplayName(member)}</span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={member.permissions?.accessCRM ?? false}
                              onCheckedChange={() => togglePermission(member.uid, "accessCRM")}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={member.permissions?.manageUsers ?? false}
                              onCheckedChange={() => togglePermission(member.uid, "manageUsers")}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={member.permissions?.editSettings ?? false}
                              onCheckedChange={() => togglePermission(member.uid, "editSettings")}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Owner Dashboard Permissions — FLYN platform org only */}
        {isFlynAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-bold text-foreground">Owner Dashboard Access</h2>
              <Badge variant="outline" className="text-xs text-primary border-primary/40 bg-primary/5">FLYN Internal</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Controls which sections of the Owner Dashboard each invited staff member can access.
              Platform owners always have full access.
            </p>
            <Card className="border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Member</th>
                        <th className="text-center p-4 text-sm font-medium text-muted-foreground">
                          <div className="flex flex-col items-center gap-0.5">
                            <span>Analytics</span>
                            <span className="text-[10px] font-normal text-muted-foreground/70">Sales & Revenue</span>
                          </div>
                        </th>
                        <th className="text-center p-4 text-sm font-medium text-muted-foreground">
                          <div className="flex flex-col items-center gap-0.5">
                            <span>Content</span>
                            <span className="text-[10px] font-normal text-muted-foreground/70">Landing page editors</span>
                          </div>
                        </th>
                        <th className="text-center p-4 text-sm font-medium text-muted-foreground">
                          <div className="flex flex-col items-center gap-0.5">
                            <span>Pricing</span>
                            <span className="text-[10px] font-normal text-muted-foreground/70">Plans & billing periods</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(displayMembers.length ? displayMembers : members).map((member) => (
                        <tr key={member.uid} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="p-4">
                            <div>
                              <span className="font-medium">{memberDisplayName(member)}</span>
                              <span className="text-xs text-muted-foreground ml-2">{member.email}</span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={member.permissions?.ownerDashboardAnalytics ?? false}
                                onCheckedChange={() => togglePermission(member.uid, "ownerDashboardAnalytics")}
                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              />
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={member.permissions?.ownerDashboardContent ?? false}
                                onCheckedChange={() => togglePermission(member.uid, "ownerDashboardContent")}
                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              />
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={member.permissions?.ownerDashboardPricing ?? false}
                                onCheckedChange={() => togglePermission(member.uid, "ownerDashboardPricing")}
                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6"
          >
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Pending Invites
            </h2>
            <Card className="border">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Role</th>
                      <th className="text-left p-4 text-sm font-medium text-muted-foreground">Sent</th>
                      <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvites.map((invite) => (
                      <tr key={invite.code} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="p-4 text-sm">{invite.email}</td>
                        <td className="p-4">
                          <Badge variant={getRoleBadgeVariant(invite.role)}>{roleLabel(invite.role)}</Badge>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {new Date(invite.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => setRevokeInviteTarget(invite)}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Module Access Management */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <h2 className="text-xl font-bold text-foreground mb-4">Module Access Control</h2>
          <div className="space-y-3">
            {displayMembers.map((member) => (
              <Card key={member.uid} className="border">
                <CardContent className="p-0">
                  <button
                    onClick={() => setExpandedModuleAccess(
                      expandedModuleAccess === member.uid ? null : member.uid
                    )}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={undefined} alt={memberDisplayName(member)} />
                        <AvatarFallback>{memberInitials(member)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 text-left">
                        <div className="font-medium truncate">{memberDisplayName(member)}</div>
                        <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-5 w-5 text-muted-foreground transition-transform flex-shrink-0 ${
                        expandedModuleAccess === member.uid ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {expandedModuleAccess === member.uid && (
                    <div className="border-t p-4 space-y-4 bg-muted/20">
                      {Object.entries(MODULE_CATEGORIES).map(([_, category]) => (
                        <div key={_}>
                          <h4 className="text-sm font-medium text-foreground mb-3">{category.label}</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {category.modules.map((module) => {
                              const access = member.moduleAccess?.[module as keyof typeof member.moduleAccess] || "none";
                              return (
                                <div key={module} className="space-y-1">
                                  <label className="text-xs font-medium text-muted-foreground block">
                                    {moduleLabel(module)}
                                  </label>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => updateModuleAccess(member.uid, module, "full")}
                                      disabled={updatingModuleAccess === member.uid}
                                      className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                                        access === "full"
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "border-border hover:bg-muted"
                                      }`}
                                    >
                                      Full
                                    </button>
                                    <button
                                      onClick={() => updateModuleAccess(member.uid, module, "readonly")}
                                      disabled={updatingModuleAccess === member.uid}
                                      className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                                        access === "readonly"
                                          ? "bg-blue-600 text-white border-blue-600"
                                          : "border-border hover:bg-muted"
                                      }`}
                                    >
                                      Read
                                    </button>
                                    <button
                                      onClick={() => updateModuleAccess(member.uid, module, "none")}
                                      disabled={updatingModuleAccess === member.uid}
                                      className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                                        access === "none"
                                          ? "bg-destructive text-destructive-foreground border-destructive"
                                          : "border-border hover:bg-muted"
                                      }`}
                                    >
                                      None
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Revoke member dialog */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>Revoke access?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately remove <strong>{revokeTarget?.name}</strong> from your organization,
            clear their permissions, and invalidate all active sessions. This cannot be undone.
          </AlertDialogDescription>
          <div className="flex justify-end gap-3 mt-4">
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevokeMember}
            >
              {isRevoking ? "Revoking…" : "Revoke Access"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke invite dialog */}
      <AlertDialog open={!!revokeInviteTarget} onOpenChange={(open) => { if (!open) setRevokeInviteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancel invite?</AlertDialogTitle>
          <AlertDialogDescription>
            The invitation for <strong>{revokeInviteTarget?.email}</strong> will be cancelled
            and they will receive a notification email.
          </AlertDialogDescription>
          <div className="flex justify-end gap-3 mt-4">
            <AlertDialogCancel disabled={isRevoking}>Keep Invite</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevokeInvite}
            >
              {isRevoking ? "Cancelling…" : "Cancel Invite"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default TeamManagement;
