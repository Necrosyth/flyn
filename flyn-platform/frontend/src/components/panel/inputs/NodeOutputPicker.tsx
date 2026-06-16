import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useFlowStore } from '@/hooks/useFlowStore';
import { useTestRunStore, extractOutputPaths, OutputPath } from '@/hooks/useTestRunStore';
import {
  getUpstreamNodes,
  getNodeReferenceName,
  NODE_OUTPUTS,
  TRIGGER_TYPE_OUTPUTS,
  NodeOutputField,
} from '@/utils/variableSuggestions';
import { Badge } from '@/components/ui/badge';
import { Database, ChevronDown, Sparkles, Zap, CheckCircle2, Copy, BookOpen } from 'lucide-react';
import { Edge } from '@xyflow/react';

// ============================================================================
// TYPES
// ============================================================================

interface NodeOutputPickerProps {
  /** The ID of the node being configured (to find its upstream nodes) */
  currentNodeId: string;
  /** Callback when user selects a variable path */
  onInsert: (templateVar: string) => void;
  /** Optional className */
  className?: string;
}

// ============================================================================
// VALUE PREVIEW
// ============================================================================

const ValuePreview: React.FC<{ value: unknown; type: string }> = ({ value, type }) => {
  const display = (() => {
    if (value === null || value === undefined) return 'null';
    if (type === 'array') return String(value);
    if (type === 'object') return '{…}';
    const str = String(value);
    return str.length > 40 ? str.slice(0, 40) + '…' : str;
  })();

  const color = (() => {
    switch (type) {
      case 'string': return 'text-emerald-400';
      case 'number': return 'text-cyan-400';
      case 'boolean': return 'text-amber-400';
      case 'array': return 'text-purple-400';
      case 'object': return 'text-blue-400';
      default: return 'text-muted-foreground';
    }
  })();

  return <span className={`${color} truncate max-w-[160px] inline-block align-bottom`}>{display}</span>;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const NodeOutputPicker: React.FC<NodeOutputPickerProps> = ({
  currentNodeId,
  onInsert,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updateDropdownPosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 600; // approx max height
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: 420,
      zIndex: 9999,
      ...(showAbove
        ? { bottom: viewportHeight - rect.top + 6, top: 'auto' }
        : { top: rect.bottom + 6, bottom: 'auto' }),
    });
  }, []);

  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges) as Edge[];
  const hasTestData = useTestRunStore((s) => s.hasTestData);
  const nodeOutputs = useTestRunStore((s) => s.nodeOutputs);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        wrapperRef.current && !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Update position when open
  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  // Get all upstream nodes, annotated with test data or schema fallback
  const upstreamWithData = useMemo(() => {
    const upstream = getUpstreamNodes(currentNodeId, nodes, edges);
    return upstream.map((n) => {
      const output = nodeOutputs[n.id] ?? null;
      const livePaths: OutputPath[] = output ? extractOutputPaths(output) : [];
      // Schema fallback fields when no test data
      let schemaFields: NodeOutputField[] = [];
      if (!output) {
        const nodeType = n.data.nodeType as string;
        if (nodeType === 'trigger') {
          const triggerType = (n.data.config?.trigger_type as string) || '';
          const typeOutputs = TRIGGER_TYPE_OUTPUTS[triggerType] ?? [];
          const baseOutputs = NODE_OUTPUTS['trigger'] ?? [];
          schemaFields = [...typeOutputs, ...baseOutputs.filter(b => !typeOutputs.some(t => t.field === b.field))];
        } else {
          schemaFields = NODE_OUTPUTS[nodeType] ?? [];
        }
      }
      return { node: n, output, livePaths, schemaFields, refName: getNodeReferenceName(n) };
    });
  }, [currentNodeId, nodes, edges, nodeOutputs]);

  if (upstreamWithData.length === 0) {
    return null; // No upstream nodes at all
  }

  const handleSelect = (nodeId: string, path: string) => {
    const templateVar = `{{${nodeId}.${path}}}`;
    onInsert(templateVar);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const anyLiveData = upstreamWithData.some((u) => u.livePaths.length > 0);

  const dropdownContent = isOpen && (
    <div ref={dropdownRef} style={dropdownStyle}>
      <div className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 bg-card border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              {anyLiveData ? (
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <BookOpen className="h-3.5 w-3.5 text-blue-400" />
              )}
              <span className="text-xs font-semibold text-foreground">
                {anyLiveData ? 'Insert from Test Data' : 'Insert Variable'}
              </span>
            </div>
            <Badge
              variant="secondary"
              className={anyLiveData
                ? 'text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20'
              }
            >
              {anyLiveData ? 'Live Data' : 'Schema'}
            </Badge>
          </div>

          {/* Body */}
          <div
            className="max-h-[55vh] overflow-y-auto custom-scrollbar"
            onWheel={(e) => e.stopPropagation()}
          >
            {upstreamWithData.map(({ node, livePaths, schemaFields, refName }) => {
              const nodeLabel = node.data.label || node.data.nodeType;
              const hasLive = livePaths.length > 0;

              return (
                <div key={node.id}>
                  {/* Node Header */}
                  <div className="px-3 py-1.5 bg-secondary/50 border-y border-border/50 flex items-center gap-2 sticky top-0 z-10">
                    <Zap className="h-3 w-3 text-amber-400" />
                    <span className="text-[11px] font-semibold text-foreground/80">{nodeLabel}</span>
                    {hasLive && (
                      <Badge className="text-[9px] h-4 px-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 ml-1">Live</Badge>
                    )}
                    <span className="text-[9px] text-muted-foreground/50 font-mono ml-auto">
                      {node.id.slice(-8)}
                    </span>
                  </div>

                  {/* Live test data paths */}
                  {hasLive && livePaths.map((p: OutputPath) => (
                    <button
                      key={`${node.id}-live-${p.path}`}
                      type="button"
                      onClick={() => handleSelect(node.id, p.path)}
                      className="w-full px-3 py-1.5 text-left hover:bg-accent/10 transition-colors flex items-center gap-2 group"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="font-mono text-[11px] text-primary/80 truncate">{p.path}</span>
                        <span className="text-[9px] text-muted-foreground/40">→</span>
                        <span className="text-[11px]">
                          <ValuePreview value={p.value} type={p.type} />
                        </span>
                      </div>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {copiedPath === p.path ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </span>
                    </button>
                  ))}

                  {/* Schema fallback fields when no live data */}
                  {!hasLive && schemaFields.length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-muted-foreground/50 italic">
                      No variable hints available for this node type
                    </div>
                  )}
                  {!hasLive && schemaFields.map((f: NodeOutputField) => (
                    <button
                      key={`${node.id}-schema-${f.field}`}
                      type="button"
                      onClick={() => handleSelect(refName, f.field)}
                      className="w-full px-3 py-1.5 text-left hover:bg-accent/10 transition-colors flex items-center gap-2 group"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[11px] text-primary/80 block truncate">{f.field}</span>
                        <span className="text-[10px] text-muted-foreground/50">{f.description}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] text-muted-foreground/30 bg-muted/40 px-1 py-0.5 rounded font-mono">
                          {f.type ?? 'any'}
                        </span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {copiedPath === f.field ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 bg-card border-t border-border">
            <p className="text-[10px] text-muted-foreground/60">
              Click to insert as <code className="text-primary/60">{'{{nodeId.field}}'}</code>
              {!anyLiveData && ' · Run a test to see live values'}
            </p>
          </div>
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={anyLiveData ? 'Insert from test data' : 'Insert variable from schema'}
        className={`
          inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium
          transition-all duration-150
          ${isOpen
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            : 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-400'
          }
        `}
      >
        <Database className="h-3 w-3" />
        Test Data
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {dropdownContent && ReactDOM.createPortal(dropdownContent, document.body)}
    </div>
  );
};

export default NodeOutputPicker;
