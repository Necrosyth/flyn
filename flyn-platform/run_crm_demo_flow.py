#!/usr/bin/env python3
"""
CRM Demo Flow Runner
-------------------
Fires a 3-node CRM workflow via the orchestrator API:
  Trigger → Create Contact → Create Deal → Log Activity

Then fetches the execution result and verifies the data appeared in NocoBase.
"""

import urllib.request
import json
import time
import sys

BACKEND = "http://localhost:3000"
NOCOBASE = "http://localhost:13000"


def request(url, body=None, method=None):
    m = method or ("POST" if body else "GET")
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"},
        method=m,
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())


# ─── Build the workflow payload ──────────────────────────────────────────────

WORKFLOW = {
    "id": "crm-demo-flow-001",
    "name": "CRM Demo — Create Lead + Deal + Activity",
    "version": "1.0.0",
    "tenantId": "default-tenant",
    "compiled_nodes": [
        {
            "id": "trigger-1",
            "type": "trigger",
            "name": "Manual Trigger",
            "config": {"triggerType": "manual"},
            "position": {"x": 100, "y": 100},
        },
        {
            "id": "crm-contact-1",
            "type": "crm",
            "name": "Create Contact",
            "config": {
                "operation": "create_contact",
                # trigger.data.* = triggerData fields (trigger node spreads them under data)
                "entityData": json.dumps({
                    "name":    "{{trigger.data.name}}",
                    "email":   "{{trigger.data.email}}",
                    "phone":   "{{trigger.data.phone}}",
                    "company": "{{trigger.data.company}}",
                    "status":  "lead",
                    "source":  "AI Flow Builder",
                    "score":   70,
                    "notes":   "Created via AI Flow Builder demo run",
                }),
            },
            "position": {"x": 380, "y": 100},
        },
        {
            "id": "crm-deal-1",
            "type": "crm",
            "name": "Create Deal",
            "config": {
                "operation": "create_deal",
                # crm_0 = output of first CRM node (contact node): {contact: {_id, name...}}
                "entityData": json.dumps({
                    "title":     "{{trigger.data.company}} — AI Flow Opportunity",
                    "value":     "{{trigger.data.deal_value}}",
                    "stage":     "new",
                    "contactId": "{{crm_0.contact._id}}",
                    "probability": 25,
                    "notes":     "Auto-created by AI Flow workflow",
                }),
            },
            "position": {"x": 660, "y": 100},
        },
        {
            "id": "crm-activity-1",
            "type": "crm",
            "name": "Log Activity",
            "config": {
                "operation": "log_activity",
                "entityData": json.dumps({
                    "type":        "call",
                    "description": "Initial outreach call — lead entered via AI Flow",
                    "actor":       "AI Workflow",
                    "contactId":   "{{crm_0.contact._id}}",
                }),
            },
            "position": {"x": 940, "y": 100},
        },
    ],
    "compiled_edges": [
        {"id": "e1", "source": "trigger-1",     "target": "crm-contact-1",  "sourceHandle": None},
        {"id": "e2", "source": "crm-contact-1", "target": "crm-deal-1",     "sourceHandle": None},
        {"id": "e3", "source": "crm-deal-1",    "target": "crm-activity-1", "sourceHandle": None},
    ],
    "execution_plan": {
        "startNodeId": "trigger-1",
        "endNodeIds":  ["crm-activity-1"],
        "nodeOrder":   ["trigger-1", "crm-contact-1", "crm-deal-1", "crm-activity-1"],
        "parallelPaths": [],
    },
    "metadata": {
        "createdAt":   "2026-02-27T00:00:00.000Z",
        "updatedAt":   "2026-02-27T00:00:00.000Z",
        "createdBy":   "demo",
        "description": "Demo: Trigger → Create Lead → Create Deal → Log Activity",
    },
}

# These values replace {{name}}, {{email}}, etc. in the node configs
TRIGGER_DATA = {
    "name":       "Flow Demo Person",
    "email":      "flow-demo-v2@demo.com",
    "phone":      "+1-555-8888",
    "company":    "FlowTest Inc",
    "deal_value": 22000,
}

# ─── Fire the workflow ───────────────────────────────────────────────────────

print("🚀  Firing CRM demo workflow...")
result = request(
    f"{BACKEND}/api/orchestrator/execute",
    body={"workflow": WORKFLOW, "triggerData": TRIGGER_DATA},
)
run_id   = result.get("workflowRunId")
status   = result.get("status")
print(f"    workflowRunId : {run_id}")
print(f"    status        : {status}")

# ─── Poll for completion ─────────────────────────────────────────────────────

print("\n⏳  Waiting for execution to complete...")
for i in range(15):
    time.sleep(1)
    run = request(f"{BACKEND}/api/orchestrator/run/{run_id}")
    status = run.get("status")
    print(f"    [{i+1:2d}s] status = {status}")
    if status in ("completed", "failed", "cancelled"):
        break

print(f"\n{'✅' if status == 'completed' else '❌'}  Final status: {status}")

# ─── Show node outputs ───────────────────────────────────────────────────────

if status == "completed":
    history = request(f"{BACKEND}/api/orchestrator/run/{run_id}/history")
    print("\n📋  Node execution results:")
    for node_run in history.get("nodeRuns", []):
        icon = "✅" if node_run["status"] == "completed" else "❌"
        print(f"\n  {icon} Node: {node_run['nodeId']}  ({node_run['status']})")
        if "output" in node_run and node_run["output"]:
            out = node_run["output"]
            msg = out.get("message") or out.get("error") or ""
            print(f"     message  : {msg}")
            if "contact" in out:
                c = out["contact"]
                print(f"     contact  : id={c.get('id')}  name={c.get('name')}  email={c.get('email')}")
            if "deal" in out:
                d = out["deal"]
                print(f"     deal     : id={d.get('id')}  title={d.get('title')}  stage={d.get('stage')}")
            if "activity" in out:
                a = out["activity"]
                print(f"     activity : id={a.get('id')}  type={a.get('type')}")

# ─── Verify in NocoBase ──────────────────────────────────────────────────────

print("\n🔍  Verifying new records in NocoBase...")
nb_token = request(
    f"{NOCOBASE}/api/auth:signIn",
    body={"account": "admin@nocobase.com", "password": "admin123"},
)["data"]["token"]

nb_headers = {"Authorization": f"Bearer {nb_token}", "Content-Type": "application/json"}

def nb_get(path):
    req = urllib.request.Request(f"{NOCOBASE}{path}", headers=nb_headers)
    return json.loads(urllib.request.urlopen(req, timeout=10).read())

contacts = nb_get("/api/contacts:list?pageSize=5&sort[0]=-id")
print(f"\n  Latest contacts (top 3):")
for c in contacts["data"][:3]:
    flag = " ← NEW" if c["email"] == TRIGGER_DATA["email"] else ""
    print(f"    [{c['id']:3d}] {c['name']:22} | {c['status']:10} | {c['email']}{flag}")

deals = nb_get("/api/deals:list?pageSize=5&sort[0]=-id")
print(f"\n  Latest deals (top 3):")
for d in deals["data"][:3]:
    flag = " ← NEW" if "FlowTest" in d.get("title", "") else ""
    print(f"    [{d['id']:3d}] {d['title']:38} | {d['stage']:12} | ${d['value']:,}{flag}")

activities = nb_get("/api/activities:list?pageSize=5&sort[0]=-id")
print(f"\n  Latest activities (top 3):")
for a in activities["data"][:3]:
    flag = " ← NEW" if a.get("actor") == "AI Workflow" else ""
    print(f"    [{a['id']:3d}] [{a['type']:12}] {a['description'][:50]}{flag}")

print("\n🎉  Done! Check http://localhost:8080/crm to see the new entries.")
