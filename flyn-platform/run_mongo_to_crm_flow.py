#!/usr/bin/env python3
"""
MongoDB -> CRM Flow Demo
========================
Flow:
  1. Trigger         -- provides the name of the lead to look up
  2. MongoDB findOne -- queries flyn_workflow_demo.leads for that name
  3. CRM Create Contact -- creates a contact using data from MongoDB result
  4. CRM Create Deal    -- creates a deal linked to the new contact

Template variable reference (for your own flows):
  {{trigger.data.lead_name}}         -> value passed in triggerData
  {{mongodb_0.result.name}}          -> field from findOne result (single doc)
  {{mongodb_0.result.email}}         -> email field from the MongoDB document
  {{mongodb_0.result.company}}       -> company field
  {{mongodb_0.result.deal_value}}    -> deal_value field
  {{mongodb_0.result.phone}}         -> phone field
  {{mongodb_0.result.source}}        -> source field
  {{crm_0.contact._id}}              -> id of the contact created in CRM node
"""

import urllib.request
import json
import time

BACKEND  = "http://localhost:3000"
NOCOBASE = "http://localhost:13000"

# Change to any seeded lead name to test a different record
# Available in MongoDB: "Arjun Mehta" | "Priya Sharma" | "Rohan Kapoor"
TRIGGER_DATA = {
    "lead_name": "Arjun Mehta"
}


def request(url, body=None, method=None):
    m = method or ("POST" if body else "GET")
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"},
        method=m,
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())


# ---------------------------------------------------------------------------
# Workflow definition
# NOTE: When sending directly to the backend orchestrator, use backend format:
#   - compiled_nodes / compiled_edges  (not nodes / edges)
#   - camelCase config fields          (entityData, not entity_data)
#   - query as an object               (not a JSON string)
# ---------------------------------------------------------------------------
WORKFLOW = {
    "id": "mongo-crm-demo-001",
    "name": "MongoDB -> CRM Demo",
    "version": "1.0.0",
    "tenantId": "default-tenant",

    "compiled_nodes": [
        # Node 1: Manual Trigger
        {
            "id": "trigger-1",
            "type": "trigger",
            "name": "Manual Trigger",
            "config": {"triggerType": "manual"},
            "position": {"x": 100, "y": 200},
        },

        # Node 2: MongoDB findOne
        # Output accessible as:  mongodb_0.result.<field>
        # e.g.  {{mongodb_0.result.name}}  {{mongodb_0.result.email}}
        {
            "id": "mongo-1",
            "type": "mongodb",
            "name": "Fetch Lead from DB",
            "config": {
                "database":   "flyn_workflow_demo",
                "collection": "leads",
                "operation":  "findOne",
                # query is an OBJECT here (not a JSON string)
                # {{trigger.data.lead_name}} is resolved from triggerData
                "query":      {"name": "{{trigger.data.lead_name}}"},
                "projection": {
                    "name": 1, "email": 1, "company": 1,
                    "phone": 1, "deal_value": 1, "source": 1, "_id": 0
                },
            },
            "position": {"x": 360, "y": 200},
        },

        # Node 3: CRM -- Create Contact from MongoDB fields
        # Output accessible as:  crm_0.contact.<field>
        # e.g.  {{crm_0.contact._id}}
        {
            "id": "crm-contact-1",
            "type": "crm",
            "name": "Create CRM Contact",
            "config": {
                "operation": "create_contact",
                # entityData is camelCase (backend format)
                "entityData": json.dumps({
                    "name":    "{{mongodb_0.result.name}}",
                    "email":   "{{mongodb_0.result.email}}",
                    "phone":   "{{mongodb_0.result.phone}}",
                    "company": "{{mongodb_0.result.company}}",
                    "status":  "lead",
                    "source":  "{{mongodb_0.result.source}}"
                }),
            },
            "position": {"x": 620, "y": 200},
        },

        # Node 4: CRM -- Create Deal linked to new contact
        {
            "id": "crm-deal-1",
            "type": "crm",
            "name": "Create CRM Deal",
            "config": {
                "operation": "create_deal",
                "entityData": json.dumps({
                    "title":     "{{mongodb_0.result.company}} -- MongoDB Import",
                    "value":     "{{mongodb_0.result.deal_value}}",
                    "stage":     "new",
                    "contactId": "{{crm_0.contact._id}}",
                }),
            },
            "position": {"x": 880, "y": 200},
        },
    ],

    "compiled_edges": [
        {"id": "e1", "source": "trigger-1",     "target": "mongo-1",       "sourceHandle": None},
        {"id": "e2", "source": "mongo-1",        "target": "crm-contact-1", "sourceHandle": None},
        {"id": "e3", "source": "crm-contact-1", "target": "crm-deal-1",    "sourceHandle": None},
    ],

    "execution_plan": {
        "startNodeId":   "trigger-1",
        "endNodeIds":    ["crm-deal-1"],
        "nodeOrder":     ["trigger-1", "mongo-1", "crm-contact-1", "crm-deal-1"],
        "parallelPaths": [],
    },

    "metadata": {
        "createdAt":   "2026-02-27T00:00:00.000Z",
        "updatedAt":   "2026-02-27T00:00:00.000Z",
        "createdBy":   "demo",
        "description": "Demo: fetch lead from MongoDB, create CRM contact + deal",
    },
}


def run():
    print("=" * 62)
    print("  MongoDB -> CRM Demo Flow")
    print("=" * 62)
    print(f"\n  Looking up lead: '{TRIGGER_DATA['lead_name']}'")
    print(f"  DB: flyn_workflow_demo  Collection: leads")
    print("-" * 62)

    print("\n[1/2] Firing workflow...")
    result = request(
        f"{BACKEND}/api/orchestrator/execute",
        {"workflow": WORKFLOW, "triggerData": TRIGGER_DATA},
    )

    run_id = result.get("workflowRunId", "?")
    status = result.get("status", "?")
    print(f"      Run ID : {run_id}")
    print(f"      Status : {status}")

    # Give async nodes a moment if needed
    ctx = result.get("context", {})
    if status not in ("completed", "failed"):
        print("      (waiting 2s for async completion...)")
        time.sleep(2)
        try:
            run_data = request(f"{BACKEND}/api/orchestrator/run/{run_id}")
            status = run_data.get("status", status)
            ctx = run_data.get("context", ctx)
        except Exception:
            pass

    # Node outputs
    print("\n[2/2] Node results")
    print("-" * 62)

    node_outputs = ctx.get("nodeOutputs", {})

    # MongoDB node
    mongo_out    = node_outputs.get("mongo-1", {})
    mongo_result = mongo_out.get("result")
    if mongo_result:
        print(f"\n  MongoDB (findOne)")
        print(f"    Name       : {mongo_result.get('name')}")
        print(f"    Email      : {mongo_result.get('email')}")
        print(f"    Company    : {mongo_result.get('company')}")
        print(f"    Phone      : {mongo_result.get('phone')}")
        print(f"    Deal Value : ${mongo_result.get('deal_value', 0):,}")
        print(f"    Source     : {mongo_result.get('source')}")
    else:
        print(f"\n  MongoDB: no result for '{TRIGGER_DATA['lead_name']}'")
        if mongo_out.get("error"):
            print(f"    Error: {mongo_out['error']}")

    # CRM Contact
    crm_c_out = node_outputs.get("crm-contact-1", {})
    contact   = crm_c_out.get("contact", {})
    if contact:
        print(f"\n  CRM -- Contact created")
        print(f"    ID      : {contact.get('_id') or contact.get('id')}")
        print(f"    Name    : {contact.get('name')}")
        print(f"    Email   : {contact.get('email')}")
        print(f"    Company : {contact.get('company')}")
    else:
        print(f"\n  CRM Contact: {crm_c_out}")

    # CRM Deal
    crm_d_out = node_outputs.get("crm-deal-1", {})
    deal      = crm_d_out.get("deal", {})
    if deal:
        print(f"\n  CRM -- Deal created")
        print(f"    ID    : {deal.get('_id') or deal.get('id')}")
        print(f"    Title : {deal.get('title')}")
        print(f"    Value : ${deal.get('value', 0):,}")
        print(f"    Stage : {deal.get('stage')}")
    else:
        print(f"\n  CRM Deal: {crm_d_out}")

    print("\n" + "=" * 62)
    if status == "completed":
        print("  Flow completed!")
        print("  NocoBase : http://localhost:13000")
        print("  CRM UI   : http://localhost:8080/crm")
    else:
        print(f"  Status: {status}")
        if result.get("error"):
            print(f"  Error : {result['error']}")
    print("=" * 62)


if __name__ == "__main__":
    run()

