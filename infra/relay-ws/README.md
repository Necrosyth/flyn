# Flyn relay-ws — Terraform (ECS Fargate + ALB for the voice WebSocket)

Stands up a **WebSocket-capable** home for ONE endpoint (`/api/voice/relay`) by running the
**same `flyn-backend` image** on Fargate behind an ALB. App Runner cannot accept inbound
WebSockets (Envoy 403s the upgrade); everything else stays on App Runner.

Full context + the why: `../../docs/aws-relay-fargate-handoff.md`.

## Prereqs
- `aws` CLI logged into account **786150347998** (`us-east-1`), and `terraform` + `jq`.

## Steps

```bash
cd infra/relay-ws

# 1) Pull the live App Runner env/secrets/image (writes container-env.auto.tfvars.json — gitignored)
chmod +x gen-env.sh && ./gen-env.sh

# 2) Fill in your account's networking + task perms
cat > terraform.tfvars <<'EOF'
vpc_id            = "vpc-XXXXXXXX"             # default VPC is fine
public_subnet_ids = [
  "subnet-03e99d4750321df27",
  "subnet-0a51411e63ff86269",
  "subnet-0504a9b926b5a52c6"
]
# Attach the SAME policies as flyn-backend-apprunner-instance-role so the app
# has identical runtime AWS perms (S3, DynamoDB, etc.). List its policy ARNs:
#   aws iam list-attached-role-policies --role-name flyn-backend-apprunner-instance-role
task_role_policy_arns = [
  # "arn:aws:iam::786150347998:policy/...."
]
EOF

# 3) Apply
terraform init
terraform apply
```

`terraform output alb_dns_name` → the ALB hostname.

## After apply (the last mile)
1. **Cloudflare:** add `relay.myflynai.com` → the ALB DNS name, **CNAME, proxied (orange cloud ON)**.
   Cloudflare provides TLS + passes WebSockets, so no ACM cert is needed (the listener stays HTTP:80).
2. **Verify** the WebSocket reaches the app (not Envoy):
   ```bash
   # expect HTTP/1.1 101 (or the app's 401) — NOT 403 server: envoy
   curl -s -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
     "https://relay.myflynai.com/api/voice/relay?token=test" | head
   ```
3. Tell the Flyn team. They set `RELAY_WS_PUBLIC_HOST=relay.myflynai.com` on App Runner, flip one
   test agent, place one real call, then enable for all agents.

## Critical settings (already encoded here)
- ALB `idle_timeout = 4000` — keeps the call's WebSocket open through silences.
- Health check `/api/health` (200).
- Container port **3000**, `PORT=3000`.
- `FLYN_TWILIO_AUTH_TOKEN` comes from the App Runner env copy → matches App Runner → WS auth works.
  (If you prefer, set a dedicated `RELAY_WS_SECRET` to the **same value** on both App Runner and here.)

## Want TLS at the ALB instead of Cloudflare?
Set `enable_https = true` and `acm_certificate_arn = "<cert for relay.myflynai.com>"` in
`terraform.tfvars` (cert must be DNS-validated via Cloudflare). The Cloudflare record can then be
DNS-only. The recommended/simpler path is Cloudflare-proxied + HTTP:80 above.

## Rollback
`terraform destroy` removes the entire Fargate+ALB stack. Nothing else (App Runner, etc.) is
touched. Unsetting `RELAY_WS_PUBLIC_HOST` on App Runner also instantly reverts calls to the old
engine.
