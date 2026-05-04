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
