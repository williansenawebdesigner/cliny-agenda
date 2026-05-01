import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEvolutionEnv } from '../../_lib/evolution.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const env = getEvolutionEnv(res);
  if (!env) return;

  try {
    const { instanceName, number, text } = req.body ?? {};
    if (!instanceName || !number || !text) {
      return res
        .status(400)
        .json({ error: 'instanceName, number and text are required' });
    }

    const response = await fetch(`${env.url}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.apiKey },
      body: JSON.stringify({ number, text }),
    });

    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}
