export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const DAYS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function parts(date: Date, tz: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

export function ymdInTz(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function hmInTz(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.hour}:${p.minute}`;
}

export function dayOfWeekInTz(date: Date, tz: string): number {
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[parts(date, tz).weekday] ?? date.getUTCDay();
}

export function humanInTz(date: Date, tz: string): string {
  const p = parts(date, tz);
  const dow = DAYS_PT[dayOfWeekInTz(date, tz)];
  return `${dow}, ${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

export function fromZonedTime(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0));
  const tzPartsAtNaive = parts(naive, tz);
  const reconstructedAsTz = Date.UTC(
    Number(tzPartsAtNaive.year),
    Number(tzPartsAtNaive.month) - 1,
    Number(tzPartsAtNaive.day),
    Number(tzPartsAtNaive.hour),
    Number(tzPartsAtNaive.minute),
    Number(tzPartsAtNaive.second)
  );
  const offsetMs = reconstructedAsTz - naive.getTime();
  return new Date(naive.getTime() - offsetMs);
}

export function startOfDayInTz(ymd: string, tz: string): Date {
  return fromZonedTime(ymd, '00:00', tz);
}

export function endOfDayInTz(ymd: string, tz: string): Date {
  const d = fromZonedTime(ymd, '23:59', tz);
  return new Date(d.getTime() + 59_999);
}
