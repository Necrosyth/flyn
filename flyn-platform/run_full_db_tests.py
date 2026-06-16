"""
Full Database Plugin Test Suite
================================
Tests MongoDB, PostgreSQL, MySQL — manual + AI queries + CRM alignment.

Run:  python3 run_full_db_tests.py
"""

import requests
import json
import time
import sys

BACKEND = "http://localhost:3000"

# ── Terminal colours ──
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
MAGENTA = "\033[95m"
RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"

passed = 0
failed = 0
results_log = []   # (section, name, status, detail)


def header(msg):
    print(f"\n{BOLD}{CYAN}{'═'*64}")
    print(f"  {msg}")
    print(f"{'═'*64}{RESET}\n")


def section(msg):
    print(f"\n  {BOLD}{MAGENTA}── {msg} ──{RESET}\n")


def test(name, workflow_json, expect_success=True, section_tag=""):
    global passed, failed
    print(f"  {YELLOW}▶ {name}{RESET}")
    try:
        resp = requests.post(
            f"{BACKEND}/api/orchestrator/execute",
            json=workflow_json,
            timeout=30,
        )
        data = resp.json()
        node_outputs = data.get("context", {}).get("nodeOutputs", {})

        # Find first non-trigger output
        db_output = None
        for nid, out in node_outputs.items():
            if nid.startswith("trigger"):
                continue
            db_output = out
            break

        if expect_success:
            success = db_output and db_output.get("success") is True
            if success:
                row_count = db_output.get("rowCount",
                            db_output.get("resultCount", "?"))
                op = db_output.get("operation", "?")
                query = (db_output.get("executedQuery") or
                         db_output.get("executedPipeline") or "")
                if isinstance(query, (list, dict)):
                    query = json.dumps(query, default=str)
                print(f"    {GREEN}✓ PASS{RESET} — {op} → {row_count} rows")
                if query:
                    print(f"      {DIM}Query: {str(query)[:130]}{RESET}")
                result = db_output.get("result", [])
                if isinstance(result, list) and len(result) > 0:
                    first = result[0]
                    print(f"      {DIM}Row 1: {json.dumps(first, default=str)[:150]}{RESET}")
                passed += 1
                results_log.append((section_tag, name, "PASS",
                                    f"{op} → {row_count} rows"))
            else:
                detail = json.dumps(db_output, default=str)[:200]
                print(f"    {RED}✗ FAIL{RESET} — {detail}")
                failed += 1
                results_log.append((section_tag, name, "FAIL", detail))
        else:
            print(f"    {GREEN}✓ Response received{RESET}")
            passed += 1
            results_log.append((section_tag, name, "PASS", "response ok"))

    except Exception as e:
        print(f"    {RED}✗ ERROR{RESET} — {e}")
        failed += 1
        results_log.append((section_tag, name, "ERROR", str(e)))


def make_workflow(node_type, node_config, node_id="db_0"):
    return {
        "workflow": {
            "id": f"test-{node_type}-{int(time.time()*1000)}",
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
                "createdAt": "2026-02-28T00:00:00Z",
                "updatedAt": "2026-02-28T00:00:00Z",
                "createdBy": "test-script",
            },
        },
        "triggerData": {},
    }


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  1. MONGODB TESTS                                                        ║
# ╚════════════════════════════════════════════════════════════════════════════╝

header("1. MongoDB Tests")
MONGO_CONN = "mongodb://localhost:27017/flyn_data"
TAG = "MongoDB"

section("Manual Queries")

test("Mongo: Find all contacts", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "contacts",
    "operation": "find",
    "query": {},
    "limit": 100,
}), section_tag=TAG)

test("Mongo: Contacts from India", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "contacts",
    "operation": "find",
    "query": {"country": "India"},
}), section_tag=TAG)

test("Mongo: Active contacts at FLYN AI", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "contacts",
    "operation": "find",
    "query": {"company": "FLYN AI", "status": "active"},
}), section_tag=TAG)

test("Mongo: Count all deals", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "deals",
    "operation": "count",
    "query": {},
}), section_tag=TAG)

test("Mongo: Aggregate — total deal value by stage", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "deals",
    "operation": "aggregate",
    "pipeline": [
        {"$group": {"_id": "$stage", "totalValue": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        {"$sort": {"totalValue": -1}},
    ],
}), section_tag=TAG)

section("AI-Generated Queries")

test("Mongo AI: 'contacts from India'", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "contacts",
    "operation": "find",
    "aiQueryPrompt": "all contacts from India",
    "limit": 50,
}), section_tag=TAG)

test("Mongo AI: 'deals worth more than 20000'", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "deals",
    "operation": "find",
    "aiQueryPrompt": "deals worth more than 20000 dollars",
    "limit": 50,
}), section_tag=TAG)

test("Mongo AI: 'total deal value assigned to Tushar'", make_workflow("mongodb", {
    "connectionString": MONGO_CONN,
    "database": "flyn_data",
    "collection": "deals",
    "operation": "aggregate",
    "aiQueryPrompt": "total deal value assigned to Tushar grouped by stage",
}), section_tag=TAG)


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  2. POSTGRESQL TESTS                                                     ║
# ╚════════════════════════════════════════════════════════════════════════════╝

header("2. PostgreSQL Tests")
PG_CONN = "postgresql://flyn:flyn_pg_password@localhost:5434/flyn_data"
TAG = "PostgreSQL"

section("Manual Queries")

test("PG: SELECT all users", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "query": "SELECT * FROM users",
    "limit": 100,
}), section_tag=TAG)

test("PG: Users from India", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "query": "SELECT name, email, company FROM users WHERE country = 'India'",
}), section_tag=TAG)

test("PG: Users older than 30 (parameterized)", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "query": "SELECT name, age, country FROM users WHERE age > $1 ORDER BY age",
    "params": "[30]",
}), section_tag=TAG)

test("PG: Orders JOIN users", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "query": "SELECT u.name, o.product, o.total, o.status FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = 'completed' ORDER BY o.total DESC",
}), section_tag=TAG)

test("PG: Revenue per user (aggregate)", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "query": "SELECT u.name, SUM(o.total) as total_spent, COUNT(*) as order_count FROM orders o JOIN users u ON o.user_id = u.id GROUP BY u.name ORDER BY total_spent DESC",
}), section_tag=TAG)

section("AI-Generated Queries")

test("PG AI: 'all users from India'", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "table": "users",
    "useAiQuery": True,
    "aiQueryPrompt": "all users from India",
    "limit": 50,
}), section_tag=TAG)

test("PG AI: 'orders above $100 not completed'", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "table": "orders",
    "useAiQuery": True,
    "aiQueryPrompt": "orders above 100 dollars that are not completed",
    "limit": 50,
}), section_tag=TAG)

test("PG AI: 'average age by country'", make_workflow("postgresql", {
    "connectionString": PG_CONN,
    "table": "users",
    "useAiQuery": True,
    "aiQueryPrompt": "average age of users grouped by country sorted descending",
}), section_tag=TAG)


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  3. MYSQL TESTS                                                          ║
# ╚════════════════════════════════════════════════════════════════════════════╝

header("3. MySQL Tests")
MY_CONN = "mysql://flyn:flyn_mysql_password@localhost:3307/flyn_data"
TAG = "MySQL"

section("Manual Queries")

test("MySQL: SELECT all customers", make_workflow("mysql", {
    "connectionString": MY_CONN,
    "query": "SELECT * FROM customers",
    "limit": 100,
}), section_tag=TAG)

test("MySQL: Premium customers", make_workflow("mysql", {
    "connectionString": MY_CONN,
    "query": "SELECT name, email, city FROM customers WHERE membership = 'premium'",
}), section_tag=TAG)

test("MySQL: Products under $100 (parameterized)", make_workflow("mysql", {
    "connectionString": MY_CONN,
    "query": "SELECT name, category, price FROM products WHERE price < ? ORDER BY price",
    "params": "[100]",
}), section_tag=TAG)

test("MySQL: Category stats (aggregate)", make_workflow("mysql", {
    "connectionString": MY_CONN,
    "query": "SELECT category, COUNT(*) AS cnt, AVG(price) AS avg_price FROM products GROUP BY category ORDER BY avg_price DESC",
}), section_tag=TAG)

section("AI-Generated Queries")

test("MySQL AI: 'all customers from India'", make_workflow("mysql", {
    "connectionString": MY_CONN,
    "table": "customers",
    "useAiQuery": True,
    "aiQueryPrompt": "all customers from India",
    "limit": 50,
}), section_tag=TAG)

test("MySQL AI: 'software products above $100'", make_workflow("mysql", {
    "connectionString": MY_CONN,
    "table": "products",
    "useAiQuery": True,
    "aiQueryPrompt": "software products priced above 100 dollars",
    "limit": 50,
}), section_tag=TAG)

test("MySQL AI: 'enterprise customers with phone'", make_workflow("mysql", {
    "connectionString": MY_CONN,
    "table": "customers",
    "useAiQuery": True,
    "aiQueryPrompt": "enterprise membership customers with their phone numbers",
}), section_tag=TAG)


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  4. DB → CRM ALIGNMENT TESTS                                            ║
# ╚════════════════════════════════════════════════════════════════════════════╝

header("4. Database → CRM Alignment")
TAG = "DB→CRM"


# ── 4a. MongoDB → CRM ──
section("MongoDB → CRM")

mongo_crm_workflow = {
    "workflow": {
        "id": f"mongo-crm-{int(time.time()*1000)}",
        "name": "MongoDB to CRM",
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
                "id": "mongodb_0",
                "type": "mongodb",
                "name": "Fetch contact from MongoDB",
                "config": {
                    "connectionString": MONGO_CONN,
                    "database": "flyn_data",
                    "collection": "contacts",
                    "operation": "find",
                    "query": {"email": "arjun@techcorp.in"},
                    "limit": 1,
                },
            },
            {
                "id": "crm_0",
                "type": "crm",
                "name": "Create CRM Contact from Mongo",
                "config": {
                    "operation": "create_contact",
                    "entityData": json.dumps({
                        "name": "{{mongodb_0.result[0].name}}",
                        "email": "{{mongodb_0.result[0].email}}",
                        "company": "{{mongodb_0.result[0].company}}",
                        "source": "MongoDB Import",
                        "status": "lead",
                    }),
                },
            },
        ],
        "compiled_edges": [
            {"id": "e1", "source": "trigger_0", "target": "mongodb_0"},
            {"id": "e2", "source": "mongodb_0", "target": "crm_0"},
        ],
        "execution_plan": {
            "startNodeId": "trigger_0",
            "endNodeIds": ["crm_0"],
            "nodeOrder": ["trigger_0", "mongodb_0", "crm_0"],
            "parallelPaths": [],
        },
        "metadata": {
            "createdAt": "2026-02-28T00:00:00Z",
            "updatedAt": "2026-02-28T00:00:00Z",
            "createdBy": "test-script",
        },
    },
    "triggerData": {},
}

print(f"  {YELLOW}▶ MongoDB → CRM: Fetch contact & push to CRM{RESET}")
try:
    resp = requests.post(f"{BACKEND}/api/orchestrator/execute", json=mongo_crm_workflow, timeout=30)
    data = resp.json()
    nout = data.get("context", {}).get("nodeOutputs", {})
    mongo_out = nout.get("mongodb_0", {})
    crm_out = nout.get("crm_0", {})

    if mongo_out.get("success"):
        rc = mongo_out.get("resultCount", mongo_out.get("rowCount", "?"))
        crm_msg = crm_out.get("message", crm_out.get("operation", "?"))
        print(f"    {GREEN}✓ PASS{RESET} — Mongo fetched {rc} docs → CRM: {crm_msg}")
        passed += 1
        results_log.append((TAG, "MongoDB → CRM: contact", "PASS",
                            f"Mongo {rc} docs → CRM {crm_msg}"))
    else:
        detail = json.dumps(mongo_out, default=str)[:150]
        print(f"    {RED}✗ FAIL{RESET} — Mongo: {detail}")
        failed += 1
        results_log.append((TAG, "MongoDB → CRM: contact", "FAIL", detail))
except Exception as e:
    print(f"    {RED}✗ ERROR{RESET} — {e}")
    failed += 1
    results_log.append((TAG, "MongoDB → CRM: contact", "ERROR", str(e)))


# ── 4b. PostgreSQL → CRM ──
section("PostgreSQL → CRM")

pg_crm_workflow = {
    "workflow": {
        "id": f"pg-crm-{int(time.time()*1000)}",
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
                "name": "Create CRM Contact from PG",
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
            "createdAt": "2026-02-28T00:00:00Z",
            "updatedAt": "2026-02-28T00:00:00Z",
            "createdBy": "test-script",
        },
    },
    "triggerData": {},
}

print(f"  {YELLOW}▶ PostgreSQL → CRM: Fetch user & push to CRM{RESET}")
try:
    resp = requests.post(f"{BACKEND}/api/orchestrator/execute", json=pg_crm_workflow, timeout=30)
    data = resp.json()
    nout = data.get("context", {}).get("nodeOutputs", {})
    pg_out = nout.get("postgresql_0", {})
    crm_out = nout.get("crm_0", {})

    if pg_out.get("success"):
        rc = pg_out.get("rowCount", "?")
        crm_msg = crm_out.get("message", crm_out.get("operation", "?"))
        print(f"    {GREEN}✓ PASS{RESET} — PG fetched {rc} rows → CRM: {crm_msg}")
        passed += 1
        results_log.append((TAG, "PostgreSQL → CRM: contact", "PASS",
                            f"PG {rc} rows → CRM {crm_msg}"))
    else:
        detail = json.dumps(pg_out, default=str)[:150]
        print(f"    {RED}✗ FAIL{RESET} — PG: {detail}")
        failed += 1
        results_log.append((TAG, "PostgreSQL → CRM: contact", "FAIL", detail))
except Exception as e:
    print(f"    {RED}✗ ERROR{RESET} — {e}")
    failed += 1
    results_log.append((TAG, "PostgreSQL → CRM: contact", "ERROR", str(e)))


# ── 4c. MySQL → CRM ──
section("MySQL → CRM")

my_crm_workflow = {
    "workflow": {
        "id": f"my-crm-{int(time.time()*1000)}",
        "name": "MySQL to CRM",
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
                "id": "mysql_0",
                "type": "mysql",
                "name": "Fetch customer from MySQL",
                "config": {
                    "connectionString": MY_CONN,
                    "query": "SELECT name, email, city, country FROM customers WHERE email = 'tushar@flyn.ai' LIMIT 1",
                },
            },
            {
                "id": "crm_0",
                "type": "crm",
                "name": "Create CRM Contact from MySQL",
                "config": {
                    "operation": "create_contact",
                    "entityData": json.dumps({
                        "name": "{{mysql_0.result[0].name}}",
                        "email": "{{mysql_0.result[0].email}}",
                        "city": "{{mysql_0.result[0].city}}",
                        "source": "MySQL Import",
                        "status": "lead",
                    }),
                },
            },
        ],
        "compiled_edges": [
            {"id": "e1", "source": "trigger_0", "target": "mysql_0"},
            {"id": "e2", "source": "mysql_0", "target": "crm_0"},
        ],
        "execution_plan": {
            "startNodeId": "trigger_0",
            "endNodeIds": ["crm_0"],
            "nodeOrder": ["trigger_0", "mysql_0", "crm_0"],
            "parallelPaths": [],
        },
        "metadata": {
            "createdAt": "2026-02-28T00:00:00Z",
            "updatedAt": "2026-02-28T00:00:00Z",
            "createdBy": "test-script",
        },
    },
    "triggerData": {},
}

print(f"  {YELLOW}▶ MySQL → CRM: Fetch customer & push to CRM{RESET}")
try:
    resp = requests.post(f"{BACKEND}/api/orchestrator/execute", json=my_crm_workflow, timeout=30)
    data = resp.json()
    nout = data.get("context", {}).get("nodeOutputs", {})
    my_out = nout.get("mysql_0", {})
    crm_out = nout.get("crm_0", {})

    if my_out.get("success"):
        rc = my_out.get("rowCount", "?")
        crm_msg = crm_out.get("message", crm_out.get("operation", "?"))
        print(f"    {GREEN}✓ PASS{RESET} — MySQL fetched {rc} rows → CRM: {crm_msg}")
        passed += 1
        results_log.append((TAG, "MySQL → CRM: contact", "PASS",
                            f"MySQL {rc} rows → CRM {crm_msg}"))
    else:
        detail = json.dumps(my_out, default=str)[:150]
        print(f"    {RED}✗ FAIL{RESET} — MySQL: {detail}")
        failed += 1
        results_log.append((TAG, "MySQL → CRM: contact", "FAIL", detail))
except Exception as e:
    print(f"    {RED}✗ ERROR{RESET} — {e}")
    failed += 1
    results_log.append((TAG, "MySQL → CRM: contact", "ERROR", str(e)))


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  FINAL REPORT                                                           ║
# ╚════════════════════════════════════════════════════════════════════════════╝

print(f"\n\n{BOLD}{'═'*64}")
print(f"  FULL TEST REPORT")
print(f"{'═'*64}{RESET}\n")

# Group by section
from collections import OrderedDict
sections = OrderedDict()
for (sec, name, status, detail) in results_log:
    sections.setdefault(sec, []).append((name, status, detail))

for sec, items in sections.items():
    sec_pass = sum(1 for _, s, _ in items if s == "PASS")
    sec_total = len(items)
    color = GREEN if sec_pass == sec_total else RED
    print(f"  {BOLD}{sec}{RESET}  {color}{sec_pass}/{sec_total}{RESET}")
    for (name, status, detail) in items:
        icon = f"{GREEN}✓{RESET}" if status == "PASS" else f"{RED}✗{RESET}"
        print(f"    {icon} {name}")
    print()

total = passed + failed
print(f"  {BOLD}Total: {GREEN}{passed} passed{RESET}{BOLD}, "
      f"{RED if failed > 0 else GREEN}{failed} failed{RESET}{BOLD} "
      f"out of {total} tests{RESET}")
print(f"{'═'*64}\n")

sys.exit(1 if failed > 0 else 0)
