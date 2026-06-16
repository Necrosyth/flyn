# Relay WebSocket Host — Production Fix Runbook (ALB + Fargate)

**The problem, proven:** AWS App Runner **cannot carry an inbound WebSocket**. Its Envoy front proxy
rejects the upgrade *before* the app runs. Evidence captured on prod:

| Request to `…/api/voice/relay` | Result | Means |
|---|---|---|
| WS **upgrade** | `HTTP/1.1 403 Forbidden`, `server: envoy`, no Express headers | Envoy blocks it before the app |
| Normal **GET** | `404` from Express (`x-powered-by: Express`) | HTTP reaches the app fine |

→ Twilio error **64102** "Unable to connect to websocket URL"; caller hears "application error." The
relay **code is correct** — the host is wrong. (Test agent reverted to `gather`; production safe.)

**The fix:** keep App Runner as the primary backend for ALL HTTP; route **only** the relay WebSocket
through an **ALB → ECS Fargate** running the **same backend image**, on a dedicated subdomain
(`relay.myflynai.com`). No code fork — same image, two runtimes.

---

## R0 — AWS path, confirmed from docs

| Claim | Verdict | Source |
|---|---|---|
| App Runner does NOT support inbound WebSockets | ✅ Confirmed (long-standing, most-requested gap) | [aws/apprunner-roadmap #13](https://github.com/aws/apprunner-roadmap/issues/13) · matches our 403/envoy evidence |
| ALB supports WebSocket upgrades | ✅ Yes, by default | [ALB docs](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html) |
| ALB idle timeout — default + **max** | default **60s**; **max 4000s** (66m40s) | [ELB idle timeout](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html) |
| API Gateway WebSocket API — for this use | ❌ **Rejected** | see reason ↓ |

**Why NOT API Gateway WebSocket API:** it is Lambda-per-message with connection state in DynamoDB and
a `@connections` callback to push to the socket. For low-latency, token-by-token TTS streaming with
**held call state in memory** (our `RelayCallState` + in-flight `AbortController` for barge-in), that
model is a poor fit — every token would be a Lambda invoke + a management-API call, state can't live in
process, and cold starts add jitter to a real-time voice loop. ALB+Fargate keeps the socket and the
call state in **one long-lived process**, exactly as the gateway is written.

**Decision:** **ECS Fargate** (same `flyn-platform/backend` image) behind an **internet-facing ALB**,
HTTPS:443 with an ACM cert on **`relay.myflynai.com`**, target group → the Fargate task, **ALB idle
timeout = 4000s** so a held call socket survives multi-minute silence gaps.

---

## R1 — CODE (DONE, on `main`, commit `265d84d4`)

`buildRelayTwiml` now builds the wss URL from **`RELAY_WS_PUBLIC_HOST`** when set (the ALB host),
falling back to `PUBLIC_BACKEND_URL` when unset (local dev). Everything else stays App Runner.
Proven: set → `wss://relay.myflynai.com/api/voice/relay?token=…`; unset → App Runner host; identical
token both ways (token is HMAC over callSid only — host-independent).

> 🔑 **The #1 thing to get right — SECRET PARITY.** The token is **signed on App Runner** (in
> `buildRelayTwiml`) and **verified on Fargate** (in the gateway at `setup`). `RELAY_WS_SECRET` (or its
> fallback `FLYN_TWILIO_AUTH_TOKEN`) **MUST be byte-identical on both services.** A mismatch → the
> gateway 403s Twilio → 64102 again. Set the SAME value on App Runner env AND the Fargate task env.

---

## R2 — INFRA (YOU provision; check how infra is managed first)

> Account note (from `DEPLOYMENT_NOTES.md`, newer than the Feb-2026 reference): prod may be
> `058264378005` / `flyn-api`, not `786150347998` / `flyn-backend`. **Confirm the live account first.**

1. **ECS Fargate service** — SAME backend Docker image as App Runner, SAME env + secrets:
   `FIREBASE_SERVICE_ACCOUNT_B64`, `GEMINI_API_KEY`, `FLYN_TWILIO_ACCOUNT_SID`,
   `FLYN_TWILIO_AUTH_TOKEN`, **`RELAY_WS_SECRET` (identical to App Runner)**. Container port = the app
   port (3000). (Brevo vars NOT needed — the relay path doesn't touch Brevo.)
2. **Internet-facing ALB** — HTTPS:443 listener, ACM cert for `relay.myflynai.com`, target group →
   the Fargate task, health check on **`/api/health`**. WebSocket works on ALB by default.
   **Set idle timeout = 4000s** (`aws elbv2 modify-load-balancer-attributes --attributes
   Key=idle_timeout.timeout_seconds,Value=4000`). Enable target-group stickiness.
3. **Security groups:** ALB ingress 443 from the internet (Twilio's egress is not a fixed range);
   Fargate ingress **only** from the ALB SG.
4. **DNS:** `relay.myflynai.com` → the ALB (A/ALIAS).
5. **App Runner env:** set **`RELAY_WS_PUBLIC_HOST=relay.myflynai.com`**. ⚠️ Pull the **LIVE** App
   Runner config and ADD to it — do NOT deploy from the stale runbook JSON (it wipes
   `FLYN_TWILIO_*` / `BREVO_*` / etc — the known gotcha). Confirm `RELAY_WS_SECRET` matches Fargate.
6. **Fargate egress:** reaches Firestore + Gemini + Twilio (none IP-allowlisted) — no allowlist work.

---

## R2-AS-BUILT (2026-06-12) — what was actually deployed + the Cloudflare fork

The infra was built via Terraform (`infra/relay-ws/`) and **differs from the spec above** in one
important way: `relay.myflynai.com` is **Cloudflare-PROXIED (orange-cloud) → ALB HTTP:80**, NOT
grey-cloud → ALB HTTPS:443. Recorded so the next person knows the real topology.

**Confirmed working:**
- ECS Fargate service up (same image `deploy-…-compare`, 64 env + 7 secrets copied from App Runner;
  the App Runner instance role's 7 **inline** policies were copied onto `flyn-relay-ws-task`).
- ALB `flyn-relay-ws-1005903013.us-east-1.elb.amazonaws.com`, idle_timeout **4000**, health `/api/health`.
- **WS handshake DIRECT to the ALB → `101 Switching Protocols`** ✅ (independently re-verified). The
  AWS layer carries the WebSocket. This is the goal.
- Cloudflare CNAME `relay.myflynai.com → ALB` (proxied), `websockets=on`.

**The remaining blocker + fix (Cloudflare edge, NOT the ALB):**
- Through Cloudflare the handshake returns **403 `server: cloudflare`** (edge block, not origin).
- Cause: zone has **Browser Integrity Check ON** (403s the non-browser WS upgrade) + **SSL=Full**
  (CF wants HTTPS origin; ALB is HTTP:80).
- Fix = a Cloudflare **Configuration Rule scoped to `relay.myflynai.com` only** (`ssl: flexible`,
  `bic: false`). Scoped so it does NOT affect `app.myflynai.com`. ✅ safe.

**⚠️ Two risks this orange-cloud topology carries (the spec's grey-cloud avoided both):**
1. **Cloudflare ~100s WebSocket idle timeout** (non-Enterprise). A held call socket through a silence
   gap > ~100s can be dropped by Cloudflare — and **`ALB idle_timeout=4000` does NOT help** because
   CF is now the shorter timeout. CR sends keepalives so it *may* hold, but **must be proven with a
   real call that includes a long silence.**
2. **Flexible SSL = plaintext CF→ALB leg** + ALB HTTP:80 open to `0.0.0.0/0`. **Lock the ALB ingress
   SG to Cloudflare IP ranges** if staying orange-cloud.

**Cleaner end-state (do if the CF idle timeout proves flaky):** flip `relay.myflynai.com` to
**grey-cloud (DNS-only)** + add an **ALB HTTPS:443 listener with an ACM cert** for the subdomain.
Removes Cloudflare from the WS path entirely → no BIC, no config rule, no CF idle timeout, end-to-end
TLS. (The ALB currently has HTTP:80 only by design, to lean on Cloudflare for TLS.)

---

## R2.5 — POST-CONFIG-RULE VERIFICATION (run in this exact order)

After the Cloudflare config rule is applied, before any real call:

**Step 1 — Handshake must flip 403 → 101 through Cloudflare.**
```bash
curl -s -i --http1.1 -m 10 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://relay.myflynai.com/api/voice/relay?token=test" | head -5
```
- ✅ `101 Switching Protocols` (or our gateway's `401` for a bad token) = Cloudflare→ALB→app works.
- ❌ `403 server: cloudflare` = config rule not applied / not propagated (wait 30s, re-check).
- ❌ `403 server: envoy` = pointed back at App Runner (wrong).

**Step 2 — SECRET PARITY (the #1 break risk). Confirm identical on BOTH services.**
The token is signed on App Runner (`buildRelayTwiml`) and verified on Fargate (gateway `setup`).
`RELAY_WS_SECRET` — or its fallback `FLYN_TWILIO_AUTH_TOKEN` — must be **byte-identical** on the App
Runner service env AND the Fargate task env. The `gen-env.sh` copy *should* have carried it (same 7
secrets), but verify explicitly:
```bash
# App Runner side (whichever var the signer uses — RELAY_WS_SECRET if set, else FLYN_TWILIO_AUTH_TOKEN)
aws apprunner describe-service --service-arn <app-runner-arn> \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' --output json | grep -iE "RELAY_WS_SECRET|FLYN_TWILIO_AUTH_TOKEN"
# Fargate side
aws ecs describe-task-definition --task-definition flyn-relay-ws \
  --query 'taskDefinition.containerDefinitions[0].environment' --output json | grep -iE "RELAY_WS_SECRET|FLYN_TWILIO_AUTH_TOKEN"
```
A mismatch → gateway 403s Twilio → **64102 again**. (Secrets pulled from Secrets Manager appear as
`secrets`, not `environment` — check both.)

**Step 3 — Point App Runner's TwiML at the relay host.**
Set **`RELAY_WS_PUBLIC_HOST=relay.myflynai.com`** on the App Runner service. ⚠️ Pull the **LIVE**
config and ADD to it — do NOT redeploy from the stale runbook JSON (wipes `FLYN_TWILIO_*`/`BREVO_*`).
Verify after the deploy settles:
```bash
curl -s -X POST "https://api.myflynai.com/api/channels/webhook/twilio/voice?tenantId=<t>&agentId=<relay-agent>" \
  -d "CallStatus=in-progress" -d "CallSid=CAprobe123" | grep -oE 'wss://[^"?]+'
# Expect: wss://relay.myflynai.com/api/voice/relay   (NOT pjpmzvu7wn… App Runner)
```

**Step 4 — Flip exactly ONE throwaway agent** to `voiceEngine:'relay'` (never production).

**Step 5 — One real PSTN call.** Watch BOTH log streams (App Runner for the TwiML route; **Fargate/
CloudWatch** `/ecs/flyn-relay-ws` for the WS gateway). Walk the R3 table below. **Include a deliberate
~2-minute silence mid-call** to test the Cloudflare idle-timeout risk.

---

## R3 — VERIFY, then ROLL OUT

1. **Raw handshake** (before any call):
   ```bash
   # must NOT be an envoy 403. A 101 (accepted) or our own 401 (missing/bad token) = WS reaches our app.
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     https://relay.myflynai.com/api/voice/relay?token=test
   ```
   - `101` or `401` (our app) → host is correct ✅
   - `403` `server: envoy` → still hitting App Runner / blocked ❌
2. **One real call** — flip ONE throwaway agent to `voiceEngine:'relay'`, place a PSTN call. Confirm
   the log chain across the **two** services:
   - **App Runner** (TwiML route): `voice_engine_relay` (the HTTP voice webhook still hits App Runner)
   - **Fargate / CloudWatch `/ecs/flyn-relay-ws`** (the WS gateway): `[relay] setup ok` →
     `relay_context_loaded` → `relay_turn_done firstTokenMs=…` → on barge-in `[relay] interrupt` →
     on hangup socket close.
   Then: fast first audio; barge-in stops the AI; hang up → call-end summary + `calls.minutes` usage
   fire; transcript/records match a gather call; **no 64102**; and the **~2-min silence did NOT drop
   the socket** (the Cloudflare idle-timeout check).
3. **Global default flip — ONLY after that real call passes.** Change routing so `voiceEngine !== 'gather'`
   is treated as relay (relay becomes the default for all agents, all tenants), keeping
   `voiceEngine:'gather'` as the per-agent escape hatch. (This is a small code change — a separate
   commit made only post-proof.)

---

## Instant rollback (any point, zero deploy)
- One flagged agent misbehaves → set its `voiceEngine` back to `'gather'` (one Firestore field).
- After the global flip, a regression → revert the routing default (one-line code revert) **or**
  set `RELAY_WS_PUBLIC_HOST` empty (relay TwiML can't build → every agent falls back to `<Gather>`).
- Production default today is `gather`; nothing is at risk until the global flip, which waits for the
  real-call proof.

---

## One-line summary
App Runner can't carry a WebSocket (Envoy 403s the upgrade — proven). Keep App Runner primary; add
**ALB + Fargate (same image) on `relay.myflynai.com`** for the socket only; set
`RELAY_WS_PUBLIC_HOST` on App Runner with a **matching `RELAY_WS_SECRET`**, ALB idle timeout **4000s**;
prove the host with a 101/401 handshake, then one real call, then flip the global default.
