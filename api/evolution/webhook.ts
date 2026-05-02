import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/firebase.js';
import { getEvolutionEnv, getWebhookSecret } from '../_lib/evolution.js';
import { sendPresence, sendText } from '../_lib/whatsapp.js';
import {
  AgentConfig,
  DEFAULT_AGENT,
  buildSystemPrompt,
  generateAgentReply,
  isWithinWorkingHours,
  loadRecentHistory,
  pickReplyDelayMs,
  sleep,
} from '../_lib/agent.js';

function isAuthorized(req: VercelRequest): boolean {
  const expected = getWebhookSecret();
  if (!expected) {
    const bodyKey = (req.body as any)?.apikey;
    return !!bodyKey && bodyKey === process.env.EVOLUTION_GLOBAL_API_KEY;
  }
  const headerSecret =
    (req.headers['x-webhook-secret'] as string | undefined) ??
    (req.headers['x-evolution-secret'] as string | undefined);
  const querySecret =
    typeof req.query.secret === 'string' ? req.query.secret : undefined;
  return headerSecret === expected || querySecret === expected;
}

function normalizeEvent(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toLowerCase().replace(/[_-]/g, '.');
}

function conversationDocId(instanceName: string, jid: string) {
  return `${instanceName}__${jid}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
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
  const messageTimestamp =
    messageData?.messageTimestamp || Math.floor(Date.now() / 1000);

  if (!jid) {
    return res.status(200).json({ success: true, ignored: 'no jid' });
  }

  const db = getDb();

  // 1) Resolve clinic + instance config
  const instSnap = await db
    .collection('whatsapp_instances')
    .where('instanceName', '==', instanceName)
    .limit(1)
    .get();
  const instanceDoc = instSnap.empty ? null : instSnap.docs[0];
  const instance = instanceDoc?.data() ?? {};
  const clinicId: string = instance.clinicId ?? 'unknown';
  const basePrompt: string = instance.prompt ?? '';
  const agent: AgentConfig = { ...DEFAULT_AGENT, ...(instance.agent ?? {}) };

  let clinicName: string | undefined;
  if (clinicId !== 'unknown') {
    const cSnap = await db.collection('clinics').doc(clinicId).get();
    clinicName = cSnap.exists ? (cSnap.data() as any)?.name : undefined;
  }

  // 2) Persist incoming message
  await db.collection('whatsapp_messages').add({
    instanceName,
    clinicId,
    remoteJid: jid,
    fromMe: isFromMe,
    messageType: msgType,
    content,
    audioBase64,
    messageTimestamp,
    createdAt: new Date().toISOString(),
    source: isFromMe ? 'user' : 'whatsapp',
  });

  // 3) Upsert conversation summary
  const convRef = db
    .collection('whatsapp_conversations')
    .doc(conversationDocId(instanceName, jid));
  const convSnap = await convRef.get();
  const existingConv = convSnap.exists ? convSnap.data() : null;

  await convRef.set(
    {
      clinicId,
      instanceName,
      remoteJid: jid,
      lastMessageAt: messageTimestamp,
      lastMessagePreview: content || (msgType === 'audio' ? 'Áudio' : '...'),
      contactName:
        existingConv?.contactName ||
        messageData?.pushName ||
        null,
      // initialize agentEnabled defaulting to instance-level setting if not set
      agentEnabled:
        existingConv?.agentEnabled ?? agent.enabled ?? true,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // 4) Stop here if outbound, no content, or no clinic
  if (isFromMe) {
    return res.status(200).json({ success: true, stored: true, agent: 'skipped-outgoing' });
  }
  if (clinicId === 'unknown') {
    return res.status(200).json({ success: true, stored: true, agent: 'no-clinic' });
  }
  if (!content || !content.trim()) {
    return res.status(200).json({ success: true, stored: true, agent: 'no-text' });
  }

  // 5) Check agent gates
  const convAgentEnabled =
    (existingConv?.agentEnabled as boolean | undefined) ??
    agent.enabled ??
    true;
  if (!convAgentEnabled || !agent.enabled) {
    return res.status(200).json({ success: true, stored: true, agent: 'paused' });
  }

  if (!isWithinWorkingHours(agent)) {
    const env = getEvolutionEnv(res);
    if (!env) return;
    const msg = agent.workingHours?.outOfHoursMessage;
    if (msg) {
      try {
        await sendText(env, instanceName, jid, msg);
        await db.collection('whatsapp_messages').add({
          instanceName,
          clinicId,
          remoteJid: jid,
          fromMe: true,
          messageType: 'conversation',
          content: msg,
          audioBase64: null,
          messageTimestamp: Math.floor(Date.now() / 1000),
          createdAt: new Date().toISOString(),
          source: 'agent',
        });
      } catch (e) {
        console.error('[webhook] off-hours send failed', e);
      }
    }
    return res.status(200).json({ success: true, agent: 'off-hours' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn('[webhook] GEMINI_API_KEY missing — skipping AI reply');
    return res.status(200).json({ success: true, agent: 'no-key' });
  }

  // 6) Respond with the agent (fire-and-forget after returning 200)
  res.status(200).json({ success: true, agent: 'running' });

  try {
    const env = getEvolutionEnv({
      status: () => ({ json: () => null }),
      json: () => null,
    } as any);
    if (!env) return;

    const history = await loadRecentHistory(db, instanceName, jid, 20);

    const systemPrompt = buildSystemPrompt({
      basePrompt,
      agent,
      clinicName,
    });

    let reply = '';
    try {
      reply = await generateAgentReply({
        apiKey: process.env.GEMINI_API_KEY!,
        systemPrompt,
        history,
        userMessage: content,
        model: agent.model,
        toolContext: {
          db,
          clinicId,
          professionalId: instance.professionalId ?? null,
          remoteJid: jid,
          pushName: messageData?.pushName ?? null,
        },
      });
    } catch (err) {
      console.error('[agent] generation failed', err);
      reply = agent.fallbackMessage || '';
    }

    if (!reply.trim()) {
      console.warn('[agent] empty reply');
      return;
    }

    const delayMs = pickReplyDelayMs(agent, reply);
    if (agent.showTyping !== false) {
      await sendPresence(env, instanceName, jid, 'composing', Math.min(delayMs, 25000));
    }
    await sleep(delayMs);

    await sendText(env, instanceName, jid, reply);

    await db.collection('whatsapp_messages').add({
      instanceName,
      clinicId,
      remoteJid: jid,
      fromMe: true,
      messageType: 'conversation',
      content: reply,
      audioBase64: null,
      messageTimestamp: Math.floor(Date.now() / 1000),
      createdAt: new Date().toISOString(),
      source: 'agent',
    });

    await convRef.set(
      {
        lastMessageAt: Math.floor(Date.now() / 1000),
        lastMessagePreview: reply.slice(0, 120),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('[webhook] post-response agent error', err);
  }
}
