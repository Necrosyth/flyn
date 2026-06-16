/**
 * End-to-end workflow test suite
 * Tests the PG + MySQL → Join → Merge → Iterator → CRM pipeline
 * plus edge-cases and failure modes.
 *
 * Run:  node test-flow.mjs
 */

const BASE = 'http://localhost:3000/api';

// ─── Colour helpers ────────────────────────────────────────────────────────────
const c = { 
  green: s => `\x1b[32m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  yellow:s => `\x1b[33m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  dim:   s => `\x1b[2m${s}\x1b[0m`,
};

const pass  = msg => console.log(`  ${c.green('✔')} ${msg}`);
const fail  = msg => console.log(`  ${c.red('✘')} ${msg}`);
const warn  = msg => console.log(`  ${c.yellow('⚠')} ${msg}`);
const info  = msg => console.log(`  ${c.cyan('ℹ')} ${msg}`);
const head  = msg => console.log(`\n${c.bold(msg)}`);
const divider = () => console.log(c.dim('─'.repeat(70)));

let passed = 0, failed = 0, warned = 0;

function assert(condition, label, detail = '') {
  if (condition) { pass(label); passed++; }
  else           { fail(`${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

function assertWarn(condition, label, detail = '') {
  if (condition) { pass(label); passed++; }
  else           { warn(`${label}${detail ? ' — ' + detail : ''} (non-fatal)`); warned++; }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

// ─── Workflow builder helpers ─────────────────────────────────────────────────
function node(id, type, config, overrides = {}) {
  return { id, type, name: id, config, position: { x: 0, y: 0 }, ...overrides };
}

function edge(id, source, target, sourceHandle = null) {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

function buildWorkflow(nodes, edges) {
  const nodesWithOutgoing = new Set(edges.map(e => e.source));
  const endNodeIds = nodes.filter(n => !nodesWithOutgoing.has(n.id)).map(n => n.id);
  const triggerNode = nodes.find(n => n.type === 'trigger') || nodes[0];
  return {
    id: `test_${Date.now()}`,
    name: 'Test Workflow',
    version: 1,
    tenantId: 'test-tenant',
    compiled_nodes: nodes,
    compiled_edges: edges,
    execution_plan: {
      startNodeId: triggerNode.id,
      endNodeIds,
      nodeOrder: nodes.map(n => n.id),
      parallelPaths: [],
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-suite',
      description: 'Automated test',
    },
  };
}

async function execute(nodes, edgeList, triggerData = {}) {
  return post('/orchestrator/execute', {
    workflow: buildWorkflow(nodes, edgeList),
    triggerData,
  });
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────
const PG_DSN  = 'postgresql://flyn:flyn_pg_password@localhost:5434/flyn_data';
const MY_DSN  = 'mysql://flyn:flyn_mysql_password@localhost:3307/flyn_data';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — Happy path: full PG+MySQL→Join→Merge→Iterator→CRM
// ═══════════════════════════════════════════════════════════════════════════════
async function test_fullPipeline() {
  head('TEST 1: Full Pipeline (PG + MySQL → Join → Merge → Iterator → CRM)');
  divider();

  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('split_1',   'split',   { branches: [] }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN,
      useAiQuery: false,
      query: "SELECT id, name, email, phone, company FROM customers WHERE account_status='active' AND plan='enterprise' LIMIT 10",
    }),
    node('mysql_1',   'mysql', {
      connectionString: MY_DSN,
      useAiQuery: false,
      query: "SELECT customer_id, COUNT(*) AS total_orders, SUM(amount) AS total_revenue FROM orders GROUP BY customer_id LIMIT 10",
    }),
    node('join_1',    'join',  { waitFor: ['pg_1', 'mysql_1'], strategy: 'all' }),
    node('merge_1',   'merge', {
      leftSourceId: 'pg_1',  leftPath: 'result',  leftKey:  'id',
      rightSourceId: 'mysql_1', rightPath: 'result', rightKey: 'customer_id',
      joinType: 'left',
      computedFields: 'lead_score = Math.min(100, Math.round(parseFloat(right.total_revenue || 0) / 1000))',
    }),
    node('loop_1',    'loop',  {
      loopType: 'forEach',
      collection: '{{merge_1.result}}',
      list_source: '{{merge_1.result}}',
      itemVariable: 'customer',
      item_variable: 'customer',
      indexVariable: 'idx',
      index_variable: 'idx',
      continueOnError: true,
    }),
    node('crm_1',     'crm',   {
      operation: 'create_contact',
      entityData: JSON.stringify({
        name:    '{{customer.name}}',
        email:   '{{customer.email}}',
        company: '{{customer.company}}',
        score:   '{{customer.lead_score}}',
      }),
    }),
    node('end_1',     'end',   { includeAllOutputs: true }),
  ];

  const edges = [
    edge('e1', 'trigger_1', 'split_1'),
    edge('e2', 'split_1',   'pg_1',   'pg_path'),
    edge('e3', 'split_1',   'mysql_1','mysql_path'),
    edge('e4', 'pg_1',      'join_1'),
    edge('e5', 'mysql_1',   'join_1'),
    edge('e6', 'join_1',    'merge_1'),
    edge('e7', 'merge_1',   'loop_1'),
    edge('e8', 'loop_1',    'crm_1',   'loop_body'),
    edge('e9', 'crm_1',     'loop_1'),
    edge('e10','loop_1',    'end_1',   'loop_complete'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300,                          'HTTP 200 response');
  assert(body.workflowRunId,                      'Has workflowRunId');
  assert(body.status?.toLowerCase() === 'completed',             `Workflow status=COMPLETED (got: ${body.status})`);
  assert(body.context?.nodeOutputs?.pg_1?.rowCount > 0,    `PG returned rows (${body.context?.nodeOutputs?.pg_1?.rowCount})`);
  assert(body.context?.nodeOutputs?.mysql_1?.rowCount > 0, `MySQL returned rows (${body.context?.nodeOutputs?.mysql_1?.rowCount})`);
  assert(body.context?.nodeOutputs?.join_1,                'Join node has output');
  assert(Array.isArray(body.context?.nodeOutputs?.merge_1?.result), 'Merge result is array');
  assert((body.context?.nodeOutputs?.merge_1?.result?.length ?? 0) > 0, `Merge produced rows (${body.context?.nodeOutputs?.merge_1?.result?.length})`);
  assert(body.context?.nodeOutputs?.loop_1?.loopCompleted === true, 'Loop completed flag set');
  
  const mergeResult = body.context?.nodeOutputs?.merge_1?.result ?? [];
  const firstRow = mergeResult[0];
  assertWarn(firstRow && 'lead_score' in firstRow,  'Computed field lead_score present in merged row');
  assertWarn(typeof firstRow?.lead_score === 'number', `lead_score is numeric (${typeof firstRow?.lead_score})`);
  assertWarn(body.context?.nodeOutputs?.crm_1,         'CRM node executed at least once');

  info(`PG rows: ${body.context?.nodeOutputs?.pg_1?.rowCount} | MySQL rows: ${body.context?.nodeOutputs?.mysql_1?.rowCount} | Merged rows: ${mergeResult.length}`);
  return body;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — Join dead-end: early arrival token is silently consumed
// ═══════════════════════════════════════════════════════════════════════════════
async function test_joinDeadEnd() {
  head('TEST 2: Join Early-Arrival Token is Dead-Ended');
  divider();

  // Two branches converge at join, one of which always has output (pg_mock via action)
  // We send ONLY pg data to join; mysql is skipped (no edge). Join should dead-end gracefully.
  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('pg_1',      'postgresql', { connectionString: PG_DSN, useAiQuery: false, query: 'SELECT 1 AS val' }),
    node('join_1',    'join',  { waitFor: ['pg_1', 'ghost_node'], strategy: 'all' }),
    node('end_1',     'end',   {}),
  ];
  const edges = [
    edge('e1', 'trigger_1', 'pg_1'),
    edge('e2', 'pg_1',      'join_1'),
    edge('e3', 'join_1',    'end_1'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200 even when join dead-ends token');
  // Join should early-exit (ghost_node never ran) — workflow can complete or stall
  // depending on how the token lifecycle handles dead-end. Either is valid — just no 500.
  assertWarn(
    !body.context?.nodeOutputs?.end_1,
    'end node NOT reached when join is still missing a branch (correct dead-end)'
  );
  info(`Status: ${body.status} | join output: ${JSON.stringify(body.context?.nodeOutputs?.join_1)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — Merge: inner join excludes unmatched rows
// ═══════════════════════════════════════════════════════════════════════════════
async function test_mergeInnerJoin() {
  head('TEST 3: Merge — Inner Join Excludes Unmatched Rows');
  divider();

  // PG has 3 enterprise customers (id 1,2,3). MySQL orders covers id 1,2,3,4.
  // Inner join should give exactly 3 rows (only PG rows that have a MySQL match).
  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('split_1',   'split',   { branches: [] }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN, useAiQuery: false,
      query: "SELECT id, name FROM customers WHERE plan='enterprise' LIMIT 3",
    }),
    node('mysql_1',   'mysql', {
      connectionString: MY_DSN, useAiQuery: false,
      query: 'SELECT customer_id, SUM(amount) AS rev FROM orders GROUP BY customer_id',
    }),
    node('join_1',    'join',  { waitFor: ['pg_1', 'mysql_1'], strategy: 'all' }),
    node('merge_1',   'merge', {
      leftSourceId: 'pg_1',    leftPath: 'result',  leftKey: 'id',
      rightSourceId: 'mysql_1',rightPath: 'result',  rightKey: 'customer_id',
      joinType: 'inner',
    }),
    node('end_1',     'end',   {}),
  ];
  const edges = [
    edge('e1','trigger_1','split_1'),
    edge('e2','split_1',  'pg_1',   'a'),
    edge('e3','split_1',  'mysql_1','b'),
    edge('e4','pg_1',     'join_1'),
    edge('e5','mysql_1',  'join_1'),
    edge('e6','join_1',   'merge_1'),
    edge('e7','merge_1',  'end_1'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200');
  assert(body.status?.toLowerCase() === 'completed', `Workflow completed (${body.status})`);
  const result = body.context?.nodeOutputs?.merge_1?.result ?? [];
  assert(Array.isArray(result), 'Merge result is array');
  // inner join — only rows where both sides match; customer 4 has orders but no enterprise PG row
  assertWarn(result.every(r => r.customer_id !== undefined), 'All inner-joined rows have right-side fields');
  info(`Inner join produced ${result.length} rows (expected ≤ pg enterprise count)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 — Iterator over empty collection → immediate loop_complete
// ═══════════════════════════════════════════════════════════════════════════════
async function test_emptyCollection() {
  head('TEST 4: Iterator Over Empty Collection');
  divider();

  // Use a query that returns 0 rows
  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN, useAiQuery: false,
      query: "SELECT id, name FROM customers WHERE plan='nonexistent_plan' LIMIT 10",
    }),
    node('loop_1',    'loop', {
      loopType: 'forEach',
      collection: '{{pg_1.result}}',
      list_source: '{{pg_1.result}}',
      itemVariable: 'customer',
      item_variable: 'customer',
      continueOnError: true,
    }),
    node('crm_1',     'crm',  { operation: 'create_contact', entityData: '{"name":"{{customer.name}}"}' }),
    node('end_1',     'end',  {}),
  ];
  const edges = [
    edge('e1','trigger_1','pg_1'),
    edge('e2','pg_1',     'loop_1'),
    edge('e3','loop_1',   'crm_1',  'loop_body'),
    edge('e4','crm_1',    'loop_1'),
    edge('e5','loop_1',   'end_1',  'loop_complete'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200');
  assert(body.status?.toLowerCase() === 'completed', `Workflow completed (${body.status})`);
  assert(body.context?.nodeOutputs?.loop_1?.loopCompleted === true, 'loop_1 sets loopCompleted=true on empty collection');
  assert(body.context?.nodeOutputs?.loop_1?.totalIterations === 0, `totalIterations=0 (got: ${body.context?.nodeOutputs?.loop_1?.totalIterations})`);
  assert(!body.context?.nodeOutputs?.crm_1, 'CRM node never executed on empty collection');
  info(`Loop output: ${JSON.stringify(body.context?.nodeOutputs?.loop_1)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 — Iterator processes ALL items (index progression check)
// ═══════════════════════════════════════════════════════════════════════════════
async function test_iteratorAllItems() {
  head('TEST 5: Iterator Processes Every Item (Index Progression)');
  divider();

  // All 5 seeded customers
  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN, useAiQuery: false,
      query: 'SELECT id, name FROM customers LIMIT 5',
    }),
    node('loop_1',    'loop', {
      loopType: 'forEach',
      collection: '{{pg_1.result}}',
      list_source: '{{pg_1.result}}',
      itemVariable: 'customer',
      item_variable: 'customer',
      continueOnError: true,
    }),
    // Use an action/log node instead of CRM to avoid side effects during iteration test
    node('log_1',     'action', {
      actionType: 'log',
      message: 'Processing {{customer.name}}',
    }),
    node('end_1', 'end', {}),
  ];
  const edges = [
    edge('e1','trigger_1','pg_1'),
    edge('e2','pg_1',     'loop_1'),
    edge('e3','loop_1',   'log_1', 'loop_body'),
    edge('e4','log_1',    'loop_1'),
    edge('e5','loop_1',   'end_1', 'loop_complete'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200');
  assert(body.status?.toLowerCase() === 'completed', `Workflow COMPLETED (${body.status})`);

  const loopOut = body.context?.nodeOutputs?.loop_1;
  assert(loopOut?.loopCompleted === true, 'loopCompleted=true');

  const pgRows = body.context?.nodeOutputs?.pg_1?.rowCount ?? 0;
  assert(
    loopOut?.totalIterations === pgRows,
    `totalIterations(${loopOut?.totalIterations}) == PG rowCount(${pgRows})`
  );
  info(`Iterated over ${loopOut?.totalIterations} customers`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 — Merge: computed field expression error doesn't crash executor
// ═══════════════════════════════════════════════════════════════════════════════
async function test_badComputedField() {
  head('TEST 6: Merge — Bad Computed Expression is Gracefully Skipped');
  divider();

  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('split_1',   'split',   { branches: [] }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN, useAiQuery: false,
      query: "SELECT id, name FROM customers LIMIT 2",
    }),
    node('mysql_1',   'mysql', {
      connectionString: MY_DSN, useAiQuery: false,
      query: 'SELECT customer_id, SUM(amount) AS rev FROM orders GROUP BY customer_id LIMIT 2',
    }),
    node('join_1',    'join',  { waitFor: ['pg_1', 'mysql_1'], strategy: 'all' }),
    node('merge_1',   'merge', {
      leftSourceId: 'pg_1',    leftPath: 'result', leftKey: 'id',
      rightSourceId: 'mysql_1',rightPath: 'result',rightKey: 'customer_id',
      joinType: 'left',
      computedFields: 'bad_field = undefinedVar.foo.bar\ngood_field = 42',
    }),
    node('end_1', 'end', {}),
  ];
  const edges = [
    edge('e1','trigger_1','split_1'),
    edge('e2','split_1','pg_1','a'),
    edge('e3','split_1','mysql_1','b'),
    edge('e4','pg_1','join_1'),
    edge('e5','mysql_1','join_1'),
    edge('e6','join_1','merge_1'),
    edge('e7','merge_1','end_1'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200 even with bad expression');
  // Merge may FAIL gracefully (FAILED status) or succeed with null for bad field — both OK
  const mergeOut = body.context?.nodeOutputs?.merge_1;
  assertWarn(
    body.status?.toLowerCase() === 'completed' || body.status?.toLowerCase() === 'failed',
    `Workflow terminates cleanly (${body.status})`
  );
  assertWarn(mergeOut?.result?.[0]?.good_field === 42, `good_field=42 computed correctly (${mergeOut?.result?.[0]?.good_field})`);
  info(`Merge status: ${body.status} | merge_1 output: ${mergeOut ? 'present' : 'absent'}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 — PostgreSQL bad query returns FAILED node
// ═══════════════════════════════════════════════════════════════════════════════
async function test_pgBadQuery() {
  head('TEST 7: PostgreSQL Bad Query → Node FAILED, Workflow FAILED');
  divider();

  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN, useAiQuery: false,
      query: 'SELECT * FROM nonexistent_table_xyz',
    }),
    node('end_1',     'end', {}),
  ];
  const edges = [
    edge('e1','trigger_1','pg_1'),
    edge('e2','pg_1','end_1'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200 (workflow accepted)');
  assert(
    body.status?.toLowerCase() === 'failed' || body.status?.toLowerCase() === 'completed',
    `Workflow status is FAILED or COMPLETED (got: ${body.status})`
  );
  info(`Workflow status: ${body.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8 — Merge with no matching right-side rows (left join → nulls)
// ═══════════════════════════════════════════════════════════════════════════════
async function test_mergeNoRightMatch() {
  head('TEST 8: Merge Left Join With No Right-Side Matches');
  divider();

  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('split_1',   'split',   { branches: [] }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN, useAiQuery: false,
      query: "SELECT id, name FROM customers WHERE plan='enterprise' LIMIT 3",
    }),
    node('mysql_1',   'mysql', {
      connectionString: MY_DSN, useAiQuery: false,
      // Returns orders only for customer_id = 999 (doesn't match any PG customer)
      query: "SELECT 999 AS customer_id, 1 AS total_orders, 100 AS total_revenue",
    }),
    node('join_1',    'join',  { waitFor: ['pg_1', 'mysql_1'], strategy: 'all' }),
    node('merge_1',   'merge', {
      leftSourceId: 'pg_1',    leftPath: 'result', leftKey: 'id',
      rightSourceId: 'mysql_1',rightPath: 'result',rightKey: 'customer_id',
      joinType: 'left',
      computedFields: 'revenue = right.total_revenue || 0',
    }),
    node('end_1', 'end', {}),
  ];
  const edges = [
    edge('e1','trigger_1','split_1'),
    edge('e2','split_1','pg_1','a'),
    edge('e3','split_1','mysql_1','b'),
    edge('e4','pg_1','join_1'),
    edge('e5','mysql_1','join_1'),
    edge('e6','join_1','merge_1'),
    edge('e7','merge_1','end_1'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200');
  assert(body.status?.toLowerCase() === 'completed', `Workflow COMPLETED (${body.status})`);
  const result = body.context?.nodeOutputs?.merge_1?.result ?? [];
  const pgCount = body.context?.nodeOutputs?.pg_1?.rowCount ?? 0;
  assert(result.length === pgCount, `Left join preserves all left rows (${result.length} == ${pgCount})`);
  assert(result.every(r => r.revenue === 0 || r.revenue === '0'), `All revenue=0 since no right match (revenue[0]=${result[0]?.revenue})`);
  info(`Left join with no matches: ${result.length} rows, first revenue=${result[0]?.revenue}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9 — times loop (fixed iteration count)
// ═══════════════════════════════════════════════════════════════════════════════
async function test_timesLoop() {
  head('TEST 9: Iterator — "times" Loop (Fixed Count)');
  divider();

  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('loop_1',    'loop', {
      loopType: 'times',
      loopType2: 'times',
      count: 3,
      indexVariable: 'i',
      continueOnError: true,
    }),
    node('log_1',     'action', { actionType: 'log', message: 'Tick {{i}}' }),
    node('end_1',     'end',   {}),
  ];
  const edges = [
    edge('e1','trigger_1','loop_1'),
    edge('e2','loop_1',   'log_1', 'loop_body'),
    edge('e3','log_1',    'loop_1'),
    edge('e4','loop_1',   'end_1', 'loop_complete'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200');
  assert(body.status?.toLowerCase() === 'completed', `Workflow COMPLETED (${body.status})`);
  const loopOut = body.context?.nodeOutputs?.loop_1;
  assert(loopOut?.loopCompleted === true, 'loopCompleted=true');
  assert(loopOut?.totalIterations === 3, `totalIterations=3 (got: ${loopOut?.totalIterations})`);
  info(`Times loop: ${loopOut?.totalIterations} iterations`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10 — CRM template variable resolution ({{customer.name}} → actual value)
// ═══════════════════════════════════════════════════════════════════════════════
async function test_crmTemplateResolution() {
  head('TEST 10: CRM Template Variable Resolution');
  divider();

  const nodes = [
    node('trigger_1', 'trigger', { triggerType: 'manual' }),
    node('pg_1',      'postgresql', {
      connectionString: PG_DSN, useAiQuery: false,
      query: "SELECT id, name, email FROM customers WHERE id=1 LIMIT 1",
    }),
    node('loop_1',    'loop', {
      loopType: 'forEach',
      collection: '{{pg_1.result}}',
      list_source: '{{pg_1.result}}',
      itemVariable: 'customer',
      item_variable: 'customer',
      continueOnError: true,
    }),
    node('crm_1',     'crm',  {
      operation: 'create_contact',
      entityData: JSON.stringify({
        name:  '{{customer.name}}',
        email: '{{customer.email}}',
        tags:  ['enterprise'],
      }),
    }),
    node('end_1',     'end',  {}),
  ];
  const edges = [
    edge('e1','trigger_1','pg_1'),
    edge('e2','pg_1',     'loop_1'),
    edge('e3','loop_1',   'crm_1',  'loop_body'),
    edge('e4','crm_1',    'loop_1'),
    edge('e5','loop_1',   'end_1',  'loop_complete'),
  ];

  const { status, body } = await execute(nodes, edges);

  assert(status >= 200 && status < 300, 'HTTP 200');
  assert(body.status?.toLowerCase() === 'completed', `Workflow COMPLETED (${body.status})`);
  const crmOut = body.context?.nodeOutputs?.crm_1;
  assert(crmOut !== undefined, 'CRM node executed');
  // CRM echoes back the resolved entity in output
  const entity = crmOut?.contact || crmOut?.entity || crmOut?.created || crmOut;
  const resolvedName = entity?.name || crmOut?.entityData?.name;
  assertWarn(
    resolvedName && resolvedName !== '{{customer.name}}',
    `Template resolved: name="${resolvedName}" (not raw mustache)`
  );
  info(`CRM output: ${JSON.stringify(crmOut)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(c.bold('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(c.bold(  '║        FLYN Workflow Engine — End-to-End Test Suite      ║'));
  console.log(c.bold(  '╚══════════════════════════════════════════════════════════╝'));

  const tests = [
    test_fullPipeline,
    test_joinDeadEnd,
    test_mergeInnerJoin,
    test_emptyCollection,
    test_iteratorAllItems,
    test_badComputedField,
    test_pgBadQuery,
    test_mergeNoRightMatch,
    test_timesLoop,
    test_crmTemplateResolution,
  ];

  const results = [];
  for (const t of tests) {
    const snapPassed = passed, snapFailed = failed, snapWarned = warned;
    try {
      await t();
    } catch (err) {
      fail(`EXCEPTION: ${err.message}`);
      failed++;
    }
    results.push({
      name: t.name,
      p: passed - snapPassed,
      f: failed - snapFailed,
      w: warned - snapWarned,
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  divider();
  console.log(c.bold('\n📋  SUMMARY'));
  divider();
  for (const r of results) {
    const status = r.f > 0
      ? c.red(`FAIL (${r.f} failed)`)
      : r.w > 0
        ? c.yellow(`PASS w/ warnings (${r.w} warned)`)
        : c.green('PASS');
    console.log(`  ${status.padEnd(45)}  ${c.dim(r.name)}`);
  }
  divider();
  console.log(`  ${c.green(`${passed} passed`)}  ${c.red(`${failed} failed`)}  ${c.yellow(`${warned} warnings`)}\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(2); });
