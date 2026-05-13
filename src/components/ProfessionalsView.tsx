import { useState, useEffect, FormEvent } from 'react';
import {
  Plus,
  Trash2,
  X,
  User,
  Edit2,
  Clock,
  Users as UsersIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import {
  Professional,
  ProfessionalService,
  BookingMode,
  WalkInPeriod,
  DEFAULT_WALKIN_PERIODS,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS_PT,
} from '../types';

interface ProfessionalViewProps {
  clinicId: string;
}

export function ProfessionalsView({ clinicId }: ProfessionalViewProps) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ professionals: Professional[] }>('/api/professionals');
      setProfessionals(data.professionals);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clinicId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este profissional?')) return;
    try {
      await api.delete(`/api/professionals/${id}`);
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Equipe & Serviços</h1>
          <p className="text-slate-400 font-medium text-sm">Gerencie os profissionais e os serviços que cada um executa.</p>
        </div>
        <button 
          onClick={() => { setEditingProf(null); setIsModalOpen(true); }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-full md:w-auto md:px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all font-bold active:scale-95 shrink-0 text-sm"
        >
          <Plus size={18} />
          Novo Profissional
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : professionals.length === 0 ? (
        <div className="bg-slate-50/50 rounded-2xl p-12 text-center flex flex-col items-center border border-dashed border-slate-100">
          <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center text-slate-200 mb-6 shadow-sm">
             <User size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Sua equipe está vazia</h3>
          <p className="text-sm text-slate-400 max-w-xs mb-8 leading-relaxed font-medium">Adicione os profissionais e seus respectivos serviços.</p>
          <button 
            onClick={() => { setEditingProf(null); setIsModalOpen(true); }}
            className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
          >
            Adicionar Profissional
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {professionals.map((prof: Professional) => (
            <ProfessionalCard 
              key={prof.id} 
              professional={prof} 
              onEdit={() => { setEditingProf(prof); setIsModalOpen(true); }}
              onDelete={() => handleDelete(prof.id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <ProfessionalModal 
            existing={editingProf}
            onClose={() => { setIsModalOpen(false); setEditingProf(null); }} 
            onSuccess={() => {
              setIsModalOpen(false);
              setEditingProf(null);
              fetchData();
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfessionalCard({ professional, onEdit, onDelete }: { professional: Professional, onEdit: () => void, onDelete: () => void }) {
  const services = professional.services || [];

  return (
    <div className="bg-white p-6 rounded-2xl hover:border-emerald-100 border border-slate-50 transition-all group relative flex flex-col justify-between shadow-sm shadow-slate-100/50">
      <div>
        <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-xl flex items-center justify-center mb-6 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-inner">
          <User size={24} />
        </div>
        <h4 className="font-bold text-slate-900 text-base leading-tight group-hover:text-emerald-700 transition-colors tracking-tight">{professional.name}</h4>
        <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-widest">{professional.specialty || 'Clínico Geral'}</p>
        
        {services.length > 0 && (
          <div className="mt-4 space-y-2">
             <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Serviços ({services.length})</p>
             <div className="flex flex-wrap gap-1.5">
               {services.slice(0, 3).map(p => (
                 <span key={p.id} className="text-[10px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg leading-none font-bold border border-slate-100/50">
                   {p.name}
                 </span>
               ))}
               {services.length > 3 && <span className="text-[10px] text-slate-300 font-bold px-1.5 py-1">+ {services.length - 3}</span>}
             </div>
          </div>
        )}
      </div>
      
      <div className="mt-8 flex items-center justify-between border-t border-slate-50 pt-4">
        <div className="flex items-center gap-1.5 text-[10px] bg-emerald-50 px-2 py-1 rounded-lg">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
           <span className="font-bold text-emerald-600">Ativo</span>
        </div>
        <div className="flex gap-1">
           <button onClick={onEdit} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
             <Edit2 size={14} />
           </button>
           <button onClick={onDelete} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
             <Trash2 size={14} />
           </button>
        </div>
      </div>
    </div>
  );
}

function ProfessionalModal({ existing, onClose, onSuccess }: { existing: Professional | null, onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState(existing?.name || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [specialty, setSpecialty] = useState(existing?.specialty || '');
  const [services, setServices] = useState<ProfessionalService[]>(existing?.services || []);
  const [bookingMode, setBookingMode] = useState<BookingMode>(existing?.bookingMode === 'walk_in' ? 'walk_in' : 'slot');
  const [walkInPeriods, setWalkInPeriods] = useState<Record<string, WalkInPeriod[]>>(
    existing?.walkInPeriods ?? {}
  );
  const [tab, setTab] = useState<'identity' | 'booking'>('identity');
  const [submitting, setSubmitting] = useState(false);

  const addService = () => {
    setServices([...services, { id: crypto.randomUUID(), name: '', duration: 30, price: 0 }]);
  };

  const updateService = (id: string, field: keyof ProfessionalService, value: any) => {
    setServices(services.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeService = (id: string) => {
    setServices(services.filter(s => s.id !== id));
  };

  const fillDayWithDefaults = (dayKey: string) => {
    setWalkInPeriods((cur) => ({
      ...cur,
      [dayKey]: DEFAULT_WALKIN_PERIODS.map((p) => ({ ...p, id: `${dayKey}-${p.id}-${crypto.randomUUID().slice(0,4)}` })),
    }));
  };

  const copyToAllWeekdays = (dayKey: string) => {
    const src = walkInPeriods[dayKey];
    if (!src) return;
    const next: Record<string, WalkInPeriod[]> = { ...walkInPeriods };
    for (const k of WEEKDAY_KEYS) {
      if (k === dayKey) continue;
      next[k] = src.map((p) => ({ ...p, id: `${k}-${p.label.toLowerCase()}-${crypto.randomUUID().slice(0,4)}` }));
    }
    setWalkInPeriods(next);
  };

  const clearDay = (dayKey: string) => {
    setWalkInPeriods((cur) => {
      const next = { ...cur };
      delete next[dayKey];
      return next;
    });
  };

  const updatePeriod = (dayKey: string, periodId: string, patch: Partial<WalkInPeriod>) => {
    setWalkInPeriods((cur) => ({
      ...cur,
      [dayKey]: (cur[dayKey] ?? []).map((p) => (p.id === periodId ? { ...p, ...patch } : p)),
    }));
  };

  const removePeriod = (dayKey: string, periodId: string) => {
    setWalkInPeriods((cur) => ({
      ...cur,
      [dayKey]: (cur[dayKey] ?? []).filter((p) => p.id !== periodId),
    }));
  };

  const addPeriod = (dayKey: string) => {
    setWalkInPeriods((cur) => ({
      ...cur,
      [dayKey]: [
        ...(cur[dayKey] ?? []),
        { id: crypto.randomUUID(), label: 'Período', start: '08:00', end: '12:00', capacity: 10 },
      ],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data: any = {
        name,
        email,
        specialty,
        services,
        bookingMode,
        walkInPeriods: bookingMode === 'walk_in' ? walkInPeriods : null,
      };

      if (existing) {
        await api.put(`/api/professionals/${existing.id}`, data);
      } else {
        await api.post('/api/professionals', data);
      }
      onSuccess();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative bg-white w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col"
      >
        <div className="p-8 border-b border-slate-50 sticky top-0 bg-white z-10 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{existing ? 'Editar Profissional' : 'Novo Profissional'}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Identidade, serviços e modo de atendimento.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
              <X size={20} className="text-slate-300" />
            </button>
          </div>
          <div className="flex gap-1 bg-slate-50 p-1 rounded-2xl">
            {(
              [
                ['identity', 'Dados & Serviços', <User size={14} key="i" />],
                ['booking', 'Configuração de Agenda', <Clock size={14} key="b" />],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all',
                  tab === key ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-900'
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8 flex-1 overflow-y-auto no-scrollbar">
        {tab === 'identity' && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-6">
             <div className="space-y-2 col-span-2">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
               <input 
                 type="text" 
                 required
                 value={name}
                 onChange={(e) => setName(e.target.value)}
                 className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-bold text-sm shadow-inner"
               />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
               <input 
                 type="email" 
                 required
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-bold text-sm shadow-inner"
               />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Especialidade</label>
               <input 
                 type="text" 
                 value={specialty}
                 onChange={(e) => setSpecialty(e.target.value)}
                 className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-bold text-sm shadow-inner"
                 placeholder="Ex: Clínico Geral"
               />
             </div>
          </div>

          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Serviços ({services.length})</label>
                <button type="button" onClick={addService} className="text-emerald-600 font-bold text-[10px] flex items-center gap-1 hover:underline uppercase tracking-widest">
                  <Plus size={14} /> Adicionar Serviço
                </button>
             </div>
             
             <div className="flex flex-col gap-3">
               {services.map((svc) => (
                  <div key={svc.id} className="flex gap-3 items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                     <div className="flex-1">
                        <input 
                          type="text" 
                          placeholder="Nome do serviço" 
                          value={svc.name}
                          onChange={(e) => updateService(svc.id, 'name', e.target.value)}
                          className="w-full bg-transparent outline-none font-bold text-sm text-slate-900 placeholder:text-slate-300"
                        />
                     </div>
                     <div className="w-20">
                        <input 
                          type="number" 
                          placeholder="Min" 
                          value={svc.duration}
                          onChange={(e) => updateService(svc.id, 'duration', Number(e.target.value))}
                          className="w-full bg-white px-2 py-2 rounded-lg border border-slate-100 outline-none focus:border-emerald-500 font-bold text-xs text-slate-700"
                        />
                     </div>
                     <div className="w-24 relative">
                        <input 
                          type="number" 
                          placeholder="Preço" 
                          value={svc.price}
                          onChange={(e) => updateService(svc.id, 'price', Number(e.target.value))}
                          className="w-full bg-white px-2 py-2 rounded-lg border border-slate-100 outline-none focus:border-emerald-500 font-bold text-xs text-slate-700"
                        />
                     </div>
                     <button type="button" onClick={() => removeService(svc.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-lg border border-slate-100">
                        <Trash2 size={14} />
                     </button>
                  </div>
               ))}
               {services.length === 0 && (
                 <div className="text-center py-10 text-xs font-bold text-slate-300 bg-slate-50/30 rounded-2xl border border-dashed border-slate-200">
                    Nenhum serviço cadastrado.
                 </div>
               )}
             </div>
          </div>
        </div>
        )}

        {tab === 'booking' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setBookingMode('slot')}
                  className={cn(
                    'p-6 rounded-2xl border-2 transition-all text-left group',
                    bookingMode === 'slot' ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-50 hover:border-slate-100 bg-slate-50/30'
                  )}
                >
                  <div className="flex items-center gap-4 mb-3">
                    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center transition-all', bookingMode === 'slot' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white text-slate-300')}>
                      <Clock size={24} />
                    </div>
                    <h4 className="font-bold text-slate-900">Hora Marcada</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Agendamentos com horários fixos. A IA gerencia slots disponíveis.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setBookingMode('walk_in')}
                  className={cn(
                    'p-6 rounded-2xl border-2 transition-all text-left group',
                    bookingMode === 'walk_in' ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-50 hover:border-slate-100 bg-slate-50/30'
                  )}
                >
                  <div className="flex items-center gap-4 mb-3">
                    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center transition-all', bookingMode === 'walk_in' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white text-slate-300')}>
                      <UsersIcon size={24} />
                    </div>
                    <h4 className="font-bold text-slate-900">Ordem de Chegada</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Pacientes agendam períodos (Manhã/Tarde). Sem hora marcada fixa.
                  </p>
                </button>
            </div>

            {bookingMode === 'walk_in' && (
              <div className="space-y-4">
                {WEEKDAY_KEYS.map((dayKey) => {
                  const periods = walkInPeriods[dayKey] ?? [];
                  return (
                    <div key={dayKey} className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-sm text-slate-900 uppercase tracking-tight">{WEEKDAY_LABELS_PT[dayKey]}</h4>
                        <div className="flex items-center gap-3">
                          {periods.length === 0 ? (
                            <button type="button" onClick={() => fillDayWithDefaults(dayKey)} className="text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-all uppercase tracking-widest">
                              + Adicionar Padrão
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <button type="button" onClick={() => addPeriod(dayKey)} className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Adicionar</button>
                              <button type="button" onClick={() => copyToAllWeekdays(dayKey)} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Copiar Tudo</button>
                              <button type="button" onClick={() => clearDay(dayKey)} className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Limpar</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {periods.length > 0 && (
                        <div className="space-y-2">
                          {periods.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                              <input value={p.label} onChange={(e) => updatePeriod(dayKey, p.id, { label: e.target.value })} placeholder="Período" className="flex-1 px-3 py-2 bg-transparent outline-none font-bold text-sm" />
                              <input type="time" value={p.start} onChange={(e) => updatePeriod(dayKey, p.id, { start: e.target.value })} className="w-24 px-2 py-2 bg-slate-50 rounded-lg text-xs font-bold" />
                              <input type="time" value={p.end} onChange={(e) => updatePeriod(dayKey, p.id, { end: e.target.value })} className="w-24 px-2 py-2 bg-slate-50 rounded-lg text-xs font-bold" />
                              <input type="number" value={p.capacity} onChange={(e) => updatePeriod(dayKey, p.id, { capacity: Number(e.target.value) })} className="w-16 px-2 py-2 bg-slate-50 rounded-lg text-xs font-bold text-center" />
                              <button type="button" onClick={() => removePeriod(dayKey, p.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="pt-4 pb-0">
          <button
            disabled={submitting}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold py-5 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {submitting ? (
               <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Salvar Configurações'}
          </button>
        </div>
        </form>
      </motion.div>
    </div>
  );
}
