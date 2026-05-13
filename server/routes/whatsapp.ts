import { Router } from 'express';
import { getAdminClient } from '../lib/supabase.js';
import { requireAuth, requireClinic } from '../middleware/auth.js';

export const whatsappRouter = Router();
whatsappRouter.use(requireAuth, requireClinic);

// ── Instances ────────────────────────────────────────────────────────────────
whatsappRouter.get('/instances', async (req, res) => {
  const { clinicId } = req.auth!;
  const { data, error } = await getAdminClient()
    .from('whatsapp_instances')
    .select('*')
    .eq('clinic_id', clinicId!)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ instances: data });
});

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

whatsappRouter.post('/instances', async (req, res) => {
  const { clinicId } = req.auth!;
  const { name, instanceName, professionalId, prompt, agent } = req.body ?? {};
  if (!name) return res.status(400).json({ error: '"name" é obrigatório.' });

  // Derive instanceName from name if not provided. Evolution API needs a stable
  // unique identifier per instance and the UI only asks for the friendly name.
  const base = slugify(String(instanceName || name));
  const suffix = Math.random().toString(36).slice(2, 8);
  const finalInstanceName = instanceName
    ? String(instanceName).trim()
    : `${base || 'inst'}-${suffix}`;

  const { data, error } = await getAdminClient()
    .from('whatsapp_instances')
    .insert({
      clinic_id: clinicId,
      name: String(name).trim(),
      instance_name: finalInstanceName,
      professional_id: professionalId ?? null,
      prompt: prompt ?? '',
      status: 'disconnected',
      agent: agent ?? {},
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Uma instância com este nome já existe.' });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ instance: data });
});

const INSTANCE_FIELDS: Record<string, string> = {
  name: 'name',
  prompt: 'prompt',
  agent: 'agent',
  status: 'status',
  qrCode: 'qr_code',
  professionalId: 'professional_id',
};

whatsappRouter.get('/instances/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { data, error } = await getAdminClient()
    .from('whatsapp_instances')
    .select('*')
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .single();
  if (error) return res.status(404).json({ error: 'Instância não encontrada.' });
  return res.status(200).json({ instance: data });
});

whatsappRouter.put('/instances/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const updates: Record<string, unknown> = {};
  for (const [js, db] of Object.entries(INSTANCE_FIELDS)) {
    if (req.body?.[js] !== undefined) updates[db] = req.body[js];
  }
  const { data, error } = await getAdminClient()
    .from('whatsapp_instances')
    .update(updates)
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ instance: data });
});

whatsappRouter.delete('/instances/:id', async (req, res) => {
  const { clinicId } = req.auth!;
  const { error } = await getAdminClient()
    .from('whatsapp_instances')
    .delete()
    .eq('id', req.params.id)
    .eq('clinic_id', clinicId!);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
});

// ── Conversations ────────────────────────────────────────────────────────────
whatsappRouter.get('/conversations', async (req, res) => {
  const { clinicId } = req.auth!;
  const instanceName = req.query.instanceName as string | undefined;
  let query = getAdminClient()
    .from('whatsapp_conversations')
    .select('*')
    .eq('clinic_id', clinicId!)
    .order('last_message_at', { ascending: false });
  if (instanceName) query = query.eq('instance_name', instanceName);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ conversations: data });
});

/**
 * PUT /api/whatsapp/conversations/status
 * Body: { instanceName, remoteJid, agentEnabled?, unread?, contactName? }
 * Esse endpoint estava sendo chamado pelo ChatView mas não existia — adicionado agora.
 */
whatsappRouter.put('/conversations/status', async (req, res) => {
  const { clinicId } = req.auth!;
  const { instanceName, remoteJid, agentEnabled, unread, contactName } =
    req.body ?? {};
  if (!instanceName || !remoteJid) {
    return res
      .status(400)
      .json({ error: '"instanceName" e "remoteJid" são obrigatórios.' });
  }
  const convId = `${instanceName}__${remoteJid}`;
  const updates: Record<string, unknown> = {};
  if (agentEnabled !== undefined) updates['agent_enabled'] = agentEnabled;
  if (unread !== undefined) updates['unread'] = unread;
  if (contactName !== undefined) updates['contact_name'] = contactName;
  if (agentEnabled === false) {
    updates['transferred_to_human_at'] = new Date().toISOString();
    updates['transfer_reason'] = 'manual';
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .update(updates)
    .eq('id', convId)
    .eq('clinic_id', clinicId!)
    .select()
    .single();

  // Se a conversa ainda não existe, faz upsert
  if (error && error.code === 'PGRST116') {
    const { data: created, error: upsertErr } = await supabase
      .from('whatsapp_conversations')
      .upsert(
        {
          id: convId,
          clinic_id: clinicId,
          instance_name: instanceName,
          remote_jid: remoteJid,
          ...updates,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();
    if (upsertErr) return res.status(500).json({ error: upsertErr.message });
    return res.status(200).json({ conversation: created });
  }
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ conversation: data });
});

// Mantém também a forma antiga via query string (compatibilidade)
whatsappRouter.patch('/conversations', async (req, res) => {
  const { clinicId } = req.auth!;
  const convId = req.query.convId as string;
  if (!convId) return res.status(400).json({ error: '"convId" é obrigatório.' });
  const updates: Record<string, unknown> = {};
  if (req.body?.agentEnabled !== undefined) updates['agent_enabled'] = req.body.agentEnabled;
  if (req.body?.unread !== undefined) updates['unread'] = req.body.unread;
  if (req.body?.contactName !== undefined) updates['contact_name'] = req.body.contactName;
  const { data, error } = await getAdminClient()
    .from('whatsapp_conversations')
    .update(updates)
    .eq('id', convId)
    .eq('clinic_id', clinicId!)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ conversation: data });
});

// ── Messages ─────────────────────────────────────────────────────────────────
whatsappRouter.get('/messages', async (req, res) => {
  const { clinicId } = req.auth!;
  const { instanceName, remoteJid, limit: limitParam } = req.query as Record<string, string>;
  if (!instanceName || !remoteJid) {
    return res
      .status(400)
      .json({ error: '"instanceName" e "remoteJid" são obrigatórios.' });
  }
  const limit = Math.min(parseInt(limitParam ?? '50', 10), 200);
  const { data, error } = await getAdminClient()
    .from('whatsapp_messages')
    .select(
      'id, instance_name, remote_jid, from_me, message_type, content, message_timestamp, source, created_at'
    )
    .eq('clinic_id', clinicId!)
    .eq('instance_name', instanceName)
    .eq('remote_jid', remoteJid)
    .order('message_timestamp', { ascending: true })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ messages: data });
});
