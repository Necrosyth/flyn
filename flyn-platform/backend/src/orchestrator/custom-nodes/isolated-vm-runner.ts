import { Injectable, Logger } from '@nestjs/common';
import { SandboxRunner, ScopedNodeContext } from './custom-node.types';

/**
 * IsolatedVmRunner — PRODUCTION-grade sandbox using `isolated-vm` (a real V8
 * isolate: separate heap, memory cap, no host globals, no escape to the Node
 * realm). This is what unlocks promotion of AI-authored nodes to production.
 *
 * SAFE ACTIVATION MODEL:
 *  - `isolated-vm` is an OPTIONAL dependency, require'd lazily. If it isn't
 *    installed/compiled, this runner self-disables (`available=false`,
 *    `productionGrade=false`) and the system falls back to the gated vm runner —
 *    so the build NEVER breaks and production promotion stays correctly closed.
 *  - The Dockerfile installs python3/make/g++ so the native module CAN compile.
 *
 * ⚠️  UNVERIFIED IN THIS ENVIRONMENT: the isolate bridge below follows the
 * documented isolated-vm v5 API but has not been executed here (no native build
 * available). It must be exercised by a real Docker build + a test node run
 * before this is trusted for production. Until `available` is true at runtime,
 * none of this code path executes.
 *
 * Bridge model: host capabilities (ctx.db/secrets/httpFetch/callFlynApi/log) are
 * exposed to the isolate through a single async dispatcher Reference, with all
 * arguments/results passed as JSON. Inside the isolate a `ctx` object is
 * reconstructed whose methods call the dispatcher. The scoped context remains
 * the security boundary; the isolate adds hard memory/CPU/global isolation.
 */
@Injectable()
export class IsolatedVmRunner implements SandboxRunner {
  readonly id = 'isolated-vm';
  private readonly logger = new Logger(IsolatedVmRunner.name);
  private ivm: any | null = null;

  constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.ivm = require('isolated-vm');
      this.logger.log('isolated-vm loaded — production-grade sandbox available');
    } catch {
      this.ivm = null;
      this.logger.warn('isolated-vm not installed — production custom nodes remain gated (vm fallback only)');
    }
  }

  /** Only production-grade when the native module actually loaded. */
  get productionGrade(): boolean {
    return this.ivm !== null;
  }

  async run(code: string, ctx: ScopedNodeContext, opts: { timeoutMs: number }): Promise<unknown> {
    if (!this.ivm) throw new Error('isolated-vm not available');
    const ivm = this.ivm;

    const isolate = new ivm.Isolate({ memoryLimit: 128 });
    try {
      const context = await isolate.createContext();
      const jail = context.global;

      // Plain data → copied into the isolate.
      await jail.set('__inputs', new ivm.ExternalCopy(ctx.inputs ?? {}).copyInto());
      await jail.set('__tenantId', ctx.tenantId);
      await jail.set('__actorUserId', ctx.actorUserId ?? null);

      // Single async host dispatcher (JSON in / JSON out) for all capabilities.
      const dispatch = new ivm.Reference(async (op: string, argsJson: string): Promise<string> => {
        const args = JSON.parse(argsJson || '[]');
        switch (op) {
          case 'db.find':   return JSON.stringify(await ctx.db.collection(args[0]).find(args[1], args[2]));
          case 'db.get':    return JSON.stringify(await ctx.db.collection(args[0]).get(args[1]));
          case 'db.add':    return JSON.stringify(await ctx.db.collection(args[0]).add(args[1]));
          case 'db.update': await ctx.db.collection(args[0]).update(args[1], args[2]); return 'null';
          case 'secrets.get': return JSON.stringify((await ctx.secrets.get(args[0])) ?? null);
          case 'httpFetch': return JSON.stringify(await ctx.httpFetch(args[0], args[1]));
          case 'callFlynApi': return JSON.stringify(await ctx.callFlynApi(args[0], args[1], args[2]));
          case 'log': ctx.log(args[0], args[1], args[2]); return 'null';
          default: throw new Error(`unknown op ${op}`);
        }
      });
      await jail.set('__dispatch', dispatch);

      // Reconstruct a `ctx` inside the isolate that proxies to the host dispatcher.
      const bootstrap = `
        const __call = (op, ...args) =>
          __dispatch.apply(undefined, [op, JSON.stringify(args)], { result: { promise: true }, arguments: { copy: true } })
            .then(s => JSON.parse(s));
        globalThis.ctx = {
          inputs: __inputs,
          tenantId: __tenantId,
          actorUserId: __actorUserId,
          db: { collection: (name) => ({
            find:   (where, limit) => __call('db.find', name, where || {}, limit || 100),
            get:    (id)           => __call('db.get', name, id),
            add:    (doc)          => __call('db.add', name, doc),
            update: (id, patch)    => __call('db.update', name, id, patch),
          })},
          secrets: { get: (k) => __call('secrets.get', k) },
          httpFetch: (url, init) => __call('httpFetch', url, init || {}),
          callFlynApi: (m, p, b) => __call('callFlynApi', m, p, b),
          log: (lvl, msg, data) => __call('log', lvl, msg, data),
        };
      `;
      await (await isolate.compileScript(bootstrap)).run(context, { timeout: opts.timeoutMs });

      const userScript = `(async function(ctx){ "use strict";\n${code}\n})(globalThis.ctx)`;
      const script = await isolate.compileScript(userScript);
      // promise:true awaits the async body; copy:true returns the result by value.
      const result = await script.run(context, { timeout: opts.timeoutMs, promise: true, copy: true });
      return result;
    } finally {
      try { isolate.dispose(); } catch { /* already disposed */ }
    }
  }
}
