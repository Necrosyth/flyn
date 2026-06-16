// ─────────────────────────────────────────────
// useComparisonData.ts
// Fetches live data from the Next.js admin API.
// Falls back to static defaults if the API is
// unavailable, so the page never breaks.
//
// API endpoint (Next.js): GET /api/admin/comparison
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react';
import type { ComparisonPageData } from '../types/comparison.types';
import { defaultComparisonData } from '../data/comparison.data';

interface UseComparisonDataReturn {
  data: ComparisonPageData;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// NestJS backend (ported from the client's Next.js route): GET /api/comparison
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '')
  || 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api';

export function useComparisonData(): UseComparisonDataReturn {
  const [data, setData]       = useState<ComparisonPageData>(defaultComparisonData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/comparison`, {
          headers: { 'Content-Type': 'application/json' },
          // 5s timeout via AbortController
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // Backend returns {} or a partial override → merge over static defaults
        // so the page always has every section even if only some fields are set.
        const merged: ComparisonPageData = (json && Object.keys(json).length)
          ? { ...defaultComparisonData, ...json }
          : defaultComparisonData;
        if (!cancelled) setData(merged);
      } catch (err) {
        // Silently fall back to static data; log in dev
        if (import.meta.env.DEV) {
          console.warn('[useComparisonData] API unavailable, using defaults:', err);
        }
        if (!cancelled) {
          setData(defaultComparisonData);
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchData();
    return () => { cancelled = true; };
  }, [tick]);

  return {
    data,
    isLoading,
    error,
    refetch: () => setTick(t => t + 1),
  };
}
