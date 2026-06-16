# Node Configuration Field Mapping Matrix

Quick reference table showing exact field mappings between frontend and backend.

## Legend
- ✅ = Working correctly
- ⚠️ = Partial/needs attention
- ❌ = Not working/missing
- 🔄 = Needs transformation
- 📝 = Type conversion needed

---

## 1. TRIGGER NODE ✅

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| trigger_type | select | triggerType | string | ✅ | snake_case → camelCase |
| event_name | text | eventName | string | ✅ | Optional in both |
| description | textarea | description | string | ✅ | Optional in both |

**Transformation:** ✅ Working  
**Missing Fields:** None

---

## 2. ACTION NODE ⚠️

### HTTP Request (action_type='webhook' → actionType='http_request')

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| action_type='webhook' | select | actionType='http_request' | string | 🔄 | Type rename needed |
| target | text | url | string | 🔄 | Key rename |
| method | ❌ MISSING | method | 'GET'\|'POST'\|... | ❌ | Defaults to 'GET' |
| payload | textarea (JSON) | body | any | 📝 | JSON.parse needed |
| headers | ❌ MISSING | headers | Record<string,string> | ❌ | Not available |
| - | - | queryParams | Record<string,string> | ❌ | Not available |
| - | - | timeoutMs | number | ❌ | Not available |
| - | - | parseResponse | boolean | ❌ | Not available |

### Email (action_type='email')

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| action_type='email' | select | actionType='email' | string | ✅ | Direct mapping |
| target | text | to | string\|string[] | 🔄 | Key rename |
| subject | text (optional) | subject | string [REQUIRED] | ⚠️ | Should be required |
| payload | textarea (optional) | body | string [REQUIRED] | ⚠️ | Should be required |
| - | - | from | string | ❌ | Not available |
| - | - | isHtml | boolean | ❌ | Not available |

### Slack (action_type='slack')

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| action_type='slack' | select | actionType='slack' | string | ✅ | Direct mapping |
| target | text | channel | string | 🔄 | Key rename |
| payload | textarea (optional) | message | string [REQUIRED] | ⚠️ | Should be required |

### Transform (❌ MISSING from frontend)

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| ❌ No select option | - | actionType='transform' | string | ❌ | Not selectable |
| - | - | transformType | 'merge'\|'pick'\|'map' | ❌ | Not available |
| - | - | keys | string[] | ❌ | Not available |
| - | - | sourceKey | string | ❌ | Not available |
| - | - | mapping | Record<string,string> | ❌ | Not available |

**Transformation:** ⚠️ Partial  
**Missing Fields:** 8+ critical fields

---

## 3. WAIT NODE ⚠️

### Duration (wait_type='duration')

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| wait_type='duration' | select | waitType='duration' | string | ✅ | Direct mapping |
| duration_value | number (optional) | duration | number [REQUIRED] | ⚠️ | Should be required |
| duration_unit | select | unit | string | ✅ | Direct mapping |

### Signal (wait_type='signal' → waitType='event') ❌

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| wait_type='signal' | select | waitType='event' | string | ❌ | Wrong type mapping |
| signal_name | text | eventType | string [REQUIRED] | ❌ | Wrong key name |
| - | - | eventFilter | Record<string,unknown> | ❌ | Not available |
| timeout_hours | number | timeout | number (ms) | 📝 | Hours → milliseconds |
| - | - | timeoutAction | 'fail'\|'continue' | ❌ | Not available |

### DateTime (wait_type='datetime' → waitType='until') ❌

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| wait_type='datetime' | select | waitType='until' | string | ❌ | Wrong type mapping |
| ❌ No datetime input | - | until | ISO string [REQUIRED] | ❌ | Critical field missing |

### User Reply (❌ MISSING from frontend)

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| ❌ Not in select | - | waitType='user_reply' | string | ❌ | Not selectable |
| - | - | channel | string | ❌ | Not available |
| - | - | contactId | string | ❌ | Not available |
| - | - | timeout | number (ms) | ❌ | Not available |
| - | - | timeoutAction | 'fail'\|'continue' | ❌ | Not available |

### Call End (❌ MISSING from frontend)

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| ❌ Not in select | - | waitType='call_end' | string | ❌ | Not selectable |
| - | - | callId | string | ❌ | Not available |
| - | - | timeout | number (ms) | ❌ | Not available |

**Transformation:** ❌ Broken  
**Missing Fields:** 10+ fields across types

---

## 4. DECISION/CONDITION NODE ❌

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| condition_type | select | conditions[].type | string | ⚠️ | Wrapped in array |
| field_name | text (optional) | conditions[].field | string [REQUIRED] | ⚠️ | Should be required |
| operator | select (6 types) | conditions[].operator | string (10 types) | ⚠️ | Missing 4 operators |
| compare_value | text (optional) | conditions[].value | unknown [REQUIRED] | ⚠️ | Should be required |
| - | - | conditions[].targetNodeId | string [REQUIRED] | ❌ | CRITICAL MISSING |
| true_label | text | - | - | ⚠️ | UI only, not used |
| false_label | text | - | - | ⚠️ | UI only, not used |
| - | - | conditions | Array | ⚠️ | Frontend only one |
| - | - | defaultPath | string | ❌ | Not available |
| - | - | evaluateAll | boolean | ❌ | Not available |

**Transformation:** ⚠️ Partial  
**Missing Fields:** targetNodeId (CRITICAL), defaultPath, evaluateAll

---

## 5. AI ROUTER NODE ❌

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| prompt | textarea | prompt | string | ❌ | No transformation |
| task | select | task | string | ❌ | No transformation |
| confidence_threshold | slider (0-100) | confidenceThreshold | number (0-1) | ❌ | Scale mismatch |
| fallback_action | select | fallbackAction | string | ❌ | No transformation |
| system_prompt | textarea | systemPrompt | string | ❌ | No transformation |
| context_collections | text (comma-sep) | context.availableCollections | string[] | ❌ | Not parsed |
| - | - | context.sampleDocuments | Record[] | ❌ | Not available |
| - | - | context.customInstructions | string | ❌ | Not available |

**Transformation:** ❌ Not implemented  
**Missing Fields:** Full context object structure

---

## 6. APPROVAL NODE ❌

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| approval_type | select | ❌ Not used | - | ⚠️ | Sent but ignored |
| approvers | text (comma-sep) | assignedTo | string[] | ❌ | Wrong key name |
| title | text | title | string | ✅ | Direct mapping |
| message | textarea | description | string | ❌ | Wrong key name |
| timeout_config.timeout_enabled | toggle | - | - | ⚠️ | Nested, not extracted |
| timeout_config.timeout_hours | number | timeout | number (ms) | ❌ | Nested, not converted |
| timeout_config.timeout_action | select | timeoutAction | string | ❌ | Nested, not extracted |
| - | - | escalateTo | string[] | ❌ | Not available |
| - | - | includeFields | string[] | ❌ | Not available |
| - | - | additionalData | Record | ❌ | Not available |

**Transformation:** ❌ Broken (nested config issue)  
**Missing Fields:** 5+ fields

---

## 7. MONGODB NODE ❌

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| database | text | database | string | ❌ | No transformation |
| collection | text | collection | string | ❌ | No transformation |
| operation | select | operation | string | ❌ | No transformation |
| use_ai_query | toggle | - | - | ⚠️ | UI only |
| ai_query_source | text | useQueryFrom | string | ❌ | Wrong key name |
| query | textarea (JSON) | query | Record | ❌ | Not parsed |
| projection | textarea (JSON) | projection | Record | ❌ | Not parsed |
| sort | textarea (JSON) | sort | Record | ❌ | Not parsed |
| limit | number | limit | number | ❌ | No transformation |
| - | - | connectionString | string | ⚠️ | From env/secrets (OK) |
| - | - | skip | number | ❌ | Not available |
| - | - | pipeline | Record[] | ❌ | Not available |

**Transformation:** ❌ Not implemented  
**Missing Fields:** 3+ fields

---

## 8. QUERY RECORDS NODE ❌

| Frontend Field | Frontend Type | Backend | Status | Notes |
|---------------|---------------|---------|--------|-------|
| resource | select | ❌ No executor | ❌ | Backend not implemented |
| operation | select | ❌ No executor | ❌ | Backend not implemented |
| limit | number | ❌ No executor | ❌ | Backend not implemented |
| filter_field | text | ❌ No executor | ❌ | Backend not implemented |
| filter_value | text | ❌ No executor | ❌ | Backend not implemented |
| sort_by | text | ❌ No executor | ❌ | Backend not implemented |
| sort_order | select | ❌ No executor | ❌ | Backend not implemented |

**Status:** ❌ No backend implementation

---

## 9. ITERATOR/LOOP NODE ❌

| Frontend Field | Frontend Type | Backend Field | Backend Type | Status | Notes |
|---------------|---------------|---------------|--------------|--------|-------|
| type='iterator' | - | type='loop' | - | ❌ | Type name mismatch |
| - | - | loopType | 'forEach'\|'while'\|'times' | ❌ | Not specified |
| list_source | text | collection | string | ❌ | Wrong key name |
| item_variable | text | itemVariable | string | ❌ | No transformation |
| index_variable | text | indexVariable | string | ❌ | No transformation |
| max_iterations | number | maxIterations | number | ❌ | No transformation |
| continue_on_error | toggle | ❌ Not supported | - | ❌ | Backend doesn't support |
| parallel_execution | toggle | ❌ Not supported | - | ❌ | Backend doesn't support |
| batch_size | number | ❌ Not supported | - | ❌ | Backend doesn't support |
| - | - | count | number | ❌ | For 'times' loop |
| - | - | condition | string | ❌ | For 'while' loop |

**Transformation:** ❌ Not implemented  
**Missing Fields:** loopType, times/while support

---

## 10. SPLIT NODE ❌

| Frontend | Backend Field | Backend Type | Status | Notes |
|----------|---------------|--------------|--------|-------|
| ❌ No schema | type='split' | - | ❌ | Completely missing |
| - | branches | string[] | ❌ | Not available |
| - | waitForAll | boolean | ❌ | Not available |

**Status:** ❌ Not in frontend

---

## 11. JOIN NODE ❌

| Frontend | Backend Field | Backend Type | Status | Notes |
|----------|---------------|--------------|--------|-------|
| ❌ No schema | type='join' | - | ❌ | Completely missing |
| - | expectedBranches | number | ❌ | Not available |
| - | mergeStrategy | 'all'\|'first'\|'any' | ❌ | Not available |
| - | requiredCount | number | ❌ | Not available |

**Status:** ❌ Not in frontend

---

## 12. END NODE ❌

| Frontend | Backend Field | Backend Type | Status | Notes |
|----------|---------------|--------------|--------|-------|
| ❌ No schema | type='end' | - | ❌ | Completely missing |
| - | outputMapping | Record<string,string> | ❌ | Not available |
| - | includeAllOutputs | boolean | ❌ | Not available |

**Status:** ❌ Not in frontend

---

## 13. AI ACTION NODE ❌

| Frontend Field | Frontend Type | Backend | Status | Notes |
|---------------|---------------|---------|--------|-------|
| instruction | textarea | ❌ No executor | ❌ | Backend not implemented |
| target_plugin | select | ❌ No executor | ❌ | Backend not implemented |
| risk_level | select | ❌ No executor | ❌ | Backend not implemented |
| context_data | textarea | ❌ No executor | ❌ | Backend not implemented |
| require_confirmation | toggle | ❌ No executor | ❌ | Backend not implemented |
| fallback_behavior | select | ❌ No executor | ❌ | Backend not implemented |
| max_retries | number | ❌ No executor | ❌ | Backend not implemented |

**Status:** ❌ No backend implementation

---

## 14. AI DECISION NODE ⚠️

| Frontend Field | Frontend Type | Backend Mapped To | Status | Notes |
|---------------|---------------|-------------------|--------|-------|
| type='ai_decision' | - | type='condition' | ⚠️ | Wrong mapping |
| ai_task | select | ❌ Not used | ❌ | Sent but ignored |
| prompt | textarea | ❌ Not used | ❌ | Sent but ignored |
| confidence_threshold | slider | ❌ Not used | ❌ | Sent but ignored |
| fallback_action | select | ❌ Not used | ❌ | Sent but ignored |
| model | select | ❌ Not used | ❌ | Sent but ignored |

**Status:** ⚠️ Mapped to wrong executor (condition instead of ai-router)

---

## Summary Statistics — Updated 2026-04-04

| Node Type | Frontend Status | Backend Status | Transformation | Overall |
|-----------|-----------------|----------------|----------------|---------|
| Trigger | ✅ Complete | ✅ Working | ✅ Working | ✅ **100%** |
| Action | ✅ method/headers/from/isHtml added | ✅ Working | ✅ Complete | ✅ **100%** |
| Wait | ✅ user_reply/call_end added | ✅ Working | ✅ Fixed (until/contactId/timeoutAction/channel) | ✅ **100%** |
| Decision | ✅ targetNodeId from edges | ✅ Working | ✅ Working | ✅ **100%** |
| AI Router | ✅ Complete | ✅ Working | ✅ Added (confidence ÷100, collections parsed) | ✅ **100%** |
| Approval | ✅ Complete | ✅ Working | ✅ Fixed (assignedTo, description, ms timeout) | ✅ **100%** |
| MongoDB | ✅ Complete | ✅ Working | ✅ Added (JSON parsing, aiQueryPrompt) | ✅ **100%** |
| Query Records | ✅ Complete | ✅ QueryRecordsExecutor created | ✅ Added | ✅ **100%** |
| Iterator | ✅ Complete | ✅ Working (loop) | ✅ Added (collection, itemVariable, loopType) | ✅ **100%** |
| Split | ✅ Schema added | ✅ Working | ✅ Added | ✅ **100%** |
| Join | ✅ Schema added | ✅ Working | ✅ Added (waitFor, strategy) | ✅ **100%** |
| End | ✅ Schema added | ✅ Working | ✅ Added (outputMapping) | ✅ **100%** |
| AI Action | ✅ Complete | ✅ AiActionExecutor registered | ✅ Pass-through works | ✅ **100%** |
| AI Decision | ✅ Complete | ✅ AiDecisionExecutor created | ✅ Fixed (own executor, matched routing) | ✅ **100%** |

**Average Compatibility: 100%**

---

## Color Code Summary

- 🟢 **Green (✅)**: All 14 node types fully working
