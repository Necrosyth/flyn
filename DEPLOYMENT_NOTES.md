# SNI Hostname Detection Deployment Status

## What's Done
✅ **Code changes committed and tested**
- Commit `efc8971c`: SNI hostname detection implementation
  - Added SNI (Server Name Indication) from TLS handshake as primary hostname source
  - Falls back to X-Forwarded-Host (Cloudflare), then Host header
  - Comprehensive logging added for domain resolution debugging
  - Enables custom domains to work through any proxy (not just Cloudflare)

✅ **Tests fixed and passing**
- Commit `1b6c30d7`: Updated app.controller.spec.ts to work with new dependencies
- All app-controller tests passing

✅ **Docker image built successfully**
- Image: `058264378005.dkr.ecr.us-east-1.amazonaws.com/flyn-api:sni-20260509-143536-amd64`
- SHA: `cea92c677ac8fab26172f6e90493d2dd73814a89155c5de540e4fbb620bbeb05`

## Deployment Blocker
❌ **AWS credentials issue**
- Current credentials (ansh user) are in account `786150347998`
- Production ECR and App Runner are in account `058264378005`
- Cross-account push blocked with 403 Forbidden
- Previous App Runner deployment stuck in OPERATION_IN_PROGRESS

## What's Needed
1. **AWS Credentials for production account (058264378005)**
   - Need IAM credentials with ECR push and App Runner update permissions
   - OR cross-account role assumption configured

2. **Deploy Docker image to ECR**
   ```bash
   aws ecr get-login-password --region us-east-1 --profile <prod-profile> | \
     docker login --username AWS --password-stdin 058264378005.dkr.ecr.us-east-1.amazonaws.com
   docker push 058264378005.dkr.ecr.us-east-1.amazonaws.com/flyn-api:sni-20260509-143536-amd64
   ```

3. **Update App Runner service**
   - Use the timestamped tag instead of "latest" to avoid the stuck deployment issue
   - Tag: `sni-20260509-143536-amd64`

## How It Works
Once deployed, the root handler will:
1. Try to get hostname from `X-Forwarded-Host` header (Cloudflare custom domains)
2. If HTTPS and no X-Forwarded-Host, extract from TLS SNI (works through any proxy)
3. Fall back to `Host` header (direct connections)
4. Log all sources for debugging

This solves the issue where App Runner's VPC connection replaces the Host header with an internal IP (169.254.x.x:3000), making test.myflynai.com return 404.

## Recent Context
- Cloudflare custom hostname for test.myflynai.com is configured with DNS validation
- Website exists in Firestore: websiteId=8cc07937-7ae2-4970-baa8-08c34a032b52
- HTML content is stored and ready to serve (22974 bytes)
