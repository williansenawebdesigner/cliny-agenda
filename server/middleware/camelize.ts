import type { Request, Response, NextFunction } from 'express';
import { toCamel } from '../lib/case.js';

/**
 * Wrap res.json so every response body is converted from snake_case to camelCase.
 * Aplicado globalmente — funciona tanto para payloads de sucesso quanto de erro
 * (em ambos os casos as chaves já vêm sem underline, então é no-op).
 */
export function camelizeResponses(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = (body?: unknown) => originalJson(toCamel(body));
  next();
}
