/**
 * Cliente Supabase público (anon key) — uso exclusivo no frontend.
 * Usado APENAS para autenticação (signIn, signUp, resetPassword, etc.)
 * Operações de dados devem usar src/lib/api.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos. ' +
      'Verifique seu .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'cliny_auth',
  },
});
