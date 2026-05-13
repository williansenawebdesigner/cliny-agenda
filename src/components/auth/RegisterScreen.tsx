import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function RegisterScreen({ onGoToLogin }: { onGoToLogin: () => void }) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { needsEmailConfirmation } = await register(email, password);
      if (needsEmailConfirmation) {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-12 text-center"
        >
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-6">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Verifique seu e-mail</h2>
          <p className="text-slate-500 font-medium leading-relaxed mb-8">
            Enviamos um link de confirmação para <strong>{email}</strong>. 
            Por favor, clique no link para ativar sua conta.
          </p>
          <button 
            onClick={onGoToLogin}
            className="text-emerald-600 font-bold hover:underline"
          >
            Voltar para o login
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 md:p-12"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-100">
            <UserPlus size={28} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Comece grátis.</h1>
          <p className="text-slate-400 font-medium mt-2">
            Crie sua conta em segundos.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm font-medium">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="password" 
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-slate-900"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Criar minha conta
                <UserPlus size={20} />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-slate-50 text-center">
          <p className="text-sm text-slate-400 font-medium">
            Já tem uma conta?{' '}
            <button 
              onClick={onGoToLogin}
              className="text-emerald-600 font-bold hover:underline"
            >
              Entrar agora
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
