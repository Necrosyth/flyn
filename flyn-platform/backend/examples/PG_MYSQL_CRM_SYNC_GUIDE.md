# Enterprise Customer Sync — PostgreSQL + MySQL → NocoBase CRM

**Flow file:** `examples/pg-mysql-to-nocobase-crm-sync.json`

---

## What This Flow Does

```
Manual Trigger
      │
      ▼
  ┌── Split (Parallel) ──┐
  │                      │
  ▼                      ▼
PostgreSQL Node      MySQL Node
AI Query:            AI Query:
"Get active          "Get total orders +
 enterprise           revenue per
 customers"           customer_id"
  │                      │
  └──── Join (wait) ─────┘
             │
             ▼
    Transform: left-join both
    datasets + compute lead_score
             │
             ▼
        Loop over each customer
             │
             ▼
    CRM Node: create_contact
    → name, email, company,
      score, tags, notes
             │
             ▼
        ✅ Sync Complete
```

The flow:
1. **Fires in parallel** — both database queries run at the same time
2. **PostgreSQL AI query** — the AI generates a SQL `SELECT` for `active` + `enterprise` customers
3. **MySQL AI query** — the AI generates a `GROUP BY` aggregate query for order counts + revenue
4. **Merges** both datasets (left-join on `customer.id = order.customer_id`)
5. **Computes a `lead_score`** — `min(100, round(total_revenue / 1000))`
6. **Loops** over every merged customer and creates a contact in **NocoBase CRM** with full enrichment

---

## Flow Architecture

```mermaid
flowchart LR
    T([Manual Trigger]) --> SP{{Split — Parallel}}
    SP -->|pg_path| PG["PostgreSQL Node\nAI: Get enterprise customers\ntable: customers"]
    SP -->|mysql_path| MY["MySQL Node\nAI: Get order revenue\ntable: orders"]
    PG --> J{{Join — Wait for both}}
    MY --> J
    J --> TR["Transform Action\nMerge + compute lead_score"]
    TR --> L{{"Loop — for each customer"}}
    L -->|loop_body| CRM["CRM Node\ncreate_contact"]
    CRM -->|next_iteration| L
    L -->|loop_complete| END([Sync Complete])
```

---

## Required Database Schema

### PostgreSQL — `customers` table

```sql
-- Run in your PostgreSQL instance
CREATE TABLE customers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    phone       VARCHAR(50),
    company     VARCHAR(255),
    account_status VARCHAR(50) DEFAULT 'active',  -- 'active' | 'inactive' | 'suspended'
    plan        VARCHAR(50)  DEFAULT 'basic',      -- 'basic' | 'pro' | 'enterprise'
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Seed demo data
INSERT INTO customers (name, email, phone, company, account_status, plan) VALUES
  ('Alice Martin',   'alice@acmecorp.com',    '+1-555-0101', 'Acme Corp',      'active', 'enterprise'),
  ('Bob Zhang',      'bob@techgiant.io',      '+1-555-0102', 'Tech Giant',     'active', 'enterprise'),
  ('Clara Nwosu',    'clara@globalinc.com',   '+1-555-0103', 'Global Inc',     'active', 'enterprise'),
  ('Dan Reyes',      'dan@fastmove.co',       '+1-555-0104', 'FastMove Co',    'active', 'pro'),
  ('Eva Schmidt',    'eva@nanotech.de',       '+1-555-0105', 'NanoTech GmbH',  'inactive','enterprise');
```

### MySQL — `orders` table

```sql
-- Run in your MySQL instance
CREATE TABLE orders (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    customer_id  INT NOT NULL,
    amount       DECIMAL(10,2) NOT NULL,
    status       VARCHAR(50) DEFAULT 'completed',
    created_at   DATETIME DEFAULT NOW()
);

-- Seed demo data
INSERT INTO orders (customer_id, amount, status) VALUES
  (1, 12500.00, 'completed'),
  (1,  8750.00, 'completed'),
  (2, 45000.00, 'completed'),
  (2, 22000.00, 'completed'),
  (2,  9800.00, 'completed'),
  (3, 67000.00, 'completed'),
  (4,   350.00, 'completed'),
  (4,   420.00, 'completed');
```

---

## Environment / Secrets Setup

Add these to `flyn-platform/backend/.env`:

```env
# PostgreSQL connection
POSTGRESQL_URI=postgresql://user:password@localhost:5432/your_db

# MySQL connection
MYSQL_URI=mysql://user:password@localhost:3306/your_db

# AI provider (needed for generating queries)
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...
# OR
GEMINI_API_KEY=...
```

The PostgreSQL and MySQL nodes look up `secrets.POSTGRESQL_URI` / `secrets.MYSQL_URI` automatically, which maps to the `.env` values above.

---

## What the AI Generates

When the flow runs, the AI produces actual SQL for each node:

**PostgreSQL node prompt:**
> "From the customers table, fetch all rows where account_status is 'active' and plan is 'enterprise'. Return: id, name, email, phone, company, account_status, plan, created_at."

**AI-generated SQL (example):**
```sql
SELECT id, name, email, phone, company, account_status, plan, created_at
FROM customers
WHERE account_status = 'active'
  AND plan = 'enterprise'
LIMIT 500;
```

**MySQL node prompt:**
> "From the orders table, compute total_orders (COUNT) and total_revenue (SUM of amount) for each customer_id. Include last_order_date (MAX of created_at). Exclude customer_ids with zero orders."

**AI-generated SQL (example):**
```sql
SELECT
    customer_id,
    COUNT(*)           AS total_orders,
    SUM(amount)        AS total_revenue,
    MAX(created_at)    AS last_order_date
FROM orders
GROUP BY customer_id
HAVING COUNT(*) > 0
LIMIT 500;
```

---

## Transform / Merge Logic

The transform node merges both datasets:

```
PostgreSQL result (customers):       MySQL result (orders):
┌────┬───────────────┬──────────────┐ ┌─────────────┬──────────────┬───────────────┐
│ id │ name          │ company      │ │ customer_id │ total_orders │ total_revenue │
├────┼───────────────┼──────────────┤ ├─────────────┼──────────────┼───────────────┤
│  1 │ Alice Martin  │ Acme Corp    │ │           1 │ 2            │ 21250.00      │
│  2 │ Bob Zhang     │ Tech Giant   │ │           2 │ 3            │ 76800.00      │
│  3 │ Clara Nwosu   │ Global Inc   │ │           3 │ 1            │ 67000.00      │
└────┴───────────────┴──────────────┘ └─────────────┴──────────────┴───────────────┘

Merged output:
┌────┬───────────────┬────────────┬──────────────┬───────────────┬────────────┐
│ id │ name          │ company    │ total_orders │ total_revenue │ lead_score │
├────┼───────────────┼────────────┼──────────────┼───────────────┼────────────┤
│  1 │ Alice Martin  │ Acme Corp  │ 2            │ 21250.00      │ 21         │
│  2 │ Bob Zhang     │ Tech Giant │ 3            │ 76800.00      │ 76         │
│  3 │ Clara Nwosu   │ Global Inc │ 1            │ 67000.00      │ 67         │
└────┴───────────────┴────────────┴──────────────┴───────────────┴────────────┘
```

Lead score formula: `min(100, round(total_revenue / 1000))`

---

## What Appears in NocoBase CRM

After the flow runs, the CRM Contacts view will show:

| Name | Email | Company | Score | Tags | Status | Notes |
|------|-------|---------|-------|------|--------|-------|
| Alice Martin | alice@acmecorp.com | Acme Corp | 21 | enterprise, active | customer | Orders: 2 \| Revenue: $21250 \| Last order: ... |
| Bob Zhang | bob@techgiant.io | Tech Giant | 76 | enterprise, active | customer | Orders: 3 \| Revenue: $76800 \| Last order: ... |
| Clara Nwosu | clara@globalinc.com | Global Inc | 67 | enterprise, active | customer | Orders: 1 \| Revenue: $67000 \| Last order: ... |

You can then view/filter contacts at: `http://localhost:8080/crm/contacts`

---

## How to Run This Flow

### Option A — via the FLYN backend API

```bash
# 1. Start the backend (if not already running)
cd flyn-platform/backend && npm run start:dev

# 2. Post the workflow definition to the orchestrator
curl -X POST http://localhost:3000/workflows \
  -H "Content-Type: application/json" \
  -d @examples/pg-mysql-to-nocobase-crm-sync.json

# 3. Execute it (replace <id> with the returned workflow id)
curl -X POST http://localhost:3000/workflows/<id>/execute \
  -H "Content-Type: application/json" \
  -d '{"input": {}}'
```

### Option B — via the Visual Flow Builder (Frontend)

1. Open the frontend: `http://localhost:5173`
2. Click **New Flow**
3. Add nodes in this order:
   - **Trigger** (manual)
   - **Split** node
   - **PostgreSQL** node — enable **AI Query**, set prompt + table
   - **MySQL** node — enable **AI Query**, set prompt + table
   - **Join** node
   - **Action** node (type: `transform`)
   - **Loop** node
   - **CRM** node (operation: `create_contact`)
   - **End** node
4. Connect edges as shown in the diagram
5. Click **Run**

---

## Node-by-Node Config Reference

| Node | Type | Key Config |
|------|------|------------|
| trigger_1 | trigger | `trigger_type: "manual"` |
| split_1 | split | `paths: ["pg_path", "mysql_path"]` |
| pg_ai_1 | postgresql | `useAiQuery: true`, `aiQueryPrompt: "..."`, `table: "customers"`, `connectionString: "${secrets.POSTGRESQL_URI}"` |
| mysql_ai_1 | mysql | `useAiQuery: true`, `aiQueryPrompt: "..."`, `table: "orders"`, `connectionString: "${secrets.MYSQL_URI}"` |
| join_1 | join | `waitFor: ["pg_ai_1", "mysql_ai_1"]`, `strategy: "all"` |
| transform_1 | action | `actionType: "transform"`, merge script (see JSON) |
| loop_1 | loop | `collection: "{{transform_1.result.result}}"`, `itemVariable: "customer"` |
| crm_create_1 | crm | `operation: "create_contact"`, `entityData: "{...}"` with `{{customer.*}}` templates |
| end_1 | end | `message: "Enterprise customers synced"` |

---

## Data Flow Summary

```
PostgreSQL DB                    MySQL DB
(customers table)                (orders table)
       │                               │
       │   AI generates SQL            │   AI generates SQL
       │   SELECT WHERE active         │   SELECT GROUP BY
       │   AND plan=enterprise         │   customer_id
       ▼                               ▼
  [Alice, Bob, Clara, ...]    [cust_id→orders/revenue]
       │                               │
       └──────────── Merge ────────────┘
                        │
              [enriched customer list
               with lead_score]
                        │
              ┌─── Loop over each ───┐
              │                      │
              ▼                      │
  NocoBase CRM: create_contact ──────┘
              │
              ▼
  CRM shows updated contacts
  with score + order history
```
