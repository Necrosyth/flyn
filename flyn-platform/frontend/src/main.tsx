import { createRoot } from "react-dom/client";
import "./i18n";
import App from "./App.tsx";
import "./index.css";
import { reloadForStaleChunkOnce } from "./lib/staleChunk";

// Vite fires this when a lazily-imported chunk fails to load — almost always because a new deploy
// replaced the hashed filename that this (now-stale) tab still references. Auto-reload once to fetch
// the fresh bundle instead of leaving the user on a broken feature (e.g. barge-in's Twilio SDK).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault(); // stop Vite from rethrowing — we recover by reloading
  reloadForStaleChunkOnce();
});

// Apply appearance prefs from localStorage before first render
try {
  const prefs = JSON.parse(localStorage.getItem('flyn_settings_prefs') || '{}');
  const html = document.documentElement;
  if (prefs.ap_compactDensity) html.classList.add('compact');
  if (prefs.ap_highContrast) html.classList.add('high-contrast');
  if (prefs.ap_reduceAnimations) html.classList.add('reduce-motion');
} catch { /* ignore */ }

// Global alert override to include "Contact support"
const originalAlert = window.alert;
window.alert = function(message) {
  const supportMessage = " - Please contact support.";
  let finalMessage = String(message);
  
  // Only append if it looks like an error (contains typical error keywords) or if it's explicitly an error string
  const errorKeywords = ["failed", "error", "invalid", "unable", "could not", "problem", "wrong"];
  const isError = errorKeywords.some(keyword => finalMessage.toLowerCase().includes(keyword));
  
  if (isError && !finalMessage.includes(supportMessage)) {
    finalMessage += supportMessage;
  }
  
  originalAlert(finalMessage);
};

// Remove initial loading screen once React mounts
const loaderEl = document.getElementById("initial-loader");
if (loaderEl) loaderEl.remove();

createRoot(document.getElementById("root")!).render(<App />);
