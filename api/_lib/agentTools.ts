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
    }))
  );
  return { ok: true, data: { services } };
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
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    console.error(`[agentTools] ${name} failed`, err);
    return { ok: false, error: err?.message || 'Tool execution failed' };
  }
}
