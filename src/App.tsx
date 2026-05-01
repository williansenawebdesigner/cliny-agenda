import { useState, useEffect, createContext, useContext, FormEvent } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  limit,
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { 
  Calendar, 
  Users, 
  Settings, 
  LogOut, 
  MessageSquare, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Stethoscope,
  Briefcase,
  LayoutDashboard,
  Building2,
  Phone,
  ArrowRight,
  DollarSign,
  CheckCircle2,
  ChevronDown,
  User,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './lib/firebase';
import { cn } from './lib/utils';
import { Clinic, OperationType } from './types';
import { seedClinicData } from './lib/seedData';

// New Components
import { ProfessionalsView } from './components/ProfessionalsView';
import { PatientsView } from './components/PatientsView';
import { AgendaView } from './components/AgendaView';
import { NewAppointmentModal } from './components/NewAppointmentModal';
import { WhatsAppView } from './components/WhatsAppView';
import { ChatView } from './components/ChatView';

// Context for Clinic
const ClinicContext = createContext<{ 
  clinic: Clinic | null; 
  setClinic: (c: Clinic) => void;
  loading: boolean;
}>({ clinic: null, setClinic: () => {}, loading: true });

function MobileNavItem({ icon, active, onClick }: { icon: any, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center justify-center w-12 h-12 rounded-2xl transition-all",
        active ? "bg-emerald-50 text-emerald-600 shadow-inner" : "text-slate-300 hover:text-slate-900"
      )}
    >
      {icon}
    </button>
  );
}

// Simple Router-like state
type View = 'dashboard' | 'agenda' | 'patients' | 'professionals' | 'whatsapp' | 'settings' | 'chat';

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [clinicLoading, setClinicLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Modals state
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        fetchClinic(u.email!);
      } else {
        setClinic(null);
        setClinicLoading(false);
      }
    });
    return unsub;
  }, []);

  const fetchClinic = async (email: string) => {
    setClinicLoading(true);
    try {
      const q = query(collection(db, 'clinics'), where('adminEmail', '==', email), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        setClinic({ id: docSnap.id, ...docSnap.data() } as Clinic);
      } else {
        setClinic(null);
      }
    } catch (error) {
      console.error('Error fetching clinic:', error);
    } finally {
      setClinicLoading(false);
    }
  };

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  const logout = () => signOut(auth);

  if (authLoading) {
    return <LoadingScreen label="Autenticando..." />;
  }

  if (!user) {
    return <LoginScreen onLogin={login} />;
  }

  if (clinicLoading) {
    return <LoadingScreen label="Carregando sua clínica..." />;
  }

  if (!clinic) {
    return (
      <ClinicContext.Provider value={{ clinic, setClinic, loading: clinicLoading }}>
        <CreateClinicScreen onCreated={setClinic} />
      </ClinicContext.Provider>
    );
  }

  return (
    <ClinicContext.Provider value={{ clinic, setClinic, loading: clinicLoading }}>
      <div className="flex h-screen bg-white text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900 overflow-hidden">
        {/* Desktop Sidebar - Minimalist */}
        <aside className="hidden md:flex w-64 border-r border-slate-50 flex-col py-8 px-6 shrink-0 h-full">
          <div className="flex items-center gap-3 px-2 mb-10">
            <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center text-white shadow-sm">
              <Stethoscope size={20} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">Cliny.</span>
          </div>

          <nav className="space-y-1 flex-1">
            <NavItem 
              icon={<LayoutDashboard size={18} />} 
              label="Visão Geral" 
              isActive={currentView === 'dashboard'} 
              onClick={() => setCurrentView('dashboard')}
            />
            <NavItem 
              icon={<Calendar size={18} />} 
              label="Agenda" 
              isActive={currentView === 'agenda'} 
              onClick={() => setCurrentView('agenda')}
            />
            <NavItem 
              icon={<Users size={18} />} 
              label="Pacientes" 
              isActive={currentView === 'patients'} 
              onClick={() => setCurrentView('patients')}
            />
            <NavItem 
              icon={<Building2 size={18} />} 
              label="Equipe" 
              isActive={currentView === 'professionals'} 
              onClick={() => setCurrentView('professionals')}
            />
            <NavItem 
              icon={<Phone size={18} />} 
              label="WhatsApp IA" 
              isActive={currentView === 'whatsapp'} 
              onClick={() => setCurrentView('whatsapp')}
            />
            <NavItem 
              icon={<MessageSquare size={18} />} 
              label="Conversas" 
              isActive={currentView === 'chat'} 
              onClick={() => setCurrentView('chat')}
            />
          </nav>

          <footer className="pt-6 border-t border-slate-50 mt-auto">
             <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between group hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-8 h-8 rounded-lg shrink-0 object-cover shadow-sm bg-white" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg shrink-0 bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
                        {user.email?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-50 group-hover:border-slate-100 rounded-full transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate tracking-tight">{user.displayName || user.email?.split('@')[0]}</p>
                    <p className="text-[10px] text-slate-400 font-semibold truncate leading-none mt-0.5">Admin</p>
                  </div>
                </div>
                <button 
                  onClick={logout} 
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all ml-2"
                  title="Sair da Conta"
                >
                  <LogOut size={14} strokeWidth={2.5} />
                </button>
             </div>
          </footer>
        </aside>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col min-w-0 bg-white relative overflow-hidden">
          {/* Grid Layout Container */}
          <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
            {/* Top Fixed Header - Aligned to Grid */}
            <header className="h-20 flex items-center justify-between px-6 md:px-12 shrink-0">
              <div className="flex items-center gap-4">
                <div className="md:hidden flex items-center gap-2 mr-4">
                   <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                     <Stethoscope size={18} />
                   </div>
                   <span className="font-bold text-base tracking-tight">Cliny.</span>
                </div>
                <div className="hidden md:flex flex-col">
                   <span className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest leading-none mb-1">Dashboard</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
              </div>
            </header>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-24 md:pb-12">
              <div className="px-6 md:px-12 py-4">
                 <AnimatePresence mode="wait">
                   <motion.div
                     key={currentView}
                     initial={{ opacity: 0, y: 5 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -5 }}
                     transition={{ duration: 0.2 }}
                     className="h-full"
                   >
                      {currentView === 'dashboard' && <DashboardView />}
                      {currentView === 'agenda' && <AgendaView clinicId={clinic.id} />}
                      {currentView === 'patients' && <PatientsView clinicId={clinic.id} />}
                      {currentView === 'professionals' && <ProfessionalsView clinicId={clinic.id} />}
                      {currentView === 'whatsapp' && <WhatsAppView clinicId={clinic.id} />}
                      {currentView === 'chat' && <ChatView clinicId={clinic.id} />}
                      {currentView === 'settings' && <PlaceholderBox label="Configurações" />}
                   </motion.div>
                 </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Mobile Tab Bar */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-xl border-t border-slate-50 flex items-center justify-around px-4 pb-4 z-40">
             <MobileNavItem icon={<LayoutDashboard size={22} />} active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
             <MobileNavItem icon={<Calendar size={22} />} active={currentView === 'agenda'} onClick={() => setCurrentView('agenda')} />
             <div className="w-12 h-12 -mt-10 bg-emerald-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-200 active:scale-90 transition-transform" onClick={() => setIsAppointmentModalOpen(true)}>
                <Plus size={28} />
             </div>
             <MobileNavItem icon={<Users size={22} />} active={currentView === 'patients'} onClick={() => setCurrentView('patients')} />
             <MobileNavItem icon={<Settings size={22} />} active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
          </nav>
        </main>
      </div>

      <AnimatePresence>
        {isAppointmentModalOpen && (
          <NewAppointmentModal 
            clinicId={clinic.id} 
            onClose={() => setIsAppointmentModalOpen(false)} 
            onSuccess={() => setIsAppointmentModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </ClinicContext.Provider>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-100">
      <motion.div 
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-500 font-medium tracking-tight">{label}</span>
      </motion.div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full flex flex-col items-center text-center"
      >
        <div className="w-16 h-16 bg-emerald-500 rounded-xl flex items-center justify-center text-white mb-10 shadow-xl shadow-emerald-100">
          <Stethoscope size={32} />
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-4">Cliny.</h1>
        <p className="text-slate-400 font-medium mb-12 leading-relaxed">
          Gestão inteligente para sua clínica.
        </p>
        
        <button 
          onClick={onLogin}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-4 px-8 rounded-lg transition-all flex items-center justify-center gap-3 cursor-pointer shadow-xl shadow-slate-100 active:scale-[0.98]"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5 brightness-0 invert" alt="Google" referrerPolicy="no-referrer" />
          Entrar com Google
        </button>

        <div className="mt-12 pt-12 border-t border-slate-50 w-full flex flex-col items-center gap-6">
           <div className="flex -space-x-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100" />
              ))}
           </div>
           <p className="text-[10px] font-semibold text-slate-400">Usado por +500 profissionais</p>
        </div>
      </motion.div>
    </div>
  );
}

function CreateClinicScreen({ onCreated }: { onCreated: (c: Clinic) => void }) {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'clinics'), {
        name,
        whatsappNumber: whatsapp,
        adminEmail: auth.currentUser.email,
        createdAt: serverTimestamp(),
        settings: { theme: 'emerald' }
      });
      onCreated({ id: docRef.id, name, whatsappNumber: whatsapp, adminEmail: auth.currentUser.email! });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clinics');
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
           <div className="w-16 h-16 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 mb-8 font-semibold text-xl">
              1
           </div>
           <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-4">Quase lá...</h1>
           <p className="text-slate-400 font-medium max-w-sm">
             Dê um nome para sua clínica e conecte seu WhatsApp.
           </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-400 ml-1">Identidade</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 placeholder:text-slate-300"
              placeholder="Nome da sua clínica"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-400 ml-1">Conexão WhatsApp</label>
            <input 
              type="tel" 
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full px-5 py-3 bg-slate-50 border border-slate-100 focus:border-emerald-500 focus:bg-white rounded-lg outline-none transition-all font-semibold text-slate-900 placeholder:text-slate-300"
              placeholder="DDD + Número (ex: 11999999999)"
              required
            />
          </div>

          <button 
            disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-300 text-white font-semibold py-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-3 mt-12 cursor-pointer active:scale-[0.98]"
          >
            {submitting ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

function NavItem({ icon, label, isActive, onClick }: { icon: any, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 w-full p-2.5 rounded-lg transition-all cursor-pointer group",
        isActive 
          ? "bg-slate-50 text-emerald-600" 
          : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-900"
      )}
    >
      <div className={cn("shrink-0 transition-colors", isActive ? "text-emerald-600" : "text-slate-300 group-hover:text-slate-900")}>
        {icon}
      </div>
      <span className={cn("font-semibold text-sm whitespace-nowrap transition-colors", isActive ? "text-emerald-600" : "text-slate-500 group-hover:text-slate-900")}>{label}</span>
    </button>
  );
}

function PlaceholderBox({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 bg-white">
      <div className="w-16 h-16 bg-slate-50 rounded-lg flex items-center justify-center mb-4">
        <Stethoscope size={32} />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{label}</h3>
      <p className="text-sm text-center max-w-xs leading-relaxed">
        Esta funcionalidade está sendo preparada para revolucionar a gestão da sua clínica.
      </p>
    </div>
  );
}

function DashboardView() {
  const { clinic } = useContext(ClinicContext);
  const [isSeeding, setIsSeeding] = useState(false);
  const [stats, setStats] = useState({ today: 0, patients: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [nextAppointments, setNextAppointments] = useState<any[]>([]);

  useEffect(() => {
    if (!clinic?.id) return;
    
    const fetchDashboardData = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Fetch Today's Appointments
        const appsQ = query(
          collection(db, 'appointments'),
          where('clinicId', '==', clinic.id),
          where('startTime', '>=', today.toISOString()),
          where('startTime', '<', tomorrow.toISOString()),
          orderBy('startTime', 'asc'),
          limit(3)
        );
        const appsSnap = await getDocs(appsQ);
        
        const professionalsSnap = await getDocs(query(collection(db, 'professionals'), where('clinicId', '==', clinic.id)));
        const professionalsMap: any = {};
        professionalsSnap.forEach(doc => professionalsMap[doc.id] = { id: doc.id, ...doc.data() });

        // Fetch Enriched Apps
        const apps = appsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const enrichedApps = await Promise.all(apps.map(async (app: any) => {
          const patientSnap = await getDocs(query(collection(db, 'patients'), where('clinicId', '==', clinic.id), where('__name__', '==', app.patientId)));
          const patient = patientSnap.docs[0]?.data() as any;
          const services = professionalsMap[app.professionalId]?.services || [];
          const service = services.find((s: any) => s.id === app.serviceId);
          
          return {
            ...app,
            patientName: patient?.name || '...',
            procedureName: service?.name || '...'
          };
        }));
        setNextAppointments(enrichedApps);

        // Stats Logic
        const allTodayAppsQ = query(
          collection(db, 'appointments'),
          where('clinicId', '==', clinic.id),
          where('startTime', '>=', today.toISOString()),
          where('startTime', '<', tomorrow.toISOString())
        );
        const allTodayAppsSnap = await getDocs(allTodayAppsQ);
        const patientsQ = query(collection(db, 'patients'), where('clinicId', '==', clinic.id));
        const patientsSnap = await getDocs(patientsQ);

        let rev = 0;
        allTodayAppsSnap.forEach(doc => {
          const data = doc.data();
          if (data.status !== 'cancelled') rev += (data.price || 0);
        });

        setStats({
          today: allTodayAppsSnap.size,
          patients: patientsSnap.size,
          revenue: rev
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [clinic?.id]);

  const handleSeed = async () => {
    if (!clinic?.id) return;
    setIsSeeding(true);
    await seedClinicData(clinic.id);
    setIsSeeding(false);
    window.location.reload();
  };
  
  return (
    <div className="space-y-12 pb-10">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Olá, {clinic?.name}</h1>
          <p className="text-slate-400 font-medium text-lg">Resumo da sua clínica hoje.</p>
        </div>
        <button 
          onClick={handleSeed}
          disabled={isSeeding}
          className="md:absolute md:top-0 md:right-0 text-[10px] font-bold px-4 py-1.5 bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all whitespace-nowrap"
        >
          {isSeeding ? 'Populando...' : 'Popular Dados de Teste'}
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
        <StatCard label="Consultas Hoje" value={loading ? "..." : stats.today.toString()} />
        <StatCard label="Total Pacientes" value={loading ? "..." : stats.patients.toString()} />
        <StatCard label="Faturamento Hoje" value={loading ? "..." : `R$ ${stats.revenue}`} />
        <StatCard label="Confirmados" value="100%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 pt-4">
        <div className="lg:col-span-8 space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight text-slate-900 border-l-4 border-emerald-500 pl-4">Próximos Atendimentos</h3>
            <button className="text-emerald-600 text-[10px] font-bold hover:underline">Ver Agenda</button>
          </div>
          <div className="space-y-2">
            {nextAppointments.length > 0 ? (
              nextAppointments.map(app => (
                <CompactAppointmentItem 
                  key={app.id}
                  name={app.patientName} 
                  time={new Date(app.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} 
                  procedure={app.procedureName} 
                />
              ))
            ) : (
              <div className="px-6 py-12 bg-slate-50 border border-slate-100/50 rounded-2xl text-center">
                <p className="text-xs text-slate-400 font-medium italic">Nenhum atendimento para hoje.</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
           <h3 className="text-lg font-bold tracking-tight text-slate-900">Lembretes da IA</h3>
           <div className="bg-emerald-50/30 p-8 rounded-2xl border border-emerald-100/20 space-y-6">
              <p className="text-base text-emerald-800 leading-relaxed font-medium">
                "Você tem 3 pacientes que não agendam há mais de 30 dias. <span className="font-bold underline cursor-pointer text-emerald-600">Enviar lembrete?</span>"
              </p>
              <div className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm border border-emerald-100/50">
                 <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                    <MessageSquare size={18} />
                 </div>
                 <span className="text-xs font-bold text-emerald-700">Automação Inteligente Ativa</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex flex-col group">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 transition-colors group-hover:text-emerald-500">{label}</div>
      <div className="text-4xl font-bold tracking-tighter text-slate-900 mb-4">{value}</div>
      <div className="w-8 h-1.5 bg-slate-100 group-hover:bg-emerald-500 rounded-full transition-all" />
    </div>
  );
}

function CompactAppointmentItem({ name, time, procedure }: { name: string, time: string, procedure: string, key?: any }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer border border-transparent hover:border-slate-50">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
          <User size={18} className="text-slate-300 group-hover:text-emerald-500" />
        </div>
        <div>
          <p className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors text-sm">{name}</p>
          <p className="text-[10px] text-slate-400 font-medium">{procedure}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-800">{time}</p>
        <p className="text-[10px] font-semibold text-emerald-500">Confirmado</p>
      </div>
    </div>
  );
}

