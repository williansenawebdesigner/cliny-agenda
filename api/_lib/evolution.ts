import type { VercelResponse } from '@vercel/node';

export interface EvolutionEnv {
  url: string;
  apiKey: string;
}

export function getEvolutionEnv(res: VercelResponse): EvolutionEnv | null {
  const url = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;

  if (!url || !apiKey) {
    res.status(400).json({ error: 'Evolution API credentials missing on server.' });
    return null;
  }

  return { url, apiKey };
}

export function getPublicUrl(): string {
  const raw =
    process.env.PUBLIC_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return raw.replace(/\/+$/, '');
}

export function getWebhookSecret(): string | null {
  return process.env.EVOLUTION_WEBHOOK_SECRET || null;
}
