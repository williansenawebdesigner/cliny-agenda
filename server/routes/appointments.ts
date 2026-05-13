import { Router } from 'express';
import { getAdminClient } from '../lib/supabase.js';
import { requireAuth, requireClinic } from '../middleware/auth.js';

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth, requireClinic);

const FIELD_MAP: Record<string, string> = {
  status: 'status',
  notes: 'notes',
  price: 'price',
  startTime: 'start_time',
  endTime: 'end_time',
  professionalId: 'professional_id',
  patientId: 'patient_id',
  serviceId: 'service_id',
  cancelReason: 'cancel_reason',
};

appointmentsRouter.get('/', async (req, res) => {
  const { clinicId } = req.auth!;
  const { startDate, endDate, professionalId } = req.query as Record<string, string>;
  let query = getAdminClient()
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId!)
    .order('start_time', { ascending: true });
  if (startDate) query = query.gte('start_time', startDate);
  if (endDate) query = query.lte('start_time', endDate);
  if (professionalId) query = query.eq('professional_id', professionalId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ appointments: data });
});

appointmentsRouter.post('/', async (req, res) => {
  const { clinicId } = req.auth!;
  const {
    professionalId,
    patientId,
    serviceId,
    startTime,
    endTime,
    status,
    price,
    notes,
    walkIn,
    periodId,
    periodLabel,
  } = req.body ?? {};
  if (!professionalId || !patientId || !serviceId || !startTime || !endTime) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }
  const { data, error } = await getAdminClient()
    .from('appointments')
    .insert({
      clinic_id: clinicId,
      professional_id: professionalId,
      patient_id: patientId,
      service_id: serviceId,
      start_time: startTime,
      end_time: endTime,
      status: status ?? 'scheduled',
      price: price ?? 0,
      notes: notes ?? null,
      walk_in: walkIn ?? false,
      period_id: periodId ?? null,
      period_label: periodLabel ?? null,
      created_by: 'dashboard',
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ appointment: data });
});

appointmentsRouter.get('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { data, error } = await getAdminClient()
    .from('appointments')
    .select('*')
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .single();
  if (error) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  return res.status(200).json({ appointment: data });
});

appointmentsRouter.put('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const updates: Record<string, unknown> = {};
  for (const [js, db] of Object.entries(FIELD_MAP)) {
    if (req.body?.[js] !== undefined) updates[db] = req.body[js];
  }
  if (updates['status'] === 'cancelled' && !updates['cancelled_at']) {
    updates['cancelled_at'] = new Date().toISOString();
  }
  const { data, error } = await getAdminClient()
    .from('appointments')
    .update(updates)
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ appointment: data });
});

appointmentsRouter.delete('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { error } = await getAdminClient()
    .from('appointments')
    .delete()
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
});
