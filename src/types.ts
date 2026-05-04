export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked-in'
  | 'completed'
  | 'cancelled'
  | 'no-show';

export interface Clinic {
  id: string;
  name: string;
  address?: string;
  whatsappNumber?: string;
  adminEmail: string;
  timezone?: string; // IANA timezone, e.g. "America/Sao_Paulo"
  settings?: any;
}

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export const COMMON_TIMEZONES: { id: string; label: string }[] = [
  { id: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { id: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { id: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { id: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
  { id: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
  { id: 'America/Belem', label: 'Belém (GMT-3)' },
  { id: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { id: 'America/Recife', label: 'Recife (GMT-3)' },
  { id: 'UTC', label: 'UTC' },
];

export interface ProfessionalService {
  id: string;
  name: string;
  duration: number; // minutes
  price: number;
}

export type BookingMode = 'slot' | 'walk_in';

export interface WalkInPeriod {
  id: string;
  label: string;
  start: string; // "08:00"
  end: string; // "12:00"
  capacity: number;
}

export interface Professional {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  specialty?: string;
  weeklyLinkToken?: string;
  schedule?: Record<string, string[]>;
  services?: ProfessionalService[];
  bookingMode?: BookingMode; // default 'slot'
  walkInPeriods?: Record<string, WalkInPeriod[]>;
}

export const DEFAULT_WALKIN_PERIODS: WalkInPeriod[] = [
  { id: 'morning', label: 'Manhã', start: '08:00', end: '12:00', capacity: 10 },
  { id: 'afternoon', label: 'Tarde', start: '13:00', end: '18:00', capacity: 10 },
];

export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export const WEEKDAY_LABELS_PT: Record<string, string> = {
  sunday: 'Domingo',
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
};

export type AgentLanguage = 'pt-BR' | 'en' | 'es';
export type AgentFormality = 'tu' | 'voce' | 'senhor';
export type AgentResponseSize = 'short' | 'medium' | 'long';
export type AgentEmojiUse = 'never' | 'light' | 'free';

export interface AgentTriggers {
  onAppointmentCreated?: string; // template w/ {paciente} {data} {hora} {profissional} {servico}
  onAppointmentCancelled?: string;
  onNoShow?: string;
  onPostConsultation?: string;
}

export interface AgentTools {
  resolve_date?: boolean;
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
  keywords: string[]; // when patient sends one of these, auto-pause agent
  notifyMessage?: string; // sent to patient confirming the transfer
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

  // -- Tone & style ----------------------------------------------------------
  language?: AgentLanguage;
  formality?: AgentFormality;
  responseSize?: AgentResponseSize;
  emojiUse?: AgentEmojiUse;
  temperature?: number; // 0..1
  maxOutputTokens?: number; // 256..4096
  greetingMessage?: string; // optional, only sent if conversation has no prior msgs
  signature?: string; // appended after every reply

  // -- Boundaries ------------------------------------------------------------
  forbiddenTopics?: string[]; // free text bullets

  // -- Triggers --------------------------------------------------------------
  triggers?: AgentTriggers;

  // -- Tools toggle ----------------------------------------------------------
  tools?: AgentTools;

  // -- Human escalation ------------------------------------------------------
  escalation?: AgentEscalation;

  workingHours?: {
    enabled: boolean;
    start: string;
    end: string;
    weekdays: number[];
    outOfHoursMessage?: string;
  };
}

export interface WhatsAppInstance {
  id: string;
  clinicId: string;
  name: string;
  instanceName: string;
  professionalId?: string | null;
  prompt: string;
  status: 'disconnected' | 'connecting' | 'open';
  qrCode?: string;
  createdAt: string;
  agent?: AgentConfig;
}

export interface WhatsAppConversation {
  id: string; // <instanceName>__<remoteJid>
  clinicId: string;
  instanceName: string;
  remoteJid: string;
  agentEnabled: boolean;
  lastMessageAt?: number;
  lastMessagePreview?: string;
  unread?: number;
  contactName?: string;
  updatedAt: string;
}

export interface Patient {
  id: string;
  clinicId: string;
  name: string;
  phone: string;
  email?: string;
}

export interface Appointment {
  id: string;
  clinicId: string;
  professionalId: string;
  patientId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  price: number;
  notes?: string;
  walkIn?: boolean;
  periodId?: string;
  periodLabel?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
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
    onAppointmentCancelled: '',
    onNoShow: '',
    onPostConsultation: '',
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
  },

  escalation: {
    enabled: true,
    keywords: ['humano', 'atendente', 'falar com pessoa', 'reclamar', 'reclamação'],
    notifyMessage:
      'Tudo bem! Vou te transferir para um(a) atendente humano. Em instantes alguém da equipe responderá por aqui.',
  },

  workingHours: {
    enabled: false,
    start: '08:00',
    end: '18:00',
    weekdays: [1, 2, 3, 4, 5],
    outOfHoursMessage:
      'Olá! Nosso atendimento agora está fora do horário. Retornaremos no próximo dia útil.',
  },
};
