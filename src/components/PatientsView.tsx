import { useState, useEffect, FormEvent } from 'react';
import { collection, query, where, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { Plus, Users, Search, Phone, Mail, X, User, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { Patient } from '../types';

interface PatientsViewProps {
  clinicId: string;
}

export function PatientsView({ clinicId }: PatientsViewProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'patients'), 
        where('clinicId', '==', clinicId),
        orderBy('name')
      );
      const snapshot = await getDocs(q);
      setPatients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [clinicId]);

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pacientes</h1>
          <p className="text-slate-400 font-medium text-sm">Gerencie o prontuário e histórico de todos os seus clientes.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative group flex-1 md:flex-none">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors pointer-events-none" />
            <input 
              type="text"
              placeholder="Buscar por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all text-sm w-full md:w-64 font-medium placeholder:text-slate-300"
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white w-10 h-10 md:w-auto md:px-5 md:py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm shadow-emerald-100 transition-all shrink-0 active:scale-95"
          >
            <Plus size={18} />
            <span className="hidden md:inline font-semibold text-sm">Novo Paciente</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="bg-slate-50/50 rounded-xl py-20 text-center flex flex-col items-center">
             <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center text-slate-200 mb-4 shadow-sm">
                <Users size={28} />
             </div>
             <p className="text-slate-400 font-medium">Nenhum paciente encontrado.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredPatients.map((patient) => (
              <div key={patient.id} className="p-4 md:p-6 flex items-center justify-between hover:bg-slate-50 transition-all rounded-xl group cursor-pointer border border-transparent hover:border-slate-50">
                <div className="flex items-center gap-5">
                   <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                      <User size={20} />
                   </div>
                   <div>
                      <h4 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors tracking-tight text-sm">{patient.name}</h4>
                      <div className="flex items-center gap-4 mt-1">
                         <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                            <Phone size={12} className="text-emerald-500/50" />
                            {patient.phone}
                         </div>
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-4">
                   <button className="hidden md:block px-4 py-2 rounded-lg border border-transparent hover:border-slate-100 text-[10px] font-semibold text-slate-400 hover:text-emerald-600 transition-all">Ver Prontuário</button>
                   <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-200 group-hover:text-emerald-500 transition-colors">
                      <ChevronRight size={18} />
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <PatientModal 
            clinicId={clinicId} 
            onClose={() => setIsModalOpen(false)} 
            onSuccess={() => {
              setIsModalOpen(false);
              fetchPatients();
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function PatientModal({ clinicId, onClose, onSuccess }: { clinicId: string, onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'patients'), {
        clinicId,
        name,
        phone,
        email,
        createdAt: new Date().toISOString()
      });
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
        className="absolute inset-0 bg-slate-900/10 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-white">
          <h3 className="text-xl font-semibold tracking-tight">Novo Paciente</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
            <X size={20} className="text-slate-300" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-400 ml-1">Nome Completo</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 placeholder:text-slate-300"
              placeholder="Nome do paciente"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-400 ml-1">Telefone</label>
            <input 
              type="tel" 
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 placeholder:text-slate-300"
              placeholder="Ex: 44 99912-3456"
            />
          </div>

          <button 
            disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-300 text-white font-semibold py-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-3 mt-4 active:scale-[0.98]"
          >
            {submitting ? (
               <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : 'Cadastrar Paciente'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
