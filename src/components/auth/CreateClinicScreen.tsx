import { useState, useEffect, FormEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Building2, Phone, Globe, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from '../../types';

export function CreateClinicScreen() {
  const { clinic, createClinic } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rede de segurança: sempre que state.clinic ficar populado, sai do onboarding.
  // Cobre o caso do POST ter sucesso mas a navegação não acontecer por algum motivo.
  useEffect(() => {
    if (clinic) navigate('/dashboard', { replace: true });
  }, [clinic, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createClinic(name.trim(), {
        whatsappNumber: whatsapp.replace(/\D/g, ''),
        timezone,
      });
      // O useEffect acima vai navegar quando state.clinic propagar.
    } catch (err: any) {
      console.error('Error creating clinic:', err);
      setError(err?.message ?? 'Não foi possível criar a clínica. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 md:p-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full"
      >
        <div className="flex flex-col items-center text-center mb-12">
           <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 mb-8 font-bold text-xl shadow-inner">
              1
           </div>
           <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">Configuração Inicial.</h1>
           <p className="text-slate-400 font-medium max-w-sm">
             Dê um nome para sua clínica e conecte seu WhatsApp para começar.
           </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-slate-50/50 p-8 rounded-3xl border border-slate-100">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm font-medium">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Clínica</label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Consultório Dra. Ana"
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 focus:border-emerald-500 rounded-xl outline-none transition-all font-semibold text-slate-900 shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">WhatsApp Principal</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="tel" 
                required
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="DDD + Número"
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 focus:border-emerald-500 rounded-xl outline-none transition-all font-semibold text-slate-900 shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fuso Horário</label>
            <div className="relative">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 focus:border-emerald-500 rounded-xl outline-none transition-all font-semibold text-slate-900 shadow-sm cursor-pointer appearance-none"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button 
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-3 mt-4 active:scale-[0.98]"
          >
            {submitting ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Finalizar configuração
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
