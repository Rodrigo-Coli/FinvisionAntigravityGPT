
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, HashRouter } from 'react-router-dom';
import { supabase } from './lib/supabase/client';
import { Profile, UserRole } from './types';
import Nav from './components/Nav';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PendingApproval from './pages/PendingApproval';
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
import { TourProvider } from './contexts/TourContext';

const App: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id, session.user.email);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
      } else {
        setProfile(data);
      }
    } catch (e) {
      console.warn(e);
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
    <HashRouter>
      <TourProvider>
        <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50/50 font-sans">
          {profile?.is_approved && <Nav user={profile} />}
          <main className="flex-grow overflow-x-hidden">
            <Routes>
              <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
              <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {!session ? (
                <Route path="*" element={<Navigate to="/login" replace />} />
              ) : !profile?.is_approved ? (
                <>
                  <Route path="/pending" element={<PendingApproval user={profile || { email: session.user.email } as any} />} />
                  <Route path="*" element={<Navigate to="/pending" replace />} />
                </>
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
                  {profile.role === UserRole.ADMIN && <Route path="/admin/usuarios" element={<AdminUsers currentUser={profile} />} />}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              )}
            </Routes>
          </main>
        </div>
      </TourProvider>
    </HashRouter>
  );
};

export default App;
