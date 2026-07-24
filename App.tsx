import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, HashRouter } from 'react-router-dom';
import { supabase } from './lib/supabase/client';
import { Profile, UserRole } from './types';
import { isAdmin } from './lib/authUtils';
import { captureReferralCodeFromUrl, attachPendingReferral } from './lib/referralUtils';
import { safeStorage } from './lib/safeStorage';
import Nav from './components/Nav';
import BottomNav from './components/BottomNav';
import { PushManager } from './components/PushManager';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';
import FloatingActions from './components/FloatingActions';
import ScrollToTop from './components/common/ScrollToTop';
import { TourProvider } from './contexts/TourContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';
import TrialBanner from './components/TrialBanner';
import GracefulDowngradeBanner from './components/subscription/GracefulDowngradeBanner';
import AccountSelectionModal from './components/subscription/AccountSelectionModal';
import UpgradeModal from './components/UpgradeModal';
import PlanUpsellNudge from './components/PlanUpsellNudge';
import DemoBanner from './components/DemoBanner';
import UpdateAlert from './components/UpdateAlert';

// Lazy-loaded pages — carregadas só quando o usuário navega até elas
const Home          = lazy(() => import('./pages/Home'));
const Login         = lazy(() => import('./pages/Login'));
const Signup        = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Banking       = lazy(() => import('./pages/Banking'));
const HistoryPage   = lazy(() => import('./pages/History'));
const AIModule      = lazy(() => import('./pages/AIModule'));
const Assets        = lazy(() => import('./pages/Assets'));
const Reconcile     = lazy(() => import('./pages/Reconcile'));
const SettingsPage  = lazy(() => import('./pages/Settings'));
const Planning      = lazy(() => import('./pages/Planning'));
const Reports       = lazy(() => import('./pages/Reports'));
const DemoMode      = lazy(() => import('./pages/DemoMode'));
const Landing       = lazy(() => import('./pages/Landing'));
const Terms         = lazy(() => import('./pages/Terms'));
const Privacy       = lazy(() => import('./pages/Privacy'));
const PendingApproval = lazy(() => import('./pages/PendingApproval'));
const Referrals      = lazy(() => import('./pages/Referrals'));

if (window.location.pathname === '/demo' || window.location.pathname === '/demo/') {
  window.location.replace('/#/demo');
}

const APP_VERSION = '6.2.8';

// Spinner reutilizado pelo Suspense e pelo carregamento de auth
const PageSpinner: React.FC = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    <p className="mt-4 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Carregando Zyvion</p>
  </div>
);

// Centraliza a lógica de aplicar dark mode — evita duplicação
function applyDarkMode(forceDark: boolean, autoDark: boolean) {
  if (forceDark) {
    document.documentElement.classList.add('dark');
  } else if (autoDark) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } else {
    document.documentElement.classList.remove('dark');
  }
}

const App: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(() => safeStorage.getJSON<Profile>('finvision_cached_profile'));
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  // Inicializa dark mode a partir do localStorage e escuta mudanças de preferência do sistema
  useEffect(() => {
    applyDarkMode(
      safeStorage.getItem('finvision_dark_mode_force') === 'true',
      safeStorage.getItem('finvision_auto_dark_mode') === 'true'
    );
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyDarkMode(
      safeStorage.getItem('finvision_dark_mode_force') === 'true',
      safeStorage.getItem('finvision_auto_dark_mode') === 'true'
    );
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Limpa TODO o cache local por prefixo (não uma lista fixa de chaves —
    // era assim antes, e toda vez que uma tela nova criava uma chave de cache
    // esquecia de somar aqui, deixando "vazar" dado de uma conta pra outra no
    // mesmo aparelho/navegador).
    const clearSessionData = () => {
      safeStorage.clearByPrefix(['finvision_cached_', 'finvision_dashboard_', 'finvision_demo', 'is_finvision_demo']);
      safeStorage.removeItem('finvision_last_user_id');
    };

    captureReferralCodeFromUrl();

    const handleSession = (session: any) => {
      setSession(session);
      if (session?.user) {
        // Se o usuário logado mudou desde a última vez que este navegador foi
        // usado (ex.: saiu do modo demo e entrou numa conta real diferente, ou
        // trocou de conta), limpa o cache da conta anterior ANTES de buscar os
        // dados da conta nova — senão a tela mostra os dados de quem usou o
        // aparelho antes (às vezes por bastante tempo, se a busca nova falhar).
        const lastUserId = safeStorage.getItem('finvision_last_user_id');
        if (lastUserId && lastUserId !== session.user.id) {
          clearSessionData();
          setProfile(null);
        }
        safeStorage.setItem('finvision_last_user_id', session.user.id);
        fetchProfile(session.user.id, session.user.email);
        if (session.access_token) attachPendingReferral(session.access_token);
      } else {
        setProfile(null);
        clearSessionData();
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }: any) => handleSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => handleSession(session));

    return () => subscription?.unsubscribe();
  }, []);

  const fetchProfile = async (uid: string, email?: string) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (!data && !error) {
        const newProfile = { id: uid, email: email || '', role: UserRole.USER, is_approved: true };
        const { data: created } = await supabase.from('profiles').upsert(newProfile).select().single();
        setProfile(created);
        safeStorage.setItem('finvision_cached_profile', JSON.stringify(created));
      } else if (data) {
        setProfile(data);
        safeStorage.setItem('finvision_cached_profile', JSON.stringify(data));
      }

      // Sincroniza preferência de dark mode do banco e aplica
      const { data: userSettings } = await supabase.from('user_settings').select('auto_dark_mode, dark_mode_force').eq('user_id', uid).maybeSingle();
      if (userSettings) {
        const forceDark = userSettings.dark_mode_force || false;
        const autoDark = userSettings.auto_dark_mode || false;
        safeStorage.setItem('finvision_dark_mode_force', String(forceDark));
        safeStorage.setItem('finvision_auto_dark_mode', String(autoDark));
        applyDarkMode(forceDark, autoDark);
      }
    } catch (e) {
      console.warn('Failed to fetch profile/settings (likely offline), using cached if available', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SubscriptionProvider>
          <HashRouter>
            <UpdateAlert />
            <ScrollToTop />
            <OfflineBanner />
            <TrialBanner />
            <GracefulDowngradeBanner />
            <AccountSelectionModal />
            <UpgradeModal />
            <PlanUpsellNudge />
            <PushManager />
            <PWAInstallPrompt />
            <IOSInstallPrompt />
            <TourProvider>
              <ToastProvider>
                <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50/50 dark:bg-slate-900 font-sans">
                {session && profile && (
                  <>
                    <Nav user={profile} />
                    {profile.preferences?.show_bottom_nav !== false && <BottomNav user={profile} />}
                    <FloatingActions user={profile} />
                  </>
                )}
                <main className={`flex-grow overflow-x-hidden min-w-0 flex flex-col ${session && profile ? 'main-content-safe' : ''}`}>
                  {session && profile && <DemoBanner />}
                  <Suspense fallback={<PageSpinner />}>
                    <Routes>
                      <Route path="/demo" element={<DemoMode />} />
                      <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
                      <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/terms" element={<Terms />} />
                      <Route path="/privacy" element={<Privacy />} />

                      {!session ? (
                        <>
                          <Route path="/" element={<Landing />} />
                          <Route path="*" element={<Navigate to="/" replace />} />
                        </>
                      ) : !profile ? (
                        <Route path="*" element={<PageSpinner />} />
                      ) : !profile.is_approved ? (
                        <Route path="*" element={<PendingApproval user={profile} />} />
                      ) : (
                        <>
                          <Route path="/" element={<Home user={profile} />} />
                          <Route path="/banking" element={<Banking />} />
                          <Route path="/accounts" element={<Navigate to="/banking?tab=accounts" replace />} />
                          <Route path="/cards" element={<Navigate to="/banking?tab=cards" replace />} />
                          <Route path="/assets" element={<Assets />} />
                          <Route path="/planning" element={<Planning user={profile} />} />
                          <Route path="/goals" element={<Navigate to="/planning?tab=goals" replace />} />
                          <Route path="/budget" element={<Navigate to="/planning?tab=budget" replace />} />
                          <Route path="/reconcile" element={<Reconcile />} />
                          <Route path="/history" element={<HistoryPage />} />
                          <Route path="/ai" element={<AIModule user={profile} />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="/reports" element={<Reports />} />
                          <Route path="/referrals" element={<Referrals />} />
                          {isAdmin(profile) && (
                            <>
                              <Route path="/admin" element={<AdminDashboard />} />
                              <Route path="/admin/usuarios" element={<AdminDashboard />} />
                              <Route path="/admin/planos" element={<AdminDashboard />} />
                            </>
                          )}
                          <Route path="*" element={<Navigate to="/" replace />} />
                        </>
                      )}
                    </Routes>
                  </Suspense>
                </main>
              </div>
            </ToastProvider>
          </TourProvider>
        </HashRouter>
        </SubscriptionProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
