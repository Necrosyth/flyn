import { Injectable, Logger } from '@nestjs/common';
import * as vm from 'vm';
import { SandboxRunner, ScopedNodeContext } from './custom-node.types';

/**
 * VmSandboxRunner — INTERIM sandbox using Node's `vm`.
 *
 * ⚠️  `productionGrade = false`. Node `vm` is NOT a hard security boundary
 * (a determined escape can reach the host realm). It is used here because:
 *   - it compiles on node:20-alpine with NO native build deps, and
 *   - the real security boundary is the capability-scoped ScopedNodeContext —
 *     the code can only touch what the ctx object exposes (this tenant only).
 *
 * Before any AI-authored node is promoted to PRODUCTION, swap in an
 * IsolatedVmRunner (`isolated-vm`, productionGrade=true) — which also requires
 * adding python3/make/g++ to the Dockerfile builder stage. Until such a runner
 * is registered, CustomCodeExecutor refuses to run production nodes.
 *
 * Exposed globals are frozen and deliberately minimal: NO process, require,
 * global, fs, eval-of-host, timers, or network except via ctx.httpFetch.
 */
@Injectable()
export class VmSandboxRunner implements SandboxRunner {
  readonly id = 'vm';
  readonly productionGrade = false;
  private readonly logger = new Logger(VmSandboxRunner.name);

  async run(code: string, ctx: ScopedNodeContext, opts: { timeoutMs: number }): Promise<unknown> {
    // The code body runs as an async function receiving only `ctx`.
    const wrapped = `(async function(ctx){ "use strict";\n${code}\n})(ctx)`;

    const sandboxGlobals = Object.freeze({
      ctx,
      Math, JSON, String, Number, Boolean, Array, Object, Date,
      parseFloat, parseInt, isNaN, Promise,
      // No console — code must use ctx.log; no process/require/global/fetch/setTimeout.
    });

    const context = vm.createContext(sandboxGlobals);
    try {
      const script = new vm.Script(wrapped);
      // Synchronous timeout guards the synchronous portion; awaited I/O is bounded
      // by ctx.httpFetch / ctx.callFlynApi having their own timeouts.
      const result = script.runInContext(context, { timeout: opts.timeoutMs });
      return await Promise.resolve(result);
    } catch (err) {
      this.logger.warn(`Sandbox run failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
