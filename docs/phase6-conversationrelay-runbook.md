# Phase 6 Runbook — Real-Call Activation of Twilio ConversationRelay

**Status as of this doc:** Phases 0–5 shipped to `main` (0 unpushed). Production runs 100% on the
`<Gather>` engine. Relay is **dormant** — reachable only by an agent with `voiceEngine:'relay'`, of
which there are **zero**. This runbook is the exact sequence to take relay live, safely, the moment
the prod deploy lands.

> Built artifacts this runbook references (all on `main`):
> - WS endpoint: `POST/UPGRADE /api/voice/relay` (raw `ws`, scoped to that path; socket.io `/webrtc` untouched)
> - Per-agent flag: `agent.voiceEngine: 'gather' | 'relay'` (default `gather`)
> - Per-agent model override: `agent.voiceModel` (relay default `gemini-2.5-flash-lite`; set `'gemini-2.5-flash'` to revert)
> - Token: `signRelayToken(callSid)` = HMAC-SHA256 over callSid with `RELAY_WS_SECRET` (falls back to `FLYN_TWILIO_AUTH_TOKEN`)
> - Key log events: `voice_engine_relay`, `voice_engine_relay_fallback_gather`, `[relay] setup ok`, `relay_context_loaded`, `relay_turn_done`, `[relay] interrupt`, `relay_turn_interrupted`

---

## 0. THE REAL BLOCKER — a deploy, not the checklist

Production App Runner is running **old code**:
- `https://pjpmzvu7wn.us-east-1.awsapprunner.com/api/voice/relay` → **404** (relay code not live)
- `PUBLIC_BACKEND_URL` currently points at a **dead Cloudflare dev tunnel** (`space-senators-…trycloudflare.com`)

All Phase 1–5 commits are on `main` and pushed — they are simply **not deployed**. Gates (b) and (c)
below **cannot be verified until the new code is live on prod.**

### ⚠️ Deploy-account discrepancy — resolve before pushing
The two deployment docs disagree on which AWS account hosts prod:

| Doc | Account | ECR repo | App Runner |
|---|---|---|---|
| `AWS_DEPLOYMENT_REFERENCE.md` (Feb 2026) | `786150347998` | `flyn-backend` | `flyn-backend` |
| `DEPLOYMENT_NOTES.md` (May 2026, newer) | **`058264378005`** | **`flyn-api`** | (prod) |

`DEPLOYMENT_NOTES.md` explicitly records that the `786150347998` (ansh) credentials were **403-blocked
cross-account** when pushing to prod, implying **prod moved to `058264378005` / `flyn-api`**. **Confirm
the live account/repo before pushing** — pushing to the Feb-2026 account may update a stale service.

### Deploy flow (from the docs — for reference; YOU run this)
```bash
# 1. Login to the CORRECT prod ECR (confirm account: 058264378005 per the newer note)
aws ecr get-login-password --region us-east-1 --profile <prod-profile> \
  | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com

# 2. Build for linux/amd64 (App Runner requirement), tag with a timestamp (NOT "latest" — avoids the stuck-deploy issue)
docker buildx build --platform linux/amd64 \
  -t <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/<REPO>:relay-$(date +%Y%m%d%H%M%S)-amd64 \
  -f flyn-platform/backend/Dockerfile --push flyn-platform/backend

# 3. Update the App Runner service to the new timestamped tag (CLI or Console)
```

### 🔴 Env-var survival (the stale-runbook wipe gotcha — CLAUDE.md)
When updating App Runner, **pull the LIVE config and add to it** — do NOT deploy from a runbook
`deploy.json` that omits env vars (it wipes them). Confirm ALL of these survive the deploy:
- `PUBLIC_BACKEND_URL` → **set to the App Runner host** `https://pjpmzvu7wn.us-east-1.awsapprunner.com`
  (NOT the dead tunnel). This is what `buildRelayTwiml` derives the `wss://` URL from; if empty/stale →
  relay silently falls back to `<Gather>` (`voice_engine_relay_fallback_gather` in logs).
- `FLYN_TWILIO_ACCOUNT_SID`, `FLYN_TWILIO_AUTH_TOKEN` (the latter is also the relay WS secret fallback)
- `GEMINI_API_KEY`
- `BREVO_API_KEY`, `BREVO_INBOUND_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_B64` (Secrets Manager)
- *(optional)* `RELAY_WS_SECRET` — if you set it, it must be set on the one service only; the TwiML
  builder and the gateway both read the same env, so they stay matched automatically.

---

## 1. Account checklist (in order)

- [x] **(a) AI/ML Addendum — DONE.** "Predictive & Generative AI/ML Features Addendum accepted" (green
  banner confirmed in the Twilio Console). No action needed.
- [ ] **(b) `PUBLIC_BACKEND_URL` = prod host, survives deploy.** Set to the App Runner host; confirm it
  survives per the wipe gotcha above. **Verifiable only after deploy.**
- [ ] **(c) App Runner holds the WebSocket through a multi-minute call**, including silence gaps. A
  relay call holds ONE socket open for the whole call. Check App Runner idle/request timeout — if it's
  shorter than a realistic silence gap, a held socket drops mid-call (no fallback possible). **Verifiable
  only after deploy + the real-call test (row 7 below will surface a drop).**
- [ ] **(d) Flip exactly ONE throwaway test agent** to `voiceEngine:'relay'` — never a production agent.

---

## 2. Verify-before-call (immediately after deploy)

```bash
# Relay code is live when this STOPS returning 404 (a WS-upgrade attempt = relay route mounted)
curl -i https://pjpmzvu7wn.us-east-1.awsapprunner.com/api/voice/relay
# Expect: NOT 404. A 400/426 "Upgrade Required" or a 401 (missing token) = route is live.
```
Also confirm the boot log shows `[relay] ConversationRelay WS attached at /api/voice/relay`.

---

## 3. The real-call test — flip ONE throwaway agent, place a call, walk the table

Set the single field on a **non-production** agent: `voiceEngine: 'relay'`. (Optional: `voiceModel:
'gemini-2.5-flash'` to compare against the flash-lite default.) Place a call to it; watch App Runner logs.

| # | Verify | Signal |
|---|---|---|
| 1 | TwiML routed to relay | `voice_engine_relay` log (NOT `…_fallback_gather` → that means PUBLIC_BACKEND_URL missing) |
| 2 | Twilio opens the WS (proves addendum + reachable wss) | `[relay] setup ok callSid=…`. **No setup log = wss unreachable or addendum issue.** |
| 3 | setup carries customParameters | `[relay] setup ok … tenant=<id> agent=<id>` (`<Parameter>` tenantId/agentId landed) |
| 4 | Context loaded once | `relay_context_loaded … grounded:true model:gemini-2.5-flash-lite` |
| 5 | Measured first-audio latency | `relay_turn_done firstTokenMs=…` per turn; compare felt latency to a gather call. CR latency is **measured, not a Twilio-documented spec.** |
| 6 | Barge-in mid-reply | speak over the AI → `[relay] interrupt` + `relay_turn_interrupted`; AI must stop **immediately** |
| 7 | Graceful end + call-end fires | hang up → socket close logged; `handleAiCallStatus` still runs (StatusCallback 'completed') → call summary generated + `calls.minutes` usage incremented (must match gather) |
| 8 | Records match gather | post-call: transcript subcollection + analytics turns exist (same shape as gather); a confirmed-appointment turn fires the email (shared `maybeFireAppointmentEmail`) |

**Pass = all 8 green on the throwaway agent.** Felt latency should be noticeably below gather (no STT
batch tail + flash-lite + zero per-turn Firestore).

---

## 4. Instant rollback — one field, zero deploy

Revert = set the test agent's `voiceEngine` back to `'gather'` (or delete the field). Single Firestore
write; effective on the **next call**; no redeploy/restart. Production default is already `gather`, so
only the one flipped agent ever touches relay — nothing else is at risk.

```js
db.collection('agents').doc('<test-agent-id>').update({ voiceEngine: 'gather' })
```

---

## 5. Remaining in-call work that lands DURING Phase 6 (deferred from Phase 5 — noted, not silent)

Built **after** the basic relay call is verified green:

1. **Per-turn `{type:"language"}` switching** — mid-call language changes. Today relay sets the initial
   language at setup. To match the gather path's sticky per-turn language detection, the gateway will
   read the caller's language from the `prompt` message's `lang` field (CR provides it) and emit a
   `{type:"language", ttsLanguage, transcriptionLanguage}` message when it changes + update the
   system-prompt directive.
2. **Live barge-in confirmation** — proven mechanically locally (abort fires); confirm it *feels* right
   on a real call (AI stops within human-reaction time). Tune `interruptSensitivity` if needed.
3. **Optional:** `maxCallDuration` enforcement parity (CR has its own session limits — decide if our cap
   needs replicating), and `eotThreshold` + Deepgram **flux** model (SIGNAL 2026 turn-detection upgrade)
   for even snappier endpointing.

---

## One-line summary
Deploy the new code to the **correct** prod account (confirm `058264378005`/`flyn-api` vs the stale
Feb-2026 reference), set `PUBLIC_BACKEND_URL` to the App Runner host and keep all env vars through the
deploy, `curl /api/voice/relay` until it stops 404'ing, flip ONE throwaway agent to `voiceEngine:'relay'`,
and walk the 8-row table on a real call. Anything off → set that one agent back to `gather` (instant,
zero-deploy, zero production risk).
