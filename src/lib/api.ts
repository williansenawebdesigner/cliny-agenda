/**
 * Wrapper de fetch autenticado para a API Express/Vercel Functions.
 * Injeta automaticamente o JWT do Supabase em Authorization: Bearer.
 * Todas as operações de dados do frontend passam por aqui.
 */
import { supabase } from './supabase';

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({ error: res.statusText }));

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(path: string) =>
    apiFetch<T>(path, { method: 'GET' }),

  post: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  put: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

  patch: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T = unknown>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
};

export { ApiError };
