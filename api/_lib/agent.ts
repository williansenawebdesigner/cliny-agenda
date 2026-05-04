import { GoogleGenAI, type Content, type Part, type FunctionDeclaration } from '@google/genai';
import type { Firestore } from 'firebase-admin/firestore';
import { executeTool, toolDeclarations, type ToolContext } from './agentTools.js';
import { DEFAULT_TIMEZONE, humanInTz, hmInTz, ymdInTz, dayOfWeekInTz } from './tz.js';

export type AgentLanguage = 'pt-BR' | 'en' | 'es';
export type AgentFormality = 'tu' | 'voce' | 'senhor';
export type AgentResponseSize = 'short' | 'medium' | 'long';
export type AgentEmojiUse = 'never' | 'light' | 'free';

export interface AgentTriggers {
  onAppointmentCreated?: string;
  onAppointmentCancelled?: string;
  onNoShow?: string;
  onPostConsultation?: string;
}

export interface AgentToolsToggle {
  list_services?: boolean;
  list_available_slots?: boolean;
  create_appointment?: boolean;
  list_available_periods?: boolean;
  create_walk_in_appointment?: boolean;
  list_patient_appointments?: boolean;
  cancel_appointment?: boolean;
  transfer_to_human?: boolean;
}

export interface AgentEscalation {
  enabled: boolean;
  keywords: string[];
  notifyMessage?: string;
}

export interface AgentConfig {
  enabled: boolean;
  model?: string;
  persona?: string;
  knowledgeBase?: string;
  responseDelayMin?: number;
  responseDelayMax?: number;
  showTyping?: boolean;
  fallbackMessage?: string;

  language?: AgentLanguage;
  formality?: AgentFormality;
  responseSize?: AgentResponseSize;
  emojiUse?: AgentEmojiUse;
  temperature?: number;
  maxOutputTokens?: number;
  greetingMessage?: string;
  signature?: string;

  forbiddenTopics?: string[];

  triggers?: AgentTriggers;
  tools?: AgentToolsToggle;
  escalation?: AgentEscalation;

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

  language: 'pt-BR',
  formality: 'voce',
  responseSize: 'medium',
  emojiUse: 'light',
  temperature: 0.5,
  maxOutputTokens: 800,
  greetingMessage: '',
  signature: '',
  forbiddenTopics: [],

  triggers: {
    onAppointmentCreated:
      'Confirmado, {paciente}! Sua consulta de {servico} foi agendada para {data} às {hora} com {profissional}. Até breve! 🩺',
  },

  tools: {
    list_services: true,
    list_available_slots: true,
    create_appointment: true,
    list_available_periods: true,
    create_walk_in_appointment: true,
    list_patient_appointments: true,
    cancel_appointment: true,
    transfer_to_human: true,
  },

  escalation: {
    enabled: true,
    keywords: ['humano', 'atendente', 'falar com pessoa', 'reclamar', 'reclamação'],
  },
};

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const LANG_INSTRUCTIONS: Record<AgentLanguage, string> = {
  'pt-BR': 'Responda sempre em português do Brasil.',
  en: 'Always respond in English.',
  es: 'Responde siempre en español.',
};

const FORMALITY_INSTRUCTIONS: Record<AgentFormality, string> = {
  tu: 'Trate o paciente por "tu" (informal regional).',
  voce: 'Trate o paciente por "você" (informal padrão brasileiro).',
  senhor: 'Trate o paciente por "senhor" / "senhora" (formal e respeitoso).',
};

const SIZE_INSTRUCTIONS: Record<AgentResponseSize, string> = {
  short: 'Respostas MUITO curtas (1-2 frases). Direto ao ponto.',
  medium: 'Respostas curtas (até 3 parágrafos pequenos). Evite listas longas.',
  long: 'Pode usar respostas mais longas e detalhadas quando o contexto exigir, mas sem ser prolixo.',
};

const EMOJI_INSTRUCTIONS: Record<AgentEmojiUse, string> = {
  never: 'NUNCA use emojis.',
  light: 'Use no máximo 1 emoji por resposta, e somente quando agregar (😊 ✅ 📅).',
  free: 'Pode usar emojis livremente para tornar a conversa mais leve e amigável.',
};

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
  const lang = cfg.language ?? 'pt-BR';
  const formality = cfg.formality ?? 'voce';
  const size = cfg.responseSize ?? 'medium';
  const emoji = cfg.emojiUse ?? 'light';

  const parts: string[] = [
    `Você é o assistente virtual de ${opts.clinicName ?? 'uma clínica'} no WhatsApp.`,
    `Persona: ${cfg.persona ?? DEFAULT_AGENT.persona}.`,
    LANG_INSTRUCTIONS[lang],
    FORMALITY_INSTRUCTIONS[formality],
    SIZE_INSTRUCTIONS[size],
    EMOJI_INSTRUCTIONS[emoji],
    'Não use markdown (sem **, sem #, sem listas com -). WhatsApp não renderiza.',
    todayContext(tz),
    `Sempre que mencionar horários ao paciente, use o horário local da clínica (${tz}). Os campos "startTimeLocal" das ferramentas já estão nesse fuso — use-os, NÃO converta novamente.`,
  ];

  if (cfg.signature && cfg.signature.trim()) {
    parts.push(`Termine cada resposta com a assinatura: "${cfg.signature.trim()}"`);
  }

  if (cfg.forbiddenTopics && cfg.forbiddenTopics.length > 0) {
    parts.push(
      '',
      '## Tópicos proibidos',
      'Você NUNCA deve dar conselhos ou opiniões sobre os seguintes assuntos. Se o paciente perguntar, recuse educadamente e ofereça transferir para um humano:',
      ...cfg.forbiddenTopics.map((t) => `- ${t}`)
    );
  }

  parts.push(
    '',
    '## Capacidades',
    'Você TEM acesso a ferramentas (function calling). Use-as quando aplicável.',
    '',
    '## Modos de agendamento',
    'Cada serviço retornado por list_services tem um campo bookingMode:',
    '- "slot": atendimento por HORA MARCADA. Use list_available_slots e create_appointment.',
    '- "walk_in": atendimento por ORDEM DE CHEGADA, em períodos do dia (Manhã/Tarde/etc). Use list_available_periods e create_walk_in_appointment. NÃO pergunte hora exata.',
    'Sempre que for agendar, primeiro chame list_services para descobrir o bookingMode do serviço escolhido.',
    '',
    '## Fluxo HORA MARCADA (slot)',
    '1. Pergunte nome, procedimento e data.',
    '2. list_services → pega serviceId, duração e bookingMode.',
    '3. list_available_slots → ofereça 2-3 horários.',
    '4. Após confirmação ("pode marcar para X"), chame create_appointment.',
    '5. Confirme repetindo data, hora, profissional e serviço.',
    '',
    '## Fluxo ORDEM DE CHEGADA (walk_in)',
    '1. Pergunte nome, procedimento e data.',
    '2. list_services → confirma bookingMode="walk_in".',
    '3. list_available_periods → mostra os períodos do dia (ex: "Manhã 08:00-12:00", "Tarde 13:00-18:00") com vagas restantes.',
    '4. Pergunte ao paciente: "Você prefere de manhã ou à tarde?" (use os labels reais retornados).',
    '5. Após escolha, chame create_walk_in_appointment com o periodId.',
    '6. Reforce: "É por ordem de chegada. Compareça à clínica a partir das HH:MM (hora de início do período)." Use o campo reminderToPatient retornado.',
    '',
    'NUNCA invente serviços, preços, horários, períodos ou profissionais. Use sempre as ferramentas.',
    'NUNCA chame create_appointment ou create_walk_in_appointment sem antes confirmar tudo com o paciente.',
    'NUNCA misture os fluxos: se bookingMode é walk_in, não fale em hora específica.',
    '',
    '## Instruções específicas da clínica',
    opts.basePrompt?.trim() || '(sem instruções específicas)'
  );

  const triggers = cfg.triggers ?? {};
  const triggerLines: string[] = [];
  if (triggers.onAppointmentCreated && triggers.onAppointmentCreated.trim()) {
    triggerLines.push(
      `- Após chamar create_appointment com sucesso, sua próxima mensagem ao paciente DEVE seguir EXATAMENTE este modelo (substituindo {paciente}, {data}, {hora}, {profissional}, {servico} pelos valores corretos): "${triggers.onAppointmentCreated.trim()}"`
    );
  }
  if (triggers.onAppointmentCancelled && triggers.onAppointmentCancelled.trim()) {
    triggerLines.push(
      `- Após chamar cancel_appointment, use este modelo: "${triggers.onAppointmentCancelled.trim()}"`
    );
  }
  if (triggerLines.length > 0) {
    parts.push('', '## Modelos obrigatórios de mensagem', ...triggerLines);
  }

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

function filterEnabledTools(cfg: AgentConfig): FunctionDeclaration[] {
  const toggles = cfg.tools ?? {};
  return toolDeclarations.filter((t) => {
    const flag = (toggles as any)[t.name!];
    // default: enabled if not explicitly false
    return flag !== false;
  });
}

export interface AgentReplyResult {
  text: string;
  transferred: boolean; // true if transfer_to_human was invoked
}

export async function generateAgentReply(opts: {
  apiKey: string;
  systemPrompt: string;
  history: ConversationTurn[];
  userMessage: string;
  agent: AgentConfig;
  toolContext: ToolContext;
  maxIterations?: number;
}): Promise<AgentReplyResult> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const model = opts.agent.model || DEFAULT_AGENT.model!;
  const maxIterations = opts.maxIterations ?? 5;
  const enabledTools = filterEnabledTools(opts.agent);

  const contents: Content[] = [
    ...opts.history.map((t): Content => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    })),
    { role: 'user', parts: [{ text: opts.userMessage }] },
  ];

  let finalText = '';
  let transferred = false;

  for (let i = 0; i < maxIterations; i++) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: opts.systemPrompt,
        temperature: opts.agent.temperature ?? 0.5,
        maxOutputTokens: opts.agent.maxOutputTokens ?? 800,
        tools: enabledTools.length > 0 ? [{ functionDeclarations: enabledTools }] : undefined,
      },
    });

    const fnCalls = response.functionCalls ?? [];

    if (fnCalls.length === 0) {
      finalText = response.text?.trim() || '';
      break;
    }

    const modelParts: Part[] = fnCalls.map((fc) => ({
      functionCall: { name: fc.name!, args: fc.args ?? {} },
    }));
    contents.push({ role: 'model', parts: modelParts });

    const responseParts: Part[] = [];
    for (const fc of fnCalls) {
      if (fc.name === 'transfer_to_human') {
        transferred = true;
      }
      const result = await executeTool(fc.name!, fc.args ?? {}, opts.toolContext);
      console.log('[agent] tool', fc.name, 'args=', JSON.stringify(fc.args), '=>', JSON.stringify(result).slice(0, 400));
      responseParts.push({
        functionResponse: {
          name: fc.name!,
          response: result.ok ? (result.data as any) : { error: result.error },
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  // Append signature if configured (and not already present)
  const sig = opts.agent.signature?.trim();
  if (sig && finalText && !finalText.includes(sig)) {
    finalText = `${finalText}\n\n${sig}`;
  }

  return { text: finalText, transferred };
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

/** Detect if user message contains an escalation keyword (case-insensitive substring). */
export function detectsEscalation(cfg: AgentConfig, message: string): boolean {
  if (!cfg.escalation?.enabled) return false;
  const m = message.toLowerCase();
  return (cfg.escalation.keywords ?? []).some((k) => k && m.includes(k.toLowerCase()));
}

/** Apply placeholders {paciente} {data} {hora} {profissional} {servico} */
export function fillTemplate(
  tpl: string,
  vars: { paciente?: string; data?: string; hora?: string; profissional?: string; servico?: string }
): string {
  return tpl
    .replace(/\{paciente\}/gi, vars.paciente || '')
    .replace(/\{data\}/gi, vars.data || '')
    .replace(/\{hora\}/gi, vars.hora || '')
    .replace(/\{profissional\}/gi, vars.profissional || '')
    .replace(/\{servico\}/gi, vars.servico || '');
}
