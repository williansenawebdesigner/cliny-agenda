export type AppointmentStatus = 'scheduled' | 'confirmed' | 'checked-in' | 'completed' | 'cancelled' | 'no-show';

export interface Clinic {
  id: string;
  name: string;
  address?: string;
  whatsappNumber?: string;
  adminEmail: string;
  settings?: any;
}

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
  schedule?: Record<string, string[]>; // day: [slots]
  services?: ProfessionalService[];
}

export interface WhatsAppInstance {
  id: string;
  clinicId: string;
  name: string; // User-facing name
  instanceName: string; // Evolution API instance ID
  professionalId?: string | null;
  prompt: string;
  status: 'disconnected' | 'connecting' | 'open';
  qrCode?: string; // transient
  createdAt: string;
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
  startTime: string; // ISO string
  endTime: string; // ISO string
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
