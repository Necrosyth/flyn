import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';

/**
 * Loop Executor
 * 
 * Handles iteration over collections or conditional loops.
 * 
 * Config:
 * - loopType: 'forEach' | 'while' | 'times'
 * - collection: string - Path to array in previousOutputs (for forEach)
 * - condition: string - Expression to evaluate (for while)
 * - count: number - Number of iterations (for times)
 * - maxIterations: number - Safety limit (default: 1000)
 * - itemVariable: string - Variable name for current item (default: 'item')
 * - indexVariable: string - Variable name for index (default: 'index')
 */
@Injectable()
export class LoopExecutor extends BaseExecutor {
    private readonly logger = new Logger(LoopExecutor.name);
    readonly nodeType = NodeType.ITERATOR;
    readonly displayName = 'Iterator';
    readonly description = 'Iterates over a collection or condition';

    async execute(
        node: CompiledNode,
        context: NodeExecutionContext,
    ): Promise<NodeResult> {
        const { config } = node;
        // accept both camelCase (backend format) and snake_case (frontend schema format)
        const loopType = (config.loopType as string) || (config.loop_type as string) || 'forEach';
        const maxIterations = (config.maxIterations as number) || 1000;

        // Read loop index from persistent variables (survives CRM/body node overwriting token.data)
        // Fall back to token.data for backward-compat, then default to 0.
        const currentIndex =
            (context.variables?.[`_loopIdx_${node.id}`] as number) ??
            (context.token.data._loopIndex as number) ??
            0;

        this.logger.log(`Loop node ${node.id}: type=${loopType}, index=${currentIndex}`);

        switch (loopType) {
            case 'forEach':
                return this.executeForEach(node, context, currentIndex, maxIterations);
            case 'times':
                return this.executeTimes(node, context, currentIndex, maxIterations);
            case 'while':
                return this.executeWhile(node, context, currentIndex, maxIterations);
            default:
                return this.failed('INVALID_LOOP_TYPE', `Unknown loop type: ${loopType}`, false);
        }
    }

    private executeForEach(
        node: CompiledNode,
        context: NodeExecutionContext,
        currentIndex: number,
        maxIterations: number,
    ): NodeResult {
        const { config } = node;
        // accept both camelCase and snake_case field names
        const collectionPath = (config.collection || config.list_source) as string;
        const itemVariable = (config.itemVariable || config.item_variable || 'item') as string;
        const indexVariable = (config.indexVariable || config.index_variable || 'index') as string;

        if (!collectionPath) {
            return this.failed('MISSING_COLLECTION', 'forEach loop requires a collection path', false);
        }

        // Strip Mustache-style template brackets: {{merge_1.result}} → merge_1.result
        // so getNestedValue can walk it as a dot-path key.
        const resolvedPath = collectionPath.replace(/^\{\{(.+)\}\}$/, '$1');

        // Get the collection from previous outputs
        const collection = this.getNestedValue(context.previousOutputs, resolvedPath);

        if (!Array.isArray(collection)) {
            return this.failed(
                'INVALID_COLLECTION',
                `Collection at path "${resolvedPath}" is not an array (got ${typeof collection})`,
                false,
            );
        }

        // Check if we've completed the loop
        if (currentIndex >= collection.length || currentIndex >= maxIterations) {
            context.services.log('info', `Loop completed after ${currentIndex} iterations`);
            return this.completed({
                loopCompleted: true,
                totalIterations: currentIndex,
                _loopEnd: true,
            });
        }

        // Return current item for this iteration
        const currentItem = collection[currentIndex];
        context.services.log('info', `Loop iteration ${currentIndex + 1}/${collection.length}`);

        return this.completed({
            [itemVariable]: currentItem,
            [indexVariable]: currentIndex,
            _loopContinue: true,
            _nextLoopIndex: currentIndex + 1,
            _totalItems: collection.length,
        });
    }

    private executeTimes(
        node: CompiledNode,
        context: NodeExecutionContext,
        currentIndex: number,
        maxIterations: number,
    ): NodeResult {
        const { config } = node;
        const count = (config.count as number) || 1;
        const indexVariable = (config.indexVariable as string) || 'index';

        const effectiveCount = Math.min(count, maxIterations);

        if (currentIndex >= effectiveCount) {
            context.services.log('info', `Loop completed after ${currentIndex} iterations`);
            return this.completed({
                loopCompleted: true,
                totalIterations: currentIndex,
                _loopEnd: true,
            });
        }

        context.services.log('info', `Loop iteration ${currentIndex + 1}/${effectiveCount}`);

        return this.completed({
            [indexVariable]: currentIndex,
            _loopContinue: true,
            _nextLoopIndex: currentIndex + 1,
            _totalIterations: effectiveCount,
        });
    }

    private executeWhile(
        node: CompiledNode,
        context: NodeExecutionContext,
        currentIndex: number,
        maxIterations: number,
    ): NodeResult {
        const { config } = node;
        const condition = config.condition as string;
        const indexVariable = (config.indexVariable as string) || 'index';

        if (!condition) {
            return this.failed('MISSING_CONDITION', 'while loop requires a condition', false);
        }

        // Check max iterations
        if (currentIndex >= maxIterations) {
            context.services.log('warn', `Loop hit max iterations limit (${maxIterations})`);
            return this.completed({
                loopCompleted: true,
                totalIterations: currentIndex,
                hitLimit: true,
                _loopEnd: true,
            });
        }

        // Evaluate condition
        const conditionMet = this.evaluateCondition(condition, {
            ...context.previousOutputs,
            [indexVariable]: currentIndex,
        });

        if (!conditionMet) {
            context.services.log('info', `Loop condition no longer met after ${currentIndex} iterations`);
            return this.completed({
                loopCompleted: true,
                totalIterations: currentIndex,
                _loopEnd: true,
            });
        }

        context.services.log('info', `While loop iteration ${currentIndex + 1}`);

        return this.completed({
            [indexVariable]: currentIndex,
            _loopContinue: true,
            _nextLoopIndex: currentIndex + 1,
        });
    }

    private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        const tokens = path
            .replace(/\[(\d+)\]/g, '.$1')
            .replace(/\["([^"]+)"\]/g, '.$1')
            .replace(/\['([^']+)'\]/g, '.$1')
            .split('.')
            .filter(Boolean);

        return tokens.reduce((current, key) => {
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
        }, obj as unknown);
    }

    private evaluateCondition(condition: string, data: Record<string, unknown>): boolean {
        try {
            // Simple expression evaluation (for production, use a proper expression parser)
            const func = new Function(...Object.keys(data), `return ${condition};`);
            return Boolean(func(...Object.values(data)));
        } catch (error) {
            this.logger.warn(`Failed to evaluate condition: ${condition}`, error);
            return false;
        }
    }

    validate(node: CompiledNode) {
        const { config } = node;
        const loopType = config.loopType as string;

        if (loopType === 'forEach' && !config.collection) {
            return {
                valid: false,
                errors: [{
                    field: 'collection',
                    message: 'forEach loop requires a collection path',
                    code: 'MISSING_REQUIRED',
                }],
            };
        }

        if (loopType === 'while' && !config.condition) {
            return {
                valid: false,
                errors: [{
                    field: 'condition',
                    message: 'while loop requires a condition',
                    code: 'MISSING_REQUIRED',
                }],
            };
        }

        return { valid: true };
    }
}
