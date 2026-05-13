import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdmin: SupabaseClient | null = null;
let cachedPublic: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.'
    );
  }
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

export function getPublicClient(): SupabaseClient {
  if (cachedPublic) return cachedPublic;
  const url = process.env.SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      '[supabase] SUPABASE_URL ou SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY ausentes.'
    );
  }
  cachedPublic = createClient(url, anon, {
    auth: { persistSession: false },
  });
  return cachedPublic;
}

export async function getUserFromToken(
  authHeader: string | undefined
): Promise<{ userId: string; email: string }> {
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  if (!token) {
    throw Object.assign(new Error('Token de autenticação ausente.'), {
      statusCode: 401,
    });
  }
  const { data, error } = await getAdminClient().auth.getUser(token);
  if (error || !data?.user) {
    throw Object.assign(new Error('Token inválido ou expirado.'), {
      statusCode: 401,
    });
  }
  return { userId: data.user.id, email: data.user.email ?? '' };
}
