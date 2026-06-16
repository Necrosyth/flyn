# flyn-platform — Agent Context

Last updated: 2026-05-21

---

## Repo Layout

```
flow-hub/
  flyn-platform/
    backend/   NestJS + Firestore + Stripe
    frontend/  React + Vite + TypeScript
  My_notes/
  *.md         Audit docs, checklists, deployment notes
```

**Live backend:** `https://pjpmzvu7wn.us-east-1.awsapprunner.com/api`
**Firebase project:** `flyn-94396`
**GitHub remote:** `https://github.com/anshtalrani88/flow-hub.git`

---

## Billing / Plan Architecture (Full Audit — 2026-05-21)

### Canonical Plan IDs (Firestore `plan_definitions` collection)
- `starter` — $29.99/mo, 1 member, 500 msgs
- `growth` — $49/mo / $529/yr — Most Popular
- `professional` — $99/mo / $1069/yr
- `enterprise` — custom, no Stripe IDs

**`'pro'` is a RETIRED plan ID** — do not use. The migration happened 2026-05-16. Any code or data still referencing `'pro'` will break entitlement lookups.

### How Plans Flow (End-to-End)

```
User pays via Stripe
  → Stripe webhook → billing.service.ts → onSubscriptionCheckoutCompleted()
  → Updates billing_subscriptions/{tenantId} in Firestore
  → Calls updateTenantPlanClaims() → firebase.setCustomUserClaims(uid, { plan: planId })
  → User must logout/login to get new JWT
```

### How the UI Shows the Plan

1. **Fast path (JWT claims):** `AuthContext.tsx` reads `plan` from the Firebase Identity Token (JWT). This is what drives the UI immediately on login.
2. **Backend API path:** `/api/entitlements/me` — reads `billing_subscriptions` collection directly. This is the authoritative server-side check.
3. **Feature flags:** `PlanContext.tsx` maps planId → feature booleans via hardcoded `PLAN_ENTITLEMENTS` map.
4. **UI gates:** `<FeatureGate>` component + `useFeatureGate(featureKey)` hook — physically hides/locks UI elements.
5. **Sidebar:** Also filtered by `aiAgents` field on tenant doc (selected modules during onboarding).

### Why "I updated Firestore but UI still shows old plan"

Firestore changes do NOT auto-update Firebase Auth Custom Claims. The JWT in the browser is stale until:
1. Backend calls `admin.auth().setCustomUserClaims(uid, { plan: newPlanId })`
2. User logs out and logs back in (or token is force-refreshed)

### Manual QA Upgrade Procedure (Admin Scripts)

Used during QA testing to manually upgrade a user without Stripe:

**Step 1 — Write subscription to Firestore:**
```js
// Collection: billing_subscriptions
// Doc ID: {tenantId}
{
  tenantId, planId, gateway: 'stripe',
  gatewaySubscriptionId: 'sub_test_id',
  status: 'active',
  currentPeriodStart: Date.now(),
  currentPeriodEnd: Date.now() + 30*24*60*60*1000,
  cancelAtPeriodEnd: false,
  createdAt, updatedAt
}
```

**Step 2 — Update tenant doc:**
```js
db.collection('tenants').doc(tenantId).update({ planId, updatedAt: Date.now() })
```

**Step 3 — Sync Firebase Auth claims:**
```js
const user = await admin.auth().getUser(uid)
await admin.auth().setCustomUserClaims(uid, { ...user.customClaims, plan: planId })
```

**Step 4 — User logs out and back in.**

Service account key is base64-encoded in `flyn-platform/backend/.env` under `FIREBASE_SERVICE_ACCOUNT_BASE64`.

---

## Current QA Test Account State (as of 2026-05-21)

- **Email:** `sourabh.offi@gmail.com`
- **UID:** `XMbkmW0Gszew4IbfknIB5PUadCf2`
- **Org ID / Tenant ID:** `FSHfLDxg24hb9TaoYpDK`
- **Role:** `admin`
- **Wallet:** 100 credits (0 purchased, 0 used)
- **Set to plan:** `pro` (⚠️ see warning below)

> **WARNING:** `'pro'` is a retired plan ID. Gemini CLI upgraded this user to `'pro'` during QA testing (2026-05-21), but the canonical plan IDs are `starter / growth / professional / enterprise`. The `PLAN_ENTITLEMENTS` map in the frontend may not recognize `'pro'` as a valid tier — check `PlanContext.tsx` and `plan-entitlements.ts`. If the UI doesn't show Pro features, re-run the manual upgrade with `planId: 'professional'` instead.

---

## Feature Gating Architecture

### PLAN_ENTITLEMENTS map (frontend hardcoded)
- **Starter:** WhatsApp, Telegram, AI Deployment, Website Builder — **LOCKED**
- **Pro/Professional:** above unlocked; SEO tools, SLA management — still locked
- **Growth:** intermediate tier
- **Enterprise:** fully unlocked

### Feature Gate Components
- `flyn-platform/frontend/src/` — `useFeatureGate(featureKey)` hook
- `<FeatureGate>` wrapper component — shows paywall badge or hides entirely
- `PlanContext.tsx` — provides feature flags to all children

---

## Key Backend Files

| File | Purpose |
|------|---------|
| `backend/src/billing/billing.service.ts` | Stripe checkout, webhook handler, claims sync |
| `backend/src/billing/plan-entitlements.ts` | Hardcoded feature flags per plan |
| `backend/src/billing/entitlement.service.ts` | `/entitlements/me` API handler |
| `backend/src/tenants/tenants.controller.ts` | `syncCustomClaims` endpoint |
| `backend/src/billing/plans-admin.service.ts` | CRUD for plan_definitions |

---

## Outstanding Issues / Notes

- `billing_plans` collection is **dead** — old compound IDs like `enterprise_month`. Any code still referencing it will break checkout.
- 670 frontend lint errors + 4000+ backend lint errors exist (mostly `@typescript-eslint/no-explicit-any` and unused vars). These pre-existed.
- No `send-email.executor.ts` backend file found — Send Email node in frontend has no backend executor.
- PostgreSQL and MySQL node types exist in `nodeSchemas.ts` but have no transformation cases in `orchestrator.ts`.
- `app.e2e-spec.ts` excluded from tsconfig — backend e2e tests won't run.

---

## Telephony / Twilio Calling Architecture (Full Audit — 2026-06-01)

### Two ways a tenant gets a calling number
1. **BYO Twilio** — tenant connects their OWN Twilio account → stored as a `ChannelType.TWILIO`
   channel (`credentials.twilioPhoneNumber`). This is what the owner/+971 uses.
2. **Flyn pool** (most clients) — `POST /api/telephony/voice/allocate` (`allocateNumber`) is
   **instant self-service, first number free**. It acquires a number from `platform_phone_pool`
   (or buys one via Twilio `IncomingPhoneNumbers.json`), configures its webhooks, and writes the
   number to the tenant doc's **`flynVoice`** field: `{ status:'active', phoneNumber, phoneNumberSid }`.
   Calls use the **FLYN master account** (`FLYN_TWILIO_ACCOUNT_SID` / `FLYN_TWILIO_AUTH_TOKEN`).
   (There's also an older admin-approval path `POST /request-activation` → `approveActivation`.)

### ⚠️ CRITICAL FIELD-NAMING GOTCHA
- `allocateNumber` / `patchFlynVoice` **WRITE** the top-level **`flynVoice`** field.
- `makeTwilioAiCall` / `getFlynVoiceState` (channels) **READ** `flynVoice` → ✅ consistent (outbound works).
- BUT sarthak's provider-choice code (`getVoiceConfig`, `updateVoiceProvider`, inbound `voiceWebhook`)
  reads **`telephony.voice`** — which allocation NEVER sets. So `aiProvider` was always undefined.
  Do NOT trust `telephony.voice` for the active number; the source of truth is **`flynVoice`**.

### Call flow (after fixes, commit on 2026-06-01)
```
button enable ← GET /channels/twilio/config → getTenantTwilioConfig
                  → now checks flynVoice (pool) FIRST, then BYO Twilio → connected:true
click Call    → POST /channels/twilio/ai-call → makeTwilioAiCall
                  → flynVoice active? FLYN acct + pool number : BYO creds
                  → Twilio /Calls.json → customer answers → TwiML /webhook/twilio/voice → Gemini loop
inbound       → Twilio hits /api/telephony/webhook/voice (set during allocation)
                  → defaults to Twilio/Gemini UNLESS telephony.voice.aiProvider === 'vapi'
```

### Bugs fixed 2026-06-01
1. **Call button grayed for pool tenants** — `getTenantTwilioConfig` only checked BYO Twilio,
   ignored `flynVoice`. Fixed to check the pool number first (mirrors `makeTwilioAiCall`).
2. **Inbound always routed to VAPI** — `voiceWebhook` required `aiProvider === 'twilio'`, but that
   field (`telephony.voice.aiProvider`) is never set. Changed to **default to Twilio unless
   explicitly `'vapi'`** → Twilio is now the default provider.

### Prerequisite (NOT code — env on App Runner)
`FLYN_TWILIO_ACCOUNT_SID`, `FLYN_TWILIO_AUTH_TOKEN`, `FLYN_VAPI_API_KEY`, `FLYN_VAPI_PUBLIC_KEY`
must be present in the App Runner env. They exist in local `.env` but get **wiped by deploys**
that use the stale runbook `deploy.json` (which omits them). Without them, allocation AND calling
throw "Flyn Voice is not configured / platform credentials are not configured." Always pull the
LIVE config and add to it when deploying — never deploy from the runbook JSON.

---

## Git Workflow

- Bug fixes: commit directly to `main`, no feature branches.
- Never hardcode secrets, never commit `.env` files.
- Never `npm install` in throwaway `/tmp` projects for static analysis.
