# API + Workflow Builder AI — Implementation Plan

## Goal
Three wins from one build:
1. **Workflow AI** gets full platform context — can construct any Flyn operation
2. **Developer portal** API reference generates itself from real code
3. **External developers** get a proper API to integrate with

---

## Current State (from audit)

- 56 controllers, ~300 routes across all modules
- Developer portal (`DeveloperPortal.tsx`) ~60% built — API keys work, reference tab is hardcoded static HTML
- Swagger configured in `main.ts` but not comprehensive
- 42 workflow node executors — engine ahead of UI schema
- API keys backend (`/api/billing/keys`) fully implemented, no scopes yet
- No `list_api_endpoints` AI tool
- No `flyn_api` workflow node
- No per-request usage logging
- No rate limiting per key

---

## Architecture

```
nodeSchemas.ts (frontend)
  └─ buildNodeRegistry() → sent with every AI chat request ✓ (done)

workflow-assistant.service.ts (backend)
  └─ buildNodeReferenceBlock(registry) → dynamic node docs ✓ (done)
  └─ list_api_endpoints tool → queries live API spec  ← Phase 2

flyn_api workflow node ← Phase 2
  └─ method + endpoint (AI-suggested) + body + auto-injects tenant auth

API Spec Service ← Phase 1
  └─ GET /api/spec → full OpenAPI 3.0 JSON from NestJS decorators
  └─ GET /api/spec/search?q=accounting → filtered endpoints for AI tool

DeveloperPortal.tsx ← Phase 1
  └─ API Reference tab fetches /api/spec instead of hardcoded HTML

Scoped API Keys ← Phase 3
  └─ POST /api/billing/keys { scopes: ["read:contacts", "write:workflows"] }
  └─ Middleware validates scope on each request

Usage Logging ← Phase 3
  └─ Per-request audit trail → powers Usage Logs tab
  └─ Per-key metrics dashboard

Rate Limiting ← Phase 3
  └─ Per-key, per-tenant limits
  └─ 429 responses with Retry-After header
```

---

## Phase 1 — API Spec + Developer Portal Reference Tab
**Goal:** Developer portal shows real, auto-generated API docs. AI can query the spec.

### Backend
- [ ] Add `@ApiTags`, `@ApiOperation`, `@ApiResponse` decorators to all major controllers
- [ ] Create `ApiSpecService` — wraps Swagger document, exposes search
- [ ] Add `GET /api/spec` → returns full OpenAPI 3.0 JSON
- [ ] Add `GET /api/spec/search?q=query&module=accounting` → returns matching endpoints (used by AI tool)
- [ ] Enable Swagger UI at `/api/docs` (already configured, just needs decorators)

### Frontend
- [ ] Replace hardcoded endpoint list in `DeveloperPortal.tsx` API Reference tab
- [ ] Fetch from `GET /api/spec` and render grouped by module
- [ ] Add search/filter bar
- [ ] Add Try-it panel (send live request with user's API key)

### Modules to decorate (priority order)
1. Orchestrator / Workflows
2. CRM
3. Accounting
4. HR
5. Channels
6. Agents
7. Inbox
8. Church / Coaches / Freelancer
9. Billing / Keys
10. Integrations

---

## Phase 2 — `flyn_api` Node + AI `list_api_endpoints` Tool
**Goal:** AI can construct any Flyn operation as a workflow node, not just predefined ones.

### Backend
- [ ] Add `list_api_endpoints` tool to `WorkflowAssistantService`
  - Calls `GET /api/spec/search?q={userIntent}`
  - Returns matching endpoints with method, path, params, description
- [ ] Add `flyn_api` executor to the orchestrator node executor registry
  - Executes authenticated internal API calls
  - Auto-injects `x-tenant-id` header + Bearer token
  - Returns response as node output

### Frontend
- [ ] Add `flyn_api` node to `nodeSchemas.ts`
  - Fields: method (select), endpoint (text with AI suggestion), body (textarea), headers (section)
  - Special: "Ask AI to suggest endpoint" button → triggers AI tool
- [ ] Update `NodeOutputPicker` to show `flyn_api` response paths

### AI Prompt Update
- [ ] Add `flyn_api` usage examples to `SYSTEM_PROMPT_BASE`
- [ ] Teach AI: "When user asks for something not in predefined nodes, use flyn_api node + list_api_endpoints tool"

---

## Phase 3 — Scoped Keys + Usage Logging + Rate Limiting
**Goal:** Complete developer portal for external integrators.

### Scoped API Keys
- [ ] Add `scopes` array to API key schema: `["read:contacts", "write:workflows", "read:billing"]`
- [ ] Scope definitions:
  ```
  read:contacts, write:contacts
  read:workflows, write:workflows, execute:workflows
  read:billing
  read:channels, write:channels
  read:agents, write:agents
  read:hr, write:hr
  admin (all scopes)
  ```
- [ ] Middleware: validate scope on each request, return 403 if insufficient
- [ ] Frontend: scope selector when creating API keys

### Usage Logging
- [ ] NestJS interceptor: log every API request (key, endpoint, status, latency, timestamp)
- [ ] Store in DynamoDB: `tenantId + keyId + timestamp` partition
- [ ] `GET /api/dev/logs?keyId=&from=&to=` for usage log tab
- [ ] `GET /api/dev/usage/summary` for per-key metrics (calls today, this month, errors)

### Rate Limiting
- [ ] `@nestjs/throttler` per API key (not per IP)
- [ ] Configurable per plan tier: Starter 1k/day, Pro 10k/day, Enterprise unlimited
- [ ] 429 response with `X-RateLimit-Remaining` + `Retry-After` headers

---

## File Locations

| File | Purpose |
|------|---------|
| `backend/src/orchestrator/workflow-assistant.service.ts` | AI assistant — add `list_api_endpoints` tool |
| `backend/src/orchestrator/executors/` | Add `flyn-api.executor.ts` |
| `backend/src/api-spec/api-spec.service.ts` | New — wraps Swagger doc, exposes search |
| `backend/src/api-spec/api-spec.controller.ts` | New — `GET /api/spec`, `GET /api/spec/search` |
| `backend/src/billing/keys/api-keys.controller.ts` | Add scopes to key creation |
| `backend/src/common/interceptors/usage-logger.interceptor.ts` | New — per-request logging |
| `frontend/src/pages/DeveloperPortal.tsx` | Wire up live spec + usage logs |
| `frontend/src/config/nodeSchemas.ts` | Add `flyn_api` node |
| `frontend/src/pages/AutomationsV2.tsx` | AI endpoint suggestion UX |

---

## Progress Tracker

| Phase | Task | Status |
|-------|------|--------|
| Pre | Dynamic node registry sent in AI chat | ✅ Done |
| Pre | `buildNodeReferenceBlock` injects all nodes into AI prompt | ✅ Done |
| 1 | `ApiSpecService` + `GET /api/spec` | 🔲 Todo |
| 1 | `GET /api/spec/search` for AI tool | 🔲 Todo |
| 1 | NestJS controller decorators (major modules) | 🔲 Todo |
| 1 | Developer portal — live API reference tab | 🔲 Todo |
| 2 | `list_api_endpoints` AI tool | 🔲 Todo |
| 2 | `flyn_api` node schema + executor | 🔲 Todo |
| 2 | AI prompt update for `flyn_api` usage | 🔲 Todo |
| 3 | Scoped API keys | 🔲 Todo |
| 3 | Usage logging interceptor + storage | 🔲 Todo |
| 3 | Rate limiting per key | 🔲 Todo |
