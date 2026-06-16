/**
 * GenericNode Component
 * ----------------------
 * Universal node component that renders based on schema data.
 * Uses React.memo for performance optimization.
 * Supports execution visualization with status-based styling.
 */

import React, { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useFlowStore } from '@/hooks/useFlowStore';
import { NodeData } from '@/hooks/useFlowStore';
import { useExecutionStore, NodeExecutionStatus } from '@/hooks/useExecutionStore';
import { Check, Loader2, AlertCircle } from 'lucide-react';

// Props interface for the GenericNode component
interface GenericNodeProps {
  id: string;
  data: NodeData;
  selected?: boolean;
}

// ============================================================================
// EXECUTION STATUS STYLES
// ============================================================================

const getExecutionStyles = (status: NodeExecutionStatus | undefined) => {
  switch (status) {
    case 'running':
      return {
        borderClass: 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-transparent animate-pulse',
        glowClass: 'shadow-[0_0_20px_rgba(250,204,21,0.5)]',
      };
    case 'completed':
      return {
        borderClass: 'ring-2 ring-green-500 ring-offset-2 ring-offset-transparent',
        glowClass: 'shadow-[0_0_15px_rgba(34,197,94,0.4)]',
      };
    case 'failed':
      return {
        borderClass: 'ring-2 ring-red-500 ring-offset-2 ring-offset-transparent',
        glowClass: 'shadow-[0_0_15px_rgba(239,68,68,0.4)]',
      };
    case 'pending':
      return {
        borderClass: 'ring-1 ring-muted-foreground/50',
        glowClass: '',
      };
    default:
      return {
        borderClass: '',
        glowClass: '',
      };
  }
};

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

const StatusBadge: React.FC<{ status: NodeExecutionStatus | undefined }> = ({ status }) => {
  if (!status || status === 'pending') return null;

  const badgeConfig = {
    running: {
      bg: 'bg-yellow-500',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      text: 'Running...',
    },
    completed: {
      bg: 'bg-green-500',
      icon: <Check className="h-3 w-3" />,
      text: 'Done',
    },
    failed: {
      bg: 'bg-red-500',
      icon: <AlertCircle className="h-3 w-3" />,
      text: 'Failed',
    },
  };

  const config = badgeConfig[status];
  if (!config) return null;

  return (
    <div
      className={`
        absolute -top-2 -right-2 z-10
        flex items-center gap-1 px-2 py-0.5 rounded-full
        ${config.bg} text-white text-[10px] font-semibold
        shadow-lg
      `}
    >
      {config.icon}
      <span>{config.text}</span>
    </div>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

const GenericNode: React.FC<GenericNodeProps> = ({ id, data, selected }) => {
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);

  // Subscribe to execution store for this node's status
  const nodeStatus = useExecutionStore((state) => state.nodeStatuses[id]);
  const isRunning = useExecutionStore((state) => state.isRunning);

  const isSelected = selectedNodeId === id || selected;

  // Get execution styling
  const executionStyles = getExecutionStyles(nodeStatus);

  // Get icon component from schema
  const IconComponent = data.schema?.iconComponent;

  // Handle node click
  const handleClick = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  // Generate summary text from config
  const getSummaryText = (): string => {
    const config = data.config || {};
    
    switch (data.nodeType) {
      case 'trigger':
        return config.trigger_type 
          ? `On: ${config.trigger_type}` 
          : 'Configure trigger...';
      
      case 'action':
        if (config.action_type && config.target) {
          return `${config.action_type}: ${config.target}`;
        }
        return config.action_type ? `Type: ${config.action_type}` : 'Configure action...';
      
      case 'wait':
        if (config.wait_type === 'duration' && config.duration_value) {
          return `Wait ${config.duration_value} ${config.duration_unit || 'hours'}`;
        }
        if (config.wait_type === 'signal') {
          return config.signal_name ? `Until: ${config.signal_name}` : 'Wait for signal...';
        }
        return 'Configure wait...';
      
      case 'ai_decision':
        if (config.confidence_threshold) {
          return `Confidence ≥ ${config.confidence_threshold}%`;
        }
        return config.ai_task ? `Task: ${config.ai_task}` : 'Configure AI...';
      
      case 'approval':
        return config.title ? `${config.title}` : 'Configure approval...';
      
      default:
        return 'Click to configure';
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        relative px-4 py-3 rounded-xl shadow-lg min-w-[180px] max-w-[220px]
        bg-gradient-to-r ${data.schema?.color || 'from-muted to-muted/80'}
        text-white cursor-pointer transition-all duration-200
        ${isSelected && !isRunning ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent shadow-xl scale-105' : ''}
        ${!isSelected && !isRunning ? 'hover:shadow-xl hover:scale-102' : ''}
        ${isRunning ? executionStyles.borderClass : ''}
        ${isRunning ? executionStyles.glowClass : ''}
      `}
    >
      {/* Execution Status Badge */}
      {isRunning && <StatusBadge status={nodeStatus} />}

      {/* Input Handle - Top (not for trigger nodes) */}
      {data.nodeType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          id="target"
          className="!bg-white !w-3 !h-3 !border-2 !border-current"
        />
      )}

      {/* Node Content */}
      <div className="flex items-center gap-2 mb-1">
        {IconComponent && <IconComponent className="h-4 w-4 flex-shrink-0" />}
        <span className="font-semibold text-sm truncate">{data.label}</span>
      </div>

      {/* Summary Text */}
      <div className="text-xs text-white/80 truncate">
        {getSummaryText()}
      </div>

      {/* Output Handle - Bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!bg-white !w-3 !h-3 !border-2 !border-current"
      />

      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full shadow-md" />
      )}
    </div>
  );
};

// Memoize for performance - prevents re-renders on canvas drag
export default memo(GenericNode);
