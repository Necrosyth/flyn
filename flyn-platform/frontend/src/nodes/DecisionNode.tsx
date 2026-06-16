/**
 * DecisionNode Component
 * -----------------------
 * Special node with dual output handles for true/false branching.
 * Matches GenericNodeV2 professional theme — card-based, expandable config.
 * Uses React.memo for performance optimization.
 */

import React, { memo, useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, ChevronDown, Settings2, Trash2, Check, Loader2, AlertCircle } from 'lucide-react';
import { useFlowStore } from '@/hooks/useFlowStore';
import { NodeData } from '@/hooks/useFlowStore';
import { useExecutionStore, NodeExecutionStatus } from '@/hooks/useExecutionStore';
import { SchemaField } from '@/config/nodeSchemas';
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
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// EXECUTION STATUS (identical to GenericNodeV2)
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
    <div className={`absolute -top-1.5 -right-1.5 ${color} rounded-full p-1 shadow-lg z-10`}>
      {icon && <span className="text-white">{icon}</span>}
    </div>
  );
};

// ============================================================================
// INLINE FIELD (same as GenericNodeV2)
// ============================================================================

interface InlineFieldProps {
  field: SchemaField;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}

const InlineField: React.FC<InlineFieldProps> = ({ field, value, onChange }) => {
  const handleChange = (newValue: unknown) => onChange(field.name, newValue);

  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground font-medium">{field.label}</Label>
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
          <Label className="text-[11px] text-muted-foreground font-medium">{field.label}</Label>
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
          <Label className="text-[11px] text-muted-foreground font-medium">{field.label}</Label>
          <Select value={(value as string) || (field.default as string) || ''} onValueChange={handleChange}>
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
          <Label className="text-[11px] text-muted-foreground font-medium">{field.label}</Label>
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
          <Label className="text-[11px] text-muted-foreground font-medium">{field.label}</Label>
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
            <Label className="text-[11px] text-muted-foreground font-medium">{field.label}</Label>
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
// OPERATOR DISPLAY MAP
// ============================================================================

const OPERATOR_LABELS: Record<string, string> = {
  equals: '=',
  not_equals: '≠',
  greater_than: '>',
  less_than: '<',
  greater_or_equal: '≥',
  less_or_equal: '≤',
  contains: 'contains',
  starts_with: 'starts with',
};

// ============================================================================
// COMPONENT
// ============================================================================

interface DecisionNodeProps {
  id: string;
  data: NodeData;
  selected?: boolean;
}

const DecisionNode: React.FC<DecisionNodeProps> = ({ id, data, selected }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const updateNodeConfig = useFlowStore((state) => state.updateNodeConfig);
  const removeNode = useFlowStore((state) => state.removeNode);

  const nodeStatus = useExecutionStore((state) => state.nodeStatuses[id]);
  const isRunning = useExecutionStore((state) => state.isRunning);

  const isSelected = selected && selectedNodeId === id;
  const fields = data.schema?.fields || [];

  // Get branch labels from config
  const trueLabel = (data.config?.true_label as string) || 'Yes';
  const falseLabel = (data.config?.false_label as string) || 'No';

  // Handle node click
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  // Toggle expansion
  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  // Handle field change
  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    updateNodeConfig(id, fieldName, value);
  }, [id, updateNodeConfig]);

  // Handle delete
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeNode(id);
  }, [id, removeNode]);

  // Generate summary text from config
  const getSummaryText = (): string => {
    const config = data.config || {};
    if (config.field_name && config.compare_value) {
      const op = OPERATOR_LABELS[config.operator as string] || config.operator || '=';
      return `${config.field_name} ${op} ${config.compare_value}`;
    }
    if (config.condition_type) {
      return `${config.condition_type}`;
    }
    return 'Configure...';
  };

  return (
    <motion.div
      layout
      onClick={handleClick}
      className={`
        relative rounded-lg border-2 shadow-xl cursor-pointer
        bg-card border-amber-500/40
        ${isSelected && !isRunning ? 'ring-2 ring-foreground/30' : ''}
        ${isRunning ? getExecutionStyles(nodeStatus) : ''}
        transition-all duration-200
      `}
      style={{ minWidth: isExpanded ? 280 : 200, maxWidth: isExpanded ? 320 : 220 }}
    >
      {/* Execution Status */}
      {isRunning && <StatusIndicator status={nodeStatus} />}

      {/* Input Handle - Left */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-border hover:!bg-foreground transition-colors"
      />

      {/* Header */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Accent Bar */}
            <div className="w-1 h-8 rounded-full bg-amber-500" />

            {/* Icon */}
            <GitBranch className="h-4 w-4 flex-shrink-0 text-amber-400" />

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
              onWheelCapture={(e) => e.stopPropagation()}
            >
              {/* Config Badge */}
              <div className="flex items-center gap-2">
                <Settings2 className="h-3 w-3 text-muted-foreground" />
                <Badge variant="secondary" className="text-[10px] bg-secondary text-foreground/80 font-medium">
                  Configuration
                </Badge>
              </div>

              {/* Render Fields */}
              {fields.filter((f) => f.type !== 'section').map((field) => (
                <InlineField
                  key={field.name}
                  field={field}
                  value={data.config?.[field.name]}
                  onChange={handleFieldChange}
                />
              ))}

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

      {/* Branch Labels Bar */}
      <div className="border-t border-border/50 px-3 py-2 flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400">{trueLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-red-400">{falseLabel}</span>
          <div className="w-2 h-2 rounded-full bg-red-400" />
        </div>
      </div>

      {/* Output Handles - Right side (Two handles for branching) */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        className="!bg-emerald-400 !w-3 !h-3 !border-2 !border-border !top-[35%]"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        className="!bg-red-400 !w-3 !h-3 !border-2 !border-border !top-[75%]"
      />
    </motion.div>
  );
};

// Memoize for performance - prevents re-renders on canvas drag
export default memo(DecisionNode);
