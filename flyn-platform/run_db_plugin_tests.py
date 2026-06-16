"""
Test script for PostgreSQL and MySQL workflow database plugins.

Tests:
  1. Manual SQL queries against both databases
  2. AI-generated queries via NLP prompt
  3. Workflow execution: DB → CRM data flow

Run:  python3 run_db_plugin_tests.py
"""

import requests
import json
import time
import sys

BACKEND = "http://localhost:3000"

# ==============================
# Colours for terminal output
# ==============================
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

passed = 0
failed = 0


def header(msg):
    print(f"\n{BOLD}{CYAN}{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}{RESET}\n")


def test(name, workflow_json, expect_success=True):
    global passed, failed
    print(f"  {YELLOW}▶ {name}{RESET}")
    try:
        resp = requests.post(
            f"{BACKEND}/api/orchestrator/execute",
            json=workflow_json,
            timeout=30,
        )
        data = resp.json()

        # Find the relevant database node output
        node_outputs = data.get("context", {}).get("nodeOutputs", {})
        
        # Get first non-trigger output
        db_output = None
        for nid, out in node_outputs.items():
            if nid.startswith("trigger"):
                continue
            db_output = out
            break

        if expect_success:
            success = db_output and db_output.get("success") is True
            if success:
                row_count = db_output.get("rowCount", db_output.get("resultCount", "?"))
                op = db_output.get("operation", "?")
                query = db_output.get("executedQuery", db_output.get("executedQuery", ""))
                print(f"    {GREEN}✓ PASS{RESET} — {op} returned {row_count} rows")
                if query:
                    print(f"      Query: {query[:120]}")
                # Print first result row if available
                result = db_output.get("result", [])
                if isinstance(result, list) and len(result) > 0:
                    first = result[0]
                    print(f"      First row: {json.dumps(first, default=str)[:150]}")
                passed += 1
            else:
                print(f"    {RED}✗ FAIL{RESET} — output: {json.dumps(db_output, default=str)[:200]}")
                failed += 1
        else:
            print(f"    {GREEN}✓ Response received{RESET}")
            passed += 1

    except Exception as e:
        print(f"    {RED}✗ ERROR{RESET} — {e}")
        failed += 1


def make_workflow(node_type, node_config, node_id="db_0"):
    """Build a minimal 2-node workflow: trigger → db_node"""
    return {
        "workflow": {
            "id": f"test-{node_type}-{int(time.time())}",
            "name": f"Test {node_type}",
            "version": 1,
            "tenantId": "test-tenant",
            "compiled_nodes": [
                {
                    "id": "trigger_0",
                    "type": "trigger",
                    "name": "Manual Trigger",
                    "config": {"trigger_type": "manual"},
                },
                {
                    "id": node_id,
                    "type": node_type,
                    "name": f"{node_type} query",
                    "config": node_config,
                },
            ],
            "compiled_edges": [
                {"id": "e1", "source": "trigger_0", "target": node_id},
            ],
            "execution_plan": {
                "startNodeId": "trigger_0",
                "endNodeIds": [node_id],
                "nodeOrder": ["trigger_0", node_id],
                "parallelPaths": [],
            },
            "metadata": {
                "createdAt": "2026-02-27T00:00:00Z",
                "updatedAt": "2026-02-27T00:00:00Z",
                "createdBy": "test-script",
            },
        },
        "triggerData": {},
    }


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  POSTGRESQL TESTS                                                        ║
# ╚════════════════════════════════════════════════════════════════════════════╝

header("PostgreSQL — Manual Query Tests")

PG_CONN = "postgresql://flyn:flyn_pg_password@localhost:5434/flyn_data"

# Test 1: Simple SELECT all users
test(
    "PG: SELECT all users",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "query": "SELECT * FROM users",
        "limit": 100,
    }),
)

# Test 2: SELECT with WHERE clause
test(
    "PG: Users from India",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "query": "SELECT name, email, company FROM users WHERE country = 'India'",
    }),
)

# Test 3: SELECT with parameterized query
test(
    "PG: Users older than 30 (parameterized)",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "query": "SELECT name, age, country FROM users WHERE age > $1 ORDER BY age",
        "params": "[30]",
    }),
)

# Test 4: JOIN query — orders with user names
test(
    "PG: Orders with user names (JOIN)",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "query": "SELECT u.name, o.product, o.total, o.status FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = 'completed' ORDER BY o.total DESC",
    }),
)

# Test 5: Aggregate — total revenue
test(
    "PG: Total revenue per user",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "query": "SELECT u.name, SUM(o.total) as total_spent, COUNT(*) as order_count FROM orders o JOIN users u ON o.user_id = u.id GROUP BY u.name ORDER BY total_spent DESC",
    }),
)


header("PostgreSQL — AI-Generated Query Tests")

# Test 6: AI query — NLP
test(
    "PG AI: 'all users from India'",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "table": "users",
        "useAiQuery": True,
        "aiQueryPrompt": "all users from India",
        "limit": 50,
    }),
)

# Test 7: AI query — more complex NLP
test(
    "PG AI: 'orders above $100 that are not completed'",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "table": "orders",
        "useAiQuery": True,
        "aiQueryPrompt": "orders above 100 dollars that are not completed",
        "limit": 50,
    }),
)

# Test 8: AI query — aggregation NLP
test(
    "PG AI: 'average age of users grouped by country'",
    make_workflow("postgresql", {
        "connectionString": PG_CONN,
        "table": "users",
        "useAiQuery": True,
        "aiQueryPrompt": "average age of users grouped by country, sorted descending",
    }),
)


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  MYSQL TESTS                                                             ║
# ╚════════════════════════════════════════════════════════════════════════════╝

header("MySQL — Manual Query Tests")

MY_CONN = "mysql://flyn:flyn_mysql_password@localhost:3307/flyn_data"

# Test 9: Simple SELECT all customers
test(
    "MySQL: SELECT all customers",
    make_workflow("mysql", {
        "connectionString": MY_CONN,
        "query": "SELECT * FROM customers",
        "limit": 100,
    }),
)

# Test 10: WHERE clause
test(
    "MySQL: Premium customers",
    make_workflow("mysql", {
        "connectionString": MY_CONN,
        "query": "SELECT name, email, city FROM customers WHERE membership = 'premium'",
    }),
)

# Test 11: Parameterized query
test(
    "MySQL: Products cheaper than $100 (parameterized)",
    make_workflow("mysql", {
        "connectionString": MY_CONN,
        "query": "SELECT name, category, price FROM products WHERE price < ? ORDER BY price",
        "params": "[100]",
    }),
)

# Test 12: Cross-table insight
test(
    "MySQL: Products by category with avg price",
    make_workflow("mysql", {
        "connectionString": MY_CONN,
        "query": "SELECT category, COUNT(*) AS product_count, AVG(price) AS avg_price FROM products GROUP BY category ORDER BY avg_price DESC",
    }),
)


header("MySQL — AI-Generated Query Tests")

# Test 13: AI query — NLP
test(
    "MySQL AI: 'all customers from India'",
    make_workflow("mysql", {
        "connectionString": MY_CONN,
        "table": "customers",
        "useAiQuery": True,
        "aiQueryPrompt": "all customers from India",
        "limit": 50,
    }),
)

# Test 14: AI query — more complex NLP
test(
    "MySQL AI: 'software products priced above 100 dollars'",
    make_workflow("mysql", {
        "connectionString": MY_CONN,
        "table": "products",
        "useAiQuery": True,
        "aiQueryPrompt": "software products priced above 100 dollars",
        "limit": 50,
    }),
)

# Test 15: AI query — NLP with join
test(
    "MySQL AI: 'enterprise membership customers with phone numbers'",
    make_workflow("mysql", {
        "connectionString": MY_CONN,
        "table": "customers",
        "useAiQuery": True,
        "aiQueryPrompt": "enterprise membership customers with their phone numbers",
    }),
)


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  WORKFLOW: DB → CRM data flow                                           ║
# ╚════════════════════════════════════════════════════════════════════════════╝

header("Workflow: PostgreSQL → CRM (create contact from DB data)")

pg_to_crm_workflow = {
    "workflow": {
        "id": f"pg-to-crm-{int(time.time())}",
        "name": "PostgreSQL to CRM",
        "version": 1,
        "tenantId": "test-tenant",
        "compiled_nodes": [
            {
                "id": "trigger_0",
                "type": "trigger",
                "name": "Manual Trigger",
                "config": {"trigger_type": "manual"},
            },
            {
                "id": "postgresql_0",
                "type": "postgresql",
                "name": "Fetch user from PostgreSQL",
                "config": {
                    "connectionString": PG_CONN,
                    "query": "SELECT name, email, company, country FROM users WHERE email = 'tushar@flyn.ai' LIMIT 1",
                },
            },
            {
                "id": "crm_0",
                "type": "crm",
                "name": "Create CRM Contact",
                "config": {
                    "operation": "create_contact",
                    "entityData": json.dumps({
                        "name": "{{postgresql_0.result[0].name}}",
                        "email": "{{postgresql_0.result[0].email}}",
                        "company": "{{postgresql_0.result[0].company}}",
                        "source": "PostgreSQL Import",
                        "status": "lead",
                    }),
                },
            },
        ],
        "compiled_edges": [
            {"id": "e1", "source": "trigger_0", "target": "postgresql_0"},
            {"id": "e2", "source": "postgresql_0", "target": "crm_0"},
        ],
        "execution_plan": {
            "startNodeId": "trigger_0",
            "endNodeIds": ["crm_0"],
            "nodeOrder": ["trigger_0", "postgresql_0", "crm_0"],
            "parallelPaths": [],
        },
        "metadata": {
            "createdAt": "2026-02-27T00:00:00Z",
            "updatedAt": "2026-02-27T00:00:00Z",
            "createdBy": "test-script",
        },
    },
    "triggerData": {},
}

print(f"  {YELLOW}▶ PG → CRM: Fetch user & create contact{RESET}")
try:
    resp = requests.post(
        f"{BACKEND}/api/orchestrator/execute",
        json=pg_to_crm_workflow,
        timeout=30,
    )
    data = resp.json()
    node_outputs = data.get("context", {}).get("nodeOutputs", {})

    pg_out = node_outputs.get("postgresql_0", {})
    crm_out = node_outputs.get("crm_0", {})

    if pg_out.get("success") and crm_out.get("operation") == "create_contact":
        print(f"    {GREEN}✓ PASS{RESET} — PG fetched: {pg_out.get('rowCount')} rows → CRM contact created: {crm_out.get('message', '')}")
        passed += 1
    else:
        print(f"    {RED}✗ FAIL{RESET} — PG: {json.dumps(pg_out, default=str)[:100]} | CRM: {json.dumps(crm_out, default=str)[:100]}")
        failed += 1
except Exception as e:
    print(f"    {RED}✗ ERROR{RESET} — {e}")
    failed += 1


# ══════════════════════════════════════════════════════════════════════════════
# RESULTS
# ══════════════════════════════════════════════════════════════════════════════

print(f"\n{BOLD}{'='*60}")
print(f"  RESULTS: {GREEN}{passed} passed{RESET}{BOLD}, {RED}{failed} failed{RESET}{BOLD}")
print(f"{'='*60}{RESET}\n")

sys.exit(1 if failed > 0 else 0)
