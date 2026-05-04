import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Briefcase,
  LayoutGrid,
  CalendarDays,
  CalendarRange,
  Plus,
  X,
  Edit2,
  Trash2,
  CalendarClock,
  CheckCircle,
  FileText,
  Phone,
  Mail,
  Eye,
  Sun,
  Sunset,
  Search,
  CalendarCheck,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Appointment, Patient, Professional, ProfessionalService, AppointmentStatus } from '../types';
import { 
  format, 
  addDays, 
  subDays, 
  startOfDay, 
  isSameDay, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { NewAppointmentModal } from './NewAppointmentModal';

interface AgendaViewProps {
  clinicId: string;
}

type ViewMode = 'month' | 'week' | 'day' | 'focus';

export function AgendaView({ clinicId }: AgendaViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Record<string, Patient>>({});
  const [professionals, setProfessionals] = useState<Record<string, Professional>>({});
  const [procedures, setProcedures] = useState<Record<string, ProfessionalService>>({});
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [profFilter, setProfFilter] = useState('all');
  const [slotInterval, setSlotInterval] = useState(30);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setLoading(true);
    const dateQuery = query(
      collection(db, 'appointments'),
      where('clinicId', '==', clinicId),
      orderBy('startTime', 'asc')
    );

    const unsub = onSnapshot(dateQuery, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(apps);
      setLoading(false);
    });

    const fetchMasterData = async () => {
      const [patSnap, profSnap] = await Promise.all([
        getDocs(query(collection(db, 'patients'), where('clinicId', '==', clinicId))),
        getDocs(query(collection(db, 'professionals'), where('clinicId', '==', clinicId)))
      ]);

      const patMap: Record<string, Patient> = {};
      patSnap.forEach(d => patMap[d.id] = { id: d.id, ...d.data() } as Patient);
      setPatients(patMap);

      const profMap: Record<string, Professional> = {};
      const procMap: Record<string, any> = {};
      
      profSnap.forEach(d => {
        const prof = { id: d.id, ...d.data() } as Professional;
        profMap[d.id] = prof;
        
        if (prof.services) {
          prof.services.forEach(svc => {
            procMap[svc.id] = svc;
          });
        }
      });
      
      setProfessionals(profMap);
      setProcedures(procMap);
    };

    fetchMasterData();
    return () => unsub();
  }, [clinicId]);

  const handlePrev = () => {
    if (viewMode === 'month') setSelectedDate(subMonths(selectedDate, 1));
    else if (viewMode === 'week') setSelectedDate(subDays(selectedDate, 7));
    else setSelectedDate(subDays(selectedDate, 1));
  };

  const handleNext = () => {
    if (viewMode === 'month') setSelectedDate(addMonths(selectedDate, 1));
    else if (viewMode === 'week') setSelectedDate(addDays(selectedDate, 7));
    else setSelectedDate(addDays(selectedDate, 1));
  };

  const isFocusMode = viewMode === 'focus';

  if (isFocusMode) {
    return (
      <>
        <FocusMode
          selectedDate={selectedDate}
          appointments={profFilter === 'all' ? appointments : appointments.filter(a => a.professionalId === profFilter)}
          patients={patients}
          professionals={professionals}
          procedures={procedures}
          professionalsList={Object.values(professionals)}
          profFilter={profFilter}
          setProfFilter={setProfFilter}
          loading={loading}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={() => setSelectedDate(new Date())}
          onExit={() => setViewMode('day')}
          onNew={() => setIsModalOpen(true)}
          onEdit={(app) => {
            setSelectedAppointment(app);
            setIsEditing(true);
          }}
          onSelectAppointment={(app) => {
            setSelectedAppointment(app);
            setIsDetailOpen(true);
          }}
        />
        <AnimatePresence>
          {(isModalOpen || isEditing) && (
            <NewAppointmentModal
              clinicId={clinicId}
              initialDate={selectedDate}
              existingAppointment={isEditing ? selectedAppointment! : undefined}
              onClose={() => { setIsModalOpen(false); setIsEditing(false); }}
              onSuccess={() => { setIsModalOpen(false); setIsEditing(false); setIsDetailOpen(false); }}
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
              onAction={() => setIsDetailOpen(false)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Agenda</h1>
          <p className="text-slate-400 font-medium text-xs">Organize seus horários com visões flexíveis.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg">
            <ViewTab active={viewMode === 'month'} onClick={() => setViewMode('month')} icon={<LayoutGrid size={14} />} label="Mês" />
            <ViewTab active={viewMode === 'week'} onClick={() => setViewMode('week')} icon={<CalendarRange size={14} />} label="Semana" />
            <ViewTab active={viewMode === 'day'} onClick={() => setViewMode('day')} icon={<CalendarDays size={14} />} label="Dia" />
            <ViewTab active={false} onClick={() => setViewMode('focus')} icon={<Eye size={14} />} label="Foco" />
          </div>

          <div className="flex items-center bg-white border border-slate-100 p-1 rounded-lg gap-2 shadow-sm">
            <button onClick={handlePrev} className="p-2 hover:bg-slate-50 rounded-md transition-all text-slate-400">
              <ChevronLeft size={16} />
            </button>
            <div className="px-3 py-1 text-center min-w-[120px]">
              <span className="font-semibold text-slate-900 text-sm">
                {viewMode === 'month' 
                  ? format(selectedDate, 'MMMM yyyy', { locale: ptBR })
                  : format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              </span>
            </div>
            <button onClick={handleNext} className="p-2 hover:bg-slate-50 rounded-md transition-all text-slate-400">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Slot Interval Selector */}
          {(viewMode === 'day' || viewMode === 'week') && (
            <div className="flex items-center bg-slate-100 p-1 rounded-lg">
              {[15, 30, 60].map((interval) => (
                <button
                  key={interval}
                  onClick={() => setSlotInterval(interval)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all",
                    slotInterval === interval ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {interval}m
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm overflow-x-auto no-scrollbar">
         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Filtrar Equipe:</span>
         <div className="flex items-center gap-2">
            <button 
              onClick={() => setProfFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap",
                profFilter === 'all' ? "bg-slate-900 border-slate-900 text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
              )}
            >
              Todos
            </button>
            {(Object.entries(professionals) as [string, Professional][]).map(([id, prof]) => (
              <button
                key={id}
                onClick={() => setProfFilter(id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap flex items-center gap-2",
                  profFilter === id ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", profFilter === id ? "bg-white" : "bg-emerald-500")} />
                {prof.name}
              </button>
            ))}
         </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-[calc(100vh-280px)] min-h-[600px] flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            {viewMode === 'month' && (
              <MonthCalendar 
                date={selectedDate} 
                appointments={profFilter === 'all' ? appointments : appointments.filter(a => a.professionalId === profFilter)} 
                onSelectDate={(d) => { setSelectedDate(d); setViewMode('day'); }} 
              />
            )}
            {viewMode === 'week' && (
              <WeekTimeline 
                selectedDate={selectedDate} 
                appointments={profFilter === 'all' ? appointments : appointments.filter(a => a.professionalId === profFilter)}
                slotInterval={slotInterval}
                onSelectAppointment={(app) => {
                  setSelectedAppointment(app);
                  setIsDetailOpen(true);
                }}
                onAddEvent={(date) => {
                  setSelectedDate(date);
                  setIsModalOpen(true);
                }}
              />
            )}
            {viewMode === 'day' && (
              <DayTimeline 
                selectedDate={selectedDate} 
                appointments={profFilter === 'all' ? appointments : appointments.filter(a => a.professionalId === profFilter)}
                patients={patients}
                professionals={professionals}
                procedures={procedures}
                slotInterval={slotInterval}
                onSelectAppointment={(app) => {
                  setSelectedAppointment(app);
                  setIsDetailOpen(true);
                }}
                onAddEvent={(date) => {
                  setSelectedDate(date);
                  setIsModalOpen(true);
                }}
              />
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {(isModalOpen || isEditing) && (
          <NewAppointmentModal 
            clinicId={clinicId} 
            initialDate={selectedDate}
            existingAppointment={isEditing ? selectedAppointment! : undefined}
            onClose={() => {
              setIsModalOpen(false);
              setIsEditing(false);
            }} 
            onSuccess={() => {
              setIsModalOpen(false);
              setIsEditing(false);
              setIsDetailOpen(false);
            }} 
          />
        )}
        {isDetailOpen && selectedAppointment && (
          <AppointmentDetailDrawer
            appointment={selectedAppointment}
            patient={patients[selectedAppointment.patientId]}
            professional={professionals[selectedAppointment.professionalId]}
            procedure={procedures[selectedAppointment.serviceId]}
            onClose={() => setIsDetailOpen(false)}
            onEdit={() => {
              setIsEditing(true);
              setIsDetailOpen(false);
            }}
            onAction={() => {
              setIsDetailOpen(false);
              // handle refresh if needed
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewTab({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-all",
        active ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function MonthCalendar({ date, appointments, onSelectDate }: { date: Date, appointments: Appointment[], onSelectDate: (d: Date) => void }) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div className="grid grid-cols-7 h-full">
      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(day => (
        <div key={day} className="py-3 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest bg-slate-50/50 border-r border-b border-slate-100 last:border-r-0">
          {day}
        </div>
      ))}
      <div className="contents">
        {days.map((day, i) => {
          const dayApps = appointments.filter(app => isSameDay(new Date(app.startTime), day));
          return (
            <div 
              key={`month-day-${day.toISOString()}-${i}`} 
              onClick={() => onSelectDate(day)}
              className={cn(
                "min-h-[120px] p-2 border-r border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer group",
                !isSameMonth(day, monthStart) && "bg-slate-50/20 opacity-40",
                isSameDay(day, new Date()) && "bg-emerald-50/10"
              )}
            >
              <span className={cn(
                 "text-xs font-medium inline-block w-6 h-6 text-center leading-6 rounded-full mb-1 transition-colors",
                 isSameDay(day, new Date()) ? "bg-emerald-600 text-white" : "text-slate-400 group-hover:text-emerald-500"
              )}>
                {format(day, 'd')}
              </span>
              <div className="space-y-1">
                {dayApps.slice(0, 3).map(app => (
                  <div key={`month-app-${app.id}`} className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 truncate font-medium">
                    {format(new Date(app.startTime), 'HH:mm')}
                  </div>
                ))}
                {dayApps.length > 3 && (
                  <p className="text-[9px] text-slate-400 font-medium pl-1">+ {dayApps.length - 3} mais</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekTimeline({ selectedDate, appointments, slotInterval, onSelectAppointment, onAddEvent }: { selectedDate: Date, appointments: Appointment[], slotInterval: number, onSelectAppointment: (app: Appointment) => void, onAddEvent: (d: Date) => void }) {
  const startDate = startOfWeek(selectedDate);
  const days = eachDayOfInterval({ start: startDate, end: addDays(startDate, 6) });
  
  const startHour = 7;
  const endHour = 20;
  const totalSlots = (endHour - startHour) * (60 / slotInterval);
  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const totalMinutes = i * slotInterval;
    const hour = startHour + Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return { hour, minute };
  });

  return (
    <div className="flex flex-col h-full min-w-[800px]">
      <div className="grid grid-cols-8 sticky top-0 bg-white z-30 border-b border-slate-100">
        <div className="border-r border-slate-100 p-4 shrink-0 w-20" />
        {days.map((day, i) => (
          <div key={`week-header-${day.toISOString()}-${i}`} className="p-4 text-center border-r border-slate-100 last:border-r-0">
             <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{format(day, 'eee', { locale: ptBR })}</span>
             <span className={cn("text-lg font-semibold", isSameDay(day, new Date()) ? "text-emerald-600" : "text-slate-900")}>
               {format(day, 'dd')}
             </span>
          </div>
        ))}
      </div>
      <div className="flex-1">
        {slots.map((slot, i) => (
          <div key={`week-row-${slot.hour}-${slot.minute}-${i}`} className={cn("grid grid-cols-8 border-b border-slate-50 group", slotInterval === 15 ? "h-12" : slotInterval === 30 ? "h-16" : "h-20")}>
             <div className="border-r border-slate-100 p-2 text-right w-20 bg-slate-50/50 sticky left-0 z-20">
                {slot.minute === 0 ? (
                  <span className="text-[10px] font-bold text-slate-400">{slot.hour.toString().padStart(2, '0')}:00</span>
                ) : (
                  <span className="text-[8px] font-bold text-slate-200">{slot.hour.toString().padStart(2, '0')}:{slot.minute.toString().padStart(2, '0')}</span>
                )}
             </div>
             {days.map((day, di) => {
               const dayApps = appointments.filter(app => {
                 const start = new Date(app.startTime);
                 return isSameDay(start, day) && start.getHours() === slot.hour && start.getMinutes() === slot.minute;
               });
               return (
                 <div 
                   key={`week-slot-${slot.hour}-${slot.minute}-${day.toISOString()}-${di}`} 
                   onClick={() => {
                      const d = new Date(day);
                      d.setHours(slot.hour, slot.minute, 0, 0);
                      onAddEvent(d);
                   }}
                   className="border-r border-slate-50 relative p-1 hover:bg-emerald-50/20 transition-colors cursor-crosshair group/cell"
                 >
                   <div className="absolute inset-0 opacity-0 group-hover/cell:opacity-100 flex items-center justify-center pointer-events-none">
                      <Plus size={12} className="text-emerald-300" />
                   </div>
                   {dayApps.map(app => (
                     <div 
                       key={`week-app-${app.id}`} 
                       onClick={(e) => {
                         e.stopPropagation();
                         onSelectAppointment(app);
                       }}
                       className="absolute inset-x-1 top-1 bottom-1 bg-emerald-600 text-white rounded p-1.5 z-10 shadow-sm text-left overflow-hidden cursor-pointer hover:bg-emerald-700 transition-colors"
                     >
                        <p className="text-[9px] font-bold leading-none mb-1">
                          {format(new Date(app.startTime), 'HH:mm')}
                        </p>
                        <p className="text-[8px] font-medium opacity-80 leading-none truncate">Agendado</p>
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

function DayTimeline({ selectedDate, appointments, patients, professionals, procedures, slotInterval, onSelectAppointment, onAddEvent }: { selectedDate: Date, appointments: Appointment[], patients: any, professionals: any, procedures: any, slotInterval: number, onSelectAppointment: (app: Appointment) => void, onAddEvent: (d: Date) => void }) {
  const startHour = 7;
  const endHour = 21;
  const hourHeight = 96;
  const totalSlots = (endHour - startHour) * (60 / slotInterval);
  
  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const totalMinutes = i * slotInterval;
    const hour = startHour + Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return { hour, minute };
  });

  const dayApps = appointments.filter(app => isSameDay(new Date(app.startTime), selectedDate));

  return (
    <div className="flex h-full min-h-[1440px] relative">
      <div className="w-24 border-r border-slate-100 bg-slate-50/50 flex flex-col shrink-0">
        {slots.map((slot, i) => (
          <div 
            key={`day-time-${slot.hour}-${slot.minute}-${i}`} 
            style={{ height: (slotInterval / 60) * hourHeight }}
            className="p-4 text-right border-b border-white flex items-start justify-end"
          >
            {slot.minute === 0 ? (
              <span className="text-[10px] font-bold text-slate-400">{slot.hour.toString().padStart(2, '0')}:00</span>
            ) : (
              <span className="text-[8px] font-bold text-slate-200">{slot.hour.toString().padStart(2, '0')}:{slot.minute.toString().padStart(2, '0')}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex-1 relative">
        {/* Timeline body */}
        {slots.map((slot, i) => (
          <div 
            key={`day-slot-${slot.hour}-${slot.minute}-${i}`} 
            onClick={() => {
               const d = new Date(selectedDate);
               d.setHours(slot.hour, slot.minute, 0, 0);
               onAddEvent(d);
            }}
            style={{ height: (slotInterval / 60) * hourHeight }}
            className="border-b border-slate-50 w-full relative group hover:bg-emerald-50/10 transition-colors cursor-crosshair"
          >
             <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                <div className="px-3 py-1 bg-emerald-100 rounded-full text-emerald-600 text-[10px] font-bold flex items-center gap-2">
                   <Plus size={10} />
                   Agendar {slot.hour}:{slot.minute.toString().padStart(2, '0')}
                </div>
             </div>
          </div>
        ))}

        {/* Current Time Indicator */}
        {isSameDay(selectedDate, new Date()) && (
          <div 
            className="absolute left-0 right-0 border-t-2 border-red-400 z-30 pointer-events-none flex items-center"
            style={{ 
              top: ((new Date().getHours() - startHour) * hourHeight) + (new Date().getMinutes() / 60) * hourHeight 
            }}
          >
            <div className="w-2 h-2 rounded-full bg-red-400 -ml-1" />
            <div className="px-1.5 py-0.5 bg-red-400 text-white text-[8px] font-bold rounded -ml-1 uppercase tracking-widest">Agora</div>
          </div>
        )}

        {/* Appointments Blocks */}
        {dayApps.map(app => {
          const start = new Date(app.startTime);
          const topPercent = ((start.getHours() - startHour) * hourHeight) + (start.getMinutes() / 60) * hourHeight;
          const patient = patients[app.patientId];
          const prof = professionals[app.professionalId];
          const proc = procedures[app.serviceId];
          const duration = proc?.duration || 30;
          const height = (duration / 60) * hourHeight;

          return (
            <motion.div 
              key={`day-app-${app.id}`}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              onClick={() => onSelectAppointment(app)}
              style={{ 
                top: topPercent,
                height: Math.max(height, 40)
              }}
              className={cn(
                "absolute left-4 right-4 p-3 bg-white border border-slate-100 rounded-lg shadow-sm ring-1 ring-slate-50 flex flex-col justify-between group hover:shadow-xl hover:border-emerald-200 transition-all cursor-pointer z-20 overflow-hidden",
                app.status === 'cancelled' && "opacity-50 grayscale"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                 <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      app.status === 'confirmed' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                    )}>
                       <User size={14} />
                    </div>
                    <div className="min-w-0">
                       <h5 className="font-bold text-slate-900 text-xs truncate group-hover:text-emerald-700">{patient?.name || '...'}</h5>
                       <p className="text-[9px] text-slate-400 font-medium truncate">{proc?.name || 'Procedimento'}</p>
                    </div>
                 </div>
                 <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-900">{format(start, 'HH:mm')}</span>
                    <p className={cn(
                      "text-[8px] font-bold leading-none mt-1 uppercase tracking-widest",
                      app.status === 'confirmed' ? "text-emerald-500" : 
                      app.status === 'cancelled' ? "text-red-400" : "text-slate-400"
                    )}>
                      {app.status === 'confirmed' ? 'Confirmado' : 
                       app.status === 'cancelled' ? 'Cancelado' : 'Agendado'}
                    </p>
                 </div>
              </div>
              
              {height > 60 && (
                <div className="flex items-center gap-4 pt-2 border-t border-slate-50 mt-2">
                   <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                      <User size={10} className="text-emerald-500/50" />
                      {prof?.name?.split(' ')[0]}
                   </div>
                   <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                      <Clock size={10} className="text-emerald-500/50" />
                      {duration} min
                   </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentDetailDrawer({ appointment, patient, professional, procedure, onClose, onAction, onEdit }: { 
  appointment: Appointment, 
  patient: any, 
  professional: any, 
  procedure: any, 
  onClose: () => void,
  onAction: () => void,
  onEdit: () => void
}) {
  const [loading, setLoading] = useState(false);

  const handleStatusUpdate = async (status: string) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'appointments', appointment.id), { status });
      onAction();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'appointments', appointment.id));
      onAction();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
       <motion.div 
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}
         onClick={onClose}
         className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
       />
       <motion.div 
         initial={{ x: '100%' }}
         animate={{ x: 0 }}
         exit={{ x: '100%' }}
         transition={{ type: 'spring', damping: 25, stiffness: 200 }}
         className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
       >
          <div className="flex items-center justify-between p-6 border-b border-slate-50">
             <h3 className="text-lg font-bold text-slate-900">Detalhes do Agendamento</h3>
             <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
             {/* Patient Info */}
             <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                   <User size={32} />
                </div>
                <div className="space-y-1">
                   <h4 className="text-xl font-bold text-slate-900">{patient?.name || 'Paciente sem nome'}</h4>
                   <div className="flex items-center gap-3">
                      <a href={`tel:${patient?.phone}`} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 font-medium transition-colors">
                         <Phone size={12} />
                         {patient?.phone}
                      </a>
                      {patient?.email && (
                        <a href={`mailto:${patient?.email}`} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 font-medium transition-colors">
                           <Mail size={12} />
                           E-mail
                        </a>
                      )}
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   <CalendarIcon size={64} />
                </div>
                <div className="space-y-1 relative">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horário</span>
                   <p className="font-bold text-slate-900 flex items-center gap-2">
                      <Clock size={14} className="text-emerald-500" />
                      {format(new Date(appointment.startTime), "HH:mm")}
                   </p>
                </div>
                <div className="space-y-1 relative text-right">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duração</span>
                   <p className="font-bold text-slate-900">{procedure?.duration} min</p>
                </div>
                <div className="space-y-1 relative">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procedimento</span>
                   <p className="font-bold text-slate-900 flex items-center gap-2">
                      <Briefcase size={14} className="text-emerald-500" />
                      {procedure?.name}
                   </p>
                </div>
                <div className="space-y-1 relative text-right">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preço</span>
                   <p className="font-bold text-emerald-600">R$ {appointment.price || procedure?.price}</p>
                </div>
             </div>

             <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                      <User size={16} />
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Profissional</p>
                      <p className="text-sm font-bold text-slate-900">{professional?.name}</p>
                   </div>
                </div>
                {appointment.notes && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                       <FileText size={14} className="text-slate-400" />
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observações</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{appointment.notes}</p>
                  </div>
                )}
             </div>
          </div>

          <div className="p-8 border-t border-slate-50 space-y-4 bg-slate-50/30">
             {/* Quick Actions */}
             <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleStatusUpdate('confirmed')}
                  disabled={loading || appointment.status === 'confirmed'}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                >
                   <CheckCircle size={18} />
                   Confirmar
                </button>
                <button 
                  onClick={() => handleStatusUpdate('cancelled')}
                  disabled={loading || appointment.status === 'cancelled'}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-red-100 text-red-500 rounded-xl font-bold text-sm hover:bg-red-50 transition-all active:scale-95 disabled:opacity-50"
                >
                   <X size={18} />
                   Cancelar
                </button>
             </div>
             
             <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={onEdit}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-slate-100 text-slate-900 rounded-xl font-bold text-sm hover:border-slate-200 hover:bg-slate-50 transition-all active:scale-95"
                >
                   <Edit2 size={16} className="text-slate-400" />
                   Editar Dados
                </button>
                <button 
                  onClick={onEdit}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-slate-100 text-emerald-600 rounded-xl font-bold text-sm hover:border-emerald-200 hover:bg-emerald-50 transition-all active:scale-95"
                >
                   <CalendarClock size={16} />
                   Remarcar Paciente
                </button>
                <button 
                   onClick={handleDelete}
                   disabled={loading}
                   className="w-full flex items-center justify-center gap-3 px-4 py-3 text-red-400 hover:text-red-500 rounded-xl font-bold text-xs transition-all opacity-60 hover:opacity-100 mt-2"
                >
                   <Trash2 size={14} />
                   Excluir Permanente
                </button>
             </div>
          </div>
       </motion.div>
    </div>
  );
}

interface FocusModeProps {
  selectedDate: Date;
  appointments: Appointment[];
  patients: Record<string, Patient>;
  professionals: Record<string, Professional>;
  procedures: Record<string, ProfessionalService>;
  professionalsList: Professional[];
  profFilter: string;
  setProfFilter: (id: string) => void;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onExit: () => void;
  onNew: () => void;
  onEdit: (a: Appointment) => void;
  onSelectAppointment: (a: Appointment) => void;
}

function FocusMode({
  selectedDate,
  appointments,
  patients,
  professionals,
  procedures,
  professionalsList,
  profFilter,
  setProfFilter,
  loading,
  onPrev,
  onNext,
  onToday,
  onExit,
  onNew,
  onEdit,
  onSelectAppointment,
}: FocusModeProps) {
  const [search, setSearch] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dayApps = appointments
    .filter((a) => isSameDay(new Date(a.startTime), selectedDate))
    .filter((a) => (showCancelled ? true : a.status !== 'cancelled'))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const term = search.trim().toLowerCase();
  const filteredApps = term
    ? dayApps.filter((a) => {
        const patient = patients[a.patientId];
        const prof = professionals[a.professionalId];
        const service = procedures[a.serviceId];
        return (
          patient?.name?.toLowerCase().includes(term) ||
          patient?.phone?.toLowerCase().includes(term) ||
          prof?.name?.toLowerCase().includes(term) ||
          service?.name?.toLowerCase().includes(term)
        );
      })
    : dayApps;

  const morning = filteredApps.filter((a) => new Date(a.startTime).getHours() < 12);
  const afternoon = filteredApps.filter((a) => new Date(a.startTime).getHours() >= 12);

  const isToday = isSameDay(selectedDate, new Date());

  const updateStatus = async (a: Appointment, status: AppointmentStatus) => {
    setBusyId(a.id);
    try {
      await updateDoc(doc(db, 'appointments', a.id), {
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[focus] status update failed', e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-white overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-10 md:py-16">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase tracking-[0.25em]">
            <Eye size={14} /> Modo Foco
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onNew}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-widest transition-colors active:scale-95"
            >
              <Plus size={14} /> Novo
            </button>
            <button
              onClick={onExit}
              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest"
            >
              <X size={14} /> Sair
            </button>
          </div>
        </div>

        {/* Date header */}
        <div className="flex flex-col items-center text-center mb-8">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-3">
            {isToday ? 'Hoje' : format(selectedDate, 'EEEE', { locale: ptBR })}
          </span>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter text-slate-900 mb-2">
            {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
          </h1>
          <p className="text-sm text-slate-400 font-medium">
            {filteredApps.length}{' '}
            {filteredApps.length === 1 ? 'paciente' : 'pacientes'}
            {term ? ` encontrado${filteredApps.length === 1 ? '' : 's'}` : ' agendados'}
          </p>
        </div>

        {/* Date nav */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button onClick={onPrev} className="w-10 h-10 rounded-full border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 text-slate-400 flex items-center justify-center transition-colors">
            <ChevronLeft size={18} />
          </button>
          {!isToday && (
            <button onClick={onToday} className="px-4 h-10 rounded-full border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 text-slate-500 text-xs font-bold uppercase tracking-widest transition-colors">
              Hoje
            </button>
          )}
          <button onClick={onNext} className="w-10 h-10 rounded-full border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 text-slate-400 flex items-center justify-center transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
            <Search size={16} />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar paciente, telefone, profissional ou serviço…"
            className="w-full pl-11 pr-10 py-3 bg-slate-50 border border-slate-100 focus:bg-white focus:border-emerald-500 rounded-xl outline-none text-sm font-medium text-slate-900 placeholder:text-slate-300 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-700 rounded"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap mb-12">
          {professionalsList.length > 1 && (
            <>
              <button
                onClick={() => setProfFilter('all')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all',
                  profFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-900'
                )}
              >
                Todos
              </button>
              {professionalsList.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProfFilter(p.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all',
                    profFilter === p.id ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-900'
                  )}
                >
                  {p.name}
                </button>
              ))}
              <span className="w-px h-5 bg-slate-100 mx-2" />
            </>
          )}
          <button
            onClick={() => setShowCancelled((v) => !v)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all',
              showCancelled ? 'bg-rose-100 text-rose-700' : 'bg-slate-50 text-slate-400 hover:text-slate-900'
            )}
          >
            {showCancelled ? 'Mostrando cancelados' : 'Ocultar cancelados'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-slate-50 rounded-full mx-auto mb-6 flex items-center justify-center text-slate-300">
              {term ? <Search size={28} /> : <CalendarIcon size={28} />}
            </div>
            <p className="text-slate-400 font-medium">
              {term ? 'Nenhum resultado encontrado.' : 'Nenhum atendimento para este dia.'}
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            <FocusPeriodList
              label="Manhã"
              icon={<Sun size={14} />}
              items={morning}
              patients={patients}
              professionals={professionals}
              procedures={procedures}
              busyId={busyId}
              onOpen={onSelectAppointment}
              onEdit={onEdit}
              onUpdateStatus={updateStatus}
            />
            <FocusPeriodList
              label="Tarde / Noite"
              icon={<Sunset size={14} />}
              items={afternoon}
              patients={patients}
              professionals={professionals}
              procedures={procedures}
              busyId={busyId}
              onOpen={onSelectAppointment}
              onEdit={onEdit}
              onUpdateStatus={updateStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FocusPeriodList({
  label,
  icon,
  items,
  patients,
  professionals,
  procedures,
  busyId,
  onOpen,
  onEdit,
  onUpdateStatus,
}: {
  label: string;
  icon: any;
  items: Appointment[];
  patients: Record<string, Patient>;
  professionals: Record<string, Professional>;
  procedures: Record<string, ProfessionalService>;
  busyId: string | null;
  onOpen: (a: Appointment) => void;
  onEdit: (a: Appointment) => void;
  onUpdateStatus: (a: Appointment, status: AppointmentStatus) => void | Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.25em] flex items-center gap-2">
            {icon} {label}
          </span>
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-[10px] font-bold text-slate-300">0</span>
        </div>
        <p className="text-sm text-slate-300 italic px-1">Nada agendado.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.25em] flex items-center gap-2">
          {icon} {label}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
      </div>
      <div className="divide-y divide-slate-50">
        {items.map((a) => (
          <FocusItemRow
            key={a.id}
            appointment={a}
            patient={patients[a.patientId]}
            professional={professionals[a.professionalId]}
            service={procedures[a.serviceId]}
            busy={busyId === a.id}
            onOpen={() => onOpen(a)}
            onEdit={() => onEdit(a)}
            onUpdateStatus={(s) => onUpdateStatus(a, s)}
          />
        ))}
      </div>
    </div>
  );
}

interface FocusItemRowProps {
  appointment: Appointment;
  patient?: Patient;
  professional?: Professional;
  service?: ProfessionalService;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onUpdateStatus: (s: AppointmentStatus) => void | Promise<void>;
  key?: any;
}

function FocusItemRow({
  appointment,
  patient,
  professional,
  service,
  busy,
  onOpen,
  onEdit,
  onUpdateStatus,
}: FocusItemRowProps) {
  const start = new Date(appointment.startTime);
  const status = appointment.status;
  const isCancelled = status === 'cancelled';

  const statusBadge = (
    <span
      className={cn(
        'text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shrink-0',
        status === 'completed'
          ? 'bg-emerald-50 text-emerald-700'
          : status === 'checked-in'
          ? 'bg-blue-50 text-blue-700'
          : status === 'confirmed'
          ? 'bg-emerald-50 text-emerald-700'
          : status === 'cancelled'
          ? 'bg-rose-50 text-rose-700'
          : status === 'no-show'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-500'
      )}
    >
      {status === 'completed'
        ? 'Concluído'
        : status === 'checked-in'
        ? 'Em atendimento'
        : status === 'confirmed'
        ? 'Confirmado'
        : status === 'cancelled'
        ? 'Cancelado'
        : status === 'no-show'
        ? 'Não compareceu'
        : 'Agendado'}
    </span>
  );

  return (
    <div
      className={cn(
        'flex items-center gap-4 py-4 group transition-colors -mx-2 px-2 rounded-lg',
        isCancelled ? 'opacity-50' : 'hover:bg-slate-50/40'
      )}
    >
      <button
        onClick={onOpen}
        className="flex items-center gap-4 flex-1 min-w-0 text-left"
      >
        <div className="w-16 shrink-0">
          <div className={cn('text-2xl font-bold tracking-tight leading-none', isCancelled ? 'text-slate-400 line-through' : 'text-slate-900')}>
            {format(start, 'HH:mm')}
          </div>
          {appointment.walkIn && (
            <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-1">
              {appointment.periodLabel || 'Walk-in'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'font-bold truncate transition-colors',
              isCancelled ? 'text-slate-400 line-through' : 'text-slate-900 group-hover:text-emerald-700'
            )}
          >
            {patient?.name || 'Paciente'}
          </p>
          <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
            {appointment.walkIn && (
              <span className="text-emerald-600 font-bold">
                Ordem de chegada · {appointment.periodLabel || 'período'}
                {' · '}
              </span>
            )}
            {service?.name || 'Atendimento'}
            {professional?.name ? ` · ${professional.name}` : ''}
            {patient?.phone ? ` · ${patient.phone}` : ''}
          </p>
        </div>
      </button>

      {statusBadge}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!isCancelled && status !== 'confirmed' && status !== 'completed' && (
          <button
            disabled={busy}
            onClick={() => onUpdateStatus('confirmed')}
            title="Confirmar"
            className="w-8 h-8 rounded-full hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 flex items-center justify-center transition-colors"
          >
            <CheckCircle size={16} />
          </button>
        )}
        {!isCancelled && (status === 'confirmed' || status === 'scheduled') && (
          <button
            disabled={busy}
            onClick={() => onUpdateStatus('checked-in')}
            title="Em atendimento"
            className="w-8 h-8 rounded-full hover:bg-blue-50 text-slate-400 hover:text-blue-600 flex items-center justify-center transition-colors"
          >
            <Clock size={16} />
          </button>
        )}
        {!isCancelled && status !== 'completed' && (
          <button
            disabled={busy}
            onClick={() => onUpdateStatus('completed')}
            title="Concluir"
            className="w-8 h-8 rounded-full hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 flex items-center justify-center transition-colors"
          >
            <CalendarCheck size={16} />
          </button>
        )}
        <button
          disabled={busy}
          onClick={onEdit}
          title="Editar / Remarcar"
          className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 flex items-center justify-center transition-colors"
        >
          <Edit2 size={14} />
        </button>
        {!isCancelled && (
          <button
            disabled={busy}
            onClick={() => onUpdateStatus('cancelled')}
            title="Cancelar"
            className="w-8 h-8 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        )}
        {isCancelled && (
          <button
            disabled={busy}
            onClick={() => onUpdateStatus('scheduled')}
            title="Restaurar"
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-600 flex items-center justify-center transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
