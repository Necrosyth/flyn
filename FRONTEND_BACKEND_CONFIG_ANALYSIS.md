# Comprehensive Frontend-Backend Node Configuration Analysis

**Analysis Date:** February 8, 2026  
**Purpose:** Complete mapping of every node type's configuration between frontend schema and backend requirements

---

## 📋 Table of Contents

1. [Trigger Node](#1-trigger-node)
2. [Action Node](#2-action-node)
3. [Wait Node](#3-wait-node)
4. [Decision/Condition Node](#4-decisioncondition-node)
5. [AI Router Node](#5-ai-router-node)
6. [Approval Node](#6-approval-node)
7. [MongoDB Node](#7-mongodb-node)
8. [Query Records Node](#8-query-records-node)
9. [Iterator/Loop Node](#9-iteratorloop-node)
10. [Split Node](#10-split-node)
11. [Join Node](#11-join-node)
12. [End Node](#12-end-node)
13. [AI Action Node](#13-ai-action-node)
14. [AI Decision Node](#14-ai-decision-node)
15. [Summary of Issues](#summary-of-issues)

---

## 1. TRIGGER NODE

### Frontend Schema (`nodeSchemas.ts`)
```typescript
type: 'trigger'
fields: {
  trigger_type: select (webhook|schedule|manual|event) [REQUIRED]
  event_name: text
  description: textarea
}
```

### Backend Requirements (`trigger.executor.ts`)
```typescript
Config Expected: {
  triggerType: string  // Note: camelCase!
}

Supported Types:
  - 'webhook' → validates data exists
  - 'schedule' → no validation
  - 'manual' → no validation
  - 'event' → validates eventType field exists
```

### Frontend Transformation (`orchestrator.ts` lines 228-232)
```typescript
return {
  triggerType: config.trigger_type || 'manual',  // ✅ snake_case → camelCase
  eventName: config.event_name,                  // ✅ Included
  description: config.description,               // ✅ Included
};
```

### Analysis
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| trigger_type | ✅ Required select | triggerType (string) | ✅ Converted | ✅ MATCH |
| event_name | ✅ Optional text | eventName (optional) | ✅ Converted | ✅ MATCH |
| description | ✅ Optional textarea | description (optional) | ✅ Included | ✅ MATCH |

**Issues Found:** ✅ None

---

## 2. ACTION NODE

### Frontend Schema
```typescript
type: 'action'
fields: {
  action_type: select (email|slack|webhook|crm_update|notification) [REQUIRED]
  target: text [REQUIRED] - "Recipient / Endpoint"
  subject: text
  payload: textarea - "Message Body"
  retry_policy: section {
    enabled: toggle (default: false)
    max_attempts: number (1-10, default: 3)
    backoff_seconds: number (1-3600, default: 60)
  }
}
```

### Backend Requirements (`action.executor.ts`)
```typescript
Config Expected: {
  actionType: string [REQUIRED]
  // Varies by actionType...
}

Supported Action Types & Their Fields:

1. 'http_request':
   - url: string [REQUIRED]
   - method: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH' (default: 'GET')
   - headers: Record<string, string>
   - body: any
   - queryParams: Record<string, string>
   - timeoutMs: number (default: 30000)
   - parseResponse: boolean (default: true)

2. 'email':
   - to: string | string[] [REQUIRED]
   - subject: string [REQUIRED]
   - body: string [REQUIRED]
   - from: string
   - isHtml: boolean (default: true)

3. 'slack':
   - channel: string [REQUIRED]
   - message: string [REQUIRED]

4. 'log':
   - message: string

5. 'transform':
   - transformType: 'merge'|'pick'|'map'
   - keys: string[] (for 'pick')
   - sourceKey: string (for 'map')
   - mapping: Record<string, string> (for 'map')

6. Generic fallback (crm_update, notification, etc.):
   - No specific validation, passes config as-is
```

### Frontend Transformation (`orchestrator.ts` lines 234-272)
```typescript
let actionType = config.action_type || 'log';

// Special mapping:
if (actionType === 'webhook') {
  actionType = 'http_request';  // ⚠️ Frontend uses 'webhook', backend expects 'http_request'
}

if (actionType === 'http_request') {
  let body = undefined;
  if (config.payload) {
    try {
      body = JSON.parse(config.payload);
    } catch {
      body = { message: config.payload };
    }
  }
  return {
    actionType,
    url: config.target,        // ⚠️ 'target' → 'url'
    method: config.method || 'GET',
    body,                      // ⚠️ 'payload' → 'body'
    subject: config.subject,
    retryPolicy: config.retry_policy,
  };
}

// For other types:
return {
  actionType,
  to: config.target,          // ⚠️ 'target' → 'to'
  subject: config.subject,
  body: config.payload,       // ⚠️ 'payload' → 'body'
  message: config.payload,    // ⚠️ Also as 'message' for Slack
  channel: config.target,     // ⚠️ 'target' → 'channel' for Slack
  retryPolicy: config.retry_policy,
};
```

### Analysis

#### HTTP Request Action
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| action_type='webhook' | ✅ Select option | actionType='http_request' | ✅ Mapped | ✅ MATCH |
| target | ✅ Required text | url (string) [REQUIRED] | ✅ Converted | ✅ MATCH |
| method | ❌ MISSING | method (default: 'GET') | ⚠️ Uses default | ⚠️ MISSING |
| payload | ✅ Optional textarea | body (any) | ✅ Converted + JSON parsed | ✅ MATCH |
| headers | ❌ MISSING | headers (optional) | ❌ Not available | ❌ MISSING |
| queryParams | ❌ MISSING | queryParams (optional) | ❌ Not available | ❌ MISSING |
| timeoutMs | ❌ MISSING | timeoutMs (optional) | ❌ Not available | ❌ MISSING |
| parseResponse | ❌ MISSING | parseResponse (default: true) | ❌ Not available | ❌ MISSING |

#### Email Action
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| action_type='email' | ✅ Select option | actionType='email' | ✅ Direct | ✅ MATCH |
| target | ✅ Required text | to (string/string[]) [REQUIRED] | ✅ Converted | ✅ MATCH |
| subject | ✅ Optional text | subject [REQUIRED] | ✅ Included | ⚠️ Should be REQUIRED in frontend |
| payload | ✅ Optional textarea | body [REQUIRED] | ✅ Converted | ⚠️ Should be REQUIRED in frontend |
| from | ❌ MISSING | from (optional) | ❌ Not available | ⚠️ MISSING |
| isHtml | ❌ MISSING | isHtml (default: true) | ❌ Not available | ⚠️ MISSING |

#### Slack Action
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| action_type='slack' | ✅ Select option | actionType='slack' | ✅ Direct | ✅ MATCH |
| target | ✅ Required text | channel [REQUIRED] | ✅ Converted | ✅ MATCH |
| payload | ✅ Optional textarea | message [REQUIRED] | ✅ Converted | ⚠️ Should be REQUIRED in frontend |

#### Log Action
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| (no explicit option) | ❌ Not in select | actionType='log' | Uses default | ⚠️ MISSING OPTION |
| payload? | ✅ Optional textarea | message (optional) | ✅ Converted | ✅ MATCH |

#### Transform Action
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| (no explicit option) | ❌ Not in select | actionType='transform' | ❌ Cannot select | ❌ MISSING |
| - | - | transformType [REQUIRED] | ❌ Not available | ❌ MISSING |
| - | - | keys, sourceKey, mapping | ❌ Not available | ❌ MISSING |

#### CRM Update & Notification Actions
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| action_type='crm_update' | ✅ Select option | actionType='crm_update' | ✅ Direct | ⚠️ No specific fields |
| action_type='notification' | ✅ Select option | actionType='notification' | ✅ Direct | ⚠️ No specific fields |
| target, payload | ✅ Generic fields | Generic config | ✅ Passed through | ⚠️ Incomplete |

**Critical Issues:**
1. ❌ **HTTP Request**: Missing method selector, headers, queryParams, timeout config
2. ❌ **Email**: subject/body should be REQUIRED, missing from/isHtml fields
3. ❌ **Slack**: message should be REQUIRED
4. ❌ **Transform Action**: Completely missing from frontend UI
5. ❌ **Log Action**: Not available as explicit option
6. ⚠️ **CRM Update/Notification**: Have generic fields but no action-specific configuration

---

## 3. WAIT NODE

### Frontend Schema
```typescript
type: 'wait'
fields: {
  wait_type: select (duration|signal|datetime) [REQUIRED]
  duration_value: number (min: 1)
  duration_unit: select (seconds|minutes|hours|days, default: 'hours')
  signal_name: text
  timeout_enabled: toggle (default: true)
  timeout_hours: number (1-720, default: 24)
}
```

### Backend Requirements (`wait.executor.ts`)
```typescript
Config Expected: {
  waitType: 'duration' | 'until' | 'event' | 'user_reply' | 'call_end'
  // Varies by waitType...
}

Wait Type Specific Fields:

1. 'duration':
   - duration: number [REQUIRED]
   - unit: 'ms'|'seconds'|'s'|'minutes'|'m'|'hours'|'h'|'days'|'d'

2. 'until':
   - until: string [REQUIRED] - ISO date string

3. 'event':
   - eventType: string [REQUIRED]
   - eventFilter: Record<string, unknown>
   - timeout: number (milliseconds)
   - timeoutAction: 'fail'|'continue' (default: 'fail')

4. 'user_reply':
   - channel: string (default: 'any')
   - contactId: string (from config or context.variables)
   - timeout: number (milliseconds)
   - timeoutAction: 'fail'|'continue' (default: 'continue')

5. 'call_end':
   - callId: string (from config or context.variables)
   - timeout: number (default: 3600000 = 1 hour)
```

### Frontend Transformation (`orchestrator.ts` lines 274-280)
```typescript
return {
  waitType: config.wait_type || 'duration',
  duration: config.duration_value || 5,
  unit: config.duration_unit || 'seconds',
  signalName: config.signal_name,
  timeout: config.timeout_enabled ? (config.timeout_hours * 60 * 60 * 1000) : undefined,
};
```

### Analysis

#### Duration Wait
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| wait_type='duration' | ✅ Select option | waitType='duration' | ✅ Converted | ✅ MATCH |
| duration_value | ✅ Optional number | duration [REQUIRED] | ✅ Converted (default: 5) | ⚠️ Should be REQUIRED |
| duration_unit | ✅ Select with default | unit (string) | ✅ Converted | ✅ MATCH |

#### Signal/Event Wait
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| wait_type='signal' | ✅ Select option | waitType='event' | ⚠️ Mapping mismatch | ⚠️ MISMATCH |
| signal_name | ✅ Optional text | eventType [REQUIRED] | ✅ As 'signalName' | ❌ WRONG KEY |
| - | ❌ MISSING | eventFilter (optional) | ❌ Not available | ❌ MISSING |
| timeout_hours | ✅ Optional number | timeout (milliseconds) | ✅ Converted to ms | ✅ MATCH |
| - | ❌ MISSING | timeoutAction ('fail'|'continue') | ❌ Not available | ❌ MISSING |

#### DateTime Wait (Until)
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| wait_type='datetime' | ✅ Select option | waitType='until' | ❌ Wrong mapping | ❌ MISMATCH |
| - | ❌ MISSING | until: ISO string [REQUIRED] | ❌ Not available | ❌ MISSING |

#### User Reply Wait
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| (not available) | ❌ Not in select | waitType='user_reply' | ❌ Cannot select | ❌ MISSING |
| - | ❌ MISSING | channel, contactId, timeout | ❌ Not available | ❌ MISSING |

#### Call End Wait
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| (not available) | ❌ Not in select | waitType='call_end' | ❌ Cannot select | ❌ MISSING |
| - | ❌ MISSING | callId, timeout | ❌ Not available | ❌ MISSING |

**Critical Issues:**
1. ❌ **Signal vs Event**: Frontend has 'signal' but backend expects 'event' - wrong waitType mapping
2. ❌ **Signal Name**: Frontend sends 'signalName' but backend expects 'eventType'
3. ❌ **DateTime**: Frontend has 'datetime' option but transformation doesn't map to 'until' waitType
4. ❌ **DateTime**: No field to input the actual datetime value
5. ❌ **User Reply**: Completely missing from frontend (important for conversational workflows)
6. ❌ **Call End**: Completely missing from frontend (important for telephony workflows)
7. ❌ **Event Filter**: No way to specify event filtering criteria
8. ❌ **Timeout Action**: No way to choose what happens on timeout (fail vs continue)

---

## 4. DECISION/CONDITION NODE

### Frontend Schema
```typescript
type: 'decision'
fields: {
  condition_type: select (field_equals|field_contains|field_exists|expression) [REQUIRED]
  field_name: text
  operator: select (equals|not_equals|greater_than|less_than|contains|starts_with)
  compare_value: text
  true_label: text (default: 'Yes')
  false_label: text (default: 'No')
}
```

### Backend Requirements (`condition.executor.ts`)
```typescript
Config Expected: {
  conditions: ConditionConfig[] [REQUIRED] - Array of conditions
  defaultPath: string (nodeId)
  evaluateAll: boolean (default: false)
}

ConditionConfig Interface:
{
  type: 'expression' | 'field_comparison' | 'exists' | 'ai_confidence'
  targetNodeId: string [REQUIRED]
  
  // For 'expression':
  expression: string [REQUIRED]
  
  // For 'field_comparison':
  field: string [REQUIRED]
  operator: string [REQUIRED]
  value: unknown [REQUIRED]
  
  // For 'exists':
  field: string [REQUIRED]
  
  // For 'ai_confidence':
  field: string (default: 'confidence')
  threshold: number (default: 0.8)
  operator: string (default: '>=')
}

Supported Operators:
- '==', '===', '!=', '!==', '>', '>=', '<', '<=', 'contains', 'startsWith', 'endsWith'
```

### Frontend Transformation (`orchestrator.ts` lines 282-306)
```typescript
const operatorMap = {
  'equals': '==',
  'not_equals': '!=',
  'greater_than': '>',
  'less_than': '<',
  'greater_or_equal': '>=',
  'less_or_equal': '<=',
  'contains': 'contains',
  'starts_with': 'startsWith',
};
const backendOperator = operatorMap[config.operator] || config.operator || '==';

return {
  conditionType: config.condition_type || 'expression',
  conditions: [
    {
      type: config.condition_type === 'field_exists' ? 'field_exists' : 'field_comparison',
      field: config.field_name,
      operator: backendOperator,
      value: config.compare_value,
    },
  ],
  defaultPath: null,
  // AI-specific fields:
  aiTask: config.ai_task,
  prompt: config.prompt,
  confidenceThreshold: config.confidence_threshold,
  fallbackAction: config.fallback_action,
  model: config.model,
};
```

### Analysis
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| condition_type | ✅ Select (4 types) | type in conditions array | ⚠️ Partial mapping | ⚠️ INCOMPLETE |
| field_name | ✅ Optional text | field [REQUIRED in condition] | ✅ Converted | ⚠️ Should be REQUIRED |
| operator | ✅ Select (6 types) | operator (10 types) | ✅ Mapped | ⚠️ Missing 'endsWith', '>=', '<=' |
| compare_value | ✅ Optional text | value [REQUIRED] | ✅ Included | ⚠️ Should be REQUIRED |
| conditions[] | ❌ Single condition only | Array of conditions | ⚠️ Wraps in array | ⚠️ LIMITED |
| defaultPath | ❌ MISSING | defaultPath (nodeId) | ❌ Set to null | ❌ MISSING |
| evaluateAll | ❌ MISSING | evaluateAll (boolean) | ❌ Not available | ❌ MISSING |
| targetNodeId | ❌ MISSING | targetNodeId in each condition | ❌ Not included | ❌ CRITICAL |
| true_label/false_label | ✅ Text fields | - | ❌ Not used by backend | ⚠️ UI ONLY |
| ai_confidence type | ❌ Not in select | type='ai_confidence' | ❌ Cannot select | ❌ MISSING |

**Critical Issues:**
1. ❌ **Target Node ID**: Backend requires targetNodeId in each condition, but frontend doesn't provide it
2. ❌ **Multiple Conditions**: Frontend only supports one condition, backend expects array with multiple
3. ❌ **Default Path**: No way to specify default/else path when no conditions match
4. ❌ **Evaluate All**: No way to specify if all conditions should be evaluated (short-circuit logic)
5. ❌ **AI Confidence**: Backend supports AI confidence routing but not available in frontend
6. ⚠️ **Operator Coverage**: Missing 'endsWith', '>=', '<=' from frontend UI
7. ⚠️ **Field/Value Required**: Frontend treats these as optional, backend requires them

---

## 5. AI ROUTER NODE

### Frontend Schema
```typescript
type: 'ai_router'
fields: {
  prompt: textarea [REQUIRED] - "Natural Language Query"
  task: select (generate_mongo_query|classify_intent|extract_data|custom) [REQUIRED]
  confidence_threshold: slider (0-100, step: 5, default: 80)
  fallback_action: select (human_review|default_path|error, default: 'human_review')
  system_prompt: textarea - "System Prompt (Optional)"
  context_collections: text - "Available Collections (comma-separated)"
}
```

### Backend Requirements (`ai-router.executor.ts`)
```typescript
Config Interface: AIRouterConfig {
  prompt: string [REQUIRED]
  task: 'generate_mongo_query' | 'classify_intent' | 'extract_data' | 'custom' [REQUIRED]
  systemPrompt?: string
  confidenceThreshold?: number (default: 0.8)
  
  context?: {
    availableCollections?: string[]
    sampleDocuments?: Record<string, unknown>[]
    customInstructions?: string
  }
  
  fallbackAction?: 'human_review' | 'default_path' | 'error'
}

Output Interface: AIRouterOutput {
  intent: string
  confidence: number
  task: string
  mongoQuery?: MongoQuerySchema
  extractedData?: Record<string, unknown>
  classification?: string
  routing: {
    path: 'high_confidence' | 'low_confidence' | 'human_review'
    reason: string
  }
}
```

### Frontend Transformation
❌ **Not transformed** - AI Router is not in the transformation switch case

### Analysis
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| prompt | ✅ Required textarea | prompt [REQUIRED] | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| task | ✅ Required select (4 types) | task (4 types) [REQUIRED] | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| confidence_threshold | ✅ Slider (0-100) | confidenceThreshold (0-1) | ❌ No conversion | ❌ SCALE MISMATCH |
| fallback_action | ✅ Select (3 options) | fallbackAction (3 options) | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| system_prompt | ✅ Optional textarea | systemPrompt (optional) | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| context_collections | ✅ Text (comma-sep) | context.availableCollections (array) | ❌ No parsing | ❌ TYPE MISMATCH |
| - | ❌ MISSING | context.sampleDocuments | ❌ Not available | ❌ MISSING |
| - | ❌ MISSING | context.customInstructions | ❌ Not available | ❌ MISSING |

**Critical Issues:**
1. ❌ **No Transformation**: AI Router config is not transformed at all in orchestrator.ts
2. ❌ **Confidence Scale**: Frontend uses 0-100 slider, backend expects 0-1 decimal
3. ❌ **Context Collections**: Frontend has comma-separated string, backend expects array
4. ❌ **Context Object**: Backend expects nested context object with multiple fields
5. ❌ **Sample Documents**: No way to provide sample documents for better AI context
6. ❌ **Custom Instructions**: Field exists in frontend but not structured properly

---

## 6. APPROVAL NODE

### Frontend Schema
```typescript
type: 'approval'
fields: {
  approval_type: select (single|any|all|majority) [REQUIRED]
  approvers: text [REQUIRED] - "Email addresses (comma-separated)"
  title: text [REQUIRED]
  message: textarea
  timeout_config: section {
    timeout_enabled: toggle (default: true)
    timeout_hours: number (1-168, default: 24)
    timeout_action: select (auto_approve|auto_reject|escalate, default: 'escalate')
  }
}
```

### Backend Requirements (`approval.executor.ts`)
```typescript
Config Expected: {
  title: string (default: auto-generated)
  description: string
  assignedTo: string[] (default: [context.variables.createdBy || 'admin'])
  escalateTo: string[]
  timeout: number (milliseconds)
  timeoutAction: 'fail' | 'escalate' | 'auto_approve' | 'auto_reject' (default: 'fail')
  includeFields: string[] - Fields from previous outputs to include
  additionalData: Record<string, unknown>
}

Resume Condition Created:
{
  type: 'approval'
  approvalTaskId: string
  assignedTo: string[]
  timeout: number
  timeoutAction: string
  escalateTo: string[]
}
```

### Frontend Transformation (`orchestrator.ts` lines 308-316)
```typescript
return {
  approvalType: config.approval_type || 'single',
  approvers: typeof config.approvers === 'string'
    ? config.approvers.split(',').map(s => s.trim())
    : config.approvers || [],
  title: config.title,
  message: config.message,
  timeout: config.timeout_config,
};
```

### Analysis
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| approval_type | ✅ Select (4 types) | - | ✅ Converted | ❌ NOT USED BY BACKEND |
| approvers | ✅ Required text | assignedTo (string[]) | ✅ Split & trimmed | ⚠️ WRONG KEY |
| title | ✅ Required text | title (with default) | ✅ Direct | ✅ MATCH |
| message | ✅ Optional textarea | description | ⚠️ Wrong key | ⚠️ KEY MISMATCH |
| timeout_config.timeout_hours | ✅ Number (1-168) | timeout (milliseconds) | ⚠️ Nested object sent | ❌ NOT CONVERTED |
| timeout_config.timeout_action | ✅ Select (3 types) | timeoutAction (4 types) | ⚠️ Nested object sent | ❌ NOT EXTRACTED |
| timeout_config.timeout_enabled | ✅ Toggle | - | ⚠️ Nested object sent | ❌ NOT USED |
| - | ❌ MISSING | escalateTo (string[]) | ❌ Not available | ❌ MISSING |
| - | ❌ MISSING | includeFields (string[]) | ❌ Not available | ❌ MISSING |
| - | ❌ MISSING | additionalData (object) | ❌ Not available | ❌ MISSING |

**Critical Issues:**
1. ❌ **Approvers vs AssignedTo**: Frontend sends 'approvers', backend expects 'assignedTo'
2. ❌ **Message vs Description**: Frontend sends 'message', backend expects 'description'
3. ❌ **Timeout Config**: Sent as nested object, backend expects flat fields
4. ❌ **Timeout Conversion**: Frontend hours not converted to milliseconds
5. ❌ **Timeout Action**: Not extracted from nested config
6. ❌ **Approval Type**: Frontend sends it but backend doesn't use it (logic not implemented)
7. ❌ **Escalate To**: No way to specify escalation recipients
8. ❌ **Include Fields**: No way to specify which fields to include in approval data
9. ⚠️ **Timeout Action Values**: Frontend has 3 options, backend supports 4 ('fail' is missing)

---

## 7. MONGODB NODE

### Frontend Schema
```typescript
type: 'mongodb'
fields: {
  database: text [REQUIRED]
  collection: text [REQUIRED]
  operation: select (find|findOne|aggregate|count) [REQUIRED, default: 'find']
  use_ai_query: toggle (default: false)
  ai_query_source: text - "{{ai_router_node.mongoQuery}}"
  query: textarea - "Query Filter (JSON)"
  projection: textarea - "Projection (JSON)"
  sort: textarea - "Sort (JSON)"
  limit: number (1-10000, default: 100)
}
```

### Backend Requirements (`mongodb.executor.ts`)
```typescript
Config Interface: MongoDBConfig {
  connectionString?: string
  database: string [REQUIRED]
  collection: string [REQUIRED]
  operation: 'find' | 'findOne' | 'aggregate' | 'count' [REQUIRED]
  
  // For find/findOne/count:
  query?: Record<string, unknown>
  
  // For aggregate:
  pipeline?: Record<string, unknown>[]
  
  // Query options:
  projection?: Record<string, number>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
  
  // AI Query integration:
  useQueryFrom?: string - Path to previous node output
}

Output Interface: MongoDBOutput {
  success: boolean
  operation: string
  collection: string
  resultCount: number
  result: unknown
  executedQuery: Record<string, unknown>
}
```

### Frontend Transformation
❌ **Not transformed** - MongoDB is not in the transformation switch case

### Analysis
| Field | Frontend | Backend Expected | Transformation | Status |
|-------|----------|------------------|----------------|--------|
| database | ✅ Required text | database [REQUIRED] | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| collection | ✅ Required text | collection [REQUIRED] | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| operation | ✅ Select (4 types) | operation (4 types) | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| use_ai_query | ✅ Toggle | - | ❌ No transformation | ⚠️ UI ONLY |
| ai_query_source | ✅ Text | useQueryFrom (string) | ❌ Wrong key | ⚠️ KEY MISMATCH |
| query | ✅ Textarea (JSON) | query (object) | ❌ No JSON parsing | ❌ TYPE MISMATCH |
| projection | ✅ Textarea (JSON) | projection (object) | ❌ No JSON parsing | ❌ TYPE MISMATCH |
| sort | ✅ Textarea (JSON) | sort (object) | ❌ No JSON parsing | ❌ TYPE MISMATCH |
| limit | ✅ Number (1-10000) | limit (number) | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| - | ❌ MISSING | connectionString | ❌ Not available | ⚠️ USES ENV/SECRETS |
| - | ❌ MISSING | skip (number) | ❌ Not available | ❌ MISSING |
| - | ❌ MISSING | pipeline (for aggregate) | ❌ Not available | ❌ MISSING |

**Critical Issues:**
1. ❌ **No Transformation**: MongoDB config not transformed in orchestrator.ts
2. ❌ **JSON Parsing**: query, projection, sort are strings but backend expects objects
3. ❌ **AI Query Key**: Frontend uses 'ai_query_source', backend expects 'useQueryFrom'
4. ❌ **Pipeline**: No field for aggregate pipeline (critical for aggregate operation)
5. ❌ **Skip**: Missing pagination skip field
6. ⚠️ **Connection String**: No frontend field (uses env/secrets, which is OK)
7. ⚠️ **Use AI Query**: Toggle exists but logic to use it is not in transformation

---

## 8. QUERY RECORDS NODE

### Frontend Schema
```typescript
type: 'query_records'
fields: {
  resource: select (accounts|leads|tickets|contacts|deals|tasks) [REQUIRED]
  operation: select (list|get|create|update|delete) [REQUIRED]
  limit: number (1-1000, default: 10)
  filter_field: text
  filter_value: text
  sort_by: text
  sort_order: select (asc|desc, default: 'desc')
}
```

### Backend Requirements
❌ **No Backend Executor** - There is no `query-records.executor.ts` file

### Analysis
| Feature | Status |
|---------|--------|
| Frontend Schema | ✅ Fully defined |
| Backend Executor | ❌ **MISSING** |
| Transformation | ❌ Not in orchestrator.ts |

**Critical Issues:**
1. ❌ **No Backend Implementation**: Query Records node exists in frontend but has no backend executor
2. ❌ **No Transformation**: Not handled in orchestrator.ts transformation logic
3. ⚠️ **Business OS Integration**: This appears to be for internal Business OS data access but is not implemented

---

## 9. ITERATOR/LOOP NODE

### Frontend Schema: Iterator
```typescript
type: 'iterator'
fields: {
  list_source: text [REQUIRED] - "{{query_node.data}}"
  item_variable: text (default: 'item')
  index_variable: text (default: 'index')
  max_iterations: number (1-10000, default: 100)
  continue_on_error: toggle (default: true)
  parallel_execution: toggle (default: false)
  batch_size: number (1-50, default: 5) - "Batch Size (if parallel)"
}
```

### Backend: Loop Executor
```typescript
// Note: Backend has 'loop', not 'iterator'
type: NodeType.LOOP

Config Expected: {
  loopType: 'forEach' | 'while' | 'times' [REQUIRED]
  maxIterations: number (default: 1000)
  
  // For forEach:
  collection: string [REQUIRED] - Path to array
  itemVariable: string (default: 'item')
  indexVariable: string (default: 'index')
  
  // For times:
  count: number [REQUIRED]
  indexVariable: string (default: 'index')
  
  // For while:
  condition: string [REQUIRED] - Expression to evaluate
  indexVariable: string (default: 'index')
}

Internal State (in token):
- _loopIndex: number (current iteration)
- _loopStarted: boolean
- _loopContinue: boolean
- _nextLoopIndex: number
- _loopEnd: boolean
```

### Frontend Transformation
❌ **Not transformed** - Iterator is not in the transformation switch case

### Analysis
| Field | Frontend (iterator) | Backend (loop) | Transformation | Status |
|-------|---------------------|----------------|----------------|--------|
| type | 'iterator' | NodeType.LOOP | ❌ No mapping | ❌ TYPE MISMATCH |
| list_source | ✅ Required text | collection [REQUIRED] | ❌ Wrong key | ⚠️ KEY MISMATCH |
| - | ❌ Implicit forEach | loopType [REQUIRED] | ❌ Not specified | ❌ MISSING |
| item_variable | ✅ Text (default: 'item') | itemVariable | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| index_variable | ✅ Text (default: 'index') | indexVariable | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| max_iterations | ✅ Number (1-10000) | maxIterations | ❌ No transformation | ⚠️ MISSING TRANSFORM |
| continue_on_error | ✅ Toggle | - | ❌ Not used | ❌ NOT IN BACKEND |
| parallel_execution | ✅ Toggle | - | ❌ Not used | ❌ NOT IN BACKEND |
| batch_size | ✅ Number | - | ❌ Not used | ❌ NOT IN BACKEND |
| - | ❌ No while option | loopType='while' + condition | ❌ Not available | ❌ MISSING |
| - | ❌ No times option | loopType='times' + count | ❌ Not available | ❌ MISSING |

**Critical Issues:**
1. ❌ **Type Name Mismatch**: Frontend calls it 'iterator', backend calls it 'loop' (NodeType.LOOP)
2. ❌ **No Transformation**: Iterator config not transformed in orchestrator.ts
3. ❌ **Loop Type Missing**: Frontend doesn't specify loopType (implicitly forEach)
4. ❌ **Key Mismatch**: 'list_source' vs 'collection'
5. ❌ **While Loop**: Backend supports while loops, frontend doesn't
6. ❌ **Times Loop**: Backend supports count-based loops, frontend doesn't
7. ❌ **Parallel Execution**: Frontend has parallel options, backend doesn't support them
8. ❌ **Continue on Error**: Frontend has this, backend doesn't support it

---

## 10. SPLIT NODE

### Frontend Schema
❌ **Not in nodeSchemas.ts** - Split node is missing from frontend

### Backend Requirements (`split.executor.ts`)
```typescript
type: NodeType.SPLIT

Config Expected: {
  branches: string[] - IDs of branch nodes
  waitForAll: boolean - Whether to wait for all (handled by Join)
}

Output Signals:
{
  splitAt: ISO string
  branchCount: number
  branches: string[]
  _parallelFork: true  // Signal to orchestrator
}
```

### Analysis
| Feature | Status |
|---------|--------|
| Frontend Schema | ❌ **COMPLETELY MISSING** |
| Backend Executor | ✅ Fully implemented |
| Transformation | ❌ Not in orchestrator.ts |

**Critical Issues:**
1. ❌ **No Frontend Schema**: Split node completely missing from nodeSchemas.ts
2. ❌ **Cannot Create**: Users cannot create split nodes in visual builder
3. ⚠️ **Backend Ready**: Backend fully supports parallel execution but frontend doesn't expose it

---

## 11. JOIN NODE

### Frontend Schema
❌ **Not in nodeSchemas.ts** - Join node is missing from frontend

### Backend Requirements (`join.executor.ts`)
```typescript
type: NodeType.JOIN

Config Expected: {
  expectedBranches: number (default: 2) - How many branches to wait for
  mergeStrategy: 'all' | 'first' | 'any' (default: 'all')
  requiredCount: number - For 'any' strategy
}

Input Expected (in token.data):
{
  _completedBranches: string[] - IDs of completed branches
  _branchOutputs: Record<string, unknown> - Outputs from each branch
}

Output Signals:
{
  joinedAt: ISO string
  branchCount: number
  mergeStrategy: string
  mergedOutput: Record<string, unknown>
  _parallelJoin: true  // Signal to orchestrator
}
```

### Analysis
| Feature | Status |
|---------|--------|
| Frontend Schema | ❌ **COMPLETELY MISSING** |
| Backend Executor | ✅ Fully implemented |
| Transformation | ❌ Not in orchestrator.ts |

**Critical Issues:**
1. ❌ **No Frontend Schema**: Join node completely missing from nodeSchemas.ts
2. ❌ **Cannot Create**: Users cannot create join nodes in visual builder
3. ❌ **No Parallel Control**: Without Split/Join, no way to do parallel execution
4. ⚠️ **Backend Ready**: Backend has sophisticated join strategies but frontend doesn't expose them

---

## 12. END NODE

### Frontend Schema
❌ **Not in nodeSchemas.ts** - End node is missing from frontend

### Backend Requirements (`end.executor.ts`)
```typescript
type: NodeType.END

Config Expected: {
  outputMapping: Record<string, string> - Map source keys to target keys
  includeAllOutputs: boolean (default: false)
}

Output Signals:
{
  endedAt: ISO string
  finalOutput: Record<string, unknown>
  _workflowEnd: true  // Signal to orchestrator
}
```

### Analysis
| Feature | Status |
|---------|--------|
| Frontend Schema | ❌ **COMPLETELY MISSING** |
| Backend Executor | ✅ Fully implemented |
| Transformation | ❌ Not in orchestrator.ts |

**Critical Issues:**
1. ❌ **No Frontend Schema**: End node completely missing from nodeSchemas.ts
2. ❌ **No Explicit Termination**: No way to explicitly mark workflow end in UI
3. ⚠️ **Implicit End**: Backend likely infers end nodes (nodes with no outgoing edges)

---

## 13. AI ACTION NODE

### Frontend Schema
```typescript
type: 'ai_action'
fields: {
  instruction: textarea [REQUIRED] - "What should AI do?"
  target_plugin: select [REQUIRED] - (core_crm|hr_module|gmail_plugin|slack_plugin|calendar_plugin|analytics_plugin|billing_plugin)
  risk_level: select [REQUIRED] - (read_only|allow_actions|full_access, default: 'read_only')
  context_data: textarea - "Context Data"
  require_confirmation: toggle (default: true)
  fallback_behavior: select (ask_human|skip|use_default|retry, default: 'ask_human')
  max_retries: number (0-5, default: 2)
}
```

### Backend Requirements
❌ **No Backend Executor** - There is no `ai-action.executor.ts` file

### Analysis
| Feature | Status |
|---------|--------|
| Frontend Schema | ✅ Fully defined |
| Backend Executor | ❌ **MISSING** |
| Transformation | ❌ Not in orchestrator.ts |

**Critical Issues:**
1. ❌ **No Backend Implementation**: AI Action node exists in frontend but has no backend executor
2. ❌ **No Transformation**: Not handled in orchestrator.ts
3. ⚠️ **Plugin System**: References plugin system that may not be implemented yet

---

## 14. AI DECISION NODE

### Frontend Schema
```typescript
type: 'ai_decision'
fields: {
  ai_task: select (classify|sentiment|extract|generate|custom) [REQUIRED]
  prompt: textarea [REQUIRED] - "AI Instructions"
  confidence_threshold: slider (0-100, step: 5, default: 80)
  fallback_action: select (human_review|retry|default_path, default: 'human_review')
  model: select (gpt-4|gpt-3.5-turbo|claude-3, default: 'gpt-4')
}
```

### Backend Mapping
⚠️ **Mapped to Condition** - Frontend transformation maps `ai_decision` → `condition` type

```typescript
// From orchestrator.ts line 208:
private mapNodeType(frontendType: string): string {
  const typeMap: Record<string, string> = {
    'ai_decision': 'condition',  // ⚠️ Loses AI-specific functionality
    'decision': 'condition',
  };
  return typeMap[frontendType] || frontendType;
}
```

### Analysis
| Feature | Frontend | Backend | Status |
|---------|----------|---------|--------|
| Type | 'ai_decision' | Mapped to 'condition' | ⚠️ LOSES CONTEXT |
| AI-specific config | ✅ Has ai_task, model, prompt | ❌ Condition executor doesn't use | ❌ IGNORED |
| Condition executor | - | Has 'ai_confidence' type | ⚠️ Different purpose |

**Critical Issues:**
1. ⚠️ **Wrong Mapping**: ai_decision mapped to generic condition executor
2. ❌ **Lost Functionality**: AI-specific fields (ai_task, model, prompt) are sent but condition executor doesn't use them
3. ⚠️ **Separate Concept**: ai_decision should probably use ai-router.executor, not condition.executor
4. ❌ **Confidence Type**: Backend condition executor has 'ai_confidence' condition type, but that's for evaluating confidence from previous AI outputs, not making AI decisions

---

## SUMMARY OF ISSUES

### 🔴 Critical Issues (Blocking Functionality)

1. **TRIGGER NODE**
   - ✅ No critical issues

2. **ACTION NODE**
   - ❌ HTTP Request: Missing method, headers, queryParams, timeout fields
   - ❌ Email: subject/body should be required; missing from, isHtml
   - ❌ Transform: Action type completely missing from frontend
   - ❌ Log: Not available as explicit action type option

3. **WAIT NODE**
   - ❌ Signal wait: Frontend 'signal_name' doesn't map to backend 'eventType'
   - ❌ DateTime wait: No field for actual datetime value
   - ❌ User Reply wait: Completely missing (critical for conversational workflows)
   - ❌ Call End wait: Completely missing (critical for telephony)

4. **DECISION/CONDITION NODE**
   - ❌ targetNodeId: Not provided, but REQUIRED for routing
   - ❌ Multiple conditions: Frontend only supports one, backend needs array
   - ❌ defaultPath: No way to specify else/default path

5. **AI ROUTER NODE**
   - ❌ No transformation: Not handled in orchestrator.ts at all
   - ❌ Confidence scale: Frontend 0-100, backend 0-1
   - ❌ Context parsing: comma-separated string not parsed to array

6. **APPROVAL NODE**
   - ❌ Key mismatches: 'approvers'→'assignedTo', 'message'→'description'
   - ❌ Timeout not converted: Hours not converted to milliseconds
   - ❌ Nested config: timeout_config not flattened

7. **MONGODB NODE**
   - ❌ No transformation: Not handled in orchestrator.ts
   - ❌ JSON not parsed: query, projection, sort sent as strings
   - ❌ Pipeline missing: No field for aggregate pipeline

8. **QUERY RECORDS NODE**
   - ❌ No backend executor: Frontend-only, not implemented

9. **ITERATOR/LOOP NODE**
   - ❌ Type mismatch: 'iterator' vs 'loop'
   - ❌ No transformation: Not handled in orchestrator.ts
   - ❌ Key mismatch: 'list_source' vs 'collection'
   - ❌ Loop types: Frontend only forEach, backend has while/times

10. **SPLIT NODE**
    - ❌ Completely missing from frontend

11. **JOIN NODE**
    - ❌ Completely missing from frontend

12. **END NODE**
    - ❌ Completely missing from frontend

13. **AI ACTION NODE**
    - ❌ No backend executor: Frontend-only, not implemented

14. **AI DECISION NODE**
    - ❌ Wrong mapping: Mapped to condition, loses AI functionality

### ⚠️ Warning Issues (Partial Functionality)

1. Field requirement mismatches (optional vs required)
2. Default value handling inconsistencies
3. Operator coverage gaps (missing some operators in frontend)
4. Scale/unit mismatches (0-100 vs 0-1, hours vs milliseconds)
5. Nested config structures not properly flattened

### 📊 Statistics

- **Total Node Types in Frontend**: 14
- **Total Node Types in Backend**: 12
- **Fully Working**: 1 (Trigger only)
- **Partially Working**: 6
- **Not Working**: 7
- **Missing from Frontend**: 3 (Split, Join, End)
- **Missing from Backend**: 2 (Query Records, AI Action)

### 🎯 Priority Fixes Needed

**Immediate (P0):**
1. Add transformations for MongoDB, AI Router, Iterator in orchestrator.ts
2. Fix Approval node key mismatches and nested config
3. Add targetNodeId to Condition/Decision config
4. Fix Wait node signal→event mapping

**High Priority (P1):**
5. Add Split, Join, End nodes to frontend
6. Implement Query Records and AI Action backend executors
7. Add missing fields to Action node (method, headers for HTTP)
8. Add User Reply and Call End wait types

**Medium Priority (P2):**
9. Fix confidence scale (0-100 → 0-1) for AI Router
10. Add multiple conditions support to Decision node
11. Add Transform action type to frontend
12. Add while/times loop types to frontend

**Low Priority (P3):**
13. Add missing operators to frontend dropdowns
14. Add parallel execution support to Loop/Iterator
15. Standardize all snake_case → camelCase transformations
16. Add proper AI Decision executor (don't map to Condition)
