import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    hasUrl: !!process.env.EVOLUTION_API_URL,
    hasApiKey: !!process.env.EVOLUTION_GLOBAL_API_KEY,
  });
}
