import { Router } from 'express';
import { getAdminClient } from '../lib/supabase.js';
import { requireAuth, requireClinic } from '../middleware/auth.js';

export const patientsRouter = Router();
patientsRouter.use(requireAuth, requireClinic);

patientsRouter.get('/', async (req, res) => {
  const { clinicId } = req.auth!;
  const search = (req.query.search as string | undefined)?.trim();
  let query = getAdminClient()
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId!)
    .order('name', { ascending: true });
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ patients: data });
});

patientsRouter.post('/', async (req, res) => {
  const { clinicId } = req.auth!;
  const { name, phone, email } = req.body ?? {};
  if (!name || !phone) {
    return res.status(400).json({ error: '"name" e "phone" são obrigatórios.' });
  }
  const cleanPhone = String(phone).replace(/\D/g, '');
  const supabase = getAdminClient();

  const { data: existing } = await supabase
    .from('patients')
    .select('id')
    .eq('clinic_id', clinicId!)
    .eq('phone', cleanPhone)
    .limit(1);
  if (existing && existing.length > 0) {
    return res.status(409).json({ error: 'Já existe um paciente com este telefone.' });
  }

  const { data, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: clinicId,
      name: String(name).trim(),
      phone: cleanPhone,
      email: email ?? null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ patient: data });
});

patientsRouter.get('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { data, error } = await getAdminClient()
    .from('patients')
    .select('*')
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .single();
  if (error) return res.status(404).json({ error: 'Paciente não encontrado.' });
  return res.status(200).json({ patient: data });
});

patientsRouter.put('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const allowed = ['name', 'phone', 'email'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) {
      updates[key] =
        key === 'phone' ? String(req.body[key]).replace(/\D/g, '') : req.body[key];
    }
  }
  const { data, error } = await getAdminClient()
    .from('patients')
    .update(updates)
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ patient: data });
});

patientsRouter.delete('/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { error } = await getAdminClient()
    .from('patients')
    .delete()
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
});
