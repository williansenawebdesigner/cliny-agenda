import { useState, useEffect, useRef, FormEvent } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { WhatsAppInstance } from '../types';
import { Send, Phone, User, Play, Pause } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface Message {
  id: string;
  instanceName: string;
  remoteJid: string;
  fromMe: boolean;
  messageType: string;
  content: string;
  audioBase64: string | null;
  messageTimestamp: number;
}

export function ChatView({ clinicId }: { clinicId: string }) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<{ jid: string, lastMessage: string, timestamp: number }[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch distinct instances
    getDocs(query(collection(db, 'whatsapp_instances'), where('clinicId', '==', clinicId)))
      .then(snap => {
        const insts = snap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppInstance));
        setInstances(insts);
        if (insts.length > 0) setSelectedInstance(insts[0]);
      });
  }, [clinicId]);

  useEffect(() => {
    if (!selectedInstance) return;

    const q = query(
      collection(db, 'whatsapp_messages'),
      where('clinicId', '==', clinicId),
      where('instanceName', '==', selectedInstance.instanceName)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Message))
          .sort((a, b) => a.messageTimestamp - b.messageTimestamp);
        setMessages(msgs);

        const convMap = new Map<string, { lastMessage: string; timestamp: number }>();
        msgs.forEach((m) => {
          convMap.set(m.remoteJid, {
            lastMessage: m.messageType === 'audio' ? 'Áudio' : m.content,
            timestamp: m.messageTimestamp,
          });
        });

        const convs = Array.from(convMap.entries())
          .map(([jid, data]) => ({ jid, ...data }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setConversations(convs);
      },
      (error) => {
        console.error('[ChatView] onSnapshot error', error);
      }
    );

    return () => unsub();
  }, [selectedInstance, clinicId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedJid]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedJid || !selectedInstance) return;

    setSending(true);
    try {
      await fetch('/api/evolution/message/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: selectedInstance.instanceName,
          number: selectedJid.split('@')[0],
          text: inputText
        })
      });
      setInputText('');
    } catch(e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const filteredMessages = messages.filter(m => m.remoteJid === selectedJid);

  return (
    <div className="h-[calc(100vh-140px)] flex bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Sidebar: Instances & Conversations */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
        <div className="p-4 border-b border-slate-200">
           <select 
             value={selectedInstance?.id || ''} 
             onChange={(e) => setSelectedInstance(instances.find(i => i.id === e.target.value) || null)}
             className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
           >
             {instances.length === 0 && <option value="">Nenhuma instância conectada</option>}
             {instances.map(inst => (
               <option key={inst.id} value={inst.id}>{inst.name}</option>
             ))}
           </select>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-sm font-medium text-slate-400">Nenhuma conversa encontrada.</div>
          ) : (
            conversations.map(conv => (
              <div 
                key={conv.jid} 
                onClick={() => setSelectedJid(conv.jid)}
                className={cn(
                  "p-4 border-b border-slate-100 cursor-pointer transition-colors flex items-center gap-3",
                  selectedJid === conv.jid ? "bg-emerald-50" : "hover:bg-slate-50"
                )}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <User size={20} />
                </div>
                <div className="min-w-0 flex-1">
                   <p className="text-sm font-bold text-slate-900 truncate">+{conv.jid.split('@')[0]}</p>
                   <p className="text-xs text-slate-500 truncate">{conv.lastMessage}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-[#efeae2]">
        {selectedJid ? (
          <>
            {/* Header */}
            <div className="h-16 px-6 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
               <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <User size={20} />
               </div>
               <div>
                  <h3 className="font-bold text-slate-900">+{selectedJid.split('@')[0]}</h3>
                  <p className="text-xs text-emerald-600 font-medium tracking-tight">Atendimento Inteligente ATIVO</p>
               </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {filteredMessages.map(msg => (
                <div key={msg.id} className={cn("flex flex-col max-w-[70%]", msg.fromMe ? "ml-auto items-end" : "mr-auto items-start")}>
                  <div className={cn(
                    "p-3 rounded-2xl shadow-sm text-[15px]",
                    msg.fromMe ? "bg-[#d9fdd3] rounded-tr-none text-slate-900" : "bg-white rounded-tl-none text-slate-900"
                  )}>
                    {msg.content}
                    {msg.audioBase64 && (
                      <AudioPlayer base64={msg.audioBase64} />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium px-1 mt-1">
                    {new Date(msg.messageTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-[#f0f2f5] flex items-center gap-3 shrink-0">
              <input 
                type="text" 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Digite uma mensagem..."
                className="flex-1 bg-white border-none rounded-xl px-5 py-3 outline-none text-sm shadow-sm"
              />
              <button 
                type="submit"
                disabled={sending || !inputText.trim()}
                className="w-12 h-12 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white rounded-full flex items-center justify-center transition-colors shadow-sm"
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
            <h2 className="text-xl font-bold text-slate-800 mb-2">WhatsApp Web Inteligente</h2>
            <p className="text-slate-500 max-w-sm">Selecione uma conversa ao lado para acompanhar o atendimento da Inteligência Artificial em tempo real.</p>
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
       const audioSrc = base64.startsWith('data:') ? base64 : `data:audio/ogg;base64,${base64}`;
       audioRef.current = new Audio(audioSrc);
       audioRef.current.onended = () => setPlaying(false);
    }
    
    return () => {
       if (audioRef.current) {
          audioRef.current.pause();
       }
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
      <button onClick={toggle} className="w-10 h-10 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors shrink-0">
        {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current ml-1" />}
      </button>
      <div className="flex-1 h-1.5 bg-slate-300 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-emerald-500 rounded-full" 
          initial={{ width: 0 }}
          animate={{ width: playing ? "100%" : 0 }}
          transition={{ duration: playing ? audioRef.current?.duration || 10 : 0.2, ease: "linear" }}
        />
      </div>
    </div>
  );
}
