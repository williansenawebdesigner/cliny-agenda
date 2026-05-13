import { useState, useEffect, FormEvent } from 'react';
import { Bot, BotOff, QrCode, RefreshCcw, Plus, X, Phone, Trash2, Edit2, Link, Clock, Sparkles, MessageCircle, AlertTriangle, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../lib/api';
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
      const data = await api.get<any>('/api/evolution/config');
      setConfig(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [instData, profData] = await Promise.all([
        api.get<{ instances: WhatsAppInstance[] }>('/api/whatsapp/instances'),
        api.get<{ professionals: Professional[] }>('/api/professionals'),
      ]);
      setInstances(instData.instances);
      setProfessionals(profData.professionals);
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
    try {
      await api.put(`/api/whatsapp/instances/${inst.id}`, {
        agent: { ...(inst.agent ?? DEFAULT_AGENT_CONFIG), enabled: !cur },
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  if (!config.hasUrl || !config.hasApiKey) {
    return (
      <div className="max-w-4xl space-y-8">
        <header>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Agentes WhatsApp</h2>
          <p className="text-slate-400 font-medium mt-1 text-sm uppercase tracking-widest">Configuração do Sistema</p>
        </header>
        <div className="p-10 bg-amber-50/50 border border-amber-100 rounded-3xl flex items-center gap-6">
           <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm">
              <AlertTriangle size={32} />
           </div>
           <div>
              <h3 className="text-amber-900 font-bold mb-1 text-lg">Variáveis de Ambiente Faltando</h3>
              <p className="text-amber-700 text-sm font-medium leading-relaxed">
                As variáveis da Evolution API (URL e Global API Key) não estão configuradas no ambiente Vercel/Local.
              </p>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-between gap-6 md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Conexões WhatsApp</h2>
          <p className="text-slate-400 font-medium mt-1 text-sm uppercase tracking-widest">Gestão de instâncias e IA</p>
        </div>
        <button
          onClick={openNewModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-100 transition-all font-bold active:scale-95 shrink-0 text-sm"
        >
          <Plus size={20} />
          <span>Conectar Número</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <RefreshCcw className="animate-spin text-emerald-500 w-10 h-10" />
        </div>
      ) : instances.length === 0 ? (
        <div className="bg-slate-50/50 rounded-3xl p-20 text-center flex flex-col items-center border border-dashed border-slate-100">
          <div className="w-20 h-20 bg-white border border-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mb-8 shadow-sm">
            <Phone size={36} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">Nenhuma instância encontrada</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-10 leading-relaxed font-medium">
            Conecte seu WhatsApp para que o Cliny possa realizar agendamentos automáticos e atender seus pacientes.
          </p>
          <button
            onClick={openNewModal}
            className="bg-slate-900 hover:bg-slate-800 text-white px-10 py-4 rounded-2xl font-bold shadow-xl shadow-slate-200 transition-all active:scale-95"
          >
            Começar agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
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

function InstanceCard({ instance, professionals, onEdit, onToggleAgent, onRefresh }: { instance: WhatsAppInstance, professionals: Professional[], onEdit: () => void, onToggleAgent: () => void, onRefresh: () => void }) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState(instance.status);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const linkedProf = professionals.find((p) => p.id === instance.professionalId);
  const agentEnabled = instance.agent?.enabled ?? true;

  const createAndConnect = async () => {
    setLoading(true);
    try {
      const data = await api.post<any>('/api/evolution/instance', { 
        instanceName: instance.instanceName, 
        prompt: instance.prompt 
      });
      if (data.qrcode?.base64) {
        setQrCode(data.qrcode.base64);
        setStatus('connecting');
      } else if (data.instance?.status === 'open' || data.instance?.state === 'open') {
        setStatus('open');
        setQrCode(null);
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
      const data = await api.get<any>(`/api/evolution/instance/${instance.instanceName}/connection`);
      if (data?.instance?.state === 'open') {
        setStatus('open');
        setQrCode(null);
        await api.put(`/api/whatsapp/instances/${instance.id}`, { status: 'open' });
      } else if (data?.base64) {
        setStatus('connecting');
        setQrCode(data.base64);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const deleteInstance = async () => {
    if (!confirm('Tem certeza? Isso removerá a conexão do WhatsApp.')) return;
    setDeleting(true);
    try {
      await api.delete(`/api/whatsapp/instances/${instance.id}`);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-xl shadow-slate-100/50">
      <div className="flex-1 p-10 flex flex-col justify-between">
        <div className="space-y-8">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{instance.name}</h3>
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">ID: {instance.instanceName}</p>
            </div>
            <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl">
              <button
                onClick={onToggleAgent}
                className={cn(
                  'p-2.5 rounded-xl transition-all',
                  agentEnabled
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                {agentEnabled ? <Bot size={18} /> : <BotOff size={18} />}
              </button>
              <button onClick={onEdit} className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
                <Edit2 size={18} />
              </button>
              <button disabled={deleting} onClick={deleteInstance} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                {deleting ? <RefreshCcw size={18} className="animate-spin" /> : <Trash2 size={18} />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <Link size={12} className="text-emerald-500" />
                {linkedProf ? linkedProf.name : 'Atendimento Geral'}
             </div>
             <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border",
                status === 'open' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
             )}>
                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", status === 'open' ? "bg-emerald-500" : "bg-amber-500")} />
                {status === 'open' ? 'Online' : 'Conectando'}
             </div>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100/50">
             <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personalidade da IA</span>
             </div>
             <p className="text-sm text-slate-600 font-bold italic leading-relaxed line-clamp-3">"{instance.prompt}"</p>
          </div>
        </div>
      </div>

      <div className="w-full md:w-96 bg-slate-50/50 border-t md:border-t-0 md:border-l border-slate-100 p-10 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-slate-50/30">
        {status === 'open' ? (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-emerald-100 animate-pulse">
              <Bot size={42} />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-xl tracking-tight">Ativo no WhatsApp</h4>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Sincronizado com Evolution API</p>
            </div>
            <button onClick={checkStatus} disabled={loading} className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 mx-auto shadow-sm">
               <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
               Verificar Status
            </button>
          </div>
        ) : qrCode ? (
          <div className="text-center w-full space-y-8">
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-2xl mx-auto w-56 h-56 relative overflow-hidden group">
               <img src={qrCode} alt="WhatsApp QR" className="w-full h-full" />
               <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-bold">ESCANEIE AGORA</div>
               </div>
            </div>
            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Escaneie o código com seu WhatsApp</p>
              <button onClick={checkStatus} disabled={loading} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95">
                <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                Confirmar Conexão
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-8">
            <div className="w-24 h-24 bg-white border border-slate-100 rounded-[2rem] flex items-center justify-center mx-auto text-slate-200 shadow-xl">
              <QrCode size={42} />
            </div>
            <div className="space-y-2">
               <h4 className="font-bold text-slate-900 text-lg">Número Desconectado</h4>
               <p className="text-xs text-slate-400 font-medium">Clique abaixo para vincular seu aparelho.</p>
            </div>
            <button onClick={createAndConnect} disabled={loading} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3">
              {loading ? <RefreshCcw className="animate-spin" size={18} /> : <QrCode size={18} />}
              Vincular WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InstanceModal({ clinicId, existing, professionals, onClose, onSuccess }: { clinicId: string, existing: WhatsAppInstance | null, professionals: Professional[], onClose: () => void, onSuccess: () => void }) {
  const initialAgent: AgentConfig = { ...DEFAULT_AGENT_CONFIG, ...(existing?.agent ?? {}) };

  const [name, setName] = useState(existing?.name || '');
  const [professionalId, setProfessionalId] = useState(existing?.professionalId || '');
  const [prompt, setPrompt] = useState(existing?.prompt || 'Você é o assistente virtual da clínica Cliny. Seja educado, use um tom profissional porém amigável. Ajude os pacientes a marcar consultas e tirar dúvidas básicas.');
  const [agent, setAgent] = useState<AgentConfig>(initialAgent);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'identity' | 'agent' | 'config'>('identity');

  const updateAgent = (patch: Partial<AgentConfig>) => setAgent((c) => ({ ...c, ...patch }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        name,
        professionalId: professionalId || null,
        prompt,
        agent,
      };

      if (existing) {
        await api.put(`/api/whatsapp/instances/${existing.id}`, data);
      } else {
        await api.post('/api/whatsapp/instances', { ...data, clinicId });
      }
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-[2.5rem] shadow-2xl flex flex-col"
      >
        <div className="p-8 md:p-10 border-b border-slate-50 bg-white z-10 shrink-0">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                <Sparkles size={28} />
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  {existing ? 'Configurações' : 'Novo Agente WhatsApp'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                   Configuração da personalidade e comportamento
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-2xl transition-all">
              <X size={24} className="text-slate-300" />
            </button>
          </div>

          <div className="flex gap-1.5 bg-slate-50 p-1.5 rounded-2xl">
            {[
              { id: 'identity', label: 'Identidade', icon: <Phone size={14} /> },
              { id: 'agent', label: 'IA & Personalidade', icon: <Bot size={14} /> },
              { id: 'config', label: 'Comunicação', icon: <MessageCircle size={14} /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as any)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all',
                  tab === t.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-900'
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8 flex-1 overflow-y-auto no-scrollbar">
          {tab === 'identity' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Identificador da Instância</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-6 py-4.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-slate-900 shadow-inner" placeholder="Ex: Recepção Dra. Maria" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Escopo de Atendimento</label>
                  <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className="w-full px-6 py-4.5 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-slate-900 appearance-none cursor-pointer shadow-inner">
                    <option value="">Atendimento Geral (Toda Clínica)</option>
                    {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Personalidade Principal (System Prompt)</label>
                <textarea required rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full p-6 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl outline-none transition-all text-sm font-bold text-slate-700 leading-relaxed resize-none shadow-inner" />
              </div>
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between p-6 bg-emerald-50/30 border border-emerald-100/30 rounded-3xl">
                <div>
                  <h4 className="font-bold text-slate-900">Agente Ativo</h4>
                  <p className="text-xs text-slate-500 font-medium">Permitir que a IA responda mensagens automaticamente.</p>
                </div>
                <button type="button" onClick={() => updateAgent({ enabled: !agent.enabled })} className={cn('relative w-14 h-8 rounded-full transition-all shadow-inner', agent.enabled ? 'bg-emerald-500' : 'bg-slate-200')}>
                  <span className={cn('absolute top-1.5 w-5 h-5 bg-white rounded-full shadow-lg transition-all', agent.enabled ? 'left-7.5' : 'left-1.5')} />
                </button>
              </div>

              <div className="space-y-4">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Base de Conhecimento Especializada</label>
                 <textarea rows={6} value={agent.knowledgeBase || ''} onChange={(e) => updateAgent({ knowledgeBase: e.target.value })} className="w-full p-6 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl outline-none font-bold text-sm text-slate-700 leading-relaxed resize-none shadow-inner" placeholder="Detalhes sobre localização, convênios, estacionamento, valores, etc." />
              </div>

              <div className="grid grid-cols-2 gap-8">
                 <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Modelo de IA</label>
                    <select value={agent.model || 'gemini-2.5-flash'} onChange={(e) => updateAgent({ model: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm shadow-inner">
                       <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                       <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    </select>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Assinatura</label>
                    <input type="text" value={agent.signature || ''} onChange={(e) => updateAgent({ signature: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm shadow-inner" placeholder="Ex: — Assistente Cliny" />
                 </div>
              </div>
            </div>
          )}

          {tab === 'config' && (
            <div className="space-y-8">
               <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tom de Voz</label>
                    <select value={agent.formality || 'voce'} onChange={(e) => updateAgent({ formality: e.target.value as any })} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm shadow-inner">
                       <option value="voce">Informal (Você)</option>
                       <option value="senhor">Formal (Senhor/a)</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Uso de Emojis</label>
                    <select value={agent.emojiUse || 'light'} onChange={(e) => updateAgent({ emojiUse: e.target.value as any })} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm shadow-inner">
                       <option value="never">Nunca</option>
                       <option value="light">Leve</option>
                       <option value="free">Livre</option>
                    </select>
                  </div>
               </div>
               
               <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Atraso na Resposta (segundos)</label>
                     <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{agent.responseDelayMin}s - {agent.responseDelayMax}s</span>
                  </div>
                  <div className="flex items-center gap-6">
                     <input type="range" min={0} max={30} value={agent.responseDelayMax} onChange={(e) => updateAgent({ responseDelayMax: Number(e.target.value), responseDelayMin: Math.min(agent.responseDelayMin!, Number(e.target.value) - 1) })} className="flex-1 accent-emerald-500" />
                  </div>
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Mensagem de Transbordo (Indisponibilidade)</label>
                  <input type="text" value={agent.fallbackMessage || ''} onChange={(e) => updateAgent({ fallbackMessage: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm shadow-inner" placeholder="Ex: No momento nossos atendentes estão ocupados..." />
               </div>
            </div>
          )}
        </form>

        <div className="p-10 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between shrink-0 rounded-t-[2rem]">
          <button type="button" onClick={onClose} className="text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-all">Cancelar</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-12 py-5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] flex items-center gap-3">
            {submitting ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Salvar Configurações'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
