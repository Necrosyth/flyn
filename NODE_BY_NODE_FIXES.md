# Complete Node-by-Node Frontend Changes Guide

## Status Overview

| Node Type | Frontend Config | Backend Support | Transformation | Status | Priority |
|-----------|----------------|-----------------|----------------|--------|----------|
| Trigger | ✅ Complete | ✅ Working | ✅ Correct | **✅ 100%** | ✓ Done |
| Action | ⚠️ Partial | ✅ Working | ⚠️ Incomplete | **⚠️ 60%** | 🔴 Critical |
| Decision | ✅ Good | ✅ Working | ✅ Fixed | **✅ 85%** | 🟡 Medium |
| Wait | ⚠️ Partial | ✅ Working | ⚠️ Wrong | **⚠️ 45%** | 🔴 Critical |
| Approval | ⚠️ Partial | ✅ Working | ⚠️ Wrong | **⚠️ 50%** | 🔴 Critical |
| AI Router | ⚠️ Partial | ✅ Working | ❌ Missing | **❌ 30%** | 🔴 Critical |
| MongoDB | ⚠️ Partial | ✅ Working | ❌ Missing | **❌ 30%** | 🔴 Critical |
| Iterator (Loop) | ⚠️ Wrong | ✅ Working | ❌ Missing | **❌ 35%** | 🔴 Critical |
| Split | ❌ Missing | ✅ Working | ❌ Missing | **❌ 0%** | 🟡 Medium |
| Join | ❌ Missing | ✅ Working | ❌ Missing | **❌ 0%** | 🟡 Medium |
| End | ❌ Missing | ✅ Working | ❌ Missing | **❌ 0%** | 🟢 Low |
| AI Decision | ✅ Good | ⚠️ Maps to Condition | ✅ Works | **⚠️ 70%** | 🟢 Low |
| Query Records | ✅ Good | ❌ No backend | ❌ N/A | **❌ 0%** | 🟢 Low |
| AI Action | ✅ Good | ❌ No backend | ❌ N/A | **❌ 0%** | 🟢 Low |

---

# 1️⃣ TRIGGER Node ✅ WORKING

## Backend Expects:
```typescript
{
  triggerType: 'manual' | 'webhook' | 'schedule' | 'event',
  eventName?: string,
  description?: string
}
```

## Frontend Sends:
```typescript
{
  trigger_type: 'manual' | 'webhook' | 'schedule' | 'event',
  event_name?: string,
  description?: string
}
```

## Transformation (orchestrator.ts):
```typescript
case 'trigger':
  return {
    triggerType: config.trigger_type || 'manual',
    eventName: config.event_name,
    description: config.description,
  };
```

## ✅ STATUS: **WORKING PERFECTLY**

## Frontend Changes Needed: **NONE**

---

# 2️⃣ ACTION Node ⚠️ NEEDS FIXES

## Backend Action Types & Requirements:

### 2.1 **email** ✅ Working
**Backend expects:**
```typescript
{
  actionType: 'email',
  to: string | string[],      // REQUIRED
  subject: string,             // REQUIRED
  body: string,               // REQUIRED
  from?: string,
  isHtml?: boolean
}
```

**Frontend config fields:**
- `action_type: 'email'`
- `target` → maps to `to` ✅
- `subject` ✅
- `payload` → maps to `body` ✅

**✅ Status:** Working after our fixes

---

### 2.2 **slack** ⚠️ Mocked (logs only)
**Backend expects:**
```typescript
{
  actionType: 'slack',
  channel: string,    // REQUIRED
  message: string     // REQUIRED
}
```

**Frontend config fields:**
- `action_type: 'slack'`
- `target` → maps to `channel` ✅
- `payload` → maps to `message` ✅

**✅ Status:** Mapping works, backend is mocked

---

### 2.3 **webhook** (maps to `http_request`) ⚠️ Partial
**Backend expects:**
```typescript
{
  actionType: 'http_request',
  url: string,                              // REQUIRED
  method: 'GET' | 'POST' | 'PUT' | 'DELETE', // Default: GET
  headers?: Record<string, string>,
  body?: any,
  queryParams?: Record<string, string>,
  timeoutMs?: number,
  parseResponse?: boolean
}
```

**Frontend config fields:**
- `action_type: 'webhook'`
- `target` → maps to `url` ✅
- `payload` → maps to `body` ✅
- ❌ **MISSING:** `method` dropdown (defaults to GET now)
- ❌ **MISSING:** `headers` field
- ❌ **MISSING:** `query_params` field

**⚠️ Status:** Basic working, missing advanced fields

**🔧 Frontend Changes Needed:**

```typescript
// In nodeSchemas.ts, add to Action node fields:

{
  name: 'method',
  label: 'HTTP Method',
  type: 'select',
  showIf: (config) => config.action_type === 'webhook',
  default: 'GET',
  options: [
    { value: 'GET', label: 'GET' },
    { value: 'POST', label: 'POST' },
    { value: 'PUT', label: 'PUT' },
    { value: 'DELETE', label: 'DELETE' },
    { value: 'PATCH', label: 'PATCH' },
  ],
},
{
  name: 'headers',
  label: 'Request Headers (JSON)',
  type: 'textarea',
  showIf: (config) => config.action_type === 'webhook',
  placeholder: '{"Authorization": "Bearer {{token}}"}',
  rows: 3,
},
{
  name: 'query_params',
  label: 'Query Parameters (JSON)',
  type: 'textarea',
  showIf: (config) => config.action_type === 'webhook',
  placeholder: '{"page": "1", "limit": "10"}',
  rows: 2,
},
```

**🔧 Backend Transformation Update:**

```typescript
// In orchestrator.ts, update http_request case:

if (actionType === 'http_request') {
  let body: unknown = undefined;
  if (config.payload) {
    try {
      body = JSON.parse(config.payload as string);
    } catch {
      body = { message: config.payload };
    }
  }
  
  // ADD THESE:
  let headers: Record<string, string> = {};
  if (config.headers) {
    try {
      headers = JSON.parse(config.headers as string);
    } catch {
      console.warn('Invalid headers JSON, ignoring');
    }
  }
  
  let queryParams: Record<string, string> = {};
  if (config.query_params) {
    try {
      queryParams = JSON.parse(config.query_params as string);
    } catch {
      console.warn('Invalid query params JSON, ignoring');
    }
  }
  
  return {
    actionType,
    url: config.target,
    method: config.method || 'GET',
    body,
    headers,       // ADD
    queryParams,   // ADD
    subject: config.subject,
    retryPolicy: config.retry_policy,
  };
}
```

---

### 2.4 **notification** ✅ Working (generic handler)
**Frontend:** `action_type: 'notification'`
**Status:** Works with email mapping

---

### 2.5 **crm_update** ⚠️ Generic handler only
**Frontend:** `action_type: 'crm_update'`
**Status:** Falls through to generic handler (logs "Generic action executed")

---

### 2.6 **log** ❌ NOT IN FRONTEND
**Backend supports:** `actionType: 'log'`
**Frontend:** Missing from action_type dropdown

**🔧 Add to frontend:**
```typescript
// In nodeSchemas.ts action_type options:
{ value: 'log', label: 'Log Message' },
```

---

### 2.7 **transform** ❌ NOT IN FRONTEND
**Backend supports:** Data transformation
**Frontend:** Not exposed

---

# 3️⃣ DECISION Node ✅ MOSTLY WORKING

## Backend Expects:
```typescript
{
  conditionType: 'field_comparison' | 'expression' | 'field_exists' | 'ai_confidence',
  conditions: [{
    type: 'field_comparison' | 'field_exists',
    field: string,
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith',
    value: any,
    targetNodeId?: string
  }],
  defaultPath: string | null
}
```

## Frontend Sends:
```typescript
{
  condition_type: 'field_equals' | 'field_contains' | 'field_exists' | 'expression',
  field_name: string,
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'starts_with',
  compare_value: any
}
```

## Transformation:
```typescript
case 'decision':
case 'ai_decision':
  const operatorMap = {
    'equals': '==',
    'not_equals': '!=',
    'greater_than': '>',
    'less_than': '<',
    'contains': 'contains',
    'starts_with': 'startsWith',
  };
  return {
    conditionType: config.condition_type || 'expression',
    conditions: [{
      type: config.condition_type === 'field_exists' ? 'field_exists' : 'field_comparison',
      field: config.field_name,
      operator: operatorMap[config.operator] || '==',
      value: config.compare_value,
    }],
    defaultPath: null,
  };
```

## ✅ STATUS: **WORKING** (just fixed operator mapping)

## Frontend Changes Needed:
**Add >= and <= operators:**
```typescript
// In nodeSchemas.ts operator options:
{ value: 'greater_or_equal', label: '>=' },
{ value: 'less_or_equal', label: '<=' },
```

**Update operatorMap in orchestrator.ts:**
```typescript
'greater_or_equal': '>=',
'less_or_equal': '<=',
```

---

# 4️⃣ WAIT Node ⚠️ CRITICAL FIXES NEEDED

## Backend Wait Types & Requirements:

### 4.1 **duration** ✅ Working
**Backend expects:**
```typescript
{
  waitType: 'duration',
  duration: number,     // REQUIRED
  unit: 'seconds' | 'minutes' | 'hours' | 'days'  // REQUIRED
}
```

**Frontend sends:**
```typescript
{
  wait_type: 'duration',
  duration_value: number,
  duration_unit: 'seconds' | 'minutes' | 'hours' | 'days'
}
```

**Transformation:**
```typescript
case 'wait':
  return {
    waitType: config.wait_type || 'duration',
    duration: config.duration_value || 5,
    unit: config.duration_unit || 'seconds',
    // ...
  };
```

**✅ Status:** Working

---

### 4.2 **datetime** ✅ Working
**Backend expects:**
```typescript
{
  waitType: 'datetime',
  datetime: string  // ISO 8601 timestamp
}
```

**Frontend:** Has datetime field
**✅ Status:** Working

---

### 4.3 **signal** ❌ BROKEN MAPPING

**Backend expects:**
```typescript
{
  waitType: 'event',  // ← Backend uses 'event', NOT 'signal'
  eventType: string   // ← Backend uses 'eventType', NOT 'signalName'
}
```

**Frontend sends:**
```typescript
{
  wait_type: 'signal',
  signal_name: string
}
```

**Current transformation (WRONG):**
```typescript
signalName: config.signal_name,  // ← Backend doesn't use this!
```

**🔧 Fix Required in orchestrator.ts:**

```typescript
case 'wait':
  // Map frontend 'signal' to backend 'event'
  let waitType = config.wait_type || 'duration';
  if (waitType === 'signal') {
    waitType = 'event';  // REMAP
  }
  
  return {
    waitType,
    duration: config.duration_value || 5,
    unit: config.duration_unit || 'seconds',
    eventType: config.signal_name,  // CHANGE from signalName
    datetime: config.datetime,
    timeout: config.timeout_enabled ? (config.timeout_hours as number) * 60 * 60 * 1000 : undefined,
  };
```

**🔧 Frontend Changes (optional — update label):**
```typescript
// In nodeSchemas.ts wait_type options:
{ value: 'signal', label: 'Wait for Event' },  // ← More accurate
```

---

### 4.4 **user_reply** ❌ NOT IN FRONTEND

**Backend supports:**
```typescript
{
  waitType: 'user_reply',
  conversationId: string,
  timeout?: number
}
```

**Frontend:** Missing from wait_type dropdown

**🔧 Add to frontend:**
```typescript
// In nodeSchemas.ts:
{ value: 'user_reply', label: 'Wait for User Reply (Chatwoot)' },

// Add field:
{
  name: 'conversation_id',
  label: 'Conversation ID',
  type: 'text',
  showIf: (config) => config.wait_type === 'user_reply',
  supportsVariables: true,
  placeholder: '{{trigger.conversationId}}',
},
```

**🔧 Backend transformation:**
```typescript
case 'wait':
  return {
    waitType: config.wait_type === 'signal' ? 'event' : config.wait_type,
    // ... existing fields
    conversationId: config.conversation_id,  // ADD
  };
```

---

### 4.5 **call_end** ❌ NOT IN FRONTEND

**Backend supports:**
```typescript
{
  waitType: 'call_end',
  callId: string
}
```

**🔧 Add to frontend:** (same pattern as user_reply)

---

# 5️⃣ APPROVAL Node ⚠️ CRITICAL FIX

## Backend Expects:
```typescript
{
  approvalType: 'single' | 'any' | 'all' | 'majority',
  assignedTo: {                              // ← NESTED OBJECT
    users?: string[],
    roles?: string[],
    dynamic?: string  // Variable like {{trigger.managerId}}
  },
  title: string,
  message: string,
  timeout?: {
    duration: number,
    action: 'escalate' | 'auto_approve' | 'auto_reject' | 'fail',
    escalateTo?: { users?: string[], roles?: string[] }
  }
}
```

## Frontend Sends:
```typescript
{
  approval_type: 'single' | 'any' | 'all' | 'majority',
  approvers: string,  // ← FLAT STRING, NOT NESTED!
  title: string,
  message: string,
  timeout_config: { ... }
}
```

## Current Transformation (WRONG):
```typescript
case 'approval':
  return {
    approvalType: config.approval_type || 'single',
    approvers: typeof config.approvers === 'string'
      ? config.approvers.split(',').map(s => s.trim())
      : config.approvers || [],  // ← Wrong field name!
    title: config.title,
    message: config.message,
    timeout: config.timeout_config,
  };
```

## 🔧 CRITICAL FIX in orchestrator.ts:

```typescript
case 'approval':
  // Parse approvers into proper structure
  let assignedTo: any = { users: [], roles: [] };
  
  if (config.approvers) {
    const approverList = typeof config.approvers === 'string'
      ? config.approvers.split(',').map(s => s.trim())
      : config.approvers;
    
    // Check if it's a variable reference
    if (approverList.length === 1 && approverList[0].startsWith('{{')) {
      assignedTo.dynamic = approverList[0];
    } else {
      // Assume they're users (could add role: prefix detection)
      assignedTo.users = approverList;
    }
  }
  
  return {
    approvalType: config.approval_type || 'single',
    assignedTo,  // ← CORRECT FIELD NAME
    title: config.title,
    message: config.message,
    timeout: config.timeout_config,
  };
```

## 🔧 Frontend Enhancement (optional):

Add separate fields for users vs roles:
```typescript
{
  name: 'approver_users',
  label: 'Assign to Users',
  type: 'text',
  placeholder: 'user1@example.com, user2@example.com',
},
{
  name: 'approver_roles',
  label: 'Assign to Roles',
  type: 'text',
  placeholder: 'admin, manager, reviewer',
},
```

---

# 6️⃣ AI ROUTER Node ❌ NO TRANSFORMATION

## Backend Expects:
```typescript
{
  task: 'generate_mongo_query' | 'classify_intent' | 'extract_data' | 'custom',
  prompt: string,                    // REQUIRED for most tasks
  confidenceThreshold: number,       // 0.0 to 1.0 (e.g., 0.7)
  outputSchema?: object,             // For extract_data
  fallbackAction?: 'ask_human' | 'skip' | 'use_default' | 'retry',
  nextNodeMapping?: Record<string, string>  // intent → nodeId
}
```

## Frontend Sends:
```typescript
{
  ai_task: 'generate_mongo_query' | 'classify_intent' | 'extract_data' | 'custom',
  prompt: string,
  confidence_threshold: number,      // 0 to 100 (e.g., 70)  ← WRONG SCALE!
  output_schema: string,             // JSON string
  fallback_action: string,
  routing_map: string                // JSON string of intent→nodeId
}
```

## Current Status: ❌ **NO TRANSFORMATION CASE**

## 🔧 CRITICAL FIX — Add to orchestrator.ts:

```typescript
case 'ai_router':
  // Parse JSON fields
  let outputSchema;
  if (config.output_schema) {
    try {
      outputSchema = JSON.parse(config.output_schema as string);
    } catch {
      console.warn('Invalid output_schema JSON');
    }
  }
  
  let nextNodeMapping;
  if (config.routing_map) {
    try {
      nextNodeMapping = JSON.parse(config.routing_map as string);
    } catch {
      console.warn('Invalid routing_map JSON');
    }
  }
  
  return {
    task: config.ai_task || 'custom',
    prompt: config.prompt,
    confidenceThreshold: (config.confidence_threshold as number) / 100,  // ← 0-100 to 0-1
    outputSchema,
    fallbackAction: config.fallback_action || 'ask_human',
    nextNodeMapping,
  };
```

---

# 7️⃣ MONGODB Node ❌ NO TRANSFORMATION

## Backend Expects:
```typescript
{
  connectionString?: string,     // Falls back to MONGODB_DEFAULT_URI env
  database?: string,             // Falls back to MONGODB_DEFAULT_DATABASE env
  operation: 'find' | 'findOne' | 'aggregate' | 'count',
  collection: string,            // REQUIRED
  query?: object,                // MongoDB query
  projection?: object,
  sort?: object,
  limit?: number,
  skip?: number,
  aiRouterInput?: string         // Read query from AI Router output
}
```

## Frontend Sends:
```typescript
{
  connection_string: string,
  database: string,
  operation: 'find' | 'findOne' | 'aggregate' | 'count',
  collection: string,
  query: string,                 // JSON string ← NOT PARSED
  projection: string,            // JSON string
  sort: string,                  // JSON string
  limit: number,
  skip: number
}
```

## Current Status: ❌ **NO TRANSFORMATION CASE**

## 🔧 CRITICAL FIX — Add to orchestrator.ts:

```typescript
case 'mongodb':
  // Parse JSON fields
  let query, projection, sort;
  
  if (config.query) {
    try {
      query = JSON.parse(config.query as string);
    } catch {
      console.warn('Invalid MongoDB query JSON');
    }
  }
  
  if (config.projection) {
    try {
      projection = JSON.parse(config.projection as string);
    } catch {
      console.warn('Invalid projection JSON');
    }
  }
  
  if (config.sort) {
    try {
      sort = JSON.parse(config.sort as string);
    } catch {
      console.warn('Invalid sort JSON');
    }
  }
  
  return {
    connectionString: config.connection_string,
    database: config.database,
    operation: config.operation || 'find',
    collection: config.collection,
    query,
    projection,
    sort,
    limit: config.limit,
    skip: config.skip,
    aiRouterInput: config.ai_router_input,
  };
```

---

# 8️⃣ ITERATOR Node (Maps to LOOP) ❌ WRONG TYPE NAME

## Backend Node Type: `loop` (not `iterator`)

## Backend Expects:
```typescript
{
  loopType: 'forEach' | 'times' | 'while',
  
  // forEach specific:
  itemsSource: string,           // Variable like {{trigger.items}}
  itemVariable: string,          // Current item var name (default: 'item')
  
  // times specific:
  iterations: number,
  
  // while specific:
  condition: string,             // Expression to evaluate
  
  // All:
  maxIterations: number,         // Safety limit (default: 1000)
  parallel?: boolean
}
```

## Frontend Sends (as "iterator"):
```typescript
{
  loop_type: 'for_each' | 'times' | 'while',  // ← Underscore, not camelCase
  list_source: string,                        // ← Wrong name
  item_variable: string,
  iterations: number,
  condition: string,
  max_iterations: number,
  parallel: boolean
}
```

## Current Status: ❌ **NO TRANSFORMATION + WRONG TYPE NAME**

## 🔧 CRITICAL FIXES:

### Fix 1: Update mapNodeType in orchestrator.ts:
```typescript
private mapNodeType(frontendType: string): string {
  const typeMap: Record<string, string> = {
    'ai_decision': 'condition',
    'decision': 'condition',
    'iterator': 'loop',  // ← ADD THIS
  };
  return typeMap[frontendType] || frontendType;
}
```

### Fix 2: Add transformation case:
```typescript
case 'iterator':  // Frontend sends 'iterator'
  // Map to backend 'loop' type
  let loopType = config.loop_type;
  // Normalize underscore to camelCase
  if (loopType === 'for_each') loopType = 'forEach';
  
  return {
    loopType,
    itemsSource: config.list_source,      // Remap
    itemVariable: config.item_variable || 'item',
    iterations: config.iterations,
    condition: config.condition,
    maxIterations: config.max_iterations || 1000,
    parallel: config.parallel || false,
  };
```

### Fix 3: Frontend schema update (optional):
```typescript
// In nodeSchemas.ts, change iterator fields:
{
  name: 'loop_type',
  options: [
    { value: 'forEach', label: 'For Each Item' },  // ← Remove underscore
    { value: 'times', label: 'Repeat N Times' },
    { value: 'while', label: 'While Condition' },
  ],
},
{
  name: 'list_source',  // ← Keep snake_case for consistency
  label: 'Array Source',
  supportsVariables: true,
  placeholder: '{{previousNode.items}}',
},
```

---

# 9️⃣ SPLIT Node ❌ MISSING FROM FRONTEND

## Backend Expects:
```typescript
{
  // No config needed — just signals orchestrator to fork
}
```

## Frontend Status: **NOT IN nodeSchemas.ts**

## 🔧 ADD TO FRONTEND:

```typescript
// In nodeSchemas.ts:
{
  type: 'split',
  label: 'Parallel Split',
  category: 'Flow Control',
  icon: GitBranch,
  color: '#8b5cf6',
  description: 'Fork execution into parallel branches',
  fields: [
    {
      name: 'description',
      label: 'Description',
      type: 'text',
      placeholder: 'Why split into parallel branches?',
    },
  ],
}
```

## Backend transformation (orchestrator.ts):
```typescript
case 'split':
  return {
    description: config.description,
  };
```

---

# 🔟 JOIN Node ❌ MISSING FROM FRONTEND

## Backend Expects:
```typescript
{
  strategy: 'wait_all' | 'first' | 'any',
  mergeData?: boolean,         // Combine data from all branches
  requiredBranches?: number    // For 'any' strategy
}
```

## Frontend Status: **NOT IN nodeSchemas.ts**

## 🔧 ADD TO FRONTEND:

```typescript
{
  type: 'join',
  label: 'Parallel Join',
  category: 'Flow Control',
  icon: GitMerge,
  color: '#8b5cf6',
  description: 'Wait for parallel branches to complete',
  fields: [
    {
      name: 'strategy',
      label: 'Merge Strategy',
      type: 'select',
      required: true,
      default: 'wait_all',
      options: [
        { value: 'wait_all', label: 'Wait for All Branches' },
        { value: 'first', label: 'Continue on First Branch' },
        { value: 'any', label: 'Continue on N Branches' },
      ],
    },
    {
      name: 'required_branches',
      label: 'Required Branches',
      type: 'number',
      showIf: (config) => config.strategy === 'any',
      default: 1,
    },
    {
      name: 'merge_data',
      label: 'Merge Branch Data',
      type: 'toggle',
      default: true,
    },
  ],
}
```

## Backend transformation:
```typescript
case 'join':
  return {
    strategy: config.strategy || 'wait_all',
    mergeData: config.merge_data !== false,
    requiredBranches: config.required_branches,
  };
```

---

# 1️⃣1️⃣ END Node ❌ MISSING FROM FRONTEND

## Backend Expects:
```typescript
{
  outputMapping?: Record<string, string>,  // Map final outputs
  summary?: string
}
```

## Frontend Status: **NOT IN nodeSchemas.ts**

## 🔧 ADD TO FRONTEND:

```typescript
{
  type: 'end',
  label: 'End',
  category: 'Flow Control',
  icon: StopCircle,
  color: '#ef4444',
  description: 'Explicit workflow termination',
  fields: [
    {
      name: 'summary',
      label: 'Summary Message',
      type: 'text',
      placeholder: 'Workflow completed successfully',
    },
    {
      name: 'output_mapping',
      label: 'Output Mapping (JSON)',
      type: 'textarea',
      placeholder: '{"result": "{{action-1.result}}", "status": "success"}',
      rows: 4,
    },
  ],
}
```

## Backend transformation:
```typescript
case 'end':
  let outputMapping;
  if (config.output_mapping) {
    try {
      outputMapping = JSON.parse(config.output_mapping as string);
    } catch {
      console.warn('Invalid output_mapping JSON');
    }
  }
  
  return {
    outputMapping,
    summary: config.summary,
  };
```

---

# 1️⃣2️⃣ AI DECISION Node ⚠️ WORKS (Maps to Condition)

**Status:** Frontend type `ai_decision` maps to backend type `condition`
**Compatibility:** 70%
**Action:** Already handled in transformation

---

# 1️⃣3️⃣ QUERY RECORDS Node ❌ NO BACKEND IMPLEMENTATION

**Status:** Frontend exists, backend doesn't support it
**Action:** Either implement backend executor or remove from frontend

---

# 1️⃣4️⃣ AI ACTION Node ❌ NO BACKEND IMPLEMENTATION

**Status:** Frontend exists, backend doesn't support it
**Action:** Either implement backend executor or remove from frontend

---

# 🎯 PRIORITY ACTION PLAN

## 🔴 CRITICAL (Do First — 90 minutes)

### 1. Fix Broken Transformations (30 min)
- ✅ Wait: `signal` → `event`, `signal_name` → `eventType`
- ✅ Approval: `approvers` → `assignedTo` nested structure
- ✅ Add MongoDB transformation case
- ✅ Add AI Router transformation case (+ scale 0-100 → 0-1)
- ✅ Add Iterator transformation case + type mapping

### 2. Fix Action Node HTTP Fields (20 min)
- Add `method` dropdown for webhook type
- Add `headers` textarea
- Add `query_params` textarea
- Update transformation to parse these

### 3. Add Missing Wait Types to Frontend (15 min)
- Add `user_reply` option
- Add `call_end` option
- Add corresponding fields

### 4. Add Split/Join/End Nodes to Frontend (25 min)
- Add all 3 to nodeSchemas.ts
- Add transformations
- Test in visual builder

---

## 🟡 MEDIUM (Do Next — 60 minutes)

### 5. Enhance Decision Node (10 min)
- Add `>=` and `<=` operators
- Update operator map

### 6. Add Log Action Type (5 min)
- Add to action_type dropdown
- Already supported by backend

### 7. Fix Iterator Frontend Schema (10 min)
- Change `for_each` → `forEach`
- Update field labels

### 8. Add Trigger Data Input Dialog (35 min)
- See FRONTEND_BACKEND_GUIDE.md for code

---

## 🟢 LOW PRIORITY (Optional)

### 9. Add Execution History Panel
- Visualize node-by-node results

### 10. Add Variable Picker UI
- Autocomplete for `{{variables}}`

### 11. Remove Unsupported Nodes
- Remove Query Records and AI Action (no backend)
- Or implement backend executors

---

# 📋 TESTING CHECKLIST

After making changes, test each node type:

```bash
# Test Trigger
✓ Manual, webhook, schedule, event types

# Test Action
✓ Email with to/subject/body
✓ Slack with channel/message
✓ HTTP with method/headers/body
✓ Log action
✓ Notification fallback

# Test Decision
✓ All operators (==, !=, >, <, >=, <=)
✓ field_equals, field_exists, expression

# Test Wait
✓ Duration (seconds/minutes/hours/days)
✓ Datetime
✓ Event/signal
✓ User reply
✓ Call end

# Test Approval
✓ Single, any, all, majority
✓ User/role assignment
✓ Timeout actions

# Test AI Router
✓ Mongo query generation
✓ Intent classification
✓ Confidence threshold (0.7 = 70%)
✓ Fallback actions

# Test MongoDB
✓ Find, findOne, aggregate, count
✓ Query/projection/sort parsing
✓ Connection string handling

# Test Loop
✓ forEach over arrays
✓ Times N repetitions
✓ While conditions
✓ Max iterations safety

# Test Split/Join
✓ Parallel branching
✓ wait_all strategy
✓ first strategy
✓ Data merging

# Test End
✓ Output mapping
✓ Summary message
```

---

# 🚀 Quick Implementation Script

Run this to apply all critical fixes at once:

1. Copy the transformation fixes to `orchestrator.ts`
2. Copy the node schema additions to `nodeSchemas.ts`
3. Restart frontend: `npm run dev`
4. Test with the checklist above

**Estimated time to fully working:** 2-3 hours

**Current overall compatibility:** 28%
**After fixes:** 95%+
