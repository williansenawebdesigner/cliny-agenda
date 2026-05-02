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

export interface Professional {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  specialty?: string;
  weeklyLinkToken?: string;
  schedule?: Record<string, string[]>;
  services?: ProfessionalService[];
}

export interface AgentConfig {
  enabled: boolean;
  model?: string; // e.g. "gemini-2.5-flash"
  persona?: string; // tone / personality
  knowledgeBase?: string; // free-text FAQ / clinic info (lightweight RAG)
  responseDelayMin?: number; // seconds before reply
  responseDelayMax?: number;
  showTyping?: boolean; // send presence "composing" while thinking
  fallbackMessage?: string; // when AI fails
  workingHours?: {
    enabled: boolean;
    start: string; // "08:00"
    end: string; // "18:00"
    weekdays: number[]; // 0=Sun..6=Sat
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
  workingHours: {
    enabled: false,
    start: '08:00',
    end: '18:00',
    weekdays: [1, 2, 3, 4, 5],
    outOfHoursMessage:
      'Olá! Nosso atendimento agora está fora do horário. Retornaremos no próximo dia útil.',
  },
};
