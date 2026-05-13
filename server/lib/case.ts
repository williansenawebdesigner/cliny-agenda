/**
 * Snake_case → camelCase para responses.
 *
 * O Supabase retorna colunas como `instance_name`, `from_me`, `start_time` mas
 * o frontend espera `instanceName`, `fromMe`, `startTime`. Esse util faz a
 * conversão recursivamente. Chaves que já são camelCase (sem `_`) passam direto,
 * então é idempotente — pode ser aplicado em jsonb columns como `agent` sem
 * estragar nada.
 */
function snakeKeyToCamel(key: string): string {
  // só transforma se houver underline (e não for um leading underscore de campos privados)
  if (!key.includes('_') || key.startsWith('_')) return key;
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function toCamel<T = unknown>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => toCamel(v)) as unknown as T;
  }
  if (value && typeof value === 'object' && (value as any).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeKeyToCamel(k)] = toCamel(v);
    }
    return out as T;
  }
  return value;
}
