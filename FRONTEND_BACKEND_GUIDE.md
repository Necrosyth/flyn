# Frontend ↔ Backend Communication Guide

## ✅ What Currently Works

### 1. **Basic Workflow Execution**
- Frontend compiles React Flow nodes → JSON
- Sends to `POST /api/orchestrator/execute`
- Backend executes workflow
- Frontend receives workflow run ID

### 2. **Field Mapping (After Fixes)**
| Frontend Field | Backend Field | Node Type |
|---------------|---------------|-----------|
| `target` | `to` | email, notification |
| `target` | `url` | http_request |
| `target` | `channel` | slack |
| `payload` | `body` | email, notification, http_request |
| `payload` | `message` | slack |
| `subject` | `subject` | All action types |
| `trigger_type` | `triggerType` | trigger |
| `wait_type` | `waitType` | wait |
| `approval_type` | `approvalType` | approval |

### 3. **Operator Mapping (Just Fixed)**
| Frontend | Backend |
|----------|---------|
| `equals` | `==` |
| `not_equals` | `!=` |
| `greater_than` | `>` |
| `less_than` | `<` |
| `contains` | `contains` |
| `starts_with` | `startsWith` |

---

## ⚠️ What Needs Fixing

### 1. **Variable Interpolation `{{variable}}` — NOT FULLY WORKING**

**Backend supports this fully:**
```typescript
// Backend code in action.executor.ts
const interpolatedUrl = this.interpolateString(url, context.previousOutputs);
// Example: "https://api.com/users/{{trigger.userId}}" 
// Becomes: "https://api.com/users/12345"
```

**Backend interpolation works on:**
- HTTP request URLs
- HTTP request bodies
- HTTP request headers
- Email subject/body
- Slack messages

**How variables are accessed in backend:**
```typescript
context.previousOutputs = {
  "trigger-1": {
    triggerType: "manual",
    data: { userId: 123, amount: 250 }
  },
  "action-1": {
    success: true,
    result: { userName: "John" }
  }
}

// You can reference:
{{trigger-1.data.userId}}         // → 123
{{trigger-1.data.amount}}         // → 250
{{action-1.result.userName}}      // → "John"
```

**Frontend issue:**
The frontend **doesn't show users** what variables are available or validate them. You can type `{{anything}}` but won't know if it's valid until execution fails.

**What you need to add in frontend:**
1. **Variable picker UI** — Show available variables from previous nodes
2. **Autocomplete** — When user types `{{`, show dropdown of available variables
3. **Validation** — Check if variables exist before publishing

**Where to add this:**
- In `src/components/workflow-builder/PropertyPanel.tsx`
- For fields marked as `supportsVariables: true` in `nodeSchemas.ts`
- Create a `<VariableInput>` component with autocomplete

---

### 2. **Dynamic Input Fields Based on Node Config**

The frontend **already has this** in `nodeSchemas.ts`, but it's **incomplete**.

**Example — Action Node:**
Currently shows ALL fields regardless of action type. Should show:

**When action_type = "email":**
- ✅ Show: `target` (labeled "To Email")
- ✅ Show: `subject`
- ✅ Show: `payload` (labeled "Email Body")
- ❌ Hide: HTTP-specific fields

**When action_type = "webhook" (HTTP):**
- ✅ Show: `target` (labeled "URL")
- ✅ Show: `method` dropdown (GET/POST/PUT/DELETE)
- ✅ Show: `payload` (labeled "Request Body - JSON")
- ❌ Hide: Email-specific fields

**How to fix:**
Add conditional rendering in `nodeSchemas.ts`:

```typescript
{
  name: 'method',
  label: 'HTTP Method',
  type: 'select',
  showIf: (config) => config.action_type === 'webhook', // Add this
  options: [
    { value: 'GET', label: 'GET' },
    { value: 'POST', label: 'POST' },
    { value: 'PUT', label: 'PUT' },
    { value: 'DELETE', label: 'DELETE' },
  ],
}
```

---

### 3. **Trigger Data Input**

When you click "Publish", the frontend sends:
```json
{
  "workflow": { ... },
  "triggerData": {}  // ← EMPTY
}
```

**The problem:** You can't test workflows with data!

**What you need:**
Add a **"Test Trigger Data"** input before publishing:

```tsx
// In WorkflowBuilder.tsx
const [triggerData, setTriggerData] = useState('{}');

<Dialog>
  <DialogTitle>Execute Workflow</DialogTitle>
  <DialogContent>
    <TextField
      label="Trigger Data (JSON)"
      multiline
      rows={6}
      value={triggerData}
      onChange={(e) => setTriggerData(e.target.value)}
      placeholder={`{
  "amount": 250,
  "userId": 123,
  "email": "test@example.com"
}`}
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={() => {
      const data = JSON.parse(triggerData);
      handlePublish(data); // Pass data to execute
    }}>
      Execute
    </Button>
  </DialogActions>
</Dialog>
```

---

### 4. **Execution Results Visualization**

After publish, you only see "Published Successfully" toast.

**What you need:**
1. **In-canvas status visualization** (already exists, but might not update correctly)
2. **Execution history panel** showing:
   - Each node's input/output
   - Execution time
   - Errors

**Add this:**
```tsx
// src/components/workflow-builder/ExecutionHistoryPanel.tsx
import { orchestratorService } from '@/services/orchestrator';

export function ExecutionHistoryPanel({ workflowRunId }) {
  const [history, setHistory] = useState([]);
  
  useEffect(() => {
    orchestratorService.getExecutionHistory(workflowRunId)
      .then(data => setHistory(data.nodeRuns));
  }, [workflowRunId]);
  
  return (
    <div>
      {history.map(nodeRun => (
        <Card key={nodeRun.nodeId}>
          <h3>{nodeRun.nodeId}</h3>
          <p>Status: {nodeRun.status}</p>
          <pre>Input: {JSON.stringify(nodeRun.input, null, 2)}</pre>
          <pre>Output: {JSON.stringify(nodeRun.output, null, 2)}</pre>
          <p>Duration: {nodeRun.durationMs}ms</p>
        </Card>
      ))}
    </div>
  );
}
```

---

### 5. **Missing Node Type Configs**

Some backend nodes don't have full frontend configs:

#### **Loop Node** — Missing in frontend schemas
Add this to `nodeSchemas.ts`:

```typescript
{
  type: 'loop',
  label: 'Loop',
  category: 'Logic',
  icon: RefreshCw,
  color: '#10b981',
  fields: [
    {
      name: 'loop_type',
      label: 'Loop Type',
      type: 'select',
      required: true,
      options: [
        { value: 'forEach', label: 'For Each Item' },
        { value: 'times', label: 'Repeat N Times' },
        { value: 'while', label: 'While Condition' },
      ],
    },
    {
      name: 'items_source',
      label: 'Array Source',
      type: 'text',
      showIf: (config) => config.loop_type === 'forEach',
      supportsVariables: true,
      placeholder: '{{previousNode.items}}',
    },
    {
      name: 'iterations',
      label: 'Number of Iterations',
      type: 'number',
      showIf: (config) => config.loop_type === 'times',
    },
    {
      name: 'condition',
      label: 'While Condition',
      type: 'text',
      showIf: (config) => config.loop_type === 'while',
    },
    {
      name: 'max_iterations',
      label: 'Max Iterations (Safety)',
      type: 'number',
      default: 1000,
    },
  ],
}
```

#### **MongoDB Node** — Incomplete config
Add connection string field, query field, etc.

---

## 🎯 Priority Fixes (In Order)

### 1. **Operator Mapping** ✅ DONE
Fixed the `equals` → `==` mapping issue.

### 2. **Trigger Data Input** ⚠️ HIGH PRIORITY
Without this, you can't test workflows with real data.

**How to add:**
1. Open `src/pages/WorkflowBuilder.tsx`
2. Find the `handlePublish` function
3. Add trigger data dialog before calling `orchestratorService.executeWorkflow()`

### 3. **Execution History Panel** ⚠️ HIGH PRIORITY
Currently you check results via cURL. Add a UI panel.

**Where to add:**
- Create `src/components/workflow-builder/ExecutionHistoryPanel.tsx`
- Show it in a drawer/modal after execution
- Auto-refresh while workflow is running

### 4. **Variable Picker** ⚠️ MEDIUM PRIORITY
Variables work in backend but are hard to use in frontend.

**What to build:**
- Autocomplete dropdown when typing `{{`
- Show list of available variables from previous nodes
- Syntax highlighting for variable fields

### 5. **Conditional Field Display** ⚠️ LOW PRIORITY
Cleanup — hide irrelevant fields based on config.

---

## 📝 How to Test Variable Interpolation

**Step 1:** Build this workflow:

| Node | Config |
|------|--------|
| **Trigger** | Type: Manual |
| **Action 1** | Type: Notification, To: `admin@test.com`, Body: `User {{trigger.name}} signed up` |
| **Action 2** | Type: Notification, To: `{{action-1.to}}`, Body: `Previous recipient: {{action-1.to}}` |

**Step 2:** Execute with trigger data:
```json
{
  "name": "John Smith",
  "email": "john@example.com"
}
```

**Step 3:** Check execution history:
```bash
curl http://localhost:3000/api/orchestrator/run/<runId>/history | python3 -m json.tool
```

**Expected:** You'll see `"User John Smith signed up"` in action-1 output.

---

## 🔧 Quick Fixes You Can Do Now

### Fix 1: Add Trigger Data Dialog
```tsx
// In WorkflowBuilder.tsx, modify handlePublish:

const [showExecuteDialog, setShowExecuteDialog] = useState(false);
const [triggerDataInput, setTriggerDataInput] = useState('{\n  "amount": 250\n}');

const handlePublish = async () => {
  setShowExecuteDialog(true); // Show dialog instead of executing immediately
};

const executeWorkflow = async () => {
  try {
    const triggerData = JSON.parse(triggerDataInput);
    const response = await orchestratorService.executeWorkflow(
      workflow,
      triggerData // Pass the data
    );
    toast.success(`Published Successfully. Workflow ID: ${response.workflowRunId}`);
  } catch (error) {
    toast.error(`Failed: ${error.message}`);
  }
};

// Add the dialog JSX
<Dialog open={showExecuteDialog} onClose={() => setShowExecuteDialog(false)}>
  <DialogTitle>Execute Workflow</DialogTitle>
  <DialogContent>
    <TextField
      fullWidth
      multiline
      rows={8}
      label="Trigger Data (JSON)"
      value={triggerDataInput}
      onChange={(e) => setTriggerDataInput(e.target.value)}
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setShowExecuteDialog(false)}>Cancel</Button>
    <Button onClick={executeWorkflow} variant="contained">Execute</Button>
  </DialogActions>
</Dialog>
```

### Fix 2: Show Execution History After Publish
```tsx
// After executeWorkflow succeeds:
const [lastRunId, setLastRunId] = useState<string | null>(null);

const executeWorkflow = async () => {
  // ... existing code
  const response = await orchestratorService.executeWorkflow(workflow, triggerData);
  setLastRunId(response.workflowRunId); // Save run ID
  // Now show execution history panel or navigate to it
};

// Add button to view history:
{lastRunId && (
  <Button onClick={() => {
    // Fetch and show history
    orchestratorService.getExecutionHistory(lastRunId).then(history => {
      console.log('Execution history:', history);
      // Show in modal/drawer
    });
  }}>
    View Execution History
  </Button>
)}
```

---

## Summary

**What works:** Basic execution, field mapping, operator mapping (just fixed)

**What needs work:** 
1. ⚠️ Trigger data input UI
2. ⚠️ Execution history visualization
3. ⚠️ Variable picker/autocomplete
4. ⚠️ Complete node configs (Loop, MongoDB)
5. ⚠️ Conditional field display

**Priority:** Fix #1 and #2 first — they're essential for testing workflows properly.
