import { Router } from 'express';
import { getAdminClient } from '../lib/supabase.js';
import { requireAuth, requireClinic } from '../middleware/auth.js';

export const professionalsRouter = Router();
professionalsRouter.use(requireAuth, requireClinic);

const FIELD_MAP: Record<string, string> = {
  name: 'name',
  email: 'email',
  specialty: 'specialty',
  schedule: 'schedule',
  services: 'services',
  bookingMode: 'booking_mode',
  walkInPeriods: 'walk_in_periods',
  weeklyLinkToken: 'weekly_link_token',
};

professionalsRouter.get('/', async (req, res) => {
  const { clinicId } = req.auth!;
  const { data, error } = await getAdminClient()
    .from('professionals')
    .select('*')
    .eq('clinic_id', clinicId!)
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ professionals: data });
});

professionalsRouter.post('/', async (req, res) => {
  const { clinicId } = req.auth!;
  const { name, email, specialty, schedule, services, bookingMode, walkInPeriods } =
    req.body ?? {};
  if (!name) return res.status(400).json({ error: '"name" é obrigatório.' });
  const { data, error } = await getAdminClient()
    .from('professionals')
    .insert({
      clinic_id: clinicId,
      name: String(name).trim(),
      email: email ?? '',
      specialty: specialty ?? null,
      schedule: schedule ?? {},
      services: services ?? [],
      booking_mode: bookingMode ?? 'slot',
      walk_in_periods: walkInPeriods ?? {},
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ professional: data });
});

professionalsRouter.get('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { data, error } = await getAdminClient()
    .from('professionals')
    .select('*')
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .single();
  if (error) return res.status(404).json({ error: 'Profissional não encontrado.' });
  return res.status(200).json({ professional: data });
});

professionalsRouter.put('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const updates: Record<string, unknown> = {};
  for (const [js, db] of Object.entries(FIELD_MAP)) {
    if (req.body?.[js] !== undefined) updates[db] = req.body[js];
  }
  const { data, error } = await getAdminClient()
    .from('professionals')
    .update(updates)
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ professional: data });
});

professionalsRouter.delete('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { error } = await getAdminClient()
    .from('professionals')
    .delete()
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
});
