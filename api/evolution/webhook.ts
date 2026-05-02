import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
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

// Allow long-running AI work (Hobby max 60s, Pro 300s).
export const config = { maxDuration: 60 };

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

interface AgentRunInput {
  clinicId: string;
  instanceName: string;
  jid: string;
  basePrompt: string;
  agent: AgentConfig;
  clinicName?: string;
  professionalId?: string | null;
  pushName?: string | null;
  userMessage: string;
}

async function runAgent(input: AgentRunInput) {
  const env = {
    url: process.env.EVOLUTION_API_URL!,
    apiKey: process.env.EVOLUTION_GLOBAL_API_KEY!,
  };
  if (!env.url || !env.apiKey) {
    console.warn('[agent] missing Evolution env vars — skipping');
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[agent] GEMINI_API_KEY missing — skipping');
    return;
  }

  const db = getDb();

  try {
    const history = await loadRecentHistory(db, input.instanceName, input.jid, 20);
    const systemPrompt = buildSystemPrompt({
      basePrompt: input.basePrompt,
      agent: input.agent,
      clinicName: input.clinicName,
    });

    let reply = '';
    try {
      reply = await generateAgentReply({
        apiKey: process.env.GEMINI_API_KEY,
        systemPrompt,
        history,
        userMessage: input.userMessage,
        model: input.agent.model,
        toolContext: {
          db,
          clinicId: input.clinicId,
          professionalId: input.professionalId ?? null,
          remoteJid: input.jid,
          pushName: input.pushName ?? null,
        },
      });
    } catch (err) {
      console.error('[agent] generation failed', err);
      reply = input.agent.fallbackMessage || '';
    }

    if (!reply.trim()) {
      console.warn('[agent] empty reply — nothing to send');
      return;
    }

    const delayMs = pickReplyDelayMs(input.agent, reply);
    if (input.agent.showTyping !== false) {
      await sendPresence(env, input.instanceName, input.jid, 'composing', Math.min(delayMs, 25000));
    }
    await sleep(delayMs);

    await sendText(env, input.instanceName, input.jid, reply);

    const ts = Math.floor(Date.now() / 1000);
    await db.collection('whatsapp_messages').add({
      instanceName: input.instanceName,
      clinicId: input.clinicId,
      remoteJid: input.jid,
      fromMe: true,
      messageType: 'conversation',
      content: reply,
      audioBase64: null,
      messageTimestamp: ts,
      createdAt: new Date().toISOString(),
      source: 'agent',
    });

    await db
      .collection('whatsapp_conversations')
      .doc(conversationDocId(input.instanceName, input.jid))
      .set(
        {
          lastMessageAt: ts,
          lastMessagePreview: reply.slice(0, 120),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    console.log('[agent] reply sent', { jid: input.jid, len: reply.length });
  } catch (err) {
    console.error('[agent] unexpected error', err);
  }
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

  // Resolve instance + clinic
  const instSnap = await db
    .collection('whatsapp_instances')
    .where('instanceName', '==', instanceName)
    .limit(1)
    .get();
  const instance = instSnap.empty ? {} : (instSnap.docs[0].data() as any);
  const clinicId: string = instance.clinicId ?? 'unknown';
  const basePrompt: string = instance.prompt ?? '';
  const agent: AgentConfig = { ...DEFAULT_AGENT, ...(instance.agent ?? {}) };

  let clinicName: string | undefined;
  if (clinicId !== 'unknown') {
    const cSnap = await db.collection('clinics').doc(clinicId).get();
    clinicName = cSnap.exists ? (cSnap.data() as any)?.name : undefined;
  }

  // Persist incoming message
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

  // Upsert conversation summary
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
      contactName: existingConv?.contactName || messageData?.pushName || null,
      agentEnabled: existingConv?.agentEnabled ?? agent.enabled ?? true,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Decide whether to invoke the agent
  const convAgentEnabled =
    (existingConv?.agentEnabled as boolean | undefined) ?? agent.enabled ?? true;

  let agentDecision = 'skipped';
  if (isFromMe) {
    agentDecision = 'skipped-outgoing';
  } else if (clinicId === 'unknown') {
    agentDecision = 'no-clinic';
  } else if (!content || !content.trim()) {
    agentDecision = 'no-text';
  } else if (!convAgentEnabled || !agent.enabled) {
    agentDecision = 'paused';
  } else if (!isWithinWorkingHours(agent)) {
    agentDecision = 'off-hours';
    if (agent.workingHours?.outOfHoursMessage) {
      try {
        const env = getEvolutionEnv(res);
        if (env) {
          await sendText(env, instanceName, jid, agent.workingHours.outOfHoursMessage);
          await db.collection('whatsapp_messages').add({
            instanceName,
            clinicId,
            remoteJid: jid,
            fromMe: true,
            messageType: 'conversation',
            content: agent.workingHours.outOfHoursMessage,
            audioBase64: null,
            messageTimestamp: Math.floor(Date.now() / 1000),
            createdAt: new Date().toISOString(),
            source: 'agent',
          });
        }
      } catch (e) {
        console.error('[webhook] off-hours send failed', e);
      }
    }
  } else if (!process.env.GEMINI_API_KEY) {
    agentDecision = 'no-gemini-key';
  } else {
    agentDecision = 'running';
    // KEY FIX: waitUntil keeps the process alive after we respond.
    waitUntil(
      runAgent({
        clinicId,
        instanceName,
        jid,
        basePrompt,
        agent,
        clinicName,
        professionalId: instance.professionalId ?? null,
        pushName: messageData?.pushName ?? null,
        userMessage: content,
      })
    );
  }

  console.log('[webhook] processed', {
    event,
    instanceName,
    jid,
    fromMe: isFromMe,
    agentDecision,
  });

  return res.status(200).json({ success: true, agent: agentDecision });
}
