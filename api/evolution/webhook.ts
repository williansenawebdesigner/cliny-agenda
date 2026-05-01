import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/firebase.js';
import { getWebhookSecret } from '../_lib/evolution.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    console.warn('[webhook] Unauthorized call', {
      headers: Object.keys(req.headers),
      hasQuerySecret: !!req.query.secret,
    });
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  const payload = req.body ?? {};
  const event = normalizeEvent(payload.event);
  const instanceName = payload.instance;

  console.log('[webhook] received', {
    event,
    rawEvent: payload.event,
    instance: instanceName,
    keys: Object.keys(payload),
  });

  try {
    if (event !== 'messages.upsert') {
      console.log('[webhook] ignoring non-message event', { event });
      return res.status(200).json({ success: true, ignored: true });
    }

    const messageData = payload.data ?? {};
    const jid = messageData?.key?.remoteJid;
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

    const db = getDb();

    let clinicId = 'unknown';
    if (instanceName) {
      const instSnap = await db
        .collection('whatsapp_instances')
        .where('instanceName', '==', instanceName)
        .limit(1)
        .get();
      if (!instSnap.empty) {
        clinicId = instSnap.docs[0].data().clinicId;
      } else {
        console.warn('[webhook] no whatsapp_instance found', { instanceName });
      }
    }

    const docRef = await db.collection('whatsapp_messages').add({
      instanceName,
      clinicId,
      remoteJid: jid,
      fromMe: isFromMe,
      messageType: msgType,
      content,
      audioBase64,
      messageTimestamp:
        messageData?.messageTimestamp || Math.floor(Date.now() / 1000),
      createdAt: new Date().toISOString(),
    });

    console.log('[webhook] message stored', {
      id: docRef.id,
      clinicId,
      instanceName,
      jid,
      fromMe: isFromMe,
      msgType,
      contentLen: content.length,
    });

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('[webhook] error', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    return res.status(500).json({ error: 'Internal webhook error' });
  }
}
