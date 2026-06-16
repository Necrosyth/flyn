import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search as SearchIcon,
  RefreshCw,
  ExternalLink,
  Receipt,
  FileText,
  Briefcase,
  BookOpen,
  DollarSign,
  Grid,
  List as ListIcon,
  Files,
  Users,
  FileSignature,
  Upload,
  Trash2,
  Download,
  Lock,
  BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { useToast } from "@/hooks/use-toast";
import { accountingService } from "@/services/accounting.service";
import { contractsService } from "@/services/contracts.service";
import { hrService } from "@/services/hr.service";
import { authedFetch } from "@/services/authApi";
import { assetsApi, type AssetFile as UploadedAsset } from "@/services/assetsApi";

// ── Permission model ──────────────────────────────────────────────────────────
// owner / admin  → all modules
// manager        → Accounting, Contracts, Knowledge Base, AI Training Docs (no HR PII)
// agent          → Knowledge Base + AI Training Docs only
type UserRole = "owner" | "admin" | "manager" | "agent";

const ALLOWED_MODULES: Record<UserRole, Set<string>> = {
  owner:   new Set(["Accounting", "Contracts", "HR", "Knowledge Base", "AI Training Docs"]),
  admin:   new Set(["Accounting", "Contracts", "HR", "Knowledge Base", "AI Training Docs"]),
  manager: new Set(["Accounting", "Contracts", "Knowledge Base", "AI Training Docs"]),
  agent:   new Set(["Knowledge Base", "AI Training Docs"]),
};

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "") ??
  "https://pjpmzvu7wn.us-east-1.awsapprunner.com/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetType = "invoice" | "expense" | "contract" | "employee" | "article" | "file";
type ModuleFilter = "All" | "Accounting" | "Contracts" | "HR" | "Knowledge Base" | "AI Training Docs";

interface AssetItem {
  id: string;
  name: string;
  type: AssetType;
  module: ModuleFilter;
  moduleRoute: string;
  status?: string;
  amount?: string;
  date: string;
  meta?: string;
  fileUrl?: string;    // for uploaded files — used for download
  isUploaded?: boolean; // true = came from S3/DynamoDB (deletable)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MODULE_COLORS: Record<ModuleFilter, string> = {
  All: "bg-primary/10 text-primary",
  Accounting: "bg-emerald-500/10 text-emerald-600",
  Contracts: "bg-blue-500/10 text-blue-600",
  HR: "bg-violet-500/10 text-violet-600",
  "Knowledge Base": "bg-amber-500/10 text-amber-600",
  "AI Training Docs": "bg-fuchsia-500/10 text-fuchsia-600",
};

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  active: "bg-emerald-100 text-emerald-700",
  signed: "bg-emerald-100 text-emerald-700",
  published: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
  declined: "bg-red-100 text-red-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  sent: "bg-blue-100 text-blue-700",
  on_leave: "bg-orange-100 text-orange-700",
  uploaded: "bg-fuchsia-100 text-fuchsia-700",
};

function typeIcon(type: AssetType) {
  switch (type) {
    case "invoice":   return <Receipt className="w-4 h-4 text-emerald-500" />;
    case "expense":   return <DollarSign className="w-4 h-4 text-rose-500" />;
    case "contract":  return <FileSignature className="w-4 h-4 text-blue-500" />;
    case "employee":  return <Users className="w-4 h-4 text-violet-500" />;
    case "article":   return <BookOpen className="w-4 h-4 text-amber-500" />;
    case "file":      return <BrainCircuit className="w-4 h-4 text-fuchsia-500" />;
    default:          return <FileText className="w-4 h-4 text-slate-400" />;
  }
}

function fmtDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d.slice(0, 10); }
}

function fmtSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const MODULE_FILTERS: ModuleFilter[] = ["All", "Accounting", "Contracts", "HR", "Knowledge Base", "AI Training Docs"];

const MODULE_ICONS: Record<ModuleFilter, React.ReactNode> = {
  All: <Files className="w-4 h-4" />,
  Accounting: <Receipt className="w-4 h-4" />,
  Contracts: <FileSignature className="w-4 h-4" />,
  HR: <Briefcase className="w-4 h-4" />,
  "Knowledge Base": <BookOpen className="w-4 h-4" />,
  "AI Training Docs": <BrainCircuit className="w-4 h-4" />,
};

const FileManager = () => {
  const { user } = useAuth();
  const { isAppSelected } = usePlan();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("All");
  const [view, setView] = useState<"grid" | "list">("list");

  const tenantId = user?.organizationId ?? "";
  const role = (user?.role ?? "agent") as UserRole;
  const allowed = ALLOWED_MODULES[role] ?? ALLOWED_MODULES.agent;

  // HR module only shown if the tenant has it active
  const hrActive = isAppSelected("hr");
  const visibleModules = new Set([...allowed].filter(m => m !== "HR" || hrActive));

  const loadAll = useCallback(async () => {
    setLoading(true);
    const items: AssetItem[] = [];

    await Promise.allSettled([
      // ── Invoices ──────────────────────────────────────────────────────────
      !visibleModules.has("Accounting") ? Promise.resolve() :
      accountingService.getInvoices({ limit: 200 }).then(invoices => {
        invoices.forEach(inv => items.push({
          id: `inv_${inv.id}`,
          name: `Invoice ${inv.invoice ?? inv.id} — ${inv.client ?? "Unknown"}`,
          type: "invoice",
          module: "Accounting",
          moduleRoute: "/dashboard/accounting",
          status: inv.status,
          amount: inv.amount ? `${inv.currency ?? ""}${inv.amount}`.trim() : undefined,
          date: inv.createdAt ?? inv.dueDate ?? "",
          meta: inv.module ?? undefined,
        }));
      }),

      // ── Expenses ──────────────────────────────────────────────────────────
      !visibleModules.has("Accounting") ? Promise.resolve() :
      accountingService.getExpenses({ limit: 200 }).then(expenses => {
        expenses.forEach(exp => items.push({
          id: `exp_${exp.id}`,
          name: `${exp.description ?? exp.category} ${exp.vendor ? `(${exp.vendor})` : ""}`.trim(),
          type: "expense",
          module: "Accounting",
          moduleRoute: "/dashboard/accounting",
          status: exp.status,
          amount: exp.amount ? `${exp.currency ?? ""}${exp.amount}`.trim() : undefined,
          date: exp.date ?? "",
          meta: exp.category,
        }));
      }),

      // ── Contracts ─────────────────────────────────────────────────────────
      !visibleModules.has("Contracts") ? Promise.resolve() :
      contractsService.getContracts({ limit: 200 }).then(contracts => {
        contracts.forEach(c => items.push({
          id: `con_${c.id ?? c._id}`,
          name: c.title ?? "Untitled Contract",
          type: "contract",
          module: "Contracts",
          moduleRoute: "/dashboard/contracts",
          status: c.status,
          date: c.updatedAt ?? c.createdAt ?? "",
          meta: c.type,
        }));
      }),

      // ── HR Employees ──────────────────────────────────────────────────────
      !visibleModules.has("HR") ? Promise.resolve() :
      hrService.getEmployees({ limit: 200 }).then(employees => {
        employees.forEach(emp => items.push({
          id: `emp_${emp.id}`,
          name: emp.name,
          type: "employee",
          module: "HR",
          moduleRoute: "/dashboard/hr",
          status: emp.status,
          date: "",
          meta: `${emp.role ?? ""}${emp.department ? ` · ${emp.department}` : ""}`.trim() || undefined,
        }));
      }),

      // ── Knowledge Base ────────────────────────────────────────────────────
      (!visibleModules.has("Knowledge Base") || !tenantId) ? Promise.resolve() :
      authedFetch(`${API_BASE}/chatbot/knowledge-base?tenantId=${tenantId}`, {
            headers: { "x-tenant-id": tenantId },
          })
            .then(r => r.ok ? r.json() as Promise<{ articles: Array<{ id: string; title: string; category: string; isPublished: boolean; createdAt: string; updatedAt: string }> }> : null)
            .then(data => {
              (data?.articles ?? []).forEach(a => items.push({
                id: `kb_${a.id}`,
                name: a.title,
                type: "article",
                module: "Knowledge Base",
                moduleRoute: "/knowledge",
                status: a.isPublished ? "published" : "draft",
                date: a.updatedAt ?? a.createdAt ?? "",
                meta: a.category,
              }));
            }),

      // ── AI Training Docs (uploaded files from S3/DynamoDB) ────────────────
      (!visibleModules.has("AI Training Docs") || !tenantId) ? Promise.resolve() :
      assetsApi.listAssets(tenantId, "ai-training-docs").then(files => {
        files.forEach(f => items.push({
          id: `af_${f.id}`,
          name: f.fileName,
          type: "file",
          module: "AI Training Docs",
          moduleRoute: "",
          status: "uploaded",
          date: f.uploadedAt ?? "",
          meta: fmtSize(f.fileSize),
          fileUrl: f.fileUrl,
          isUploaded: true,
        }));
      }),
    ]);

    // Sort newest first
    items.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    setAssets(items);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, role, hrActive]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !tenantId) return;
    e.target.value = "";

    setUploading(true);
    let successCount = 0;
    for (const file of files) {
      try {
        await assetsApi.upload(tenantId, file, {
          module: "ai-training-docs",
          uploadedBy: user?.name ?? user?.email ?? "unknown",
        });
        successCount++;
      } catch {
        toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
      }
    }
    setUploading(false);

    if (successCount > 0) {
      toast({ title: `${successCount} file${successCount > 1 ? "s" : ""} uploaded to AI Training Docs` });
      void loadAll();
    }
  };

  const handleDelete = async (asset: AssetItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!asset.isUploaded) return;
    // The real DynamoDB id is after the "af_" prefix we added
    const realId = asset.id.replace(/^af_/, "");
    setDeletingId(asset.id);
    try {
      await assetsApi.deleteAsset(tenantId, realId);
      toast({ title: "File deleted" });
      setAssets(prev => prev.filter(a => a.id !== asset.id));
    } catch {
      toast({ title: "Failed to delete file", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = assets.filter(a => {
    if (!visibleModules.has(a.module)) return false;
    if (moduleFilter !== "All" && a.module !== moduleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.module.toLowerCase().includes(q) ||
        (a.meta ?? "").toLowerCase().includes(q) ||
        (a.status ?? "").toLowerCase().includes(q) ||
        a.type.includes(q)
      );
    }
    return true;
  });

  const counts: Record<ModuleFilter, number> = {
    All: assets.length,
    Accounting: assets.filter(a => a.module === "Accounting").length,
    Contracts: assets.filter(a => a.module === "Contracts").length,
    HR: assets.filter(a => a.module === "HR").length,
    "Knowledge Base": assets.filter(a => a.module === "Knowledge Base").length,
    "AI Training Docs": assets.filter(a => a.module === "AI Training Docs").length,
  };

  const canUpload = visibleModules.has("AI Training Docs");

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Digital Asset Hub</h1>
            <p className="text-sm text-muted-foreground">All documents, records, and files from every module — in one place.</p>
          </div>
          <div className="flex items-center gap-2">
            {canUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                  accept=".txt,.md,.pdf,.doc,.docx,.csv,.json"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className={cn("w-4 h-4 mr-2", uploading && "animate-bounce")} />
                  {uploading ? "Uploading…" : "Upload Doc"}
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* AI Training Docs callout */}
        {canUpload && moduleFilter === "AI Training Docs" && (
          <div className="flex items-start gap-3 text-xs bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-lg px-3 py-2.5">
            <BrainCircuit className="w-4 h-4 shrink-0 text-fuchsia-500 mt-0.5" />
            <p className="text-muted-foreground">
              Files uploaded here are used by your AI chatbot and telephony agents as custom knowledge — customer policies, FAQs, service guides, and more.
              Supported formats: <span className="font-medium text-foreground">.txt, .md, .pdf, .doc, .csv, .json</span>
            </p>
          </div>
        )}

        {/* Permission notice for restricted roles */}
        {role === "agent" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            You have access to the Knowledge Base and AI Training Docs. Contact your admin for access to financial or HR records.
          </div>
        )}
        {role === "manager" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            HR employee records are restricted to owners and admins.
          </div>
        )}

        {/* Module filter pills — only show accessible modules */}
        <div className="flex flex-wrap gap-2">
          {MODULE_FILTERS.filter(m => m === "All" || visibleModules.has(m)).map(m => (
            <button
              key={m}
              onClick={() => setModuleFilter(m)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                moduleFilter === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
              )}
            >
              {MODULE_ICONS[m]}
              {m}
              <span className={cn(
                "ml-0.5 text-xs rounded-full px-1.5 py-0.5",
                moduleFilter === m ? "bg-white/20" : "bg-muted"
              )}>
                {counts[m]}
              </span>
            </button>
          ))}
        </div>

        {/* Search + view toggle */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-muted/30 border border-border p-3 rounded-xl">
          <div className="flex-1 w-full relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, module, status, category…"
              className="pl-9 bg-background"
            />
          </div>
          <div className="flex items-center gap-1 bg-background border border-border p-1 rounded-lg shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setView("grid")} className={cn("h-8 px-2", view === "grid" && "bg-muted")}>
              <Grid className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setView("list")} className={cn("h-8 px-2", view === "list" && "bg-muted")}>
              <ListIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Files className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No assets found</p>
            <p className="text-sm mt-1">
              {search ? "Try a different search term." :
               moduleFilter === "AI Training Docs" ? "Upload your first document to train your AI agents." :
               "Create records in any module and they'll appear here automatically."}
            </p>
            {!search && moduleFilter === "AI Training Docs" && canUpload && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            )}
          </div>
        )}

        {/* Grid view */}
        {!loading && filtered.length > 0 && view === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(asset => (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "group relative bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all",
                  asset.moduleRoute ? "cursor-pointer" : "cursor-default"
                )}
                onClick={() => asset.moduleRoute && navigate(asset.moduleRoute)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-muted">{typeIcon(asset.type)}</div>
                  <div className="flex items-center gap-1.5">
                    {asset.status && (
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize", STATUS_COLORS[asset.status] ?? "bg-muted text-muted-foreground")}>
                        {asset.status.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-medium text-foreground line-clamp-2 mb-1" title={asset.name}>{asset.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", MODULE_COLORS[asset.module])}>{asset.module}</span>
                  {asset.amount && <span className="text-xs font-semibold text-foreground">{asset.amount}</span>}
                </div>
                {asset.meta && <p className="text-[10px] text-muted-foreground mt-1 truncate">{asset.meta}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(asset.date)}</p>

                {/* Action buttons for uploaded files */}
                {asset.isUploaded && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {asset.fileUrl && (
                      <a href={asset.fileUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 bg-background/80">
                          <Download className="w-3 h-3" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 bg-background/80 hover:text-destructive"
                      disabled={deletingId === asset.id}
                      onClick={e => void handleDelete(asset, e)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* List view */}
        {!loading && filtered.length > 0 && view === "list" && (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Module</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Amount / Size</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Date</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset, i) => (
                  <tr
                    key={asset.id}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/40 transition-colors group",
                      asset.moduleRoute ? "cursor-pointer" : "cursor-default",
                      i === filtered.length - 1 && "border-b-0"
                    )}
                    onClick={() => asset.moduleRoute && navigate(asset.moduleRoute)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-muted shrink-0">{typeIcon(asset.type)}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate max-w-[240px]" title={asset.name}>{asset.name}</p>
                          {asset.meta && <p className="text-[10px] text-muted-foreground truncate">{asset.meta}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", MODULE_COLORS[asset.module])}>{asset.module}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground capitalize">{asset.type}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {asset.status && (
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", STATUS_COLORS[asset.status] ?? "bg-muted text-muted-foreground")}>
                          {asset.status.replace(/_/g, " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm font-medium text-foreground">
                      {asset.amount ?? asset.meta ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {fmtDate(asset.date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {asset.isUploaded ? (
                          <>
                            {asset.fileUrl && (
                              <a href={asset.fileUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Download">
                                  <Download className="w-3.5 h-3.5" />
                                </Button>
                              </a>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:text-destructive"
                              disabled={deletingId === asset.id}
                              onClick={e => void handleDelete(asset, e)}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={e => { e.stopPropagation(); navigate(asset.moduleRoute); }}
                            title={`Open in ${asset.module}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            Showing {filtered.length} of {assets.length} records
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default FileManager;
