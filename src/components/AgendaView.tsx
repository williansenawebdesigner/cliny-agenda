import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Briefcase,
  LayoutGrid,
  CalendarDays,
  CalendarRange,
  Focus,
  Plus,
  X,
  Edit2,
  Trash2,
  CheckCircle,
  FileText,
  Search,
  RotateCcw,
  Check,
  CalendarCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../lib/api';
import { Appointment, AppointmentStatus, Patient, Professional, ProfessionalService } from '../types';
import {
  format,
  addDays,
  subDays,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { NewAppointmentModal } from './NewAppointmentModal';

interface AgendaViewProps {
  clinicId: string;
}

type ViewMode = 'month' | 'week' | 'day' | 'focus';

export function AgendaView({ clinicId }: AgendaViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('focus');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Record<string, Patient>>({});
  const [professionals, setProfessionals] = useState<Record<string, Professional>>({});
  const [procedures, setProcedures] = useState<Record<string, ProfessionalService>>({});
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [profFilter, setProfFilter] = useState('all');
  const [slotInterval] = useState(30);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [appData, patData, profData] = await Promise.all([
        api.get<{ appointments: Appointment[] }>('/api/appointments'),
        api.get<{ patients: Patient[] }>('/api/patients'),
        api.get<{ professionals: Professional[] }>('/api/professionals'),
      ]);
      setAppointments(appData.appointments);
      const patMap: Record<string, Patient> = {};
      patData.patients.forEach(p => (patMap[p.id] = p));
      setPatients(patMap);
      const profMap: Record<string, Professional> = {};
      const procMap: Record<string, ProfessionalService> = {};
      profData.professionals.forEach(p => {
        profMap[p.id] = p;
        p.services?.forEach(s => (procMap[s.id] = s));
      });
      setProfessionals(profMap);
      setProcedures(procMap);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handlePrev = () => {
    if (viewMode === 'month') setSelectedDate(subMonths(selectedDate, 1));
    else setSelectedDate(subDays(selectedDate, 1));
  };
  const handleNext = () => {
    if (viewMode === 'month') setSelectedDate(addMonths(selectedDate, 1));
    else setSelectedDate(addDays(selectedDate, 1));
  };

  const openReschedule = (appt: Appointment) => {
    setSelectedAppointment(appt);
    setIsDetailOpen(false);
    setIsRescheduling(true);
  };

  const filteredAppts = profFilter === 'all' ? appointments : appointments.filter(a => a.professionalId === profFilter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agenda</h1>
          <p className="text-slate-500 font-medium text-xs uppercase tracking-widest mt-0.5">Controle de atendimentos</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded">
            <ViewTab active={viewMode === 'focus'} onClick={() => setViewMode('focus')} icon={<Focus size={14} />} label="Foco" />
            <ViewTab active={viewMode === 'day'} onClick={() => setViewMode('day')} icon={<CalendarDays size={14} />} label="Dia" />
            <ViewTab active={viewMode === 'week'} onClick={() => setViewMode('week')} icon={<CalendarRange size={14} />} label="Semana" />
            <ViewTab active={viewMode === 'month'} onClick={() => setViewMode('month')} icon={<LayoutGrid size={14} />} label="Mês" />
          </div>
          <div className="flex items-center bg-white border border-slate-200 p-1 rounded gap-1">
            <button onClick={handlePrev} className="p-1.5 hover:bg-slate-100 rounded transition-all text-slate-400"><ChevronLeft size={16} /></button>
            <button onClick={() => setSelectedDate(new Date())} className="px-3 py-1 text-center min-w-[130px] text-sm font-bold text-slate-900 hover:text-emerald-600 transition-colors">
              {viewMode === 'month' ? format(selectedDate, 'MMMM yyyy', { locale: ptBR }) : format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            </button>
            <button onClick={handleNext} className="p-1.5 hover:bg-slate-100 rounded transition-all text-slate-400"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold text-sm flex items-center gap-2 shadow-sm transition-all active:scale-95">
            <Plus size={16} /> Novo
          </button>
          <button onClick={() => fetchData()} className="p-2 bg-white border border-slate-200 rounded text-slate-400 hover:text-emerald-600 transition-all shadow-sm" title="Atualizar">
            <RotateCcw size={16} className={cn(loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Prof filter (hidden in focus mode) */}
      {viewMode !== 'focus' && (
        <div className="flex items-center gap-3 bg-white p-3 rounded border border-slate-100 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap shrink-0">Profissional:</span>
          <div className="flex items-center gap-2">
            <FilterBtn active={profFilter === 'all'} onClick={() => setProfFilter('all')} label="Todos" color="slate" />
            {Object.values(professionals).map(prof => (
              <FilterBtn key={prof.id} active={profFilter === prof.id} onClick={() => setProfFilter(prof.id)} label={prof.name} color="emerald" />
            ))}
          </div>
        </div>
      )}

      {/* Main view */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === 'focus' ? (
        <FocusMode
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          appointments={appointments}
          patients={patients}
          professionals={professionals}
          procedures={procedures}
          profFilter={profFilter}
          setProfFilter={setProfFilter}
          onUpdate={() => fetchData(false)}
          onSelectAppointment={(appt) => { setSelectedAppointment(appt); setIsDetailOpen(true); }}
          onReschedule={openReschedule}
        />
      ) : (
        <div className="bg-white rounded border border-slate-100 shadow-sm overflow-hidden h-[calc(100vh-300px)] min-h-[500px] flex flex-col">
          <div className="flex-1 overflow-auto no-scrollbar">
            {viewMode === 'month' && (
              <MonthCalendar date={selectedDate} appointments={filteredAppts} onSelectDate={d => { setSelectedDate(d); setViewMode('day'); }} />
            )}
            {viewMode === 'week' && (
              <WeekTimeline selectedDate={selectedDate} appointments={filteredAppts} slotInterval={slotInterval}
                onSelectAppointment={app => { setSelectedAppointment(app); setIsDetailOpen(true); }}
                onAddEvent={date => { setSelectedDate(date); setIsModalOpen(true); }}
              />
            )}
            {viewMode === 'day' && (
              <DayTimeline selectedDate={selectedDate} appointments={filteredAppts} patients={patients}
                professionals={professionals} procedures={procedures} slotInterval={slotInterval}
                onSelectAppointment={app => { setSelectedAppointment(app); setIsDetailOpen(true); }}
                onAddEvent={date => { setSelectedDate(date); setIsModalOpen(true); }}
              />
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <NewAppointmentModal clinicId={clinicId} initialDate={selectedDate}
            onClose={() => setIsModalOpen(false)}
            onSuccess={() => { setIsModalOpen(false); fetchData(false); }}
          />
        )}
        {isEditing && selectedAppointment && (
          <NewAppointmentModal clinicId={clinicId} initialDate={selectedDate} existingAppointment={selectedAppointment}
            onClose={() => setIsEditing(false)}
            onSuccess={() => { setIsEditing(false); fetchData(false); }}
          />
        )}
        {isDetailOpen && selectedAppointment && (
          <AppointmentDetailDrawer
            appointment={selectedAppointment}
            patient={patients[selectedAppointment.patientId]}
            professional={professionals[selectedAppointment.professionalId]}
            procedure={procedures[selectedAppointment.serviceId]}
            onClose={() => setIsDetailOpen(false)}
            onEdit={() => { setIsEditing(true); setIsDetailOpen(false); }}
            onReschedule={() => openReschedule(selectedAppointment)}
            onAction={() => { setIsDetailOpen(false); fetchData(false); }}
          />
        )}
        {isRescheduling && selectedAppointment && (
          <RescheduleModal
            appointment={selectedAppointment}
            patients={patients}
            procedures={procedures}
            appointments={appointments}
            onClose={() => setIsRescheduling(false)}
            onSuccess={() => { setIsRescheduling(false); fetchData(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ViewTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all', active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
      {icon}{label}
    </button>
  );
}

function FilterBtn({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: 'slate' | 'emerald' }) {
  return (
    <button onClick={onClick} className={cn('px-3 py-1.5 rounded text-xs font-bold border transition-all whitespace-nowrap', active ? (color === 'emerald' ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-slate-900 border-slate-900 text-white shadow-sm') : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}>
      {label}
    </button>
  );
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  scheduled:    { label: 'Agendado',        bg: 'bg-blue-50',   text: 'text-blue-700' },
  confirmed:    { label: 'Confirmado',       bg: 'bg-emerald-50',text: 'text-emerald-700' },
  'checked-in': { label: 'Presente',         bg: 'bg-violet-50', text: 'text-violet-700' },
  completed:    { label: 'Realizado',        bg: 'bg-slate-100', text: 'text-slate-600' },
  cancelled:    { label: 'Cancelado',        bg: 'bg-red-50',    text: 'text-red-600' },
  'no-show':    { label: 'Não compareceu',   bg: 'bg-orange-50', text: 'text-orange-700' },
};

// ─── Focus Mode ───────────────────────────────────────────────────────────────

function FocusMode({
  selectedDate, setSelectedDate, appointments, patients, professionals, procedures,
  profFilter, setProfFilter, onUpdate, onSelectAppointment, onReschedule,
}: {
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  appointments: Appointment[];
  patients: Record<string, Patient>;
  professionals: Record<string, Professional>;
  procedures: Record<string, ProfessionalService>;
  profFilter: string;
  setProfFilter: (id: string) => void;
  onUpdate: () => void;
  onSelectAppointment: (appt: Appointment) => void;
  onReschedule: (appt: Appointment) => void;
}) {
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const profList = Object.values(professionals);

  const dayAppts = appointments
    .filter(a => isSameDay(new Date(a.startTime), selectedDate) && (profFilter === 'all' || a.professionalId === profFilter))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const filtered = search.trim()
    ? dayAppts.filter(a => { const p = patients[a.patientId]; return p?.name.toLowerCase().includes(search.toLowerCase()) || p?.phone.includes(search); })
    : dayAppts;

  const total     = dayAppts.length;
  const pending   = dayAppts.filter(a => a.status === 'scheduled').length;
  const confirmed = dayAppts.filter(a => a.status === 'confirmed' || a.status === 'checked-in').length;
  const completed = dayAppts.filter(a => a.status === 'completed').length;
  const cancelled = dayAppts.filter(a => a.status === 'cancelled' || a.status === 'no-show').length;

  const updateStatus = async (id: string, status: AppointmentStatus) => {
    setUpdating(id);
    try { await api.put(`/api/appointments/${id}`, { status }); onUpdate(); }
    catch (e) { console.error(e); }
    finally { setUpdating(null); }
  };

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="space-y-4">
      {/* Day nav + prof filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-1">
          <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition-all"><ChevronLeft size={16} /></button>
          <button onClick={() => setSelectedDate(new Date())} className={cn('px-4 py-1 text-sm font-bold rounded transition-all min-w-[160px] text-center', isToday ? 'text-emerald-600' : 'text-slate-900 hover:text-emerald-600')}>
            {isToday ? 'Hoje — ' : ''}{format(selectedDate, "EEEE, dd 'de' MMM", { locale: ptBR })}
          </button>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition-all"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <FilterBtn active={profFilter === 'all'} onClick={() => setProfFilter('all')} label="Todos" color="slate" />
          {profList.map(p => <FilterBtn key={p.id} active={profFilter === p.id} onClick={() => setProfFilter(p.id)} label={p.name} color="emerald" />)}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',       value: total,     cls: 'bg-slate-900 text-white' },
          { label: 'Agendados',   value: pending,   cls: 'bg-blue-50 text-blue-700 border border-blue-100' },
          { label: 'Confirmados', value: confirmed, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
          { label: 'Realizados',  value: completed, cls: 'bg-slate-100 text-slate-600' },
          { label: 'Cancelados',  value: cancelled, cls: 'bg-red-50 text-red-600 border border-red-100' },
        ].map(s => (
          <div key={s.label} className={cn('rounded p-3 flex flex-col items-center gap-1', s.cls)}>
            <span className="text-2xl font-bold">{s.value}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone…"
          className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded outline-none focus:border-emerald-500 text-sm font-medium text-slate-900 placeholder:text-slate-300"
        />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600"><X size={14} /></button>}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded p-14 text-center">
          <CalendarCheck size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400">{search ? 'Nenhum paciente encontrado.' : 'Sem agendamentos para este dia.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded overflow-hidden divide-y divide-slate-100">
          {filtered.map(appt => {
            const patient   = patients[appt.patientId];
            const prof      = professionals[appt.professionalId];
            const proc      = procedures[appt.serviceId];
            const st        = STATUS_MAP[appt.status] ?? STATUS_MAP.scheduled;
            const isCancelled = appt.status === 'cancelled' || appt.status === 'no-show';
            const isCompleted = appt.status === 'completed';
            const isUpdating  = updating === appt.id;

            return (
              <div key={appt.id} className={cn('flex items-center gap-3 px-4 py-3 transition-colors', isCancelled && 'opacity-50')}>
                {/* Clickable info area → opens detail drawer */}
                <button
                  onClick={() => onSelectAppointment(appt)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-transparent group"
                >
                  <span className="text-sm font-bold text-slate-900 w-12 shrink-0 tabular-nums">{format(new Date(appt.startTime), 'HH:mm')}</span>
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold', isCompleted ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700')}>
                    {patient?.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">{patient?.name ?? '—'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">
                      {proc?.name ?? 'Serviço'}{prof ? ` · ${prof.name.split(' ')[0]}` : ''}
                    </p>
                  </div>
                </button>

                {/* Status badge */}
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest hidden sm:block shrink-0', st.bg, st.text)}>{st.label}</span>

                {/* Actions */}
                {isUpdating ? (
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : !isCancelled && (
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {!isCompleted && (
                      <>
                        {appt.status === 'scheduled' && (
                          <ActionBtn title="Confirmar" onClick={() => updateStatus(appt.id, 'confirmed')} className="text-emerald-600 hover:bg-emerald-50">
                            <Check size={14} />
                          </ActionBtn>
                        )}
                        {(appt.status === 'confirmed' || appt.status === 'checked-in') && (
                          <ActionBtn title="Marcar como realizado" onClick={() => updateStatus(appt.id, 'completed')} className="text-emerald-600 hover:bg-emerald-50">
                            <CheckCircle size={14} />
                          </ActionBtn>
                        )}
                        <ActionBtn title="Remarcar" onClick={() => onReschedule(appt)} className="text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <CalendarDays size={14} />
                        </ActionBtn>
                        <ActionBtn title="Cancelar" onClick={() => updateStatus(appt.id, 'cancelled')} className="text-slate-400 hover:bg-red-50 hover:text-red-500">
                          <X size={14} />
                        </ActionBtn>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, title, className }: { children: React.ReactNode; onClick: () => void; title: string; className?: string }) {
  return (
    <button onClick={onClick} title={title} className={cn('w-7 h-7 rounded flex items-center justify-center transition-all', className)}>
      {children}
    </button>
  );
}

// ─── Mini Calendar (shared by RescheduleModal) ────────────────────────────────

function MiniCalendar({ selectedDate, onSelectDate }: { selectedDate: Date | null; onSelectDate: (d: Date) => void }) {
  const [viewDate, setViewDate] = useState(new Date());
  const today = new Date();
  const monthStart = startOfMonth(viewDate);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition-all"><ChevronLeft size={16} /></button>
        <span className="text-sm font-bold text-slate-900 capitalize">{format(viewDate, 'MMMM yyyy', { locale: ptBR })}</span>
        <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition-all"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 mb-2">
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-slate-300 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, i) => {
          const isPast = day < today && !isSameDay(day, today);
          const isSelected = !!selectedDate && isSameDay(day, selectedDate);
          return (
            <button
              key={i}
              onClick={() => !isPast && onSelectDate(day)}
              disabled={isPast}
              className={cn(
                'w-8 h-8 mx-auto flex items-center justify-center rounded text-xs font-bold transition-all',
                !isSameMonth(day, viewDate) && 'opacity-25',
                isPast && 'cursor-not-allowed opacity-25',
                isSelected ? 'bg-emerald-600 text-white' :
                isSameDay(day, today) ? 'bg-emerald-50 text-emerald-600' :
                'text-slate-700 hover:bg-slate-100'
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Reschedule Modal ─────────────────────────────────────────────────────────

function RescheduleModal({ appointment, patients, procedures, appointments, onClose, onSuccess }: {
  appointment: Appointment;
  patients: Record<string, Patient>;
  procedures: Record<string, ProfessionalService>;
  appointments: Appointment[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patient = patients[appointment.patientId];
  const proc    = procedures[appointment.serviceId];
  const durationMin = proc?.duration ?? 30;

  const availableSlots = useMemo(() => {
    if (!newDate) return [];
    const slots: string[] = [];
    for (let h = 8; h < 19; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (durationMin <= 30) slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    const taken = new Set<string>();
    appointments
      .filter(a => a.id !== appointment.id && a.professionalId === appointment.professionalId && a.status !== 'cancelled' && isSameDay(new Date(a.startTime), newDate))
      .forEach(a => {
        const d = new Date(a.startTime);
        taken.add(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      });
    return slots.filter(s => !taken.has(s));
  }, [newDate, appointments, appointment, durationMin]);

  const handleConfirm = async () => {
    if (!newDate || !newTime) return;
    setSaving(true);
    const [h, m] = newTime.split(':').map(Number);
    const start = new Date(newDate);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + durationMin * 60000);
    try {
      await api.put(`/api/appointments/${appointment.id}`, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: 'scheduled',
      });
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative bg-white w-full max-w-sm rounded shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remarcar consulta</p>
            <h3 className="text-base font-bold text-slate-900">{patient?.name ?? 'Paciente'}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded transition-all"><X size={18} className="text-slate-400" /></button>
        </div>

        {/* Current date info */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 shrink-0">
          <Clock size={13} className="text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500 font-medium">
            Agendado para: <strong className="text-slate-800">{format(new Date(appointment.startTime), "dd/MM 'às' HH:mm")}</strong>
            {proc && <> · {proc.name}</>}
          </span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* Calendar */}
          <MiniCalendar selectedDate={newDate} onSelectDate={d => { setNewDate(d); setNewTime(null); }} />

          {/* Time slots */}
          {newDate && (
            <div className="px-5 pb-5 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Horários — {format(newDate, "EEEE, dd/MM", { locale: ptBR })}
              </p>
              {availableSlots.length === 0 ? (
                <p className="text-sm text-slate-400 font-medium py-4 text-center">Nenhum horário disponível neste dia.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => setNewTime(slot)}
                      className={cn(
                        'py-2 rounded text-xs font-bold border transition-all',
                        newTime === slot ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'
                      )}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={handleConfirm}
            disabled={!newDate || !newTime || saving}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><CalendarCheck size={15} /> Confirmar remarcação</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Month Calendar ───────────────────────────────────────────────────────────

function MonthCalendar({ date, appointments, onSelectDate }: { date: Date; appointments: Appointment[]; onSelectDate: (d: Date) => void }) {
  const monthStart = startOfMonth(date);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });

  return (
    <div className="grid grid-cols-7 h-full">
      {['Dom','Seg','Ter','Qua','Qui','Sex','Sab'].map(d => (
        <div key={d} className="py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-r border-b border-slate-100 last:border-r-0">{d}</div>
      ))}
      {days.map((day, i) => {
        const dayApps = appointments.filter(a => isSameDay(new Date(a.startTime), day));
        return (
          <div key={i} onClick={() => onSelectDate(day)}
            className={cn('min-h-[120px] p-2 border-r border-b border-slate-50 hover:bg-slate-50 transition-all cursor-pointer group', !isSameMonth(day, monthStart) && 'opacity-30', isSameDay(day, new Date()) && 'bg-emerald-50/30')}
          >
            <span className={cn('text-xs font-bold inline-flex w-6 h-6 items-center justify-center rounded-full mb-1', isSameDay(day, new Date()) ? 'bg-emerald-600 text-white' : 'text-slate-400 group-hover:text-emerald-600')}>
              {format(day, 'd')}
            </span>
            <div className="space-y-1">
              {dayApps.slice(0, 3).map(a => (
                <div key={a.id} className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 truncate font-bold">
                  {format(new Date(a.startTime), 'HH:mm')}
                </div>
              ))}
              {dayApps.length > 3 && <p className="text-[9px] text-slate-300 font-bold">+{dayApps.length - 3}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Week Timeline ────────────────────────────────────────────────────────────

function WeekTimeline({ selectedDate, appointments, slotInterval, onSelectAppointment, onAddEvent }: {
  selectedDate: Date; appointments: Appointment[]; slotInterval: number;
  onSelectAppointment: (a: Appointment) => void; onAddEvent: (d: Date) => void;
}) {
  const startDate = startOfWeek(selectedDate);
  const days = eachDayOfInterval({ start: startDate, end: addDays(startDate, 6) });
  const startHour = 7, endHour = 20;
  const slots = Array.from({ length: (endHour - startHour) * (60 / slotInterval) }, (_, i) => ({
    hour: startHour + Math.floor(i * slotInterval / 60), minute: (i * slotInterval) % 60,
  }));

  return (
    <div className="flex flex-col h-full min-w-[900px]">
      <div className="grid grid-cols-8 sticky top-0 bg-white z-30 border-b border-slate-100">
        <div className="border-r border-slate-100 p-3 shrink-0 w-20 bg-slate-50" />
        {days.map((day, i) => (
          <div key={i} className="p-3 text-center border-r border-slate-100 last:border-r-0">
            <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">{format(day, 'eee', { locale: ptBR })}</span>
            <span className={cn('text-lg font-bold', isSameDay(day, new Date()) ? 'text-emerald-600' : 'text-slate-900')}>{format(day, 'dd')}</span>
          </div>
        ))}
      </div>
      <div className="flex-1">
        {slots.map((slot, i) => (
          <div key={i} className={cn('grid grid-cols-8 border-b border-slate-50', slotInterval === 30 ? 'h-20' : 'h-28')}>
            <div className="border-r border-slate-100 p-2 text-right w-20 bg-slate-50 flex items-start justify-end">
              <span className={cn('text-[10px] font-bold', slot.minute === 0 ? 'text-slate-400' : 'text-slate-200')}>
                {String(slot.hour).padStart(2,'0')}:{String(slot.minute).padStart(2,'0')}
              </span>
            </div>
            {days.map((day, di) => {
              const dayApps = appointments.filter(a => {
                const s = new Date(a.startTime);
                return isSameDay(s, day) && s.getHours() === slot.hour && s.getMinutes() === slot.minute;
              });
              return (
                <div key={di} onClick={() => { const d = new Date(day); d.setHours(slot.hour, slot.minute, 0, 0); onAddEvent(d); }}
                  className="border-r border-slate-50 relative p-0.5 hover:bg-emerald-50/20 transition-all cursor-crosshair"
                >
                  {dayApps.map(a => (
                    <div key={a.id} onClick={e => { e.stopPropagation(); onSelectAppointment(a); }}
                      className="absolute inset-x-1 top-1 bottom-1 bg-emerald-600 text-white rounded p-2 z-10 cursor-pointer hover:bg-emerald-700 transition-all"
                    >
                      <p className="text-[9px] font-bold">{format(new Date(a.startTime), 'HH:mm')}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Day Timeline ─────────────────────────────────────────────────────────────

function DayTimeline({ selectedDate, appointments, patients, professionals, procedures, slotInterval, onSelectAppointment, onAddEvent }: {
  selectedDate: Date; appointments: Appointment[]; patients: any; professionals: any; procedures: any;
  slotInterval: number; onSelectAppointment: (a: Appointment) => void; onAddEvent: (d: Date) => void;
}) {
  const startHour = 7, endHour = 21, hourHeight = 120;
  const slots = Array.from({ length: (endHour - startHour) * (60 / slotInterval) }, (_, i) => ({
    hour: startHour + Math.floor(i * slotInterval / 60), minute: (i * slotInterval) % 60,
  }));
  const dayApps = appointments.filter(a => isSameDay(new Date(a.startTime), selectedDate));

  return (
    <div className="flex h-full min-h-[1600px] relative bg-white">
      <div className="w-20 border-r border-slate-100 bg-slate-50 flex flex-col shrink-0">
        {slots.map((slot, i) => (
          <div key={i} style={{ height: (slotInterval / 60) * hourHeight }} className="p-2 text-right border-b border-white/50 flex items-start justify-end">
            <span className={cn('text-[10px] font-bold', slot.minute === 0 ? 'text-slate-400' : 'text-slate-200')}>
              {String(slot.hour).padStart(2,'0')}:{String(slot.minute).padStart(2,'0')}
            </span>
          </div>
        ))}
      </div>
      <div className="flex-1 relative">
        {slots.map((slot, i) => (
          <div key={i} onClick={() => { const d = new Date(selectedDate); d.setHours(slot.hour, slot.minute, 0, 0); onAddEvent(d); }}
            style={{ height: (slotInterval / 60) * hourHeight }}
            className="border-b border-slate-50 w-full relative group hover:bg-emerald-50/10 transition-all cursor-crosshair"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none">
              <div className="px-3 py-1.5 bg-emerald-600 text-white rounded text-[10px] font-bold shadow-sm flex items-center gap-1.5">
                <Plus size={11} />{String(slot.hour).padStart(2,'0')}:{String(slot.minute).padStart(2,'0')}
              </div>
            </div>
          </div>
        ))}
        {isSameDay(selectedDate, new Date()) && (
          <div className="absolute left-0 right-0 border-t-2 border-red-400 z-40 pointer-events-none flex items-center"
            style={{ top: ((new Date().getHours() - startHour) * hourHeight) + (new Date().getMinutes() / 60) * hourHeight }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 -ml-1.5" />
          </div>
        )}
        {dayApps.map(app => {
          const start = new Date(app.startTime);
          const top = ((start.getHours() - startHour) * hourHeight) + (start.getMinutes() / 60) * hourHeight;
          const proc = procedures[app.serviceId];
          const patient = patients[app.patientId];
          const prof = professionals[app.professionalId];
          const duration = proc?.duration ?? 30;
          const height = (duration / 60) * hourHeight;

          return (
            <motion.div key={app.id} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              onClick={() => onSelectAppointment(app)}
              style={{ top, height: Math.max(height, 50) }}
              className={cn('absolute left-3 right-3 p-3 bg-white border border-slate-200 rounded shadow-sm flex flex-col justify-between group hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer z-20 overflow-hidden', app.status === 'cancelled' && 'opacity-40 grayscale')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold', app.status === 'confirmed' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500')}>
                    {patient?.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <h5 className="font-bold text-slate-900 text-sm truncate group-hover:text-emerald-700 transition-colors">{patient?.name ?? '…'}</h5>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">{proc?.name ?? 'Serviço'}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 shrink-0">{format(start, 'HH:mm')}</span>
              </div>
              {height > 80 && (
                <div className="flex items-center gap-4 pt-2 border-t border-slate-100 mt-2">
                  <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1"><User size={10} />{prof?.name?.split(' ')[0]}</span>
                  <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1"><Clock size={10} />{duration}min</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Appointment Detail Drawer ────────────────────────────────────────────────

function AppointmentDetailDrawer({ appointment, patient, professional, procedure, onClose, onAction, onEdit, onReschedule }: {
  appointment: Appointment; patient: any; professional: any; procedure: any;
  onClose: () => void; onAction: () => void; onEdit: () => void; onReschedule: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const updateStatus = async (status: string) => {
    setLoading(true);
    try { await api.put(`/api/appointments/${appointment.id}`, { status }); onAction(); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
    setLoading(true);
    try { await api.delete(`/api/appointments/${appointment.id}`); onAction(); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const st = STATUS_MAP[appointment.status] ?? STATUS_MAP.scheduled;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col border-l border-slate-200"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Detalhes</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded text-slate-400 transition-all"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 text-xl font-bold">
              {patient?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">{patient?.name ?? 'Paciente'}</h4>
              {patient?.phone && <a href={`tel:${patient.phone}`} className="text-sm font-medium text-emerald-600 hover:underline">{patient.phone}</a>}
            </div>
          </div>

          <div className="bg-slate-50 rounded p-4 border border-slate-100 space-y-3">
            <div className="flex justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horário</p>
                <p className="font-bold text-slate-900 mt-0.5 flex items-center gap-1.5"><Clock size={14} className="text-emerald-500" />{format(new Date(appointment.startTime), 'HH:mm')}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duração</p>
                <p className="font-bold text-slate-900 mt-0.5">{procedure?.duration ?? 30} min</p>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procedimento</p>
              <p className="font-bold text-slate-700 mt-0.5 flex items-center gap-1.5"><Briefcase size={14} className="text-slate-400" />{procedure?.name ?? '—'}</p>
            </div>
            <div className="pt-3 border-t border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Profissional</p>
              <p className="font-bold text-slate-700 mt-0.5 flex items-center gap-1.5"><User size={14} className="text-slate-400" />{professional?.name ?? 'Não atribuído'}</p>
            </div>
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest', st.bg, st.text)}>{st.label}</span>
            </div>
          </div>

          {appointment.notes && (
            <div className="bg-emerald-50 p-4 rounded border border-emerald-100">
              <div className="flex items-center gap-1.5 mb-2"><FileText size={13} className="text-emerald-500" /><span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Observações</span></div>
              <p className="text-sm text-slate-600 leading-relaxed italic">"{appointment.notes}"</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => updateStatus('confirmed')} disabled={loading || appointment.status === 'confirmed' || appointment.status === 'completed'}
              className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded font-bold text-sm hover:bg-emerald-700 transition-all disabled:opacity-40"
            ><CheckCircle size={15} /> Confirmar</button>
            <button onClick={() => updateStatus('completed')} disabled={loading || appointment.status === 'completed' || appointment.status === 'cancelled'}
              className="flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-40"
            ><Check size={15} /> Realizar</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onReschedule}
              className="flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 rounded font-bold text-sm hover:bg-slate-50 transition-all"
            ><CalendarDays size={14} /> Remarcar</button>
            <button onClick={() => updateStatus('cancelled')} disabled={loading || appointment.status === 'cancelled'}
              className="flex items-center justify-center gap-2 py-2.5 bg-white border border-red-100 text-red-500 rounded font-bold text-sm hover:bg-red-50 transition-all disabled:opacity-40"
            ><X size={14} /> Cancelar</button>
          </div>
          <button onClick={handleDelete} className="w-full flex items-center justify-center gap-1.5 py-2 text-slate-400 hover:text-red-500 transition-all rounded font-bold text-xs">
            <Trash2 size={13} /> Excluir permanentemente
          </button>
        </div>
      </motion.div>
    </div>
  );
}
