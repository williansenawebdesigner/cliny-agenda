/**
 * Supabase-backed message debounce for WhatsApp webhook.
 *
 * Strategy: each message sleeps for `debounceMs`, then checks Supabase to see
 * if a newer patient message arrived after it. If yes → bail, the last message
 * handles everything. If no → collect all unresponded messages (since the last
 * agent reply) and run the agent once.
 *
 * Works across Vercel instances because coordination uses shared DB state,
 * not in-process memory.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export interface FlushResult {
  combined: string;
  /** Exclude history messages created at/after this timestamp (they're in `combined`). */
  historyBeforeCreatedAt?: string;
  /** Fallback for older callers/history queries. */
  historyBeforeTs?: number;
}

/**
 * Sleep for `debounceMs`, then decide whether this message is the last one in
 * its burst. Returns a FlushResult to run the agent with, or null to bail out.
 *
 * @param myTs  - epoch seconds of THIS message (from WhatsApp payload)
 * @param myText - text of THIS message (used as fallback if DB queries fail)
 */
export async function waitAndFlush(
  db: SupabaseClient,
  instanceName: string,
  jid: string,
  myId: string | number | null | undefined,
  myCreatedAt: string | null | undefined,
  myTs: number,
  myText: string,
  debounceMs: number,
): Promise<FlushResult | null> {
  await sleep(debounceMs);

  try {
    // Is this still the latest patient message after the debounce window?
    // WhatsApp timestamps are second-granularity, so use the DB cursor created
    // by the insert. This avoids duplicate replies when several messages arrive
    // inside the same second.
    const { data: latest } = await db
      .from('whatsapp_messages')
      .select('id, created_at')
      .eq('instance_name', instanceName)
      .eq('remote_jid', jid)
      .eq('from_me', false)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestMessage = latest?.[0] as
      | { id?: string | number; created_at?: string }
      | undefined;
    if (myId && latestMessage?.id && String(latestMessage.id) !== String(myId)) {
      return null; // another message will handle this burst
    }

    // We're the last message — collect everything since the last agent reply.
    const { data: lastAgent } = await db
      .from('whatsapp_messages')
      .select('message_timestamp, created_at')
      .eq('instance_name', instanceName)
      .eq('remote_jid', jid)
      .eq('from_me', true)
      .eq('source', 'agent')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastAgentRow = lastAgent?.[0] as
      | { message_timestamp?: number; created_at?: string }
      | undefined;
    const lastAgentTs = lastAgentRow?.message_timestamp ?? 0;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const batchStartCreatedAt =
      lastAgentRow?.created_at && lastAgentRow.created_at > tenMinutesAgo
        ? lastAgentRow.created_at
        : tenMinutesAgo;
    const batchStartTs = Math.max(lastAgentTs, myTs - 600);

    const { data: batch } = await db
      .from('whatsapp_messages')
      .select('content')
      .eq('instance_name', instanceName)
      .eq('remote_jid', jid)
      .eq('from_me', false)
      .gt('created_at', batchStartCreatedAt)
      .order('created_at', { ascending: true });

    const messages = (batch ?? [])
      .map((m) => (m.content as string) ?? '')
      .filter(Boolean);

    if (messages.length === 0) return null;

    return {
      combined: messages.join('\n'),
      historyBeforeCreatedAt: batchStartCreatedAt,
      historyBeforeTs: batchStartTs + 1,
    };
  } catch (err) {
    console.error('[messageBuffer] DB error, falling back to single message', err);
    // Fallback: just process this one message
    return { combined: myText, historyBeforeCreatedAt: myCreatedAt ?? undefined, historyBeforeTs: myTs };
  }
}
