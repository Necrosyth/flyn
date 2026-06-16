# HANDOFF: Add a WebSocket-capable host for Flyn's voice-AI relay (AWS)

> Forward this to the AWS engineer. It is self-contained: context → exact build → gotchas → verify.
> Companion Terraform: `infra/relay-ws/` (review + `apply`).

## 1. Context — what this is and why we need it

We upgraded Flyn's AI phone calls from a slow request/response model (~4–5s lag) to **real-time
streaming** using **Twilio ConversationRelay**. It's now sub-second and natural. The code is
**done, deployed, and proven on real calls** (human↔AI and AI↔AI), sub-second, no errors.

**The one problem:** ConversationRelay needs Twilio to open a **persistent WebSocket** to our
backend. Our backend runs on **AWS App Runner**, and **App Runner's proxy (Envoy) refuses
WebSocket upgrades** — it returns `403 Forbidden` before the request reaches our app.
Proven on prod: a WS upgrade to `/api/voice/relay` → `403 server: envoy`; a normal `GET` → `404`
from our Express app. So normal HTTP works; WebSockets are blocked at the App Runner layer. This
is a known App Runner limitation (no inbound WebSocket support).

**The fix (this task):** run the **same backend image** on a service that **does** allow
WebSockets — **ECS Fargate behind an ALB** — and route **only** the WebSocket endpoint there.
Everything else stays on App Runner unchanged. We proved this works: the same image + a Cloudflare
tunnel (which passes WebSockets) → a real call connected and ran perfectly. We just need the
production equivalent.

**Mental model (what worked locally → what you build):**

| Worked locally | Build on AWS |
|---|---|
| Backend image running on a laptop | **ECS Fargate** running the **same** `flyn-backend` image |
| Cloudflare tunnel (public URL that passes WebSockets) | **ALB** (stable endpoint) + Cloudflare-proxied subdomain (TLS + WS) |
| Local `.env` | Same env vars + same Secrets Manager refs the App Runner service uses |
| `RELAY_WS_PUBLIC_HOST = <tunnel>` | `RELAY_WS_PUBLIC_HOST = relay.myflynai.com` (set on App Runner) |

**Nothing about the application changes.** Same image, same code, same env. You're only giving one
endpoint a WebSocket-capable home.

## 2. Environment facts (already verified)

- **AWS account:** `786150347998`, region **`us-east-1`**
- **Existing prod backend (leave as-is):** App Runner service **`flyn-backend`** →
  `pjpmzvu7wn.us-east-1.awsapprunner.com` (custom domain `api.myflynai.com`)
- **Container image:** the **same image `flyn-backend` App Runner currently runs**
  (ECR `786150347998.dkr.ecr.us-east-1.amazonaws.com/flyn-backend`, current tag e.g.
  `deploy-20260612145007-compare-amd64`). It already contains the relay code. Use the identical tag.
- **Container port:** `3000` (app reads `PORT`).
- **Health endpoint:** `GET /api/health` → 200
- **WebSocket endpoint (the only thing needing the new host):** `GET /api/voice/relay` (WS upgrade)
- **App Runner instance role (mirror its perms on the Fargate task role):**
  `arn:aws:iam::786150347998:role/flyn-backend-apprunner-instance-role`
- **Env + secrets:** ~60 plain env vars + **7 Secrets Manager refs**
  (`FIREBASE_SERVICE_ACCOUNT_B64`, `VAPI_API_KEY`, `VAPI_PUBLIC_KEY`, `ANTHROPIC_API_KEY`,
  `STRIPE_SECRET_KEY`, `CHATWOOT_MASTER_API_TOKEN`, `NOCOBASE_ADMIN_PASSWORD`).
  Replicate the full set onto the Fargate task (same plain values, same secret ARNs).
  *(The Terraform `gen-env.sh` does this automatically from the live App Runner config.)*
- **Networking:** default VPC, public subnets exist
  (`subnet-03e99d4750321df27`, `subnet-0a51411e63ff86269`, `subnet-0504a9b926b5a52c6`, …).
- **DNS:** managed in **Cloudflare** (Route 53 is empty; app has `CLOUDFLARE_*` env). So the
  `relay.myflynai.com` record is added in **Cloudflare**, not Route 53.

## 3. What to build

1. **ECS cluster** (Fargate) in `us-east-1`.
2. **Task definition:** the same `flyn-backend` image; port **3000**, `PORT=3000`; the App Runner
   service's full env (~60 vars) **+** the same 7 Secrets Manager secret refs; execution role
   (ECR pull + read those secrets); task role (same AWS perms as the App Runner instance role).
3. **ECS Fargate service:** 1–2 tasks in public subnets; SG allows inbound **3000 from the ALB SG
   only**.
4. **ALB (internet-facing):** target group → Fargate **:3000**, health check **`/api/health`**
   (200). Listener **:80** if Cloudflare fronts TLS (recommended), or **:443** with an ACM cert for
   `relay.myflynai.com`. **⚠️ Set ALB idle timeout to `4000`s.**
5. **Security groups:** ALB inbound 80/443; Fargate inbound 3000 from ALB SG only.
6. **DNS (Cloudflare):** `relay.myflynai.com` → **ALB DNS name**, **CNAME, proxied (orange cloud
   ON)** → free TLS + WebSocket passthrough.
7. **App Runner env (one var):** add `RELAY_WS_PUBLIC_HOST=relay.myflynai.com`. ⚠️ Pull the **live**
   App Runner env and ADD to it — don't redeploy from a stale runbook that omits env vars (would
   wipe `FLYN_TWILIO_*`, `BREVO_*`, etc.).

## 4. The 4 settings that are make-or-break

1. **WebSocket must pass through** — ALB supports WS natively; Cloudflare-proxied passes WS. (This
   is the entire reason for the task — App Runner's Envoy blocked it.)
2. **ALB idle timeout = 4000s** — or the socket drops mid-call during a silence and the call dies.
3. **`FLYN_TWILIO_AUTH_TOKEN` byte-identical on Fargate ↔ App Runner** — the app signs/verifies the
   WS auth token (HMAC over the call SID) with it. Mismatch → gateway rejects Twilio → error
   `64102 "Unable to connect to websocket URL"`. (Replicating the App Runner env handles this.
   Or set a dedicated `RELAY_WS_SECRET` to the **same value on both** services.)
4. **Health check `/api/health` → 200** — or the ALB keeps cycling the task.

## 5. Verify (in order)

1. Fargate task **healthy** in the target group (`/api/health` passing).
2. Raw WS handshake to the new host returns **101** (or app `401`), **NOT** `envoy 403`:
   `wss://relay.myflynai.com/api/voice/relay?token=test`
   - `101`/`401` = WS reaches our app → host correct.
   - `403 server: envoy` = still blocked (wrong path / not through ALB).
3. Tell the Flyn team when 1–2 pass. They set `RELAY_WS_PUBLIC_HOST` on App Runner, flip one test
   agent, place one real call (sub-second, clean), then enable for all agents.

## 6. Guardrails / rollback

- **Don't change the App Runner service** other than adding `RELAY_WS_PUBLIC_HOST`. All HTTP stays
  on App Runner.
- **Additive:** until `RELAY_WS_PUBLIC_HOST` is set + agents flipped, prod keeps the old engine.
  Zero risk during the build.
- **Rollback:** unset `RELAY_WS_PUBLIC_HOST` (relay falls back to old engine) and/or
  `terraform destroy` the Fargate+ALB stack. Nothing else affected.

## TL;DR
Run our existing `flyn-backend` image on **ECS Fargate** behind an **ALB** (idle timeout **4000s**,
health `/api/health`, port **3000**, same env + secret refs as App Runner), put a
**Cloudflare-proxied `relay.myflynai.com`** in front of the ALB, and report the ALB DNS name +
confirm `wss://relay.myflynai.com/api/voice/relay` returns 101. The Flyn team handles the App
Runner env var + go-live.
