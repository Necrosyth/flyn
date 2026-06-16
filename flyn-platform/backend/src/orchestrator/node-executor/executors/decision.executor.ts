/**
 * Decision Executor
 *
 * Handles `decision` type nodes created via the visual builder.
 * Config shape (field_equals style):
 *   condition_type: 'field_equals'
 *   field_name:     'contact_type'        ← field to resolve from previousOutputs
 *   operator:       'equals' | 'not_equals' | 'contains' | ...
 *   compare_value:  'employee'
 *   true_label:     'HR Branch'
 *   false_label:    'Next'
 *
 * Returns `output.matched` (boolean) so the GraphTraversalService can pick the
 * correct outgoing edge by sourceHandle ('true' | 'false').
 */

import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../../types';

@Injectable()
export class DecisionExecutor extends BaseExecutor {
    readonly nodeType = 'decision';
    readonly displayName = 'Decision';
    readonly description = 'Routes execution based on field value comparison';

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const config = node.config as {
            condition_type?: string;
            field_name?: string;
            operator?: string;
            compare_value?: string;
            true_label?: string;
            false_label?: string;
        };

        const fieldName = (config.field_name || '').trim();
        const compareValue = (config.compare_value || '').trim();
        const operator = (config.operator || 'equals').toLowerCase();

        // Resolve the field value — tries full dot-path first, then scans each
        // node output's result array / result object so short names like
        // "contact_type" resolve to merge_1.result[0].contact_type automatically.
        //
        // IMPORTANT: always include token.data as "_current" at the front of the
        // lookup map.  token.data is the direct output of the immediately-preceding
        // node (e.g. merge_1), piped through the execution token.  In parallel
        // branch flows the global nodeOutputs map can be stale at the moment the
        // decision runs, so scanning token.data first ensures the field is always
        // found even when previousOutputs hasn't been hydrated yet.
        //
        // For chained decisions (decision_2, decision_3), token.data is the
        // PREVIOUS decision's output which carries a `_passthrough` key containing
        // the original merge/query result — this is also added to the lookup so
        // chain decisions can still resolve the same fields.
        const tokenData = context.token.data as Record<string, unknown>;
        const passthrough = tokenData._passthrough as Record<string, unknown> | undefined;

        const lookupSources: Record<string, unknown> = {
            _current: tokenData,                    // direct pipe from previous node
            ...(passthrough ? { _passthrough: passthrough } : {}),  // chained decision passthrough
            ...context.previousOutputs,
        };
        const fieldValue = this.resolveField(fieldName, lookupSources);
        const stringValue = fieldValue !== undefined && fieldValue !== null
            ? String(fieldValue)
            : undefined;

        const matched = this.compare(stringValue, operator, compareValue);

        context.services.log('info', `Decision "${node.id}": ${fieldName}(${stringValue}) ${operator} ${compareValue} → ${matched}`, {
            nodeId: node.id,
        });

        // Determine what to carry forward as _passthrough so chained decisions
        // (decision_2, decision_3, ...) can still resolve the same fields.
        // Priority: incoming passthrough > current token data (if it has a result array)
        const outPassthrough: Record<string, unknown> | undefined =
            passthrough ??
            (Array.isArray((tokenData as Record<string, unknown>).result)
                ? tokenData
                : undefined);

        return {
            status: 'COMPLETED',
            output: {
                matched,
                field: fieldName,
                fieldValue: stringValue,
                compareValue,
                operator,
                matchedPaths: [],          // populated by graph traversal
                evaluationResults: [{
                    result: matched,
                    reason: `${fieldName} (${stringValue}) == ${compareValue}: ${matched}`,
                }],
                // Carry the original query/merge result forward through the decision chain
                ...(outPassthrough ? { _passthrough: outPassthrough } : {}),
            },
            // Do NOT return nextNodeIds here — the GraphTraversalService uses
            // output.matched + edge sourceHandle to pick the correct branch.
        };
    }

    // ─────────────────────────────── Helpers ────────────────────────────────

    private compare(value: string | undefined, operator: string, target: string): boolean {
        if (value === undefined) return false;
        const v = value.toLowerCase();
        const t = target.toLowerCase();
        switch (operator) {
            case 'equals':
            case 'eq':
            case '==':
                return v === t;
            case 'not_equals':
            case 'neq':
            case '!=':
                return v !== t;
            case 'contains':
                return v.includes(t);
            case 'not_contains':
                return !v.includes(t);
            case 'starts_with':
                return v.startsWith(t);
            case 'ends_with':
                return v.endsWith(t);
            case 'gt':
            case '>':
                return Number(v) > Number(t);
            case 'lt':
            case '<':
                return Number(v) < Number(t);
            case 'gte':
            case '>=':
                return Number(v) >= Number(t);
            case 'lte':
            case '<=':
                return Number(v) <= Number(t);
            default:
                return v === t;
        }
    }

    /**
     * Resolve a field name through previousOutputs:
     *  1. Direct dot-path  (e.g. "merge_1.result.0.contact_type")
     *  2. Scan result[0] of each node output  (so "contact_type" finds merge_1.result[0].contact_type)
     *  3. Scan result object of each node output
     *  4. Top-level key in each node output
     */
    private resolveField(fieldName: string, previousOutputs: Record<string, unknown>): unknown {
        // 1. Full dot-path traversal
        const direct = this.getNestedValue(previousOutputs, fieldName);
        if (direct !== undefined) return direct;

        // 2-4. Scan each node's output
        for (const nodeOutput of Object.values(previousOutputs)) {
            if (typeof nodeOutput !== 'object' || nodeOutput === null) continue;
            const output = nodeOutput as Record<string, unknown>;

            // result array (merge node, postgresql, etc.)
            if (Array.isArray(output.result) && output.result.length > 0) {
                const first = output.result[0] as Record<string, unknown>;
                if (first && first[fieldName] !== undefined) return first[fieldName];
            }

            // single result object
            if (output.result && typeof output.result === 'object' && !Array.isArray(output.result)) {
                const r = output.result as Record<string, unknown>;
                if (r[fieldName] !== undefined) return r[fieldName];
            }

            // top-level key on the node output itself
            if (output[fieldName] !== undefined) return output[fieldName];
        }

        return undefined;
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        if (!path) return undefined;
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .filter(Boolean);

        return tokens.reduce((cur: unknown, key: string) => {
            if (cur === undefined || cur === null) return undefined;
            if (Array.isArray(cur)) {
                const idx = Number(key);
                return Number.isInteger(idx) ? cur[idx] : (cur[0] as any)?.[key];
            }
            return (cur as Record<string, unknown>)[key];
        }, obj as unknown);
    }
}
