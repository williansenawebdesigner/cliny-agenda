import { useState, useEffect, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api, ApiError } from '../lib/api';

export interface ClinicData {
  id: string;
  name: string;
  timezone: string;
  whatsappNumber?: string;
  adminEmail: string;
  settings?: Record<string, unknown>;
}

interface MeResponse {
  user: { id: string; email: string };
  clinic: ClinicData | null;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  clinic: ClinicData | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, clinic: null, loading: true, error: null,
  });
  const lastFetchedSessionId = useRef<string | null>(null);
  const createInFlight = useRef(false);

  const fetchMe = useCallback(async (retries = 2): Promise<void> => {
    try {
      const data = await api.get<MeResponse>('/api/auth/me');
      setState((s) => ({ ...s, clinic: data.clinic, error: null, loading: false }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Sessão local existe mas o backend rejeitou — limpa tudo para voltar ao login.
        await supabase.auth.signOut().catch(() => null);
        lastFetchedSessionId.current = null;
        setState({ user: null, session: null, clinic: null, loading: false, error: null });
        return;
      }
      // 5xx (rede / Supabase indisponível): retry com backoff antes de desistir.
      if (err instanceof ApiError && err.status >= 500 && retries > 0) {
        const delay = (3 - retries) * 400 + 200;
        await new Promise((r) => setTimeout(r, delay));
        return fetchMe(retries - 1);
      }
      const msg =
        err instanceof ApiError && err.status >= 500
          ? 'Não foi possível carregar seus dados. Verifique sua conexão.'
          : null;
      setState((s) => ({ ...s, clinic: null, error: msg, loading: false }));
    }
  }, []);

  useEffect(() => {
    const applySession = (session: Session | null) => {
      const sid = session?.access_token ?? null;
      // Vai disparar fetchMe? Então mantém loading=true até ele resolver — evita
      // flash de CreateClinicScreen no boot enquanto clinic ainda é null.
      const willFetch = !!sid && lastFetchedSessionId.current !== sid;
      setState((s) => ({
        ...s,
        user: session?.user ?? null,
        session,
        loading: willFetch ? true : false,
      }));
      if (willFetch) {
        lastFetchedSessionId.current = sid;
        fetchMe();
      } else if (!sid) {
        lastFetchedSessionId.current = null;
        setState((s) => ({ ...s, clinic: null }));
      }
    };

    // Sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    // Listener de mudança de estado — dedupe pelo access_token
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => applySession(session)
    );
    return () => subscription.unsubscribe();
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/login',
        { email, password }
      );
      await supabase.auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });
    } catch (err: any) {
      const msg =
        err instanceof ApiError && err.status === 503
          ? 'Servidor temporariamente indisponível. Tente novamente.'
          : err.message ?? 'Erro ao fazer login.';
      setState((s) => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await api.post<{
          accessToken: string | null;
          refreshToken: string | null;
          needsEmailConfirmation: boolean;
        }>('/api/auth/register', { email, password });
        if (res.accessToken && res.refreshToken) {
          await supabase.auth.setSession({
            access_token: res.accessToken,
            refresh_token: res.refreshToken,
          });
        }
        return { needsEmailConfirmation: res.needsEmailConfirmation };
      } catch (err: any) {
        setState((s) => ({ ...s, loading: false, error: err.message ?? 'Erro ao criar conta.' }));
        throw err;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    lastFetchedSessionId.current = null;
    setState({ user: null, session: null, clinic: null, loading: false, error: null });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await api.post('/api/auth/reset-password', { email });
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const token = state.session?.access_token;
    if (!token) throw new Error('Sessão inválida.');
    await api.post('/api/auth/update-password', { password });
  }, [state.session]);

  const createClinic = useCallback(
    async (name: string, options?: Partial<Omit<ClinicData, 'id' | 'name' | 'adminEmail'>>) => {
      // Mutex: impede POST concorrentes (duplo clique, HMR, StrictMode rerender, etc.)
      if (createInFlight.current) return null;
      createInFlight.current = true;
      try {
        try {
          await api.post('/api/clinics', { name, ...options });
        } catch (err) {
          // 409 = clínica já existia (criação prévia/duplicada) — segue para fetchMe.
          if (!(err instanceof ApiError && err.status === 409)) throw err;
        }
        // /me é a fonte da verdade: sempre re-sincroniza state.clinic ao final.
        await fetchMe();
      } finally {
        createInFlight.current = false;
      }
    },
    [fetchMe]
  );

  return {
    ...state,
    isAuthenticated: !!state.user,
    login,
    register,
    logout,
    resetPassword,
    updatePassword,
    createClinic,
    refetchClinic: fetchMe,
  };
}
