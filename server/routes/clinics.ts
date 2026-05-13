import { Router } from 'express';
import { getAdminClient } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { invalidateCachedAuth } from '../lib/authCache.js';

export const clinicsRouter = Router();
clinicsRouter.use(requireAuth);

// GET /api/clinics — clínica do usuário (ou null)
clinicsRouter.get('/', async (req, res) => {
  const { clinicId } = req.auth!;
  if (!clinicId) return res.status(200).json({ clinic: null });
  const { data, error } = await getAdminClient()
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ clinic: data });
});

// POST /api/clinics — onboarding
clinicsRouter.post('/', async (req, res) => {
  const { userId, email, clinicId } = req.auth!;
  if (clinicId) {
    return res.status(409).json({ error: 'Você já possui uma clínica cadastrada.' });
  }
  const { name, whatsappNumber, timezone, address } = req.body ?? {};
  if (!name) return res.status(400).json({ error: '"name" é obrigatório.' });

  const { data, error } = await getAdminClient()
    .from('clinics')
    .insert({
      user_id: userId,
      admin_email: email,
      name: String(name).trim(),
      whatsapp_number: whatsappNumber ?? null,
      timezone: timezone ?? 'America/Sao_Paulo',
      address: address ?? null,
      settings: {},
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  // Cache da auth ainda traria clinicId=null por até 60s; invalida para refletir já.
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (token) invalidateCachedAuth(token);
  return res.status(201).json({ clinic: data });
});

function ensureOwn(req: any, res: any): boolean {
  const id = req.params.id;
  if (!req.auth.clinicId || req.auth.clinicId !== id) {
    res.status(403).json({ error: 'Acesso negado.' });
    return false;
  }
  return true;
}

clinicsRouter.get('/:id', async (req, res) => {
  if (!ensureOwn(req, res)) return;
  const { data, error } = await getAdminClient()
    .from('clinics')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Clínica não encontrada.' });
  return res.status(200).json({ clinic: data });
});

clinicsRouter.put('/:id', async (req, res) => {
  if (!ensureOwn(req, res)) return;
  const allowed = ['name', 'address', 'whatsapp_number', 'timezone', 'settings'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  }
  if (req.body?.whatsappNumber !== undefined) {
    updates['whatsapp_number'] = req.body.whatsappNumber;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
  }
  const { data, error } = await getAdminClient()
    .from('clinics')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ clinic: data });
});

clinicsRouter.delete('/:id', async (req, res) => {
  if (!ensureOwn(req, res)) return;
  const { error } = await getAdminClient()
    .from('clinics')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
});
