import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { brokerOf, withBroker, type AccountLite } from '../../lib/assetLocation';
import SnoozeControl from './SnoozeControl';

// Faixa vermelha na tela inicial quando o Radar de Investimentos marca algo
// como URGENTE (e a pessoa não escondeu o aviso). Some sozinha quando não há
// nada urgente — a tela inicial só mostra o que é de extrema urgência.
const RadarUrgentBanner: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<{ assetId: string; name: string; summary: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) return;
        const user = await getSessionUser(supabase);
        if (!user) return;
        const { data, error } = await supabase
          .from('investment_radar')
          .select('asset_id, summary, dismissed_until, physical_assets(name, metadata)')
          .eq('user_id', user.id)
          .eq('level', 'URGENTE');
        if (error || cancelled) return;
        const now = Date.now();
        const urgent = (data || []).filter((r: any) => !r.dismissed_until || Date.parse(r.dismissed_until) < now);
        // Corretora/banco de cada um, para não precisar procurar onde está.
        let accounts: AccountLite[] = [];
        if (urgent.length) {
          try {
            const { data: accs } = await supabase.from('accounts').select('id, institution, name').eq('user_id', user.id);
            accounts = (accs || []) as AccountLite[];
          } catch { /* sem nome da corretora */ }
        }
        if (cancelled) return;
        setItems(urgent.map((r: any) => ({
          assetId: String(r.asset_id || ''),
          name: withBroker(r.physical_assets?.name || 'Investimento', brokerOf(r.physical_assets?.metadata, accounts)),
          summary: r.summary || ''
        })));
      } catch { /* sem radar: não mostra nada */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Esconde da tela inicial pelos dias escolhidos (o Radar continua checando).
  const snooze = async (days: number) => {
    if (!supabase) return;
    const until = new Date(Date.now() + days * 86400000).toISOString();
    const ids = items.map(i => i.assetId).filter(Boolean);
    if (ids.length) await supabase.from('investment_radar').update({ dismissed_until: until }).in('asset_id', ids);
    setItems([]);
  };

  if (items.length === 0) return null;

  return (
    <div className="w-full bg-rose-600 text-white rounded-[24px] shadow-lg shadow-rose-500/20 hover:bg-rose-700 transition-colors" data-testid="radar-urgent-banner">
    <button
      onClick={() => navigate('/assets?view=investments&sub=radar&nivel=URGENTE')}
      className="w-full text-left p-4 sm:p-5 pb-2 sm:pb-2 flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><Siren size={22} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Radar de Investimentos · Urgente</p>
        <p className="text-sm font-bold truncate">
          {items.length === 1 ? `${items[0].name}: avalie a saída` : `${items.length} investimentos pedem decisão`}
        </p>
        <p className="text-xs text-white/80 truncate">{items.length === 1 ? (items[0].summary || items[0].name) : items.map(i => i.name).join(' · ')}</p>
      </div>
      <ChevronRight size={20} className="shrink-0" />
    </button>
    <div className="px-4 sm:px-5 pb-3 flex justify-end">
      <SnoozeControl onSnooze={snooze} testId="radar-snooze" />
    </div>
    </div>
  );
};

export default RadarUrgentBanner;
