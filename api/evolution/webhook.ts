import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_lib/firebase.js';
import { getWebhookSecret } from '../_lib/evolution.js';

function isAuthorized(req: VercelRequest): boolean {
  const expected = getWebhookSecret();
  if (!expected) {
    // No secret configured: legacy behavior — validate body apikey against the
    // global Evolution key. Strongly recommended to set EVOLUTION_WEBHOOK_SECRET.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  try {
    const payload = req.body;
    const db = getDb();

    if (payload?.event === 'messages.upsert') {
      const messageData = payload.data;
      const jid = messageData?.key?.remoteJid;
      const isFromMe = !!messageData?.key?.fromMe;
      const msgType = messageData?.messageType;
      const content =
        messageData?.message?.conversation ||
        messageData?.message?.extendedTextMessage?.text ||
        '';

      const audioBase64 =
        messageData?.message?.audioMessage && payload?.data?.base64
          ? payload.data.base64
          : null;

      const instanceQuery = await db
        .collection('whatsapp_instances')
        .where('instanceName', '==', payload.instance)
        .limit(1)
        .get();

      const clinicId = instanceQuery.empty
        ? 'unknown'
        : instanceQuery.docs[0].data().clinicId;

      await db.collection('whatsapp_messages').add({
        instanceName: payload.instance,
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
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal webhook error' });
  }
}
