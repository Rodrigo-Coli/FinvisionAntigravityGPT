import React, { useEffect, useMemo, useState } from 'react';
import { Store, Pencil, Check, X, Loader2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { useToast } from '../../contexts/ToastContext';
import { DateUtils } from '../../lib/dateUtils';
import { normalizeStr } from '../../lib/stringUtils';
import {
  MERCHANT_SEGMENTS,
  MerchantDoc,
  MerchantNameDisplay,
  formatCnpj,
  groupEstablishments,
  parseNameDisplay,
} from '../../lib/merchantInfo';

/**
 * Configurações › Estabelecimentos
 *
 * Lojas lidas nos cupons (Inteligência Labs), agrupadas por CNPJ (ou nome).
 * Cada uma mostra o nome fantasia, a razão social e o CNPJ. O usuário escolhe
 * qual nome o app usa por padrão (nome fantasia, salvo em
 * profiles.preferences.merchant_name_display), corrige os nomes e o tipo de
 * estabelecimento — o tipo é o filtro do Comparador.
 *
 * Antes esta tela consultava a coluna `date`, que não existe em ai_documents:
 * a consulta falhava e a lista ficava sempre vazia.
 */
export const EstablishmentsSettings: React.FC = () => {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [docs, setDocs] = useState<MerchantDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editTrade, setEditTrade] = useState('');
  const [editLegal, setEditLegal] = useState('');

  const display: MerchantNameDisplay = parseNameDisplay(preferences.merchant_name_display);

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const user = await getSessionUser(supabase);
      if (!user) return;
      setUserId(user.id);
      const [docsRes, profRes] = await Promise.all([
        supabase.from('ai_documents')
          .select('id, merchant_raw, document_date, created_at, ocr_structured')
          .eq('user_id', user.id)
          .order('document_date', { ascending: false }),
        supabase.from('profiles').select('preferences').eq('id', user.id).maybeSingle(),
      ]);
      if (docsRes.error) throw docsRes.error;
      setDocs(docsRes.data || []);
      setPreferences(profRes.data?.preferences || {});
    } catch (err) {
      console.error('[Estabelecimentos] Erro ao carregar:', err);
      toast('Não foi possível carregar os estabelecimentos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const establishments = useMemo(() => groupEstablishments(docs, display), [docs, display]);
  const visible = useMemo(() => {
    const term = normalizeStr(search || '');
    if (!term) return establishments;
    return establishments.filter(e =>
      [e.tradeName, e.legalName, e.cnpj, e.segment].some(v => normalizeStr(v || '').includes(term))
    );
  }, [establishments, search]);

  const changeDisplay = async (next: MerchantNameDisplay) => {
    if (!supabase || !userId || next === display) return;
    const old = preferences;
    // Lê o que está salvo agora para não apagar outra preferência (menu, barra inferior).
    const { data: fresh } = await supabase.from('profiles').select('preferences').eq('id', userId).maybeSingle();
    const merged = { ...(fresh?.preferences || old), merchant_name_display: next };
    setPreferences(merged);
    const { error } = await supabase.from('profiles').update({ preferences: merged }).eq('id', userId);
    if (error) {
      setPreferences(old);
      toast('Não foi possível salvar a preferência.', 'error');
      return;
    }
    toast(next === 'legal' ? 'Estabelecimentos aparecem pela razão social.' : 'Estabelecimentos aparecem pelo nome fantasia.', 'success');
  };

  /** Grava os campos em todos os cupons do estabelecimento (ocr_structured). */
  const patchDocs = async (docIds: string[], patch: Record<string, any>) => {
    if (!supabase) throw new Error('Supabase não configurado');
    const targets = docs.filter(d => d.id && docIds.includes(d.id));
    const results = await Promise.all(targets.map(d =>
      supabase!.from('ai_documents')
        .update({ ocr_structured: { ...(d.ocr_structured || {}), ...patch } })
        .eq('id', d.id!)
    ));
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;
    setDocs(prev => prev.map(d => (d.id && docIds.includes(d.id) ? { ...d, ocr_structured: { ...(d.ocr_structured || {}), ...patch } } : d)));
  };

  const changeSegment = async (key: string, docIds: string[], segment: string) => {
    setBusy(key);
    try {
      await patchDocs(docIds, { merchant_category: segment });
      toast(`Tipo alterado para ${segment}.`, 'success');
    } catch (err) {
      console.error('[Estabelecimentos] Erro ao salvar tipo:', err);
      toast('Não foi possível salvar o tipo.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (key: string, trade: string, legal: string) => {
    setEditingKey(key);
    setEditTrade(trade);
    setEditLegal(legal);
  };

  const saveEdit = async (key: string, docIds: string[]) => {
    const trade = editTrade.replace(/\s+/g, ' ').trim();
    const legal = editLegal.replace(/\s+/g, ' ').trim();
    if (!trade && !legal) {
      toast('Informe o nome fantasia ou a razão social.', 'warning');
      return;
    }
    setBusy(key);
    try {
      await patchDocs(docIds, { merchant_trade_name: trade, merchant_legal_name: legal });
      setEditingKey(null);
      toast('Nomes salvos.', 'success');
    } catch (err) {
      console.error('[Estabelecimentos] Erro ao salvar nomes:', err);
      toast('Não foi possível salvar os nomes.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100">
      <div className="p-6 sm:p-10 border-b border-slate-50 space-y-5 bg-slate-50/20">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 italic">Estabelecimentos</h2>
          <p className="text-sm text-slate-500 font-medium">Lojas lidas nos seus cupons, com nome fantasia, razão social e tipo. O tipo é o filtro do Comparador.</p>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mostrar estabelecimentos pelo</p>
          <div className="inline-flex gap-1 p-1 bg-slate-100 rounded-2xl">
            {([
              { id: 'trade', label: 'Nome fantasia' },
              { id: 'legal', label: 'Razão social' },
            ] as { id: MerchantNameDisplay; label: string }[]).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => changeDisplay(opt.id)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${display === opt.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">Vale para os próximos cupons lidos e para o Comparador. Sem a razão social no cupom, o nome fantasia é usado (e vice-versa).</p>
        </div>
        {establishments.length > 5 && (
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, CNPJ ou tipo..."
              className="w-full h-12 bg-white border border-slate-100 rounded-2xl pl-11 pr-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-brand-600" /></div>
      ) : visible.length === 0 ? (
        <div className="p-12 flex flex-col items-center text-center gap-3">
          <Store size={36} className="text-slate-200" />
          <p className="text-sm text-slate-400 max-w-xs">
            {establishments.length === 0
              ? 'Nenhum estabelecimento ainda. Eles aparecem aqui depois que você lê um cupom em AI & Insights.'
              : 'Nenhum estabelecimento encontrado para essa busca.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {visible.map(est => {
            const isEditing = editingKey === est.key;
            const isBusy = busy === est.key;
            return (
              <li key={est.key} className="p-6 sm:px-10 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold text-slate-900 uppercase tracking-tight italic break-words">{est.name}</p>
                    {!isEditing && (
                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <p><span className="font-bold text-slate-400">Nome fantasia:</span> {est.tradeName || '—'}</p>
                        <p><span className="font-bold text-slate-400">Razão social:</span> {est.legalName || '—'}</p>
                        {est.cnpj && <p><span className="font-bold text-slate-400">CNPJ:</span> {formatCnpj(est.cnpj)}</p>}
                      </div>
                    )}
                  </div>
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => startEdit(est.key, est.tradeName, est.legalName)}
                      disabled={isBusy}
                      className="shrink-0 w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:text-brand-600 hover:bg-brand-50 flex items-center justify-center transition-all disabled:opacity-50"
                      title="Editar nomes"
                      aria-label="Editar nomes"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>

                {isEditing && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome fantasia</label>
                        <input
                          type="text"
                          value={editTrade}
                          onChange={(e) => setEditTrade(e.target.value)}
                          className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl px-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Razão social</label>
                        <input
                          type="text"
                          value={editLegal}
                          onChange={(e) => setEditLegal(e.target.value)}
                          className="w-full h-11 bg-slate-50 border border-slate-100 rounded-xl px-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(est.key, est.docIds)}
                        disabled={isBusy}
                        className="h-10 px-4 bg-brand-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-brand-700 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingKey(null)}
                        disabled={isBusy}
                        className="h-10 px-4 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <X size={14} /> Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</span>
                    <select
                      value={est.segment}
                      disabled={isBusy}
                      onChange={(e) => changeSegment(est.key, est.docIds, e.target.value)}
                      className="bg-slate-100 border-none rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase text-slate-600 cursor-pointer disabled:opacity-50"
                    >
                      {(MERCHANT_SEGMENTS as readonly string[]).includes(est.segment) ? null : <option value={est.segment}>{est.segment}</option>}
                      {MERCHANT_SEGMENTS.map(seg => <option key={seg} value={seg}>{seg}</option>)}
                    </select>
                  </label>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Última compra {DateUtils.formatDisplayDate(est.lastActive) || '—'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {est.count} {est.count === 1 ? 'cupom' : 'cupons'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
