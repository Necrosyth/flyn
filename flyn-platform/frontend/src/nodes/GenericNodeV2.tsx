/**
 * GenericNode Component - Professional Redesign
 * ----------------------------------------------
 * Clean, professional node component with inline expanding configuration.
 * Features muted colors, smooth animations, and embedded property editing.
 */

import React, { memo, useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFlowStore } from '@/hooks/useFlowStore';
import { NodeData } from '@/hooks/useFlowStore';
import { useExecutionStore, NodeExecutionStatus } from '@/hooks/useExecutionStore';
import { useTestRunStore } from '@/hooks/useTestRunStore';
import { 
  Check, 
  Loader2, 
  AlertCircle, 
  ChevronDown, 
  Settings2,
  Trash2 
} from 'lucide-react';
import { SchemaField } from '@/config/nodeSchemas';
import { useDynamicSchemaFields } from '@/hooks/useDynamicSchemaFields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Props interface
interface GenericNodeProps {
  id: string;
  data: NodeData;
  selected?: boolean;
}

// ============================================================================
// PROFESSIONAL COLOR PALETTE (Muted, Enterprise-grade)
// ============================================================================

const NODE_COLORS: Record<string, { bg: string; border: string; accent: string; icon: string }> = {
  // ── Triggers ──────────────────────────────────────────────────────────────
  trigger: {
    bg: 'bg-card', border: 'border-emerald-500/40',
    accent: 'bg-emerald-500', icon: 'text-emerald-400',
  },
  inbox_trigger: {
    bg: 'bg-card', border: 'border-sky-500/40',
    accent: 'bg-sky-500', icon: 'text-sky-400',
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  action: {
    bg: 'bg-card', border: 'border-violet-500/40',
    accent: 'bg-violet-500', icon: 'text-violet-400',
  },
  send_reply: {
    bg: 'bg-card', border: 'border-teal-500/40',
    accent: 'bg-teal-500', icon: 'text-teal-400',
  },
  vapi: {
    bg: 'bg-card', border: 'border-purple-700/40',
    accent: 'bg-purple-700', icon: 'text-purple-400',
  },
  voice_agent: {
    bg: 'bg-card', border: 'border-indigo-500/40',
    accent: 'bg-indigo-500', icon: 'text-indigo-400',
  },
  webrtc: {
    bg: 'bg-card', border: 'border-sky-600/40',
    accent: 'bg-sky-600', icon: 'text-sky-400',
  },

  // ── Logic & Flow ──────────────────────────────────────────────────────────
  wait: {
    bg: 'bg-card', border: 'border-blue-500/40',
    accent: 'bg-blue-500', icon: 'text-blue-400',
  },
  decision: {
    bg: 'bg-card', border: 'border-amber-500/40',
    accent: 'bg-amber-500', icon: 'text-amber-400',
  },
  approval: {
    bg: 'bg-card', border: 'border-indigo-500/40',
    accent: 'bg-indigo-500', icon: 'text-indigo-400',
  },
  iterator: {
    bg: 'bg-card', border: 'border-orange-500/40',
    accent: 'bg-orange-500', icon: 'text-orange-400',
  },
  split: {
    bg: 'bg-card', border: 'border-fuchsia-500/40',
    accent: 'bg-fuchsia-500', icon: 'text-fuchsia-400',
  },
  join: {
    bg: 'bg-card', border: 'border-fuchsia-700/40',
    accent: 'bg-fuchsia-700', icon: 'text-fuchsia-400',
  },
  end: {
    bg: 'bg-card', border: 'border-red-500/40',
    accent: 'bg-red-500', icon: 'text-red-400',
  },

  // ── AI & Intelligence ─────────────────────────────────────────────────────
  ai_decision: {
    bg: 'bg-card', border: 'border-pink-500/40',
    accent: 'bg-pink-500', icon: 'text-pink-400',
  },
  ai_action: {
    bg: 'bg-card', border: 'border-purple-500/40',
    accent: 'bg-purple-500', icon: 'text-purple-400',
  },
  ai_router: {
    bg: 'bg-card', border: 'border-rose-600/40',
    accent: 'bg-rose-600', icon: 'text-rose-400',
  },

  // ── Data & Integration ────────────────────────────────────────────────────
  query_records: {
    bg: 'bg-card', border: 'border-cyan-500/40',
    accent: 'bg-cyan-500', icon: 'text-cyan-400',
  },
  mongodb: {
    bg: 'bg-card', border: 'border-green-500/40',
    accent: 'bg-green-500', icon: 'text-green-400',
  },
  postgresql: {
    bg: 'bg-card', border: 'border-blue-700/40',
    accent: 'bg-blue-700', icon: 'text-blue-400',
  },
  mysql: {
    bg: 'bg-card', border: 'border-orange-400/40',
    accent: 'bg-orange-400', icon: 'text-orange-300',
  },
  merge: {
    bg: 'bg-card', border: 'border-teal-400/40',
    accent: 'bg-teal-400', icon: 'text-teal-300',
  },

  // ── Plugins ───────────────────────────────────────────────────────────────
  crm: {
    bg: 'bg-card', border: 'border-violet-700/40',
    accent: 'bg-violet-700', icon: 'text-violet-400',
  },
  hr: {
    bg: 'bg-card', border: 'border-yellow-500/40',
    accent: 'bg-yellow-500', icon: 'text-yellow-400',
  },
  church: {
    bg: 'bg-card', border: 'border-pink-600/40',
    accent: 'bg-pink-600', icon: 'text-pink-400',
  },
  freelancer: {
    bg: 'bg-card', border: 'border-teal-600/40',
    accent: 'bg-teal-600', icon: 'text-teal-400',
  },
  coaches: {
    bg: 'bg-card', border: 'border-violet-500/40',
    accent: 'bg-violet-500', icon: 'text-violet-400',
  },

  default: {
    bg: 'bg-card', border: 'border-muted-foreground/40',
    accent: 'bg-muted-foreground', icon: 'text-muted-foreground',
  },
};

// ============================================================================
// EXECUTION STATUS
// ============================================================================

const getExecutionStyles = (status: NodeExecutionStatus | undefined) => {
  switch (status) {
    case 'running':
      return 'ring-2 ring-yellow-400/70 shadow-[0_0_20px_rgba(250,204,21,0.3)]';
    case 'completed':
      return 'ring-2 ring-emerald-400/70 shadow-[0_0_15px_rgba(52,211,153,0.3)]';
    case 'failed':
      return 'ring-2 ring-red-400/70 shadow-[0_0_15px_rgba(248,113,113,0.3)]';
    case 'pending':
      return 'ring-1 ring-border/50';
    default:
      return '';
  }
};

const StatusIndicator: React.FC<{ status: NodeExecutionStatus | undefined }> = ({ status }) => {
  if (!status) return null;

  const config = {
    running: { color: 'bg-yellow-400', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { color: 'bg-emerald-400', icon: <Check className="h-3 w-3" /> },
    failed: { color: 'bg-red-400', icon: <AlertCircle className="h-3 w-3" /> },
    pending: { color: 'bg-muted-foreground', icon: null },
  };

  const { color, icon } = config[status] || config.pending;

  return (
    <div className={`absolute -top-1.5 -right-1.5 ${color} rounded-full p-1 shadow-lg`}>
      {icon && <span className="text-white">{icon}</span>}
    </div>
  );
};

// ============================================================================
// TEST DATA BADGE — Shows when real test data exists for this node
// ============================================================================

const TestDataBadge: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const hasTestData = useTestRunStore((s) => s.hasTestData);
  const nodeOutput = useTestRunStore((s) => s.nodeOutputs[nodeId]);

  if (!hasTestData || nodeOutput == null) return null;

  // Count top-level keys if it's an object
  const keyCount = typeof nodeOutput === 'object' && nodeOutput !== null
    ? Object.keys(nodeOutput).length
    : 1;

  return (
    <div className="absolute -bottom-1.5 -right-1.5 z-10">
      <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/90 rounded-full shadow-lg">
        <Check className="h-2.5 w-2.5 text-white" />
        <span className="text-[9px] text-white font-bold">{keyCount}</span>
      </div>
    </div>
  );
};

// ============================================================================
// INLINE FORM COMPONENTS
// ============================================================================

interface InlineFieldProps {
  field: SchemaField;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}

const InlineField: React.FC<InlineFieldProps> = ({ field, value, onChange }) => {
  const handleChange = (newValue: unknown) => {
    onChange(field.name, newValue);
  };

  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground font-medium">
            {field.label}
          </Label>
          <Input
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={field.placeholder}
            className="h-8 text-xs bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 focus:border-border"
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground font-medium">
            {field.label}
          </Label>
          <Textarea
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={field.placeholder}
            className="min-h-[60px] text-xs bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 resize-none focus:border-border"
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground font-medium">
            {field.label}
          </Label>
          <Select
            value={(value as string) || (field.default as string) || ''}
            onValueChange={handleChange}
          >
            <SelectTrigger className="h-8 text-xs bg-secondary border-border text-foreground">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground font-medium">
            {field.label}
          </Label>
          <Input
            type="number"
            value={(value as number) ?? (field.default as number) ?? ''}
            onChange={(e) => handleChange(Number(e.target.value))}
            min={field.min}
            max={field.max}
            className="h-8 text-xs bg-secondary border-border text-foreground focus:border-border"
          />
        </div>
      );

    case 'toggle':
    case 'checkbox':
      return (
        <div className="flex items-center justify-between py-1.5 px-1 rounded-md bg-secondary/50">
          <Label className="text-[11px] text-muted-foreground font-medium">
            {field.label}
          </Label>
          <Switch
            checked={(value as boolean) ?? (field.default as boolean) ?? false}
            onCheckedChange={handleChange}
            className="scale-90"
          />
        </div>
      );

    case 'slider':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground font-medium">
              {field.label}
            </Label>
            <span className="text-[11px] text-foreground font-mono bg-secondary px-2 py-0.5 rounded">
              {String((value as number) ?? (field.default as number) ?? field.min)}
            </span>
          </div>
          <Slider
            value={[(value as number) ?? (field.default as number) ?? field.min ?? 0]}
            onValueChange={([v]) => handleChange(v)}
            min={field.min}
            max={field.max}
            step={field.step}
            className="py-1"
          />
        </div>
      );

    default:
      return null;
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const GenericNode: React.FC<GenericNodeProps> = ({ id, data, selected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const updateNodeConfig = useFlowStore((state) => state.updateNodeConfig);
  const removeNode = useFlowStore((state) => state.removeNode);

  const nodeStatus = useExecutionStore((state) => state.nodeStatuses[id]);
  const isRunning = useExecutionStore((state) => state.isRunning);

  const isSelected = selectedNodeId === id || selected;
  const colors = NODE_COLORS[data.nodeType] || NODE_COLORS.default;
  const IconComponent = data.schema?.iconComponent;
  const staticFields = data.schema?.fields || [];
  const fields = useDynamicSchemaFields(data.nodeType, staticFields);

  // Handle node click
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  // Toggle expansion
  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
    setSelectedNode(id);
  }, [isExpanded, id, setSelectedNode]);

  // Handle field change
  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    updateNodeConfig(id, fieldName, value);
  }, [id, updateNodeConfig]);

  // Handle delete
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeNode(id);
  }, [id, removeNode]);

  // Get summary text
  const getSummaryText = (): string => {
    const config = data.config || {};
    
    switch (data.nodeType) {
      case 'trigger':
        return config.trigger_type ? `${config.trigger_type}` : 'Configure...';
      case 'action':
        return config.action_type ? `${config.action_type}` : 'Configure...';
      case 'query_records':
        return config.resource ? `${config.operation || 'List'} ${config.resource}` : 'Configure...';
      case 'iterator':
        return config.list_source ? `Loop: ${String(config.list_source).slice(0, 20)}...` : 'Configure...';
      case 'ai_action':
        return config.target_plugin ? `${config.target_plugin}` : 'Configure...';
      case 'ai_decision':
        return config.ai_task ? `${config.ai_task}` : 'Configure...';
      case 'wait':
        return config.wait_type ? `${config.wait_type}` : 'Configure...';
      case 'approval':
        return (config.title as string) || 'Configure...';
      default:
        return 'Configure...';
    }
  };

  return (
    <motion.div
      layout
      onClick={handleClick}
      className={`
        relative rounded-lg border-2 shadow-xl cursor-pointer
        ${colors.bg} ${colors.border}
        ${isSelected && !isRunning ? 'ring-2 ring-foreground/30' : ''}
        ${isRunning ? getExecutionStyles(nodeStatus) : ''}
        transition-all duration-200
      `}
      style={{ minWidth: isExpanded ? 280 : 200, maxWidth: isExpanded ? 320 : 220 }}
    >
      {/* Execution Status */}
      {isRunning && <StatusIndicator status={nodeStatus} />}

      {/* Test Data Badge — shows when real data exists */}
      <TestDataBadge nodeId={id} />

      {/* Input Handle */}
      {data.nodeType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-border hover:!bg-foreground transition-colors"
        />
      )}

      {/* Header */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Accent Bar */}
            <div className={`w-1 h-8 rounded-full ${colors.accent}`} />
            
            {/* Icon */}
            {IconComponent && (
              <IconComponent className={`h-4 w-4 flex-shrink-0 ${colors.icon}`} />
            )}
            
            {/* Title */}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {data.label}
              </h3>
              <p className="text-[11px] text-muted-foreground truncate">
                {getSummaryText()}
              </p>
            </div>
          </div>

          {/* Expand Button */}
          <button
            onClick={handleToggleExpand}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <ChevronDown 
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
            />
          </button>
        </div>
      </div>

      {/* Expandable Config Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-border/50"
          >
            <div 
              className="p-3 space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar nowheel"
              onWheelCapture={(e) => {
                // Prevent canvas zoom when scrolling inside the panel
                e.stopPropagation();
              }}
            >
              {/* Config Badge */}
              <div className="flex items-center gap-2">
                <Settings2 className="h-3 w-3 text-muted-foreground" />
                <Badge variant="secondary" className="text-[10px] bg-secondary text-foreground/80 font-medium">
                  Configuration
                </Badge>
              </div>

              {/* Render Fields (first 5 only for inline) */}
              {fields.slice(0, 5).filter(f => f.type !== 'section').map((field) => (
                <InlineField
                  key={field.name}
                  field={field}
                  value={data.config?.[field.name]}
                  onChange={handleFieldChange}
                />
              ))}

              {/* More fields indicator */}
              {fields.length > 5 && (
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  +{fields.length - 5} more options in side panel
                </p>
              )}

              {/* Delete Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="w-full h-7 text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete Node
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-border hover:!bg-foreground transition-colors"
      />
    </motion.div>
  );
};

export default memo(GenericNode);
