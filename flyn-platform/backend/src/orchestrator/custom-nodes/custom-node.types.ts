/**
 * AI-Authored / AI-Patched Custom Nodes — core types.
 * See Exchanged_docs/AI_Custom_Nodes_Design.md.
 */

/** A single configurable field rendered in the right-side PropertyPanel. */
export interface CustomNodeField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'textarea' | 'toggle' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
}

export type CustomNodeStatus = 'draft' | 'testing' | 'tested' | 'live' | 'failed';
export type CustomNodeEnvironment = 'sandbox' | 'production';
export type CustomNodeKind = 'custom' | 'override';

/** A single AI-authored test case run inside the sandbox before publish. */
export interface CustomNodeTestCase {
  name: string;
  inputs: Record<string, unknown>;
  /** Optional JS expression evaluated against `output` (e.g. "output.total === 3"). */
  expect?: string;
}

export interface CustomNodeTestResult {
  case: string;
  passed: boolean;
  output?: unknown;
  error?: string;
}

/**
 * Persisted definition of an AI-authored node (kind='custom') or an
 * AI-patch of an existing node type (kind='override'). Stored per-tenant at
 * custom_node_defs/{tenantId}/{nodeId}, with each save snapshotted under
 * .../revisions/{version} for one-click rollback.
 */
export interface CustomNodeDef {
  nodeId: string;
  tenantId: string;
  createdByUid: string;
  kind: CustomNodeKind;
  /** For kind='override': the built-in NodeType this patch wraps. */
  targetType?: string;

  // Palette + panel metadata
  label: string;
  description?: string;
  icon?: string;
  category?: string;

  // Contract
  schema: CustomNodeField[];
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;

  /** AI-authored code, executed against the scoped context (ScopedNodeContext). */
  code: string;

  status: CustomNodeStatus;
  environment: CustomNodeEnvironment;
  version: number;

  testSuite?: {
    cases: CustomNodeTestCase[];
    lastRun?: { at: string; passed: number; total: number; results: CustomNodeTestResult[] };
  };

  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

/**
 * The ONLY surface AI-authored code can touch. Capability-scoped to a single
 * tenant + acting user — the code cannot address another tenant or exceed the
 * user's access because those capabilities are not present on this object.
 * This (not the sandbox) is the primary security boundary.
 */
export interface ScopedNodeContext {
  /** Previous node outputs for this run. */
  inputs: Record<string, unknown>;
  /** Fixed; code cannot change it. */
  readonly tenantId: string;
  /** The user on whose behalf the workflow runs. */
  readonly actorUserId?: string;

  /** Firestore access auto-scoped to this tenant (see ScopedDb). */
  db: ScopedDb;
  /** Tenant secrets only. */
  secrets: { get(key: string): Promise<string | undefined> };
  /** Allow-listed outbound HTTP only. */
  httpFetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string }>;
  /** Calls a Flyn API endpoint scoped to this tenant/user (scope-checked). */
  callFlynApi(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }>;
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}

/** A Firestore handle whose reads/writes are forced into the tenant's namespace. */
export interface ScopedDb {
  collection(name: string): ScopedCollection;
}
export interface ScopedCollection {
  /** Equality filters are merged with a mandatory tenantId == <tenant> filter. */
  find(where?: Record<string, unknown>, limit?: number): Promise<Array<Record<string, unknown>>>;
  get(id: string): Promise<Record<string, unknown> | null>;
  /** tenantId is force-stamped; cannot be overridden by the document. */
  add(doc: Record<string, unknown>): Promise<{ id: string }>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
}

/**
 * Pluggable sandbox runner. The scoped context is the security boundary; the
 * runner adds defense-in-depth isolation (timeout/memory/global lockdown).
 *
 * - VmSandboxRunner (interim): Node `vm`, hardened globals. NOT escape-proof —
 *   acceptable only because the scoped context limits reach. Compiles on Alpine
 *   with no native deps.
 * - IsolatedVmRunner (production target): real V8 isolate. Requires `isolated-vm`
 *   (native) + Dockerfile build deps. To be added before production promotion.
 */
export interface SandboxRunner {
  /** Stable id, e.g. 'vm' | 'isolated-vm'. */
  readonly id: string;
  /** Whether this runner is considered safe enough for production promotion. */
  readonly productionGrade: boolean;
  run(code: string, ctx: ScopedNodeContext, opts: { timeoutMs: number }): Promise<unknown>;
}
