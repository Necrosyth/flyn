/**
 * Merge Executor
 *
 * Visual merge / join node — no scripting required.
 *
 * Config fields set in the UI:
 *   leftSourceId   – upstream node ID whose output has the "left" array
 *   leftPath       – dot-path inside that output to reach the array  (default: "result")
 *   leftKey        – field on each left row to join on               (e.g. "id")
 *   rightSourceId  – upstream node ID whose output has the "right" array
 *   rightPath      – dot-path inside that output to reach the array  (default: "result")
 *   rightKey       – field on each right row to join on              (e.g. "customer_id")
 *   joinType       – "left" (default) or "inner"
 *   computedFields – optional newline-separated expressions:
 *                    fieldName = <expression using left.X and right.X>
 *                    e.g.:
 *                      lead_score = Math.min(100, Math.round(right.total_revenue / 1000))
 *                      total_orders = right.total_orders
 *
 * Output:
 *   { result: [...mergedRows], rowCount: N, leftCount: N, rightCount: N }
 */

import { Injectable, Logger } from '@nestjs/common';
import * as vm from 'vm';
import { BaseExecutor } from '../base-executor';
import {
    CompiledNode,
    NodeExecutionContext,
    NodeResult,
    NodeType,
} from '../../types';

// ─── Config interface ───────────────────────────────────────────────────────

export interface MergeConfig {
    leftSourceId: string;
    leftPath?: string;
    leftKey: string;
    rightSourceId: string;
    rightPath?: string;
    rightKey: string;
    joinType?: 'left' | 'inner';
    computedFields?: string;   // "fieldName = expr\nfieldName2 = expr2"
}

// ─── Helper ─────────────────────────────────────────────────────────────────

/** Resolve a dot-path like "result" or "data.rows" inside an object */
function resolvePath(obj: unknown, path: string): unknown {
    if (!path || path === '.' || path === '') return obj;
    return path.split('.').reduce<unknown>((cur, key) => {
        if (cur == null || typeof cur !== 'object') return undefined;
        return (cur as Record<string, unknown>)[key];
    }, obj);
}

/** Parse "fieldName = expression" lines into an array */
function parseComputedFields(text: string): Array<{ name: string; expr: string }> {
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//') && line.includes('='))
        .map(line => {
            const eqIdx = line.indexOf('=');
            return {
                name: line.slice(0, eqIdx).trim(),
                expr: line.slice(eqIdx + 1).trim(),
            };
        })
        .filter(f => f.name && f.expr);
}

/** Evaluate a single computed-field expression safely */
function evalExpr(
    expr: string,
    left: Record<string, unknown>,
    right: Record<string, unknown>,
): unknown {
    try {
        const sandbox = vm.createContext({
            left,
            right,
            Math,
            parseFloat,
            parseInt,
            isNaN,
            String,
            Number,
            Boolean,
        });
        return vm.runInContext(expr, sandbox, { timeout: 1000 });
    } catch {
        return undefined;
    }
}

// ─── Executor ───────────────────────────────────────────────────────────────

@Injectable()
export class MergeExecutor extends BaseExecutor {
    private readonly logger = new Logger(MergeExecutor.name);
    readonly nodeType = NodeType.MERGE;
    readonly displayName = 'Merge / Join';
    readonly description =
        'Left-join or inner-join two upstream datasets by a shared key, with optional computed fields';

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const cfg = node.config as unknown as MergeConfig;
        const inputs = context.previousOutputs;

        // ── Validation ─────────────────────────────────────────────────────
        if (!cfg.leftSourceId) return this.failed('MISSING_LEFT_SOURCE', 'Left Source Node ID is required', false);
        if (!cfg.rightSourceId) return this.failed('MISSING_RIGHT_SOURCE', 'Right Source Node ID is required', false);
        if (!cfg.leftKey) return this.failed('MISSING_LEFT_KEY', 'Left Join Key is required', false);
        if (!cfg.rightKey) return this.failed('MISSING_RIGHT_KEY', 'Right Join Key is required', false);

        // ── Resolve arrays ─────────────────────────────────────────────────
        const leftRaw = inputs[cfg.leftSourceId];
        const rightRaw = inputs[cfg.rightSourceId];

        if (!leftRaw) {
            return this.failed('LEFT_SOURCE_NOT_FOUND',
                `No output found for left source node "${cfg.leftSourceId}". Make sure the node ID matches the upstream node exactly.`, false);
        }
        if (!rightRaw) {
            return this.failed('RIGHT_SOURCE_NOT_FOUND',
                `No output found for right source node "${cfg.rightSourceId}". Make sure the node ID matches the upstream node exactly.`, false);
        }

        const leftArr = resolvePath(leftRaw, cfg.leftPath ?? 'result');
        const rightArr = resolvePath(rightRaw, cfg.rightPath ?? 'result');

        if (!Array.isArray(leftArr)) {
            return this.failed('LEFT_NOT_ARRAY',
                `Left source "${cfg.leftSourceId}" at path "${cfg.leftPath ?? 'result'}" is not an array. Got: ${typeof leftArr}`, false);
        }
        if (!Array.isArray(rightArr)) {
            return this.failed('RIGHT_NOT_ARRAY',
                `Right source "${cfg.rightSourceId}" at path "${cfg.rightPath ?? 'result'}" is not an array. Got: ${typeof rightArr}`, false);
        }

        // ── Build right-side lookup map ─────────────────────────────────────
        const rightMap = new Map<string, Record<string, unknown>>();
        for (const row of rightArr as Record<string, unknown>[]) {
            const key = String(row[cfg.rightKey] ?? '');
            rightMap.set(key, row);
        }

        // ── Parse computed fields ───────────────────────────────────────────
        const computedDefs = cfg.computedFields
            ? parseComputedFields(cfg.computedFields)
            : [];

        // ── Join ────────────────────────────────────────────────────────────
        const joinType = cfg.joinType ?? 'left';
        const merged: Record<string, unknown>[] = [];

        for (const leftRow of leftArr as Record<string, unknown>[]) {
            const joinKeyVal = String(leftRow[cfg.leftKey] ?? '');
            const rightRow = rightMap.get(joinKeyVal) ?? {};
            const hasMatch = rightMap.has(joinKeyVal);

            if (joinType === 'inner' && !hasMatch) continue;

            // Merge: left fields first, then right fields (right overrides on collision)
            const mergedRow: Record<string, unknown> = { ...leftRow, ...rightRow };

            // Apply computed fields
            for (const { name, expr } of computedDefs) {
                mergedRow[name] = evalExpr(expr, leftRow, rightRow);
            }

            merged.push(mergedRow);
        }

        context.services.log('info',
            `Merge complete: ${merged.length} rows (left=${leftArr.length}, right=${rightArr.length}, join=${joinType})`,
            { nodeId: node.id },
        );

        return this.completed({
            result: merged,
            rowCount: merged.length,
            leftCount: leftArr.length,
            rightCount: rightArr.length,
            joinType,
        });
    }
}
