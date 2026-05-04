import type { Firestore } from 'firebase-admin/firestore';
import { Type, type FunctionDeclaration } from '@google/genai';
import {
  DEFAULT_TIMEZONE,
  dayOfWeekInTz,
  endOfDayInTz,
  fromZonedTime,
  hmInTz,
  humanInTz,
  startOfDayInTz,
  ymdInTz,
} from './tz.js';

export interface ToolContext {
  db: Firestore;
  clinicId: string;
  instanceName: string;
  professionalId?: string | null;
  remoteJid: string;
  pushName?: string | null;
  timezone: string;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function jidToPhone(jid: string): string {
  return jid.split('@')[0];
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function buildSlotsForProfessional(
  schedule: Record<string, string[]> | undefined,
  ymd: string,
  tz: string,
  durationMin: number
): string[] {
  const dayIndex = dayOfWeekInTz(startOfDayInTz(ymd, tz), tz);
  const key = DAY_KEYS[dayIndex];
  if (!schedule) {
    const out: string[] = [];
    for (let h = 9; h < 18; h++) {
      out.push(`${pad(h)}:00`);
      if (durationMin <= 30) out.push(`${pad(h)}:30`);
    }
    return out;
  }
  return schedule[key] ?? [];
}

async function findProfessional(ctx: ToolContext, professionalId?: string) {
  if (professionalId) {
    const snap = await ctx.db.collection('professionals').doc(professionalId).get();
    return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
  }
  if (ctx.professionalId) {
    const snap = await ctx.db.collection('professionals').doc(ctx.professionalId).get();
    return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
  }
  // First professional of the clinic as fallback
  const snap = await ctx.db
    .collection('professionals')
    .where('clinicId', '==', ctx.clinicId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as any) };
}

async function listProfessionalsForClinic(ctx: ToolContext) {
  if (ctx.professionalId) {
    const p = await findProfessional(ctx, ctx.professionalId);
    return p ? [p] : [];
  }
  const snap = await ctx.db
    .collection('professionals')
    .where('clinicId', '==', ctx.clinicId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

async function findOrCreatePatient(
  ctx: ToolContext,
  name: string,
  phone: string
): Promise<{ id: string; created: boolean }> {
  const cleanPhone = phone.replace(/\D/g, '');
  const snap = await ctx.db
    .collection('patients')
    .where('clinicId', '==', ctx.clinicId)
    .where('phone', '==', cleanPhone)
    .limit(1)
    .get();
  if (!snap.empty) {
    return { id: snap.docs[0].id, created: false };
  }
  const ref = await ctx.db.collection('patients').add({
    clinicId: ctx.clinicId,
    name: name.trim(),
    phone: cleanPhone,
    createdAt: new Date().toISOString(),
  });
  return { id: ref.id, created: true };
}

/* -------------------------------------------------------------------------- */
/*  Tool implementations                                                       */
/* -------------------------------------------------------------------------- */

async function listServices(ctx: ToolContext): Promise<ToolResult> {
  const profs = await listProfessionalsForClinic(ctx);
  const services = profs.flatMap((p) =>
    (p.services ?? []).map((s: any) => ({
      professionalId: p.id,
      professionalName: p.name,
      serviceId: s.id,
      name: s.name,
      durationMin: s.duration,
      price: s.price,
      bookingMode: p.bookingMode === 'walk_in' ? 'walk_in' : 'slot',
    }))
  );
  return {
    ok: true,
    data: {
      services,
      note: 'Serviços com bookingMode="walk_in" são por ordem de chegada (sem hora marcada). Para esses, NÃO chame list_available_slots nem create_appointment — chame list_available_periods e create_walk_in_appointment.',
    },
  };
}

async function listAvailableSlots(
  ctx: ToolContext,
  args: { date: string; serviceId?: string; professionalId?: string }
): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    return { ok: false, error: `Invalid date: ${args.date} (use YYYY-MM-DD)` };
  }

  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'No professional found for this clinic' };

  const service =
    args.serviceId && (prof.services ?? []).find((s: any) => s.id === args.serviceId);
  const durationMin = service?.duration ?? 30;

  const allSlots = buildSlotsForProfessional(prof.schedule, args.date, ctx.timezone, durationMin);
  if (allSlots.length === 0) {
    return {
      ok: true,
      data: {
        date: args.date,
        professionalId: prof.id,
        professionalName: prof.name,
        timezone: ctx.timezone,
        availableSlots: [],
        reason: 'Professional has no schedule configured for this weekday.',
      },
    };
  }

  const dayStart = startOfDayInTz(args.date, ctx.timezone);
  const dayEnd = endOfDayInTz(args.date, ctx.timezone);

  const apptSnap = await ctx.db
    .collection('appointments')
    .where('clinicId', '==', ctx.clinicId)
    .where('professionalId', '==', prof.id)
    .where('startTime', '>=', dayStart.toISOString())
    .where('startTime', '<=', dayEnd.toISOString())
    .get();

  const taken = new Set<string>();
  apptSnap.docs.forEach((d) => {
    const data = d.data() as any;
    if (data.status === 'cancelled') return;
    const start = new Date(data.startTime);
    taken.add(hmInTz(start, ctx.timezone));
  });

  const available = allSlots.filter((s) => !taken.has(s));

  return {
    ok: true,
    data: {
      date: args.date,
      professionalId: prof.id,
      professionalName: prof.name,
      timezone: ctx.timezone,
      durationMin,
      availableSlots: available,
    },
  };
}

async function createAppointment(
  ctx: ToolContext,
  args: {
    patientName: string;
    patientPhone?: string;
    professionalId?: string;
    serviceId: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    notes?: string;
  }
): Promise<ToolResult> {
  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'No professional found' };

  const service = (prof.services ?? []).find((s: any) => s.id === args.serviceId);
  if (!service) {
    return {
      ok: false,
      error: `Service ${args.serviceId} not found for professional ${prof.name}. Call list_services first.`,
    };
  }

  const startTime = fromZonedTime(args.date, args.time, ctx.timezone);
  if (isNaN(startTime.getTime())) {
    return { ok: false, error: `Invalid date/time: ${args.date} ${args.time}` };
  }
  if (startTime.getTime() < Date.now() - 60 * 1000) {
    return { ok: false, error: 'Cannot schedule in the past.' };
  }
  const endTime = new Date(startTime.getTime() + (service.duration ?? 30) * 60000);

  // Conflict check
  const conflict = await ctx.db
    .collection('appointments')
    .where('clinicId', '==', ctx.clinicId)
    .where('professionalId', '==', prof.id)
    .where('startTime', '==', startTime.toISOString())
    .get();
  if (!conflict.empty) {
    const stillActive = conflict.docs.find(
      (d) => (d.data() as any).status !== 'cancelled'
    );
    if (stillActive) {
      return {
        ok: false,
        error: 'Slot is already taken. Call list_available_slots to suggest another time.',
      };
    }
  }

  const phone = args.patientPhone || jidToPhone(ctx.remoteJid);
  const { id: patientId, created } = await findOrCreatePatient(
    ctx,
    args.patientName,
    phone
  );

  const ref = await ctx.db.collection('appointments').add({
    clinicId: ctx.clinicId,
    professionalId: prof.id,
    patientId,
    serviceId: args.serviceId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    status: 'scheduled',
    price: service.price ?? 0,
    notes: args.notes ?? '',
    createdBy: 'agent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    data: {
      appointmentId: ref.id,
      patientId,
      patientCreated: created,
      professionalName: prof.name,
      serviceName: service.name,
      startTimeUtc: startTime.toISOString(),
      startTimeLocal: humanInTz(startTime, ctx.timezone),
      timezone: ctx.timezone,
      durationMin: service.duration ?? 30,
      price: service.price ?? 0,
    },
  };
}

async function listPatientAppointments(
  ctx: ToolContext,
  args: { patientPhone?: string }
): Promise<ToolResult> {
  const phone = (args.patientPhone || jidToPhone(ctx.remoteJid)).replace(/\D/g, '');
  const patSnap = await ctx.db
    .collection('patients')
    .where('clinicId', '==', ctx.clinicId)
    .where('phone', '==', phone)
    .limit(1)
    .get();
  if (patSnap.empty) {
    return { ok: true, data: { appointments: [], reason: 'Patient not found' } };
  }
  const patient = patSnap.docs[0];
  const apptSnap = await ctx.db
    .collection('appointments')
    .where('clinicId', '==', ctx.clinicId)
    .where('patientId', '==', patient.id)
    .where('startTime', '>=', new Date().toISOString())
    .orderBy('startTime', 'asc')
    .limit(10)
    .get();
  const appointments = apptSnap.docs.map((d) => {
    const a = d.data() as any;
    const startDate = new Date(a.startTime);
    return {
      appointmentId: d.id,
      startTimeUtc: a.startTime,
      startTimeLocal: humanInTz(startDate, ctx.timezone),
      status: a.status,
      professionalId: a.professionalId,
      serviceId: a.serviceId,
    };
  });
  return { ok: true, data: { patientId: patient.id, patientName: (patient.data() as any).name, timezone: ctx.timezone, appointments } };
}

async function listAvailablePeriods(
  ctx: ToolContext,
  args: { date: string; professionalId?: string }
): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    return { ok: false, error: `Invalid date: ${args.date} (use YYYY-MM-DD)` };
  }

  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'No professional found' };
  if (prof.bookingMode !== 'walk_in') {
    return {
      ok: false,
      error: `Professional ${prof.name} works with scheduled slots, not walk-in. Use list_available_slots instead.`,
    };
  }

  const dayIndex = dayOfWeekInTz(startOfDayInTz(args.date, ctx.timezone), ctx.timezone);
  const dayKey = DAY_KEYS[dayIndex];
  const periods: any[] = (prof.walkInPeriods ?? {})[dayKey] ?? [];

  if (periods.length === 0) {
    return {
      ok: true,
      data: {
        date: args.date,
        professionalId: prof.id,
        professionalName: prof.name,
        bookingMode: 'walk_in',
        periods: [],
        reason: `Professional has no walk-in periods configured for ${dayKey}.`,
      },
    };
  }

  const dayStart = startOfDayInTz(args.date, ctx.timezone);
  const dayEnd = endOfDayInTz(args.date, ctx.timezone);

  const apptSnap = await ctx.db
    .collection('appointments')
    .where('clinicId', '==', ctx.clinicId)
    .where('professionalId', '==', prof.id)
    .where('startTime', '>=', dayStart.toISOString())
    .where('startTime', '<=', dayEnd.toISOString())
    .get();

  const usedByPeriod: Record<string, number> = {};
  apptSnap.docs.forEach((d) => {
    const data = d.data() as any;
    if (data.status === 'cancelled') return;
    if (data.walkIn && data.periodId) {
      usedByPeriod[data.periodId] = (usedByPeriod[data.periodId] ?? 0) + 1;
    }
  });

  const enriched = periods.map((p) => {
    const used = usedByPeriod[p.id] ?? 0;
    const remaining = Math.max(0, (p.capacity ?? 0) - used);
    return {
      periodId: p.id,
      label: p.label,
      start: p.start,
      end: p.end,
      capacity: p.capacity,
      used,
      remaining,
      available: remaining > 0,
    };
  });

  return {
    ok: true,
    data: {
      date: args.date,
      professionalId: prof.id,
      professionalName: prof.name,
      bookingMode: 'walk_in',
      timezone: ctx.timezone,
      periods: enriched,
    },
  };
}

async function createWalkInAppointment(
  ctx: ToolContext,
  args: {
    patientName: string;
    patientPhone?: string;
    professionalId?: string;
    serviceId: string;
    date: string;
    periodId: string;
    notes?: string;
  }
): Promise<ToolResult> {
  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'No professional found' };
  if (prof.bookingMode !== 'walk_in') {
    return {
      ok: false,
      error: `Professional ${prof.name} uses scheduled slots, not walk-in. Use create_appointment with a specific time instead.`,
    };
  }

  const service = (prof.services ?? []).find((s: any) => s.id === args.serviceId);
  if (!service) {
    return {
      ok: false,
      error: `Service ${args.serviceId} not found for ${prof.name}. Call list_services first.`,
    };
  }

  const dayIndex = dayOfWeekInTz(startOfDayInTz(args.date, ctx.timezone), ctx.timezone);
  const dayKey = DAY_KEYS[dayIndex];
  const periods = (prof.walkInPeriods ?? {})[dayKey] ?? [];
  const period = periods.find((p: any) => p.id === args.periodId);
  if (!period) {
    return {
      ok: false,
      error: `Period ${args.periodId} not configured for ${dayKey}. Call list_available_periods first.`,
    };
  }

  const startTime = fromZonedTime(args.date, period.start, ctx.timezone);
  if (startTime.getTime() < Date.now() - 60 * 1000) {
    return { ok: false, error: 'Cannot schedule in the past.' };
  }
  const endTime = fromZonedTime(args.date, period.end, ctx.timezone);

  // Capacity check
  const dayStart = startOfDayInTz(args.date, ctx.timezone);
  const dayEnd = endOfDayInTz(args.date, ctx.timezone);
  const apptSnap = await ctx.db
    .collection('appointments')
    .where('clinicId', '==', ctx.clinicId)
    .where('professionalId', '==', prof.id)
    .where('startTime', '>=', dayStart.toISOString())
    .where('startTime', '<=', dayEnd.toISOString())
    .get();
  const used = apptSnap.docs.filter((d) => {
    const x = d.data() as any;
    return x.status !== 'cancelled' && x.walkIn && x.periodId === period.id;
  }).length;
  if (used >= (period.capacity ?? 0)) {
    return {
      ok: false,
      error: `Period "${period.label}" is full on ${args.date} (${used}/${period.capacity}). Suggest another period or date.`,
    };
  }

  const phone = args.patientPhone || jidToPhone(ctx.remoteJid);
  const { id: patientId, created } = await findOrCreatePatient(
    ctx,
    args.patientName,
    phone
  );

  const ref = await ctx.db.collection('appointments').add({
    clinicId: ctx.clinicId,
    professionalId: prof.id,
    patientId,
    serviceId: args.serviceId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    status: 'scheduled',
    price: service.price ?? 0,
    notes: args.notes ?? '',
    walkIn: true,
    periodId: period.id,
    periodLabel: period.label,
    createdBy: 'agent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    data: {
      appointmentId: ref.id,
      patientId,
      patientCreated: created,
      professionalName: prof.name,
      serviceName: service.name,
      bookingMode: 'walk_in',
      periodLabel: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      date: args.date,
      timezone: ctx.timezone,
      reminderToPatient: `Atendimento por ordem de chegada. Compareça à clínica a partir das ${period.start} no dia ${args.date}.`,
    },
  };
}

/* ----------------------------------------------------------------------- */
/*  Date resolver (PT-BR temporal expressions)                              */
/* ----------------------------------------------------------------------- */

const DAY_NAMES_PT: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  'terça': 2,
  'terca-feira': 2,
  'terça-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
  'sábado': 6,
};

const MONTH_NAMES_PT: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, 'março': 2,
  abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7,
  setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

function stripAccentsLower(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function tzNowParts(tz: string): { year: number; month: number; day: number; weekday: number } {
  const now = new Date();
  const ymd = ymdInTz(now, tz);
  const [y, m, d] = ymd.split('-').map(Number);
  const weekday = dayOfWeekInTz(startOfDayInTz(ymd, tz), tz);
  return { year: y, month: m, day: d, weekday };
}

function fmtYmd(year: number, month0: number, day: number): string {
  const m = (month0 + 1).toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function addDaysYmd(ymd: string, days: number, tz: string): string {
  const base = startOfDayInTz(ymd, tz);
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return ymdInTz(next, tz);
}

/**
 * Resolves a free-text PT-BR date expression to YYYY-MM-DD using the clinic timezone.
 * Returns { ymd, weekdayName, interpreted } or { error }.
 */
function resolveDateExpression(expr: string, tz: string): {
  ymd?: string;
  weekday?: number;
  weekdayName?: string;
  interpreted?: string;
  error?: string;
} {
  const raw = expr?.trim();
  if (!raw) return { error: 'Empty expression' };
  const text = stripAccentsLower(raw);

  const today = tzNowParts(tz);
  const todayYmd = fmtYmd(today.year, today.month - 1, today.day);

  // 1) Direct ISO YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return { ymd: text, interpreted: 'ISO date' };
  }

  // 2) DD/MM or DD/MM/YYYY
  const brMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month0 = Number(brMatch[2]) - 1;
    let year = brMatch[3] ? Number(brMatch[3]) : today.year;
    if (year < 100) year += 2000;
    const candidate = fmtYmd(year, month0, day);
    // If user gave only DD/MM and that date is in the past, roll to next year
    if (!brMatch[3]) {
      const cand = startOfDayInTz(candidate, tz).getTime();
      const nowMs = startOfDayInTz(todayYmd, tz).getTime();
      if (cand < nowMs) {
        return { ymd: fmtYmd(year + 1, month0, day), interpreted: 'DD/MM (rolled to next year)' };
      }
    }
    return { ymd: candidate, interpreted: 'DD/MM[/YYYY]' };
  }

  // 3) Keywords: hoje, amanhã, depois de amanhã, ontem
  if (/^hoje$/.test(text) || /^para hoje$/.test(text)) {
    return { ymd: todayYmd, interpreted: 'hoje' };
  }
  if (/^amanha$/.test(text) || /^para amanha$/.test(text)) {
    return { ymd: addDaysYmd(todayYmd, 1, tz), interpreted: 'amanhã' };
  }
  if (/^depois de amanha$/.test(text)) {
    return { ymd: addDaysYmd(todayYmd, 2, tz), interpreted: 'depois de amanhã' };
  }
  if (/^ontem$/.test(text)) {
    return { ymd: addDaysYmd(todayYmd, -1, tz), interpreted: 'ontem' };
  }

  // 4) "em N dias", "daqui a N dias"
  const inDaysMatch = text.match(/^(?:em|daqui a) (\d+) dias?$/);
  if (inDaysMatch) {
    return { ymd: addDaysYmd(todayYmd, Number(inDaysMatch[1]), tz), interpreted: `em ${inDaysMatch[1]} dias` };
  }

  // 5) "N de Mês" — ex: "10 de junho", "10 junho", "10/junho"
  const dayMonthMatch = text.match(/^(\d{1,2})(?:\s+de\s+|\s+|\/)([a-z]+)(?:\s+de\s+(\d{4}))?$/);
  if (dayMonthMatch && MONTH_NAMES_PT[dayMonthMatch[2]] !== undefined) {
    const day = Number(dayMonthMatch[1]);
    const month0 = MONTH_NAMES_PT[dayMonthMatch[2]];
    let year = dayMonthMatch[3] ? Number(dayMonthMatch[3]) : today.year;
    const candidate = fmtYmd(year, month0, day);
    if (!dayMonthMatch[3]) {
      const cand = startOfDayInTz(candidate, tz).getTime();
      const nowMs = startOfDayInTz(todayYmd, tz).getTime();
      if (cand < nowMs) {
        return { ymd: fmtYmd(year + 1, month0, day), interpreted: 'N de mês (próximo ano)' };
      }
    }
    return { ymd: candidate, interpreted: 'N de mês' };
  }

  // 6) Weekday names (with optional "próxima"/"que vem")
  const weekdayKeys = Object.keys(DAY_NAMES_PT);
  for (const key of weekdayKeys) {
    const stripped = stripAccentsLower(key);
    const patterns = [
      new RegExp(`^${stripped}$`),
      new RegExp(`^proxima ${stripped}$`),
      new RegExp(`^proximo ${stripped}$`),
      new RegExp(`^${stripped} que vem$`),
      new RegExp(`^na ${stripped}$`),
      new RegExp(`^na proxima ${stripped}$`),
      new RegExp(`^${stripped} proxima$`),
    ];
    if (patterns.some((re) => re.test(text))) {
      const targetDow = DAY_NAMES_PT[key];
      const todayDow = today.weekday;
      const forceNextWeek = /proxima|proximo|que vem/.test(text);
      let diff = (targetDow - todayDow + 7) % 7;
      if (diff === 0 && forceNextWeek) diff = 7;
      // If just "terça" and today IS Tuesday: keep today (diff=0). User can say "próxima" for next week.
      const ymd = addDaysYmd(todayYmd, diff, tz);
      const labelMap = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      return {
        ymd,
        weekday: targetDow,
        weekdayName: labelMap[targetDow],
        interpreted: forceNextWeek
          ? `próxima ${labelMap[targetDow].toLowerCase()}`
          : diff === 0
          ? `${labelMap[targetDow].toLowerCase()} (hoje)`
          : `próxima ${labelMap[targetDow].toLowerCase()}`,
      };
    }
  }

  return {
    error: `Não entendi a data "${raw}". Peça ao paciente uma data específica (DD/MM ou nome do dia da semana).`,
  };
}

async function resolveDateTool(
  ctx: ToolContext,
  args: { expression: string }
): Promise<ToolResult> {
  const result = resolveDateExpression(args.expression ?? '', ctx.timezone);
  if (result.error) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      input: args.expression,
      date: result.ymd,
      weekdayName: result.weekdayName,
      interpreted: result.interpreted,
      timezone: ctx.timezone,
    },
  };
}

async function transferToHuman(
  ctx: ToolContext,
  args: { reason?: string }
): Promise<ToolResult> {
  try {
    await ctx.db
      .collection('whatsapp_conversations')
      .doc(`${ctx.instanceName}__${ctx.remoteJid}`)
      .set(
        {
          clinicId: ctx.clinicId,
          instanceName: ctx.instanceName,
          remoteJid: ctx.remoteJid,
          agentEnabled: false,
          transferredToHumanAt: new Date().toISOString(),
          transferReason: args.reason ?? null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  } catch (err) {
    console.warn('[transferToHuman] could not persist pause', err);
  }
  return {
    ok: true,
    data: {
      transferred: true,
      conversationPaused: true,
      reason: args.reason ?? 'patient requested human assistance',
    },
  };
}

async function cancelAppointment(
  ctx: ToolContext,
  args: { appointmentId: string; reason?: string }
): Promise<ToolResult> {
  const ref = ctx.db.collection('appointments').doc(args.appointmentId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'Appointment not found' };
  const data = snap.data() as any;
  if (data.clinicId !== ctx.clinicId) {
    return { ok: false, error: 'Appointment belongs to another clinic' };
  }
  await ref.update({
    status: 'cancelled',
    cancelReason: args.reason ?? 'Cancelado pelo paciente via agente IA',
    cancelledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, data: { appointmentId: args.appointmentId, status: 'cancelled' } };
}

/* -------------------------------------------------------------------------- */
/*  Tool registry                                                              */
/* -------------------------------------------------------------------------- */

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'resolve_date',
    description:
      'Converte uma expressão livre em português ("hoje", "amanhã", "terça", "próxima sexta", "10/06", "10 de junho", "em 3 dias") para uma data ISO YYYY-MM-DD no fuso da clínica. Chame esta função SEMPRE antes de usar uma data nas outras ferramentas. Não tente converter datas você mesmo.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: {
          type: Type.STRING,
          description: 'Texto livre da data conforme o paciente disse (ex: "terça", "amanhã", "10/06")',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'list_services',
    description:
      'Lista os serviços/procedimentos disponíveis na clínica com seus preços, duração e profissional responsável. Chame esta função SEMPRE antes de tentar criar um agendamento.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'list_available_slots',
    description:
      'Lista horários disponíveis para um profissional em uma data específica. Retorna slots no formato HH:mm.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: 'Data no formato YYYY-MM-DD',
        },
        serviceId: {
          type: Type.STRING,
          description: 'ID do serviço (obtido via list_services). Opcional, mas recomendado.',
        },
        professionalId: {
          type: Type.STRING,
          description: 'ID do profissional. Opcional se a instância já tem um vinculado.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_appointment',
    description:
      'Cria um novo agendamento. Use apenas APÓS confirmar com o paciente: nome, serviço, data e horário disponível.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patientName: { type: Type.STRING, description: 'Nome completo do paciente' },
        patientPhone: {
          type: Type.STRING,
          description: 'Telefone do paciente (somente dígitos). Se omitido, usa o número do WhatsApp.',
        },
        professionalId: { type: Type.STRING, description: 'ID do profissional' },
        serviceId: { type: Type.STRING, description: 'ID do serviço' },
        date: { type: Type.STRING, description: 'Data YYYY-MM-DD' },
        time: { type: Type.STRING, description: 'Horário HH:mm (24h)' },
        notes: { type: Type.STRING, description: 'Observações livres' },
      },
      required: ['patientName', 'serviceId', 'date', 'time'],
    },
  },
  {
    name: 'list_patient_appointments',
    description:
      'Lista os próximos agendamentos do paciente atual (identificado pelo telefone do WhatsApp).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patientPhone: {
          type: Type.STRING,
          description: 'Opcional. Se omitido, usa o telefone do WhatsApp em uso.',
        },
      },
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela um agendamento existente. Confirme com o paciente antes de cancelar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointmentId: { type: Type.STRING, description: 'ID do agendamento' },
        reason: { type: Type.STRING, description: 'Motivo do cancelamento' },
      },
      required: ['appointmentId'],
    },
  },
  {
    name: 'list_available_periods',
    description:
      'Para profissionais que atendem por ORDEM DE CHEGADA (bookingMode="walk_in"). Lista os períodos do dia (ex: Manhã, Tarde) com vagas restantes para uma data.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: 'Data YYYY-MM-DD' },
        professionalId: { type: Type.STRING, description: 'Opcional. Usa o profissional vinculado se omitido.' },
      },
      required: ['date'],
    },
  },
  {
    name: 'create_walk_in_appointment',
    description:
      'Para profissionais walk-in. Cria um agendamento por ordem de chegada em um período (Manhã/Tarde/...). Confirme com o paciente que será por ordem de chegada antes de chamar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patientName: { type: Type.STRING, description: 'Nome completo do paciente' },
        patientPhone: { type: Type.STRING, description: 'Telefone, dígitos. Se omitido, usa o do WhatsApp.' },
        professionalId: { type: Type.STRING, description: 'ID do profissional' },
        serviceId: { type: Type.STRING, description: 'ID do serviço' },
        date: { type: Type.STRING, description: 'YYYY-MM-DD' },
        periodId: { type: Type.STRING, description: 'ID do período retornado por list_available_periods' },
        notes: { type: Type.STRING, description: 'Observações livres' },
      },
      required: ['patientName', 'serviceId', 'date', 'periodId'],
    },
  },
  {
    name: 'transfer_to_human',
    description:
      'Transfere a conversa para um(a) atendente humano(a). Use quando o paciente pedir explicitamente, quando detectar reclamação séria, urgência médica, ou quando você não conseguir resolver após 2-3 tentativas. Após chamar esta função, a IA é pausada automaticamente nesta conversa e um humano assume.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'Motivo da transferência (ex: "paciente pediu atendente", "urgência médica", "reclamação")',
        },
      },
    },
  },
];

export async function executeTool(
  name: string,
  args: any,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'resolve_date':
        return await resolveDateTool(ctx, args);
      case 'list_services':
        return await listServices(ctx);
      case 'list_available_slots':
        return await listAvailableSlots(ctx, args);
      case 'create_appointment':
        return await createAppointment(ctx, args);
      case 'list_patient_appointments':
        return await listPatientAppointments(ctx, args);
      case 'cancel_appointment':
        return await cancelAppointment(ctx, args);
      case 'list_available_periods':
        return await listAvailablePeriods(ctx, args);
      case 'create_walk_in_appointment':
        return await createWalkInAppointment(ctx, args);
      case 'transfer_to_human':
        return await transferToHuman(ctx, args);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    console.error(`[agentTools] ${name} failed`, err);
    return { ok: false, error: err?.message || 'Tool execution failed' };
  }
}
