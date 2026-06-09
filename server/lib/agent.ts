import { GoogleGenAI, type Content, type Part, type FunctionDeclaration } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  resolve_date?: boolean;
  list_services?: boolean;
  list_available_slots?: boolean;
  create_appointment?: boolean;
  list_available_periods?: boolean;
  create_walk_in_appointment?: boolean;
  list_patient_appointments?: boolean;
  cancel_appointment?: boolean;
  transfer_to_human?: boolean;
  reschedule_appointment?: boolean;
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
  messageBufferEnabled?: boolean;
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
  messageBufferEnabled: true,
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
    resolve_date: true,
    list_services: true,
    list_available_slots: true,
    create_appointment: true,
    list_available_periods: true,
    create_walk_in_appointment: true,
    list_patient_appointments: true,
    cancel_appointment: true,
    transfer_to_human: true,
    reschedule_appointment: true,
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

const WEEKDAY_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function todayContext(tz: string): string {
  const now = new Date();
  const todayYmd = ymdInTz(now, tz);
  const lines: string[] = [
    `Hoje é ${humanInTz(now, tz)} (data ISO: ${todayYmd}). Hora atual: ${hmInTz(now, tz)}. Fuso horário da clínica: ${tz}.`,
    '',
    'Mapa dos próximos 7 dias (use estas datas literais quando o paciente mencionar dia da semana):',
  ];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const ymd = ymdInTz(d, tz);
    const dow = dayOfWeekInTz(new Date(`${ymd}T12:00:00Z`), tz);
    const labels =
      i === 0 ? ' (hoje)' : i === 1 ? ' (amanhã)' : i === 2 ? ' (depois de amanhã)' : '';
    lines.push(`- ${WEEKDAY_PT[dow]}${labels}: ${ymd}`);
  }
  return lines.join('\n');
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
    '',
    '## Estilo de conversa (continuidade e humanização)',
    'Esta é UMA conversa contínua de WhatsApp, não mensagens isoladas. Aja como uma pessoa real que já está conversando, não como um robô que reinicia a cada mensagem.',
    '- Cumprimente (com "Olá"/saudação) UMA ÚNICA VEZ: somente na sua primeira mensagem da conversa (quando ainda não há histórico). Em TODAS as mensagens seguintes, NUNCA comece com "Olá", "Oi" nem com o nome do paciente. Vá direto ao assunto.',
    '- Use o nome do paciente com parcimônia: no máximo no cumprimento inicial e, se quiser, na confirmação final do agendamento. Repetir o nome em toda mensagem soa artificial — evite.',
    '- Não repita frases prontas nem reformule a mesma pergunta. Se o paciente já respondeu algo, não pergunte de novo. Leia o histórico antes de responder.',
    '- Varie a forma de falar. Evite começar mensagens com "Entendi que você quer...". Apenas responda naturalmente.',
    '- Seja breve e resolutivo: cada mensagem deve avançar o agendamento, não apenas repetir o status.',
    '',
    '## Proatividade (SEMPRE ofereça horários/períodos)',
    'Nunca faça o paciente adivinhar. Sempre que houver uma data em jogo, já consulte a disponibilidade e mostre opções concretas:',
    '- Assim que identificar (ou puder deduzir) o dia desejado, chame list_available_slots (hora marcada) ou list_available_periods (ordem de chegada) e apresente as opções reais ANTES de perguntar qualquer coisa.',
    '- Hora marcada: ofereça 2-3 horários específicos disponíveis (ex: "tenho 14:00, 15:30 e 16:00").',
    '- Ordem de chegada: liste os períodos com vaga (ex: "tarde, das 13:00 às 18:00").',
    '- Se o dia/período pedido NÃO tiver disponibilidade, já verifique e ofereça espontaneamente a próxima opção com vaga (outro período no mesmo dia, ou o próximo dia disponível). Não responda apenas "não tem, quer outro dia?" — traga a alternativa pronta.',
    '',
    '## Confirmar só depois de verificar, e agir na confirmação',
    '- NUNCA pergunte "posso agendar para X?" sem antes ter confirmado, via ferramenta, que X realmente está disponível. Verifique a disponibilidade PRIMEIRO, depois ofereça.',
    '- Tudo que você afirmar sobre disponibilidade (dias, horários, períodos) deve vir de uma chamada de ferramenta real. NUNCA invente nem liste dias/horários que você não consultou. Não monte tabelas da semana inteira sem ter checado cada dia.',
    '- Se você já apresentou um dia/horário como disponível e o paciente o escolheu, prossiga com o agendamento — não consulte de novo só para então se contradizer.',
    '- Peça confirmação NO MÁXIMO UMA vez antes de criar o agendamento. Quando o paciente confirmar de qualquer forma ("sim", "pode marcar", "isso", "confirmo", "já falei", "pode ser"), chame IMEDIATAMENTE create_appointment ou create_walk_in_appointment. NÃO repita a pergunta, NÃO peça confirmação outra vez.',
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
    '## Extração proativa de informação',
    'Antes de fazer perguntas, analise TODA a mensagem e o histórico para extrair o que já foi dito:',
    '- Se o paciente já mencionou serviço/procedimento (ex: "consulta", "ultrassom"), use esse nome para fazer a correspondência com os resultados de list_services (comparação case-insensitive). Não pergunte de novo.',
    '- Se o paciente mencionou o profissional pelo nome, filtre por ele.',
    '- Se o paciente já forneceu data, nome e serviço na mesma mensagem, avance direto para list_services + list_available_slots sem fazer perguntas intermediárias.',
    '- Pergunte apenas pelo que genuinamente ainda falta.',
    '',
    '## Regra crítica de datas',
    'Quando o paciente mencionar uma data ("terça", "amanhã", "10/06", "próxima sexta", "semana que vem"), você DEVE chamar resolve_date(expression="<texto exato do paciente>") ANTES de chamar list_available_slots, list_available_periods, create_appointment ou create_walk_in_appointment.',
    'NUNCA tente calcular a data sozinho. NUNCA use uma data sem confirmar com o paciente o dia da semana.',
    'Se o paciente disser apenas o dia da semana (ex: "terça"), assuma a próxima ocorrência (incluindo hoje se ainda for cedo o suficiente). Após resolve_date, confirme com o paciente: "Ok, então quinta-feira, 10/06?".',
    '',
    '## Para quem é a consulta (paciente x contato)',
    'Quem fala no WhatsApp NEM SEMPRE é o paciente. É muito comum um filho, cônjuge ou amigo agendar para outra pessoa.',
    '- Sempre deixe claro PARA QUEM é a consulta. Se não estiver óbvio, pergunte: "A consulta é para você mesmo ou para outra pessoa?" e, se for para outra pessoa, peça o nome completo dela.',
    '- Use ESTRITAMENTE o nome informado para o paciente em cada agendamento (patientName). NUNCA assuma que o paciente é o dono do número do WhatsApp, e nunca troque o nome que o contato informou.',
    '- Num mesmo atendimento o contato pode agendar para VÁRIAS pessoas diferentes (ex: a mãe e o pai). Trate cada pessoa como um paciente separado: confirme o nome de cada uma e crie um agendamento por pessoa, sem misturar datas, horários ou serviços entre elas.',
    '- Ao confirmar cada agendamento, sempre diga o nome do paciente daquele agendamento específico (ex: "Consulta da Dona Maria marcada para...").',
    '- Para cancelar/remarcar/listar, lembre que o número pode ter mais de um paciente. Se houver ambiguidade, use list_patient_appointments e pergunte de qual pessoa se trata antes de agir.',
    '',
    '## Modos de agendamento',
    'Cada serviço retornado por list_services tem um campo bookingMode:',
    '- "slot": atendimento por HORA MARCADA. Use list_available_slots e create_appointment.',
    '- "walk_in": atendimento por ORDEM DE CHEGADA, em períodos do dia (Manhã/Tarde/etc). Use list_available_periods e create_walk_in_appointment. NÃO pergunte hora exata.',
    'Sempre que for agendar, primeiro chame list_services para descobrir o bookingMode do serviço escolhido.',
    '',
    '## Fluxo HORA MARCADA (slot)',
    '1. Pergunte apenas o que ainda não souber (nome, procedimento, data). Se o paciente já deu, não repita.',
    '2. list_services → pega serviceId e bookingMode. Se o paciente já disse o serviço, filtre automaticamente.',
    '3. resolve_date + list_available_slots → JÁ ofereça 2-3 horários reais disponíveis. Se não houver vaga no dia, consulte e ofereça o próximo dia com horários.',
    '4. Quando o paciente escolher/confirmar um horário, chame create_appointment NA HORA (sem perguntar de novo).',
    '5. Confirme repetindo data, hora, profissional e serviço.',
    '',
    '## Fluxo ORDEM DE CHEGADA (walk_in)',
    '1. Pergunte apenas o que ainda não souber (nome, procedimento, data). Se o paciente já deu, não repita.',
    '2. list_services → confirma bookingMode="walk_in".',
    '3. resolve_date + list_available_periods → JÁ mostre os períodos COM VAGA daquele dia (ex: "tem tarde, das 13:00 às 18:00"). Liste somente períodos retornados pela ferramenta com available=true. Se o período pedido estiver sem vaga, ofereça espontaneamente outro período do dia ou o próximo dia disponível.',
    '4. Quando o paciente escolher um período (ou confirmar o que você ofereceu), chame create_walk_in_appointment NA HORA com o periodId. Não pergunte "posso agendar?" de novo se ele já confirmou.',
    '5. Reforce: "É por ordem de chegada. Compareça à clínica a partir das HH:MM (hora de início do período)." Use o campo reminderToPatient retornado.',
    '',
    '## Reagendamento',
    'Quando o paciente quiser remarcar uma consulta:',
    '1. list_patient_appointments → obtém appointmentId e detalhes do agendamento atual.',
    '2. resolve_date → converte a nova data desejada.',
    '3. list_available_slots → verifica horários disponíveis na nova data.',
    '4. Confirme: "Posso remarcar sua consulta de [data/hora atual] para [nova data] às [novo horário]?".',
    '5. reschedule_appointment → executa o reagendamento.',
    '6. Confirme: "Pronto! Sua consulta foi remarcada para [data] às [hora].".',
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
  db: SupabaseClient,
  instanceName: string,
  remoteJid: string,
  limit = 20,
  beforeTs?: number,
  beforeCreatedAt?: string,
): Promise<ConversationTurn[]> {
  let query = db
    .from('whatsapp_messages')
    .select('from_me, content, message_timestamp, created_at')
    .eq('instance_name', instanceName)
    .eq('remote_jid', remoteJid);

  // Exclude messages that belong to the current debounce window so they don't
  // appear both in history and in the combined userMessage passed to the model.
  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  } else if (beforeTs && beforeTs > 0) {
    query = query.lt('message_timestamp', beforeTs);
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!data || data.length === 0) return [];
  return data
    .reverse()
    .filter((m: any) => typeof m.content === 'string' && m.content.length > 0)
    .map((m: any): ConversationTurn => ({
      role: m.from_me ? 'assistant' : 'user',
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
