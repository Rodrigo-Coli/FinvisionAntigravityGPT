import React, { useEffect, useState, useCallback } from 'react';
import { Gift, Copy, Share2, Wallet, Clock, TrendingUp, CheckCircle2, XCircle, Loader2, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { useToast } from '../contexts/ToastContext';
import { REFERRAL_TERMS_SECTIONS } from '../lib/referralTerms';

interface ReferralRow {
  id: string;
  status: 'active' | 'inactive' | 'expired';
  created_at: string;
  commission_percent: number;
  duration_months: number | null;
  total_commission_cents: number;
}

interface AffiliateMe {
  needsTermsAcceptance: boolean;
  affiliateCode?: string;
  pixKey?: string | null;
  totalEarnedCents?: number;
  totalPaidCents?: number;
  pendingHoldCents?: number;
  availableCents?: number;
  processingPayoutCents?: number;
  activeReferrals?: number;
  tier?: { currentPercent: number; nextPercent: number | null; referralsToNextTier: number | null; capPercent: number } | null;
  referrals?: ReferralRow[];
}

const money = (cents: number = 0) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

const STATUS_LABEL: Record<string, { text: string; className: string; icon: React.ReactNode }> = {
  active: { text: 'Ativa', className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30', icon: <CheckCircle2 size={12} /> },
  inactive: { text: 'Inativa', className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30', icon: <XCircle size={12} /> },
  expired: { text: 'Encerrada', className: 'bg-slate-100 text-slate-500 dark:bg-slate-800', icon: <Clock size={12} /> },
};

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase!.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
}

const Referrals: React.FC = () => {
  const { toast } = useToast();
  const [data, setData] = useState<AffiliateMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/affiliate-me', { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar seus dados de indicação.');
      setData(json);
      setPixKey(json.pixKey || '');
    } catch (err: any) {
      toast(err.message || 'Erro ao carregar seus dados de indicação.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleAcceptTerms = async () => {
    setAccepting(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/affiliate-accept-terms', { method: 'POST', headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Não foi possível registrar o aceite.');
      toast('Bem-vindo ao Programa de Indicação!', 'success');
      await load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setAccepting(false);
    }
  };

  const referralLink = data?.affiliateCode ? `${window.location.origin}/?ref=${data.affiliateCode}` : '';

  const copyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    toast('Link copiado!', 'success');
  };

  const shareWhatsApp = () => {
    if (!referralLink) return;
    const text = encodeURIComponent(`Estou usando o FinVision Pro para organizar minhas finanças e recomendo muito! Assine pelo meu link e me ajude a continuar melhorando o app: ${referralLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const savePixKey = async () => {
    if (!pixKey.trim()) return toast('Informe uma chave Pix.', 'error');
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/affiliate-update-pix', { method: 'POST', headers, body: JSON.stringify({ pixKey: pixKey.trim() }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar chave Pix.');
      toast('Chave Pix salva.', 'success');
      await load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const requestPayout = async () => {
    if (!pixKey.trim()) return toast('Cadastre sua chave Pix antes de sacar.', 'error');
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/affiliate-request-payout', { method: 'POST', headers, body: JSON.stringify({ pixKey: pixKey.trim() }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao solicitar saque.');
      toast('Saque solicitado! Você será avisado quando for pago.', 'success');
      await load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const redeemCredit = async () => {
    if (!data?.availableCents) return;
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/affiliate-redeem-credit', { method: 'POST', headers, body: JSON.stringify({ amountCents: data.availableCents }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao solicitar abatimento.');
      toast('Pedido enviado! O abatimento na sua mensalidade será aplicado em breve.', 'success');
      await load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-600" size={32} />
      </div>
    );
  }

  if (!data) return null;

  if (data.needsTermsAcceptance) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg mb-4">
            <Gift size={28} />
          </div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Programa de Indicação</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Indique amigos, ganhe comissão todo mês. Leia os termos antes de gerar seu link.</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 space-y-5 max-h-[50vh] overflow-y-auto">
          {REFERRAL_TERMS_SECTIONS.map(section => (
            <div key={section.title}>
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-1.5">{section.title}</h3>
              {section.body.map((p, i) => (
                <p key={i} className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-1.5">{p}</p>
              ))}
            </div>
          ))}
        </div>

        <button
          onClick={handleAcceptTerms}
          disabled={accepting}
          className="mt-6 w-full py-3.5 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-brand-700 transition-all disabled:opacity-50"
        >
          {accepting ? 'Registrando...' : 'Li e aceito os termos — gerar meu link'}
        </button>
      </div>
    );
  }

  const tier = data.tier;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Gift className="text-brand-600" size={22} /> Indicações
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Compartilhe seu link e ganhe {tier?.currentPercent ?? 0}% da mensalidade de cada amigo, todo mês.</p>
      </div>

      {/* Link de indicação */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Seu link de indicação</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{referralLink}</div>
          <div className="flex gap-2">
            <button onClick={copyLink} className="px-4 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:opacity-90">
              <Copy size={14} /> Copiar
            </button>
            <button onClick={shareWhatsApp} className="px-4 py-3 bg-emerald-500 text-white rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-emerald-600">
              <Share2 size={14} /> WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Progresso de escalonamento */}
      {tier && tier.referralsToNextTier != null && (
        <div className="bg-gradient-to-r from-brand-600 to-indigo-600 rounded-3xl p-5 text-white">
          <p className="text-xs font-bold opacity-90">Faltam {tier.referralsToNextTier} indicaç{tier.referralsToNextTier === 1 ? 'ão ativa' : 'ões ativas'} para você subir de {tier.currentPercent}% para {tier.nextPercent}%</p>
          <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, ((data.activeReferrals || 0) % 5) * 20)}%` }} />
          </div>
        </div>
      )}

      {/* Cards de saldo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Indicações ativas</p>
          <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{data.activeReferrals}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Em carência</p>
          <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{money(data.pendingHoldCents)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Em processamento</p>
          <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{money(data.processingPayoutCents)}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Disponível</p>
          <p className="text-lg font-black text-emerald-700 dark:text-emerald-400 mt-1">{money(data.availableCents)}</p>
        </div>
      </div>

      {/* Ações de saldo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 space-y-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usar saldo disponível</p>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Sua chave Pix</label>
          <div className="flex gap-2">
            <input
              value={pixKey}
              onChange={e => setPixKey(e.target.value)}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
            />
            <button onClick={savePixKey} disabled={busy} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
              Salvar
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={requestPayout}
            disabled={busy || !data.availableCents}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-brand-600 dark:hover:bg-brand-50 transition-all disabled:opacity-40"
          >
            <Wallet size={14} /> Sacar via Pix
          </button>
          <button
            onClick={redeemCredit}
            disabled={busy || !data.availableCents}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400 border border-brand-100 dark:border-brand-900/30 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-all disabled:opacity-40"
          >
            <CreditCard size={14} /> Abater na minha mensalidade
          </button>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">O saque só é liberado 30 dias após cada pagamento do indicado, e só é devido enquanto sua própria assinatura estiver ativa.</p>
      </div>

      {/* Lista de indicações */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Suas indicações ({data.referrals?.length || 0})</p>
        {(!data.referrals || data.referrals.length === 0) ? (
          <p className="text-xs text-slate-400 py-6 text-center">Você ainda não indicou ninguém. Compartilhe seu link acima!</p>
        ) : (
          <div className="space-y-2">
            {data.referrals.map(r => {
              const st = STATUS_LABEL[r.status] || STATUS_LABEL.expired;
              return (
                <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {new Date(r.created_at).toLocaleDateString('pt-BR')} · {r.commission_percent}% · {r.duration_months ? `${r.duration_months} meses` : 'vitalício'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Total gerado: {money(r.total_commission_cents)}</p>
                  </div>
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${st.className}`}>
                    {st.icon} {st.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Referrals;
