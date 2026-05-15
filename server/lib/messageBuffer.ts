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
  /** Exclude history messages at/after this unix-second ts (they're in `combined`) */
  historyBeforeTs: number;
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
  myTs: number,
  myText: string,
  debounceMs: number,
): Promise<FlushResult | null> {
  await sleep(debounceMs);

  try {
    // Is there a newer patient message after ours?
    const { data: newer } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('instance_name', instanceName)
      .eq('remote_jid', jid)
      .eq('from_me', false)
      .gt('message_timestamp', myTs)
      .limit(1);

    if (newer && newer.length > 0) return null; // another message will handle it

    // We're the last message — collect everything since the last agent reply.
    const { data: lastAgent } = await db
      .from('whatsapp_messages')
      .select('message_timestamp')
      .eq('instance_name', instanceName)
      .eq('remote_jid', jid)
      .eq('from_me', true)
      .eq('source', 'agent')
      .order('message_timestamp', { ascending: false })
      .limit(1);

    const lastAgentTs = lastAgent?.[0]?.message_timestamp ?? 0;
    // Look back at most 10 minutes to avoid pulling in very old messages
    const batchStart = Math.max(lastAgentTs, myTs - 600);

    const { data: batch } = await db
      .from('whatsapp_messages')
      .select('content')
      .eq('instance_name', instanceName)
      .eq('remote_jid', jid)
      .eq('from_me', false)
      .gt('message_timestamp', batchStart)
      .order('message_timestamp', { ascending: true });

    const messages = (batch ?? [])
      .map((m) => (m.content as string) ?? '')
      .filter(Boolean);

    if (messages.length === 0) return null;

    return {
      combined: messages.join('\n'),
      historyBeforeTs: batchStart + 1,
    };
  } catch (err) {
    console.error('[messageBuffer] DB error, falling back to single message', err);
    // Fallback: just process this one message
    return { combined: myText, historyBeforeTs: myTs };
  }
}
