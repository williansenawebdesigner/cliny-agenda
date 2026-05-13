import { useState, useEffect, FormEvent } from 'react';
import { X, Search, Plus, Save, Edit2, User } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { Professional, Patient, Appointment, ProfessionalService } from '../types';

interface NewAppointmentModalProps {
  clinicId: string;
  initialDate?: Date;
  existingAppointment?: Appointment;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewAppointmentModal({ clinicId, initialDate, existingAppointment, onClose, onSuccess }: NewAppointmentModalProps) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedPatientId, setSelectedPatientId] = useState(existingAppointment?.patientId || '');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState(existingAppointment?.professionalId || '');
  const [selectedServiceId, setSelectedServiceId] = useState(existingAppointment?.serviceId || '');
  
  const [date, setDate] = useState(() => {
    if (existingAppointment) return new Date(existingAppointment.startTime).toISOString().split('T')[0];
    return initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  });
  const [time, setTime] = useState(() => {
    if (existingAppointment) return new Date(existingAppointment.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return initialDate ? initialDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '09:00';
  });
  const [notes, setNotes] = useState(existingAppointment?.notes || '');
  const [patientSearch, setPatientSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [profData, patData] = await Promise.all([
          api.get<{ professionals: Professional[] }>('/api/professionals'),
          api.get<{ patients: Patient[] }>('/api/patients')
        ]);

        setProfessionals(profData.professionals);
        setPatients(patData.patients);

        if (existingAppointment) {
          const pat = patData.patients.find(p => p.id === existingAppointment.patientId);
          if (pat) setPatientSearch(pat.name);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [clinicId, existingAppointment]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !selectedProfessionalId || !selectedServiceId) return;

    setSubmitting(true);
    try {
      const prof = professionals.find(p => p.id === selectedProfessionalId);
      const service = prof?.services?.find((s: ProfessionalService) => s.id === selectedServiceId);
      const startTime = new Date(`${date}T${time}`);
      const endTime = new Date(startTime.getTime() + (service?.duration || 30) * 60000);

      const appointmentData = {
        patientId: selectedPatientId,
        professionalId: selectedProfessionalId,
        serviceId: selectedServiceId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: existingAppointment?.status || 'scheduled',
        price: service?.price || 0,
        notes
      };

      if (existingAppointment) {
        await api.put(`/api/appointments/${existingAppointment.id}`, appointmentData);
      } else {
        await api.post('/api/appointments', appointmentData);
      }
      onSuccess();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(patientSearch.toLowerCase()) || 
    p.phone.includes(patientSearch)
  );

  const selectedProfServices = professionals.find(p => p.id === selectedProfessionalId)?.services || [];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-2xl rounded shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0 bg-white z-10">
          <div className="flex items-center gap-5">
             <div className="w-12 h-12 bg-emerald-500 text-white rounded flex items-center justify-center shadow-lg shadow-emerald-100">
                {existingAppointment ? <Edit2 size={22} /> : <Plus size={22} />}
             </div>
             <div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  {existingAppointment ? 'Editar Agendamento' : 'Novo Agendamento'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Preencha os detalhes do atendimento
                </p>
             </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded transition-all">
            <X size={24} className="text-slate-300" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-10 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Patient Selection */}
              <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paciente</label>
                   <button type="button" className="text-emerald-600 text-[10px] font-bold uppercase tracking-widest hover:underline">
                      + Cadastrar Novo
                   </button>
                </div>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors pointer-events-none">
                    <Search size={22} />
                  </div>
                  <input 
                    type="text"
                    placeholder="Nome ou telefone..."
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setSelectedPatientId('');
                    }}
                    className="w-full pl-16 pr-6 py-4.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-slate-900 placeholder:text-slate-300 shadow-inner"
                  />
                  {patientSearch && !selectedPatientId && filteredPatients.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-4 bg-white border border-slate-100 rounded shadow-2xl z-50 max-h-64 overflow-y-auto p-3 flex flex-col gap-1">
                       {filteredPatients.map(p => (
                         <button
                           key={p.id}
                           type="button"
                           onClick={() => {
                             setSelectedPatientId(p.id);
                             setPatientSearch(p.name);
                           }}
                           className="w-full text-left p-4 hover:bg-emerald-50 rounded transition-all flex items-center gap-4 group"
                         >
                            <div className="w-10 h-10 bg-slate-50 rounded flex items-center justify-center text-slate-300 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                               <User size={18} />
                            </div>
                            <div className="flex flex-col">
                               <span className="font-bold text-slate-900 group-hover:text-emerald-700">{p.name}</span>
                               <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{p.phone}</span>
                            </div>
                         </button>
                       ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Professional & Procedure */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Profissional Especialista</label>
                  <select 
                    required
                    value={selectedProfessionalId}
                    onChange={(e) => setSelectedProfessionalId(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-slate-900 appearance-none cursor-pointer shadow-inner"
                  >
                    <option value="">Quem irá atender?</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tipo de Serviço</label>
                  <select 
                    required
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    disabled={!selectedProfessionalId}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-slate-900 appearance-none cursor-pointer disabled:opacity-50 shadow-inner"
                  >
                    <option value="">O que será realizado?</option>
                    {selectedProfServices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Data do Atendimento</label>
                  <input 
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-slate-900 shadow-inner"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Horário</label>
                  <input 
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-slate-900 shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Notas Adicionais</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-6 py-5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-bold text-slate-900 min-h-[140px] resize-none placeholder:text-slate-300 shadow-inner"
                  placeholder="Instruções internas, sintomas relatados, etc..."
                />
              </div>
            </form>
          )}
        </div>

        <div className="p-10 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between shrink-0 rounded-t">
          <button 
            type="button" 
            onClick={onClose}
            className="text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-all"
          >
            Voltar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={submitting || !selectedPatientId || !selectedProfessionalId || !selectedServiceId}
            className="px-12 py-5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold rounded shadow-xl shadow-slate-200 transition-all active:scale-[0.98] flex items-center gap-3"
          >
            {submitting ? (
               <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {existingAppointment ? <Save size={18} /> : null}
                {existingAppointment ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR AGENDAMENTO'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
