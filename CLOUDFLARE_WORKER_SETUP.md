# Cloudflare Worker Setup Guide

## Problem
Custom domains aren't being routed to your website because App Runner's Envoy proxy is filtering by hostname. The original hostname information is lost in the proxy chain.

## Solution
Use a Cloudflare Worker to inject the original hostname as a custom header (`CF-Original-Host`) before forwarding to App Runner. The NestJS backend now checks for this header first.

## Deployment Steps

### 1. Access Cloudflare Dashboard
- Go to https://dash.cloudflare.com
- Select your account and domain (myflynai.com)

### 2. Create Worker
- Click "Workers & Pages" in the left sidebar
- Click "Create" → "Create Worker"
- Paste the code from `cloudflare-worker.js` into the editor
- Click "Deploy"

### 3. Configure Worker Route
- In the Worker settings, go to "Routes"
- Add a new route:
  - **Route:** `*.myflynai.com/*`
  - **Worker:** (select the worker you just created)
- Also add:
  - **Route:** `myflynai.com/*`

### 4. Verify
- The Worker will now:
  1. Intercept requests to any subdomain of myflynai.com
  2. Extract the original hostname (e.g., test.myflynai.com)
  3. Inject it as `CF-Original-Host` header
  4. Forward the request to App Runner

### 5. Test
```bash
curl -i https://test.myflynai.com/
```

Expected flow:
- Request hits Cloudflare Worker
- Worker injects `CF-Original-Host: test.myflynai.com`
- Request reaches App Runner → NestJS
- NestJS reads `CF-Original-Host` header
- NestJS looks up the website for test.myflynai.com
- Website HTML is served

## Key Changes Made

### Backend (app.controller.ts)
- Added `CF-Original-Host` as the first priority header to check
- Falls back to other headers if needed
- Logs the header values for debugging

### How It Works
1. Custom domain request → Cloudflare Worker
2. Worker injects `CF-Original-Host: <original-hostname>`
3. Worker proxies to App Runner
4. NestJS receives request with hostname in header
5. NestJS resolves website by domain and serves HTML

## Next Steps
1. Deploy the Cloudflare Worker
2. Update Cloudflare DNS records:
   - Remove CNAME records for test.myflynai.com
   - Keep main myflynai.com DNS as is (for platform)
3. Test with `curl https://test.myflynai.com/` and verify custom domain works
4. Users can now connect their own domains using the same setup

## Troubleshooting

### 404 Still Returned
- Check Cloudflare Worker logs in the dashboard
- Verify the route pattern matches your domain
- Check App Runner logs for `cf-original-host` header in logs

### Worker Deploy Failed
- Ensure the code is valid JavaScript
- Check that the AppRunner URL is correct
- Verify your Cloudflare account has Worker permissions

### Custom Domain Still Not Resolving
- Verify website is published with `publishedAt` timestamp
- Check App Runner logs for hostname detection
- Ensure website has HTML content in Firestore
