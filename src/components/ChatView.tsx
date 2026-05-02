import { useState, useEffect, useRef, FormEvent, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { WhatsAppInstance, WhatsAppConversation } from '../types';
import { Send, Phone, User, Play, Pause, Bot, BotOff, Check, CheckCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

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

function conversationDocId(instanceName: string, jid: string) {
  return `${instanceName}__${jid}`;
}

export function ChatView({ clinicId }: { clinicId: string }) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [messages, setMessages] = useState<RemoteMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load instances for the clinic
  useEffect(() => {
    const q = query(
      collection(db, 'whatsapp_instances'),
      where('clinicId', '==', clinicId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const insts = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as WhatsAppInstance)
      );
      setInstances(insts);
      setSelectedInstance((current) => {
        if (current) {
          return insts.find((i) => i.id === current.id) ?? insts[0] ?? null;
        }
        return insts[0] ?? null;
      });
    });
    return unsub;
  }, [clinicId]);

  // Listen to messages for selected instance
  useEffect(() => {
    if (!selectedInstance) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'whatsapp_messages'),
      where('clinicId', '==', clinicId),
      where('instanceName', '==', selectedInstance.instanceName)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as RemoteMessage))
          .sort((a, b) => a.messageTimestamp - b.messageTimestamp);
        setMessages(msgs);

        // Reconcile pending: drop any pending whose content showed up as fromMe within 60s
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
      },
      (error) => {
        console.error('[ChatView] messages onSnapshot error', error);
      }
    );
    return unsub;
  }, [selectedInstance, clinicId]);

  // Listen to conversations for selected instance
  useEffect(() => {
    if (!selectedInstance) {
      setConversations([]);
      return;
    }
    const q = query(
      collection(db, 'whatsapp_conversations'),
      where('clinicId', '==', clinicId),
      where('instanceName', '==', selectedInstance.instanceName)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const convs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as WhatsAppConversation))
          .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
        setConversations(convs);
      },
      (error) => {
        console.error('[ChatView] conversations onSnapshot error', error);
      }
    );
    return unsub;
  }, [selectedInstance, clinicId]);

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
      const res = await fetch('/api/evolution/message/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: selectedInstance.instanceName,
          number: selectedJid.split('@')[0],
          text,
          clinicId,
          source: 'user',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPending((cur) =>
        cur.map((p) => (p.id === tempId ? { ...p, status: 'sent' } : p))
      );
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
    const ref = doc(
      db,
      'whatsapp_conversations',
      conversationDocId(selectedInstance.instanceName, selectedJid)
    );
    await setDoc(
      ref,
      {
        clinicId,
        instanceName: selectedInstance.instanceName,
        remoteJid: selectedJid,
        agentEnabled: newValue,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  const toggleAgentForInstance = async () => {
    if (!selectedInstance) return;
    const cur = selectedInstance.agent?.enabled ?? true;
    const ref = doc(db, 'whatsapp_instances', selectedInstance.id);
    await setDoc(
      ref,
      {
        agent: {
          ...(selectedInstance.agent ?? {}),
          enabled: !cur,
        },
      },
      { merge: true }
    );
  };

  const agentEnabledForConv =
    currentConversation?.agentEnabled ?? selectedInstance?.agent?.enabled ?? true;
  const agentEnabledForInstance = selectedInstance?.agent?.enabled ?? true;

  return (
    <div className="h-[calc(100vh-140px)] flex bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50 shrink-0">
        <div className="p-3 border-b border-slate-200 bg-white space-y-2">
          <select
            value={selectedInstance?.id || ''}
            onChange={(e) =>
              setSelectedInstance(
                instances.find((i) => i.id === e.target.value) || null
              )
            }
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
          >
            {instances.length === 0 && (
              <option value="">Nenhuma instância conectada</option>
            )}
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
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors',
                agentEnabledForInstance
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              )}
              title="Pausar/retomar agente IA em todas as conversas desta instância"
            >
              {agentEnabledForInstance ? <Bot size={14} /> : <BotOff size={14} />}
              IA da instância: {agentEnabledForInstance ? 'Ativa' : 'Pausada'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-sm font-medium text-slate-400">
              Nenhuma conversa ainda. Envie uma mensagem para o número conectado.
            </div>
          ) : (
            conversations.map((conv) => {
              const convAgentEnabled =
                conv.agentEnabled ?? selectedInstance?.agent?.enabled ?? true;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedJid(conv.remoteJid)}
                  className={cn(
                    'p-3 border-b border-slate-100 cursor-pointer transition-colors flex items-center gap-3',
                    selectedJid === conv.remoteJid
                      ? 'bg-emerald-50'
                      : 'hover:bg-slate-50'
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <User size={18} />
                    </div>
                    <div
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center',
                        convAgentEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                      )}
                      title={convAgentEnabled ? 'Agente IA ativo' : 'Agente IA pausado'}
                    >
                      {convAgentEnabled ? (
                        <Bot size={9} className="text-white" />
                      ) : (
                        <BotOff size={9} className="text-white" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {conv.contactName || `+${conv.remoteJid.split('@')[0]}`}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {conv.lastMessagePreview || '...'}
                    </p>
                  </div>
                  {conv.lastMessageAt && (
                    <span className="text-[10px] font-medium text-slate-400 shrink-0">
                      {new Date(conv.lastMessageAt * 1000).toLocaleTimeString(
                        'pt-BR',
                        { hour: '2-digit', minute: '2-digit' }
                      )}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-[#efeae2] min-w-0">
        {selectedJid && selectedInstance ? (
          <>
            <div className="h-16 px-6 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <User size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 truncate">
                  {currentConversation?.contactName ||
                    `+${selectedJid.split('@')[0]}`}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {agentEnabledForConv ? (
                    <span className="text-emerald-600">Atendimento IA ativo</span>
                  ) : (
                    <span className="text-amber-600">Atendimento manual</span>
                  )}
                </p>
              </div>
              <button
                onClick={toggleAgentForConversation}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors',
                  agentEnabledForConv
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                )}
                title="Pausar/retomar agente IA somente nesta conversa"
              >
                {agentEnabledForConv ? <Bot size={16} /> : <BotOff size={16} />}
                {agentEnabledForConv ? 'IA ativa' : 'IA pausada'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              <AnimatePresence initial={false}>
                {filteredMessages.map((msg) => {
                  const isPending = 'pending' in msg && msg.pending;
                  const fromMe = msg.fromMe;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.12 }}
                      className={cn(
                        'flex flex-col max-w-[70%]',
                        fromMe ? 'ml-auto items-end' : 'mr-auto items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'px-3 py-2 rounded-2xl shadow-sm text-[15px] break-words whitespace-pre-wrap',
                          fromMe
                            ? 'bg-[#d9fdd3] rounded-tr-none text-slate-900'
                            : 'bg-white rounded-tl-none text-slate-900',
                          isPending && msg.status === 'failed' && 'bg-red-100'
                        )}
                      >
                        {msg.content}
                        {!isPending && (msg as RemoteMessage).audioBase64 && (
                          <AudioPlayer base64={(msg as RemoteMessage).audioBase64!} />
                        )}
                      </div>
                      <div className="flex items-center gap-1 px-1 mt-0.5">
                        <span className="text-[10px] text-slate-500 font-medium">
                          {new Date(msg.messageTimestamp * 1000).toLocaleTimeString(
                            'pt-BR',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </span>
                        {fromMe && isPending && msg.status === 'sending' && (
                          <span className="text-[10px] text-slate-400">enviando…</span>
                        )}
                        {fromMe && isPending && msg.status === 'failed' && (
                          <span className="text-[10px] text-red-500 font-bold">
                            falhou — toque para reenviar
                          </span>
                        )}
                        {fromMe && isPending && msg.status === 'sent' && (
                          <Check size={12} className="text-slate-400" />
                        )}
                        {fromMe && !isPending && (
                          <CheckCheck size={12} className="text-emerald-500" />
                        )}
                        {fromMe && !isPending && (msg as RemoteMessage).source === 'agent' && (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <Bot size={10} /> IA
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="p-4 bg-[#f0f2f5] flex items-center gap-3 shrink-0"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  agentEnabledForConv
                    ? 'Mensagem manual (a IA também responde)…'
                    : 'Digite uma mensagem…'
                }
                className="flex-1 bg-white border-none rounded-xl px-5 py-3 outline-none text-sm shadow-sm"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="w-12 h-12 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white rounded-full flex items-center justify-center transition-colors shadow-sm active:scale-95"
              >
                <Send size={18} className="ml-1" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f0f2f5]">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-emerald-500 shadow-sm mb-6">
              <Phone size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              WhatsApp + IA
            </h2>
            <p className="text-slate-500 max-w-sm">
              Selecione uma conversa ao lado. Você pode pausar a IA em conversas
              específicas e responder manualmente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AudioPlayer({ base64 }: { base64: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      const audioSrc = base64.startsWith('data:')
        ? base64
        : `data:audio/ogg;base64,${base64}`;
      audioRef.current = new Audio(audioSrc);
      audioRef.current.onended = () => setPlaying(false);
    }
    return () => {
      audioRef.current?.pause();
    };
  }, [base64]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-3 bg-slate-100/50 p-2 rounded-xl mt-2 min-w-[200px]">
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors shrink-0"
      >
        {playing ? (
          <Pause size={16} className="fill-current" />
        ) : (
          <Play size={16} className="fill-current ml-1" />
        )}
      </button>
      <div className="flex-1 h-1.5 bg-slate-300 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-emerald-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: playing ? '100%' : 0 }}
          transition={{
            duration: playing ? audioRef.current?.duration || 10 : 0.2,
            ease: 'linear',
          }}
        />
      </div>
    </div>
  );
}

const _serverTimestamp = serverTimestamp; // retain import side-effect (TS unused-import safety)
