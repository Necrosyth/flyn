import { Injectable } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType, EdgeCondition } from '../../types';

/**
 * Condition Executor
 * 
 * Evaluates conditions and determines which path(s) to take.
 * This is the "if/else" of the workflow system.
 * 
 * Returns COMPLETED with nextNodeIds indicating which
 * edges to follow based on condition evaluation.
 */
@Injectable()
export class ConditionExecutor extends BaseExecutor {
    readonly nodeType = NodeType.CONDITION;
    readonly displayName = 'Condition';
    readonly description = 'Evaluates conditions and routes execution';

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        const conditions = config.conditions as ConditionConfig[] || [];
        const defaultPath = config.defaultPath as string | undefined;

        context.services.log('info', `Evaluating conditions`, {
            nodeId: node.id,
            conditionCount: conditions.length,
        });

        try {
            // Evaluate each condition in order
            const matchedPaths: string[] = [];
            const evaluationResults: ConditionEvaluationResult[] = [];

            for (const condition of conditions) {
                const result = this.evaluateCondition(condition, context);
                evaluationResults.push({
                    condition: condition.expression,
                    result: result.matched,
                    reason: result.reason,
                });

                if (result.matched) {
                    matchedPaths.push(condition.targetNodeId);

                    // If not evaluating all (short-circuit), break on first match
                    if (!config.evaluateAll) {
                        break;
                    }
                }
            }

            // If no conditions matched, use default path
            if (matchedPaths.length === 0 && defaultPath) {
                matchedPaths.push(defaultPath);
            }

            context.services.log('info', `Condition evaluation complete`, {
                nodeId: node.id,
                matchedPaths,
                evaluationResults,
            });

            return {
                status: 'COMPLETED' as const,
                output: {
                    matchedPaths,
                    evaluationResults,
                },
                // nextNodeIds must be at the TOP level (not inside output)
                // so the graph traversal service can route correctly
                nextNodeIds: matchedPaths.length > 0 ? matchedPaths : undefined,
            };
        } catch (error) {
            const err = error as Error;
            context.services.log('error', `Condition evaluation failed: ${err.message}`, {
                nodeId: node.id,
            });

            return this.failed(
                'CONDITION_EVALUATION_ERROR',
                err.message,
                false, // Condition errors are usually not retryable
                { conditions },
            );
        }
    }

    /**
     * Evaluate a single condition
     */
    private evaluateCondition(
        condition: ConditionConfig,
        context: NodeExecutionContext,
    ): { matched: boolean; reason: string } {
        const { type, expression, field, operator, value } = condition;

        switch (type) {
            case 'expression':
                return this.evaluateExpression(expression || '', context);

            case 'field_comparison':
                return this.evaluateFieldComparison(field || '', operator || '==', value, context);

            case 'exists':
                return this.evaluateExists(field || '', context);

            case 'ai_confidence':
                return this.evaluateAiConfidence(condition, context);

            default:
                return { matched: false, reason: `Unknown condition type: ${type}` };
        }
    }

    private evaluateExpression(
        expression: string,
        context: NodeExecutionContext,
    ): { matched: boolean; reason: string } {
        try {
            // Create a safe evaluation context with workflow variables
            const evalContext = {
                data: context.previousOutputs,
                vars: context.variables,
                token: context.token.data,
                // 'trigger' alias is injected by the orchestrator into previousOutputs
                trigger: (context.previousOutputs as Record<string, unknown>).trigger || {},
            };

            // Simple expression evaluation (in production, use a proper expression engine)
            // This is a basic implementation - consider using libraries like 'expr-eval'
            const result = this.safeEval(expression, evalContext);

            return {
                matched: Boolean(result),
                reason: result ? 'Expression evaluated to truthy' : 'Expression evaluated to falsy',
            };
        } catch (error) {
            return {
                matched: false,
                reason: `Expression evaluation error: ${(error as Error).message}`,
            };
        }
    }

    /**
     * Smart field resolution: look for a field across all node outputs if not
     * found at the top level of previousOutputs.
     * Allows users to write "sentiment" instead of "ai_sentiment_1.sentiment".
     *
     * Also checks token.data (the direct output of the immediately preceding
     * node) and any _passthrough data for chained decision nodes, so fields
     * like "contact_type" resolve correctly from merge/query result arrays.
     */
    private resolveField(field: string, sources: Record<string, unknown>): unknown {
        // 1. Try the explicit path first (e.g. "ai_sentiment_1.sentiment")
        const direct = this.getNestedValue(sources, field);
        if (direct !== undefined) return direct;

        // 2. Scan all node outputs for a matching top-level key
        for (const nodeOutput of Object.values(sources)) {
            if (nodeOutput && typeof nodeOutput === 'object') {
                const obj = nodeOutput as Record<string, unknown>;
                if (field in obj && obj[field] !== undefined) {
                    return obj[field];
                }

                // 3. Check inside result arrays — merge/postgresql/mongodb nodes
                //    store rows as { result: [ { contact_type: '...', ... }, ... ] }
                if (Array.isArray(obj.result) && obj.result.length > 0) {
                    const first = obj.result[0] as Record<string, unknown>;
                    if (first && first[field] !== undefined) {
                        return first[field];
                    }
                }

                // 4. Check single result objects
                if (obj.result && typeof obj.result === 'object' && !Array.isArray(obj.result)) {
                    const r = obj.result as Record<string, unknown>;
                    if (r[field] !== undefined) {
                        return r[field];
                    }
                }

                // 5. Also try one level deeper (e.g. extractedData.sentiment)
                for (const nested of Object.values(obj)) {
                    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
                        const n = nested as Record<string, unknown>;
                        if (field in n && n[field] !== undefined) {
                            return n[field];
                        }
                    }
                }
            }
        }
        return undefined;
    }

    private evaluateFieldComparison(
        field: string,
        operator: string,
        value: unknown,
        context: NodeExecutionContext,
    ): { matched: boolean; reason: string } {
        // Build lookup sources: include token.data (direct output from previous
        // node) and any _passthrough data for chained decision nodes, in addition
        // to the global previousOutputs map.
        const tokenData = context.token.data as Record<string, unknown> | undefined;
        const passthrough = tokenData?._passthrough as Record<string, unknown> | undefined;

        const lookupSources: Record<string, unknown> = {
            ...(tokenData ? { _current: tokenData } : {}),
            ...(passthrough ? { _passthrough: passthrough } : {}),
            ...context.previousOutputs,
        };
        let fieldValue = this.resolveField(field, lookupSources);

        // Coerce types for numeric comparisons
        // This ensures "75" > 50 and 75 > "50" both work correctly
        let compareValue = value;
        if (['>', '>=', '<', '<='].includes(operator)) {
            if (typeof fieldValue === 'string' && !isNaN(Number(fieldValue))) {
                fieldValue = Number(fieldValue);
            }
            if (typeof compareValue === 'string' && !isNaN(Number(compareValue))) {
                compareValue = Number(compareValue);
            }
        }

        // For equality checks, also try numeric coercion if one side is number
        if (['==', '===', '!=', '!=='].includes(operator)) {
            if (typeof fieldValue === 'number' && typeof compareValue === 'string') {
                const num = Number(compareValue);
                if (!isNaN(num)) compareValue = num;
            } else if (typeof fieldValue === 'string' && typeof compareValue === 'number') {
                const num = Number(fieldValue);
                if (!isNaN(num)) fieldValue = num;
            }
        }

        let matched = false;
        switch (operator) {
            case '==':
            case '===':
                matched = fieldValue === compareValue;
                break;
            case '!=':
            case '!==':
                matched = fieldValue !== compareValue;
                break;
            case '>':
                matched = (fieldValue as number) > (compareValue as number);
                break;
            case '>=':
                matched = (fieldValue as number) >= (compareValue as number);
                break;
            case '<':
                matched = (fieldValue as number) < (compareValue as number);
                break;
            case '<=':
                matched = (fieldValue as number) <= (compareValue as number);
                break;
            case 'contains':
                matched = String(fieldValue).includes(String(compareValue));
                break;
            case 'startsWith':
                matched = String(fieldValue).startsWith(String(compareValue));
                break;
            case 'endsWith':
                matched = String(fieldValue).endsWith(String(compareValue));
                break;
            default:
                return { matched: false, reason: `Unknown operator: ${operator}` };
        }

        return {
            matched,
            reason: `${field} (${fieldValue}) ${operator} ${compareValue}: ${matched}`,
        };
    }

    private evaluateExists(
        field: string,
        context: NodeExecutionContext,
    ): { matched: boolean; reason: string } {
        const value = this.getNestedValue(context.previousOutputs, field);
        const exists = value !== undefined && value !== null;

        return {
            matched: exists,
            reason: exists ? `Field '${field}' exists` : `Field '${field}' does not exist`,
        };
    }

    private evaluateAiConfidence(
        condition: ConditionConfig,
        context: NodeExecutionContext,
    ): { matched: boolean; reason: string } {
        const confidenceField = condition.field || 'confidence';
        const threshold = condition.threshold || 0.8;
        const operator = condition.operator || '>=';

        const confidence = this.getNestedValue(context.previousOutputs, confidenceField) as number;

        if (typeof confidence !== 'number') {
            return {
                matched: false,
                reason: `AI confidence field '${confidenceField}' is not a number`,
            };
        }

        let matched = false;
        switch (operator) {
            case '>=':
                matched = confidence >= threshold;
                break;
            case '>':
                matched = confidence > threshold;
                break;
            case '<=':
                matched = confidence <= threshold;
                break;
            case '<':
                matched = confidence < threshold;
                break;
            default:
                matched = confidence >= threshold;
        }

        return {
            matched,
            reason: `AI confidence ${confidence} ${operator} ${threshold}: ${matched}`,
        };
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .replace(/\["([^"]+)"\]/g, '.$1')
            .replace(/\['([^']+)'\]/g, '.$1')
            .split('.')
            .filter(Boolean);

        return tokens.reduce((current: unknown, key) => {
            if (current === undefined || current === null) return undefined;
            if (Array.isArray(current)) {
                const idx = Number(key);
                if (Number.isInteger(idx)) return current[idx];
                const first = current[0];
                if (first && typeof first === 'object') {
                    return (first as Record<string, unknown>)[key];
                }
                return undefined;
            }
            if (typeof current === 'object') {
                return (current as Record<string, unknown>)[key];
            }
            return undefined;
        }, obj);
    }

    /**
     * Safe expression evaluation
     * In production, use a proper expression evaluation library
     */
    private safeEval(expression: string, context: Record<string, unknown>): unknown {
        // Very basic and limited evaluation for safety
        // Replace with a proper expression engine in production
        const { data, vars, token, trigger } = context;

        // Only allow simple property access and comparisons
        // This is intentionally limited for security
        try {
            // Check for simple comparisons like "data.field > 100" or "trigger.data.field > 100"
            const comparisonMatch = expression.match(
                /^(data|vars|token|trigger)\.?(\w+(?:\.\w+)*)\s*(===?|!==?|>=?|<=?)\s*(.+)$/
            );

            if (comparisonMatch) {
                const [, source, path, op, valueStr] = comparisonMatch;
                const sourceObj = source === 'data' ? data : source === 'vars' ? vars : source === 'trigger' ? trigger : token;
                let fieldValue = this.getNestedValue(sourceObj as Record<string, unknown>, path);
                let compareValue: unknown;
                try {
                    compareValue = JSON.parse(valueStr);
                } catch {
                    // If JSON parse fails, use as raw string (strip quotes if present)
                    compareValue = valueStr.replace(/^["']|["']$/g, '');
                }

                // Type coercion for numeric comparisons
                if (['>', '>=', '<', '<='].includes(op)) {
                    if (typeof fieldValue === 'string' && !isNaN(Number(fieldValue))) {
                        fieldValue = Number(fieldValue);
                    }
                    if (typeof compareValue === 'string' && !isNaN(Number(compareValue))) {
                        compareValue = Number(compareValue);
                    }
                }

                switch (op) {
                    case '==':
                    case '===':
                        return fieldValue === compareValue;
                    case '!=':
                    case '!==':
                        return fieldValue !== compareValue;
                    case '>':
                        return (fieldValue as number) > (compareValue as number);
                    case '>=':
                        return (fieldValue as number) >= (compareValue as number);
                    case '<':
                        return (fieldValue as number) < (compareValue as number);
                    case '<=':
                        return (fieldValue as number) <= (compareValue as number);
                }
            }

            return false;
        } catch {
            return false;
        }
    }
}

interface ConditionConfig {
    type: 'expression' | 'field_comparison' | 'exists' | 'ai_confidence';
    expression?: string;
    field?: string;
    operator?: string;
    value?: unknown;
    threshold?: number;
    targetNodeId: string;
}

interface ConditionEvaluationResult {
    condition: string | undefined;
    result: boolean;
    reason: string;
}
