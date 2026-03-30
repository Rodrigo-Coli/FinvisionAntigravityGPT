
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, HashRouter } from 'react-router-dom';
import { supabase } from './lib/supabase/client';
import { Profile, UserRole } from './types';
import Nav from './components/Nav';
import ScrollToTop from './components/common/ScrollToTop';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminUsers from './pages/AdminUsers';
import Accounts from './pages/Accounts';
import HistoryPage from './pages/History';
import CreditCardsPage from './pages/CreditCards';
import AIModule from './pages/AIModule';
import Assets from './pages/Assets';
import Reconcile from './pages/Reconcile';
import SettingsPage from './pages/Settings';
import Goals from './pages/Goals';
import Budget from './pages/Budget';
import Reports from './pages/Reports';
import { TourProvider } from './contexts/TourContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';
import TrialBanner from './components/TrialBanner';
import UpgradeModal from './components/UpgradeModal';
import DemoMode from './pages/DemoMode';
import DemoBanner from './components/DemoBanner';
import Landing from './pages/Landing';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';

if (window.location.pathname === '/demo' || window.location.pathname === '/demo/') {
  window.location.replace('/#/demo');
}

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

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id, session.user.email);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id, session.user.email);
      else {
        setProfile(null);
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
    } catch (e) {
      console.warn('Failed to fetch profile (likely offline), using cached if available', e);
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
            <ScrollToTop />
            <OfflineBanner />
            <TrialBanner />
            <UpgradeModal />
            <TourProvider>
              <ToastProvider>
                <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50/50 dark:bg-slate-900 font-sans">
                {session && profile && <Nav user={profile} />}
                <main className="flex-grow overflow-x-hidden min-w-0 flex flex-col">
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
                        <Route path="/accounts" element={<Accounts />} />
                        <Route path="/cards" element={<CreditCardsPage />} />
                        <Route path="/assets" element={<Assets />} />
                        <Route path="/goals" element={<Goals user={profile} />} />
                        <Route path="/budget" element={<Budget user={profile} />} />
                        <Route path="/reconcile" element={<Reconcile />} />
                        <Route path="/history" element={<HistoryPage />} />
                        <Route path="/ai" element={<AIModule user={profile} />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/reports" element={<Reports />} />
                        {profile.role === UserRole.ADMIN && <Route path="/admin/usuarios" element={<AdminUsers currentUser={profile} />} />}
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
