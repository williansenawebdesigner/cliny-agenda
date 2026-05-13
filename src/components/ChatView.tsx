import { useState, useEffect, useRef, FormEvent, useMemo, useCallback } from 'react';
import { WhatsAppInstance, WhatsAppConversation } from '../types';
import { Send, User, Play, Pause, Bot, BotOff, Check, CheckCheck, RefreshCcw, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../lib/api';

interface RemoteMessage {
  id: string;
  instanceName: string;
  clinicId: string;
  remoteJid: string;
  fromMe: boolean;
  messageType: string;
  content: string;
  audioBase64: string | null;
  messageTimestamp: number;
  source?: 'user' | 'agent' | 'whatsapp';
}

interface PendingMessage {
  id: string;
  remoteJid: string;
  content: string;
  fromMe: true;
  messageTimestamp: number;
  status: 'sending' | 'sent' | 'failed';
  pending: true;
}

type ChatMessage =
  | (RemoteMessage & { pending?: false })
  | PendingMessage;

export function ChatView({ clinicId }: { clinicId: string }) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [messages, setMessages] = useState<RemoteMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const data = await api.get<{ instances: WhatsAppInstance[] }>('/api/whatsapp/instances');
      setInstances(data.instances);
      if (data.instances.length > 0 && !selectedInstance) {
        setSelectedInstance(data.instances[0]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedInstance]);

  const fetchConversations = useCallback(async () => {
    if (!selectedInstance) return;
    try {
      const data = await api.get<{ conversations: WhatsAppConversation[] }>(`/api/whatsapp/conversations?instanceName=${selectedInstance.instanceName}`);
      setConversations(data.conversations.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)));
    } catch (e) {
      console.error(e);
    }
  }, [selectedInstance]);

  const fetchMessages = useCallback(async () => {
    if (!selectedInstance || !selectedJid) return;
    try {
      const data = await api.get<{ messages: RemoteMessage[] }>(`/api/whatsapp/messages?instanceName=${selectedInstance.instanceName}&remoteJid=${selectedJid}`);
      const msgs = data.messages.sort((a, b) => a.messageTimestamp - b.messageTimestamp);
      setMessages(msgs);

      // Reconcile pending
      setPending((cur) =>
        cur.filter((p) => {
          const match = msgs.some(
            (m) =>
              m.fromMe &&
              m.remoteJid === p.remoteJid &&
              m.content === p.content &&
              Math.abs(m.messageTimestamp - p.messageTimestamp) < 60
          );
          return !match;
        })
      );
    } catch (e) {
      console.error(e);
    }
  }, [selectedInstance, selectedJid]);

  useEffect(() => {
    fetchInstances().then(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedInstance) {
      fetchConversations();
      const interval = setInterval(fetchConversations, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedInstance, fetchConversations]);

  useEffect(() => {
    if (selectedInstance && selectedJid) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedInstance, selectedJid, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending, selectedJid]);

  const currentConversation = useMemo(
    () => conversations.find((c) => c.remoteJid === selectedJid) ?? null,
    [conversations, selectedJid]
  );

  const filteredMessages: ChatMessage[] = useMemo(() => {
    if (!selectedJid) return [];
    const remote = messages.filter((m) => m.remoteJid === selectedJid);
    const pendingForJid = pending.filter((p) => p.remoteJid === selectedJid);
    return [...remote, ...pendingForJid].sort(
      (a, b) => a.messageTimestamp - b.messageTimestamp
    );
  }, [messages, pending, selectedJid]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !selectedJid || !selectedInstance) return;

    const tempId = `pending-${Date.now()}`;
    const optimistic: PendingMessage = {
      id: tempId,
      remoteJid: selectedJid,
      content: text,
      fromMe: true,
      messageTimestamp: Math.floor(Date.now() / 1000),
      status: 'sending',
      pending: true,
    };
    setPending((cur) => [...cur, optimistic]);
    setInputText('');

    try {
      await api.post('/api/evolution/message/sendText', {
        instanceName: selectedInstance.instanceName,
        number: selectedJid.split('@')[0],
        text,
        clinicId,
        source: 'user',
      });
      setPending((cur) =>
        cur.map((p) => (p.id === tempId ? { ...p, status: 'sent' } : p))
      );
      fetchMessages();
    } catch (err) {
      console.error('[ChatView] send failed', err);
      setPending((cur) =>
        cur.map((p) => (p.id === tempId ? { ...p, status: 'failed' } : p))
      );
    }
  };

  const toggleAgentForConversation = async () => {
    if (!selectedInstance || !selectedJid) return;
    const newValue = !(currentConversation?.agentEnabled ?? selectedInstance.agent?.enabled ?? true);
    try {
      await api.put(`/api/whatsapp/conversations/status`, {
        instanceName: selectedInstance.instanceName,
        remoteJid: selectedJid,
        agentEnabled: newValue
      });
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleAgentForInstance = async () => {
    if (!selectedInstance) return;
    const cur = selectedInstance.agent?.enabled ?? true;
    try {
      await api.put(`/api/whatsapp/instances/${selectedInstance.id}`, {
        agent: { ...(selectedInstance.agent ?? {}), enabled: !cur }
      });
      fetchInstances();
    } catch (e) {
      console.error(e);
    }
  };

  const agentEnabledForConv = currentConversation?.agentEnabled ?? selectedInstance?.agent?.enabled ?? true;
  const agentEnabledForInstance = selectedInstance?.agent?.enabled ?? true;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white rounded border border-slate-100">
         <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carregando Conversas...</p>
         </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-160px)] flex bg-white border border-slate-100 rounded overflow-hidden shadow-2xl shadow-slate-100/50">
      {/* Sidebar */}
      <div className="w-96 border-r border-slate-50 flex flex-col bg-slate-50/30 shrink-0">
        <div className="p-8 border-b border-slate-50 bg-white space-y-6">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-xl font-bold text-slate-900 tracking-tight">Conversas</h3>
             <button onClick={() => { fetchInstances(); fetchConversations(); }} className="p-2 hover:bg-slate-50 rounded text-slate-400 transition-all">
                <RefreshCcw size={16} />
             </button>
          </div>

          <select
            value={selectedInstance?.id || ''}
            onChange={(e) => setSelectedInstance(instances.find((i) => i.id === e.target.value) || null)}
            className="w-full bg-slate-50 border border-slate-100 rounded px-5 py-3.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 shadow-inner transition-all appearance-none cursor-pointer"
          >
            {instances.length === 0 && <option value="">Nenhuma conta ativa</option>}
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>

          {selectedInstance && (
            <button
              onClick={toggleAgentForInstance}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm',
                agentEnabledForInstance ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-slate-100 text-slate-400'
              )}
            >
              <div className="flex items-center gap-3">
                 {agentEnabledForInstance ? <Bot size={16} /> : <BotOff size={16} />}
                 IA GLOBAL: {agentEnabledForInstance ? 'ATIVA' : 'PAUSADA'}
              </div>
              <div className={cn("w-1.5 h-1.5 rounded-full", agentEnabledForInstance ? "bg-white animate-pulse" : "bg-slate-300")} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar py-4">
          {conversations.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded flex items-center justify-center text-slate-200 mb-6 shadow-sm">
                 <MessageSquare size={24} />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest max-w-[200px] leading-relaxed">Nenhuma conversa ativa no momento.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const convAgentEnabled = conv.agentEnabled ?? selectedInstance?.agent?.enabled ?? true;
              const active = selectedJid === conv.remoteJid;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedJid(conv.remoteJid)}
                  className={cn(
                    'mx-4 my-1 p-4 rounded cursor-pointer transition-all flex items-center gap-4 group',
                    active ? 'bg-white shadow-xl shadow-slate-100 scale-[1.02]' : 'hover:bg-white/50'
                  )}
                >
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-12 h-12 rounded flex items-center justify-center transition-all",
                      active ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                    )}>
                      <User size={22} />
                    </div>
                    <div className={cn(
                      'absolute -bottom-1 -right-1 w-5 h-5 rounded border-2 border-white flex items-center justify-center shadow-sm transition-all',
                      convAgentEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                    )}>
                      {convAgentEnabled ? <Bot size={10} className="text-white" /> : <BotOff size={10} className="text-white" />}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                       <p className={cn("text-sm font-bold truncate tracking-tight", active ? "text-slate-900" : "text-slate-700")}>
                         {conv.contactName || `+${conv.remoteJid.split('@')[0]}`}
                       </p>
                       {conv.lastMessageAt && (
                         <span className="text-[9px] font-bold text-slate-400 shrink-0 uppercase tracking-tighter">
                           {new Date(conv.lastMessageAt * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                         </span>
                       )}
                    </div>
                    <p className="text-xs text-slate-400 truncate font-medium">
                      {conv.lastMessagePreview || 'Nenhuma mensagem...'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0 relative">
        {selectedJid && selectedInstance ? (
          <>
            <div className="h-24 px-10 bg-white border-b border-slate-50 flex items-center justify-between shrink-0 z-10">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                  <User size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 truncate text-lg tracking-tight">
                    {currentConversation?.contactName || `+${selectedJid.split('@')[0]}`}
                  </h3>
                  <div className="flex items-center gap-2">
                     <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", agentEnabledForConv ? "bg-emerald-500" : "bg-amber-500")} />
                     <p className={cn("text-[10px] font-bold uppercase tracking-widest", agentEnabledForConv ? "text-emerald-600" : "text-amber-600")}>
                       {agentEnabledForConv ? 'IA Ativa neste chat' : 'Controle Manual'}
                     </p>
                  </div>
                </div>
              </div>
              <button
                onClick={toggleAgentForConversation}
                className={cn(
                  'flex items-center gap-3 px-6 py-3 rounded text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm',
                  agentEnabledForConv ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                )}
              >
                {agentEnabledForConv ? <Bot size={16} /> : <BotOff size={16} />}
                {agentEnabledForConv ? 'Pausar IA' : 'Ativar IA'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-6 no-scrollbar">
              <AnimatePresence initial={false}>
                {filteredMessages.map((msg) => {
                  const isPending = 'pending' in msg && msg.pending;
                  const fromMe = msg.fromMe;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className={cn(
                        'flex flex-col max-w-[80%]',
                        fromMe ? 'ml-auto items-end' : 'mr-auto items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'px-6 py-4 rounded-[1.5rem] shadow-xl text-sm font-medium break-words whitespace-pre-wrap leading-relaxed',
                          fromMe
                            ? 'bg-slate-900 text-white rounded-tr-none'
                            : 'bg-white text-slate-700 rounded-tl-none border border-slate-100',
                          isPending && msg.status === 'failed' && 'bg-red-500 text-white'
                        )}
                      >
                        {msg.content}
                        {!isPending && (msg as RemoteMessage).audioBase64 && (
                          <AudioPlayer base64={(msg as RemoteMessage).audioBase64!} isFromMe={fromMe} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-2 mt-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {new Date(msg.messageTimestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {fromMe && isPending && (
                          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">
                            {msg.status === 'sending' ? 'Enviando...' : 'Enviado'}
                          </span>
                        )}
                        {fromMe && !isPending && (
                           <div className="flex items-center gap-1.5">
                              <CheckCheck size={12} className="text-emerald-500" />
                              {(msg as RemoteMessage).source === 'agent' && (
                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-md">AGENT IA</span>
                              )}
                           </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            <div className="p-8 px-10 bg-white border-t border-slate-50 shrink-0">
               <form onSubmit={handleSend} className="flex items-center gap-4 bg-slate-50 p-2 rounded border border-slate-100 shadow-inner">
                 <input
                   type="text"
                   value={inputText}
                   onChange={(e) => setInputText(e.target.value)}
                   placeholder={agentEnabledForConv ? 'Intervir na conversa...' : 'Digite sua mensagem...'}
                   className="flex-1 bg-transparent border-none rounded px-6 py-3.5 outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300"
                 />
                 <button
                   type="submit"
                   disabled={!inputText.trim()}
                   className="w-14 h-14 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded flex items-center justify-center transition-all shadow-xl shadow-emerald-100 active:scale-95 shrink-0"
                 >
                   <Send size={22} className="ml-1" />
                 </button>
               </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-20 bg-slate-50/50">
            <div className="w-32 h-32 bg-white rounded-[3rem] flex items-center justify-center text-slate-100 shadow-2xl shadow-slate-100 mb-10 border border-slate-50">
              <MessageSquare size={48} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Centro de Mensagens</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] max-w-sm leading-relaxed">
              Selecione uma conversa ativa ao lado para gerenciar o atendimento ou intervir no agente de IA.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AudioPlayer({ base64, isFromMe }: { base64: string, isFromMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      const audioSrc = base64.startsWith('data:') ? base64 : `data:audio/ogg;base64,${base64}`;
      audioRef.current = new Audio(audioSrc);
      audioRef.current.onended = () => setPlaying(false);
    }
    return () => { audioRef.current?.pause(); };
  }, [base64]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  return (
    <div className={cn(
      "flex items-center gap-4 p-3 rounded mt-4 min-w-[240px] border",
      isFromMe ? "bg-white/10 border-white/10" : "bg-slate-50 border-slate-100"
    )}>
      <button onClick={toggle} className={cn(
        "w-12 h-12 rounded flex items-center justify-center transition-all shadow-sm",
        isFromMe ? "bg-white text-slate-900" : "bg-emerald-500 text-white"
      )}>
        {playing ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
      </button>
      <div className="flex-1 flex flex-col gap-2">
         <div className="flex items-center gap-1">
            {[...Array(12)].map((_, i) => (
              <div key={i} className={cn(
                "w-1 h-3 rounded-full transition-all",
                playing ? "animate-pulse" : "opacity-30",
                isFromMe ? "bg-white" : "bg-emerald-500"
              )} style={{ animationDelay: `${i * 0.1}s`, height: `${Math.random() * 12 + 4}px` }} />
            ))}
         </div>
      </div>
    </div>
  );
}
