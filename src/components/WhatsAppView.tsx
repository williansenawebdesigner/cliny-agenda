import { useState, useEffect, FormEvent } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Bot, BotOff, QrCode, RefreshCcw, Plus, X, Phone, Trash2, Edit2, Link, Clock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { WhatsAppInstance, Professional, AgentConfig, DEFAULT_AGENT_CONFIG } from '../types';
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
        getDocs(query(collection(db, 'professionals'), where('clinicId', '==', clinicId))),
      ]);
      setInstances(instSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WhatsAppInstance)));
      setProfessionals(profSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Professional)));
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

  const toggleAgent = async (inst: WhatsAppInstance) => {
    const cur = inst.agent?.enabled ?? true;
    await updateDoc(doc(db, 'whatsapp_instances', inst.id), {
      agent: { ...(inst.agent ?? DEFAULT_AGENT_CONFIG), enabled: !cur },
    });
    fetchData();
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
          <p className="text-slate-500 font-medium mt-1 text-sm">
            Conecte vários números de WhatsApp e configure agentes IA personalizados por clínica ou profissional.
          </p>
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
        <div className="flex justify-center p-12">
          <RefreshCcw className="animate-spin text-slate-300" />
        </div>
      ) : instances.length === 0 ? (
        <div className="bg-slate-50/50 rounded-xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-200 mb-6 shadow-sm">
            <Phone size={28} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Nenhum WhatsApp Conectado</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-8 leading-relaxed">
            Crie uma instância para conectar um número de WhatsApp e habilitar o atendimento com IA.
          </p>
          <button
            onClick={openNewModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold shadow-sm transition-all active:scale-95"
          >
            Conectar Número
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              professionals={professionals}
              onEdit={() => openEditModal(inst)}
              onToggleAgent={() => toggleAgent(inst)}
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

interface InstanceCardProps {
  instance: WhatsAppInstance;
  professionals: Professional[];
  onEdit: () => void;
  onToggleAgent: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  key?: any;
}

function InstanceCard({
  instance,
  professionals,
  onEdit,
  onToggleAgent,
  onRefresh,
}: InstanceCardProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState(instance.status);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const linkedProf = professionals.find((p) => p.id === instance.professionalId);
  const agentEnabled = instance.agent?.enabled ?? true;

  const createAndConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: instance.instanceName, prompt: instance.prompt }),
      });
      const data = await res.json();
      if (data.qrcode && data.qrcode.base64) {
        setQrCode(data.qrcode.base64);
        setStatus('connecting');
        await updateDoc(doc(db, 'whatsapp_instances', instance.id), { status: 'connecting' });
      } else if (data.instance?.status === 'open' || data.instance?.state === 'open') {
        setStatus('open');
        await updateDoc(doc(db, 'whatsapp_instances', instance.id), { status: 'open' });
      } else if (data.error && data.error.includes('already exists')) {
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
      const response = await fetch(`/api/evolution/instance/${instance.instanceName}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        console.error('Evolution Delete failed:', await response.text());
      }
      await deleteDoc(doc(db, 'whatsapp_instances', instance.id));
      onRefresh();
    } catch (e) {
      console.error('Error deleting instance:', e);
    } finally {
      setDeleting(false);
      setShowConfirmDelete(false);
    }
  };

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
              <button
                onClick={onToggleAgent}
                title={agentEnabled ? 'Pausar agente IA' : 'Ativar agente IA'}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  agentEnabled
                    ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-slate-400 hover:bg-slate-100'
                )}
              >
                {agentEnabled ? <Bot size={16} /> : <BotOff size={16} />}
              </button>
              <button onClick={onEdit} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                <Edit2 size={16} />
              </button>
              <button disabled={deleting} onClick={() => setShowConfirmDelete(true)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                {deleting ? <RefreshCcw size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {linkedProf ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-widest rounded-md">
                <Link size={12} /> {linkedProf.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-md">
                Clínica (Geral)
              </span>
            )}

            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md',
                status === 'open'
                  ? 'bg-emerald-50 text-emerald-700'
                  : status === 'connecting'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
              )}
            >
              {status === 'open' ? 'Conectado' : status === 'connecting' ? 'Aguardando QR' : 'Desconectado'}
            </span>

            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md',
                agentEnabled
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              )}
            >
              {agentEnabled ? <Bot size={12} /> : <BotOff size={12} />}
              IA {agentEnabled ? 'ativa' : 'pausada'}
            </span>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Bot size={14} /> Prompt do Agente
            </h4>
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
              <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> testar conexão
            </button>
          </div>
        ) : status === 'connecting' && qrCode ? (
          <div className="text-center w-full">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mx-auto w-48 h-48 mb-4">
              <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full" />
            </div>
            <button disabled={loading} onClick={checkStatus} className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-colors">
              <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
              Já escaneei
            </button>
          </div>
        ) : (
          <div className="text-center w-full">
            <div className="w-16 h-16 bg-slate-100 text-slate-300 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <QrCode size={28} />
            </div>
            <p className="text-xs text-slate-400 font-medium mb-4">Instância desconectada. Clique para gerar o QR Code.</p>
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
                <button onClick={() => setShowConfirmDelete(false)} disabled={deleting} className="flex-1 py-2.5 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancelar
                </button>
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

function InstanceModal({
  clinicId,
  existing,
  professionals,
  onClose,
  onSuccess,
}: {
  clinicId: string;
  existing: WhatsAppInstance | null;
  professionals: Professional[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const initialAgent: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...(existing?.agent ?? {}) };

  const [name, setName] = useState(existing?.name || '');
  const [professionalId, setProfessionalId] = useState(existing?.professionalId || '');
  const [prompt, setPrompt] = useState(
    existing?.prompt ||
      'Você é o assistente virtual da clínica. Seja educado e ajude os pacientes a marcar consultas.'
  );
  const [agent, setAgent] = useState<AgentConfig>(initialAgent);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'identity' | 'agent' | 'hours'>('identity');

  const updateAgent = (patch: Partial<AgentConfig>) => setAgent((c) => ({ ...c, ...patch }));
  const updateHours = (patch: Partial<NonNullable<AgentConfig['workingHours']>>) =>
    setAgent((c) => ({
      ...c,
      workingHours: {
        ...(c.workingHours ?? DEFAULT_AGENT_CONFIG.workingHours!),
        ...patch,
      },
    }));

  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        clinicId,
        name,
        professionalId: professionalId || null,
        prompt,
        agent,
        updatedAt: new Date().toISOString(),
      };

      if (existing) {
        await updateDoc(doc(db, 'whatsapp_instances', existing.id), data);
      } else {
        const slugifiedName = slugify(name);
        const instanceName = slugifiedName
          ? `${slugifiedName}-${clinicId.substring(0, 5)}`
          : `wa-${clinicId.substring(0, 5)}-${Date.now().toString(36)}`;
        await addDoc(collection(db, 'whatsapp_instances'), {
          ...data,
          instanceName,
          status: 'disconnected',
          createdAt: new Date().toISOString(),
        });
      }
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="p-6 md:p-8 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-xl font-bold tracking-tight text-slate-900">
                {existing ? 'Editar Instância' : 'Nova Instância WhatsApp'}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {existing ? 'Atualize as configurações' : 'Configure o número e o agente IA'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
              <X size={20} className="text-slate-300" />
            </button>
          </div>

          <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
            {(
              [
                ['identity', 'Identidade', <Phone size={14} key="i" />],
                ['agent', 'Agente IA', <Sparkles size={14} key="a" />],
                ['hours', 'Horários', <Clock size={14} key="h" />],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
                  tab === key ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 flex-1">
          {tab === 'identity' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Instância</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-sm text-slate-900" placeholder="Ex: Recepção Central" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Vincular a Profissional (Opcional)</label>
                  <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-sm text-slate-900 appearance-none cursor-pointer">
                    <option value="">Clínica Geral (Todos os Serviços)</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Prompt da Inteligência Artificial</label>
                <p className="text-xs text-slate-500 font-medium mb-3 ml-1">
                  Ensine como o agente deve responder. A persona, base de conhecimento e horários são adicionados automaticamente ao contexto.
                </p>
                <textarea required rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all text-sm font-medium text-slate-700 leading-relaxed resize-none" placeholder="Instruções para o agente..." />
              </div>
            </>
          )}

          {tab === 'agent' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-900">Agente IA ativo</p>
                  <p className="text-xs text-slate-500">
                    Quando desligado, mensagens chegam mas a IA não responde. Pode ser pausado também por conversa.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateAgent({ enabled: !agent.enabled })}
                  className={cn('relative w-12 h-7 rounded-full transition-colors shrink-0', agent.enabled ? 'bg-emerald-500' : 'bg-slate-300')}
                >
                  <span className={cn('absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform', agent.enabled ? 'left-6' : 'left-1')} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Modelo Gemini</label>
                  <select
                    value={agent.model || 'gemini-2.5-flash'}
                    onChange={(e) => updateAgent({ model: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-sm text-slate-900 cursor-pointer"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (rápido)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (mais inteligente)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Persona / Tom</label>
                  <input
                    type="text"
                    value={agent.persona || ''}
                    onChange={(e) => updateAgent({ persona: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-sm text-slate-900"
                    placeholder="Ex: jovem, descontraído e empático"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Delay mín. (s)</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={agent.responseDelayMin ?? 2}
                    onChange={(e) => updateAgent({ responseDelayMin: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-sm text-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Delay máx. (s)</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={agent.responseDelayMax ?? 6}
                    onChange={(e) => updateAgent({ responseDelayMax: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-sm text-slate-900"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl w-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agent.showTyping !== false}
                      onChange={(e) => updateAgent({ showTyping: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">Mostrar "digitando…"</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Base de Conhecimento (RAG simples)
                </label>
                <p className="text-xs text-slate-500 font-medium mb-2 ml-1">
                  FAQ, valores, procedimentos, endereço, formas de pagamento. Esse texto é injetado no contexto do agente em toda conversa.
                </p>
                <textarea
                  rows={6}
                  value={agent.knowledgeBase || ''}
                  onChange={(e) => updateAgent({ knowledgeBase: e.target.value })}
                  className="w-full p-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all text-sm font-medium text-slate-700 leading-relaxed resize-none"
                  placeholder="Ex: Aceitamos PIX e cartão. Endereço: Rua X, 123. Procedimentos comuns: limpeza (R$ 150), avaliação (grátis)."
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mensagem de Fallback</label>
                <input
                  type="text"
                  value={agent.fallbackMessage || ''}
                  onChange={(e) => updateAgent({ fallbackMessage: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-sm text-slate-900"
                  placeholder="Mensagem enviada quando o agente falha"
                />
              </div>
            </div>
          )}

          {tab === 'hours' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-slate-900">Restringir horário de atendimento</p>
                  <p className="text-xs text-slate-500">
                    Fora do horário, a IA envia uma mensagem padrão e não tenta responder.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateHours({ enabled: !agent.workingHours?.enabled })}
                  className={cn('relative w-12 h-7 rounded-full transition-colors shrink-0', agent.workingHours?.enabled ? 'bg-emerald-500' : 'bg-slate-300')}
                >
                  <span className={cn('absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform', agent.workingHours?.enabled ? 'left-6' : 'left-1')} />
                </button>
              </div>

              <div className={cn('space-y-6 transition-opacity', !agent.workingHours?.enabled && 'opacity-40 pointer-events-none')}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Início</label>
                    <input
                      type="time"
                      value={agent.workingHours?.start || '08:00'}
                      onChange={(e) => updateHours({ start: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none font-semibold text-sm text-slate-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fim</label>
                    <input
                      type="time"
                      value={agent.workingHours?.end || '18:00'}
                      onChange={(e) => updateHours({ end: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none font-semibold text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">
                    Dias da Semana
                  </label>
                  <div className="flex gap-2">
                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => {
                      const active = agent.workingHours?.weekdays.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            const wd = new Set<number>(agent.workingHours?.weekdays ?? []);
                            if (wd.has(i)) wd.delete(i);
                            else wd.add(i);
                            updateHours({ weekdays: Array.from(wd).sort((a, b) => a - b) });
                          }}
                          className={cn(
                            'flex-1 h-12 rounded-xl text-sm font-bold transition-all',
                            active ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Mensagem fora do horário
                  </label>
                  <textarea
                    rows={3}
                    value={agent.workingHours?.outOfHoursMessage || ''}
                    onChange={(e) => updateHours({ outOfHoursMessage: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none text-sm font-medium text-slate-700 resize-none"
                  />
                </div>
              </div>
            </div>
          )}

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
