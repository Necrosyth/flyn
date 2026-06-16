/**
 * Automations Page - Visual Workflow Builder
 * -------------------------------------------
 * Professional dark-themed workflow builder with inline node configuration.
 * Clean, subtle, and enterprise-ready design.
 */

import { useCallback, useRef, DragEvent, useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { withPlanGate } from "@/components/PlanGate";
import { useTranslation } from "react-i18next";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  BackgroundVariant,
  Node,
  Edge,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import "@xyflow/react/dist/style.css";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Square,
  Save,
  Rocket,
  Workflow,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  FolderOpen,
  FileJson2,
  Search,
  X,
  Send,
  Plus,
  RefreshCw,
  Trash2,
  Maximize,
  Power,
  PowerOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown
} from "lucide-react";

// Schema & Store
import { NODE_SCHEMAS, getNodeSchemasByCategory, getNodeSchemasList, CATEGORY_LABELS, NodeSchema, buildNodeRegistry, registerCustomNodeSchemas, subscribeSchemas, getSchemaVersion } from "@/config/nodeSchemas";
import { customNodesApi } from "@/services/customNodesApi";
import { API_BASE_URL } from "@/lib/api";
import { authedFetch } from "@/services/authApi";
import { NODE_TYPE_COLORS, getNodeColor } from "@/config/nodeColors";
import { useFlowStore, FlowNode } from "@/hooks/useFlowStore";
import { useExecutionStore } from "@/hooks/useExecutionStore";
import { useTestRunStore } from "@/hooks/useTestRunStore";

// App Sidebar
import AppSidebar from "@/components/AppSidebar";

// Node Components
import { nodeTypes } from "@/nodes";

// Edge Components
import { edgeTypes } from "@/edges";

// Property Panel
import PropertyPanel from "@/components/panel/PropertyPanel";

// Compiler
import { compileAndValidate, CompileResult } from "@/utils/flowCompiler";

// Orchestrator & Workflow Services
import { orchestratorService } from "@/services/orchestrator";
import { workflowService, WorkflowSummary } from "@/services/workflow.service";



// ============================================================================
// PROFESSIONAL PALETTE COLORS
// ============================================================================

const PALETTE_COLORS: Record<string, { accent: string; icon: string }> = {
  // ── Triggers
  trigger:       { accent: 'border-l-emerald-500', icon: 'text-emerald-400' },
  inbox_trigger: { accent: 'border-l-sky-500',     icon: 'text-sky-400' },

  // ── Actions
  action:         { accent: 'border-l-violet-500',  icon: 'text-violet-400' },
  send_reply:     { accent: 'border-l-teal-500',    icon: 'text-teal-400' },
  send_whatsapp:  { accent: 'border-l-green-500',   icon: 'text-green-400' },
  send_email:     { accent: 'border-l-blue-500',    icon: 'text-blue-400' },
  send_sms:       { accent: 'border-l-amber-500',   icon: 'text-amber-400' },
  send_telegram:  { accent: 'border-l-sky-400',     icon: 'text-sky-400' },
  send_instagram: { accent: 'border-l-pink-500',    icon: 'text-pink-400' },
  vapi:           { accent: 'border-l-purple-700',  icon: 'text-purple-400' },
  webrtc:         { accent: 'border-l-sky-600',     icon: 'text-sky-400' },

  // ── Logic & Flow
  wait:        { accent: 'border-l-blue-500',    icon: 'text-blue-400' },
  decision:    { accent: 'border-l-amber-500',   icon: 'text-amber-400' },
  approval:    { accent: 'border-l-indigo-500',  icon: 'text-indigo-400' },
  iterator:    { accent: 'border-l-orange-500',  icon: 'text-orange-400' },
  split:       { accent: 'border-l-fuchsia-500', icon: 'text-fuchsia-400' },
  join:        { accent: 'border-l-fuchsia-700', icon: 'text-fuchsia-400' },
  end:         { accent: 'border-l-red-500',     icon: 'text-red-400' },

  // ── AI & Intelligence
  ai_decision: { accent: 'border-l-pink-500',    icon: 'text-pink-400' },
  ai_action:   { accent: 'border-l-purple-500',  icon: 'text-purple-400' },
  ai_router:   { accent: 'border-l-rose-600',    icon: 'text-rose-400' },

  // ── Data & Integration
  query_records: { accent: 'border-l-cyan-500',   icon: 'text-cyan-400' },
  mongodb:       { accent: 'border-l-green-500',  icon: 'text-green-400' },
  postgresql:    { accent: 'border-l-blue-700',   icon: 'text-blue-400' },
  mysql:         { accent: 'border-l-orange-400', icon: 'text-orange-300' },
  merge:         { accent: 'border-l-teal-400',   icon: 'text-teal-300' },

  // ── Plugins
  crm:        { accent: 'border-l-violet-700',   icon: 'text-violet-400' },
  hr:         { accent: 'border-l-yellow-500',   icon: 'text-yellow-400' },
  church:     { accent: 'border-l-pink-600',     icon: 'text-pink-400' },
  freelancer: { accent: 'border-l-teal-600',     icon: 'text-teal-400' },
  coaches:    { accent: 'border-l-violet-500',   icon: 'text-violet-400' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ============================================================================
// NODE PALETTE ITEM
// ============================================================================

interface NodePaletteItemProps {
  schema: NodeSchema;
  matchedAlias?: string | null;
}

const NodePaletteItem: React.FC<NodePaletteItemProps> = ({ schema, matchedAlias }) => {
  const IconComponent = schema.iconComponent;
  const colors = PALETTE_COLORS[schema.type] || {
    accent: 'border-l-muted-foreground',
    icon: 'text-muted-foreground',
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("application/reactflow", schema.type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <div
          draggable
          onDragStart={onDragStart}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-lg
            bg-secondary/60 border-l-4 ${colors.accent}
            cursor-grab active:cursor-grabbing
            hover:bg-secondary transition-all duration-150
            hover:translate-x-0.5 group
          `}
        >
          <IconComponent className={`h-4 w-4 ${colors.icon} shrink-0 transition-transform group-hover:scale-110`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground/80 leading-tight">{schema.label}</p>
            {matchedAlias && (
              <p className="text-[10px] text-muted-foreground/50 truncate leading-tight">
                &ldquo;{matchedAlias}&rdquo;
              </p>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        className="max-w-[280px] bg-popover border-border shadow-xl"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <IconComponent className={`h-4 w-4 ${colors.icon}`} />
            <span className="font-semibold text-popover-foreground">{schema.label}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {schema.description}
          </p>
          <div className="pt-1 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
              {CATEGORY_LABELS[schema.category]}
            </span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

// ============================================================================
// HOVER NAVIGATION SIDEBAR (Uses existing AppSidebar)
// ============================================================================

interface HoverNavProps {
  isVisible: boolean;
  onClose: () => void;
}

const HoverNav: React.FC<HoverNavProps> = ({ isVisible, onClose }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />

          {/* AppSidebar Container */}
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed left-0 top-0 h-full z-50"
            onMouseLeave={onClose}
          >
            <AppSidebar isCollapsed={false} onToggle={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ============================================================================
// NODE PALETTE
// ============================================================================

const NodePalette: React.FC = () => {
  const [query, setQuery] = useState('');
  // Re-render when AI/custom node schemas are registered into NODE_SCHEMAS.
  const schemaVer = useSyncExternalStore(subscribeSchemas, getSchemaVersion);
  const schemasByCategory = useMemo(() => getNodeSchemasByCategory(), [schemaVer]);
  const allSchemas = useMemo(() => getNodeSchemasList(), [schemaVer]);
  const { t } = useTranslation();

  // Search: match against label, type, description, and aliases
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allSchemas
      .map((schema) => {
        const inLabel = schema.label.toLowerCase().includes(q);
        const inType = schema.type.toLowerCase().includes(q);
        const inDesc = schema.description.toLowerCase().includes(q);
        const matchedAlias = schema.aliases?.find((a) => a.toLowerCase().includes(q)) ?? null;
        if (inLabel || inType || inDesc || matchedAlias) {
          return { schema, matchedAlias: inLabel || inType ? null : matchedAlias };
        }
        return null;
      })
      .filter(Boolean) as { schema: NodeSchema; matchedAlias: string | null }[];
  }, [query, allSchemas]);

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Palette Header */}
      <div className="p-4 border-b border-border space-y-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground/80">{t("automations.components")}</h3>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search steps..."
            className="
              w-full pl-8 pr-7 py-1.5 text-xs rounded-md
              bg-secondary/60 border border-border/50
              text-foreground placeholder:text-muted-foreground/40
              focus:outline-none focus:ring-1 focus:ring-ring/40
              transition-colors
            "
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Palette Items */}
      <div
        className="flex-1 overflow-y-auto p-3 custom-scrollbar"
        onWheel={(e) => e.stopPropagation()}
      >
        {searchResults !== null ? (
          // ── Search results (flat list)
          searchResults.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground/50 px-1 mb-2">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </p>
              {searchResults.map(({ schema, matchedAlias }) => (
                <NodePaletteItem key={schema.type} schema={schema} matchedAlias={matchedAlias} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <Search className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/50">
                No steps match<br />
                <span className="text-muted-foreground/70">&ldquo;{query}&rdquo;</span>
              </p>
            </div>
          )
        ) : (
          // ── Default grouped categories
          <div className="space-y-4">
            {Object.entries(schemasByCategory).map(([category, schemas]) =>
              schemas.length > 0 ? (
                <div key={category}>
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2 px-1">
                    {CATEGORY_LABELS[category]}
                  </p>
                  <div className="space-y-1.5">
                    {schemas.map((schema) => (
                      <NodePaletteItem key={schema.type} schema={schema} />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// FLOW CANVAS COMPONENT
// ============================================================================

const FlowCanvas: React.FC = () => {
  // ── 1. Core Hooks (React + React Flow + Libs) ──────────────────────────────
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { toast } = useToast();
  const location = useLocation();
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  // ── 2. Store Actions (Hooks) ──────────────────────────────────────────────
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const addNode = useFlowStore((state) => state.addNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const clearSelection = useFlowStore((state) => state.clearSelection);
  const isDirty = useFlowStore((state) => state.isDirty);
  const setDirty = useFlowStore((state) => state.setDirty);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);

  const isExecutionRunning = useExecutionStore((state) => state.isRunning);
  const startSimulation = useExecutionStore((state) => state.startSimulation);
  const stopSimulation = useExecutionStore((state) => state.stopSimulation);
  const resetExecution = useExecutionStore((state) => state.resetExecution);

  // ── 3. Page-Level State ───────────────────────────────────────────────────
  const [showNav, setShowNav] = useState(false);
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [panelWidth, setPanelWidth] = useState(320);
  const isResizingRef = useRef(false);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(320);

  const [pendingWorkflow, setPendingWorkflow] = useState<CompileResult | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showAiToolsMenu, setShowAiToolsMenu] = useState(false);

  // AI Workflow Assistant chatbot state
  const [showAiAssistDialog, setShowAiAssistDialog] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  const [aiWorkflowMode, setAiWorkflowMode] = useState<'none' | 'current' | 'new' | 'choose'>('none');
  const [currentWorkflowName, setCurrentWorkflowName] = useState<string>('');
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string>('');

  // AI workflow picker state (inside the assistant dialog)
  const [aiPickerWorkflows, setAiPickerWorkflows] = useState<WorkflowSummary[]>([]);
  const [aiPickerLoading, setAiPickerLoading] = useState(false);
  const [aiPickerSearch, setAiPickerSearch] = useState('');

  const [showOptimizeDialog, setShowOptimizeDialog] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [applyOptimizeLoading, setApplyOptimizeLoading] = useState(false);

  const [showWorkflowsDialog, setShowWorkflowsDialog] = useState(false);
  const [userWorkflows, setUserWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState('');

  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testSampleData, setTestSampleData] = useState<string>('');
  const [optimizeResult, setOptimizeResult] = useState<{
    score: number;
    summary: string;
    suggestions: { type: string; title: string; description: string }[];
  } | null>(null);

  // ── 4. Resizing Logic ─────────────────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizingPanel(true);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartXRef.current - e.clientX;
      const newWidth = Math.min(600, Math.max(240, resizeStartWidthRef.current + delta));
      setPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizingPanel(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ── 5. Helper Functions ───────────────────────────────────────────────────
  
  /**
   * Convert raw compiled_nodes (from JSON or example constant) into FlowNodes
   * that the visual builder understands, then load into the store.
   */
  const loadFlowFromData = useCallback(
    (rawNodes: unknown[], rawEdges: unknown[]) => {
      const DECISION_TYPES = new Set(['decision', 'ai_decision']);

      const flowNodes: FlowNode[] = rawNodes
        .map((node) => (isRecord(node) ? node : null))
        .filter((node): node is Record<string, unknown> => Boolean(node))
        .map((n) => {
          const id = typeof n.id === 'string' ? n.id : String(n.id ?? '');
          const type = typeof n.type === 'string' ? n.type : String(n.type ?? 'action');
          const name = typeof n.name === 'string' ? n.name : String(n.name ?? type);
          const config = isRecord(n.config) ? (n.config as Record<string, unknown>) : {};
          const pos = isRecord(n.position) ? n.position : {};
          const position = {
            x: typeof pos.x === 'number' ? pos.x : 0,
            y: typeof pos.y === 'number' ? pos.y : 0,
          };

          const schema = NODE_SCHEMAS[type] ?? NODE_SCHEMAS['action'];

          let importedConfig: Record<string, unknown> = { ...config };
          if (
            importedConfig.entityData &&
            typeof importedConfig.entityData === 'string' &&
            !importedConfig.op_fields &&
            ['hr', 'church', 'coaches', 'freelancer'].includes(type)
          ) {
            try {
              importedConfig = { ...importedConfig, op_fields: JSON.parse(importedConfig.entityData as string) };
            } catch { /* malformed entityData */ }
          }

          return {
            id,
            type: DECISION_TYPES.has(type) ? 'decision' : 'generic',
            position,
            data: {
              label: name,
              nodeType: type,
              schema,
              config: importedConfig,
            },
          } as FlowNode;
        });

      const nodeIdSet = new Set(flowNodes.map((n) => n.id));
      const decisionNodeIds = new Set(
        flowNodes.filter((n) => n.type === 'decision').map((n) => n.id),
      );
      const nodeTypeMap = new Map(
        flowNodes.map((n) => [n.id, n.data.nodeType ?? '']),
      );

      const flowEdges: Edge[] = rawEdges
        .map((edge) => (isRecord(edge) ? edge : null))
        .filter((edge): edge is Record<string, unknown> => Boolean(edge))
        .filter((e) => typeof e.source === 'string' && typeof e.target === 'string' && nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
        .map((e, idx) => {
          const source = String(e.source);
          const target = String(e.target);
          const isFromDecisionNode = decisionNodeIds.has(source);
          const rawHandle = typeof e.sourceHandle === 'string' ? e.sourceHandle : null;

          let visualHandle: string | null = null;
          let logicalHandle: string | null = rawHandle;

          if (isFromDecisionNode) {
            const normalised =
              rawHandle === 'true' || rawHandle === 'cond_positive' ? 'true'
              : rawHandle === 'false' || rawHandle === 'cond_negative' ? 'false'
              : rawHandle;
            visualHandle = normalised;
            logicalHandle = normalised;
          }

          const srcNodeType = nodeTypeMap.get(source) ?? '';
          const srcEdgeColor = getNodeColor(srcNodeType);

          return {
            id: typeof e.id === 'string' ? e.id : `imported_edge_${idx}`,
            source,
            target,
            sourceHandle: visualHandle,
            targetHandle: null,
            type: 'colored',
            style: { stroke: srcEdgeColor, strokeWidth: 2 },
            data: {
              conditionHandle: logicalHandle,
              sourceNodeType: srcNodeType,
            },
          };
        });

      const edgeMap = new Map<string, typeof flowEdges[number]>();
      for (const edge of flowEdges) {
        edgeMap.set(edge.id, edge);
      }

      useFlowStore.getState().loadFlow(flowNodes, Array.from(edgeMap.values()));
      
      // Auto-fit after a tiny delay
      setTimeout(() => {
        fitView({ duration: 800, padding: 0.2 });
      }, 50);
    },
    [fitView]
  );

  // ── 6. Action Handlers ────────────────────────────────────────────────────
  
  const handleOpenWorkflows = useCallback(async () => {
    setShowWorkflowsDialog(true);
    setIsLoadingWorkflows(true);
    try {
      const data = await workflowService.listWorkflows();
      setUserWorkflows(data.workflows);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error fetching workflows",
        description: (error as Error).message,
      });
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, [toast]);

  const handleLoadWorkflow = useCallback(async (workflowSummary: WorkflowSummary) => {
    setIsLoadingWorkflows(true);
    try {
      const { workflow } = await workflowService.getWorkflow(workflowSummary.id);
      
      loadFlowFromData(
        workflow.compiled_nodes ?? [],
        workflow.compiled_edges ?? [],
      );
      
      setCurrentWorkflowId(workflow.id);
      setCurrentWorkflowName(workflow.name);
      setShowWorkflowsDialog(false);
      setDirty(false);
      
      toast({
        title: "Workflow loaded",
        description: `Successfully loaded "${workflow.name}"`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error loading workflow",
        description: (error as Error).message,
      });
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, [loadFlowFromData, toast, setDirty]);

  const handleDeleteWorkflow = useCallback(async (e: React.MouseEvent, workflowId: string, workflowName: string) => {
    e.stopPropagation();
    if (!confirm(`Delete "${workflowName}"? This cannot be undone.`)) return;
    try {
      await workflowService.deleteWorkflow(workflowId);
      setUserWorkflows(prev => prev.filter(w => w.id !== workflowId));
      if (currentWorkflowId === workflowId) {
        setCurrentWorkflowId('');
        setCurrentWorkflowName('Untitled Workflow');
      }
      toast({ title: 'Workflow deleted', description: `"${workflowName}" has been removed.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: (error as Error).message });
    }
  }, [currentWorkflowId, toast]);

  const handleToggleWorkflowActive = useCallback(async (e: React.MouseEvent, workflowId: string, workflowName: string, currentlyActive: boolean) => {
    e.stopPropagation();
    try {
      if (currentlyActive) {
        await workflowService.unpublishWorkflow(workflowId);
      } else {
        await workflowService.publishWorkflow(workflowId);
      }
      setUserWorkflows(prev => prev.map(w => w.id === workflowId ? { ...w, isActive: !currentlyActive } : w));
      toast({
        title: currentlyActive ? 'Workflow deactivated' : 'Workflow activated',
        description: currentlyActive
          ? `"${workflowName}" will no longer respond to triggers.`
          : `"${workflowName}" is now live and listening for triggers.`,
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to update workflow', description: (error as Error).message });
    }
  }, [toast]);

  // AI Workflow Assistant — open chatbot dialog (shows landing screen)
  const handleAiWorkflowAssist = useCallback(() => {
    setAiWorkflowMode('none');
    setChatMessages([]);
    setChatInput('');
    setAiPickerSearch('');
    setShowAiAssistDialog(true);
  }, []);

  // Show workflow picker inside the AI assistant
  const handleAiShowWorkflowPicker = useCallback(async () => {
    setAiWorkflowMode('choose');
    setAiPickerSearch('');
    setAiPickerLoading(true);
    try {
      const data = await workflowService.listWorkflows();
      setAiPickerWorkflows(data.workflows);
    } catch {
      setAiPickerWorkflows([]);
    } finally {
      setAiPickerLoading(false);
    }
  }, []);

  // Choose a saved workflow from inside the AI assistant — loads it on canvas + restores history
  const handleAiPickWorkflow = useCallback(async (wf: WorkflowSummary) => {
    setAiPickerLoading(true);
    try {
      // 1. Load the workflow onto the canvas
      const { workflow } = await workflowService.getWorkflow(wf.id);
      loadFlowFromData(workflow.compiled_nodes ?? [], workflow.compiled_edges ?? []);
      setCurrentWorkflowId(workflow.id);
      setCurrentWorkflowName(workflow.name);
      setDirty(false);

      // 2. Restore chat history for this workflow
      const history = await workflowService.getChatHistory(wf.id);
      const nodeList = (workflow.compiled_nodes ?? []).map((n: any) => `• **${n.name || n.type}** (${n.type})`).join('\n');
      const hasHistory = history.length > 0;

      const greeting = hasHistory
        ? `I've loaded **${workflow.name}** onto your canvas and restored our previous conversation.\n\nThe workflow has **${(workflow.compiled_nodes ?? []).length} nodes**. What would you like to change or ask about?`
        : `I've loaded **${workflow.name}** onto your canvas.\n\nHere's what I can see:\n${nodeList}\n\nWhat would you like to do with this workflow?`;

      const systemGreeting = { role: 'assistant' as const, content: greeting };
      setChatMessages(hasHistory ? [...history, systemGreeting] : [systemGreeting]);
      setAiWorkflowMode('current');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to load workflow', description: err.message });
    } finally {
      setAiPickerLoading(false);
    }
  }, [loadFlowFromData, toast, setDirty]);

  // Apply a workflow returned by AI — routes through loadFlowFromData for consistent node styling
  const applyAiWorkflow = useCallback((workflow: { name: string; nodes: Array<{ id: string; type: string; label: string; position: { x: number; y: number }; config?: Record<string, unknown> }>; edges: Array<{ id: string; source: string; target: string }> }) => {
    // We map to the 'raw' format that loadFlowFromData expects
    const rawNodes = workflow.nodes.map(n => ({
      id: n.id,
      type: n.type,
      name: n.label || n.type,
      position: n.position,
      config: n.config || {},
    }));
    const rawEdges = workflow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    loadFlowFromData(rawNodes, rawEdges);
    setCurrentWorkflowName(workflow.name);
    setShowAiAssistDialog(false);
    toast({ title: `Workflow generated: "${workflow.name}"`, description: `${rawNodes.length} nodes added to canvas.` });
  }, [loadFlowFromData, toast]);

  // Enter "current workflow" mode — reads canvas nodes and shows context
  const handleEnterCurrentMode = useCallback(() => {
    const currentNodes = useFlowStore.getState().nodes;
    if (currentNodes.length === 0) {
      setAiWorkflowMode('new');
      setChatMessages([{
        role: 'assistant',
        content: "Your canvas is empty! Let's create a new workflow instead.\n\nDescribe what you want to automate — for example: \"When a new WhatsApp message arrives, wait 5 minutes, then send a welcome reply.\"",
      }]);
      setChatInput('');
        return;
    }
    setAiWorkflowMode('current');
    const name = currentWorkflowName || 'your workflow';
    const nodeList = currentNodes.map(n => `• **${n.data.label}** (${n.data.nodeType})`).join('\n');
    setChatMessages([{
      role: 'assistant',
      content: `You're now working on **${name}**.\n\nI can see **${currentNodes.length} node${currentNodes.length !== 1 ? 's' : ''}** on your canvas:\n${nodeList}\n\nWould you like to:\n• **Modify nodes** — add, remove, or rearrange steps\n• **Configure fields** — I'll gather the values and fill them in automatically\n• **Something else** — just tell me what you need!`,
    }]);
    setChatInput('');
  }, [currentWorkflowName]);

  // Enter "new workflow" mode
  const handleEnterNewMode = useCallback(() => {
    setAiWorkflowMode('new');
    setChatMessages([{
      role: 'assistant',
      content: "Let's create a new workflow!\n\nDescribe what you want to automate — for example:\n• \"When a new WhatsApp message arrives, wait 5 min, then send a welcome reply\"\n• \"Every Monday, get active CRM contacts and send them a newsletter\"\n• \"When a new person is added to CRM, send them a welcome WhatsApp\"",
    }]);
    setChatInput('');
  }, []);

  // Send a chat message to the AI
  const handleAiWorkflowOption = useCallback((option: 'current' | 'new') => {
    if (option === 'current') {
      const name = currentWorkflowName || 'the current workflow';
      setAiWorkflowMode('current');
      setChatMessages(prev => [
        ...prev,
        { role: 'user', content: `I'll work on ${name}.` },
        { role: 'assistant', content: `Great! Let's focus on **${name}**. I can help you modify the nodes or fill in the configuration details. What would you like to do?` }
      ]);
    } else {
      setAiWorkflowMode('new');
      setChatMessages(prev => [
        ...prev,
        { role: 'user', content: 'I want to make a new workflow.' },
        { role: 'assistant', content: "Understood. I'll help you design a fresh automation from scratch. Describe what you'd like to achieve!" }
      ]);
      // Optional: Clear canvas? Maybe not yet, let user decide.
    }
  }, [currentWorkflowName]);

  const handleAiChatSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || aiAssistLoading) return;

    const userMsg = { role: 'user' as const, content: text, timestamp: Date.now() };
    const updatedMessages = [...chatMessages.map(m => ({ ...m, timestamp: (m as any).timestamp ?? Date.now() })), userMsg];
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setAiAssistLoading(true);

    setTimeout(() => { chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }); }, 50);

    try {
      const tenantId = localStorage.getItem('tenantId') || '';

      // Include current workflow context when in 'current' mode
      const workflowContext = aiWorkflowMode === 'current'
        ? {
            name: currentWorkflowName || 'Current Workflow',
            nodes: useFlowStore.getState().nodes.map(n => ({
              id: n.id,
              type: n.data.nodeType,
              label: n.data.label,
              config: n.data.config,
            })),
            edges: useFlowStore.getState().edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
          }
        : undefined;

      const res = await authedFetch(`${API_BASE_URL}/workflows/ai/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          messages: updatedMessages,
          workflowId: currentWorkflowId || undefined,
          workflowContext,
          nodeRegistry: buildNodeRegistry(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'AI response failed');

      const reply: string = data.reply || 'Could you give me more details?';
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      if (data.proposedWorkflow) {
        setTimeout(() => applyAiWorkflow(data.proposedWorkflow), 600);
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${err.message}` }]);
    } finally {
      setAiAssistLoading(false);
      setTimeout(() => { chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }); }, 100);
    }
  }, [chatInput, chatMessages, aiAssistLoading, aiWorkflowMode, currentWorkflowName, currentWorkflowId, applyAiWorkflow]);

  // Auto-Optimize Flow handler
  const handleAiOptimizeFlow = useCallback(async () => {
    const currentNodes = useFlowStore.getState().nodes;
    if (currentNodes.length === 0) {
      toast({ variant: "destructive", title: "No nodes to optimize", description: "Add nodes to your flow first." });
      return;
    }
    setOptimizeResult(null);
    setShowOptimizeDialog(true);
    setOptimizeLoading(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/workflows/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: currentNodes, edges: useFlowStore.getState().edges }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Optimization failed');
      setOptimizeResult(data.analysis);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Optimization failed", description: err.message });
      setShowOptimizeDialog(false);
    } finally {
      setOptimizeLoading(false);
    }
  }, [toast]);

  // Apply AI-suggested optimizations to the canvas
  const handleApplyOptimize = useCallback(async () => {
    if (!optimizeResult) return;
    const currentNodes = useFlowStore.getState().nodes;
    const currentEdges = useFlowStore.getState().edges;
    setApplyOptimizeLoading(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/workflows/ai/optimize/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: currentNodes,
          edges: currentEdges,
          suggestions: optimizeResult.suggestions,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Apply optimization failed');
      applyAiWorkflow(data.workflow);
      setShowOptimizeDialog(false);
      toast({ title: '✅ Workflow optimized!', description: 'All suggested improvements have been applied to the canvas.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Optimization apply failed', description: err.message });
    } finally {
      setApplyOptimizeLoading(false);
    }
  }, [optimizeResult, applyAiWorkflow, toast]);

  // Run history panel state
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [runHistory, setRunHistory] = useState<Array<{
    id: string; status: string; startedAt: string; completedAt?: string; triggeredBy?: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchRunHistory = useCallback(async () => {
    const wfId = currentWorkflowId;
    if (!wfId) return;
    setHistoryLoading(true);
    try {
      const res = await workflowService.listRuns(wfId, 20);
      setRunHistory(res.runs || []);
    } catch { /* silent */ } finally {
      setHistoryLoading(false);
    }
  }, [currentWorkflowId]);

  const handleToggleHistory = useCallback(() => {
    setShowHistoryPanel((v) => {
      if (!v) fetchRunHistory();
      return !v;
    });
  }, [fetchRunHistory]);

  // Import JSON dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Import JSON handler
  const handleImportJson = useCallback(() => {
    try {
      const data = JSON.parse(importJson);
      let importedNodes: any[] = [];
      let importedEdges: any[] = [];

      // Accept both formats: { nodes, edges } or { compiled_nodes, compiled_edges }
      if (Array.isArray(data.nodes)) {
        importedNodes = data.nodes;
        importedEdges = data.edges || [];
      } else if (Array.isArray(data.compiled_nodes)) {
        importedNodes = data.compiled_nodes;
        importedEdges = data.compiled_edges || [];
      } else {
        throw new Error("Invalid format: Expected 'nodes' or 'compiled_nodes' array.");
      }

      loadFlowFromData(importedNodes, importedEdges);
      setShowImportDialog(false);
      setImportJson('');
      setImportError(null);
      toast({ title: "✅ Flow Imported", description: `${importedNodes.length} nodes loaded.` });
    } catch (err: any) {
      setImportError(err.message);
    }
  }, [importJson, loadFlowFromData, toast]);

  // Auto show/hide property panel based on node selection
  useEffect(() => {
    if (selectedNodeId) {
      setShowPropertyPanel(true);
    } else {
      setShowPropertyPanel(false);
    }
  }, [selectedNodeId]);

  // Handle drag over
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle drop
  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/reactflow");

      if (!nodeType || !NODE_SCHEMAS[nodeType]) return;

      const schema = NODE_SCHEMAS[nodeType];
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Build default config from schema fields so required fields
      // with defaults (e.g. operation: 'find') are pre-populated
      const defaultConfig: Record<string, unknown> = {};
      if (schema.fields) {
        for (const field of schema.fields) {
          if (field.default !== undefined) {
            defaultConfig[field.name] = field.default;
          }
        }
      }

      const newNode: FlowNode = {
        id: `node_${Date.now()}`,
        type: nodeType === "decision" ? "decision" : "generic",
        position,
        data: {
          label: schema.label,
          nodeType: nodeType,
          schema: schema,
          config: defaultConfig,
        },
      };

      addNode(newNode);
      setSelectedNode(newNode.id);

      toast({
        title: t("automations.nodeAdded"),
        description: t("automations.nodeAddedDesc", { label: schema.label }),
      });
    },
    [screenToFlowPosition, addNode, setSelectedNode, toast, t]
  );

  // Handle canvas click
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Handle node click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  // Load preset flow passed via router state (e.g. from DashboardModule preset buttons)
  useEffect(() => {
    const state = location.state as any;
    const preset = state?.presetFlow;

    if (preset && Array.isArray(preset.nodes) && preset.nodes.length > 0) {
      loadFlowFromData(preset.nodes, preset.edges ?? []);
      const workflowName = state?.workflowName || preset?.name || 'Loaded Workflow';
      setCurrentWorkflowName(workflowName);

      if (state?.autoOpenChat) {
        setAiWorkflowMode('current');

        // Plain-English descriptions for each node type so first-time users
        // immediately understand what each step of the workflow does.
        const NODE_PLAIN_DESCRIPTIONS: Record<string, string> = {
          trigger:        '⏰ **Trigger** — Starts the automation (on a schedule or event)',
          inbox_trigger:  '📥 **Inbox Trigger** — Listens for an incoming message (WhatsApp, Email, SMS, etc.)',
          church:         '⛪ **Church Module** — Reads or updates church member data',
          crm:            '👥 **CRM Module** — Reads or updates your contacts and deals',
          hr:             '💼 **HR Module** — Reads or updates employee records',
          coaches:        '🎯 **Coaches Module** — Reads or updates client / session data',
          freelancer:     '🧑‍💻 **Freelancers Module** — Reads or updates project records',
          events:         '🎟️ **Events Module** — Reads or updates event / attendee data',
          ai_action:      '🤖 **AI Step** — Uses AI to compose a personalised message or perform a smart task',
          ai_decision:    '🧠 **AI Decision** — Uses AI to intelligently decide which path to follow',
          send_whatsapp:  '💬 **Send WhatsApp** — Sends a WhatsApp message to the contact',
          send_email:     '📧 **Send Email** — Sends an email to the contact',
          send_sms:       '📱 **Send SMS** — Sends a text/SMS message to the contact',
          send_reply:     '↩️ **Send Reply** — Replies inside the active inbox conversation',
          send_telegram:  '✈️ **Send Telegram** — Sends a Telegram message to the contact',
          wait:           '⏳ **Wait / Delay** — Pauses the automation for a set amount of time before continuing',
          decision:       '🔀 **Decision (If/Else)** — Checks a condition and routes the flow down a Yes or No path',
          approval:       '✅ **Approval Gate** — Pauses the flow until a team member manually approves it',
          action:         '⚡ **Action** — Performs a custom action (HTTP call, data transform, etc.)',
          query_records:  '🔍 **Query Records** — Fetches a list of records from the database',
          iterator:       '🔁 **Loop** — Repeats the next steps for every item in a list',
          split:          '⑂ **Split** — Runs multiple paths at the same time (parallel)',
          join:           '⑃ **Join** — Waits for all parallel paths to finish before continuing',
          end:            '🏁 **End** — The automation finishes here',
        };

        // Build the step-by-step breakdown from the loaded preset nodes
        const presetNodes: any[] = preset?.nodes ?? [];
        const workflowBreakdown = presetNodes.length > 0
          ? `\n\n---\n**📋 Here is what this automation does, step by step:**\n\n` +
            presetNodes.map((n: any, i: number) => {
              const typeKey = n.type as string;
              const desc = NODE_PLAIN_DESCRIPTIONS[typeKey]
                ?? `🔧 **${n.name || typeKey}**`;
              // Append the node's custom display name if it differs from the type
              const customName =
                n.name && n.name !== typeKey && n.name !== desc
                  ? ` *(named "${n.name}")*`
                  : '';
              return `**Step ${i + 1}.** ${desc}${customName}`;
            }).join('\n')
          : '';

        const tipLine = '\n\n---\n💡 *Not sure about any step? Just ask me! You can say things like "change the message text", "add a delay", or "explain what Step 2 does".*';

        const enrichedGreeting = (state?.chatMessage || `I've loaded **${workflowName}** onto your canvas.`) +
          workflowBreakdown +
          tipLine +
          '\n\n**Shall we proceed with this workflow, or would you like to make any changes?**';

        setChatMessages([{ role: 'assistant', content: enrichedGreeting }]);
        setChatInput('');
        setShowAiAssistDialog(true);
      }

      window.history.replaceState({}, '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFlowFromData, location.state]);

  // Handle save
  const handleSave = useCallback(async () => {
    const result: CompileResult = compileAndValidate(nodes, edges, {
      workflowId: currentWorkflowId || undefined,
      name: currentWorkflowName || 'Untitled Workflow',
    });

    if (!result.success || !result.workflow) {
      toast({
        variant: "destructive",
        title: t("automations.validationFailed"),
        description: result.validation.errors.join("\n"),
      });
      return;
    }

    try {
      const response = await workflowService.saveWorkflow({
        id: currentWorkflowId,
        name: currentWorkflowName || 'Untitled Workflow',
        nodes: result.workflow.nodes,
        edges: result.workflow.edges,
        execution_plan: result.workflow.execution_plan,
        metadata: result.workflow.metadata
      });

      if (response.workflow?.id && !currentWorkflowId) {
        setCurrentWorkflowId(response.workflow.id);
      }

      toast({
        title: t("automations.workflowSaved"),
        description: t("automations.nodesSaved", { count: result.workflow?.metadata.node_count }),
      });

      setDirty(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: (error as Error).message,
      });
    }
  }, [nodes, edges, toast, setDirty, t, currentWorkflowId, currentWorkflowName]);

  // Handle publish — saves the workflow and marks it as active so real triggers fire it
  const handlePublish = useCallback(async () => {
    const result: CompileResult = compileAndValidate(nodes, edges, {
      workflowId: currentWorkflowId || undefined,
      name: currentWorkflowName || 'Published Workflow',
    });

    if (!result.success || !result.workflow) {
      toast({
        variant: "destructive",
        title: t("automations.cannotPublish"),
        description: result.validation.errors.join("\n"),
      });
      return;
    }

    setIsPublishing(true);
    try {
      // 1. Save the workflow (create or update)
      const saveRes = await workflowService.saveWorkflow({
        id: currentWorkflowId,
        name: currentWorkflowName || 'Published Workflow',
        nodes: result.workflow.nodes,
        edges: result.workflow.edges,
        execution_plan: result.workflow.execution_plan,
        metadata: result.workflow.metadata
      });

      const savedId = saveRes.workflow?.id || currentWorkflowId;
      if (saveRes.workflow?.id && !currentWorkflowId) {
        setCurrentWorkflowId(saveRes.workflow.id);
      }

      // 2. Mark it as active — the backend will now dispatch real trigger events to it
      await workflowService.publishWorkflow(savedId);

      toast({
        title: t("automations.publishedSuccessfully"),
        description: `"${currentWorkflowName || 'Workflow'}" is now live and listening for trigger events.`,
      });
      setDirty(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Publish Failed",
        description: (error as Error).message,
      });
    } finally {
      setIsPublishing(false);
    }
  }, [nodes, edges, toast, setDirty, t, currentWorkflowId, currentWorkflowName]);

  // Handle test run — executes flow against real backend
  // Build default sample data based on trigger node type in canvas
  const buildSampleTriggerData = useCallback(() => {
    const triggerNode = nodes.find(n =>
      ['inbox_trigger', 'trigger', 'webhook'].includes(n.data?.nodeType || '')
    );
    const cfg = (triggerNode?.data?.config as any) || {};
    const channelType: string = cfg.channelType || cfg.trigger_type || 'whatsapp';
    const tenantId = localStorage.getItem('tenantId') || 'test-tenant';

    if (channelType === 'email') {
      return JSON.stringify({
        channel: 'email',
        from: 'customer@example.com',
        subject: 'Help needed',
        message: 'Hello, I need some assistance with my order.',
        conversationId: `${tenantId}:email:customer@example.com`,
        contactId: 'contact_test_001',
        contactName: 'Test Customer',
        contactEmail: 'customer@example.com',
      }, null, 2);
    }
    if (channelType === 'telegram') {
      return JSON.stringify({
        channel: 'telegram',
        from: '123456789',
        message: 'Hi from Telegram!',
        conversationId: `${tenantId}:telegram:123456789`,
        contactId: 'contact_test_001',
        contactName: 'Test Customer',
      }, null, 2);
    }
    // Default: WhatsApp
    return JSON.stringify({
      channel: 'whatsapp',
      from: '+919876543210',
      message: 'Hi, I just sent a WhatsApp message!',
      conversationId: `${tenantId}:whatsapp:+919876543210`,
      contactId: 'contact_test_001',
      contactName: 'Test Customer',
      contactPhone: '+919876543210',
      contactEmail: 'customer@example.com',
    }, null, 2);
  }, [nodes]);

  // Open the test dialog (or stop if already running).
  // If sample data was already set from a previous run, skip the dialog and re-run immediately.
  const handleTestButtonClick = useCallback((e?: React.MouseEvent) => {
    if (isExecutionRunning) {
      stopSimulation();
      resetExecution();
      useTestRunStore.getState().clearTestData();
      toast({ title: t('automations.testStopped') });
      return;
    }
    if (nodes.length === 0) {
      toast({ variant: 'destructive', title: t('automations.noNodes'), description: t('automations.addNodesToTest') });
      return;
    }
    // Always regenerate sample data from the current trigger node
    const freshData = buildSampleTriggerData();
    setTestSampleData(freshData);
    setShowTestDialog(true);
  }, [isExecutionRunning, nodes, buildSampleTriggerData, stopSimulation, resetExecution, toast, t]);

  const handleTestRun = useCallback(async () => {
    if (nodes.length === 0) {
      toast({
        variant: "destructive",
        title: t("automations.noNodes"),
        description: t("automations.addNodesToTest"),
      });
      return;
    }

    // If already running, stop the old mock simulation & test run state
    if (isExecutionRunning) {
      stopSimulation();
      resetExecution();
      useTestRunStore.getState().clearTestData();
      toast({ title: t("automations.testStopped") });
      return;
    }

    // 1. Compile & validate
    const compiledResult = compileAndValidate(nodes, edges);

    if (!compiledResult.success || !compiledResult.workflow) {
      toast({
        variant: "destructive",
        title: "Validation Errors",
        description: compiledResult.validation.errors.join(", ") || "Workflow compilation failed",
      });
      return;
    }

    // 2. Prepare stores
    const testStore = useTestRunStore.getState();
    testStore.startTestRun();
    testStore.initNodeStatuses(nodes.map((n) => n.id));

    // Also start the execution store so GenericNodeV2 can show status rings
    startSimulation(nodes);

    toast({
      title: t("automations.testRunning"),
      description: t("automations.watchNodes"),
    });

    try {
      // 3. Call the backend orchestrator with sample trigger data
      let triggerData: Record<string, unknown> = {};
      try { triggerData = JSON.parse(testSampleData || '{}'); } catch { triggerData = {}; }
      const response = await orchestratorService.executeWorkflow(
        compiledResult.workflow,
        triggerData
      );

      // 4. Extract per-node outputs from the response
      const nodeOutputs: Record<string, unknown> = {};
      if (response.context?.nodeOutputs) {
        // Backend keyed by node IDs used in the compiled workflow.
        // Map them back so our store has frontend node IDs as keys.
        for (const [key, value] of Object.entries(response.context.nodeOutputs)) {
          nodeOutputs[key] = value;
        }
      }

      // 5. Persist in test run store
      testStore.setTestResults(response.workflowRunId, nodeOutputs);

      // 6. Update execution store so node rings turn green
      stopSimulation();
      Object.keys(nodeOutputs).forEach((nodeId) => {
        useExecutionStore.getState().nodeStatuses[nodeId] = 'completed';
      });

      toast({
        title: "✅ Test Completed",
        description: `${Object.keys(nodeOutputs).length} node(s) returned data. Variable picker is now populated.`,
      });
    } catch (error) {
      console.error("❌ Test run failed:", error);
      testStore.setTestFailed((error as Error).message);
      stopSimulation();

      toast({
        variant: "destructive",
        title: "Test Failed",
        description: (error as Error).message,
      });
    }
  }, [nodes, edges, isExecutionRunning, startSimulation, stopSimulation, resetExecution, toast, t, testSampleData]);

  return (
    <div className="h-screen flex bg-background relative overflow-hidden">
      {/* Hover Navigation Sidebar */}
      <HoverNav isVisible={showNav} onClose={() => setShowNav(false)} />

      {/* Left Edge Hover Trigger Zone */}
      <div
        className="fixed left-0 top-0 w-2 h-full z-40 cursor-pointer"
        onMouseEnter={() => setShowNav(true)}
      >
        {/* Visual indicator line */}
        <div className="h-full w-0.5 bg-gradient-to-b from-primary/0 via-primary/30 to-primary/0 opacity-0 hover:opacity-100 transition-opacity" />
      </div>

      {/* Node Palette - Left Sidebar */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="w-56 flex-shrink-0"
      >
        <NodePalette />
      </motion.div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="h-14 bg-card border-b border-border flex items-center justify-between px-3 gap-2 shrink-0"
        >
          {/* Left - Title */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 shrink-0">
              <Workflow className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-1.5">
                <input
                  value={currentWorkflowName || t("automations.workflowBuilder")}
                  onChange={(e) => { setCurrentWorkflowName(e.target.value); setDirty(true); }}
                  className="bg-transparent border-none text-sm font-semibold text-foreground focus:ring-0 p-0 hover:bg-muted/30 rounded px-1 transition-colors outline-none truncate"
                  placeholder="Untitled Workflow"
                />
                {isDirty && (
                  <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0">
                    {t("automations.unsaved")}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{t("automations.visualDesigner")}</p>
            </div>
          </div>

          {/* Center - Stats (only on wide screens) */}
          <div className="hidden 2xl:flex items-center gap-4 shrink-0">
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{nodes.length}</p>
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{t("automations.nodes")}</p>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{edges.length}</p>
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{t("automations.connections")}</p>
            </div>
          </div>

          {/* Right - Actions (icon-only with tooltips) */}
          <div className="flex items-center gap-1 shrink-0">
            {/* AI Tools Dropdown */}
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAiToolsMenu(prev => !prev)}
                    className="h-8 w-8 p-0 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">AI Tools</TooltipContent>
              </Tooltip>
              {showAiToolsMenu && (
                <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[220px] rounded-xl border border-border bg-popover shadow-2xl py-1.5 overflow-hidden">
                  <button
                    onClick={() => { handleAiWorkflowAssist(); setShowAiToolsMenu(false); }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-xs text-foreground hover:bg-muted hover:text-primary transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                    AI Workflow Assistant
                  </button>
                  <button
                    onClick={() => { handleAiOptimizeFlow(); setShowAiToolsMenu(false); }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-xs text-foreground hover:bg-muted hover:text-primary transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                    Auto-Optimize Flow
                  </button>
                </div>
              )}
            </div>

            {/* Fit View button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fitView({ duration: 800, padding: 0.2 })}
                  className="h-8 w-8 p-0 bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                >
                  <Maximize className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Fit View (POV)</TooltipContent>
            </Tooltip>

            {/* My Workflows button */}            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleOpenWorkflows}
                  className="h-8 w-8 p-0 bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                >
                  <Workflow className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">My Workflows</TooltipContent>
            </Tooltip>

            {/* Import JSON button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setImportJson(''); setImportError(null); setShowImportDialog(true); }}
                  className="h-8 w-8 p-0 bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Import JSON</TooltipContent>
            </Tooltip>

            {/* History Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleToggleHistory}
                  className={`h-8 w-8 p-0 ${showHistoryPanel
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                  }`}
                >
                  <Clock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Run History</TooltipContent>
            </Tooltip>

            {/* Test Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleTestButtonClick}
                  className={`h-8 w-8 p-0 ${isExecutionRunning
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  {isExecutionRunning ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{isExecutionRunning ? t("automations.stop") : t("automations.test")}</TooltipContent>
            </Tooltip>

            {/* Save Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSave}
                  className="h-8 w-8 p-0 bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("common.save")}</TooltipContent>
            </Tooltip>

            {/* Publish Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handlePublish}
                  className="h-8 px-3 gap-1.5 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white border-0 text-xs font-medium"
                  disabled={isPublishing}
                >
                  {isPublishing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5 shrink-0" />}
                  <span className="hidden lg:inline">{t("automations.publish")}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("automations.publish")}</TooltipContent>
            </Tooltip>
          </div>
        </motion.header>

        {/* Canvas */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex-1 relative"
          ref={reactFlowWrapper}
        >
          <ReactFlow
            nodes={nodes as unknown as Node[]}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes as unknown as NodeTypes}
            edgeTypes={edgeTypes as unknown as EdgeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            colorMode={resolvedTheme === 'light' ? 'light' : 'dark'}
            className="bg-background"
            defaultEdgeOptions={{
              style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
              type: 'colored',
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="hsl(var(--border))"
              gap={24}
              size={1.5}
              className="bg-background"
            />
            <Controls
              className="react-flow-controls-dark"
            />
            <MiniMap
              className="!bg-card !border-border !rounded-lg"
              maskColor="rgba(15, 23, 42, 0.8)"
              nodeColor={(node) => {
                const nodeType = (node.data as { nodeType?: string })?.nodeType;
                return NODE_TYPE_COLORS[nodeType || ''] || "#64748b";
              }}
            />
          </ReactFlow>

          {/* Empty State */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-medium text-muted-foreground mb-2">{t("automations.startBuilding")}</h3>
                <p className="text-sm text-muted-foreground/60 max-w-xs">
                  {t("automations.startBuildingDesc")}
                </p>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Run History Panel */}
      <AnimatePresence>
        {showHistoryPanel && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="relative h-full border-l border-border bg-card overflow-hidden flex-shrink-0"
            style={{ width: 300 }}
          >
            <div className="h-full flex flex-col" style={{ width: 300 }}>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-semibold text-foreground">Run History</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={fetchRunHistory}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setShowHistoryPanel(false)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {!currentWorkflowId ? (
                  <div className="p-4 text-center text-xs text-muted-foreground/60">Save this workflow first to see its run history.</div>
                ) : historyLoading ? (
                  <div className="p-4 text-center text-xs text-muted-foreground/60">Loading...</div>
                ) : runHistory.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground/60">No runs yet. Test or publish this workflow to see history here.</div>
                ) : (
                  runHistory.map((run) => {
                    const isSuccess = run.status === 'completed';
                    const isFailed = run.status === 'failed';
                    const isRunning = run.status === 'running' || run.status === 'pending';
                    const startedDate = new Date(run.startedAt);
                    const duration = run.completedAt
                      ? Math.round((new Date(run.completedAt).getTime() - startedDate.getTime()) / 1000)
                      : null;
                    return (
                      <div key={run.id} className="px-4 py-3 border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          {isSuccess ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            : isFailed ? <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            : <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 animate-pulse" />}
                          <span className={`text-xs font-medium ${isSuccess ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-amber-400'}`}>
                            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                          </span>
                          {duration !== null && (
                            <span className="text-[10px] text-muted-foreground/50 ml-auto">{duration}s</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60">
                          {startedDate.toLocaleString()}
                        </div>
                        {run.triggeredBy && (
                          <div className="text-[10px] text-muted-foreground/40 mt-0.5">by {run.triggeredBy}</div>
                        )}
                        <div className="text-[10px] font-mono text-muted-foreground/30 mt-0.5 truncate">{run.id}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right Sidebar - Property Panel */}
      <div className="relative flex-shrink-0">
        <AnimatePresence mode="wait" initial={false}>
          {showPropertyPanel && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: panelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={isResizingPanel ? { duration: 0 } : { duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="relative h-full border-l border-border bg-card overflow-hidden"
              style={{ width: panelWidth }}
            >
              {/* Drag-to-resize handle on left edge */}
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute left-0 top-0 w-1 h-full cursor-col-resize z-20 hover:bg-primary/40 transition-colors duration-150"
              />
              <div className="h-full" style={{ width: panelWidth }}>
                <PropertyPanel />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Button for Property Panel */}
        <button
          onClick={() => setShowPropertyPanel(!showPropertyPanel)}
          className={`
            absolute top-1/2 -translate-y-1/2 -left-6
            flex items-center justify-center
            w-6 h-16 rounded-l-lg
            bg-secondary hover:bg-secondary/80 border border-r-0 border-border
            text-muted-foreground hover:text-foreground
            transition-colors duration-150
            shadow-lg z-10
          `}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform duration-150 ${showPropertyPanel ? 'rotate-0' : 'rotate-180'}`}
          />
        </button>
      </div>

      {/* ── Import JSON Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson2 className="h-5 w-5 text-primary" />
              Import Flow from JSON
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Paste a compiled workflow JSON. Accepts both{' '}
              <code className="text-primary/80">compiled_nodes</code> /{' '}
              <code className="text-primary/80">compiled_edges</code> (backend format)
              or <code className="text-primary/80">nodes</code> /{' '}
              <code className="text-primary/80">edges</code> (builder format).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Textarea
              value={importJson}
              onChange={(e) => { setImportJson(e.target.value); setImportError(null); }}
              placeholder={'{ "compiled_nodes": [...], "compiled_edges": [...] }'}
              className="font-mono text-xs min-h-[260px] bg-background border-border"
              spellCheck={false}
              onWheel={(e) => e.stopPropagation()}
            />
            {importError && (
              <p className="text-sm text-red-400 flex items-center gap-1">⚠️ {importError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowImportDialog(false)} className="text-muted-foreground">
              Cancel
            </Button>
            <Button
              onClick={handleImportJson}
              disabled={!importJson.trim()}
              className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Import Flow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── My Workflows Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showWorkflowsDialog} onOpenChange={setShowWorkflowsDialog}>
        <DialogContent className="sm:max-w-[700px] bg-card border-border max-h-[80vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              My Workflows
            </DialogTitle>
            <DialogDescription>
              Browse and manage your saved automation workflows.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="w-full bg-secondary border-none rounded-md pl-9 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                placeholder="Search workflows..."
                value={workflowSearchQuery}
                onChange={(e) => setWorkflowSearchQuery(e.target.value)}
              />
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleOpenWorkflows} 
              disabled={isLoadingWorkflows}
              className="gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingWorkflows ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoadingWorkflows ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Loading workflows...</p>
              </div>
            ) : userWorkflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Workflow className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h4 className="text-base font-medium">No workflows found</h4>
                <p className="text-sm text-muted-foreground max-w-[280px] mt-1">
                  You haven't saved any workflows yet. Create and save a workflow to see it here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {userWorkflows
                  .filter(w => w.name.toLowerCase().includes(workflowSearchQuery.toLowerCase()))
                  .map((w) => (
                    <div 
                      key={w.id}
                      className="group flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/50 transition-all cursor-pointer"
                      onClick={() => handleLoadWorkflow(w)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                          <Workflow className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium group-hover:text-primary transition-colors">{w.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal text-muted-foreground">
                              v{w.version}
                            </Badge>
                            {w.isActive ? (
                              <Badge className="text-[10px] h-4 px-1.5 font-normal bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/15">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal text-muted-foreground/60">
                                Inactive
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {w.nodeCount} nodes • {new Date(w.metadata.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleToggleWorkflowActive(e, w.id, w.name, w.isActive)}
                          className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-md transition-all ${
                            w.isActive
                              ? 'hover:bg-amber-500/15 hover:text-amber-500 text-emerald-500'
                              : 'hover:bg-emerald-500/15 hover:text-emerald-500'
                          }`}
                          title={w.isActive ? 'Deactivate workflow' : 'Activate workflow'}
                        >
                          {w.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={(e) => handleDeleteWorkflow(e, w.id, w.name)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/15 hover:text-destructive transition-all"
                          title="Delete workflow"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
            <Button variant="ghost" size="sm" onClick={() => setShowWorkflowsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI Workflow Assistant Chatbot Dialog ─────────────────────────── */}
      <Dialog open={showAiAssistDialog} onOpenChange={(open) => { if (!aiAssistLoading) setShowAiAssistDialog(open); }}>
        <DialogContent className="sm:max-w-[580px] bg-card border-border flex flex-col p-0 gap-0 overflow-hidden" style={{ height: '75vh', maxHeight: '680px' }}>
          {/* Header */}
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold leading-none">AI Workflow Assistant</h2>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {aiWorkflowMode === 'current' && currentWorkflowName
                  ? `Working on: ${currentWorkflowName}`
                  : aiWorkflowMode === 'new'
                    ? 'Creating a new workflow'
                    : aiWorkflowMode === 'choose'
                      ? 'Select a workflow to work on'
                      : 'Choose a workflow or create a new one'}
              </p>
            </div>
            {aiWorkflowMode !== 'none' && (
              <button
                onClick={() => { setAiWorkflowMode('none'); setChatMessages([]); setChatInput(''); setAiPickerSearch(''); }}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Back to home"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Chat messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {/* Landing screen: shown when no messages yet */}
            {chatMessages.length === 0 && aiWorkflowMode === 'none' && (
              <div className="flex flex-col items-center justify-center h-full gap-6 pb-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">AI Workflow Assistant</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">Build, modify, or ask questions about your automations using natural language.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 w-full max-w-[320px]">
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm justify-start gap-3 bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10 text-foreground"
                    onClick={() => handleAiShowWorkflowPicker()}
                  >
                    <div className="w-8 h-8 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm">Choose Workflow</div>
                      <div className="text-xs text-muted-foreground">Open a saved workflow &amp; chat about it</div>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm justify-start gap-3 bg-primary/5 border-primary/20 hover:bg-primary/10 text-foreground"
                    onClick={() => handleEnterNewMode()}
                  >
                    <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm">Create New Workflow</div>
                      <div className="text-xs text-muted-foreground">Describe what to automate from scratch</div>
                    </div>
                  </Button>
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className="space-y-2">
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                      <Sparkles className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted text-foreground rounded-tl-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div
                        className="whitespace-pre-line [&>p]:mb-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:space-y-0.5"
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                            .replace(/^(\d+)\.\s/gm, '<br/><strong>$1.</strong> ')
                            .replace(/^[•●]\s?/gm, '<br/>• ')
                            .replace(/^\s*[-–]\s/gm, '<br/>– ')
                            .replace(/\n/g, '<br/>')
                            .replace(/^<br\/>/, ''),
                        }}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>

                {/* Quick Action Buttons — shown only at the landing screen (mode=none, first message) */}
                {i === chatMessages.length - 1 && msg.role === 'assistant' && aiWorkflowMode === 'none' && chatMessages.length === 1 && (
                  <div className="flex flex-wrap gap-2 ml-8 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold gap-1.5"
                      onClick={() => handleAiShowWorkflowPicker()}
                    >
                      <FolderOpen className="w-3 h-3" />
                      Choose Workflow
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary font-semibold gap-1.5"
                      onClick={() => handleEnterNewMode()}
                    >
                      <Plus className="w-3 h-3" />
                      Create New Workflow
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {aiAssistLoading && (
              <div className="flex justify-start">
                <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                  <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Workflow Picker Panel — shown when mode is 'choose' */}
          {aiWorkflowMode === 'choose' && (
            <div className="border-t border-border shrink-0 flex flex-col" style={{ maxHeight: '55%' }}>
              <div className="px-4 pt-3 pb-2 flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Search workflows..."
                    value={aiPickerSearch}
                    onChange={e => setAiPickerSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => setAiWorkflowMode('none')}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Back"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto px-3 pb-3 space-y-1">
                {aiPickerLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading workflows...</span>
                  </div>
                ) : aiPickerWorkflows.filter(w => w.name.toLowerCase().includes(aiPickerSearch.toLowerCase())).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Workflow className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">{aiPickerSearch ? `No workflows match "${aiPickerSearch}"` : 'No saved workflows yet.'}</p>
                  </div>
                ) : (
                  aiPickerWorkflows
                    .filter(w => w.name.toLowerCase().includes(aiPickerSearch.toLowerCase()))
                    .map(wf => (
                      <button
                        key={wf.id}
                        onClick={() => handleAiPickWorkflow(wf)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted border border-transparent hover:border-primary/20 transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Workflow className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium group-hover:text-primary transition-colors truncate">{wf.name}</div>
                          <div className="text-xs text-muted-foreground">{wf.nodeCount} nodes • {wf.isActive ? '🟢 Active' : '⚪ Inactive'}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    ))
                )}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="flex gap-2 px-4 py-3 border-t border-border shrink-0 bg-background/50">
            <Textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={aiWorkflowMode === 'choose' ? 'Select a workflow above...' : 'Describe what you want to automate...'}
              className="resize-none bg-background min-h-[44px] max-h-[120px] text-sm py-2.5"
              rows={1}
              disabled={aiAssistLoading || aiWorkflowMode === 'choose' || aiWorkflowMode === 'none'}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAiChatSend();
                }
              }}
            />
            <Button
              onClick={handleAiChatSend}
              disabled={aiAssistLoading || !chatInput.trim() || aiWorkflowMode === 'choose' || aiWorkflowMode === 'none'}
              size="icon"
              className="shrink-0 self-end h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Auto-Optimize Dialog ─────────────────────────────────────────── */}
      <Dialog open={showOptimizeDialog} onOpenChange={setShowOptimizeDialog}>
        <DialogContent className="sm:max-w-[520px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Auto-Optimize Flow
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {optimizeLoading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <p className="text-sm text-muted-foreground">Analyzing your workflow…</p>
              </div>
            ) : applyOptimizeLoading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <p className="text-sm text-muted-foreground">Applying optimizations to your canvas…</p>
              </div>
            ) : optimizeResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                  <div className={`text-2xl font-bold ${optimizeResult.score >= 80 ? 'text-green-500' : optimizeResult.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                    {optimizeResult.score}/100
                  </div>
                  <p className="text-sm text-muted-foreground flex-1">{optimizeResult.summary}</p>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {optimizeResult.suggestions.map((s, i) => (
                    <div key={i} className={`flex gap-2.5 p-3 rounded-lg border text-sm ${
                      s.type === 'warning' ? 'border-amber-500/30 bg-amber-500/5' :
                      s.type === 'improvement' ? 'border-blue-500/30 bg-blue-500/5' :
                      'border-border bg-muted/20'
                    }`}>
                      <span className="mt-0.5 shrink-0">{s.type === 'warning' ? '⚠️' : s.type === 'improvement' ? '💡' : '💬'}</span>
                      <div>
                        <p className="font-medium">{s.title}</p>
                        <p className="text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-1 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-3">Would you like the AI to automatically apply all these improvements?</p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-primary hover:bg-primary/90 gap-2"
                      onClick={handleApplyOptimize}
                      disabled={applyOptimizeLoading}
                    >
                      <Sparkles className="h-4 w-4" />
                      Optimize the Workflow
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowOptimizeDialog(false)}
                    >
                      Leave it
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          {!optimizeResult && !optimizeLoading && !applyOptimizeLoading && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOptimizeDialog(false)}>Close</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {/* ── Test with Sample Data Dialog ──────────────────────────────────── */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <Play className="h-4 w-4 text-amber-400" />
            <DialogTitle className="flex items-center gap-2">
              Test with Sample Data
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              The trigger node needs sample data to simulate a real event (e.g. an incoming WhatsApp message). Edit the JSON below to match your scenario, then click Run Test.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sample Trigger Data (JSON)</label>
              <textarea
                className="w-full h-52 p-3 rounded-lg bg-muted/60 border border-border text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                value={testSampleData}
                onChange={e => setTestSampleData(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300 space-y-1">
              <p className="font-semibold">💡 What each field does:</p>
              <p><code className="text-blue-200">from</code> — sender phone/email used by send nodes as recipient</p>
              <p><code className="text-blue-200">message</code> — the incoming message text</p>
              <p><code className="text-blue-200">conversationId</code> — links reply nodes to the right conversation</p>
              <p><code className="text-blue-200">contactId</code> — used for CRM lookups</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black gap-2"
              onClick={() => { setShowTestDialog(false); handleTestRun(); }}
            >
              <Play className="h-4 w-4" />
              Run Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Automations: React.FC = () => {
  // Load this tenant's live AI-authored custom nodes into the palette/schemas.
  useEffect(() => {
    customNodesApi.listLive()
      .then((defs) => {
        if (Array.isArray(defs) && defs.length) {
          registerCustomNodeSchemas(defs.map((d) => ({ nodeId: d.nodeId, label: d.label, description: d.description, kind: d.kind, schema: (d.schema as any) || [] })));
        }
      })
      .catch(() => { /* non-fatal: builder still works with built-in nodes */ });
  }, []);

  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
};

export default withPlanGate("automation.publish")(Automations);
