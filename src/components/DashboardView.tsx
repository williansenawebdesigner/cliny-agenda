import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  CalendarClock,
  MessageSquare,
  Phone,
  Stethoscope,
  Users,
} from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../lib/api';
import { Appointment, Patient, Professional, ProfessionalService, WhatsAppInstance } from '../types';
import { cn } from '../lib/utils';
import { PageHeader } from './ui/PageHeader';
import { LoadingState } from './ui/LoadingState';
import { EmptyState } from './ui/EmptyState';

interface DashboardViewProps {
  clinicId: string;
}

const ACTIVE_STATUSES = new Set(['scheduled', 'confirmed', 'checked-in']);

export function DashboardView({ clinicId }: DashboardViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);
      try {
        const [appointmentData, patientData, professionalData, instanceData] = await Promise.all([
          api.get<{ appointments: Appointment[] }>('/api/appointments'),
          api.get<{ patients: Patient[] }>('/api/patients'),
          api.get<{ professionals: Professional[] }>('/api/professionals'),
          api.get<{ instances: WhatsAppInstance[] }>('/api/whatsapp/instances'),
        ]);
        if (cancelled) return;
        setAppointments(appointmentData.appointments);
        setPatients(patientData.patients);
        setProfessionals(professionalData.professionals);
        setInstances(instanceData.instances);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Nao foi possivel carregar os indicadores do painel.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const patientMap = useMemo(() => {
    const map: Record<string, Patient> = {};
    patients.forEach((patient) => {
      map[patient.id] = patient;
    });
    return map;
  }, [patients]);

  const professionalMap = useMemo(() => {
    const map: Record<string, Professional> = {};
    professionals.forEach((professional) => {
      map[professional.id] = professional;
    });
    return map;
  }, [professionals]);

  const serviceMap = useMemo(() => {
    const map: Record<string, ProfessionalService> = {};
    professionals.forEach((professional) => {
      professional.services?.forEach((service) => {
        map[service.id] = service;
      });
    });
    return map;
  }, [professionals]);

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => isSameDay(new Date(appointment.startTime), new Date()))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [appointments]
  );

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter(
          (appointment) =>
            new Date(appointment.startTime).getTime() >= Date.now() &&
            ACTIVE_STATUSES.has(appointment.status)
        )
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 5),
    [appointments]
  );

  const completedToday = todayAppointments.filter((appointment) => appointment.status === 'completed').length;
  const openInstances = instances.filter((instance) => instance.status === 'open').length;

  if (loading) {
    return <LoadingState label="Carregando painel" className="h-[50vh]" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Visao geral"
        title="Painel da clinica"
        description="Acompanhe agenda, pacientes, equipe e conexoes de atendimento em um unico lugar."
        actions={
          <Link
            to="/agenda"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all font-bold active:scale-95 text-sm"
          >
            <CalendarCheck size={18} />
            Abrir agenda
          </Link>
        }
      />

      {error && (
        <div className="rounded border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<CalendarClock size={20} />}
          label="Hoje"
          value={todayAppointments.length}
          detail={`${completedToday} realizados`}
          accent="emerald"
        />
        <StatCard
          icon={<Users size={20} />}
          label="Pacientes"
          value={patients.length}
          detail="cadastrados"
          accent="slate"
        />
        <StatCard
          icon={<Stethoscope size={20} />}
          label="Equipe"
          value={professionals.length}
          detail="profissionais"
          accent="blue"
        />
        <StatCard
          icon={<Phone size={20} />}
          label="WhatsApp"
          value={openInstances}
          detail={`${instances.length} conexoes`}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <section className="bg-white border border-slate-100 rounded shadow-sm shadow-slate-100/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Proximos atendimentos</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Agenda em tempo real
              </p>
            </div>
            <Link to="/agenda" className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
              Ver agenda
            </Link>
          </div>

          {upcomingAppointments.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck size={28} />}
              title="Nenhum atendimento futuro"
              description="Quando houver consultas agendadas, elas aparecerao aqui."
              className="border-0 rounded-none"
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingAppointments.map((appointment) => {
                const patient = patientMap[appointment.patientId];
                const professional = professionalMap[appointment.professionalId];
                const service = serviceMap[appointment.serviceId];
                return (
                  <Link
                    key={appointment.id}
                    to="/agenda"
                    className="flex items-center gap-4 px-5 py-4 hover:bg-emerald-50/30 transition-colors"
                  >
                    <div className="w-14 shrink-0 text-center">
                      <span className="block text-sm font-bold text-slate-900 tabular-nums">
                        {format(new Date(appointment.startTime), 'HH:mm')}
                      </span>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">
                        {format(new Date(appointment.startTime), 'dd MMM', { locale: ptBR })}
                      </span>
                    </div>
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded flex items-center justify-center shrink-0 font-bold">
                      {patient?.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate">{patient?.name ?? 'Paciente'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                        {service?.name ?? 'Servico'}{professional ? ` · ${professional.name}` : ''}
                      </p>
                    </div>
                    <StatusPill status={appointment.status} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <QuickLink
            to="/patients"
            icon={<Users size={20} />}
            title="Pacientes"
            description="Cadastro, busca e prontuario."
          />
          <QuickLink
            to="/professionals"
            icon={<Stethoscope size={20} />}
            title="Equipe e servicos"
            description="Profissionais, valores e modos de atendimento."
          />
          <QuickLink
            to="/chat"
            icon={<MessageSquare size={20} />}
            title="Conversas"
            description="Intervencao manual e status da IA."
          />
          <QuickLink
            to="/whatsapp"
            icon={<Phone size={20} />}
            title="WhatsApp IA"
            description="Instancias, QR Code e personalidade do agente."
          />
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  accent: 'emerald' | 'slate' | 'blue' | 'amber';
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="bg-white border border-slate-100 rounded p-5 shadow-sm shadow-slate-100/50">
      <div className="flex items-center justify-between">
        <div className={cn('w-10 h-10 rounded flex items-center justify-center', colors[accent])}>{icon}</div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-5">
        <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className="text-xs font-bold text-slate-400 mt-1">{detail}</p>
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="bg-white border border-slate-100 rounded p-5 flex items-center gap-4 hover:border-emerald-100 hover:bg-emerald-50/20 transition-all shadow-sm shadow-slate-100/50"
    >
      <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs font-medium text-slate-400 mt-0.5">{description}</p>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: Appointment['status'] }) {
  const map: Record<Appointment['status'], { label: string; className: string }> = {
    scheduled: { label: 'Agendado', className: 'bg-blue-50 text-blue-700' },
    confirmed: { label: 'Confirmado', className: 'bg-emerald-50 text-emerald-700' },
    'checked-in': { label: 'Presente', className: 'bg-violet-50 text-violet-700' },
    completed: { label: 'Realizado', className: 'bg-slate-100 text-slate-600' },
    cancelled: { label: 'Cancelado', className: 'bg-red-50 text-red-600' },
    'no-show': { label: 'Faltou', className: 'bg-orange-50 text-orange-700' },
  };
  const item = map[status];

  return (
    <span className={cn('hidden sm:inline-flex text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest', item.className)}>
      {item.label}
    </span>
  );
}
