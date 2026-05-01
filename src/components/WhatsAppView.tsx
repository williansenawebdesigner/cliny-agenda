import { useState, useEffect, FormEvent } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Bot, QrCode, RefreshCcw, Save, Plus, X, Phone, Trash2, Edit2, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { WhatsAppInstance, Professional } from '../types';
import { cn } from '../lib/utils';

export function WhatsAppView({ clinicId }: { clinicId: string }) {
  const [config, setConfig] = useState({ hasUrl: false, hasApiKey: false });
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<WhatsAppInstance | null>(null);

  useEffect(() => {
    checkConfig();
    fetchData();
  }, []);

  const checkConfig = async () => {
    try {
      const res = await fetch('/api/evolution/config');
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [instSnap, profSnap] = await Promise.all([
        getDocs(query(collection(db, 'whatsapp_instances'), where('clinicId', '==', clinicId))),
        getDocs(query(collection(db, 'professionals'), where('clinicId', '==', clinicId)))
      ]);

      setInstances(instSnap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppInstance)));
      setProfessionals(profSnap.docs.map(d => ({ id: d.id, ...d.data() } as Professional)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingInstance(null);
    setIsModalOpen(true);
  };

  const openEditModal = (inst: WhatsAppInstance) => {
    setEditingInstance(inst);
    setIsModalOpen(true);
  };

  if (!config.hasUrl || !config.hasApiKey) {
    return (
      <div className="max-w-4xl space-y-8">
        <header>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Agentes WhatsApp</h2>
          <p className="text-slate-500 font-medium mt-1 text-sm">Conecte seu WhatsApp e configure assistentes de IA.</p>
        </header>
        <div className="p-8 bg-amber-50 border border-amber-100 rounded-2xl">
          <h3 className="text-amber-800 font-bold mb-2">Configuração Ausente</h3>
          <p className="text-amber-700 text-sm">As variáveis de ambiente da Evolution API não estão configuradas no servidor (EVOLUTION_API_URL, EVOLUTION_GLOBAL_API_KEY).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-between gap-6 md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Agentes WhatsApp</h2>
          <p className="text-slate-500 font-medium mt-1 text-sm">Conecte vários números de WhatsApp e configure agentes para a clínica ou profissionais específicos.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all font-semibold active:scale-95 shrink-0 text-sm"
        >
          <Plus size={18} />
          <span>Nova Instância</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><RefreshCcw className="animate-spin text-slate-300" /></div>
      ) : instances.length === 0 ? (
        <div className="bg-slate-50/50 rounded-xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-200 mb-6 shadow-sm">
             <Phone size={28} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Nenhum WhatsApp Conectado</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-8 leading-relaxed">Crie uma instância para conectar um número de WhatsApp e habilitar o atendimento com IA.</p>
          <button 
            onClick={openNewModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold shadow-sm transition-all active:scale-95"
          >
            Conectar Número
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {instances.map(inst => (
            <InstanceCard 
              key={inst.id} 
              instance={inst} 
              professionals={professionals} 
              onEdit={() => openEditModal(inst)}
              onRefresh={fetchData}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <InstanceModal 
            clinicId={clinicId}
            existing={editingInstance}
            professionals={professionals}
            onClose={() => setIsModalOpen(false)}
            onSuccess={() => {
              setIsModalOpen(false);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function InstanceCard({ instance, professionals, onEdit, onRefresh }: { instance: WhatsAppInstance, professionals: Professional[], onEdit: () => void, onRefresh: () => void, key?: any }) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState(instance.status);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const linkedProf = professionals.find(p => p.id === instance.professionalId);

  const createAndConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: instance.instanceName, prompt: instance.prompt })
      });
      const data = await res.json();
      if (data.qrcode && data.qrcode.base64) {
        setQrCode(data.qrcode.base64);
        setStatus('connecting');
        await updateDoc(doc(db, 'whatsapp_instances', instance.id), { status: 'connecting' });
      } else if (data.instance?.status === 'open' || data.instance?.state === 'open') {
        setStatus('open');
        await updateDoc(doc(db, 'whatsapp_instances', instance.id), { status: 'open' });
      } else if (data.error && data.error.includes("already exists")) {
        // Just Try Getting Connection Status
        checkStatus();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/evolution/instance/${instance.instanceName}/connection`);
      const data = await res.json();
      
      let newStatus = status;
      if (data?.instance?.state === 'open') {
        newStatus = 'open';
        setQrCode(null);
      } else if (data?.base64) {
        newStatus = 'connecting';
        setQrCode(data.base64);
      } else if (data?.instance?.state === 'close') {
         newStatus = 'disconnected';
         setQrCode(null);
      }
      
      if (newStatus !== status) {
        setStatus(newStatus as any);
        await updateDoc(doc(db, 'whatsapp_instances', instance.id), { status: newStatus });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const deleteInstance = async () => {
    setDeleting(true);
    try {
      // Delete from Evolution API
      await fetch(`/api/evolution/instance/${instance.instanceName}`, {
        method: 'DELETE'
      });
      // Delete from DB
      await deleteDoc(doc(db, 'whatsapp_instances', instance.id));
      onRefresh();
    } catch(e) {
      console.error(e);
    } finally {
      setDeleting(false);
      setShowConfirmDelete(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col md:flex-row">
      <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">{instance.name}</h3>
              <p className="text-xs font-mono text-slate-400 mt-1">{instance.instanceName}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onEdit} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                <Edit2 size={16} />
              </button>
              <button disabled={deleting} onClick={() => setShowConfirmDelete(true)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                {deleting ? <RefreshCcw size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-6">
            {linkedProf ? (
               <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-widest rounded-md">
                 <Link size={12} /> {linkedProf.name}
               </span>
            ) : (
               <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-md">
                 Clínica (Geral)
               </span>
            )}
            
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md",
              status === 'open' ? "bg-emerald-50 text-emerald-700" :
              status === 'connecting' ? "bg-amber-50 text-amber-700" :
              "bg-slate-100 text-slate-500"
            )}>
              {status === 'open' ? 'Conectado' : status === 'connecting' ? 'Aguardando QR' : 'Desconectado'}
            </span>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6">
             <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Bot size={14}/> Prompt do Agente</h4>
             <p className="text-sm text-slate-600 font-medium line-clamp-2">{instance.prompt}</p>
          </div>
        </div>
      </div>
      
      <div className="w-full md:w-80 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-100 p-8 flex flex-col items-center justify-center">
        {status === 'open' ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200">
               <Bot size={28} />
            </div>
            <h4 className="font-bold text-emerald-800 text-lg">Online e Operante</h4>
            <p className="text-emerald-600 text-sm mt-1 mb-6 font-medium">Este agente está escutando mensagens.</p>
            <button disabled={loading} onClick={checkStatus} className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:underline flex flex-col items-center gap-1 mx-auto">
               <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> testar conexão
            </button>
          </div>
        ) : status === 'connecting' && qrCode ? (
          <div className="text-center w-full">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mx-auto w-48 h-48 mb-4">
              <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full" />
            </div>
            <button disabled={loading} onClick={checkStatus} className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-colors">
              <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
              Minha Conexão Evoluiu
            </button>
          </div>
        ) : (
          <div className="text-center w-full">
            <div className="w-16 h-16 bg-slate-100 text-slate-300 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
               <QrCode size={28} />
            </div>
            <p className="text-xs text-slate-400 font-medium mb-4">Instância desconectada. Clique parar gerar o QR Code.</p>
            <button disabled={loading} onClick={createAndConnect} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 disabled:bg-slate-300">
              {loading ? <RefreshCcw className="animate-spin" size={14} /> : <QrCode size={14} />}
              Gerar QR Code
            </button>
            <button disabled={loading} onClick={checkStatus} className="mt-4 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors flex items-center justify-center gap-1 mx-auto">
               <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} /> Tentar Reconectar
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showConfirmDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowConfirmDelete(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm text-center">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Excluir Instância</h3>
              <p className="text-sm text-slate-500 mb-6">Tem certeza que deseja desconectar e remover "{instance.name}"? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirmDelete(false)} disabled={deleting} className="flex-1 py-2.5 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
                <button onClick={deleteInstance} disabled={deleting} className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                  {deleting ? <RefreshCcw size={16} className="animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InstanceModal({ clinicId, existing, professionals, onClose, onSuccess }: { clinicId: string, existing: WhatsAppInstance | null, professionals: Professional[], onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState(existing?.name || '');
  const [professionalId, setProfessionalId] = useState(existing?.professionalId || '');
  const [prompt, setPrompt] = useState(existing?.prompt || 'Você é o assistente virtual da clínica. Seja educado e ajude os pacientes a marcar consultas.');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const data = {
        clinicId,
        name,
        professionalId: professionalId || null,
        prompt,
        updatedAt: new Date().toISOString()
      };

      if (existing) {
        await updateDoc(doc(db, 'whatsapp_instances', existing.id), data);
      } else {
        const slugifiedName = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const instanceName = slugifiedName ? `${slugifiedName}-${clinicId.substring(0, 5)}` : `wa-${clinicId.substring(0, 5)}-${Date.now().toString(36)}`;
        
        await addDoc(collection(db, 'whatsapp_instances'), {
          ...data,
          instanceName,
          status: 'disconnected',
          createdAt: new Date().toISOString()
        });
      }
      onSuccess();
    } catch (e) {
      console.error(e);
      // alert removed to comply with environment constraints
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
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex flex-col gap-1">
             <h3 className="text-xl font-bold tracking-tight text-slate-900">{existing ? 'Editar Instância' : 'Nova Instância WhatsApp'}</h3>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{existing ? 'Atualize as configurações' : 'Configure o novo número e o agente'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
            <X size={20} className="text-slate-300" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Instância</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-sm text-slate-900"
                placeholder="Ex: Recepção Central"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Vincular a Profissional (Opcional)</label>
              <select 
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-sm text-slate-900 appearance-none cursor-pointer"
              >
                <option value="">Clínica Geral (Todos os Serviços)</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Prompt da Inteligência Artificial</label>
            <p className="text-xs text-slate-500 font-medium mb-3 ml-1">Ensine como o agente deve responder. Os horários e serviços serão injetados automaticamente no contexto.</p>
            <textarea 
              required
              rows={8}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all text-sm font-medium text-slate-700 leading-relaxed resize-none"
              placeholder="Instruções para o agente..."
            />
          </div>

          <button 
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-3 mt-4 active:scale-95"
          >
            {submitting ? 'Salvando...' : existing ? 'Salvar Alterações' : 'Criar Instância'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
