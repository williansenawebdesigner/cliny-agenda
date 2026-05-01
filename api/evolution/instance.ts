import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEvolutionEnv, getPublicUrl, getWebhookSecret } from '../_lib/evolution.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const env = getEvolutionEnv(res);
  if (!env) return;

  try {
    const { instanceName } = req.body ?? {};
    if (!instanceName) {
      return res.status(400).json({ error: 'instanceName is required' });
    }

    const webhookSecret = getWebhookSecret();
    const webhookUrl = `${getPublicUrl()}/api/evolution/webhook${
      webhookSecret ? `?secret=${encodeURIComponent(webhookSecret)}` : ''
    }`;

    const response = await fetch(`${env.url}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.apiKey,
      },
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

    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    console.error('Error creating instance:', error);
    return res.status(500).json({ error: 'Failed to create instance' });
  }
}
