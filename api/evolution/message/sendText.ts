import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEvolutionEnv } from '../../_lib/evolution.js';
import { sendText as evoSendText } from '../../_lib/whatsapp.js';
import { getDb } from '../../_lib/firebase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const env = getEvolutionEnv(res);
  if (!env) return;

  try {
    const { instanceName, number, text, clinicId, source } = req.body ?? {};
    if (!instanceName || !number || !text) {
      return res
        .status(400)
        .json({ error: 'instanceName, number and text are required' });
    }

    const data = await evoSendText(env, instanceName, number, text);

    // Persist the outgoing message immediately so the UI doesn't have to
    // wait for the Evolution echo through the webhook.
    if (clinicId) {
      try {
        const db = getDb();
        const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const ts = Math.floor(Date.now() / 1000);
        await db.collection('whatsapp_messages').add({
          instanceName,
          clinicId,
          remoteJid: jid,
          fromMe: true,
          messageType: 'conversation',
          content: text,
          audioBase64: null,
          messageTimestamp: ts,
          createdAt: new Date().toISOString(),
          source: source === 'agent' ? 'agent' : 'user',
        });
        await db
          .collection('whatsapp_conversations')
          .doc(`${instanceName}__${jid}`)
          .set(
            {
              clinicId,
              instanceName,
              remoteJid: jid,
              lastMessageAt: ts,
              lastMessagePreview: text.slice(0, 120),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
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
}
