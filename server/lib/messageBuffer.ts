/**
 * In-memory debounce buffer for WhatsApp messages.
 *
 * Patients often send several short messages in quick succession.
 * This module collects them for DEBOUNCE_MS of silence, then calls
 * onFlush once with all messages joined — so the agent gets a single
 * coherent turn instead of replying to every fragment.
 *
 * Works in Express (single process) and on Vercel Fluid Compute (which
 * reuses function instances across concurrent requests, so rapid messages
 * from the same conversation almost always land on the same instance).
 * Worst case on Vercel: two fragments hit different instances and the agent
 * replies twice — graceful degradation, not a failure.
 */

export const DEBOUNCE_MS = 3000;

interface PendingEntry {
  messages: string[];
  /** Unix seconds of the first message in this window — used to slice history */
  bufferStartTs: number;
  timer: ReturnType<typeof setTimeout>;
  onFlush: (combined: string, historyBeforeTs: number) => Promise<void>;
  resolvers: Array<() => void>;
}

const pending = new Map<string, PendingEntry>();

/**
 * Enqueue a message for debounced processing.
 *
 * Returns a Promise that resolves when the agent finishes running (or
 * immediately if this message was preempted by a later one). Pass the
 * returned promise to Vercel's `waitUntil` to keep the function alive.
 */
export function debounceAgentRun(
  instanceName: string,
  jid: string,
  text: string,
  onFlush: (combined: string, historyBeforeTs: number) => Promise<void>,
): Promise<void> {
  const key = `${instanceName}__${jid}`;

  return new Promise<void>((resolve) => {
    const nowSec = Math.floor(Date.now() / 1000);
    let entry = pending.get(key);

    if (entry) {
      // Another message is already buffered — extend the window.
      clearTimeout(entry.timer);
      entry.messages.push(text);
      entry.onFlush = onFlush; // use latest request context (agent config, etc.)
      entry.resolvers.push(resolve);
    } else {
      entry = {
        messages: [text],
        bufferStartTs: nowSec,
        timer: null as unknown as ReturnType<typeof setTimeout>,
        onFlush,
        resolvers: [resolve],
      };
      pending.set(key, entry);
    }

    // (Re)set the debounce timer — fires after DEBOUNCE_MS of silence.
    entry.timer = setTimeout(async () => {
      pending.delete(key);
      const combined = entry!.messages.join('\n');
      try {
        await entry!.onFlush(combined, entry!.bufferStartTs);
      } catch (e) {
        console.error('[debounce] agent run failed', e);
      } finally {
        entry!.resolvers.forEach((r) => r());
      }
    }, DEBOUNCE_MS);
  });
}
