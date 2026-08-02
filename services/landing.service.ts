import { supabase } from '../lib/supabase/client';

export interface LandingSettings {
  id: string;
  founding_enabled: boolean;
  founding_ends_at: string | null;
  founding_discount_pct: number;
  founding_headline: string | null;
  hero_headline: string | null;
  hero_subheadline: string | null;
  video_url: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface LandingScreenshot {
  id: string;
  slug: string;
  title: string;
  benefit: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface LandingTestimonial {
  id: string;
  quote: string;
  name: string;
  role: string | null;
  city: string | null;
  photo_url: string | null;
  result_label: string | null;
  result_value: string | null;
  consent_given: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export const LandingService = {
  // Leitura pública — usada pela Landing Page (fora de sessão).
  getSettings: async (): Promise<LandingSettings | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('landing_settings').select('*').maybeSingle();
    if (error) { console.warn('landing_settings fetch error', error); return null; }
    return data as LandingSettings | null;
  },

  getActiveScreenshots: async (): Promise<LandingScreenshot[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('landing_screenshots')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) { console.warn('landing_screenshots fetch error', error); return []; }
    return (data || []) as LandingScreenshot[];
  },

  getActiveTestimonials: async (): Promise<LandingTestimonial[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('landing_testimonials')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) { console.warn('landing_testimonials fetch error', error); return []; }
    return (data || []) as LandingTestimonial[];
  },

  // Leitura/escrita para o painel admin — traz TODAS as linhas (ativas e inativas).
  getAllScreenshots: async (): Promise<LandingScreenshot[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('landing_screenshots').select('*').order('sort_order', { ascending: true });
    if (error) { console.warn('landing_screenshots (admin) fetch error', error); return []; }
    return (data || []) as LandingScreenshot[];
  },

  getAllTestimonials: async (): Promise<LandingTestimonial[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('landing_testimonials').select('*').order('sort_order', { ascending: true });
    if (error) { console.warn('landing_testimonials (admin) fetch error', error); return []; }
    return (data || []) as LandingTestimonial[];
  },
};
