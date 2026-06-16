/**
 * Cloudflare Worker for FLYN Platform
 * Injects the original hostname into CF-Original-Host header
 * and forwards all requests to App Runner
 *
 * Deploy:
 * 1. Go to https://dash.cloudflare.com -> Workers & Pages
 * 2. Create a new Worker
 * 3. Paste this code
 * 4. Deploy
 * 5. Go to Settings -> Routes and add route: myflynai.com/* pointing to this worker
 */

const PLATFORM_DOMAINS = [
  "myflynai.com",
  "app.myflynai.com",
  "esim.myflynai.com",
  "api.myflynai.com",
  "localhost",
  "127.0.0.1",
];

const isCustomDomain = (hostname) => {
  if (!hostname) return false;
  // Use exact match, not endsWith, to avoid matching test.myflynai.com as myflynai.com
  return !PLATFORM_DOMAINS.some((platformDomain) =>
    hostname === platformDomain
  );
};

export default {
  async fetch(request) {
    // Extract the original hostname from the request
    const url = new URL(request.url);
    const originalHost = url.hostname;

    console.log(`[Worker] Received request for: ${originalHost}, path: ${url.pathname}`);

    // Only proxy custom domains to the backend
    if (isCustomDomain(originalHost)) {
      try {
        console.log(`[Worker] Proxying custom domain: ${originalHost}`);

        // Workaround: Since Cloudflare overrides Host header, use custom header
        // and update the backend to read it (or use query param as fallback)
        const headers = new Headers(request.headers);
        headers.set('X-Original-Host', originalHost);
        headers.set('CF-Original-Host', originalHost);
        headers.set('X-Forwarded-Host', originalHost);
        headers.set('X-Forwarded-Proto', 'https');

        // Handle body for non-GET/HEAD requests
        let body = undefined;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          body = await request.text();
        }

        // Forward to App Runner with custom domain in path as workaround
        const appRunnerUrl = new URL(request.url);
        appRunnerUrl.hostname = 'pjpmzvu7wn.us-east-1.awsapprunner.com';

        // Add /api prefix since the NestJS backend uses app.setGlobalPrefix('api')
        const pathWithApiPrefix = '/api' + (appRunnerUrl.pathname || '/');
        appRunnerUrl.pathname = pathWithApiPrefix;

        // Add domain as query param as fallback if headers don't work
        // Use 'domain' instead of '__domain' since Express doesn't parse params with leading underscores
        if (!appRunnerUrl.searchParams.has('domain')) {
          appRunnerUrl.searchParams.set('domain', originalHost);
        }

        console.log(`[Worker] Forwarding to: ${appRunnerUrl.toString()}`);

        const proxiedRequest = new Request(appRunnerUrl, {
          method: request.method,
          headers: headers,
          body: body,
        });

        console.log(`[Worker] Request headers: Host=${proxiedRequest.headers.get('Host')}, X-Original-Host=${proxiedRequest.headers.get('X-Original-Host')}`);

        const response = await fetch(proxiedRequest);
        console.log(`[Worker] Response status: ${response.status}`);
        return response;
      } catch (error) {
        console.error('Worker error:', error);
        return new Response(`Proxy error: ${error.message}`, { status: 502 });
      }
    }

    // For platform domains, return 404 (let Cloudflare Pages handle them)
    return new Response("Not Found", { status: 404 });
  },
};
