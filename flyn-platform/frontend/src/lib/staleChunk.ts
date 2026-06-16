// Stale-chunk auto-recovery.
//
// Vite code-splits lazy `import()`s into content-hashed files (e.g. twilio-QXVS-srr.js). After a
// new frontend deploy those filenames change. A browser tab opened BEFORE the deploy still
// references the OLD names — which no longer exist on the server, so the SPA catch-all returns
// index.html (text/html) for them. The browser then reports:
//   "Failed to fetch dynamically imported module …"
//   "Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of text/html"
// The ONLY fix is to reload so the tab fetches the fresh index.html + new chunk names. This util
// detects that class of error and reloads exactly once (guarded), so a genuinely broken deploy can
// never trap the page in a reload loop.

const RELOAD_KEY = "flyn_stale_chunk_reload_at";

/** True for the "lazy chunk gone after redeploy" family of errors (dynamic import / MIME / parse). */
export function isStaleChunkError(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : String(err ?? "");
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|expected a javascript|module script|mime type|unexpected token '<'/i.test(
    msg,
  );
}

/**
 * Reload ONCE to pick up the freshly deployed bundle. Guarded to at most one reload per 10s (via
 * sessionStorage) so a deploy that is genuinely broken can't loop the page. Returns true if a
 * reload was triggered.
 */
export function reloadForStaleChunkOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 10_000) return false; // already reloaded moments ago — don't loop
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable (private mode) — still attempt the reload below */
  }
  window.location.reload();
  return true;
}
