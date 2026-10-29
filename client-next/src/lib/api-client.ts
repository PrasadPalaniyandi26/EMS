import type { ApiResponse } from './types';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

export async function refreshAccessToken(): Promise<string> {
  // If already refreshing, return the existing promise
  if (refreshPromise) return refreshPromise;

  // Refresh tokens rotate, so two tabs refreshing at once would invalidate each other. A Web Lock makes the
  // tabs refresh one at a time (the second one then simply uses the cookie the first one rotated).
  const doFetch = () => fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  refreshPromise = ((locks ? locks.request('ems-token-refresh', doFetch) : doFetch()) as Promise<Response>)
    .then(async (res) => {
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      if (!data.data?.accessToken) throw new Error('Invalid refresh response');
      accessToken = data.data.accessToken;
      return accessToken!;
    })
    .finally(() => {
      // Clear the promise when done so future calls can refresh again if needed
      refreshPromise = null;
    });

  return refreshPromise;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(url, { ...options, headers, credentials: 'include' });

  // If 401, try refreshing (even if accessToken is null — page reload clears it but cookie is still valid).
  // Auth endpoints are excluded: a 401 from /auth/login means wrong credentials, not an expired session,
  // and must reach the caller so the form can show the server's message.
  if (res.status === 401 && !endpoint.startsWith('/auth/')) {
    try {
      await refreshAccessToken();
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(url, { ...options, headers, credentials: 'include' });
    } catch {
      clearAccessToken();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  // Safely parse response — server may return plain text on 5xx errors
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    const err = new Error(
      text.trim() || `Server error (${res.status})`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data: ApiResponse<T> = await res.json();
  if (!data.success) {
    const err = new Error(data.error?.message || 'Request failed') as Error & {
      code?: string; details?: unknown; status?: number;
    };
    err.code = data.error?.code;
    err.details = data.error?.details;
    err.status = res.status;
    throw err;
  }

  return data;
}

// ─── Convenience Methods ─────────────────────────
export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint),

  post: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),

  patch: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }),

  delete: <T>(endpoint: string) =>
    apiRequest<T>(endpoint, { method: 'DELETE' }),

  deleteWithBody: <T>(endpoint: string, body: unknown) =>
    apiRequest<T>(endpoint, { method: 'DELETE', body: JSON.stringify(body) }),
};

export default api;
