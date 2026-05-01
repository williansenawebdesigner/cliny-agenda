import { useState, useEffect, FormEvent } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { 
  Plus, 
  Trash2, 
  X,
  User,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { Professional, ProfessionalService } from '../types';

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
      const q = query(collection(db, 'professionals'), where('clinicId', '==', clinicId));
      const snapshot = await getDocs(q);
      setProfessionals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Professional)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clinicId]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Equipe & Serviços</h1>
          <p className="text-slate-400 font-medium text-sm">Gerencie os profissionais e os serviços que cada um executa.</p>
        </div>
        <button 
          onClick={() => { setEditingProf(null); setIsModalOpen(true); }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-full md:w-auto md:px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all font-semibold active:scale-95 shrink-0 text-sm"
        >
          <Plus size={18} />
          Novo Profissional
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : professionals.length === 0 ? (
        <div className="bg-slate-50/50 rounded-xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center text-slate-200 mb-6 shadow-sm">
             <User size={28} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Sua equipe está vazia</h3>
          <p className="text-sm text-slate-400 max-w-xs mb-8 leading-relaxed">Adicione os profissionais e seus respectivos serviços.</p>
          <button 
            onClick={() => { setEditingProf(null); setIsModalOpen(true); }}
            className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-semibold shadow-sm hover:bg-emerald-700 transition-all active:scale-95"
          >
            Adicionar Profissional
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {professionals.map((prof: Professional) => (
            <ProfessionalCard 
              key={prof.id} 
              professional={prof} 
              onEdit={() => { setEditingProf(prof); setIsModalOpen(true); }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <ProfessionalModal 
            clinicId={clinicId}
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

function ProfessionalCard({ professional, onEdit }: { professional: Professional, onEdit: () => void, key?: any }) {
  const linkedProcs = professional.services || [];

  return (
    <div className="bg-white p-6 rounded-xl hover:bg-slate-50 transition-all group relative border border-transparent hover:border-slate-50 h-full flex flex-col justify-between">
      <div>
        <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-lg flex items-center justify-center mb-6 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
          <User size={24} />
        </div>
        <h4 className="font-semibold text-slate-900 text-base leading-tight group-hover:text-emerald-700 transition-colors tracking-tight">{professional.name}</h4>
        <p className="text-[10px] text-slate-400 font-semibold mt-2">{professional.specialty || 'Sem especialidade'}</p>
        <p className="text-[10px] text-slate-300 font-medium mt-1 truncate">{professional.email}</p>
        
        {linkedProcs.length > 0 && (
          <div className="mt-4 space-y-1">
             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Serviços ({linkedProcs.length})</p>
             <div className="flex flex-wrap gap-1">
               {linkedProcs.slice(0, 3).map(p => (
                 <span key={p.id} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded leading-none">
                   {p.name} • {p.duration}min
                 </span>
               ))}
               {linkedProcs.length > 3 && <span className="text-[9px] text-slate-300 px-1.5 py-0.5">+ {linkedProcs.length - 3}</span>}
             </div>
          </div>
        )}
      </div>
      
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px]">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
           <span className="font-semibold text-slate-400">Ativo na clínica</span>
        </div>
        <div className="flex gap-2">
           <button onClick={onEdit} className="w-8 h-8 rounded flex items-center justify-center text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all opacity-0 group-hover:opacity-100">
             <Edit2 size={16} />
           </button>
           <button className="w-8 h-8 rounded flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100">
             <Trash2 size={16} />
           </button>
        </div>
      </div>
    </div>
  );
}

function ProfessionalModal({ clinicId, existing, onClose, onSuccess }: { clinicId: string, existing: Professional | null, onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState(existing?.name || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [specialty, setSpecialty] = useState(existing?.specialty || '');
  const [services, setServices] = useState<ProfessionalService[]>(existing?.services || []);
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        clinicId,
        name,
        email,
        specialty,
        services,
        updatedAt: new Date().toISOString()
      };
      
      if (existing) {
        await updateDoc(doc(db, 'professionals', existing.id), data);
      } else {
        await addDoc(collection(db, 'professionals'), {
          ...data,
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
        className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl flex flex-col"
      >
        <div className="p-8 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
          <div className="flex flex-col gap-1">
             <h3 className="text-xl font-semibold tracking-tight text-slate-900">{existing ? 'Editar Profissional' : 'Novo Profissional'}</h3>
             <p className="text-[10px] text-slate-400 font-medium">Cadastre os dados e serviços atendidos.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
            <X size={20} className="text-slate-300" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8 flex-1">
          <div className="grid grid-cols-2 gap-6">
             <div className="space-y-2 col-span-2">
               <label className="text-[10px] font-semibold text-slate-400 ml-1">Nome Completo</label>
               <input 
                 type="text" 
                 required
                 value={name}
                 onChange={(e) => setName(e.target.value)}
                 className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-sm"
               />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-semibold text-slate-400 ml-1">Email</label>
               <input 
                 type="email" 
                 required
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-sm"
               />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-semibold text-slate-400 ml-1">Especialidade</label>
               <input 
                 type="text" 
                 value={specialty}
                 onChange={(e) => setSpecialty(e.target.value)}
                 className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-sm"
               />
             </div>
          </div>

          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-slate-400 ml-1">Serviços ({services.length})</label>
                <button type="button" onClick={addService} className="text-emerald-600 font-bold text-xs flex items-center gap-1 hover:underline">
                  <Plus size={14} /> Adicionar Serviço
                </button>
             </div>
             
             <div className="flex flex-col gap-3">
               {services.map((svc) => (
                  <div key={svc.id} className="flex gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                     <div className="flex-1">
                        <input 
                          type="text" 
                          placeholder="Nome do serviço" 
                          value={svc.name}
                          onChange={(e) => updateService(svc.id, 'name', e.target.value)}
                          className="w-full bg-transparent outline-none font-semibold text-sm text-slate-900 placeholder:text-slate-300"
                        />
                     </div>
                     <div className="w-24">
                        <input 
                          type="number" 
                          placeholder="Minutos" 
                          value={svc.duration}
                          onChange={(e) => updateService(svc.id, 'duration', Number(e.target.value))}
                          className="w-full bg-white px-2 py-1.5 rounded-md border border-slate-100 outline-none focus:border-emerald-500 font-semibold text-xs text-slate-700"
                        />
                     </div>
                     <div className="w-28 relative">
                        <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-semibold border-r border-slate-100 pr-1.5">R$</span>
                        <input 
                          type="number" 
                          placeholder="Preço" 
                          value={svc.price}
                          onChange={(e) => updateService(svc.id, 'price', Number(e.target.value))}
                          className="w-full bg-white pl-9 pr-2 py-1.5 rounded-md border border-slate-100 outline-none focus:border-emerald-500 font-semibold text-xs text-slate-700"
                        />
                     </div>
                     <button type="button" onClick={() => removeService(svc.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                     </button>
                  </div>
               ))}
               {services.length === 0 && (
                 <div className="text-center py-6 text-sm font-medium text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    Nenhum serviço cadastrado.
                 </div>
               )}
             </div>
          </div>

          <button 
            disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-300 text-white font-semibold py-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-3 mt-4 active:scale-[0.98]"
          >
            {submitting ? 'Salvando...' : 'Salvar Profissional'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

