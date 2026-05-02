import type { EvolutionEnv } from './evolution.js';

export async function sendPresence(
  env: EvolutionEnv,
  instanceName: string,
  jid: string,
  presence: 'composing' | 'paused' | 'available' = 'composing',
  delayMs?: number
): Promise<void> {
  try {
    await fetch(`${env.url}/chat/sendPresence/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.apiKey },
      body: JSON.stringify({
        number: jid,
        delay: delayMs ?? 1200,
        presence,
      }),
    });
  } catch (err) {
    console.warn('[whatsapp] sendPresence failed', err);
  }
}

export async function sendText(
  env: EvolutionEnv,
  instanceName: string,
  jid: string,
  text: string
): Promise<any> {
  const number = jid.includes('@') ? jid.split('@')[0] : jid;
  const response = await fetch(`${env.url}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.apiKey },
    body: JSON.stringify({ number, text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Evolution sendText ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}
