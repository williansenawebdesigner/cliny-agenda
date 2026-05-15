import type { SupabaseClient } from '@supabase/supabase-js';
import { Type, type FunctionDeclaration } from '@google/genai';
import {
  DEFAULT_TIMEZONE, dayOfWeekInTz, endOfDayInTz, fromZonedTime,
  hmInTz, humanInTz, startOfDayInTz, ymdInTz,
} from './tz.js';

export interface ToolContext {
  db: SupabaseClient;
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

function jidToPhone(jid: string): string { return jid.split('@')[0]; }
function pad(n: number) { return n.toString().padStart(2, '0'); }
const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function buildSlotsForProfessional(
  schedule: Record<string, string[]> | undefined,
  ymd: string, tz: string, durationMin: number
): string[] {
  const dayIndex = dayOfWeekInTz(startOfDayInTz(ymd, tz), tz);
  const key = DAY_KEYS[dayIndex];
  // Empty object {} = schedule not configured yet; fall back to 09-18 defaults.
  const hasSchedule = schedule && Object.keys(schedule).length > 0;
  if (!hasSchedule) {
    const out: string[] = [];
    for (let h = 9; h < 18; h++) {
      out.push(`${pad(h)}:00`);
      if (durationMin <= 30) out.push(`${pad(h)}:30`);
    }
    return out;
  }
  return schedule![key] ?? [];
}

async function findProfessional(ctx: ToolContext, professionalId?: string) {
  const id = professionalId || ctx.professionalId;
  if (id) {
    const { data } = await ctx.db.from('professionals').select('*').eq('id', id).single();
    return data ?? null;
  }
  const { data } = await ctx.db.from('professionals')
    .select('*').eq('clinic_id', ctx.clinicId).limit(1);
  return data?.[0] ?? null;
}

async function listProfessionalsForClinic(ctx: ToolContext) {
  if (ctx.professionalId) {
    const p = await findProfessional(ctx, ctx.professionalId);
    return p ? [p] : [];
  }
  const { data } = await ctx.db.from('professionals')
    .select('*').eq('clinic_id', ctx.clinicId);
  return data ?? [];
}

async function findOrCreatePatient(
  ctx: ToolContext, name: string, phone: string
): Promise<{ id: string; created: boolean }> {
  const cleanPhone = phone.replace(/\D/g, '');
  const { data: existing } = await ctx.db.from('patients')
    .select('id').eq('clinic_id', ctx.clinicId).eq('phone', cleanPhone).limit(1);
  if (existing && existing.length > 0) return { id: existing[0].id, created: false };
  const { data: created } = await ctx.db.from('patients')
    .insert({ clinic_id: ctx.clinicId, name: name.trim(), phone: cleanPhone })
    .select('id').single();
  return { id: created!.id, created: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────────────────────────────────────

async function listServices(ctx: ToolContext): Promise<ToolResult> {
  const profs = await listProfessionalsForClinic(ctx);
  const services = profs.flatMap((p: any) =>
    (p.services ?? []).map((s: any) => ({
      professionalId: p.id, professionalName: p.name,
      serviceId: s.id, name: s.name, durationMin: s.duration, price: s.price,
      bookingMode: p.booking_mode === 'walk_in' ? 'walk_in' : 'slot',
    }))
  );
  return {
    ok: true,
    data: {
      services,
      note: 'Serviços com bookingMode="walk_in" são por ordem de chegada (sem hora marcada). Para esses, NÃO chame list_available_slots — chame list_available_periods e create_walk_in_appointment.',
    },
  };
}

async function listAvailableSlots(
  ctx: ToolContext,
  args: { date: string; serviceId?: string; professionalId?: string }
): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date))
    return { ok: false, error: `Data inválida: ${args.date} (use YYYY-MM-DD)` };

  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'Nenhum profissional encontrado.' };

  const service = args.serviceId && (prof.services ?? []).find((s: any) => s.id === args.serviceId);
  const durationMin = service?.duration ?? 30;
  const allSlots = buildSlotsForProfessional(prof.schedule, args.date, ctx.timezone, durationMin);
  if (allSlots.length === 0) {
    return { ok: true, data: { date: args.date, professionalId: prof.id, availableSlots: [], reason: 'Sem agenda neste dia.' } };
  }

  const dayStart = startOfDayInTz(args.date, ctx.timezone);
  const dayEnd = endOfDayInTz(args.date, ctx.timezone);

  const { data: appts } = await ctx.db.from('appointments')
    .select('start_time, status')
    .eq('clinic_id', ctx.clinicId).eq('professional_id', prof.id)
    .gte('start_time', dayStart.toISOString()).lte('start_time', dayEnd.toISOString());

  const taken = new Set<string>();
  (appts ?? []).forEach((a: any) => {
    if (a.status !== 'cancelled') taken.add(hmInTz(new Date(a.start_time), ctx.timezone));
  });

  return {
    ok: true,
    data: {
      date: args.date, professionalId: prof.id, professionalName: prof.name,
      timezone: ctx.timezone, durationMin,
      availableSlots: allSlots.filter(s => !taken.has(s)),
    },
  };
}

async function createAppointment(
  ctx: ToolContext,
  args: { patientName: string; patientPhone?: string; professionalId?: string; serviceId: string; date: string; time: string; notes?: string }
): Promise<ToolResult> {
  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'Profissional não encontrado.' };
  const service = (prof.services ?? []).find((s: any) => s.id === args.serviceId);
  if (!service) return { ok: false, error: `Serviço ${args.serviceId} não encontrado. Chame list_services primeiro.` };

  const startTime = fromZonedTime(args.date, args.time, ctx.timezone);
  if (isNaN(startTime.getTime())) return { ok: false, error: `Data/hora inválida: ${args.date} ${args.time}` };
  if (startTime.getTime() < Date.now() - 60000) return { ok: false, error: 'Não é possível agendar no passado.' };
  const endTime = new Date(startTime.getTime() + (service.duration ?? 30) * 60000);

  const { data: conflict } = await ctx.db.from('appointments')
    .select('id, status').eq('clinic_id', ctx.clinicId).eq('professional_id', prof.id)
    .eq('start_time', startTime.toISOString()).neq('status', 'cancelled');
  if (conflict && conflict.length > 0) return { ok: false, error: 'Horário já ocupado. Chame list_available_slots para sugerir outro.' };

  const phone = args.patientPhone || jidToPhone(ctx.remoteJid);
  const { id: patientId, created } = await findOrCreatePatient(ctx, args.patientName, phone);

  const { data: appt, error } = await ctx.db.from('appointments').insert({
    clinic_id: ctx.clinicId, professional_id: prof.id, patient_id: patientId,
    service_id: args.serviceId, start_time: startTime.toISOString(), end_time: endTime.toISOString(),
    status: 'scheduled', price: service.price ?? 0, notes: args.notes ?? '',
    created_by: 'agent',
  }).select('id').single();

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: {
      appointmentId: appt!.id, patientId, patientCreated: created,
      professionalName: prof.name, serviceName: service.name,
      startTimeUtc: startTime.toISOString(), startTimeLocal: humanInTz(startTime, ctx.timezone),
      timezone: ctx.timezone, durationMin: service.duration ?? 30, price: service.price ?? 0,
    },
  };
}

async function listPatientAppointments(ctx: ToolContext, args: { patientPhone?: string }): Promise<ToolResult> {
  const phone = (args.patientPhone || jidToPhone(ctx.remoteJid)).replace(/\D/g, '');
  const { data: patients } = await ctx.db.from('patients')
    .select('id, name').eq('clinic_id', ctx.clinicId).eq('phone', phone).limit(1);
  if (!patients || patients.length === 0) return { ok: true, data: { appointments: [], reason: 'Paciente não encontrado.' } };

  const patient = patients[0];
  const { data: appts } = await ctx.db.from('appointments')
    .select('id, start_time, status, professional_id, service_id')
    .eq('clinic_id', ctx.clinicId).eq('patient_id', patient.id)
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true }).limit(10);

  return {
    ok: true,
    data: {
      patientId: patient.id, patientName: patient.name, timezone: ctx.timezone,
      appointments: (appts ?? []).map((a: any) => ({
        appointmentId: a.id, startTimeUtc: a.start_time,
        startTimeLocal: humanInTz(new Date(a.start_time), ctx.timezone),
        status: a.status, professionalId: a.professional_id, serviceId: a.service_id,
      })),
    },
  };
}

async function listAvailablePeriods(ctx: ToolContext, args: { date: string; professionalId?: string }): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return { ok: false, error: `Data inválida: ${args.date}` };
  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'Profissional não encontrado.' };
  if (prof.booking_mode !== 'walk_in') return { ok: false, error: `${prof.name} usa horário marcado. Use list_available_slots.` };

  const dayIndex = dayOfWeekInTz(startOfDayInTz(args.date, ctx.timezone), ctx.timezone);
  const dayKey = DAY_KEYS[dayIndex];
  const periods: any[] = (prof.walk_in_periods ?? {})[dayKey] ?? [];
  if (periods.length === 0) return { ok: true, data: { date: args.date, periods: [], reason: `Sem períodos configurados para ${dayKey}.` } };

  const dayStart = startOfDayInTz(args.date, ctx.timezone);
  const dayEnd = endOfDayInTz(args.date, ctx.timezone);
  const { data: appts } = await ctx.db.from('appointments')
    .select('period_id, status')
    .eq('clinic_id', ctx.clinicId).eq('professional_id', prof.id)
    .gte('start_time', dayStart.toISOString()).lte('start_time', dayEnd.toISOString());

  const used: Record<string, number> = {};
  (appts ?? []).forEach((a: any) => {
    if (a.status !== 'cancelled' && a.period_id) used[a.period_id] = (used[a.period_id] ?? 0) + 1;
  });

  return {
    ok: true,
    data: {
      date: args.date, professionalId: prof.id, professionalName: prof.name,
      bookingMode: 'walk_in', timezone: ctx.timezone,
      periods: periods.map((p: any) => {
        const u = used[p.id] ?? 0;
        return { periodId: p.id, label: p.label, start: p.start, end: p.end, capacity: p.capacity, used: u, remaining: Math.max(0, (p.capacity ?? 0) - u), available: u < (p.capacity ?? 0) };
      }),
    },
  };
}

async function createWalkInAppointment(
  ctx: ToolContext,
  args: { patientName: string; patientPhone?: string; professionalId?: string; serviceId: string; date: string; periodId: string; notes?: string }
): Promise<ToolResult> {
  const prof = await findProfessional(ctx, args.professionalId);
  if (!prof) return { ok: false, error: 'Profissional não encontrado.' };
  if (prof.booking_mode !== 'walk_in') return { ok: false, error: `${prof.name} usa horário marcado. Use create_appointment.` };

  const service = (prof.services ?? []).find((s: any) => s.id === args.serviceId);
  if (!service) return { ok: false, error: `Serviço ${args.serviceId} não encontrado.` };

  const dayIndex = dayOfWeekInTz(startOfDayInTz(args.date, ctx.timezone), ctx.timezone);
  const dayKey = DAY_KEYS[dayIndex];
  const periods = (prof.walk_in_periods ?? {})[dayKey] ?? [];
  const period = periods.find((p: any) => p.id === args.periodId);
  if (!period) return { ok: false, error: `Período ${args.periodId} não configurado para ${dayKey}.` };

  const startTime = fromZonedTime(args.date, period.start, ctx.timezone);
  if (startTime.getTime() < Date.now() - 60000) return { ok: false, error: 'Não é possível agendar no passado.' };
  const endTime = fromZonedTime(args.date, period.end, ctx.timezone);

  const dayStart = startOfDayInTz(args.date, ctx.timezone);
  const dayEnd = endOfDayInTz(args.date, ctx.timezone);
  const { data: dayAppts } = await ctx.db.from('appointments')
    .select('period_id, status').eq('clinic_id', ctx.clinicId).eq('professional_id', prof.id)
    .gte('start_time', dayStart.toISOString()).lte('start_time', dayEnd.toISOString());

  const usedCount = (dayAppts ?? []).filter((a: any) => a.status !== 'cancelled' && a.period_id === period.id).length;
  if (usedCount >= (period.capacity ?? 0)) return { ok: false, error: `Período "${period.label}" lotado em ${args.date}.` };

  const phone = args.patientPhone || jidToPhone(ctx.remoteJid);
  const { id: patientId, created } = await findOrCreatePatient(ctx, args.patientName, phone);

  const { data: appt, error } = await ctx.db.from('appointments').insert({
    clinic_id: ctx.clinicId, professional_id: prof.id, patient_id: patientId,
    service_id: args.serviceId, start_time: startTime.toISOString(), end_time: endTime.toISOString(),
    status: 'scheduled', price: service.price ?? 0, notes: args.notes ?? '',
    walk_in: true, period_id: period.id, period_label: period.label, created_by: 'agent',
  }).select('id').single();
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      appointmentId: appt!.id, patientId, patientCreated: created,
      professionalName: prof.name, serviceName: service.name,
      bookingMode: 'walk_in', periodLabel: period.label,
      date: args.date, timezone: ctx.timezone,
      reminderToPatient: `Atendimento por ordem de chegada. Compareça à clínica a partir das ${period.start} no dia ${args.date}.`,
    },
  };
}

async function transferToHuman(ctx: ToolContext, args: { reason?: string }): Promise<ToolResult> {
  const convId = `${ctx.instanceName}__${ctx.remoteJid}`;
  await ctx.db.from('whatsapp_conversations').upsert({
    id: convId, clinic_id: ctx.clinicId, instance_name: ctx.instanceName,
    remote_jid: ctx.remoteJid, agent_enabled: false,
    transferred_to_human_at: new Date().toISOString(),
    transfer_reason: args.reason ?? null,
  }, { onConflict: 'id' });
  return { ok: true, data: { transferred: true, conversationPaused: true, reason: args.reason ?? 'patient requested human' } };
}

async function cancelAppointment(ctx: ToolContext, args: { appointmentId: string; reason?: string }): Promise<ToolResult> {
  const { data: appt } = await ctx.db.from('appointments').select('clinic_id').eq('id', args.appointmentId).single();
  if (!appt) return { ok: false, error: 'Agendamento não encontrado.' };
  if (appt.clinic_id !== ctx.clinicId) return { ok: false, error: 'Agendamento de outra clínica.' };

  const { error } = await ctx.db.from('appointments').update({
    status: 'cancelled',
    cancel_reason: args.reason ?? 'Cancelado pelo paciente via agente IA',
    cancelled_at: new Date().toISOString(),
  }).eq('id', args.appointmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { appointmentId: args.appointmentId, status: 'cancelled' } };
}

async function rescheduleAppointment(
  ctx: ToolContext,
  args: { appointmentId: string; newDate: string; newTime: string }
): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.newDate))
    return { ok: false, error: `Data inválida: ${args.newDate} (use YYYY-MM-DD)` };

  const { data: appt } = await ctx.db.from('appointments')
    .select('*').eq('id', args.appointmentId).eq('clinic_id', ctx.clinicId).single();
  if (!appt) return { ok: false, error: 'Agendamento não encontrado.' };
  if (appt.status === 'cancelled') return { ok: false, error: 'Agendamento já cancelado, não pode ser remarcado.' };

  const prof = await findProfessional(ctx, appt.professional_id);
  if (!prof) return { ok: false, error: 'Profissional não encontrado.' };
  const service = (prof.services ?? []).find((s: any) => s.id === appt.service_id);
  const durationMin = service?.duration ?? 30;

  const newStart = fromZonedTime(args.newDate, args.newTime, ctx.timezone);
  if (isNaN(newStart.getTime())) return { ok: false, error: `Data/hora inválida: ${args.newDate} ${args.newTime}` };
  if (newStart.getTime() < Date.now() - 60000) return { ok: false, error: 'Não é possível remarcar para o passado.' };
  const newEnd = new Date(newStart.getTime() + durationMin * 60000);

  const { data: conflict } = await ctx.db.from('appointments')
    .select('id').eq('clinic_id', ctx.clinicId).eq('professional_id', appt.professional_id)
    .eq('start_time', newStart.toISOString()).neq('status', 'cancelled').neq('id', args.appointmentId);
  if (conflict && conflict.length > 0) return { ok: false, error: 'Horário já ocupado. Consulte list_available_slots para outro.' };

  const { error } = await ctx.db.from('appointments').update({
    start_time: newStart.toISOString(),
    end_time: newEnd.toISOString(),
    status: 'scheduled',
  }).eq('id', args.appointmentId);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      appointmentId: appt.id, professionalName: prof.name,
      serviceName: service?.name ?? 'Serviço',
      newStartTimeUtc: newStart.toISOString(),
      newStartTimeLocal: humanInTz(newStart, ctx.timezone),
      timezone: ctx.timezone,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Date resolver (PT-BR)
// ─────────────────────────────────────────────────────────────────────────────

const DAY_NAMES_PT: Record<string, number> = {
  domingo:0,'segunda':1,'segunda-feira':1,'terca':2,'terça':2,'terca-feira':2,'terça-feira':2,
  quarta:3,'quarta-feira':3,quinta:4,'quinta-feira':4,sexta:5,'sexta-feira':5,sabado:6,'sábado':6,
};
const MONTH_NAMES_PT: Record<string, number> = {
  janeiro:0,fevereiro:1,marco:2,'março':2,abril:3,maio:4,junho:5,julho:6,agosto:7,setembro:8,outubro:9,novembro:10,dezembro:11,
};

function stripAccentsLower(s: string) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }
function fmtYmd(y:number,m0:number,d:number){return `${y}-${(m0+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;}
function addDaysYmd(ymd:string,days:number,tz:string){const b=startOfDayInTz(ymd,tz);const n=new Date(b.getTime()+days*86400000);return ymdInTz(n,tz);}

function resolveDateExpression(expr:string,tz:string):{ymd?:string;weekdayName?:string;interpreted?:string;error?:string}{
  const raw=expr?.trim();if(!raw)return{error:'Expressão vazia'};
  const text=stripAccentsLower(raw);
  const now=new Date();const todayYmd=ymdInTz(now,tz);
  const [ty,tm,td]=todayYmd.split('-').map(Number);
  const todayW=dayOfWeekInTz(startOfDayInTz(todayYmd,tz),tz);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return{ymd:text,interpreted:'ISO'};
  const brM=text.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if(brM){let y=brM[3]?Number(brM[3]):ty;if(y<100)y+=2000;const c=fmtYmd(y,Number(brM[2])-1,Number(brM[1]));if(!brM[3]&&startOfDayInTz(c,tz)<startOfDayInTz(todayYmd,tz))return{ymd:fmtYmd(y+1,Number(brM[2])-1,Number(brM[1])),interpreted:'DD/MM'};return{ymd:c,interpreted:'DD/MM'};}
  if(/^hoje$|^para hoje$/.test(text))return{ymd:todayYmd,interpreted:'hoje'};
  if(/^amanha$|^para amanha$/.test(text))return{ymd:addDaysYmd(todayYmd,1,tz),interpreted:'amanhã'};
  if(/^depois de amanha$/.test(text))return{ymd:addDaysYmd(todayYmd,2,tz),interpreted:'depois de amanhã'};
  const inD=text.match(/^(?:em|daqui a) (\d+) dias?$/);
  if(inD)return{ymd:addDaysYmd(todayYmd,Number(inD[1]),tz),interpreted:`em ${inD[1]} dias`};
  const dmM=text.match(/^(\d{1,2})(?:\s+de\s+|\s+|\/)([a-z]+)(?:\s+de\s+(\d{4}))?$/);
  if(dmM&&MONTH_NAMES_PT[dmM[2]]!==undefined){const d=Number(dmM[1]),m0=MONTH_NAMES_PT[dmM[2]];let y=dmM[3]?Number(dmM[3]):ty;const c=fmtYmd(y,m0,d);if(!dmM[3]&&startOfDayInTz(c,tz)<startOfDayInTz(todayYmd,tz))return{ymd:fmtYmd(y+1,m0,d),interpreted:'N de mês'};return{ymd:c,interpreted:'N de mês'};}
  const labels=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  for(const[key,targetDow]of Object.entries(DAY_NAMES_PT)){
    const s=stripAccentsLower(key);
    const patterns=[new RegExp(`^${s}$`),new RegExp(`^proxima ${s}$`),new RegExp(`^proximo ${s}$`),new RegExp(`^${s} que vem$`)];
    if(patterns.some(re=>re.test(text))){
      const forceNext=/proxima|proximo|que vem/.test(text);
      let diff=(targetDow-todayW+7)%7;if(diff===0&&forceNext)diff=7;
      return{ymd:addDaysYmd(todayYmd,diff,tz),weekdayName:labels[targetDow],interpreted:labels[targetDow]};
    }
  }
  return{error:`Não entendi a data "${raw}". Peça uma data específica (DD/MM ou nome do dia).`};
}

async function resolveDateTool(ctx:ToolContext,args:{expression:string}):Promise<ToolResult>{
  const r=resolveDateExpression(args.expression??'',ctx.timezone);
  if(r.error)return{ok:false,error:r.error};
  return{ok:true,data:{input:args.expression,date:r.ymd,weekdayName:r.weekdayName,interpreted:r.interpreted,timezone:ctx.timezone}};
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registry
// ─────────────────────────────────────────────────────────────────────────────

export const toolDeclarations: FunctionDeclaration[] = [
  { name:'resolve_date', description:'Converte expressão de data PT-BR para YYYY-MM-DD no fuso da clínica. Chame SEMPRE antes de list_available_slots, create_appointment etc.', parameters:{ type:Type.OBJECT, properties:{ expression:{ type:Type.STRING, description:'Texto livre como "terça", "amanhã", "10/06"' } }, required:['expression'] } },
  { name:'list_services', description:'Lista serviços disponíveis da clínica. Chame SEMPRE antes de criar agendamento.', parameters:{ type:Type.OBJECT, properties:{} } },
  { name:'list_available_slots', description:'Lista horários disponíveis para uma data (modo slot).', parameters:{ type:Type.OBJECT, properties:{ date:{ type:Type.STRING }, serviceId:{ type:Type.STRING }, professionalId:{ type:Type.STRING } }, required:['date'] } },
  { name:'create_appointment', description:'Cria agendamento por hora marcada.', parameters:{ type:Type.OBJECT, properties:{ patientName:{ type:Type.STRING }, patientPhone:{ type:Type.STRING }, professionalId:{ type:Type.STRING }, serviceId:{ type:Type.STRING }, date:{ type:Type.STRING }, time:{ type:Type.STRING }, notes:{ type:Type.STRING } }, required:['patientName','serviceId','date','time'] } },
  { name:'list_available_periods', description:'Lista períodos disponíveis (modo walk-in).', parameters:{ type:Type.OBJECT, properties:{ date:{ type:Type.STRING }, professionalId:{ type:Type.STRING } }, required:['date'] } },
  { name:'create_walk_in_appointment', description:'Cria agendamento por ordem de chegada.', parameters:{ type:Type.OBJECT, properties:{ patientName:{ type:Type.STRING }, patientPhone:{ type:Type.STRING }, professionalId:{ type:Type.STRING }, serviceId:{ type:Type.STRING }, date:{ type:Type.STRING }, periodId:{ type:Type.STRING }, notes:{ type:Type.STRING } }, required:['patientName','serviceId','date','periodId'] } },
  { name:'list_patient_appointments', description:'Lista próximos agendamentos do paciente.', parameters:{ type:Type.OBJECT, properties:{ patientPhone:{ type:Type.STRING } } } },
  { name:'cancel_appointment', description:'Cancela um agendamento.', parameters:{ type:Type.OBJECT, properties:{ appointmentId:{ type:Type.STRING }, reason:{ type:Type.STRING } }, required:['appointmentId'] } },
  { name:'transfer_to_human', description:'Pausa o agente e transfere para atendente humano.', parameters:{ type:Type.OBJECT, properties:{ reason:{ type:Type.STRING } } } },
  { name:'reschedule_appointment', description:'Reagenda (remarca) um agendamento existente para nova data e hora. Chame list_available_slots antes para verificar disponibilidade.', parameters:{ type:Type.OBJECT, properties:{ appointmentId:{ type:Type.STRING }, newDate:{ type:Type.STRING, description:'YYYY-MM-DD' }, newTime:{ type:Type.STRING, description:'HH:MM' } }, required:['appointmentId','newDate','newTime'] } },
];

export async function executeTool(name: string, args: Record<string, any>, ctx: ToolContext): Promise<ToolResult> {
  const a = args as any;
  switch (name) {
    case 'resolve_date':               return resolveDateTool(ctx, a);
    case 'list_services':              return listServices(ctx);
    case 'list_available_slots':       return listAvailableSlots(ctx, a);
    case 'create_appointment':         return createAppointment(ctx, a);
    case 'list_available_periods':     return listAvailablePeriods(ctx, a);
    case 'create_walk_in_appointment': return createWalkInAppointment(ctx, a);
    case 'list_patient_appointments':  return listPatientAppointments(ctx, a);
    case 'cancel_appointment':         return cancelAppointment(ctx, a);
    case 'transfer_to_human':          return transferToHuman(ctx, a);
    case 'reschedule_appointment':         return rescheduleAppointment(ctx, a);
    default: return { ok: false, error: `Ferramenta desconhecida: ${name}` };
  }
}
