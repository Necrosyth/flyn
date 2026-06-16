import { Injectable, Logger } from '@nestjs/common';
import * as vm from 'vm';
import { CustomNodeDefsService } from './custom-node-defs.service';
import { ScopedContextService } from './scoped-context.service';
import { VmSandboxRunner } from './vm-sandbox-runner';
import { IsolatedVmRunner } from './isolated-vm-runner';
import {
  CustomNodeDef, CustomNodeField, CustomNodeKind, CustomNodeTestCase, CustomNodeTestResult, SandboxRunner,
} from './custom-node.types';

/**
 * CustomNodeService — the author / test / promote loop engine.
 *
 * This is what the AI (via workflow-assistant tools) drives:
 *   authorDraft → runTests (in sandbox) → [AI reads failures, re-authors] → … →
 *   when green, status='tested'. Promotion to PRODUCTION is the only gated step
 *   and requires a production-grade sandbox runner.
 */
@Injectable()
export class CustomNodeService {
  private readonly logger = new Logger(CustomNodeService.name);
  private readonly runners: SandboxRunner[];

  constructor(
    private readonly defs: CustomNodeDefsService,
    private readonly scoped: ScopedContextService,
    isolatedRunner: IsolatedVmRunner,
    vmRunner: VmSandboxRunner,
  ) {
    // Production-grade runner first; interim vm runner as sandbox fallback.
    this.runners = [isolatedRunner, vmRunner];
  }

  private productionRunner(): SandboxRunner | undefined {
    return this.runners.find((r) => r.productionGrade);
  }
  private sandboxRunner(): SandboxRunner {
    // Prefer production-grade; else the first available (non-production) runner.
    // Never returns a dormant runner (e.g. isolated-vm when not installed).
    const r = this.productionRunner() ?? this.runners.find((x) => !x.productionGrade);
    if (!r) throw new Error('No sandbox runner available');
    return r;
  }

  /** Persist an AI-authored draft (always starts in sandbox/draft). */
  async authorDraft(params: {
    tenantId: string;
    createdByUid: string;
    nodeId: string;
    kind: CustomNodeKind;
    targetType?: string;
    label: string;
    description?: string;
    schema: CustomNodeField[];
    code: string;
    testCases?: CustomNodeTestCase[];
  }): Promise<CustomNodeDef> {
    const def: CustomNodeDef = {
      nodeId: params.nodeId,
      tenantId: params.tenantId,
      createdByUid: params.createdByUid,
      kind: params.kind,
      targetType: params.targetType,
      label: params.label,
      description: params.description,
      schema: params.schema ?? [],
      code: params.code,
      status: 'draft',
      environment: 'sandbox',
      version: 0,
      testSuite: params.testCases ? { cases: params.testCases } : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return this.defs.save(def);
  }

  /**
   * Run the def's test suite in the sandbox. Each case builds a scoped ctx with
   * the case inputs, runs the code, then evaluates the optional `expect`
   * expression against `output`. Persists lastRun and flips status.
   */
  async runTests(tenantId: string, nodeId: string): Promise<{ passed: number; total: number; results: CustomNodeTestResult[] }> {
    const def = await this.defs.get(tenantId, nodeId);
    if (!def) throw new Error('Custom node not found');
    const cases = def.testSuite?.cases ?? [];
    const runner = this.sandboxRunner();
    const results: CustomNodeTestResult[] = [];

    for (const c of cases) {
      try {
        const ctx = this.scoped.build({
          tenantId,
          inputs: c.inputs ?? {},
          log: () => undefined,
          getSecret: async () => undefined,
        });
        const output = await runner.run(def.code, ctx, { timeoutMs: 5000 });
        const passed = this.evaluateExpect(c.expect, output);
        results.push({ case: c.name, passed, output });
      } catch (err) {
        results.push({ case: c.name, passed: false, error: (err as Error).message });
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    const allGreen = total > 0 && passed === total;
    await this.defs.save({
      ...def,
      status: allGreen ? 'tested' : 'failed',
      testSuite: { cases, lastRun: { at: new Date().toISOString(), passed, total, results } },
    });
    return { passed, total, results };
  }

  /** Evaluate an `expect` expression (e.g. "output.total === 3") in a tiny sandbox. */
  private evaluateExpect(expr: string | undefined, output: unknown): boolean {
    if (!expr || !expr.trim()) return true; // no assertion → ran without throwing = pass
    try {
      const ctx = vm.createContext(Object.freeze({ output, Math, JSON, String, Number, Boolean, Array, Object }));
      const result = vm.runInContext(`(function(){ return (${expr}); })()`, ctx, { timeout: 1000 });
      return result === true;
    } catch {
      return false;
    }
  }

  /**
   * Promote a tested node to PRODUCTION (live). The ONLY gated step.
   * Refuses unless: status is 'tested' AND a production-grade sandbox exists.
   */
  async promote(tenantId: string, nodeId: string): Promise<CustomNodeDef> {
    const def = await this.defs.get(tenantId, nodeId);
    if (!def) throw new Error('Custom node not found');
    if (def.status !== 'tested') {
      throw new Error(`Cannot promote: status is '${def.status}', tests must pass first`);
    }
    if (!this.productionRunner()) {
      throw new Error(
        'Cannot promote to production: no production-grade sandbox (isolated-vm) is provisioned. ' +
        'Add the IsolatedVmRunner + Dockerfile build deps first.',
      );
    }
    return this.defs.save({ ...def, status: 'live', environment: 'production', publishedAt: Date.now() });
  }

  list(tenantId: string) { return this.defs.listLive(tenantId); }
  get(tenantId: string, nodeId: string) { return this.defs.get(tenantId, nodeId); }
  revisions(tenantId: string, nodeId: string) { return this.defs.listRevisions(tenantId, nodeId); }
  rollback(tenantId: string, nodeId: string, v: number) { return this.defs.rollback(tenantId, nodeId, v); }
}
