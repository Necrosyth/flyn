/**
 * PropertyPanel Component
 * -----------------------
 * Dynamic form panel that renders fields based on selected node's schema.
 */

import React, { useState, useCallback } from 'react';
import { X, Trash2, Wifi, WifiOff, AlertCircle, ChevronDown, Layers, FlaskConical, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useFlowStore, useSelectedNode } from '@/hooks/useFlowStore';
import { SchemaField } from '@/config/nodeSchemas';
import { useDynamicSchemaFields } from '@/hooks/useDynamicSchemaFields';
import { MODULE_SCHEMAS, getTableByKey } from '@/config/moduleTableSchemas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import NodeTestPanel from './NodeTestPanel';
import {
  TextInput,
  SelectInput,
  TextareaInput,
  ToggleInput,
  NumberInput,
  SliderInput,
  SectionInput,
  VariableInput,
} from './inputs';
import NodeOutputPicker from './inputs/NodeOutputPicker';
import { useTestRunStore } from '@/hooks/useTestRunStore';
import { getVariableSuggestions, VariableSuggestion, TRIGGER_TYPE_OUTPUTS, NODE_OUTPUTS } from '@/utils/variableSuggestions';
import { Edge } from '@xyflow/react';

// ============================================================================
// CONDITION BUILDER COMPONENT
// ============================================================================

const CONDITION_OPERATORS = [
  { value: 'equals',          label: '= equals' },
  { value: 'not_equals',      label: '≠ not equals' },
  { value: 'contains',        label: '⊃ contains' },
  { value: 'not_contains',    label: '⊅ not contains' },
  { value: 'starts_with',     label: '↵ starts with' },
  { value: 'ends_with',       label: '↳ ends with' },
  { value: 'greater_than',    label: '> greater than' },
  { value: 'less_than',       label: '< less than' },
  { value: 'greater_or_equal',label: '≥ ≥' },
  { value: 'less_or_equal',   label: '≤ ≤' },
  { value: 'is_empty',        label: '∅ is empty' },
  { value: 'is_not_empty',    label: '◉ is not empty' },
  { value: 'exists',          label: '✓ exists' },
];
const UNARY_OPS = new Set(['is_empty', 'is_not_empty', 'exists']);

interface ConditionBuilderProps {
  fieldName: string;
  label: string;
  required?: boolean;
  value: { field?: string; operator?: string; value?: string };
  onChange: (name: string, val: unknown) => void;
  currentNodeId: string;
}

const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  fieldName, label, required, value: cond, onChange, currentNodeId,
}) => {
  const [showVarPicker, setShowVarPicker] = useState(false);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges) as Edge[];
  const suggestions: VariableSuggestion[] = getVariableSuggestions(currentNodeId, nodes, edges);
  const noValueNeeded = UNARY_OPS.has(cond.operator || '');

  const set = (patch: Partial<typeof cond>) => onChange(fieldName, { ...cond, ...patch });

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
        {/* Field / variable input */}
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Field / Variable</span>
          <div className="relative">
            <input
              type="text"
              value={cond.field || ''}
              onChange={(e) => set({ field: e.target.value })}
              placeholder="{{trigger.data.status}} or field name"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 pr-8 text-xs font-mono outline-none focus:border-primary"
            />
            <div className="absolute right-1 top-1">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowVarPicker((v) => !v)}
                  className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors text-[10px] font-mono leading-none"
                  title="Pick a variable"
                >
                  {'{ }'}
                </button>
                {showVarPicker && suggestions.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-popover border border-border rounded-lg shadow-xl max-h-56 overflow-y-auto custom-scrollbar">
                    {suggestions.slice(0, 40).map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { set({ field: s.value }); setShowVarPicker(false); }}
                        className="w-full px-3 py-1.5 text-left hover:bg-accent/10 transition-colors"
                      >
                        <div className="font-mono text-[11px] text-primary/80 truncate">{s.value}</div>
                        <div className="text-[10px] text-muted-foreground/60 truncate">{s.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Operator */}
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Operator</span>
          <div className="relative">
            <select
              value={cond.operator || 'equals'}
              onChange={(e) => set({ operator: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none appearance-none pr-6"
            >
              {CONDITION_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* Compare value (hidden for unary operators) */}
        {!noValueNeeded && (
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Value</span>
            <input
              type="text"
              value={cond.value || ''}
              onChange={(e) => set({ value: e.target.value })}
              placeholder="Value to compare against"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Preview */}
        {cond.field && (
          <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[10px] font-mono text-muted-foreground">
            <span className="text-primary">{cond.field}</span>
            {' '}
            <span className="text-amber-400">
              {CONDITION_OPERATORS.find(o => o.value === (cond.operator || 'equals'))?.label.split(' ')[0] ?? '='}
            </span>
            {!noValueNeeded && cond.value && (
              <> <span className="text-emerald-400">"{cond.value}"</span></>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Fields that should use VariableInput (support dynamic variables)
const VARIABLE_ENABLED_FIELDS = [
  'list_source',
  'target',
  'payload',
  'context_data',
  'filter_value',
  'compare_value',
  'subject',
  'message',
  'instruction',
  'message_body',
  'query',
  'content',
  'body',
  'template',
  'script',
  // Channel node fields
  'wa_message',
  'email_body',
  'email_subject',
  'sms_message',
  'tg_message',
  'ig_message',
  'body_text',
  'header_text',
  'footer_text',
  'card_title',
  'card_subtitle',
  'list_sections',
  'body_variables',
  'crm_filter',
  'manual_phones',
  'manual_emails',
  'manual_chat_ids',
];

// ============================================================================
// SAMPLE OUTPUT PANEL — inject mock/sample data into testRunStore
// ============================================================================

const SampleOutputPanel: React.FC<{ nodeId: string; nodeType: string }> = ({ nodeId, nodeType }) => {
  const setNodeOutput = useTestRunStore((s) => s.setNodeOutput);
  const existingOutput = useTestRunStore((s) => s.nodeOutputs[nodeId]);
  const [isOpen, setIsOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  const schemaDefs = NODE_OUTPUTS[nodeType] ?? [];

  // Build a sample JSON object from the schema definitions
  const buildSample = useCallback(() => {
    if (schemaDefs.length === 0) return '{}';
    const obj: Record<string, unknown> = {};
    schemaDefs.forEach((f) => {
      const keys = f.field.split('.');
      let cursor: Record<string, unknown> = obj;
      keys.forEach((k, i) => {
        if (i === keys.length - 1) {
          cursor[k] = f.type === 'number' ? 0
            : f.type === 'boolean' ? true
            : f.type === 'array' ? []
            : f.type === 'object' ? {}
            : `sample_${k}`;
        } else {
          if (!cursor[k] || typeof cursor[k] !== 'object') cursor[k] = {};
          cursor = cursor[k] as Record<string, unknown>;
        }
      });
    });
    return JSON.stringify(obj, null, 2);
  }, [schemaDefs]);

  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState('');

  const handleOpen = () => {
    if (!isOpen) {
      const initial = existingOutput
        ? JSON.stringify(existingOutput, null, 2)
        : buildSample();
      setJson(initial);
      setJsonError('');
    }
    setIsOpen((v) => !v);
  };

  const handleApply = () => {
    try {
      const parsed = JSON.parse(json);
      setNodeOutput(nodeId, parsed);
      setApplied(true);
      setJsonError('');
      setTimeout(() => setApplied(false), 2000);
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  if (schemaDefs.length === 0) return null;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Test Output
          </span>
          {existingOutput && (
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">set</span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[10px] text-muted-foreground/60">
            Set what this node outputs — downstream nodes will see these as variable values in the picker.
          </p>
          <textarea
            value={json}
            onChange={(e) => { setJson(e.target.value); setJsonError(''); }}
            rows={8}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-primary resize-y"
            spellCheck={false}
          />
          {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleApply}
              className="flex-1 gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              {applied ? (
                <><CheckCircle2 className="h-3 w-3" /> Applied</>
              ) : (
                <><FlaskConical className="h-3 w-3" /> Apply as test output</>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setJson(buildSample())}
              className="text-muted-foreground text-xs"
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

const PropertyPanel: React.FC = () => {
  const selectedNode = useSelectedNode();
  const clearSelection = useFlowStore((state) => state.clearSelection);
  const removeNode = useFlowStore((state) => state.removeNode);
  const updateNodeConfig = useFlowStore((state) => state.updateNodeConfig);
  const updateNestedNodeConfig = useFlowStore((state) => state.updateNestedNodeConfig);

  // Hooks must be called unconditionally — before any early returns
  const schema = selectedNode?.data.schema;
  const dynamicFields = useDynamicSchemaFields(
    selectedNode?.data.nodeType || '',
    schema?.fields || [],
  );
  const IconComponent = schema?.iconComponent;

  // Handle field change
  const handleFieldChange = (fieldName: string, value: unknown) => {
    if (selectedNode) {
      updateNodeConfig(selectedNode.id, fieldName, value);
    }
  };

  // Handle nested field change (for sections)
  const handleNestedFieldChange = (sectionName: string, fieldName: string, value: unknown) => {
    if (selectedNode) {
      updateNestedNodeConfig(selectedNode.id, sectionName, fieldName, value);
    }
  };

  // Handle delete node
  const handleDelete = () => {
    if (selectedNode) {
      removeNode(selectedNode.id);
    }
  };

  // No node selected state — return AFTER all hooks have been called
  if (!selectedNode) {
    return (
      <div className="h-full bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-sm text-muted-foreground">Properties</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground/60">
            <div className="text-4xl mb-3">👆</div>
            <p className="text-sm">Select a node to configure</p>
          </div>
        </div>
      </div>
    );
  }

  // Render a field based on its type
  const renderField = (field: SchemaField) => {
    const config = selectedNode.data.config || {};
    const fieldValue = config[field.name];
    const supportsVariables = VARIABLE_ENABLED_FIELDS.includes(field.name);

    switch (field.type) {
      case 'text':
        // Use VariableInput for fields that support dynamic variables
        if (supportsVariables) {
          return (
            <div key={field.name}>
              <VariableInput
                name={field.name}
                label={field.label}
                value={fieldValue as string || ''}
                onChange={handleFieldChange}
                placeholder={field.placeholder}
                required={field.required}
              />
              {/* Variable picker — only when test data exists */}
              {selectedNode && (
                <NodeOutputPicker
                  currentNodeId={selectedNode.id}
                  onInsert={(template) => {
                    // For single-line text: replace if empty, else append
                    const current = (fieldValue as string) || '';
                    handleFieldChange(field.name, current ? current + template : template);
                  }}
                />
              )}
            </div>
          );
        }
        return (
          <TextInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as string || ''}
            onChange={handleFieldChange}
            placeholder={field.placeholder}
            required={field.required}
          />
        );

      case 'select':
        return (
          <SelectInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as string || (field.default as string) || ''}
            onChange={handleFieldChange}
            options={field.options || []}
            required={field.required}
          />
        );

      case 'textarea':
        return (
          <div key={field.name}>
            <TextareaInput
              name={field.name}
              label={field.label}
              value={fieldValue as string || ''}
              onChange={handleFieldChange}
              placeholder={field.placeholder}
              required={field.required}
            />
            {/* Variable picker — only when test data exists */}
            {supportsVariables && selectedNode && (
              <NodeOutputPicker
                currentNodeId={selectedNode.id}
                onInsert={(template) => {
                  const current = (fieldValue as string) || '';
                  handleFieldChange(field.name, current + template);
                }}
              />
            )}
          </div>
        );

      case 'toggle':
      case 'checkbox':
        return (
          <ToggleInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as boolean ?? (field.default as boolean) ?? false}
            onChange={handleFieldChange}
          />
        );

      case 'number':
        return (
          <NumberInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as number ?? (field.default as number)}
            onChange={handleFieldChange}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            required={field.required}
          />
        );

      case 'slider':
        return (
          <SliderInput
            key={field.name}
            name={field.name}
            label={field.label}
            value={fieldValue as number ?? (field.default as number) ?? field.min ?? 0}
            onChange={handleFieldChange}
            min={field.min}
            max={field.max}
            step={field.step}
          />
        );

      case 'section':
        return (
          <SectionInput
            key={field.name}
            name={field.name}
            label={field.label}
            fields={field.fields || []}
            value={(fieldValue as Record<string, unknown>) || {}}
            onChange={handleNestedFieldChange}
          />
        );

      case 'dynamic_group': {
        if (!field.watchField || !field.conditionalFields) return null;
        const watchValue = (config[field.watchField] as string) || '';
        const subFields = field.conditionalFields[watchValue] || [];
        if (subFields.length === 0) return null;
        const groupValue = (fieldValue as Record<string, unknown>) || {};

        return (
          <div key={field.name} className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              {subFields.map((sub) => {
                const subVal = groupValue[sub.name];

                if (sub.type === 'select') {
                  return (
                    <SelectInput
                      key={sub.name}
                      name={sub.name}
                      label={sub.label}
                      value={(subVal as string) || (sub.default as string) || ''}
                      onChange={(name, val) => handleNestedFieldChange(field.name, name, val)}
                      options={sub.options || []}
                      required={sub.required}
                    />
                  );
                }

                if (sub.type === 'number') {
                  return (
                    <NumberInput
                      key={sub.name}
                      name={sub.name}
                      label={sub.label}
                      value={(subVal as number) ?? (sub.default as number)}
                      onChange={(name, val) => handleNestedFieldChange(field.name, name, val)}
                      min={sub.min}
                      max={sub.max}
                      placeholder={sub.placeholder}
                      required={sub.required}
                    />
                  );
                }

                if (sub.type === 'toggle' || sub.type === 'checkbox') {
                  return (
                    <ToggleInput
                      key={sub.name}
                      name={sub.name}
                      label={sub.label}
                      value={(subVal as boolean) ?? (sub.default as boolean) ?? false}
                      onChange={(name, val) => handleNestedFieldChange(field.name, name, val)}
                    />
                  );
                }

                if (sub.type === 'textarea') {
                  return (
                    <div key={sub.name}>
                      <TextareaInput
                        name={sub.name}
                        label={sub.label}
                        value={(subVal as string) ?? (sub.default as string) ?? ''}
                        onChange={(name, val) => handleNestedFieldChange(field.name, name, val)}
                        placeholder={sub.placeholder}
                        required={sub.required}
                      />
                      {selectedNode && (
                        <NodeOutputPicker
                          currentNodeId={selectedNode.id}
                          onInsert={(template) => {
                            const cur = (subVal as string) || '';
                            handleNestedFieldChange(field.name, sub.name, cur + template);
                          }}
                        />
                      )}
                    </div>
                  );
                }

                // Default: text — use VariableInput for variable support
                return (
                  <div key={sub.name}>
                    <VariableInput
                      name={sub.name}
                      label={sub.label}
                      value={(subVal as string) || ''}
                      onChange={(name, val) => handleNestedFieldChange(field.name, name, val)}
                      placeholder={sub.placeholder}
                      required={sub.required}
                    />
                    {selectedNode && (
                      <NodeOutputPicker
                        currentNodeId={selectedNode.id}
                        onInsert={(template) => {
                          const cur = (subVal as string) || '';
                          handleNestedFieldChange(field.name, sub.name, cur ? cur + template : template);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      // ── channel_select — live connected channel dropdown ──────────────────
      case 'channel_select': {
        const options = field.options ?? [];
        const currentVal = (fieldValue as string) || '';
        const selected = options.find((o) => o.value === currentVal);
        return (
          <div key={field.name} className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
            {options.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                <span>No connected channels found. Connect one in <strong>Settings → Integrations</strong>.</span>
              </div>
            ) : (
              <div className="space-y-1">
                <div
                  className="relative flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm cursor-pointer"
                  onClick={() => {}}
                >
                  <select
                    className="w-full bg-transparent text-sm outline-none cursor-pointer appearance-none pr-6"
                    value={currentVal}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  >
                    <option value="">— Any connected channel —</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {selected && (
                  <div className="flex items-center gap-1.5 px-1">
                    <Wifi className="h-3 w-3 text-emerald-500" />
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{selected.label}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      // ── module_table_select — module + table picker ───────────────────────
      case 'module_table_select': {
        const raw = (fieldValue as { module?: string; table?: string }) || {};
        const selModule = raw.module || '';
        const selTable = raw.table || '';
        const moduleDef = MODULE_SCHEMAS.find((m) => m.key === selModule);
        return (
          <div key={field.name} className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Module picker */}
              <div className="relative">
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none appearance-none pr-6"
                  value={selModule}
                  onChange={(e) => handleFieldChange(field.name, { module: e.target.value, table: '' })}
                >
                  <option value="">Module…</option>
                  {MODULE_SCHEMAS.map((m) => (
                    <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {/* Table picker */}
              <div className="relative">
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none appearance-none pr-6 disabled:opacity-40"
                  value={selTable}
                  disabled={!moduleDef}
                  onChange={(e) => handleFieldChange(field.name, { module: selModule, table: e.target.value })}
                >
                  <option value="">Table…</option>
                  {(moduleDef?.tables ?? []).map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            {selModule && selTable && (
              <div className="flex items-center gap-1.5 px-1">
                <Layers className="h-3 w-3 text-primary" />
                <span className="text-[11px] text-primary">
                  {moduleDef?.icon} {moduleDef?.label} › {moduleDef?.tables.find(t => t.key === selTable)?.label}
                </span>
              </div>
            )}
          </div>
        );
      }

      // ── module_column_select — column multi-picker for the chosen table ───
      case 'module_column_select': {
        const dataSource = (selectedNode.data.config?.data_source as { module?: string; table?: string }) || {};
        const tableDef = getTableByKey(dataSource.module || '', dataSource.table || '');
        const selected: string[] = Array.isArray(fieldValue) ? (fieldValue as string[]) : [];
        if (!tableDef) {
          return (
            <div key={field.name} className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Select a module & table above to pick columns.</span>
            </div>
          );
        }
        const toggle = (col: string) => {
          const next = selected.includes(col)
            ? selected.filter((c) => c !== col)
            : [...selected, col];
          handleFieldChange(field.name, next);
        };
        return (
          <div key={field.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">{field.label}</label>
              <button
                className="text-[10px] text-primary hover:underline"
                onClick={() => handleFieldChange(field.name, tableDef.columns.map(c => c.key))}
              >
                Select all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tableDef.columns.map((col) => {
                const isOn = selected.includes(col.key);
                return (
                  <button
                    key={col.key}
                    onClick={() => toggle(col.key)}
                    className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors ${
                      isOn
                        ? 'bg-primary border-primary text-white'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {col.label}
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <p className="text-[10px] text-muted-foreground px-0.5">{selected.length} column{selected.length > 1 ? 's' : ''} selected</p>
            )}
          </div>
        );
      }

      // ── batch_config — single row vs batch N ─────────────────────────────
      case 'batch_config': {
        const cfg = (fieldValue as { mode?: 'single' | 'batch'; size?: number }) || { mode: 'single', size: 10 };
        const isBatch = cfg.mode === 'batch';
        return (
          <div key={field.name} className="space-y-2">
            <label className="text-xs font-medium text-foreground">{field.label}</label>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
              {(['single', 'batch'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleFieldChange(field.name, { ...cfg, mode })}
                  className={`flex-1 py-1.5 transition-colors ${
                    cfg.mode === mode
                      ? 'bg-primary text-white'
                      : 'bg-background text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  {mode === 'single' ? '1 row at a time' : 'Batch'}
                </button>
              ))}
            </div>
            {isBatch && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={2}
                  max={1000}
                  value={cfg.size ?? 10}
                  onChange={(e) => handleFieldChange(field.name, { ...cfg, size: parseInt(e.target.value) || 10 })}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground">rows per batch</span>
              </div>
            )}
          </div>
        );
      }

      // ── condition_builder — [variable picker] [operator] [value] inline row
      case 'condition_builder':
        return (
          <ConditionBuilder
            key={field.name}
            fieldName={field.name}
            label={field.label}
            required={field.required}
            value={(fieldValue as { field?: string; operator?: string; value?: string }) || {}}
            onChange={handleFieldChange}
            currentNodeId={selectedNode.id}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full bg-card flex flex-col">
      {/* Panel Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {IconComponent && (
              <div className={`p-1.5 rounded-lg bg-gradient-to-r ${schema.color}`}>
                <IconComponent className="h-4 w-4 text-white" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-sm text-foreground">{selectedNode.data.label}</h3>
              <p className="text-xs text-muted-foreground">{schema?.description}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={clearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Panel Body - Form Fields */}
      <div
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="p-4 space-y-4">
          {dynamicFields.map((field) => renderField(field))}

          {/* Trigger data shape hint — shown when trigger_type is selected */}
          {selectedNode.data.nodeType === 'trigger' && (() => {
            const triggerType = selectedNode.data.config?.trigger_type as string | undefined;
            const hints = triggerType ? TRIGGER_TYPE_OUTPUTS[triggerType] : undefined;
            if (!hints || hints.length === 0) return null;
            return (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Available variables from this trigger</span>
                </div>
                <div className="space-y-1">
                  {hints.map((h) => (
                    <div key={h.field} className="flex items-start gap-2">
                      <span className="font-mono text-[11px] text-primary/80 shrink-0">{'{{trigger.' + h.field + '}}'}</span>
                      <span className="text-[10px] text-muted-foreground/70">{h.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Test Panel for Vapi / WebRTC nodes */}
      {selectedNode.data.nodeType && ['vapi', 'webrtc'].includes(selectedNode.data.nodeType) && (
        <NodeTestPanel
          nodeType={selectedNode.data.nodeType as 'vapi' | 'webrtc'}
          config={selectedNode.data.config || {}}
        />
      )}

      {/* Sample Output Panel — all other node types */}
      {selectedNode.data.nodeType && !['vapi', 'webrtc'].includes(selectedNode.data.nodeType) && (
        <SampleOutputPanel nodeId={selectedNode.id} nodeType={selectedNode.data.nodeType as string} />
      )}

      {/* Panel Footer - Delete Button */}
      <div className="p-4 border-t border-border">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Node
        </Button>
      </div>
    </div>
  );
};

export default PropertyPanel;
