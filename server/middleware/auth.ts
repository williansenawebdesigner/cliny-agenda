import type { Request, Response, NextFunction } from 'express';
import { getUserFromToken, getAdminClient } from '../lib/supabase.js';
import { getCachedAuth, setCachedAuth } from '../lib/authCache.js';

export interface AuthContext {
  userId: string;
  email: string;
  clinicId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function applySecurityHeaders(res: Response) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

function isNetworkErr(err: any): boolean {
  const code = err?.code ?? err?.cause?.code;
  return (
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    err?.message?.includes('fetch failed')
  );
}

async function resolveContext(token: string): Promise<AuthContext> {
  const cached = getCachedAuth(token);
  if (cached) {
    return { userId: cached.userId, email: cached.email, clinicId: cached.clinicId };
  }
  const { userId, email } = await getUserFromToken(token);
  const { data: clinic } = await getAdminClient()
    .from('clinics')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  const clinicId = clinic?.id ?? null;
  setCachedAuth(token, { userId, email, clinicId });
  return { userId, email, clinicId };
}

async function resolveBasicContext(
  token: string
): Promise<Pick<AuthContext, 'userId' | 'email'>> {
  const cached = getCachedAuth(token);
  if (cached) return { userId: cached.userId, email: cached.email };
  return await getUserFromToken(token);
}

function handleErr(err: any, res: Response) {
  if (isNetworkErr(err)) {
    console.warn('[auth] Supabase unreachable:', err?.cause?.code ?? err.message);
    return res.status(503).json({
      error: 'Servidor de autenticação temporariamente indisponível. Tente novamente em instantes.',
    });
  }
  const status = err?.statusCode ?? 500;
  if (status === 500) console.error('[auth] erro inesperado:', err);
  return res.status(status).json({
    error: status === 401 ? err.message : 'Erro interno do servidor.',
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  applySecurityHeaders(res);
  const token = extractToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }
  try {
    req.auth = await resolveContext(token);
    next();
  } catch (err: any) {
    handleErr(err, res);
  }
}

export async function requireAuthBasic(
  req: Request,
  res: Response,
  next: NextFunction
) {
  applySecurityHeaders(res);
  const token = extractToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }
  try {
    const { userId, email } = await resolveBasicContext(token);
    req.auth = { userId, email, clinicId: null };
    next();
  } catch (err: any) {
    handleErr(err, res);
  }
}

export function requireClinic(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.clinicId) {
    res.status(403).json({ error: 'Clínica não encontrada.' });
    return;
  }
  next();
}
