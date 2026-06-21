import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, HashRouter } from 'react-router-dom';
import { supabase } from './lib/supabase/client';
import { Profile, UserRole } from './types';
import Nav from './components/Nav';
import BottomNav from './components/BottomNav';
import { PushManager } from './components/PushManager';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';
import FloatingActions from './components/FloatingActions';
import ScrollToTop from './components/common/ScrollToTop';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminDashboard from './pages/AdminDashboard';
import Banking from './pages/Banking';
import HistoryPage from './pages/History';
import AIModule from './pages/AIModule';
import Assets from './pages/Assets';
import Reconcile from './pages/Reconcile';
import SettingsPage from './pages/Settings';
import Planning from './pages/Planning';
import Reports from './pages/Reports';
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
import DemoMode from './pages/DemoMode';
import DemoBanner from './components/DemoBanner';
import Landing from './pages/Landing';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import UpdateAlert from './components/UpdateAlert';

if (window.location.pathname === '/demo' || window.location.pathname === '/demo/') {
  window.location.replace('/#/demo');
}

const APP_VERSION = '6.2.2';

const App: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(() => {
    const cached = localStorage.getItem('finvision_cached_profile');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  // Initialize and listen to system preference dark mode changes
  useEffect(() => {
    const cachedForceDark = localStorage.getItem('finvision_dark_mode_force') === 'true';
    const cachedAutoDark = localStorage.getItem('finvision_auto_dark_mode') === 'true';
    
    const applyDarkMode = (forceDark: boolean, autoDark: boolean) => {
      if (forceDark) {
        document.documentElement.classList.add('dark');
      } else if (autoDark) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyDarkMode(cachedForceDark, cachedAutoDark);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const currentForceDark = localStorage.getItem('finvision_dark_mode_force') === 'true';
      const currentAutoDark = localStorage.getItem('finvision_auto_dark_mode') === 'true';
      applyDarkMode(currentForceDark, currentAutoDark);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const clearSessionData = () => {
      const keysToClear = [
        'is_finvision_demo',
        'is_finvision_demo_promoted',
        'finvision_demo_tasks',
        'finvision_demo_asked_ai',
        'finvision_cached_profile',
        'finvision_cached_home_txs',
        'finvision_cached_accounts',
        'finvision_cached_categories',
        'finvision_cached_subcategories',
        'finvision_cached_owners',
        'finvision_cached_budgets',
        'finvision_cached_goals',
        'finvision_cached_avg_monthly_savings',
        'finvision_cached_budget_spending'
      ];
      keysToClear.forEach(key => localStorage.removeItem(key));
    };

    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id, session.user.email);
      else {
        clearSessionData();
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id, session.user.email);
      else {
        setProfile(null);
        clearSessionData();
        setLoading(false);
      }
    });

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
        localStorage.setItem('finvision_cached_profile', JSON.stringify(created));
      } else if (data) {
        setProfile(data);
        localStorage.setItem('finvision_cached_profile', JSON.stringify(data));
      }

      // Fetch user settings to sync and apply dark mode preference
      const { data: userSettings } = await supabase.from('user_settings').select('auto_dark_mode, dark_mode_force').eq('user_id', uid).maybeSingle();
      if (userSettings) {
        const forceDark = userSettings.dark_mode_force || false;
        const autoDark = userSettings.auto_dark_mode || false;
        localStorage.setItem('finvision_dark_mode_force', String(forceDark));
        localStorage.setItem('finvision_auto_dark_mode', String(autoDark));
        if (forceDark) {
          document.documentElement.classList.add('dark');
        } else if (autoDark) {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (prefersDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch (e) {
      console.warn('Failed to fetch profile/settings (likely offline), using cached if available', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-500 font-bold uppercase tracking-widest text-[10px]">Carregando FinVision Pro</p>
      </div>
    );
  }

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
                      <Route path="*" element={
                        <div className="flex h-screen items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                        </div>
                      } />
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
                        {(profile.role === UserRole.ADMIN || profile.email === 'rodrigocolicg@gmail.com') && (
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
