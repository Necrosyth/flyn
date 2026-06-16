// frontend/src/utils/http.ts
export function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export function buildQueryString(params: Record<string, any>): string {
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null);
  return keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
}

export function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
