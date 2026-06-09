import { useState, createContext, useContext, ReactNode } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  Users,
  LogOut,
  MessageSquare,
  Stethoscope,
  LayoutDashboard,
  Building2,
  Phone,
  Plus,
  Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth, ClinicData } from './hooks/useAuth';

import { ProfessionalsView } from './components/ProfessionalsView';
import { PatientsView } from './components/PatientsView';
import { AgendaView } from './components/AgendaView';
import { NewAppointmentModal } from './components/NewAppointmentModal';
import { WhatsAppView } from './components/WhatsAppView';
import { ChatView } from './components/ChatView';
import { DashboardView } from './components/DashboardView';
import { SettingsView } from './components/SettingsView';
import { PatientRecordView } from './components/PatientRecordView';

import { LoginScreen } from './components/auth/LoginScreen';
import { RegisterScreen } from './components/auth/RegisterScreen';
import { ForgotPasswordScreen } from './components/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen';
import { CreateClinicScreen } from './components/auth/CreateClinicScreen';

const ClinicContext = createContext<{
  clinic: ClinicData | null;
  refetchClinic: () => Promise<void>;
}>({ clinic: null, refetchClinic: async () => {} });

export const useClinic = () => useContext(ClinicContext);

export default function App() {
  const { loading, clinic, isAuthenticated, refetchClinic, error: authError, logout } = useAuth();

  if (loading) {
    return <LoadingScreen label="Autenticando..." />;
  }

  if (authError && isAuthenticated && !clinic) {
    return <ConnectionErrorScreen message={authError} onRetry={() => refetchClinic()} onLogout={logout} />;
  }

  return (
    <Routes>
      {/* Públicas (sem auth) */}
      <Route element={<PublicOnly isAuthenticated={isAuthenticated} hasClinic={!!clinic} />}>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/register" element={<RegisterRoute />} />
        <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
        <Route path="/reset-password" element={<ResetPasswordRoute />} />
      </Route>

      {/* Onboarding (autenticado, sem clínica) */}
      <Route element={<RequireAuth isAuthenticated={isAuthenticated} />}>
        <Route
          path="/onboarding"
          element={clinic ? <Navigate to="/dashboard" replace /> : <CreateClinicScreen />}
        />
      </Route>

      {/* Painel (autenticado + clínica) */}
      <Route
        element={
          <RequireAuthAndClinic isAuthenticated={isAuthenticated} clinic={clinic} refetchClinic={refetchClinic} />
        }
      >
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/agenda" element={<AgendaScreen />} />
        <Route path="/patients" element={<PatientsScreen />} />
        <Route path="/patients/:patientId" element={<PatientRecordScreen />} />
        <Route path="/professionals" element={<ProfessionalsScreen />} />
        <Route path="/whatsapp" element={<WhatsAppScreen />} />
        <Route path="/chat" element={<ChatScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Route>

      {/* Fallback inteligente baseado no estado */}
      <Route
        path="*"
        element={
          <Navigate
            to={!isAuthenticated ? '/login' : !clinic ? '/onboarding' : '/dashboard'}
            replace
          />
        }
      />
    </Routes>
  );
}

// ── Guards ────────────────────────────────────────────────────────────────────

function PublicOnly({ isAuthenticated, hasClinic }: { isAuthenticated: boolean; hasClinic: boolean }) {
  const location = useLocation();
  // Reset password é especial — usuário pode estar logado mas ainda querer trocar senha.
  if (isAuthenticated && location.pathname !== '/reset-password') {
    return <Navigate to={hasClinic ? '/dashboard' : '/onboarding'} replace />;
  }
  return <Outlet />;
}

function RequireAuth({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAuthAndClinic({
  isAuthenticated,
  clinic,
  refetchClinic,
}: {
  isAuthenticated: boolean;
  clinic: ClinicData | null;
  refetchClinic: () => Promise<void>;
}) {
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!clinic) return <Navigate to="/onboarding" replace />;
  return (
    <ClinicContext.Provider value={{ clinic, refetchClinic }}>
      <MainLayout />
    </ClinicContext.Provider>
  );
}

// ── Route components que recebem clinicId do contexto ────────────────────────

function DashboardScreen() {
  const { clinic } = useClinic();
  return <DashboardView clinicId={clinic!.id} />;
}
function AgendaScreen() {
  const { clinic } = useClinic();
  return <AgendaView clinicId={clinic!.id} />;
}
function PatientsScreen() {
  const { clinic } = useClinic();
  return <PatientsView clinicId={clinic!.id} />;
}
function PatientRecordScreen() {
  const { clinic } = useClinic();
  return <PatientRecordView clinicId={clinic!.id} />;
}
function ProfessionalsScreen() {
  const { clinic } = useClinic();
  return <ProfessionalsView clinicId={clinic!.id} />;
}
function WhatsAppScreen() {
  const { clinic } = useClinic();
  return <WhatsAppView clinicId={clinic!.id} />;
}
function ChatScreen() {
  const { clinic } = useClinic();
  return <ChatView clinicId={clinic!.id} />;
}
function SettingsScreen() {
  const { clinic, refetchClinic } = useClinic();
  return <SettingsView clinic={clinic!} onSaved={refetchClinic} />;
}

// ── Auth route wrappers (passam navigate handlers para os componentes) ────────

function LoginRoute() {
  const navigate = useNavigate();
  return (
    <LoginScreen
      onForgotPassword={() => navigate('/forgot-password')}
      onGoToRegister={() => navigate('/register')}
    />
  );
}
function RegisterRoute() {
  const navigate = useNavigate();
  return <RegisterScreen onGoToLogin={() => navigate('/login')} />;
}
function ForgotPasswordRoute() {
  const navigate = useNavigate();
  return <ForgotPasswordScreen onBack={() => navigate('/login')} />;
}
function ResetPasswordRoute() {
  const navigate = useNavigate();
  return <ResetPasswordScreen onComplete={() => navigate('/login', { replace: true })} />;
}

// ── Main layout (sidebar + header + outlet) ──────────────────────────────────

const NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Visão Geral' },
  { path: '/chat', icon: MessageSquare, label: 'Conversas' },
  { path: '/agenda', icon: Calendar, label: 'Agenda' },
  { path: '/patients', icon: Users, label: 'Pacientes' },
  { path: '/professionals', icon: Building2, label: 'Equipe' },
  { path: '/whatsapp', icon: Phone, label: 'WhatsApp IA' },
  { path: '/settings', icon: Settings, label: 'Configurações' },
];

const MOBILE_NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard },
  { path: '/agenda', icon: Calendar },
  { path: '/patients', icon: Users },
  { path: '/chat', icon: MessageSquare },
];

function isNavItemActive(pathname: string, itemPath: string) {
  if (itemPath === '/dashboard') return pathname === itemPath;
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function MainLayout() {
  const { user, logout } = useAuth();
  const { clinic } = useClinic();
  const location = useLocation();
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900 overflow-hidden">
      <aside className="hidden md:flex w-64 border-r border-slate-50 flex-col py-8 px-6 shrink-0 h-full">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-9 h-9 bg-emerald-500 rounded flex items-center justify-center text-white shadow-sm">
            <Stethoscope size={20} strokeWidth={2.5} />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">Cliny.</span>
        </div>

        <nav className="space-y-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.path}
              to={item.path}
              icon={<item.icon size={18} />}
              label={item.label}
              isActive={isNavItemActive(location.pathname, item.path)}
            />
          ))}
        </nav>

        <footer className="pt-6 border-t border-slate-50 mt-auto space-y-2">
          <div className="bg-slate-50 rounded p-3 flex items-center justify-between group hover:bg-slate-100 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded shrink-0 bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate tracking-tight">{user?.email?.split('@')[0]}</p>
                <p className="text-[10px] text-slate-400 font-semibold truncate leading-none mt-0.5">Admin</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all ml-2"
            >
              <LogOut size={14} strokeWidth={2.5} />
            </button>
          </div>
        </footer>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
          <header className="h-20 flex items-center justify-between px-6 md:px-12 shrink-0">
            <div className="flex items-center gap-4">
              <div className="md:hidden flex items-center gap-2 mr-4">
                <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-white">
                  <Stethoscope size={18} />
                </div>
                <span className="font-bold text-base tracking-tight">Cliny.</span>
              </div>
              <div className="hidden md:flex flex-col">
                <span className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest leading-none mb-1">
                  Painel Administrativo
                </span>
                <h2 className="text-sm font-bold text-slate-900">{clinic?.name}</h2>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto no-scrollbar pb-24 md:pb-12">
            <div className="px-6 md:px-12 py-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-xl border-t border-slate-50 flex items-center justify-around px-4 pb-4 z-40">
          {MOBILE_NAV_ITEMS.slice(0, 2).map((item) => (
            <MobileNavItem key={item.path} to={item.path} icon={<item.icon size={22} />} active={isNavItemActive(location.pathname, item.path)} />
          ))}
          <button
            className="w-12 h-12 -mt-10 bg-emerald-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-200"
            onClick={() => setIsAppointmentModalOpen(true)}
          >
            <Plus size={28} />
          </button>
          {MOBILE_NAV_ITEMS.slice(2).map((item) => (
            <MobileNavItem key={item.path} to={item.path} icon={<item.icon size={22} />} active={isNavItemActive(location.pathname, item.path)} />
          ))}
        </nav>
      </main>

      <AnimatePresence>
        {isAppointmentModalOpen && clinic && (
          <NewAppointmentModal
            clinicId={clinic.id}
            onClose={() => setIsAppointmentModalOpen(false)}
            onSuccess={() => setIsAppointmentModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{label}</span>
      </div>
    </div>
  );
}

function ConnectionErrorScreen({
  message,
  onRetry,
  onLogout,
}: {
  message: string;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 p-6">
      <div className="max-w-md text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded bg-red-50 text-red-500 flex items-center justify-center">
          <Phone size={28} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Não foi possível conectar</h2>
          <p className="text-sm text-slate-500">{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="px-5 py-2.5 rounded bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 active:scale-95 transition-all"
        >
          Tentar novamente
        </button>
        <button onClick={onLogout} className="block mx-auto text-xs font-bold text-slate-400 hover:text-slate-600">
          Sair
        </button>
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  isActive,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-4 w-full p-2.5 rounded transition-all group',
        isActive ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      <div className={cn('shrink-0', isActive ? 'text-emerald-600' : 'text-slate-300 group-hover:text-slate-900')}>
        {icon}
      </div>
      <span className={cn('font-bold text-sm', isActive ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-900')}>
        {label}
      </span>
    </Link>
  );
}

function MobileNavItem({ to, icon, active }: { to: string; icon: ReactNode; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center justify-center w-12 h-12 rounded transition-all',
        active ? 'bg-emerald-50 text-emerald-600' : 'text-slate-300'
      )}
    >
      {icon}
    </Link>
  );
}
