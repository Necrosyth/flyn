/**
 * Example: Enterprise Customer Sync — PostgreSQL + MySQL → NocoBase CRM
 *
 * Paste the JSON below into the visual builder via the "Import" button.
 * Node IDs are fixed so the Merge node references work correctly.
 */
export const PG_MYSQL_CRM_SYNC_EXAMPLE = {
  nodes: [
    {
      id: 'trigger_1',
      type: 'trigger',
      name: 'Manual Trigger',
      config: { trigger_type: 'manual', description: 'Kick off the enterprise customer sync' },
      position: { x: 80, y: 300 },
    },
    {
      id: 'split_1',
      type: 'split',
      name: 'Fetch Both DBs in Parallel',
      config: { paths: ['pg_path', 'mysql_path'] },
      position: { x: 300, y: 300 },
    },
    {
      id: 'pg_ai_1',
      type: 'postgresql',
      name: 'PostgreSQL — Get Enterprise Customers',
      config: {
        connectionString: 'postgresql://flyn:flyn_pg_password@localhost:5434/flyn_data',
        useAiQuery: false,
        query: "SELECT id, name, email, phone, company, account_status, plan, created_at FROM customers WHERE account_status = 'active' AND plan = 'enterprise' LIMIT 500;",
        table: 'customers',
      },
      position: { x: 540, y: 140 },
    },
    {
      id: 'mysql_ai_1',
      type: 'mysql',
      name: 'MySQL — Get Order Revenue',
      config: {
        connectionString: 'mysql://flyn:flyn_mysql_password@localhost:3307/flyn_data',
        useAiQuery: false,
        query: 'SELECT customer_id, COUNT(*) AS total_orders, SUM(amount) AS total_revenue, MAX(created_at) AS last_order_date FROM orders GROUP BY customer_id HAVING COUNT(*) > 0 LIMIT 500;',
        table: 'orders',
      },
      position: { x: 540, y: 460 },
    },
    {
      id: 'join_1',
      type: 'join',
      name: 'Wait for Both Results',
      config: { waitFor: ['pg_ai_1', 'mysql_ai_1'], strategy: 'all' },
      position: { x: 800, y: 300 },
    },
    {
      id: 'merge_1',
      type: 'merge',
      name: 'Merge Customers + Orders',
      config: {
        leftSourceId: 'pg_ai_1',
        leftPath: 'result',
        leftKey: 'id',
        rightSourceId: 'mysql_ai_1',
        rightPath: 'result',
        rightKey: 'customer_id',
        joinType: 'left',
        computedFields: 'lead_score = Math.min(100, Math.round(parseFloat(right.total_revenue || 0) / 1000))\ntotal_orders = right.total_orders || 0\ntotal_revenue = right.total_revenue || 0\nlast_order_date = right.last_order_date || null',
      },
      position: { x: 1060, y: 300 },
    },
    {
      id: 'loop_1',
      type: 'iterator',
      name: 'For Each Customer',
      config: {
        loop_type: 'forEach',
        list_source: '{{merge_1.result}}',
        item_variable: 'customer',
        index_variable: 'index',
        continue_on_error: true,
      },
      position: { x: 1300, y: 300 },
    },
    {
      id: 'crm_create_1',
      type: 'crm',
      name: 'CRM — Create Contact',
      config: {
        operation: 'create_contact',
        entityData: '{"name":"{{customer.name}}","email":"{{customer.email}}","phone":"{{customer.phone}}","company":"{{customer.company}}","status":"customer","source":"enterprise-sync","score":"{{customer.lead_score}}","tags":["enterprise","active"],"notes":"Orders: {{customer.total_orders}} | Revenue: ${{customer.total_revenue}} | Last order: {{customer.last_order_date}}"}',
      },
      position: { x: 1540, y: 300 },
    },
    {
      id: 'end_1',
      type: 'end',
      name: 'Sync Complete',
      config: { message: 'Enterprise customers synced to NocoBase CRM' },
      position: { x: 1780, y: 300 },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger_1', target: 'split_1' },
    { id: 'e2', source: 'split_1', target: 'pg_ai_1', sourceHandle: 'pg_path' },
    { id: 'e3', source: 'split_1', target: 'mysql_ai_1', sourceHandle: 'mysql_path' },
    { id: 'e4', source: 'pg_ai_1', target: 'join_1' },
    { id: 'e5', source: 'mysql_ai_1', target: 'join_1' },
    { id: 'e6', source: 'join_1', target: 'merge_1' },
    { id: 'e7', source: 'merge_1', target: 'loop_1' },
    { id: 'e8', source: 'loop_1', target: 'crm_create_1', sourceHandle: 'loop_body' },
    { id: 'e9', source: 'crm_create_1', target: 'loop_1', sourceHandle: 'next_iteration' },
    { id: 'e10', source: 'loop_1', target: 'end_1', sourceHandle: 'loop_complete' },
  ],
} as const;
