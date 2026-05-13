/**
 * Vercel Function entry point.
 *
 * Esse é o único arquivo dentro de `api/` que vira função serverless na Vercel.
 * O `vercel.json` faz rewrite de todas as rotas `/api/*` para esse handler, e o
 * app Express compartilhado (em `server/app.ts`) faz o roteamento real.
 *
 * Em dev local, esse arquivo NÃO é usado — `server/index.ts` levanta o mesmo
 * Express na porta 3001 e o Vite faz proxy de `/api → :3001`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { app } from '../server/app.js';

export const config = { maxDuration: 60 };

export default function handler(req: VercelRequest, res: VercelResponse) {
  return (app as any)(req, res);
}
