import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Lock, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function ResetPasswordScreen({ onComplete }: { onComplete: () => void }) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar senha. O link pode ter expirado.');
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
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Senha atualizada!</h2>
          <p className="text-slate-500 font-medium leading-relaxed mb-8">
            Sua senha foi redefinida com sucesso. Você já pode acessar sua conta.
          </p>
          <button 
            onClick={onComplete}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98]"
          >
            Acessar Painel
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
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 md:p-12"
      >
        <h2 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Nova senha</h2>
        <p className="text-slate-400 font-medium mb-8">
          Escolha uma senha forte para sua segurança.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm font-medium">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nova Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="password" 
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-semibold text-slate-900"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="password" 
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
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
                Redefinir senha
                <Save size={18} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
