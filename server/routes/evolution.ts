import { Router, type Request } from 'express';
import { getAdminClient } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import {
  getEvolutionEnv,
  getPublicUrl,
  getWebhookSecret,
} from '../lib/evolution.js';
import { sendPresence, sendText } from '../lib/whatsapp.js';
import {
  AgentConfig,
  DEFAULT_AGENT,
  buildSystemPrompt,
  detectsEscalation,
  generateAgentReply,
  isWithinWorkingHours,
  loadRecentHistory,
  pickReplyDelayMs,
  sleep,
} from '../lib/agent.js';
import {
  DEBOUNCE_MS,
  bufferMessage,
  tryFlushBuffer,
} from '../lib/messageBuffer.js';

export const evolutionRouter = Router();

// ── Config (autenticado) ─────────────────────────────────────────────────────
evolutionRouter.get('/config', requireAuth, (_req, res) => {
  res.status(200).json({
    hasUrl: !!process.env.EVOLUTION_API_URL,
    hasApiKey: !!process.env.EVOLUTION_GLOBAL_API_KEY,
  });
});

// ── Instance management (autenticado) ────────────────────────────────────────
evolutionRouter.post('/instance', requireAuth, async (req, res) => {
  const env = getEvolutionEnv();
  if (!env) {
    return res
      .status(400)
      .json({ error: 'Evolution API credentials missing on server.' });
  }
  const { instanceName } = req.body ?? {};
  if (!instanceName) {
    return res.status(400).json({ error: 'instanceName is required' });
  }
  const webhookSecret = getWebhookSecret();
  const webhookUrl = `${getPublicUrl()}/api/evolution/webhook${
    webhookSecret ? `?secret=${encodeURIComponent(webhookSecret)}` : ''
  }`;

  async function tryConnect() {
    const r = await fetch(`${env!.url}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: { apikey: env!.apiKey },
    });
    return r;
  }

  try {
    const createResp = await fetch(`${env.url}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.apiKey },
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        rejectCall: true,
        msgCall:
          'No momento não posso atender chamadas. Por favor, envie uma mensagem de texto ou áudio.',
        alwaysOnline: true,
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ['MESSAGES_UPSERT'],
        },
      }),
    });

    if (createResp.ok) {
      const data = await createResp.json();
      return res.status(200).json(data);
    }

    // Instância já existe na Evolution (403/409) — vai direto buscar o QR.
    if (createResp.status === 403 || createResp.status === 409) {
      const connectResp = await tryConnect();
      if (connectResp.ok) {
        const data = await connectResp.json();
        return res.status(200).json(data);
      }
      const connectErr = await connectResp.text().catch(() => '');
      console.warn('[evolution] connect after conflict failed', connectResp.status, connectErr);
    }

    // Erro real — propaga com mais contexto do que "Forbidden".
    const errText = await createResp.text().catch(() => '');
    let errBody: any = {};
    try { errBody = JSON.parse(errText); } catch { errBody = { raw: errText }; }
    console.warn('[evolution] create failed', createResp.status, errBody);
    return res.status(createResp.status).json({
      error: errBody?.message || errBody?.error || errBody?.response?.message?.[0] || `Evolution API ${createResp.status}`,
      details: errBody,
    });
  } catch (error: any) {
    console.error('Error creating instance:', error);
    return res.status(502).json({ error: 'Evolution API inacessível.', cause: error?.message });
  }
});

evolutionRouter.get('/instance/:id/connection', requireAuth, async (req, res) => {
  const env = getEvolutionEnv();
  if (!env) {
    return res
      .status(400)
      .json({ error: 'Evolution API credentials missing on server.' });
  }
  try {
    const response = await fetch(`${env.url}/instance/connect/${req.params.id}`, {
      method: 'GET',
      headers: { apikey: env.apiKey },
    });
    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    console.error('Error getting connection:', error);
    return res.status(500).json({ error: 'Failed to connect instance' });
  }
});

evolutionRouter.delete('/instance/:id', requireAuth, async (req, res) => {
  const env = getEvolutionEnv();
  if (!env) {
    return res
      .status(400)
      .json({ error: 'Evolution API credentials missing on server.' });
  }
  try {
    await fetch(`${env.url}/instance/logout/${req.params.id}`, {
      method: 'DELETE',
      headers: { apikey: env.apiKey },
    }).catch((e) => console.error('Logout failed (continuing):', e));
    const response = await fetch(`${env.url}/instance/delete/${req.params.id}`, {
      method: 'DELETE',
      headers: { apikey: env.apiKey },
    });
    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    console.error('Error deleting instance:', error);
    return res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// ── Send text (autenticado) ──────────────────────────────────────────────────
evolutionRouter.post('/message/sendText', requireAuth, async (req, res) => {
  const env = getEvolutionEnv();
  if (!env) {
    return res
      .status(400)
      .json({ error: 'Evolution API credentials missing on server.' });
  }
  const { instanceName, number, text, clinicId, source } = req.body ?? {};
  if (!instanceName || !number || !text) {
    return res
      .status(400)
      .json({ error: 'instanceName, number and text are required' });
  }
  try {
    const data = await sendText(env, instanceName, number, text);
    if (clinicId) {
      try {
        const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const ts = Math.floor(Date.now() / 1000);
        const supabase = getAdminClient();
        await supabase.from('whatsapp_messages').insert({
          instance_name: instanceName,
          clinic_id: clinicId,
          remote_jid: jid,
          from_me: true,
          message_type: 'conversation',
          content: text,
          message_timestamp: ts,
          source: source === 'agent' ? 'agent' : 'user',
        });
        await supabase.from('whatsapp_conversations').upsert(
          {
            id: `${instanceName}__${jid}`,
            clinic_id: clinicId,
            instance_name: instanceName,
            remote_jid: jid,
            last_message_at: ts,
            last_message_preview: String(text).slice(0, 120),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      } catch (e) {
        console.warn('[sendText] could not persist outgoing message', e);
      }
    }
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error sending message:', error);
    return res.status(500).json({ error: error?.message || 'Failed to send message' });
  }
});

// ── Webhook (público, autenticado via secret) ────────────────────────────────
function isWebhookAuthorized(req: Request): boolean {
  const expected = getWebhookSecret();
  if (!expected) {
    const bodyKey = (req.body as any)?.apikey;
    return !!bodyKey && bodyKey === process.env.EVOLUTION_GLOBAL_API_KEY;
  }
  const headerSecret =
    (req.headers['x-webhook-secret'] as string | undefined) ??
    (req.headers['x-evolution-secret'] as string | undefined);
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : undefined;
  return headerSecret === expected || querySecret === expected;
}

function normalizeEvent(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toLowerCase().replace(/[_-]/g, '.');
}

function conversationDocId(instanceName: string, jid: string) {
  return `${instanceName}__${jid}`;
}

interface AgentRunInput {
  clinicId: string;
  instanceName: string;
  jid: string;
  basePrompt: string;
  agent: AgentConfig;
  clinicName?: string;
  timezone: string;
  professionalId?: string | null;
  pushName?: string | null;
  userMessage: string;
  /** Exclude history messages at or after this unix-second timestamp (debounce window start). */
  historyBeforeTs?: number;
}

async function runAgent(input: AgentRunInput) {
  const env = getEvolutionEnv();
  if (!env) {
    console.warn('[agent] missing Evolution env vars');
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[agent] GEMINI_API_KEY missing');
    return;
  }
  const db = getAdminClient();
  try {
    const history = await loadRecentHistory(db, input.instanceName, input.jid, 20, input.historyBeforeTs);
    const systemPrompt = buildSystemPrompt({
      basePrompt: input.basePrompt,
      agent: input.agent,
      clinicName: input.clinicName,
      timezone: input.timezone,
    });
    let reply = '';
    try {
      const result = await generateAgentReply({
        apiKey: process.env.GEMINI_API_KEY!,
        systemPrompt,
        history,
        userMessage: input.userMessage,
        agent: input.agent,
        toolContext: {
          db,
          clinicId: input.clinicId,
          instanceName: input.instanceName,
          professionalId: input.professionalId ?? null,
          remoteJid: input.jid,
          pushName: input.pushName ?? null,
          timezone: input.timezone,
        },
      });
      reply = result.text;
      if (result.transferred) console.log('[agent] conversation transferred to human');
    } catch (err) {
      console.error('[agent] generation failed', err);
      reply = input.agent.fallbackMessage || '';
    }
    if (!reply.trim()) {
      console.warn('[agent] empty reply');
      return;
    }
    const delayMs = pickReplyDelayMs(input.agent, reply);
    if (input.agent.showTyping !== false) {
      await sendPresence(env, input.instanceName, input.jid, 'composing', Math.min(delayMs, 25000));
    }
    await sleep(delayMs);
    await sendText(env, input.instanceName, input.jid, reply);

    const ts = Math.floor(Date.now() / 1000);
    await db.from('whatsapp_messages').insert({
      instance_name: input.instanceName,
      clinic_id: input.clinicId,
      remote_jid: input.jid,
      from_me: true,
      message_type: 'conversation',
      content: reply,
      audio_base64: null,
      message_timestamp: ts,
      source: 'agent',
    });
    await db.from('whatsapp_conversations').upsert(
      {
        id: conversationDocId(input.instanceName, input.jid),
        clinic_id: input.clinicId,
        instance_name: input.instanceName,
        remote_jid: input.jid,
        last_message_at: ts,
        last_message_preview: reply.slice(0, 120),
      },
      { onConflict: 'id' }
    );
    console.log('[agent] reply sent', { jid: input.jid, len: reply.length });
  } catch (err) {
    console.error('[agent] unexpected error', err);
  }
}

evolutionRouter.post('/webhook', async (req, res) => {
  if (!isWebhookAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }
  const payload = req.body ?? {};
  const event = normalizeEvent(payload.event);
  const instanceName: string | undefined = payload.instance;
  if (event !== 'messages.upsert' || !instanceName) {
    return res.status(200).json({ success: true, ignored: true });
  }

  const messageData = payload.data ?? {};
  const jid: string | undefined = messageData?.key?.remoteJid;
  const isFromMe = !!messageData?.key?.fromMe;
  const msgType = messageData?.messageType;
  const content =
    messageData?.message?.conversation ||
    messageData?.message?.extendedTextMessage?.text ||
    messageData?.message?.imageMessage?.caption ||
    '';
  const audioBase64 =
    messageData?.message?.audioMessage && payload?.data?.base64
      ? payload.data.base64
      : null;
  const messageTimestamp = messageData?.messageTimestamp || Math.floor(Date.now() / 1000);

  if (!jid) return res.status(200).json({ success: true, ignored: 'no jid' });

  const db = getAdminClient();
  const { data: instRows } = await db
    .from('whatsapp_instances')
    .select('*')
    .eq('instance_name', instanceName)
    .limit(1);
  const instance: any = instRows?.[0] ?? {};
  const clinicId: string = instance.clinic_id ?? 'unknown';
  const basePrompt: string = instance.prompt ?? '';
  const agent: AgentConfig = { ...DEFAULT_AGENT, ...(instance.agent ?? {}) };

  let clinicName: string | undefined;
  let clinicTimezone = 'America/Sao_Paulo';
  if (clinicId !== 'unknown') {
    const { data: clinic } = await db
      .from('clinics')
      .select('name, timezone')
      .eq('id', clinicId)
      .single();
    if (clinic) {
      clinicName = clinic.name;
      if (clinic.timezone) clinicTimezone = clinic.timezone;
    }
  }

  await db.from('whatsapp_messages').insert({
    instance_name: instanceName,
    clinic_id: clinicId,
    remote_jid: jid,
    from_me: isFromMe,
    message_type: msgType,
    content,
    audio_base64: audioBase64,
    message_timestamp: messageTimestamp,
    source: isFromMe ? 'user' : 'whatsapp',
  });

  const convId = conversationDocId(instanceName, jid);
  const { data: existingConvArr } = await db
    .from('whatsapp_conversations')
    .select('agent_enabled, contact_name')
    .eq('id', convId);
  const existingConv = existingConvArr?.[0] ?? null;

  await db.from('whatsapp_conversations').upsert(
    {
      id: convId,
      clinic_id: clinicId,
      instance_name: instanceName,
      remote_jid: jid,
      last_message_at: messageTimestamp,
      last_message_preview: content || (msgType === 'audio' ? 'Áudio' : '...'),
      contact_name: existingConv?.contact_name || messageData?.pushName || null,
      agent_enabled: existingConv?.agent_enabled ?? agent.enabled ?? true,
    },
    { onConflict: 'id' }
  );

  const convAgentEnabled =
    (existingConv?.agent_enabled as boolean | undefined) ?? agent.enabled ?? true;
  let agentDecision = 'skipped';
  let runAgentTask: Promise<void> | null = null;

  if (isFromMe) agentDecision = 'skipped-outgoing';
  else if (clinicId === 'unknown') agentDecision = 'no-clinic';
  else if (!content || !content.trim()) agentDecision = 'no-text';
  else if (!convAgentEnabled || !agent.enabled) agentDecision = 'paused';
  else if (!isWithinWorkingHours(agent, clinicTimezone)) {
    agentDecision = 'off-hours';
    if (agent.workingHours?.outOfHoursMessage) {
      try {
        const evo = getEvolutionEnv();
        if (evo) {
          await sendText(evo, instanceName, jid, agent.workingHours.outOfHoursMessage);
          await db.from('whatsapp_messages').insert({
            instance_name: instanceName,
            clinic_id: clinicId,
            remote_jid: jid,
            from_me: true,
            message_type: 'conversation',
            content: agent.workingHours.outOfHoursMessage,
            audio_base64: null,
            message_timestamp: Math.floor(Date.now() / 1000),
            source: 'agent',
          });
        }
      } catch (e) {
        console.error('[webhook] off-hours send failed', e);
      }
    }
  } else if (!process.env.GEMINI_API_KEY) agentDecision = 'no-gemini-key';
  else if (detectsEscalation(agent, content)) {
    agentDecision = 'escalated';
    try {
      await db.from('whatsapp_conversations').upsert(
        {
          id: convId,
          clinic_id: clinicId,
          instance_name: instanceName,
          remote_jid: jid,
          agent_enabled: false,
          transferred_to_human_at: new Date().toISOString(),
          transfer_reason: 'keyword',
        },
        { onConflict: 'id' }
      );
      const evo = getEvolutionEnv();
      const note = agent.escalation?.notifyMessage?.trim();
      if (evo && note) {
        await sendText(evo, instanceName, jid, note);
        await db.from('whatsapp_messages').insert({
          instance_name: instanceName,
          clinic_id: clinicId,
          remote_jid: jid,
          from_me: true,
          message_type: 'conversation',
          content: note,
          audio_base64: null,
          message_timestamp: Math.floor(Date.now() / 1000),
          source: 'agent',
        });
      }
    } catch (e) {
      console.error('[webhook] escalation handling failed', e);
    }
  } else {
    agentDecision = 'running';

    const baseInput = {
      clinicId,
      instanceName,
      jid,
      basePrompt,
      agent,
      clinicName,
      timezone: clinicTimezone,
      professionalId: instance.professional_id ?? null,
      pushName: messageData?.pushName ?? null,
    };

    const handle = await bufferMessage(instanceName, jid, content);

    if (handle) {
      // Redis available: debounce — wait for the patient to finish typing,
      // then flush all buffered messages and run the agent once.
      const { nonce, bufferStartTs } = handle;
      runAgentTask = (async () => {
        await sleep(DEBOUNCE_MS);
        const flush = await tryFlushBuffer(instanceName, jid, nonce);
        if (!flush) return; // another message arrived; that task will handle it
        await runAgent({
          ...baseInput,
          userMessage: flush.combined,
          historyBeforeTs: flush.historyBeforeTs,
        });
      })();
    } else {
      // No Redis configured: run immediately (original behaviour).
      runAgentTask = runAgent({ ...baseInput, userMessage: content });
    }
  }

  // Em produção (Vercel), `waitUntil` mantém o agent rodando após o 200; em dev
  // (Express standalone) o processo continua vivo então só "fire-and-forget" basta.
  if (runAgentTask) {
    try {
      const mod = await import('@vercel/functions').catch(() => null);
      if (mod && typeof mod.waitUntil === 'function') mod.waitUntil(runAgentTask);
      else runAgentTask.catch((e) => console.error('[agent] background task failed', e));
    } catch (e) {
      runAgentTask.catch((err) => console.error('[agent] background task failed', err));
    }
  }

  console.log('[webhook] processed', { event, instanceName, jid, fromMe: isFromMe, agentDecision });
  return res.status(200).json({ success: true, agent: agentDecision });
});
