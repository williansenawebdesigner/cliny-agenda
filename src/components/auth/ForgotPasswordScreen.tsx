import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Mail, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar e-mail. Verifique o endereço digitado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 md:p-12"
      >
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase tracking-widest mb-8 transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar
        </button>

        {success ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-6">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">E-mail enviado!</h2>
            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha em instantes.
            </p>
            <button 
              onClick={onBack}
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98]"
            >
              Voltar para o login
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Recuperar senha</h2>
            <p className="text-slate-400 font-medium mb-8">
              Digite seu e-mail para receber as instruções de recuperação.
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm font-medium">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-slate-900"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Enviar instruções
                    <Send size={18} />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
