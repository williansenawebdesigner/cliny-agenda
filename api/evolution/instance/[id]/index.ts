import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEvolutionEnv } from '../../../_lib/evolution.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const env = getEvolutionEnv(res);
  if (!env) return;

  try {
    const { id } = req.query;
    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid instance id' });
    }

    await fetch(`${env.url}/instance/logout/${id}`, {
      method: 'DELETE',
      headers: { apikey: env.apiKey },
    }).catch((e) => console.error('Logout failed (continuing):', e));

    const response = await fetch(`${env.url}/instance/delete/${id}`, {
      method: 'DELETE',
      headers: { apikey: env.apiKey },
    });

    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    console.error('Error deleting instance:', error);
    return res.status(500).json({ error: 'Failed to delete instance' });
  }
}
