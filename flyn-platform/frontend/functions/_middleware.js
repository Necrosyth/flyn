const BACKEND_URL = "https://pjpmzvu7wn.us-east-1.awsapprunner.com";

const PLATFORM_DOMAINS = [
  "myflynai.com",
  "app.myflynai.com",
  "esim.myflynai.com",
  "api.myflynai.com",
  "localhost",
  "127.0.0.1",
];

const isCustomDomain = (host) => {
  if (!host) return false;
  const domain = host.split(":")[0];
  return !PLATFORM_DOMAINS.some((platformDomain) =>
    domain === platformDomain
  );
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = request.headers.get("host") || "";

    // Only handle custom domains
    if (isCustomDomain(host)) {
      try {
        const requestInit = {
          method: request.method,
          headers: new Headers(request.headers),
        };

        // Handle body for non-GET/HEAD requests
        if (request.method !== "GET" && request.method !== "HEAD") {
          requestInit.body = await request.text();
        }

        const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;
        const backendRequest = new Request(backendUrl, requestInit);

        // Inject headers for backend - CRITICAL: set Host header to original domain
        backendRequest.headers.set("Host", host);
        backendRequest.headers.set("CF-Original-Host", host);
        backendRequest.headers.set("X-Forwarded-Proto", "https");
        backendRequest.headers.set("X-Forwarded-Host", host);
        backendRequest.headers.set("X-Forwarded-For", request.headers.get("cf-connecting-ip") || "");

        const response = await fetch(backendRequest);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        console.error(`Custom domain error for ${host}:`, error);
        return new Response(
          JSON.stringify({ error: "Service unavailable", details: error.message }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // For platform domains, return 404
    return new Response("Not Found", { status: 404 });
  },
};
