/**
 * Cache em memória para o resultado de getUserFromToken + clinic lookup.
 *
 * Sem isso, cada request autenticada faz duas chamadas síncronas ao Supabase
 * (getUser via REST + SELECT na tabela clinics). Em rede ruim ou sob carga,
 * isso vira o gargalo. Com TTL curto (60s) o trade-off é seguro: o pior caso
 * é um JWT revogado continuar válido por até 1 minuto na nossa borda.
 */
import crypto from 'node:crypto';

interface CachedAuth {
  userId: string;
  email: string;
  clinicId: string | null;
  expiresAt: number;
}

const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, CachedAuth>();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getCachedAuth(token: string): CachedAuth | null {
  const key = hashToken(token);
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setCachedAuth(
  token: string,
  data: Omit<CachedAuth, 'expiresAt'>
): void {
  if (cache.size >= MAX_ENTRIES) {
    // Drop oldest ~10% para evitar crescimento ilimitado.
    const toDrop = Math.ceil(MAX_ENTRIES * 0.1);
    let i = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++i >= toDrop) break;
    }
  }
  cache.set(hashToken(token), { ...data, expiresAt: Date.now() + TTL_MS });
}

export function invalidateCachedAuth(token: string): void {
  cache.delete(hashToken(token));
}
