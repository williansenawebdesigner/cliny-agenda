import { useState, useEffect, FormEvent } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { X, Search, Calendar, Clock, Stethoscope, Briefcase, UserPlus, Plus, Save, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { Professional, Patient, OperationType, Appointment, ProfessionalService } from '../types';

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
  
  // Use initialData or existingAppointment if provided
  const [date, setDate] = useState(() => {
    if (existingAppointment) return new Date(existingAppointment.startTime).toISOString().split('T')[0];
    return initialDate ? initialDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  });
  const [time, setTime] = useState(() => {
    if (existingAppointment) return new Date(existingAppointment.startTime).toTimeString().slice(0, 5);
    return initialDate ? initialDate.toTimeString().slice(0, 5) : '09:00';
  });
  const [notes, setNotes] = useState(existingAppointment?.notes || '');
  const [patientSearch, setPatientSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [profSnap, patSnap] = await Promise.all([
          getDocs(query(collection(db, 'professionals'), where('clinicId', '==', clinicId))),
          getDocs(query(collection(db, 'patients'), where('clinicId', '==', clinicId)))
        ]);

        const allProfessionals = profSnap.docs.map(d => ({ id: d.id, ...d.data() } as Professional));
        const allPatients = patSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));

        setProfessionals(allProfessionals);
        setPatients(allPatients);

        if (existingAppointment) {
          const pat = allPatients.find(p => p.id === existingAppointment.patientId);
          if (pat) setPatientSearch(pat.name);
          
          // Autofocus on time for rescheduling
          setTimeout(() => {
            const timeInput = document.getElementById('appointment-time');
            if (timeInput) timeInput.focus();
          }, 300);
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
        clinicId,
        patientId: selectedPatientId,
        professionalId: selectedProfessionalId,
        serviceId: selectedServiceId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: existingAppointment?.status || 'scheduled',
        price: service?.price || 0,
        notes,
        updatedAt: new Date().toISOString()
      };

      if (existingAppointment) {
        await updateDoc(doc(db, 'appointments', existingAppointment.id), appointmentData);
      } else {
        await addDoc(collection(db, 'appointments'), {
          ...appointmentData,
          createdAt: new Date().toISOString()
        });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/10 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                {existingAppointment ? <Edit2 size={24} /> : <Plus size={24} />}
             </div>
             <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  {existingAppointment ? 'Editar Agendamento' : 'Agendar'}
                </h3>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                  {existingAppointment ? 'Atualize as informações do atendimento' : 'Novo atendimento na clínica'}
                </p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
            <X size={20} className="text-slate-300" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Patient Selection */}
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                   <label className="text-[10px] font-semibold text-slate-400">Paciente</label>
                   <button type="button" className="text-emerald-600 text-[10px] font-semibold hover:underline">
                      + Novo Paciente
                   </button>
                </div>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors pointer-events-none">
                    <Search size={20} />
                  </div>
                  <input 
                    type="text"
                    placeholder="Quem vamos atender hoje?"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setSelectedPatientId('');
                    }}
                    className="w-full pl-16 pr-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 placeholder:text-slate-200"
                  />
                  {patientSearch && !selectedPatientId && filteredPatients.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-4 bg-white border border-slate-100 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto p-2 flex flex-col gap-1">
                       {filteredPatients.map(p => (
                         <button
                           key={p.id}
                           type="button"
                           onClick={() => {
                             setSelectedPatientId(p.id);
                             setPatientSearch(p.name);
                           }}
                           className="w-full text-left p-3 hover:bg-emerald-50 rounded-lg transition-all flex flex-col gap-0.5 group"
                         >
                           <span className="font-semibold text-slate-900 group-hover:text-emerald-700 tracking-tight">{p.name}</span>
                           <span className="text-[10px] text-slate-400 font-semibold">{p.phone}</span>
                         </button>
                       ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Professional & Procedure */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-semibold text-slate-400 px-1">Profissional Especialista</label>
                  <select 
                    required
                    value={selectedProfessionalId}
                    onChange={(e) => setSelectedProfessionalId(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 appearance-none cursor-pointer"
                  >
                    <option value="">Selecione quem irá atender</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-semibold text-slate-400 px-1">Tipo de Serviço</label>
                  <select 
                    required
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    disabled={!selectedProfessionalId}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">O que será realizado?</option>
                    {selectedProfServices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-semibold text-slate-400 px-1">Selecione a Data</label>
                  <input 
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-semibold text-slate-400 px-1">Defina o Horário</label>
                  <input 
                    id="appointment-time"
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-slate-400 px-1">Notas e Recomendações</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 min-h-[120px] resize-none placeholder:text-slate-200"
                  placeholder="Instruções e notas internas..."
                />
              </div>
            </form>
          )}
        </div>

        <div className="p-10 border-t border-slate-50 bg-white flex items-center justify-between shrink-0">
          <button 
            type="button" 
            onClick={onClose}
            className="text-[10px] font-semibold text-slate-400 hover:text-slate-900 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={submitting || !selectedPatientId || !selectedProfessionalId || !selectedServiceId}
            className="px-12 py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-300 text-white font-bold rounded-lg shadow-xl shadow-emerald-100 transition-all cursor-pointer active:scale-95 flex items-center gap-2"
          >
            {submitting ? (
               <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {existingAppointment ? <Save size={18} /> : null}
                {existingAppointment ? 'Salvar Alterações' : 'Confirmar Reserva'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
