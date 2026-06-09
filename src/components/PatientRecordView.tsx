import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Mail, Phone, Stethoscope, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../lib/api';
import { Appointment, Patient, Professional, ProfessionalService } from '../types';
import { cn } from '../lib/utils';
import { PageHeader } from './ui/PageHeader';
import { LoadingState } from './ui/LoadingState';
import { EmptyState } from './ui/EmptyState';

interface PatientRecordViewProps {
  clinicId: string;
}

export function PatientRecordView({ clinicId }: PatientRecordViewProps) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPatientRecord() {
      if (!patientId) return;
      setLoading(true);
      setError(null);
      try {
        const [patientData, appointmentData, professionalData] = await Promise.all([
          api.get<{ patient: Patient }>(`/api/patients/${patientId}`),
          api.get<{ appointments: Appointment[] }>('/api/appointments'),
          api.get<{ professionals: Professional[] }>('/api/professionals'),
        ]);
        if (cancelled) return;
        setPatient(patientData.patient);
        setAppointments(
          appointmentData.appointments
            .filter((appointment) => appointment.patientId === patientId)
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        );
        setProfessionals(professionalData.professionals);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Paciente nao encontrado ou indisponivel.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPatientRecord();
    return () => {
      cancelled = true;
    };
  }, [clinicId, patientId]);

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

  const completed = appointments.filter((appointment) => appointment.status === 'completed').length;
  const nextAppointment = appointments
    .filter((appointment) => new Date(appointment.startTime).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

  if (loading) {
    return <LoadingState label="Carregando prontuario" className="h-[50vh]" />;
  }

  if (error || !patient) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/patients')}
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Voltar para pacientes
        </button>
        <EmptyState
          icon={<User size={28} />}
          title="Paciente nao encontrado"
          description={error ?? 'Nao foi possivel carregar este prontuario.'}
          action={
            <Link
              to="/patients"
              className="bg-slate-900 text-white px-6 py-3 rounded font-bold shadow-sm hover:bg-slate-800 transition-all"
            >
              Ver pacientes
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Prontuario"
        title={patient.name}
        description="Historico de atendimentos, contatos e contexto de relacionamento."
        actions={
          <button
            onClick={() => navigate('/patients')}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded flex items-center justify-center gap-2 transition-all font-bold text-sm"
          >
            <ArrowLeft size={16} />
            Pacientes
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-6">
        <section className="space-y-4">
          <div className="bg-white border border-slate-100 rounded p-6 shadow-sm shadow-slate-100/50">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded flex items-center justify-center text-2xl font-bold mb-5">
              {patient.name[0]?.toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{patient.name}</h2>
            <div className="mt-5 space-y-3">
              <ContactRow icon={<Phone size={15} />} label="Telefone" value={patient.phone} href={`tel:${patient.phone}`} />
              <ContactRow icon={<Mail size={15} />} label="E-mail" value={patient.email || 'Nao informado'} href={patient.email ? `mailto:${patient.email}` : undefined} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <RecordStat label="Consultas" value={appointments.length} />
            <RecordStat label="Realizadas" value={completed} />
          </div>

          <div className="bg-white border border-slate-100 rounded p-5 shadow-sm shadow-slate-100/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Proximo atendimento</p>
            {nextAppointment ? (
              <div className="mt-3">
                <p className="font-bold text-slate-900">
                  {format(new Date(nextAppointment.startTime), "dd 'de' MMMM 'as' HH:mm", { locale: ptBR })}
                </p>
                <p className="text-xs font-bold text-slate-400 mt-1">
                  {serviceMap[nextAppointment.serviceId]?.name ?? 'Servico'}
                </p>
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-400 mt-3">Nenhum atendimento futuro.</p>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-100 rounded shadow-sm shadow-slate-100/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Historico de atendimentos</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {appointments.length} registros
              </p>
            </div>
            <Link to="/agenda" className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
              Abrir agenda
            </Link>
          </div>

          {appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck size={28} />}
              title="Sem atendimentos"
              description="Os agendamentos deste paciente aparecerao aqui."
              className="border-0 rounded-none"
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((appointment) => {
                const professional = professionalMap[appointment.professionalId];
                const service = serviceMap[appointment.serviceId];
                return (
                  <div key={appointment.id} className="px-5 py-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded flex items-center justify-center shrink-0">
                      <Stethoscope size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {service?.name ?? 'Servico nao informado'}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5">
                        {format(new Date(appointment.startTime), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                        {professional ? ` · ${professional.name}` : ''}
                      </p>
                    </div>
                    <StatusPill status={appointment.status} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="w-8 h-8 bg-slate-50 text-emerald-500 rounded flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        <span className="block text-sm font-bold text-slate-800 truncate">{value}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <a href={href} className="flex items-center gap-3 hover:bg-slate-50 rounded transition-colors">
        {content}
      </a>
    );
  }

  return <div className="flex items-center gap-3">{content}</div>;
}

function RecordStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-100 rounded p-5 shadow-sm shadow-slate-100/50">
      <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{label}</p>
    </div>
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
    <span className={cn('text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest shrink-0', item.className)}>
      {item.label}
    </span>
  );
}
