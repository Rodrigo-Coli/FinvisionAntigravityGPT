import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== 'your-project-url'
);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>): Promise<any> => {
      return fn();
    }
  }
}) : null as any;

