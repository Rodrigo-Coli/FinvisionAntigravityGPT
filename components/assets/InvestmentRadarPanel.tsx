import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Radar, ShieldCheck, AlertTriangle, Siren, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  FileUp, Loader2, Info, BellOff, Pencil, Check, X, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { authHeaders } from '../../lib/apiClient';
import { getSessionUser } from '../../lib/session';
import { useToast } from '../../contexts/ToastContext';
import { FieldLabel } from '../common/HelpTip';
import { LEVEL_LABEL, RECHECK_DAYS, type RadarLevel, type RadarSignal, type PerformanceExplanation } from '../../lib/investmentRadar';
import { curveSpecOf, CURVE_TYPES } from '../../lib/curveProjection';
import { brokerOf, type AccountLite } from '../../lib/assetLocation';

// Radar de Investimentos (Patrimônio › Investimentos).
// Mostra o último resultado de cada investimento (gravado pela varredura
// diária ou pelo botão "Analisar agora"), deixa completar o emissor e o
// preço de mercado (que o relatório do banco traz) e compara sugestões do
// banco/gerente com a carteira. As regras ficam em lib/investmentRadar.ts.

interface RadarRow {
  asset_id: string;
  level: RadarLevel;
  score: number | null;
  signals: RadarSignal[];
  summary: string | null;
  recommendation: string | null;
  exit_math: { holdGross: number; sellGross: number; costOfExit: number; irNote: string; note: string } | null;
  news: { risk: string; headline?: string; events?: string[]; pending?: boolean } | null;
  explanation?: PerformanceExplanation | null;
  sources: { title: string; url: string }[];
  history: { at: string; level: RadarLevel }[];
  checked_at: string;
  next_check_at: string | null;
  dismissed_until: string | null;
}

interface AssetLite {
  id: string;
  name: string;
  estimated_value: number;
  metadata: Record<string, any> | null;
}

interface FollowUp {
  at: string;
  channel?: string | null;
  answer?: string | null;
  file_name?: string | null;
  verdict?: string | null;
  analysis?: string | null;
}

interface Proposal {
  id: string;
  created_at: string;
  source_name: string | null;
  verdict: string | null;
  analysis: string | null;
  follow_ups?: FollowUp[] | null;
  channel?: string | null;
}

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBr = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const LEVEL_STYLE: Record<RadarLevel | 'NONE', { chip: string; icon: React.ReactNode }> = {
  URGENTE: { chip: 'bg-rose-50 text-rose-700 border-rose-200', icon: <Siren size={14} /> },
  ATENCAO: { chip: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle size={14} /> },
  OK: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <ShieldCheck size={14} /> },
  NONE: { chip: 'bg-slate-50 text-slate-500 border-slate-200', icon: <Info size={14} /> }
};
const LEVEL_ORDER: Record<string, number> = { URGENTE: 0, ATENCAO: 1, NONE: 2, OK: 3 };
type LevelFilter = RadarLevel | 'NONE';
const TREND_STYLE: Record<PerformanceExplanation['trend'], { cls: string; icon: React.ReactNode }> = {
  up: { cls: 'text-emerald-700', icon: <TrendingUp size={13} className="shrink-0" /> },
  flat: { cls: 'text-slate-600', icon: <Minus size={13} className="shrink-0" /> },
  down: { cls: 'text-rose-700', icon: <TrendingDown size={13} className="shrink-0" /> },
  unknown: { cls: 'text-slate-400', icon: <Info size={13} className="shrink-0" /> }
};
/** Notícias pendentes (cota da IA): o Radar tenta de novo sozinho ao abrir, passado este tempo. */
const PENDING_RETRY_MS = 3600 * 1000;
const VERDICT_STYLE: Record<string, string> = {
  VALE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NAO_VALE: 'bg-rose-50 text-rose-700 border-rose-200',
  DEPENDE: 'bg-amber-50 text-amber-700 border-amber-200'
};
const VERDICT_LABEL: Record<string, string> = { VALE: 'Vale', NAO_VALE: 'Não vale', DEPENDE: 'Depende' };

/** Markdown simples (títulos, listas, negrito) para a análise da sugestão. */
const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const bold = (t: string) => t.split(/\*\*(.*?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i} className="text-slate-900">{p}</strong> : p));
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((raw, i) => {
        const line = raw.trim();
        if (!line) return <div key={i} className="h-1.5" />;
        if (/^#{1,3}\s/.test(line)) return <h4 key={i} className="font-bold text-slate-900 mt-3">{bold(line.replace(/^#{1,3}\s/, ''))}</h4>;
        if (/^[-*]\s/.test(line)) return <p key={i} className="pl-4 relative text-sm text-slate-600"><span className="absolute left-0">•</span>{bold(line.slice(2))}</p>;
        if (/^\d+\.\s/.test(line)) return <p key={i} className="text-sm text-slate-700 font-medium mt-2">{bold(line)}</p>;
        return <p key={i} className="text-sm text-slate-600 leading-relaxed">{bold(line)}</p>;
      })}
    </div>
  );
};

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const InvestmentRadarPanel: React.FC<{ onAssetsChanged?: () => void }> = ({ onAssetsChanged }) => {
  const { toast } = useToast();
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [rows, setRows] = useState<Record<string, RadarRow>>({});
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [scanning, setScanning] = useState<string | null>(null); // 'ALL' ou id do ativo
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showHow, setShowHow] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState({ issuer: '', bankValue: '', bankDate: '', reportValue: '', reportDate: '', autoCurve: false });
  const [savingEdit, setSavingEdit] = useState(false);
  const [compareFile, setCompareFile] = useState<File | null>(null);
  const [compareNote, setCompareNote] = useState('');
  const [comparing, setComparing] = useState(false);
  const [openProposal, setOpenProposal] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [answering, setAnswering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Filtro por nível. O aviso vermelho da tela inicial e o do WhatsApp chegam
  // com ?nivel=URGENTE (ou o antigo radar=1) e a lista já vem filtrada e aberta.
  const [searchParams] = useSearchParams();
  const linkLevel = useMemo(() => {
    const n = searchParams.get('nivel');
    if (n && n in LEVEL_ORDER) return n as LevelFilter;
    return searchParams.get('radar') === '1' ? 'URGENTE' : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [levelFilter, setLevelFilter] = useState<LevelFilter | 'ALL'>(linkLevel || 'ALL');
  const linkApplied = useRef(false);
  const autoRetried = useRef(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const user = await getSessionUser(supabase);
    if (!user) return;
    const [assetsRes, radarRes, propRes, accRes] = await Promise.all([
      supabase.from('physical_assets').select('id, name, estimated_value, metadata').eq('user_id', user.id).eq('category', 'INVESTMENT').eq('is_archived', false),
      supabase.from('investment_radar').select('*').eq('user_id', user.id),
      supabase.from('investment_proposals').select('id, created_at, source_name, verdict, analysis, follow_ups, channel').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('accounts').select('id, institution, name').eq('user_id', user.id)
    ]);
    setAccounts(accRes?.error ? [] : (((accRes?.data) || []) as AccountLite[]));
    setAssets(((assetsRes.data || []) as AssetLite[]).filter(a => a.metadata?.status !== 'RESGATADO' && Number(a.estimated_value) > 0));
    if (radarRes.error) {
      setTableMissing(/does not exist|relation|schema cache/i.test(radarRes.error.message || ''));
    } else {
      setTableMissing(false);
      setRows(Object.fromEntries((radarRes.data || []).map((r: any) => [r.asset_id, r as RadarRow])));
    }
    setProposals(propRes.error ? [] : ((propRes.data || []) as Proposal[]));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Notícias pendentes (a cota da IA tinha acabado): ao abrir o Radar, passada
  // 1 h, tenta de novo em segundo plano, sem travar a tela nem avisar se falhar.
  useEffect(() => {
    if (loading || autoRetried.current || scanning) return;
    const due = Object.values(rows).filter(r => r.news?.pending && Date.now() - Date.parse(r.checked_at) > PENDING_RETRY_MS);
    if (due.length === 0) return;
    autoRetried.current = true;
    (async () => {
      try {
        const resp = await fetch('/api/investment-radar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'scan', assetIds: due.map(r => r.asset_id) })
        });
        if (resp.ok) await load();
      } catch { /* segue pendente; a rodada diária tenta de novo */ }
    })();
  }, [loading, rows, scanning, load]);

  const pendingNews = useMemo(() => Object.values(rows).filter(r => r.news?.pending).length, [rows]);

  // Link do aviso (…&nivel=URGENTE ou radar=1) rola até o radar.
  useEffect(() => {
    if (!loading && linkLevel) {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading, linkLevel]);

  const scan = async (assetId?: string) => {
    setScanning(assetId || 'ALL');
    try {
      const resp = await fetch('/api/investment-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'scan', assetId })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || (resp.status === 504 ? 'A análise demorou demais. Tente "Analisar este" em um investimento.' : 'Falha ao analisar.'));
      const urgent = (data.results || []).filter((r: any) => r.level === 'URGENTE').length;
      toast(
        data.limitMessage
          ? `Analisado sem a busca de notícias: ${data.limitMessage}`
          : urgent > 0
            ? `${urgent} investimento${urgent > 1 ? 's' : ''} em nível URGENTE. Veja abaixo.`
            : `${data.checked || 0} investimento${data.checked === 1 ? '' : 's'} analisado${data.checked === 1 ? '' : 's'}.`,
        urgent > 0 ? 'warning' : 'success'
      );
      await load();
    } catch (err: any) {
      toast(err.message || 'Falha ao analisar.', 'error');
    } finally {
      setScanning(null);
    }
  };

  const dismiss = async (assetId: string) => {
    if (!supabase) return;
    const until = new Date(Date.now() + 7 * 86400000).toISOString();
    await supabase.from('investment_radar').update({ dismissed_until: until }).eq('asset_id', assetId);
    toast('Aviso escondido da tela inicial por 7 dias. O radar continua checando.', 'success');
    load();
  };

  const startEdit = (a: AssetLite) => {
    const m = a.metadata || {};
    setEditing(a.id);
    setDraft({ issuer: m.issuer || '', bankValue: '', bankDate: todayIso(), reportValue: '', reportDate: '', autoCurve: !!m.autoCurve });
  };

  const parseMoney = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };

  const callCurveApi = async (body: Record<string, any>) => {
    const resp = await fetch('/api/investment-radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Falha ao atualizar.');
    return data;
  };

  // Atualizar pelo banco: emissor, curva automática, saldo da tela do app do banco
  // (vira valor de mercado nos títulos com curva; valor atual nos demais) e,
  // quando tiver, o valor pela curva do relatório (acerto).
  const saveEdit = async (a: AssetLite) => {
    if (!supabase) return;
    const bank = parseMoney(draft.bankValue);
    const report = parseMoney(draft.reportValue);
    if (Number.isNaN(bank) || Number.isNaN(report)) {
      toast('Valor inválido. Use o formato 26341,55.', 'warning');
      return;
    }
    if (report && !draft.reportDate) {
      toast('Informe a data do relatório (a data da posição).', 'warning');
      return;
    }
    setSavingEdit(true);
    const messages: string[] = [];
    try {
      const metadata = { ...(a.metadata || {}), issuer: draft.issuer.trim() || null, autoCurve: draft.autoCurve };
      const { error } = await supabase.from('physical_assets').update({ metadata }).eq('id', a.id);
      if (error) throw new Error(error.message);
      if (report) messages.push((await callCurveApi({ action: 'report_curve', assetId: a.id, value: report, date: draft.reportDate })).message);
      if (bank) messages.push((await callCurveApi({ action: 'bank_value', assetId: a.id, value: bank, date: draft.bankDate || todayIso() })).message);
      if (draft.autoCurve) await callCurveApi({ action: 'curve_refresh', assetId: a.id });
      setEditing(null);
      toast(messages.filter(Boolean).join(' ') || 'Dados salvos.', 'success');
      onAssetsChanged?.();
      load();
    } catch (err: any) {
      toast(`Não foi possível salvar: ${err.message}`, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const compare = async () => {
    if (!compareFile) {
      toast('Escolha o print ou o PDF da sugestão.', 'warning');
      return;
    }
    if (compareFile.size > 8 * 1024 * 1024) {
      toast('Arquivo grande demais (máx. 8 MB).', 'warning');
      return;
    }
    setComparing(true);
    try {
      const data64 = await fileToBase64(compareFile);
      const resp = await fetch('/api/investment-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          action: 'compare',
          note: compareNote,
          file: { data: data64, mimeType: compareFile.type || 'application/pdf', name: compareFile.name }
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Falha ao analisar a sugestão.');
      setCompareFile(null);
      setCompareNote('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
      if (data.id) setOpenProposal(data.id);
      toast(`Análise pronta: ${VERDICT_LABEL[data.verdict] || 'Depende'}.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Falha ao analisar a sugestão.', 'error');
    } finally {
      setComparing(false);
    }
  };

  const sendAnswer = async (p: Proposal) => {
    if (!answerText.trim() && !answerFile) {
      toast('Escreva ou anexe a resposta do gerente.', 'warning');
      return;
    }
    if (answerFile && answerFile.size > 8 * 1024 * 1024) {
      toast('Arquivo grande demais (máx. 8 MB).', 'warning');
      return;
    }
    setAnswering(true);
    try {
      const file = answerFile ? { data: await fileToBase64(answerFile), mimeType: answerFile.type || 'application/pdf', name: answerFile.name } : undefined;
      const resp = await fetch('/api/investment-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'answer', proposalId: p.id, text: answerText, file })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Falha ao reavaliar.');
      setAnswerText('');
      setAnswerFile(null);
      await load();
      toast(`Reavaliado: ${VERDICT_LABEL[data.verdict] || 'Depende'}.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Falha ao reavaliar.', 'error');
    } finally {
      setAnswering(false);
    }
  };

  const list = useMemo(() => {
    return assets
      .map(a => ({ asset: a, row: rows[a.id] }))
      .sort((x, y) => {
        const lx = LEVEL_ORDER[x.row?.level || 'NONE'];
        const ly = LEVEL_ORDER[y.row?.level || 'NONE'];
        return lx - ly || Number(y.asset.estimated_value) - Number(x.asset.estimated_value);
      });
  }, [assets, rows]);

  const counts = useMemo(() => {
    const c = { URGENTE: 0, ATENCAO: 0, OK: 0, NONE: 0 } as Record<string, number>;
    list.forEach(({ row }) => { c[row?.level || 'NONE'] += 1; });
    return c;
  }, [list]);

  // Chegou pelo aviso: abre os itens do nível pedido; se não houver nenhum
  // (o aviso já foi resolvido), mostra todos em vez de uma lista vazia.
  useEffect(() => {
    if (loading || !linkLevel || linkApplied.current || list.length === 0) return;
    linkApplied.current = true;
    const hits = list.filter(({ row }) => (row?.level || 'NONE') === linkLevel);
    if (hits.length === 0) { setLevelFilter('ALL'); return; }
    setExpanded(e => ({ ...e, ...Object.fromEntries(hits.map(({ asset }) => [asset.id, true])) }));
  }, [loading, linkLevel, list]);

  const visible = useMemo(
    () => levelFilter === 'ALL' ? list : list.filter(({ row }) => (row?.level || 'NONE') === levelFilter),
    [list, levelFilter]
  );

  const lastCheck = useMemo(() => {
    const dates = Object.values(rows).map(r => r.checked_at).filter(Boolean).sort();
    return dates[dates.length - 1] || null;
  }, [rows]);

  if (loading) return null;
  if (assets.length === 0) return null;

  return (
    <div ref={rootRef} id="radar-investimentos" className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden">
      {/* Cabeçalho */}
      <div className="p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Radar size={22} /></div>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Radar de Investimentos</h3>
              <p className="text-xs text-slate-500 font-medium">
                Avisa quando vale pensar em sair de um investimento e explica por que cada um subiu ou caiu. Última análise: {dateBr(lastCheck)}.
              </p>
              {pendingNews > 0 && (
                <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                  Notícias de {pendingNews} investimento{pendingNews > 1 ? 's' : ''} pendente{pendingNews > 1 ? 's' : ''} (limite da IA). O app tenta de novo sozinho.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowHow(v => !v)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100 flex items-center gap-1.5"
            >
              <Info size={14} /> Como funciona
            </button>
            <button
              onClick={() => setShowMonthly(v => !v)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100 flex items-center gap-1.5"
            >
              <Pencil size={14} /> Como atualizar todo mês
            </button>
            <button
              onClick={() => scan()}
              disabled={!!scanning || tableMissing}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {scanning === 'ALL' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {scanning === 'ALL' ? 'Analisando (pode levar 1 min)…' : 'Analisar agora'}
            </button>
          </div>
        </div>

        {tableMissing && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
            O radar ainda está sendo ativado no banco de dados. Assim que a atualização for aplicada, os resultados aparecem aqui.
          </div>
        )}

        {showHow && (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed space-y-2">
            <p><strong className="text-slate-800">O que o radar olha em cada investimento:</strong></p>
            <p>• <strong>Rendimento mês a mês</strong> (do extrato do investimento aqui no app) contra o CDI do Banco Central: rendendo abaixo de 70% do CDI por 3 meses, ou com perda no mês.</p>
            <p>• <strong>Preço de mercado × curva</strong> (o relatório do banco traz os dois): 10% abaixo já pede atenção; 25% abaixo é grave.</p>
            <p>• <strong>Notícias do emissor/gestor</strong> dos últimos 90 dias, pesquisadas na internet pela IA (recuperação judicial, calote, rebaixamento de rating, resgates suspensos…), sempre com as fontes.</p>
            <p>• <strong>Concentração</strong>: um mesmo emissor com mais de 25% do que você tem investido.</p>
            <p><strong className="text-slate-800">Níveis:</strong> <strong>Urgente</strong> só quando há <em>dois ou mais sinais diferentes</em> e pelo menos um é grave — um sinal sozinho nunca vira urgente, para não dar alarme falso. <strong>Atenção</strong> com qualquer sinal relevante. <strong>Tranquilo</strong> sem sinais.</p>
            <p><strong className="text-slate-800">Quando checa:</strong> sozinho, todo dia de manhã, o que estiver vencido — Tranquilo a cada {RECHECK_DAYS.OK} dias; Atenção e Urgente todo dia. O botão "Analisar agora" checa tudo na hora.</p>
            <p><strong className="text-slate-800">Avisos:</strong> só o Urgente aparece na tela inicial e vai para o WhatsApp/notificação (e repete no máximo uma vez por semana). Toda sugestão de saída mostra a conta de <em>vender hoje × segurar até o vencimento</em>. Nada é vendido ou mudado sem você.</p>
          </div>
        )}

        {showMonthly && (
          <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-xs text-slate-600 leading-relaxed space-y-2">
            <p className="text-slate-800 font-bold">Atualizar os investimentos pelo relatório do banco (uma vez por mês)</p>
            <p><strong className="text-slate-800">1. Pegue o relatório do mês.</strong> Ex.: Safra "Relatório Mensal" (use a parte <em>Marcação Curva</em>, quadro "Investimentos Resumo Composição"); XP: tela do fundo › Variação patrimonial › escolha o mês. Para cada investimento o relatório mostra o saldo do começo, aplicações, resgates, impostos, o rendimento do mês e o saldo do fim.</p>
            <p><strong className="text-slate-800">2. No app, abra o investimento › Extrato › Adicionar Movimentação</strong> e lance o que aconteceu no mês:</p>
            <p className="pl-3">• <strong>Rendimento acumulado (fica no ativo)</strong>: o "rendimento do mês" do relatório. Não mexe em conta nenhuma.</p>
            <p className="pl-3">• <strong>Juros / Cupom recebido (cai na conta)</strong>: quando os juros caíram na conta corrente; escolha a conta. Se o crédito já foi lançado pelo extrato da conta, o app avisa para não contar duas vezes.</p>
            <p className="pl-3">• <strong>Aporte</strong> (dinheiro novo aplicado), <strong>Resgate</strong> ou <strong>Amortização</strong> (dinheiro que voltou): escolha a conta de onde saiu ou para onde foi.</p>
            <p className="pl-3">• <strong>Ajuste Manual</strong> com valor negativo para IR/come-cotas descontado do investimento.</p>
            <p><strong className="text-slate-800">3. Jeito rápido — pela tela do app do banco:</strong> aqui no Radar, no investimento › <strong>"Atualizar pelo banco"</strong>, digite o saldo que aparece no app. Em fundos e CDB vira o valor atual (a diferença entra como rendimento). Em CRA/CRI/debêntures a tela mostra o valor de <em>mercado</em>: ligue a <strong>curva automática</strong> (o app calcula a curva todo dia pela taxa) e o saldo da tela fica como valor de mercado. Quando sair o relatório, informe o valor pela curva para o app acertar a diferença.</p>
            <p><strong className="text-slate-800">4. Confira:</strong> o valor do investimento no app tem que ficar igual ao "Saldo Bruto" pela curva no fim do mês. Se não bater, falta alguma movimentação.</p>
          </div>
        )}

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['URGENTE', 'ATENCAO', 'OK', 'NONE'] as const).map(l => {
            const active = levelFilter === l;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={active}
                title={active ? 'Mostrar todos' : 'Mostrar só este nível'}
                onClick={() => setLevelFilter(active ? 'ALL' : l)}
                className={`text-left px-3 py-2.5 rounded-2xl border transition-all ${LEVEL_STYLE[l].chip} ${active ? 'ring-2 ring-offset-1 ring-current' : levelFilter !== 'ALL' ? 'opacity-50 hover:opacity-100' : 'hover:brightness-95'}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">{LEVEL_STYLE[l].icon}{l === 'NONE' ? 'Sem análise' : LEVEL_LABEL[l]}</div>
                <div className="text-xl font-black mt-0.5">{counts[l]}</div>
              </button>
            );
          })}
        </div>
        {levelFilter !== 'ALL' && (
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500" data-testid="radar-filter-note">
            <span>Mostrando só: {levelFilter === 'NONE' ? 'Sem análise' : LEVEL_LABEL[levelFilter]} ({visible.length})</span>
            <button type="button" onClick={() => setLevelFilter('ALL')} className="text-brand-600 hover:underline">Ver todos ({list.length})</button>
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="border-t border-slate-100 divide-y divide-slate-100">
        {visible.length === 0 && (
          <p className="px-5 sm:px-7 py-6 text-xs text-slate-400 font-medium">Nenhum investimento neste nível.</p>
        )}
        {visible.map(({ asset, row }) => {
          const level = (row ? row.level : 'NONE') as RadarLevel | 'NONE';
          const open = !!expanded[asset.id];
          const style = LEVEL_STYLE[level];
          return (
            <div key={asset.id} className="px-5 sm:px-7 py-4">
              <button className="w-full flex items-center gap-3 text-left" onClick={() => setExpanded(e => ({ ...e, [asset.id]: !open }))}>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${style.chip}`}>
                  {style.icon}{level === 'NONE' ? 'Sem análise' : LEVEL_LABEL[level]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-800 truncate">{asset.name}</span>
                  {brokerOf(asset.metadata, accounts) && (
                    <span className="block text-[11px] font-bold text-indigo-600 truncate" data-testid="radar-broker">{brokerOf(asset.metadata, accounts)}</span>
                  )}
                  <span className="block text-[11px] text-slate-500 truncate">{row?.summary || 'Ainda não analisado — toque em "Analisar agora"'} · {brl(asset.estimated_value)}</span>
                  {row?.explanation?.headline && row.explanation.trend !== 'unknown' && (
                    <span className={`flex items-center gap-1 text-[11px] font-semibold truncate ${TREND_STYLE[row.explanation.trend].cls}`} data-testid="radar-trend">
                      {TREND_STYLE[row.explanation.trend].icon}<span className="truncate">{row.explanation.headline}</span>
                    </span>
                  )}
                </span>
                {open ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
              </button>

              {open && (
                <div className="mt-4 space-y-4 text-xs">
                  {row?.recommendation && (
                    <div className={`p-3 rounded-2xl border ${style.chip} font-semibold leading-relaxed`}>{row.recommendation}</div>
                  )}

                  {row?.explanation && (
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5" data-testid="radar-explanation">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Por que rende assim</p>
                      <p className={`flex items-center gap-1.5 font-bold ${TREND_STYLE[row.explanation.trend].cls}`}>
                        {TREND_STYLE[row.explanation.trend].icon}{row.explanation.headline}
                      </p>
                      {row.explanation.points.map((p, i) => (
                        <p key={i} className="text-slate-600 leading-relaxed pl-3 relative"><span className="absolute left-0">•</span>{p}</p>
                      ))}
                    </div>
                  )}

                  {row?.news?.pending && (
                    <p className="text-[11px] text-amber-700">Notícias do emissor pendentes: a IA estava no limite na última análise. O app tenta de novo sozinho.</p>
                  )}

                  {row?.signals?.length ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sinais encontrados</p>
                      {row.signals.map((s, i) => (
                        <div key={i} className="flex gap-2">
                          <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${s.severity === 'severe' ? 'bg-rose-500' : s.severity === 'moderate' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                          <p className="text-slate-600"><strong className="text-slate-800">{s.label}.</strong> {s.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : row ? <p className="text-slate-500">Nenhum sinal de risco na última análise.</p> : null}

                  {row?.exit_math && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vender hoje (bruto)</p>
                        <p className="text-sm font-black text-slate-800">{brl(row.exit_math.sellGross)}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Segurar (curva hoje)</p>
                        <p className="text-sm font-black text-slate-800">{brl(row.exit_math.holdGross)}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Custo de sair agora</p>
                        <p className={`text-sm font-black ${row.exit_math.costOfExit > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{brl(Math.max(0, row.exit_math.costOfExit))}</p>
                      </div>
                      <p className="sm:col-span-3 text-slate-500">{row.exit_math.irNote}</p>
                    </div>
                  )}

                  {row?.news && row.news.risk !== 'none' && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notícias do emissor</p>
                      {row.news.headline && <p className="text-slate-700 font-semibold">{row.news.headline}</p>}
                      {(row.news.events || []).map((e, i) => <p key={i} className="text-slate-600">• {e}</p>)}
                    </div>
                  )}
                  {row?.sources?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {row.sources.map((s, i) => (
                        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-indigo-600 hover:underline max-w-full">
                          <ExternalLink size={11} className="shrink-0" /><span className="truncate max-w-[220px]">{s.title || s.url}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {row?.history?.length ? (
                    <p className="text-slate-400">
                      Histórico: {row.history.slice(0, 6).map(h => `${dateBr(h.at)} ${LEVEL_LABEL[h.level]}`).join(' · ')}
                    </p>
                  ) : null}

                  {/* Dados que melhoram a análise */}
                  {editing === asset.id ? (() => {
                    const meta = asset.metadata || {};
                    const spec = curveSpecOf(meta);
                    const isCurveType = CURVE_TYPES.includes(String(meta.investmentType)) && !!spec;
                    const marketStyle = draft.autoCurve || (isCurveType && ['CRI_CRA', 'DEBENTURES'].includes(String(meta.investmentType)));
                    const specText = spec ? (spec.index === 'CDI' ? `${String(spec.rate).replace('.', ',')}% do CDI` : spec.index === 'IPCA' ? `IPCA + ${String(spec.rate).replace('.', ',')}% a.a.` : `${String(spec.rate).replace('.', ',')}% a.a. prefixado`) : '';
                    return (
                    <div className="p-3 sm:p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-4">
                      <p className="text-xs font-bold text-slate-800">Atualizar pelo banco</p>
                      <div>
                        <FieldLabel label="Emissor / gestor" help="Quem deve o dinheiro ou administra o fundo (ex.: Raízen, Eucatex, SulAmérica). O radar pesquisa notícias por esse nome e soma tudo o que você tem com ele para medir a concentração. Vazio = usa o nome do investimento." />
                        <input value={draft.issuer} onChange={e => setDraft(d => ({ ...d, issuer: e.target.value }))} placeholder={asset.name} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                      </div>

                      {isCurveType && (
                        <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={draft.autoCurve} onChange={e => setDraft(d => ({ ...d, autoCurve: e.target.checked }))} className="mt-0.5" />
                          <span><strong className="text-slate-800">Curva automática pela taxa contratada ({specText})</strong> — o app atualiza sozinho, todo dia, o valor pela curva (o que o título vale se você segurar até o vencimento). Você não precisa lançar o rendimento do mês.</span>
                        </label>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <FieldLabel
                            label="Saldo na tela do app do banco (R$)"
                            help={marketStyle
                              ? 'O "Saldo total" que aparece no app do banco hoje. Neste tipo de título (CRA, CRI, debênture) esse saldo é o valor de MERCADO: o app guarda como valor de mercado (o Radar usa para medir o risco) e o patrimônio continua pela curva.'
                              : 'O saldo que aparece no app do banco hoje. O app troca o valor atual por este e lança a diferença desde a última atualização como rendimento do período (ou queda, se diminuiu).'}
                          />
                          <input inputMode="decimal" value={draft.bankValue} onChange={e => setDraft(d => ({ ...d, bankValue: e.target.value }))} placeholder="ex.: 26341,55" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                        </div>
                        <div>
                          <FieldLabel label="Data do saldo" help="O dia em que você viu esse saldo no app do banco (normalmente hoje)." />
                          <input type="date" value={draft.bankDate} onChange={e => setDraft(d => ({ ...d, bankDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                        </div>
                      </div>

                      {isCurveType && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <FieldLabel label="Valor pela curva no relatório (opcional)" help={'Quando sair o relatório mensal do banco, use o "Saldo Bruto" da parte "Marcação Curva" deste título. O app compara com o que ele calculou e lança um acerto com a diferença; a curva automática segue a partir daí. Sem relatório, deixe vazio.'} />
                            <input inputMode="decimal" value={draft.reportValue} onChange={e => setDraft(d => ({ ...d, reportValue: e.target.value }))} placeholder="ex.: 61418,18" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                          </div>
                          <div>
                            <FieldLabel label="Data da posição do relatório" help={'A "Data da posição" que aparece no topo do relatório (normalmente o último dia do mês).'} />
                            <input type="date" value={draft.reportDate} onChange={e => setDraft(d => ({ ...d, reportDate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button disabled={savingEdit} onClick={() => saveEdit(asset)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1 disabled:opacity-50">{savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar</button>
                        <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold flex items-center gap-1"><X size={14} /> Cancelar</button>
                      </div>
                    </div>
                    );
                  })() : (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => scan(asset.id)} disabled={!!scanning || tableMissing} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center gap-1.5 disabled:opacity-50">
                        {scanning === asset.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Analisar este
                      </button>
                      <button onClick={() => startEdit(asset)} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 font-bold flex items-center gap-1.5">
                        <Pencil size={13} /> Atualizar pelo banco
                      </button>
                      {row?.level === 'URGENTE' && (
                        <button onClick={() => dismiss(asset.id)} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 font-bold flex items-center gap-1.5">
                          <BellOff size={13} /> Já vi, esconder da tela inicial por 7 dias
                        </button>
                      )}
                    </div>
                  )}
                  {row && <p className="text-[11px] text-slate-400">Analisado em {dateBr(row.checked_at)} · próxima checagem {dateBr(row.next_check_at)}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparar sugestão do banco */}
      <div className="border-t border-slate-100 p-5 sm:p-7 space-y-4 bg-slate-50/40">
        <div>
          <h4 className="text-sm font-black text-slate-900">Comparar uma sugestão do banco ou do gerente</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Mande o print, a lâmina ou o PDF do produto que te ofereceram. A IA lê o produto, compara com a sua carteira (rendimento líquido de IR, risco, liquidez, FGC, concentração) e diz se vale, não vale ou depende — e o que perguntar ao gerente.
          </p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            <strong className="text-slate-700">Pelo WhatsApp também:</strong> mande o print/PDF com a legenda <strong>"sugestão"</strong>. Quando o gerente responder, mande <strong>"gerente: …"</strong> (texto, áudio ou print) — a resposta entra na mesma análise e fica guardada aqui.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Arquivo da sugestão" help="Imagem (print da tela ou foto nítida) ou PDF da lâmina/proposta, até 8 MB. Quanto mais dados aparecerem (taxa, prazo, emissor, liquidez), melhor a análise." />
            <input ref={fileRef} id="radar-compare-file" type="file" accept="image/*,application/pdf" onChange={e => setCompareFile(e.target.files?.[0] || null)} className="sr-only" />
            <label htmlFor="radar-compare-file" className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-dashed border-indigo-200 bg-white text-xs cursor-pointer hover:bg-indigo-50">
              <FileUp size={14} className="text-indigo-600 shrink-0" />
              <span className="font-bold text-indigo-700 shrink-0">Escolher arquivo</span>
              <span className="text-slate-500 truncate">{compareFile ? compareFile.name : 'nenhum arquivo escolhido'}</span>
            </label>
          </div>
          <div>
            <FieldLabel label="Observação (opcional)" help="O que a gerente disse ou o que você quer saber. Ex.: 'ela sugeriu trocar o CRA da Raízen por este' ou 'é para o dinheiro que vence em dezembro'." />
            <input value={compareNote} onChange={e => setCompareNote(e.target.value)} placeholder="ex.: trocar o CRA Raízen por este?" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
        </div>
        <button onClick={compare} disabled={comparing || !compareFile || tableMissing} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
          {comparing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
          {comparing ? 'Analisando a sugestão…' : 'Analisar sugestão'}
        </button>

        {proposals.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Últimas análises</p>
            {proposals.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-100">
                <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => { setOpenProposal(o => (o === p.id ? null : p.id)); setAnswerText(''); setAnswerFile(null); }}>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${VERDICT_STYLE[p.verdict || 'DEPENDE'] || VERDICT_STYLE.DEPENDE}`}>{VERDICT_LABEL[p.verdict || 'DEPENDE'] || 'Depende'}</span>
                  <span className="flex-1 min-w-0 text-xs font-bold text-slate-700 truncate">{p.source_name || 'Sugestão'}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{dateBr(p.created_at)}</span>
                </button>
                {openProposal === p.id && (
                  <div className="px-4 pb-4 space-y-4">
                    {p.analysis && <SimpleMarkdown text={p.analysis} />}

                    {(p.follow_ups || []).map((f, i) => (
                      <div key={i} className="space-y-2 border-t border-slate-100 pt-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Resposta do gerente · {dateBr(f.at)}{f.channel === 'whatsapp' ? ' · pelo WhatsApp' : ''}
                        </p>
                        {f.answer && <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 whitespace-pre-wrap">{f.answer}</p>}
                        {f.file_name && <p className="text-[11px] text-slate-500">Arquivo: {f.file_name}</p>}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reavaliação</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${VERDICT_STYLE[f.verdict || 'DEPENDE'] || VERDICT_STYLE.DEPENDE}`}>{VERDICT_LABEL[f.verdict || 'DEPENDE'] || 'Depende'}</span>
                        </div>
                        {f.analysis && <SimpleMarkdown text={f.analysis} />}
                      </div>
                    ))}

                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      <FieldLabel label="Resposta do gerente" help="Cole ou escreva o que o gerente respondeu às perguntas acima (pode anexar o print da conversa ou o documento que ele mandou). A IA junta com a análise anterior, diz o que foi esclarecido e se o veredito muda. Tudo fica guardado aqui, na ordem. Pelo WhatsApp: mande começando com 'gerente:' (texto, áudio ou print)." />
                      <textarea
                        value={answerText}
                        onChange={e => setAnswerText(e.target.value)}
                        rows={3}
                        placeholder="ex.: a taxa é 102% do CDI, carência de 2 anos, tem FGC"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      />
                      <input id={`answer-file-${p.id}`} type="file" accept="image/*,application/pdf" className="sr-only" onChange={e => setAnswerFile(e.target.files?.[0] || null)} />
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor={`answer-file-${p.id}`} className="px-3 py-2 rounded-xl border border-dashed border-indigo-200 bg-white text-xs cursor-pointer hover:bg-indigo-50 flex items-center gap-1.5 max-w-full">
                          <FileUp size={13} className="text-indigo-600 shrink-0" />
                          <span className="font-bold text-indigo-700 shrink-0">Anexar print (opcional)</span>
                          {answerFile && <span className="text-slate-500 truncate">{answerFile.name}</span>}
                        </label>
                        <button onClick={() => sendAnswer(p)} disabled={answering} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                          {answering ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          {answering ? 'Reavaliando…' : 'Reavaliar com a resposta'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestmentRadarPanel;
