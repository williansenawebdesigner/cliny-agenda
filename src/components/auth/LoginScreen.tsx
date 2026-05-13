import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Stethoscope, LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function LoginScreen({ 
  onForgotPassword, 
  onGoToRegister 
}: { 
  onForgotPassword: () => void;
  onGoToRegister: () => void;
}) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Erro ao entrar. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded shadow-xl shadow-slate-200/50 p-8 md:p-12"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-14 h-14 bg-emerald-500 rounded flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-100">
            <Stethoscope size={28} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bem-vindo ao Cliny.</h1>
          <p className="text-slate-400 font-medium mt-2">
            Entre para gerenciar sua clínica.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded flex items-center gap-3 text-red-600 text-sm font-medium animate-shake">
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
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-semibold text-slate-900"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label>
              <button 
                type="button"
                onClick={onForgotPassword}
                className="text-[10px] font-bold text-emerald-600 hover:underline"
              >
                Esqueceu a senha?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded outline-none transition-all font-semibold text-slate-900"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold py-4 rounded shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Entrar na conta
                <LogIn size={20} />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-slate-50 text-center">
          <p className="text-sm text-slate-400 font-medium">
            Não tem uma conta?{' '}
            <button 
              onClick={onGoToRegister}
              className="text-emerald-600 font-bold hover:underline"
            >
              Crie agora
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
