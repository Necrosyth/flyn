 # Quick Fix Checklist for Frontend-Backend Config Issues

## 🚨 Critical Path Fixes (Block Execution)

### 1. orchestrator.ts Transformation Additions
**File:** `flyn-platform/frontend/src/services/orchestrator.ts`

Add these cases to `transformNodeConfig()` method:

```typescript
case 'mongodb':
    return {
        database: config.database || process.env.MONGODB_DEFAULT_DATABASE,
        collection: config.collection,
        operation: config.operation,
        query: config.query ? JSON.parse(config.query as string) : undefined,
        projection: config.projection ? JSON.parse(config.projection as string) : undefined,
        sort: config.sort ? JSON.parse(config.sort as string) : undefined,
        limit: config.limit,
        useQueryFrom: config.use_ai_query ? config.ai_query_source : undefined,
    };

case 'ai_router':
    return {
        prompt: config.prompt,
        task: config.task,
        systemPrompt: config.system_prompt,
        confidenceThreshold: (config.confidence_threshold as number || 80) / 100,  // Convert 0-100 to 0-1
        context: {
            availableCollections: config.context_collections 
                ? (config.context_collections as string).split(',').map(s => s.trim())
                : undefined,
        },
        fallbackAction: config.fallback_action,
    };

case 'iterator':
    return {
        loopType: 'forEach',  // Frontend iterator is always forEach
        collection: config.list_source,  // Rename list_source → collection
        itemVariable: config.item_variable || 'item',
        indexVariable: config.index_variable || 'index',
        maxIterations: config.max_iterations || 100,
    };
```

### 2. Approval Node Fix
**File:** `flyn-platform/frontend/src/services/orchestrator.ts`

Replace approval transformation (lines 308-316):

```typescript
case 'approval':
    // Extract timeout config
    const timeoutConfig = config.timeout_config as Record<string, unknown> || {};
    const timeoutHours = timeoutConfig.timeout_hours as number || 24;
    const timeoutMs = timeoutConfig.timeout_enabled ? timeoutHours * 60 * 60 * 1000 : undefined;
    
    return {
        assignedTo: typeof config.approvers === 'string'  // Fix: approvers → assignedTo
            ? config.approvers.split(',').map((s: string) => s.trim())
            : config.approvers || [],
        title: config.title,
        description: config.message,  // Fix: message → description
        timeout: timeoutMs,  // Fix: Convert hours to milliseconds
        timeoutAction: timeoutConfig.timeout_action || 'fail',  // Fix: Extract from nested config
    };
```

### 3. Wait Node Signal Fix
**File:** `flyn-platform/frontend/src/services/orchestrator.ts`

Replace wait transformation (lines 274-280):

```typescript
case 'wait':
    const waitType = config.wait_type || 'duration';
    
    // Map frontend wait types to backend
    let backendWaitType = waitType;
    if (waitType === 'signal') {
        backendWaitType = 'event';  // Fix: signal → event
    } else if (waitType === 'datetime') {
        backendWaitType = 'until';  // Fix: datetime → until
    }
    
    return {
        waitType: backendWaitType,
        duration: config.duration_value || 5,
        unit: config.duration_unit || 'seconds',
        eventType: config.signal_name,  // Fix: signalName → eventType
        timeout: config.timeout_enabled ? (config.timeout_hours as number) * 60 * 60 * 1000 : undefined,
    };
```

### 4. Condition Node targetNodeId
**Issue:** Frontend doesn't collect targetNodeId for routing
**Solution:** This requires workflow compilation logic, not just config transformation

The orchestrator needs to analyze edges during compilation to add targetNodeIds to conditions.

**Temporary Fix in orchestrator.ts:**
```typescript
case 'decision':
case 'ai_decision':
    // ... existing operator mapping ...
    
    // NOTE: targetNodeId should be added during workflow compilation
    // based on edge analysis. For now, we'll set it to null and let
    // the backend orchestrator determine next nodes from edges.
    
    return {
        conditionType: config.condition_type || 'expression',
        conditions: [
            {
                type: config.condition_type === 'field_exists' ? 'exists' : 'field_comparison',
                field: config.field_name,
                operator: backendOperator,
                value: config.compare_value,
                targetNodeId: '',  // Will be resolved by backend from edges
            },
        ],
        defaultPath: '',  // Will be resolved by backend from edges
        evaluateAll: false,
    };
```

---

## 📋 Frontend Schema Additions Needed

### 1. Action Node - Add HTTP Method Field
**File:** `flyn-platform/frontend/src/config/nodeSchemas.ts`

Add after `action_type` field:

```typescript
{
    name: 'method',
    label: 'HTTP Method',
    type: 'select',
    required: false,
    options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'DELETE', label: 'DELETE' },
        { value: 'PATCH', label: 'PATCH' },
    ],
    default: 'POST',
    // Only show for webhook/http_request actions
},
```

### 2. Action Node - Add Headers Field
Add after `method`:

```typescript
{
    name: 'headers',
    label: 'Request Headers (JSON)',
    type: 'textarea',
    placeholder: '{"Authorization": "Bearer token", "Content-Type": "application/json"}',
    // Only show for webhook/http_request
},
```

### 3. Wait Node - Add User Reply Type
**File:** `flyn-platform/frontend/src/config/nodeSchemas.ts`

Add to wait_type options:

```typescript
options: [
    { value: 'duration', label: 'Time Duration' },
    { value: 'signal', label: 'External Signal' },
    { value: 'datetime', label: 'Specific Date/Time' },
    { value: 'user_reply', label: 'User Reply' },  // NEW
    { value: 'call_end', label: 'Call End' },      // NEW
],
```

Add fields:

```typescript
{
    name: 'channel',
    label: 'Channel',
    type: 'select',
    options: [
        { value: 'any', label: 'Any Channel' },
        { value: 'whatsapp', label: 'WhatsApp' },
        { value: 'sms', label: 'SMS' },
        { value: 'email', label: 'Email' },
    ],
    default: 'any',
    // Show only when wait_type = 'user_reply'
},
{
    name: 'contact_id',
    label: 'Contact ID',
    type: 'text',
    placeholder: '{{trigger.contactId}}',
    // Show only when wait_type = 'user_reply'
},
```

### 4. Action Node - Add Transform Type
Add to action_type options:

```typescript
{ value: 'transform', label: 'Transform Data' },
```

Add fields:

```typescript
{
    name: 'transform_type',
    label: 'Transform Type',
    type: 'select',
    options: [
        { value: 'merge', label: 'Merge Objects' },
        { value: 'pick', label: 'Pick Fields' },
        { value: 'map', label: 'Map Fields' },
    ],
    // Show only when action_type = 'transform'
},
{
    name: 'transform_keys',
    label: 'Keys (comma-separated)',
    type: 'text',
    placeholder: 'name, email, status',
    // Show only when transform_type = 'pick'
},
```

### 5. Add Split Node
**File:** `flyn-platform/frontend/src/config/nodeSchemas.ts`

Add new schema:

```typescript
split: {
    type: 'split',
    label: 'Split',
    icon: 'GitFork',  // Will need to import from lucide-react
    iconComponent: GitFork,
    color: 'from-yellow-500 to-orange-500',
    category: 'logic',
    description: 'Fork execution into parallel paths',
    fields: [
        {
            name: 'description',
            label: 'Description',
            type: 'textarea',
            placeholder: 'Describe what happens in parallel...',
        },
    ],
},
```

### 6. Add Join Node

```typescript
join: {
    type: 'join',
    label: 'Join',
    icon: 'GitMerge',
    iconComponent: GitMerge,
    color: 'from-lime-500 to-green-500',
    category: 'logic',
    description: 'Wait for parallel branches to complete',
    fields: [
        {
            name: 'expected_branches',
            label: 'Expected Branches',
            type: 'number',
            min: 2,
            max: 10,
            default: 2,
            required: true,
        },
        {
            name: 'merge_strategy',
            label: 'Merge Strategy',
            type: 'select',
            options: [
                { value: 'all', label: 'Wait for All' },
                { value: 'first', label: 'First to Complete' },
                { value: 'any', label: 'Any N Branches' },
            ],
            default: 'all',
        },
        {
            name: 'required_count',
            label: 'Required Count',
            type: 'number',
            min: 1,
            max: 10,
            default: 2,
            // Show only when merge_strategy = 'any'
        },
    ],
},
```

### 7. Add End Node

```typescript
end: {
    type: 'end',
    label: 'End',
    icon: 'CircleStop',
    iconComponent: CircleStop,
    color: 'from-red-500 to-rose-500',
    category: 'logic',
    description: 'Terminate workflow and produce final output',
    fields: [
        {
            name: 'include_all_outputs',
            label: 'Include All Outputs',
            type: 'toggle',
            default: false,
        },
        {
            name: 'output_mapping',
            label: 'Output Mapping (JSON)',
            type: 'textarea',
            placeholder: '{"sourceKey": "targetKey", "data.result": "finalResult"}',
        },
    ],
},
```

---

## 🎯 Quick Win Fixes (15 minutes each)

### Fix 1: MongoDB JSON Parsing
**Time:** 5 min  
**Impact:** MongoDB queries will work  
**Location:** orchestrator.ts line ~318 (add case)

### Fix 2: AI Router Confidence Scale
**Time:** 5 min  
**Impact:** AI Router will route correctly  
**Location:** orchestrator.ts line ~318 (add case)  
**Change:** Divide by 100

### Fix 3: Iterator Rename
**Time:** 5 min  
**Impact:** Loops will work  
**Location:** orchestrator.ts line ~318 (add case)  
**Change:** list_source → collection

### Fix 4: Approval Keys
**Time:** 10 min  
**Impact:** Approvals will work  
**Location:** orchestrator.ts lines 308-316  
**Changes:** 3 key renames + nested config extraction

### Fix 5: Wait Signal Type
**Time:** 10 min  
**Impact:** Wait for signals will work  
**Location:** orchestrator.ts lines 274-280  
**Changes:** Type mapping + key rename

---

## 🧪 Testing Checklist

After each fix, test:

```bash
# 1. Compile workflow with the node type
# 2. Execute via API
curl -X POST http://localhost:3000/api/orchestrator/execute \
  -H "Content-Type: application/json" \
  -d @test-workflow.json

# 3. Check run status
curl http://localhost:3000/api/orchestrator/run/{runId}

# 4. Check execution history
curl http://localhost:3000/api/orchestrator/run/{runId}/history
```

---

## 📊 Priority Order

1. **30 min** - orchestrator.ts transformations (Fixes 1-5)
2. **20 min** - Add method/headers to Action node
3. **15 min** - Add Split/Join/End to nodeSchemas
4. **10 min** - Add user_reply/call_end to Wait
5. **15 min** - Add Transform action type

**Total Time:** ~90 minutes for all critical fixes

---

## ✅ Validation Script

Create a test workflow with each node type:

```typescript
// test-all-nodes.ts
const testWorkflow = {
    nodes: [
        { type: 'trigger', config: { trigger_type: 'manual' } },
        { type: 'mongodb', config: { database: 'test', collection: 'users', operation: 'find', query: '{}' } },
        { type: 'ai_router', config: { prompt: 'Test', task: 'classify_intent', confidence_threshold: 80 } },
        { type: 'iterator', config: { list_source: '{{mongodb.result}}', max_iterations: 10 } },
        { type: 'action', config: { action_type: 'webhook', target: 'http://example.com', method: 'POST' } },
        { type: 'wait', config: { wait_type: 'duration', duration_value: 5, duration_unit: 'seconds' } },
        { type: 'decision', config: { condition_type: 'field_equals', field_name: 'status', operator: 'equals', compare_value: 'active' } },
        { type: 'approval', config: { approval_type: 'single', approvers: 'admin@test.com', title: 'Test' } },
    ],
};
```

Run and verify no transformation errors in backend logs.
