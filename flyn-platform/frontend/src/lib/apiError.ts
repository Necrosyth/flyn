/**
 * Shared API error handling utilities.
 *
 * Rules:
 * - Never show fake success when an API call fails.
 * - Give non-technical users a plain-English explanation.
 * - Give technical users the real HTTP status / server message.
 */

/** Extract a readable message from a fetch Response */
export async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    if (typeof json?.message === "string") return json.message;
    if (typeof json?.error === "string") return json.error;
  } catch {
    // not JSON — use raw text
  }
  if (text && text.length < 200) return text;
  return httpStatusMessage(res.status);
}

/** Friendly English message for common HTTP statuses */
export function httpStatusMessage(status: number): string {
  switch (status) {
    case 400: return "The request was invalid. Check your inputs and try again.";
    case 401: return "You're not signed in. Please log in and try again.";
    case 403: return "You don't have permission to do this.";
    case 404: return "This feature or resource is not found on the server.";
    case 409: return "A conflict occurred — this record may already exist.";
    case 422: return "The server couldn't process this request. Check the data you entered.";
    case 429: return "Too many requests. Wait a moment and try again.";
    case 500: return "Server error. Please try again in a moment.";
    case 502: return "The service is temporarily unavailable (Bad Gateway). It may still be starting up.";
    case 503: return "The service is offline or not yet deployed. Contact your administrator.";
    case 504: return "The server took too long to respond. Please try again.";
    default:  return `Unexpected error (HTTP ${status}). Please try again.`;
  }
}

/** Friendly message for network-level errors (server not reachable) */
export function networkErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // Browser TypeError: "Failed to fetch" = server not reachable
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ERR_CONNECTION_REFUSED")) {
    return "Cannot reach the server. The service may not be deployed yet, or check your internet connection.";
  }
  if (msg.includes("CORS") || msg.includes("blocked")) {
    return "Request blocked by CORS policy. The backend may not be configured to accept requests from this origin.";
  }
  if (msg.includes("timeout") || msg.includes("Timeout")) {
    return "The request timed out. The server may be overloaded. Try again.";
  }
  return msg || "An unknown error occurred.";
}

/**
 * Wraps a single fetch call.
 * Returns `{ ok: true, data }` on success or `{ ok: false, message }` on any failure.
 * Never throws — safe to use without try/catch.
 */
export async function safeFetch<T = unknown>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; message: string; status?: number }> {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      const message = await readErrorMessage(res);
      return { ok: false, message, status: res.status };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: networkErrorMessage(err) };
  }
}

/**
 * Runs multiple fetch calls in parallel and reports results.
 * Returns a summary: how many succeeded, failed, and the first error message.
 */
export async function parallelFetch(
  calls: (() => Promise<Response>)[],
): Promise<{ successCount: number; failCount: number; firstError: string | null }> {
  const results = await Promise.allSettled(calls.map((fn) => fn()));

  let successCount = 0;
  let failCount = 0;
  let firstError: string | null = null;

  for (const result of results) {
    if (result.status === "rejected") {
      failCount++;
      if (!firstError) firstError = networkErrorMessage(result.reason);
    } else {
      const res = result.value;
      if (res.ok) {
        successCount++;
      } else {
        failCount++;
        if (!firstError) firstError = await readErrorMessage(res);
      }
    }
  }

  return { successCount, failCount, firstError };
}
