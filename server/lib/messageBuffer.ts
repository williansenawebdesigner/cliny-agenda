/**
 * Redis-backed message buffer for WhatsApp webhook debouncing.
 *
 * Patients often send several short messages in quick succession.
 * This module collects them for DEBOUNCE_MS of silence, then flushes
 * them as a single combined string for the agent to process.
 *
 * Pattern: each incoming message sets a lock nonce. After the debounce
 * window, only the holder of the CURRENT nonce runs the agent. All
 * earlier tasks see a stale nonce and bail out silently.
 *
 * Falls back to null (direct run, no buffering) when REDIS_URL is absent.
 */

import Redis from 'ioredis';

export const DEBOUNCE_MS = 3000;
const BUF_TTL_S = 60;

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    _redis.on('error', (err) => console.error('[redis]', err.message));
  }
  return _redis;
}

const bufKey  = (inst: string, jid: string) => `cliny:buf:${inst}:${jid}`;
const lockKey = (inst: string, jid: string) => `cliny:lock:${inst}:${jid}`;
const tsKey   = (inst: string, jid: string) => `cliny:bts:${inst}:${jid}`;

export interface MessageBufferHandle {
  nonce: string;
  /** Unix seconds of the first message in this window — used to slice history */
  bufferStartTs: number;
}

export interface BufferFlush {
  combined: string;
  historyBeforeTs: number;
}

/**
 * Push a message into the debounce buffer.
 * Returns null when Redis is unavailable (caller should run agent immediately).
 */
export async function bufferMessage(
  instanceName: string,
  jid: string,
  text: string,
): Promise<MessageBufferHandle | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const nonce = Date.now().toString();
    const nowSec = Math.floor(Date.now() / 1000);

    // NX preserves the original window-start timestamp across multiple messages
    await redis.set(tsKey(instanceName, jid), nowSec.toString(), 'EX', BUF_TTL_S, 'NX');
    const stored = await redis.get(tsKey(instanceName, jid));
    const bufferStartTs = stored ? parseInt(stored, 10) : nowSec;

    const pipeline = redis.pipeline();
    pipeline.rpush(bufKey(instanceName, jid), text);
    pipeline.expire(bufKey(instanceName, jid), BUF_TTL_S);
    pipeline.set(lockKey(instanceName, jid), nonce, 'EX', BUF_TTL_S);
    await pipeline.exec();

    return { nonce, bufferStartTs };
  } catch (err) {
    console.error('[messageBuffer] bufferMessage failed', err);
    return null;
  }
}

/**
 * Try to flush the buffer after the debounce window.
 * Returns null when another message arrived after us (stale nonce) —
 * the caller should exit without running the agent.
 */
export async function tryFlushBuffer(
  instanceName: string,
  jid: string,
  nonce: string,
): Promise<BufferFlush | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const currentLock = await redis.get(lockKey(instanceName, jid));
    if (currentLock !== nonce) return null;

    const [messages, bufStartStr] = await Promise.all([
      redis.lrange(bufKey(instanceName, jid), 0, -1),
      redis.get(tsKey(instanceName, jid)),
    ]);

    const pipeline = redis.pipeline();
    pipeline.del(bufKey(instanceName, jid));
    pipeline.del(lockKey(instanceName, jid));
    pipeline.del(tsKey(instanceName, jid));
    await pipeline.exec();

    return {
      combined: messages.filter(Boolean).join('\n'),
      historyBeforeTs: bufStartStr ? parseInt(bufStartStr, 10) : 0,
    };
  } catch (err) {
    console.error('[messageBuffer] tryFlushBuffer failed', err);
    return null;
  }
}
