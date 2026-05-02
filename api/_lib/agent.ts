import { GoogleGenAI, type Content, type Part } from '@google/genai';
import type { Firestore } from 'firebase-admin/firestore';
import { executeTool, toolDeclarations, type ToolContext } from './agentTools.js';
import { DEFAULT_TIMEZONE, humanInTz, hmInTz, ymdInTz, dayOfWeekInTz } from './tz.js';

export interface AgentConfig {
  enabled: boolean;
  model?: string;
  persona?: string;
  knowledgeBase?: string;
  responseDelayMin?: number;
  responseDelayMax?: number;
  showTyping?: boolean;
  fallbackMessage?: string;
  workingHours?: {
    enabled: boolean;
    start: string;
    end: string;
    weekdays: number[];
    outOfHoursMessage?: string;
  };
}

export const DEFAULT_AGENT: AgentConfig = {
  enabled: true,
  model: 'gemini-2.5-flash',
  persona: 'profissional, cordial, objetivo',
  knowledgeBase: '',
  responseDelayMin: 2,
  responseDelayMax: 6,
  showTyping: true,
  fallbackMessage:
    'Desculpe, tive um problema técnico. Em instantes um atendente humano entrará em contato.',
};

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

function todayContext(tz: string): string {
  const now = new Date();
  return `Hoje é ${humanInTz(now, tz)} (data ISO: ${ymdInTz(now, tz)}). Hora atual: ${hmInTz(now, tz)}. Fuso horário da clínica: ${tz}.`;
}

export function buildSystemPrompt(opts: {
  basePrompt: string;
  agent?: AgentConfig;
  clinicName?: string;
  timezone?: string;
}): string {
  const cfg = { ...DEFAULT_AGENT, ...(opts.agent ?? {}) };
  const tz = opts.timezone || DEFAULT_TIMEZONE;
  const parts = [
    `Você é o assistente virtual de ${opts.clinicName ?? 'uma clínica'} no WhatsApp.`,
    `Persona: ${cfg.persona ?? DEFAULT_AGENT.persona}.`,
    'Sempre responda em português do Brasil. Seja breve, claro e objetivo.',
    'Use no máximo 3 parágrafos curtos. Evite listas longas. Não use markdown.',
    todayContext(tz),
    `Sempre que mencionar horários ao paciente, use o horário local da clínica (${tz}) e sempre sugira horarios disponíveis baseando-se no dia que ela deseja ou agenda mais próxima. Os campos "startTimeLocal" das ferramentas já estão nesse fuso — use-os, NÃO converta novamente.`,
    '',
    '## Capacidades',
    'Você TEM acesso a ferramentas para:',
    '- list_services: ver os serviços/preços/profissionais disponíveis',
    '- list_available_slots: ver horários livres em uma data',
    '- create_appointment: agendar uma consulta (após confirmar com o paciente)',
    '- list_patient_appointments: ver agendamentos futuros do paciente atual',
    '- cancel_appointment: cancelar uma consulta existente',
    '',
    '## Fluxo recomendado para agendamento',
    '1. Pergunte (se ainda não souber) o nome do paciente, qual procedimento e a data desejada.',
    '2. Chame list_services para descobrir o serviceId e a duração.',
    '3. Chame list_available_slots para a data desejada.',
    '4. Ofereça 2-3 horários ao paciente.',
    '5. Após confirmação explícita ("pode marcar para X"), chame create_appointment.',
    '6. Ao confirmar o agendamento criado, repita os detalhes (data, hora, profissional, serviço).',
    '',
    'NUNCA invente serviços, preços, horários ou profissionais. Use sempre as ferramentas.',
    'NUNCA chame create_appointment sem antes confirmar tudo com o paciente.',
    '',
    '## Instruções específicas da clínica',
    opts.basePrompt?.trim() || '(sem instruções específicas)',
  ];

  if (cfg.knowledgeBase && cfg.knowledgeBase.trim()) {
    parts.push('', '## Base de conhecimento', cfg.knowledgeBase.trim());
  }

  return parts.join('\n');
}

export function isWithinWorkingHours(
  cfg: AgentConfig,
  tz = DEFAULT_TIMEZONE,
  now = new Date()
): boolean {
  const wh = cfg.workingHours;
  if (!wh?.enabled) return true;
  const day = dayOfWeekInTz(now, tz);
  if (!wh.weekdays.includes(day)) return false;
  const [sh, sm] = wh.start.split(':').map(Number);
  const [eh, em] = wh.end.split(':').map(Number);
  const [hh, mm] = hmInTz(now, tz).split(':').map(Number);
  const minutes = hh * 60 + mm;
  return minutes >= sh * 60 + sm && minutes <= eh * 60 + em;
}

export async function loadRecentHistory(
  db: Firestore,
  instanceName: string,
  remoteJid: string,
  limit = 20
): Promise<ConversationTurn[]> {
  const snap = await db
    .collection('whatsapp_messages')
    .where('instanceName', '==', instanceName)
    .where('remoteJid', '==', remoteJid)
    .orderBy('messageTimestamp', 'desc')
    .limit(limit)
    .get()
    .catch(() => null);
  if (!snap || snap.empty) return [];
  return snap.docs
    .map((d) => d.data())
    .reverse()
    .filter((m: any) => typeof m.content === 'string' && m.content.length > 0)
    .map((m: any): ConversationTurn => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: m.content,
    }));
}

export async function generateAgentReply(opts: {
  apiKey: string;
  systemPrompt: string;
  history: ConversationTurn[];
  userMessage: string;
  model?: string;
  toolContext: ToolContext;
  maxIterations?: number;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const model = opts.model || DEFAULT_AGENT.model!;
  const maxIterations = opts.maxIterations ?? 5;

  const contents: Content[] = [
    ...opts.history.map((t): Content => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    })),
    { role: 'user', parts: [{ text: opts.userMessage }] },
  ];

  let finalText = '';

  for (let i = 0; i < maxIterations; i++) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: opts.systemPrompt,
        temperature: 0.5,
        maxOutputTokens: 1200,
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    const fnCalls = response.functionCalls ?? [];

    if (fnCalls.length === 0) {
      finalText = response.text?.trim() || '';
      break;
    }

    // Append model turn (with tool calls) to history
    const modelParts: Part[] = fnCalls.map((fc) => ({
      functionCall: { name: fc.name!, args: fc.args ?? {} },
    }));
    contents.push({ role: 'model', parts: modelParts });

    // Execute each tool and append the responses
    const responseParts: Part[] = [];
    for (const fc of fnCalls) {
      const result = await executeTool(fc.name!, fc.args ?? {}, opts.toolContext);
      console.log('[agent] tool', fc.name, 'args=', JSON.stringify(fc.args), '=>', JSON.stringify(result).slice(0, 400));
      responseParts.push({
        functionResponse: {
          name: fc.name!,
          response: result.ok
            ? (result.data as any)
            : { error: result.error },
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return finalText;
}

export function pickReplyDelayMs(cfg: AgentConfig, replyText: string): number {
  const min = (cfg.responseDelayMin ?? DEFAULT_AGENT.responseDelayMin!) * 1000;
  const max = (cfg.responseDelayMax ?? DEFAULT_AGENT.responseDelayMax!) * 1000;
  const base = min + Math.random() * Math.max(0, max - min);
  const perChar = Math.min(replyText.length * 25, 4000);
  return Math.round(base + perChar);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
