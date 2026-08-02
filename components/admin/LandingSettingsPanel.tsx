import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Save, Loader2, ToggleLeft, ToggleRight, Upload, Trash2,
  ArrowUp, ArrowDown, Eye, EyeOff, ImageOff, Plus, Info, Video, Type, Tag, MessageSquareQuote
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useToast } from '../../contexts/ToastContext';

type SubTab = 'oferta' | 'textos' | 'imagens' | 'depoimentos';

const MAX_IMAGE_MB = 5;
const MAX_VIDEO_MB = 20;
const MIN_IMAGE_WIDTH = 1200;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'image/gif'];

interface SettingsRow {
  id: string;
  founding_enabled: boolean;
  founding_ends_at: string | null;
  founding_discount_pct: number;
  founding_headline: string | null;
  hero_headline: string | null;
  hero_subheadline: string | null;
  video_url: string | null;
}
interface ScreenshotRow { id: string; slug: string; title: string; benefit: string; image_url: string | null; sort_order: number; is_active: boolean; }
interface TestimonialRow {
  id: string; quote: string; name: string; role: string | null; city: string | null; photo_url: string | null;
  result_label: string | null; result_value: string | null; consent_given: boolean; is_active: boolean; sort_order: number;
}
interface PlanRow { id: string; name: string; slug: string; price_cents: number; }

const currency = (cents: number) => `R$${(cents / 100).toFixed(2).replace('.', ',')}`;

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function checkImageWidth(file: File): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve(img.width); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

const emptyTestimonial: Omit<TestimonialRow, 'id'> = {
  quote: '', name: '', role: '', city: '', photo_url: null,
  result_label: '', result_value: '', consent_given: false, is_active: false, sort_order: 0,
};

export default function LandingSettingsPanel() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>('oferta');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);

  // Formulário da OFERTA (rascunho local até salvar)
  const [foundingEnabled, setFoundingEnabled] = useState(false);
  const [foundingEndsAt, setFoundingEndsAt] = useState('');
  const [foundingDiscountPct, setFoundingDiscountPct] = useState(0);
  const [foundingHeadline, setFoundingHeadline] = useState('');
  const [confirmFullPrice, setConfirmFullPrice] = useState(false);
  const [savingOferta, setSavingOferta] = useState(false);

  // Formulário de TEXTOS
  const [heroHeadline, setHeroHeadline] = useState('');
  const [heroSubheadline, setHeroSubheadline] = useState('');
  const [savingTextos, setSavingTextos] = useState(false);

  // Upload state
  const [uploadingSlug, setUploadingSlug] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);

  // Depoimentos
  const [showNewTestimonial, setShowNewTestimonial] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({ ...emptyTestimonial });
  const [savingTestimonial, setSavingTestimonial] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data: s }, { data: shots }, { data: tests }, { data: pl }] = await Promise.all([
      supabase.from('landing_settings').select('*').maybeSingle(),
      supabase.from('landing_screenshots').select('*').order('sort_order', { ascending: true }),
      supabase.from('landing_testimonials').select('*').order('sort_order', { ascending: true }),
      supabase.from('plans').select('id, name, slug, price_cents').eq('is_active', true).order('sort_order', { ascending: true }),
    ]);
    if (s) {
      setSettings(s);
      setFoundingEnabled(s.founding_enabled);
      setFoundingEndsAt(toDatetimeLocalValue(s.founding_ends_at));
      setFoundingDiscountPct(s.founding_discount_pct || 0);
      setFoundingHeadline(s.founding_headline || '');
      setHeroHeadline(s.hero_headline || '');
      setHeroSubheadline(s.hero_subheadline || '');
    }
    setScreenshots(shots || []);
    setTestimonials(tests || []);
    setPlans(pl || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploadToLandingAssets = async (file: File, folder: string): Promise<string | null> => {
    if (!supabase) return null;
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('landing-assets').upload(path, file, { upsert: false });
    if (error) { toast(`Erro no upload: ${error.message}`, 'error'); return null; }
    const { data } = supabase.storage.from('landing-assets').getPublicUrl(path);
    return data.publicUrl;
  };

  // ─── OFERTA ───────────────────────────────────────────────────────────────

  const saveOferta = async () => {
    if (!supabase || !settings) return;
    if (foundingDiscountPct > 0 && !confirmFullPrice) {
      toast('Marque a confirmação antes de salvar um desconto.', 'error');
      return;
    }
    setSavingOferta(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from('landing_settings').update({
        founding_enabled: foundingEnabled,
        founding_ends_at: foundingEndsAt ? new Date(foundingEndsAt).toISOString() : null,
        founding_discount_pct: foundingDiscountPct,
        founding_headline: foundingHeadline || null,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.id || null,
      }).eq('id', settings.id);
      if (error) throw error;
      toast('Oferta salva! Já reflete na landing sem precisar de deploy.', 'success');
      load();
    } catch (err: any) {
      toast(`Erro: ${err.message}`, 'error');
    } finally { setSavingOferta(false); }
  };

  // ─── TEXTOS ───────────────────────────────────────────────────────────────

  const saveTextos = async () => {
    if (!supabase || !settings) return;
    setSavingTextos(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from('landing_settings').update({
        hero_headline: heroHeadline || null,
        hero_subheadline: heroSubheadline || null,
        updated_at: new Date().toISOString(),
        updated_by: session?.user?.id || null,
      }).eq('id', settings.id);
      if (error) throw error;
      toast('Textos salvos!', 'success');
      load();
    } catch (err: any) {
      toast(`Erro: ${err.message}`, 'error');
    } finally { setSavingTextos(false); }
  };

  // ─── IMAGENS ──────────────────────────────────────────────────────────────

  const handleScreenshotUpload = async (row: ScreenshotRow, file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) { toast('Formato inválido. Use PNG, JPG ou WEBP.', 'error'); return; }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) { toast(`Imagem maior que ${MAX_IMAGE_MB}MB.`, 'error'); return; }
    const width = await checkImageWidth(file);
    if (width > 0 && width < MIN_IMAGE_WIDTH) {
      toast(`Aviso: essa imagem tem ${width}px de largura. Recomendado no mínimo ${MIN_IMAGE_WIDTH}px para não ficar borrada.`, 'warning');
    }
    setUploadingSlug(row.slug);
    const url = await uploadToLandingAssets(file, 'screenshots');
    if (url && supabase) {
      const { error } = await supabase.from('landing_screenshots').update({ image_url: url }).eq('id', row.id);
      if (!error) { setScreenshots(prev => prev.map(s => s.id === row.id ? { ...s, image_url: url } : s)); toast('Print atualizado!', 'success'); }
      else toast(`Erro: ${error.message}`, 'error');
    }
    setUploadingSlug(null);
  };

  const saveScreenshotField = async (id: string, patch: Partial<ScreenshotRow>) => {
    if (!supabase) return;
    const { error } = await supabase.from('landing_screenshots').update(patch).eq('id', id);
    if (!error) setScreenshots(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    else toast(`Erro: ${error.message}`, 'error');
  };

  const moveScreenshot = async (row: ScreenshotRow, direction: -1 | 1) => {
    const sorted = [...screenshots].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(s => s.id === row.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      saveScreenshotField(row.id, { sort_order: other.sort_order }),
      saveScreenshotField(other.id, { sort_order: row.sort_order }),
    ]);
  };

  const handleVideoUpload = async (file: File) => {
    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) { toast('Formato inválido. Use MP4, WEBM ou GIF.', 'error'); return; }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) { toast(`Arquivo maior que ${MAX_VIDEO_MB}MB.`, 'error'); return; }
    if (!settings || !supabase) return;
    setUploadingVideo(true);
    const url = await uploadToLandingAssets(file, 'video');
    if (url) {
      const { error } = await supabase.from('landing_settings').update({ video_url: url, updated_at: new Date().toISOString() }).eq('id', settings.id);
      if (!error) { setSettings(prev => prev ? { ...prev, video_url: url } : prev); toast('Vídeo/GIF atualizado!', 'success'); }
      else toast(`Erro: ${error.message}`, 'error');
    }
    setUploadingVideo(false);
  };

  // ─── DEPOIMENTOS ──────────────────────────────────────────────────────────

  const createTestimonial = async () => {
    if (!supabase) return;
    if (!newTestimonial.quote.trim() || !newTestimonial.name.trim()) { toast('Depoimento e nome são obrigatórios.', 'error'); return; }
    setSavingTestimonial('new');
    try {
      const { error } = await supabase.from('landing_testimonials').insert({ ...newTestimonial, sort_order: testimonials.length });
      if (error) throw error;
      toast('Depoimento criado!', 'success');
      setShowNewTestimonial(false);
      setNewTestimonial({ ...emptyTestimonial });
      load();
    } catch (err: any) { toast(`Erro: ${err.message}`, 'error'); }
    finally { setSavingTestimonial(null); }
  };

  const updateTestimonialField = async (id: string, patch: Partial<TestimonialRow>) => {
    if (!supabase) return;
    const { error } = await supabase.from('landing_testimonials').update(patch).eq('id', id);
    if (!error) setTestimonials(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    else toast(`Erro: ${error.message}`, 'error');
  };

  const toggleTestimonialActive = (t: TestimonialRow) => {
    if (!t.is_active && !t.consent_given) {
      toast('Marque "consentimento dado" antes de ativar este depoimento.', 'error');
      return;
    }
    updateTestimonialField(t.id, { is_active: !t.is_active });
  };

  const deleteTestimonial = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm('Excluir este depoimento permanentemente?')) return;
    const { error } = await supabase.from('landing_testimonials').delete().eq('id', id);
    if (!error) { setTestimonials(prev => prev.filter(t => t.id !== id)); toast('Depoimento excluído.', 'success'); }
    else toast(`Erro: ${error.message}`, 'error');
  };

  const handleTestimonialPhoto = async (t: TestimonialRow, file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) { toast('Formato inválido. Use PNG, JPG ou WEBP.', 'error'); return; }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) { toast(`Imagem maior que ${MAX_IMAGE_MB}MB.`, 'error'); return; }
    setUploadingPhotoFor(t.id);
    const url = await uploadToLandingAssets(file, 'testimonials');
    if (url) await updateTestimonialField(t.id, { photo_url: url });
    setUploadingPhotoFor(null);
  };

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'oferta', label: 'Oferta', icon: <Tag size={14} /> },
    { id: 'textos', label: 'Textos', icon: <Type size={14} /> },
    { id: 'imagens', label: 'Imagens', icon: <Upload size={14} /> },
    { id: 'depoimentos', label: 'Depoimentos', icon: <MessageSquareQuote size={14} /> },
  ];

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 p-1.5 bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-[20px] w-full overflow-x-auto shadow-inner">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-1 justify-center ${subTab === t.id ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-md' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ OFERTA ═══ */}
      {subTab === 'oferta' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800 rounded-[24px] p-5 flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300 leading-relaxed">
              Só configure um desconto se o preço cheio for realmente cobrado após a data de encerramento.
              Exibir um preço "de" que nunca será praticado configura publicidade enganosa (CDC art. 37) e
              compromete a credibilidade do produto.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-slate-900 dark:text-white">Turma Fundadora ativa</p>
                <p className="text-xs text-slate-400">Liga a barra de contagem e o preço com desconto na landing.</p>
              </div>
              <button onClick={() => setFoundingEnabled(v => !v)} className={foundingEnabled ? 'text-emerald-500' : 'text-slate-300'}>
                {foundingEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Data e hora de encerramento</label>
                <input type="datetime-local" value={foundingEndsAt} onChange={e => setFoundingEndsAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Desconto (0 a 90%)</label>
                <input type="number" min={0} max={90} value={foundingDiscountPct}
                  onChange={e => { setFoundingDiscountPct(Math.max(0, Math.min(90, Number(e.target.value) || 0))); setConfirmFullPrice(false); }}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Headline da oferta (opcional)</label>
                <input type="text" value={foundingHeadline} onChange={e => setFoundingHeadline(e.target.value)} placeholder="Turma Fundadora — preço travado para sempre"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" />
              </div>
            </div>

            {foundingDiscountPct > 0 && (
              <label className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-2xl cursor-pointer">
                <input type="checkbox" checked={confirmFullPrice} onChange={e => setConfirmFullPrice(e.target.checked)} className="mt-0.5 w-4 h-4 accent-rose-600" />
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300">Confirmo que o preço cheio será praticado após esta data.</span>
              </label>
            )}

            {/* Preview em tempo real */}
            <div className="bg-slate-50 dark:bg-slate-950/40 rounded-2xl p-5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Preview — como vai aparecer na landing</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {plans.filter(p => p.price_cents > 0).map(p => {
                  const discounted = foundingDiscountPct > 0 ? Math.round(p.price_cents * (100 - foundingDiscountPct) / 100) : p.price_cents;
                  return (
                    <div key={p.id} className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-500 mb-1">{p.name}</p>
                      {foundingEnabled && foundingDiscountPct > 0 ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-black text-emerald-500">{currency(discounted)}</span>
                          <span className="text-xs text-slate-400 line-through">{currency(p.price_cents)}</span>
                        </div>
                      ) : (
                        <span className="text-lg font-black text-slate-900 dark:text-white">{currency(p.price_cents)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={saveOferta} disabled={savingOferta} className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 shadow-md hover:bg-brand-700 transition-all">
              {savingOferta ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar Oferta
            </button>
          </div>
        </div>
      )}

      {/* ═══ TEXTOS ═══ */}
      {subTab === 'textos' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] p-6 shadow-sm space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Headline do Hero</label>
                <span className={`text-[9px] font-bold ${heroHeadline.length > 90 ? 'text-amber-500' : 'text-slate-300'}`}>{heroHeadline.length}/90 recomendado</span>
              </div>
              <textarea value={heroHeadline} onChange={e => setHeroHeadline(e.target.value)} rows={2} placeholder="Você só descobre para onde foi o seu dinheiro depois que ele já foi."
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 resize-none transition-colors" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Subheadline</label>
                <span className={`text-[9px] font-bold ${heroSubheadline.length > 220 ? 'text-amber-500' : 'text-slate-300'}`}>{heroSubheadline.length}/220 recomendado</span>
              </div>
              <textarea value={heroSubheadline} onChange={e => setHeroSubheadline(e.target.value)} rows={3} placeholder="O Zyvion consolida contas, cartões, investimentos, imóveis e dívidas em uma única tela..."
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 resize-none transition-colors" />
            </div>

            <div className="bg-[#020617] rounded-2xl p-8 text-center">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Preview</p>
              <h4 className="text-white font-black text-xl leading-tight mb-3">{heroHeadline || 'Você só descobre para onde foi o seu dinheiro depois que ele já foi.'}</h4>
              <p className="text-slate-400 text-xs">{heroSubheadline || 'O Zyvion consolida contas, cartões, investimentos, imóveis e dívidas em uma única tela...'}</p>
            </div>

            <button onClick={saveTextos} disabled={savingTextos} className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 shadow-md hover:bg-brand-700 transition-all">
              {savingTextos ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar Textos
            </button>
          </div>
        </div>
      )}

      {/* ═══ IMAGENS ═══ */}
      {subTab === 'imagens' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[...screenshots].sort((a, b) => a.sort_order - b.sort_order).map((s, idx, arr) => (
              <div key={s.id} className={`bg-white dark:bg-slate-900 border rounded-[28px] overflow-hidden shadow-sm ${!s.is_active ? 'opacity-50' : 'border-slate-100 dark:border-slate-800'}`}>
                <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-950 relative flex items-center justify-center">
                  {s.image_url ? (
                    <img src={s.image_url} alt={s.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={28} className="text-slate-300" />
                  )}
                  {uploadingSlug === s.slug && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="animate-spin text-white" size={24} /></div>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <span className="text-[9px] font-black text-brand-500 uppercase tracking-widest">{s.slug}</span>
                  <input value={s.title} onChange={e => setScreenshots(prev => prev.map(p => p.id === s.id ? { ...p, title: e.target.value } : p))} onBlur={e => saveScreenshotField(s.id, { title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500" />
                  <textarea value={s.benefit} rows={2} onChange={e => setScreenshots(prev => prev.map(p => p.id === s.id ? { ...p, benefit: e.target.value } : p))} onBlur={e => saveScreenshotField(s.id, { benefit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-300 outline-none focus:border-brand-500 resize-none" />
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 px-3 py-2 bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-brand-100 transition-colors">
                      <Upload size={12} /> Trocar
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshotUpload(s, f); e.target.value = ''; }} />
                    </label>
                    <div className="flex items-center gap-1">
                      <button disabled={idx === 0} onClick={() => moveScreenshot(s, -1)} className="p-1.5 text-slate-400 hover:text-brand-600 disabled:opacity-20 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"><ArrowUp size={13} /></button>
                      <button disabled={idx === arr.length - 1} onClick={() => moveScreenshot(s, 1)} className="p-1.5 text-slate-400 hover:text-brand-600 disabled:opacity-20 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"><ArrowDown size={13} /></button>
                      <button onClick={() => saveScreenshotField(s.id, { is_active: !s.is_active })} className={s.is_active ? 'text-emerald-500 p-1.5' : 'text-slate-400 p-1.5'}>
                        {s.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Video size={18} className="text-brand-500" />
              <p className="font-black text-slate-900 dark:text-white">Vídeo / GIF de demonstração</p>
            </div>
            {settings?.video_url && (
              <p className="text-xs text-slate-400 mb-3 break-all">Atual: {settings.video_url}</p>
            )}
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-brand-700 transition-all">
              {uploadingVideo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar Vídeo/GIF
              <input type="file" accept="video/mp4,video/webm,image/gif" className="hidden" disabled={uploadingVideo} onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ''; }} />
            </label>
            <p className="text-[10px] text-slate-400 mt-2">MP4, WEBM ou GIF · até {MAX_VIDEO_MB}MB</p>
          </div>
        </div>
      )}

      {/* ═══ DEPOIMENTOS ═══ */}
      {subTab === 'depoimentos' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-3">
            <Info size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Use apenas depoimentos reais, com autorização da pessoa para uso de nome e imagem.</p>
          </div>

          <button onClick={() => setShowNewTestimonial(v => !v)} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-brand-700 transition-all">
            <Plus size={14} /> Novo Depoimento
          </button>

          {showNewTestimonial && (
            <div className="bg-white dark:bg-slate-900 border-2 border-brand-200 dark:border-brand-900 rounded-[28px] p-6 space-y-4">
              <textarea placeholder="Depoimento" value={newTestimonial.quote} onChange={e => setNewTestimonial(p => ({ ...p, quote: e.target.value }))} rows={3}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-brand-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Nome completo" value={newTestimonial.name} onChange={e => setNewTestimonial(p => ({ ...p, name: e.target.value }))} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500" />
                <input placeholder="Profissão" value={newTestimonial.role || ''} onChange={e => setNewTestimonial(p => ({ ...p, role: e.target.value }))} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500" />
                <input placeholder="Cidade" value={newTestimonial.city || ''} onChange={e => setNewTestimonial(p => ({ ...p, city: e.target.value }))} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500" />
                <div />
                <input placeholder="Rótulo do resultado (ex: Tempo economizado)" value={newTestimonial.result_label || ''} onChange={e => setNewTestimonial(p => ({ ...p, result_label: e.target.value }))} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500" />
                <input placeholder="Valor do resultado (ex: 6 horas/mês)" value={newTestimonial.result_value || ''} onChange={e => setNewTestimonial(p => ({ ...p, result_value: e.target.value }))} className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={newTestimonial.consent_given} onChange={e => setNewTestimonial(p => ({ ...p, consent_given: e.target.checked }))} className="w-4 h-4 accent-brand-600" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Tenho autorização da pessoa para usar nome, foto e depoimento.</span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => setShowNewTestimonial(false)} className="px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancelar</button>
                <button onClick={createTestimonial} disabled={savingTestimonial === 'new'} className="px-8 py-3 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 shadow-md">
                  {savingTestimonial === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {testimonials.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Nenhum depoimento cadastrado ainda.</p>
            ) : (
              [...testimonials].sort((a, b) => a.sort_order - b.sort_order).map(t => (
                <div key={t.id} className={`bg-white dark:bg-slate-900 border rounded-[28px] p-5 shadow-sm ${!t.is_active ? 'opacity-60 border-slate-100 dark:border-slate-800' : 'border-slate-100 dark:border-slate-800'}`}>
                  <div className="flex items-start gap-4">
                    <label className="shrink-0 cursor-pointer">
                      {t.photo_url ? (
                        <img src={t.photo_url} alt={t.name} className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center text-brand-500 font-black text-sm">{t.name.slice(0, 2).toUpperCase()}</div>
                      )}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleTestimonialPhoto(t, f); e.target.value = ''; }} />
                      {uploadingPhotoFor === t.id && <Loader2 size={14} className="animate-spin text-brand-500 mt-1" />}
                    </label>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-300 italic mb-2">"{t.quote}"</p>
                      <p className="font-black text-slate-900 dark:text-white text-sm">{t.name} {t.role && <span className="font-normal text-slate-400">— {t.role}</span>} {t.city && <span className="font-normal text-slate-400">· {t.city}</span>}</p>
                      {t.result_label && <p className="text-[10px] text-emerald-500 font-bold mt-1">{t.result_label}: {t.result_value}</p>}
                      <div className="flex items-center gap-4 mt-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={t.consent_given} onChange={e => updateTestimonialField(t.id, { consent_given: e.target.checked })} className="w-3.5 h-3.5 accent-brand-600" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Consentimento dado</span>
                        </label>
                        <button onClick={() => toggleTestimonialActive(t)} className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${t.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {t.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />} {t.is_active ? 'Ativo' : 'Inativo'}
                        </button>
                        <button onClick={() => deleteTestimonial(t.id)} className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all ml-auto"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
