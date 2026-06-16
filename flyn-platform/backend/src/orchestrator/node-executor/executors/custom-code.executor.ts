import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';
import { CustomNodeDefsService } from '../../custom-nodes/custom-node-defs.service';
import { ScopedContextService } from '../../custom-nodes/scoped-context.service';
import { VmSandboxRunner } from '../../custom-nodes/vm-sandbox-runner';
import { IsolatedVmRunner } from '../../custom-nodes/isolated-vm-runner';
import { SandboxRunner } from '../../custom-nodes/custom-node.types';

/**
 * CustomCodeExecutor — runs AI-authored node code inside a sandbox against a
 * capability-scoped, tenant-bound context.
 *
 * Node config must carry `customNodeId` (the def to load). The def's code runs
 * via the best available SandboxRunner; its return value becomes the node output.
 *
 * SAFETY GATES:
 *  - A def with environment='production' will ONLY run if a productionGrade
 *    runner is registered (i.e. isolated-vm). Otherwise it FAILS closed.
 *  - Sandbox/draft defs run on the interim vm runner for the author/test loop.
 */
@Injectable()
export class CustomCodeExecutor extends BaseExecutor {
  private readonly logger = new Logger(CustomCodeExecutor.name);
  readonly nodeType = NodeType.CUSTOM;
  readonly displayName = 'Custom (AI) Node';
  readonly description = 'Runs AI-authored, sandboxed code scoped to the tenant';

  private readonly runners: SandboxRunner[];

  constructor(
    private readonly defs: CustomNodeDefsService,
    private readonly scoped: ScopedContextService,
    isolatedRunner: IsolatedVmRunner,
    vmRunner: VmSandboxRunner,
  ) {
    super();
    // Production-grade runner first; falls back to the interim vm runner.
    this.runners = [isolatedRunner, vmRunner];
  }

  private pickRunner(productionRequired: boolean): SandboxRunner | undefined {
    // A production node MUST use a production-grade runner (else undefined → fail closed).
    if (productionRequired) return this.runners.find((r) => r.productionGrade);
    // Sandbox/draft: prefer production-grade if available, else an available
    // (non-production) runner. Never returns a dormant runner.
    return this.runners.find((r) => r.productionGrade) ?? this.runners.find((r) => !r.productionGrade);
  }

  async execute(node: CompiledNode, context: NodeExecutionContext): Promise<NodeResult> {
    const customNodeId = (node.config.customNodeId || node.config.custom_node_id) as string | undefined;
    if (!customNodeId) {
      return this.failed('CUSTOM_NODE_MISCONFIGURED', 'Node config is missing customNodeId', false);
    }

    const def = await this.defs.get(context.tenantId, customNodeId);
    if (!def) {
      return this.failed('CUSTOM_NODE_NOT_FOUND', `No custom node ${customNodeId} for this tenant`, false);
    }

    const productionRequired = def.environment === 'production';
    const runner = this.pickRunner(productionRequired);
    if (!runner) {
      // Fail closed: a production node cannot run on a non-production-grade sandbox.
      return this.failed(
        'NO_PRODUCTION_SANDBOX',
        'This node is marked production but no production-grade sandbox (isolated-vm) is provisioned. Refusing to run.',
        false,
      );
    }

    const ctx = this.scoped.build({
      tenantId: context.tenantId,
      actorUserId: (context.token as any)?.actorUserId,
      inputs: context.previousOutputs || {},
      log: (level, message, data) => context.services.log(level, `[custom:${def.label}] ${message}`, data),
      getSecret: (key) => context.services.getSecret(key),
    });

    try {
      const output = await runner.run(def.code, ctx, { timeoutMs: 5000 });
      return this.completed({
        customNodeId,
        runner: runner.id,
        result: output ?? null,
        executedAt: new Date().toISOString(),
      });
    } catch (err) {
      return this.failed('CUSTOM_NODE_RUNTIME_ERROR', (err as Error).message, true, { customNodeId });
    }
  }
}
