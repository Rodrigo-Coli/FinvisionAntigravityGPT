
import { createClient } from '@supabase/supabase-js';

const getSupabaseConfig = () => {
  let url: string | undefined;
  let anonKey: string | undefined;

  const isValid = (val: any): val is string => 
    typeof val === 'string' && val.length > 10 && val !== 'undefined' && val !== 'null';

  try {
    const vUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
    const vKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    if (isValid(vUrl)) url = vUrl;
    if (isValid(vKey)) anonKey = vKey;
  } catch (e) {}

  return { url, anonKey };
};

const { url, anonKey } = getSupabaseConfig();

export const isSupabaseConfigured = !!(url && anonKey);
export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!) : null;
