import { auth } from "@/lib/firebase";
import { DEMO_AUTH_TOKEN, isDemoModeEnabled } from "@/lib/demo-mode";
import { getIdToken } from "firebase/auth";

export async function getFirebaseIdToken(): Promise<string> {
  if (isDemoModeEnabled()) return DEMO_AUTH_TOKEN;
  const user = auth?.currentUser;
  if (user) return getIdToken(user, true);
  // Localhost dev bypass: use manually pasted token from production app
  if (import.meta.env.DEV) {
    const devToken = localStorage.getItem('_devToken');
    if (devToken) return devToken;
  }
  throw new Error("Not authenticated");
}

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getFirebaseIdToken();
  const tenantId = window.localStorage.getItem('tenantId');
  
  const headers: HeadersInit = {
    ...(init?.headers || {}),
    'Authorization': `Bearer ${token}`,
  };

  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
