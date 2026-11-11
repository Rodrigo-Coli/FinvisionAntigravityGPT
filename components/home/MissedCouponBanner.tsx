import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { missedCoupons, cycleOf } from '../../lib/couponForecast';
import { brokerOf, withBroker, type AccountLite } from '../../lib/assetLocation';
import SnoozeControl from './SnoozeControl';

// Faixa na tela inicial: juros previstos que passaram da data e não caíram na conta
// (lib/couponForecast.ts › missedCoupons). Só aparece quando um juro não chega.
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MissedCouponBanner: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<{ id: string; metadata: any; name: string; when: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) return;
        const user = await getSessionUser(supabase);
        if (!user) return;
        const { data, error } = await supabase
          .from('transactions')
          .select('id, date, amount, description, metadata')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .eq('is_paid', false)
          .eq('metadata->>expected_coupon_state', 'open');
        if (error || cancelled) return;
        // Juros que a pessoa mandou ocultar por X dias ficam fora do aviso até lá.
        const now = Date.now();
        const missed = missedCoupons((data || []) as any[], todayIso())
          .filter((f: any) => !(f.metadata?.missed_snoozed_until && Date.parse(f.metadata.missed_snoozed_until) > now));
        // Corretora/banco de cada título, para não precisar procurar onde está.
        const brokerByAsset = new Map<string, string>();
        if (missed.length) {
          try {
            const ids = Array.from(new Set(missed.map((f: any) => String(f.metadata?.expected_coupon_asset_id || '')).filter(Boolean)));
            const [{ data: assets }, { data: accs }] = await Promise.all([
              supabase.from('physical_assets').select('id, metadata').in('id', ids),
              supabase.from('accounts').select('id, institution, name').eq('user_id', user.id)
            ]);
            for (const a of (assets || []) as any[]) brokerByAsset.set(a.id, brokerOf(a.metadata, (accs || []) as AccountLite[]));
          } catch { /* sem nome da corretora */ }
        }
        if (cancelled) return;
        setItems(missed.map((f: any) => ({
          id: String(f.id),
          metadata: f.metadata || {},
          name: withBroker(
            String(f.description || 'Investimento').replace(/^Juros previstos - /, '').replace(/ \(estimado\)$/, ''),
            brokerByAsset.get(String(f.metadata?.expected_coupon_asset_id || '')) || ''
          ),
          when: cycleOf(f).split('-').reverse().join('/')
        })));
      } catch { /* sem juros previstos: não mostra nada */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Oculta da tela inicial pelos dias escolhidos (marca cada juro em atraso).
  const snooze = async (days: number) => {
    if (!supabase) return;
    const until = new Date(Date.now() + days * 86400000).toISOString();
    await Promise.all(items.map(i =>
      supabase!.from('transactions').update({ metadata: { ...(i.metadata || {}), missed_snoozed_until: until } }).eq('id', i.id)
    ));
    setItems([]);
  };

  if (items.length === 0) return null;

  return (
    <div className="w-full bg-amber-500 text-white rounded-[24px] shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-colors" data-testid="missed-coupon-banner">
    <button
      onClick={() => navigate('/assets?view=investments&juros=atrasados')}
      className="w-full text-left p-4 sm:p-5 pb-2 sm:pb-2 flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><AlertTriangle size={22} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/85">Juros não recebidos</p>
        <p className="text-sm font-bold truncate">
          {items.length === 1 ? `${items[0].name}: o juro de ${items[0].when} não caiu` : `${items.length} juros previstos não caíram na conta`}
        </p>
        <p className="text-xs text-white/85 truncate">{items.length > 1 ? items.map(i => i.name).join(' · ') : 'Toque para conferir e falar com o banco.'}</p>
      </div>
      <ChevronRight size={20} className="shrink-0" />
    </button>
    <div className="px-4 sm:px-5 pb-3 flex justify-end">
      <SnoozeControl onSnooze={snooze} testId="coupon-snooze" />
    </div>
    </div>
  );
};

export default MissedCouponBanner;
