import { useState, useEffect, FormEvent } from 'react';
import { Bot, BotOff, QrCode, RefreshCcw, Plus, X, Phone, Trash2, Edit2, Link, Sparkles, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../lib/api';
import { WhatsAppInstance, Professional, AgentConfig, DEFAULT_AGENT_CONFIG } from '../types';
import { cn } from '../lib/utils';

export function WhatsAppView({ clinicId }: { clinicId: string }) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<WhatsAppInstance | null>(null);

  useEffect(() => { fetchData(); }, []);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between gap-4 md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Conexões WhatsApp</h2>
          <p className="text-slate-500 font-medium mt-1 text-sm">Gestão de instâncias e agente de IA</p>
        </div>
        <button
          onClick={() => { setEditingInstance(null); setIsModalOpen(true); }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded flex items-center justify-center gap-2 shadow-sm transition-all font-bold active:scale-95 shrink-0 text-sm"
        >
          <Plus size={18} />
          Conectar Número
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <RefreshCcw className="animate-spin text-emerald-500 w-8 h-8" />
        </div>
      ) : instances.length === 0 ? (
        <div className="bg-slate-50 rounded p-16 text-center flex flex-col items-center border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-white border border-slate-200 rounded flex items-center justify-center text-slate-300 mb-6 shadow-sm">
            <Phone size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Nenhuma instância encontrada</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-8 leading-relaxed font-medium">
            Conecte seu WhatsApp para que o Cliny possa realizar agendamentos automáticos.
          </p>
          <button
            onClick={() => { setEditingInstance(null); setIsModalOpen(true); }}
            className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded font-bold shadow-sm transition-all active:scale-95"
          >
            Começar agora
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              professionals={professionals}
              onEdit={() => { setEditingInstance(inst); setIsModalOpen(true); }}
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
            onSuccess={() => { setIsModalOpen(false); fetchData(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function InstanceCard({ instance, professionals, onEdit, onToggleAgent, onRefresh }: {
  instance: WhatsAppInstance;
  professionals: Professional[];
  onEdit: () => void;
  onToggleAgent: () => void;
  onRefresh: () => void;
}) {
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
        prompt: instance.prompt,
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
    <div className="bg-white border border-slate-200 rounded overflow-hidden flex flex-col md:flex-row">
      {/* Left: info */}
      <div className="flex-1 p-6 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{instance.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {instance.instanceName}
            </p>
          </div>
          <div className="flex gap-1 bg-slate-50 p-1 rounded border border-slate-100">
            <button
              onClick={onToggleAgent}
              title={agentEnabled ? 'Desativar agente' : 'Ativar agente'}
              className={cn(
                'p-2 rounded transition-all',
                agentEnabled ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
              )}
            >
              {agentEnabled ? <Bot size={16} /> : <BotOff size={16} />}
            </button>
            <button onClick={onEdit} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all">
              <Edit2 size={16} />
            </button>
            <button disabled={deleting} onClick={deleteInstance} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all">
              {deleting ? <RefreshCcw size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-100 rounded text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <Link size={11} className="text-emerald-500" />
            {linkedProf ? linkedProf.name : 'Atendimento Geral'}
          </span>
          <span className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest border',
            status === 'open'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', status === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500')} />
            {status === 'open' ? 'Online' : 'Desconectado'}
          </span>
        </div>

        <div className="bg-slate-50 rounded p-4 border border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} className="text-emerald-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personalidade</span>
          </div>
          <p className="text-sm text-slate-600 italic leading-relaxed line-clamp-2">"{instance.prompt}"</p>
        </div>
      </div>

      {/* Right: connection */}
      <div className="w-full md:w-72 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 p-6 flex flex-col items-center justify-center gap-4">
        {status === 'open' ? (
          <>
            <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm">
              <Bot size={28} />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-900">Ativo no WhatsApp</p>
              <p className="text-xs text-slate-500 mt-0.5">Evolution API conectada</p>
            </div>
            <button onClick={checkStatus} disabled={loading} className="px-4 py-2 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
              <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
              Verificar Status
            </button>
          </>
        ) : qrCode ? (
          <>
            <div className="bg-white p-3 rounded border border-slate-200 shadow-sm w-48 h-48">
              <img src={qrCode} alt="WhatsApp QR" className="w-full h-full" />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center">
              Escaneie com seu WhatsApp
            </p>
            <button onClick={checkStatus} disabled={loading} className="w-full py-2.5 bg-emerald-600 text-white rounded font-bold shadow-sm hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 active:scale-95">
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              Confirmar Conexão
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-white border border-slate-200 rounded flex items-center justify-center text-slate-300 shadow-sm">
              <QrCode size={28} />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-900">Desconectado</p>
              <p className="text-xs text-slate-500 mt-0.5">Clique para vincular o aparelho</p>
            </div>
            <button onClick={createAndConnect} disabled={loading} className="w-full py-2.5 bg-slate-900 text-white rounded font-bold shadow-sm hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2">
              {loading ? <RefreshCcw className="animate-spin" size={16} /> : <QrCode size={16} />}
              Vincular WhatsApp
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function InstanceModal({ clinicId, existing, professionals, onClose, onSuccess }: {
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
      'Você é o assistente virtual da clínica. Seja educado, profissional e amigável. Ajude os pacientes a marcar consultas e tirar dúvidas básicas.'
  );
  const [agent, setAgent] = useState<AgentConfig>(initialAgent);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'identity' | 'agent'>('identity');

  const updateAgent = (patch: Partial<AgentConfig>) => setAgent((c) => ({ ...c, ...patch }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = { name, professionalId: professionalId || null, prompt, agent };
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
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative bg-white w-full max-w-2xl max-h-[92vh] overflow-hidden rounded shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {existing ? 'Configurações da Instância' : 'Nova Instância WhatsApp'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Agente de IA para agendamento
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded transition-all">
              <X size={20} className="text-slate-400" />
            </button>
          </div>

          <div className="flex gap-1 bg-slate-100 p-1 rounded">
            {([
              { id: 'identity', label: 'Identidade', icon: <Phone size={13} /> },
              { id: 'agent', label: 'Agente', icon: <Bot size={13} /> },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-bold transition-all',
                  tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
          {tab === 'identity' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome da Instância</label>
                  <input
                    type="text" required value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Recepção Principal"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-semibold text-sm text-slate-900"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Profissional Vinculado</label>
                  <select
                    value={professionalId}
                    onChange={(e) => setProfessionalId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-semibold text-sm text-slate-900 cursor-pointer"
                  >
                    <option value="">Toda a Clínica</option>
                    {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Personalidade (System Prompt)
                </label>
                <textarea
                  required rows={7}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all text-sm font-medium text-slate-700 leading-relaxed resize-none"
                />
                <p className="text-[10px] text-slate-400 font-medium">
                  Defina a persona e o tom de voz do agente. Use um nome para o assistente e descreva como ele deve se comportar.
                </p>
              </div>
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-5">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Agente Ativo</p>
                  <p className="text-xs text-slate-500 mt-0.5">O agente responde mensagens automaticamente.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateAgent({ enabled: !agent.enabled })}
                  className={cn('relative w-12 h-6 rounded-full transition-all', agent.enabled ? 'bg-emerald-500' : 'bg-slate-300')}
                >
                  <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all', agent.enabled ? 'left-7' : 'left-1')} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Buffer de Mensagens</p>
                  <p className="text-xs text-slate-500 mt-0.5">Agrupa mensagens seguidas antes de responder.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateAgent({ messageBufferEnabled: agent.messageBufferEnabled === false })}
                  className={cn('relative w-12 h-6 rounded-full transition-all', agent.messageBufferEnabled !== false ? 'bg-emerald-500' : 'bg-slate-300')}
                >
                  <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all', agent.messageBufferEnabled !== false ? 'left-7' : 'left-1')} />
                </button>
              </div>

              {/* Model + formality */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Modelo de IA</label>
                  <select
                    value={agent.model || 'gemini-2.5-flash'}
                    onChange={(e) => updateAgent({ model: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded font-semibold text-sm text-slate-900 outline-none cursor-pointer"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tratamento</label>
                  <select
                    value={agent.formality || 'voce'}
                    onChange={(e) => updateAgent({ formality: e.target.value as any })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded font-semibold text-sm text-slate-900 outline-none cursor-pointer"
                  >
                    <option value="voce">Você (informal)</option>
                    <option value="senhor">Senhor/a (formal)</option>
                  </select>
                </div>
              </div>

              {/* Emoji + delay */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Emojis</label>
                  <select
                    value={agent.emojiUse || 'light'}
                    onChange={(e) => updateAgent({ emojiUse: e.target.value as any })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded font-semibold text-sm text-slate-900 outline-none cursor-pointer"
                  >
                    <option value="never">Nunca</option>
                    <option value="light">Leve (1 por resposta)</option>
                    <option value="free">Livre</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Delay de resposta
                    <span className="ml-2 text-emerald-600 font-bold">{agent.responseDelayMax ?? 6}s</span>
                  </label>
                  <input
                    type="range" min={1} max={30}
                    value={agent.responseDelayMax ?? 6}
                    onChange={(e) => updateAgent({ responseDelayMax: Number(e.target.value) })}
                    className="w-full accent-emerald-500 mt-1"
                  />
                </div>
              </div>

              {/* Signature */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Assinatura</label>
                <input
                  type="text"
                  value={agent.signature || ''}
                  onChange={(e) => updateAgent({ signature: e.target.value })}
                  placeholder="Ex: — Assistente Cliny"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded font-semibold text-sm text-slate-900 outline-none"
                />
              </div>

              {/* Knowledge base */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Base de Conhecimento
                </label>
                <textarea
                  rows={4}
                  value={agent.knowledgeBase || ''}
                  onChange={(e) => updateAgent({ knowledgeBase: e.target.value })}
                  className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded outline-none text-sm text-slate-700 leading-relaxed resize-none font-medium"
                  placeholder="Endereço, convênios, valores, estacionamento, horário de funcionamento…"
                />
              </div>

              {/* Fallback message */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Mensagem de Fallback
                </label>
                <input
                  type="text"
                  value={agent.fallbackMessage || ''}
                  onChange={(e) => updateAgent({ fallbackMessage: e.target.value })}
                  placeholder="Mensagem enviada quando o agente encontra erro"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded font-semibold text-sm text-slate-900 outline-none"
                />
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <button type="button" onClick={onClose} className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-all px-3 py-2 rounded hover:bg-slate-200">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold rounded shadow-sm transition-all active:scale-[0.98] flex items-center gap-2 text-sm"
          >
            {submitting
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><MessageCircle size={15} /> Salvar</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}
