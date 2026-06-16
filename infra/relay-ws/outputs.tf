output "alb_dns_name" {
  description = "Point Cloudflare CNAME relay.myflynai.com at this (proxied / orange cloud)."
  value       = aws_lb.relay.dns_name
}

output "next_steps" {
  value = <<-EOT
    1. In Cloudflare: add CNAME  relay.myflynai.com -> ${aws_lb.relay.dns_name}  (PROXIED / orange cloud)
       → Cloudflare gives TLS + WebSocket passthrough automatically.
    2. Flyn team sets on the App Runner service:  RELAY_WS_PUBLIC_HOST = relay.myflynai.com
    3. Verify:  wss://relay.myflynai.com/api/voice/relay?token=test  → 101 (or app 401), NOT envoy 403.
    4. Flyn team: flip one test agent to relay, place one real call, then enable for all agents.
  EOT
}
