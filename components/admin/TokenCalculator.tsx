import React, { useState } from 'react';
import { Calculator, TrendingUp, Info, Brain, AlertTriangle } from 'lucide-react';

interface TokenCalculatorProps {
  usdToBrl: number;
}

// Preços Gemini 2.5 Flash (USD por 1 milhão de tokens). Editáveis abaixo caso mudem.
const DEFAULT_PRICES = {
  inputUsdPer1M: 0.30,   // texto/imagem de entrada
  outputUsdPer1M: 2.50,  // saída
  audioUsdPer1M: 1.00,   // áudio de entrada
};

// Cada função de IA do app. Tokens são ESTIMATIVAS calibradas pelos prompts reais.
// input inclui prompt de sistema + contexto + imagem (258 tokens/imagem já embutidos onde há foto/PDF).
interface AiFn {
  key: string;
  label: string;
  callsPerMonth: number; // teto permitido pelo plano (por usuário)
  inputTokens: number;
  outputTokens: number;
  audioTokens: number;
  note?: string;
}

const DEFAULT_FUNCTIONS: AiFn[] = [
  { key: 'receipt', label: 'Scan de Nota/Cupom (foto)', callsPerMonth: 30, inputTokens: 1550, outputTokens: 800, audioTokens: 0, note: 'inclui ~258 tokens/imagem' },
  { key: 'chat', label: 'Chat IA (FinVision)', callsPerMonth: 50, inputTokens: 2000, outputTokens: 500, audioTokens: 0, note: 'prompt + histórico + contexto' },
  { key: 'wealth', label: 'Insights / Análise de Patrimônio', callsPerMonth: 4, inputTokens: 3200, outputTokens: 1200, audioTokens: 0 },
  { key: 'categorize', label: 'Categorização automática', callsPerMonth: 20, inputTokens: 1000, outputTokens: 400, audioTokens: 0, note: 'por lote' },
  { key: 'reconcile', label: 'Conciliação banco/cartão (PDF)', callsPerMonth: 4, inputTokens: 2200, outputTokens: 1000, audioTokens: 0 },
  { key: 'statement', label: 'Leitura de extrato/fatura (PDF)', callsPerMonth: 4, inputTokens: 2500, outputTokens: 1500, audioTokens: 0 },
  { key: 'import', label: 'Importação inteligente', callsPerMonth: 2, inputTokens: 2000, outputTokens: 1000, audioTokens: 0 },
  { key: 'voice', label: 'Assistente de voz (áudio)', callsPerMonth: 10, inputTokens: 1200, outputTokens: 300, audioTokens: 320, note: '~10s áudio = 320 tokens' },
  { key: 'whatsapp', label: 'IA no WhatsApp', callsPerMonth: 30, inputTokens: 1500, outputTokens: 400, audioTokens: 0 },
];

export default function TokenCalculator({ usdToBrl }: TokenCalculatorProps) {
  const [prices] = useState(DEFAULT_PRICES);
  const [fns, setFns] = useState<AiFn[]>(DEFAULT_FUNCTIONS);
  const [marginMultiplier, setMarginMultiplier] = useState(6);

  const fmtBrl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const costPerCallUsd = (f: AiFn) =>
    (f.inputTokens / 1_000_000) * prices.inputUsdPer1M +
    (f.outputTokens / 1_000_000) * prices.outputUsdPer1M +
    (f.audioTokens / 1_000_000) * prices.audioUsdPer1M;

  const monthlyUsd = (f: AiFn) => costPerCallUsd(f) * f.callsPerMonth;

  const totalMonthlyUsd = fns.reduce((s, f) => s + monthlyUsd(f), 0);
  const totalMonthlyBrl = totalMonthlyUsd * usdToBrl;
  const suggestedPriceBrl = totalMonthlyBrl * marginMultiplier;

  const updateFn = (key: string, field: keyof AiFn, value: number) =>
    setFns(prev => prev.map(f => f.key === key ? { ...f, [field]: isNaN(value) ? 0 : value } : f));

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
          <Calculator size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Custo de IA por Função</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gemini 2.5 Flash · teto de uso por plano</p>
        </div>
      </div>

      {/* Aviso de precisão */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-700 font-medium leading-normal">
          Os tokens abaixo são <b>estimativas</b> calibradas pelos prompts reais. Para custo <b>exato (erro zero)</b>, o app precisa registrar o consumo real que o Gemini retorna (usageMetadata) a cada chamada — recomendado como próximo passo.
        </p>
      </div>

      {/* Tabela por função */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
              <th className="text-left py-2 pr-2">Função de IA</th>
              <th className="text-center px-2">Chamadas/mês<br/>(teto do plano)</th>
              <th className="text-center px-2">Tokens entrada</th>
              <th className="text-center px-2">Tokens saída</th>
              <th className="text-right pl-2">Custo/mês</th>
            </tr>
          </thead>
          <tbody>
            {fns.map(f => (
              <tr key={f.key} className="border-b border-slate-50">
                <td className="py-2 pr-2">
                  <div className="font-bold text-slate-800 text-xs">{f.label}</div>
                  {f.note && <div className="text-[9px] text-slate-400">{f.note}</div>}
                </td>
                <td className="px-2">
                  <input type="number" min="0" value={f.callsPerMonth}
                    onChange={e => updateFn(f.key, 'callsPerMonth', parseInt(e.target.value))}
                    className="w-16 h-8 text-center bg-slate-50 rounded-lg text-xs font-bold border-none outline-none" />
                </td>
                <td className="px-2">
                  <input type="number" min="0" value={f.inputTokens}
                    onChange={e => updateFn(f.key, 'inputTokens', parseInt(e.target.value))}
                    className="w-20 h-8 text-center bg-slate-50 rounded-lg text-xs font-bold border-none outline-none" />
                </td>
                <td className="px-2">
                  <input type="number" min="0" value={f.outputTokens}
                    onChange={e => updateFn(f.key, 'outputTokens', parseInt(e.target.value))}
                    className="w-20 h-8 text-center bg-slate-50 rounded-lg text-xs font-bold border-none outline-none" />
                </td>
                <td className="text-right pl-2 font-black text-slate-900 whitespace-nowrap">
                  {fmtBrl(monthlyUsd(f) * usdToBrl)}
                  <div className="text-[9px] font-medium text-slate-400">{fmtBrl(costPerCallUsd(f) * usdToBrl)}/chamada</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-brand-50 rounded-2xl text-center">
          <p className="text-[9px] font-black text-brand-400 uppercase tracking-widest">Custo total/mês (por usuário no teto)</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{fmtBrl(totalMonthlyBrl)}</p>
          <p className="text-[10px] text-slate-400">${totalMonthlyUsd.toFixed(3)} USD · câmbio R$ {usdToBrl.toFixed(2)}</p>
        </div>
        <div className="p-5 bg-slate-50 rounded-2xl text-center flex flex-col justify-center">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1"><TrendingUp size={12} /> Margem</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <button onClick={() => setMarginMultiplier(m => Math.max(1, m - 1))} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-black text-slate-500">−</button>
            <span className="text-xl font-black text-slate-900">x{marginMultiplier}</span>
            <button onClick={() => setMarginMultiplier(m => m + 1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-black text-slate-500">+</button>
          </div>
        </div>
        <div className="p-5 bg-emerald-50 rounded-2xl text-center">
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Preço sugerido do plano</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{fmtBrl(suggestedPriceBrl)}</p>
          <p className="text-[10px] text-slate-400">custo × margem</p>
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
        <div className="flex items-center gap-2 text-slate-400">
          <Info size={14} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Premissas (Gemini 2.5 Flash):</span>
        </div>
        <ul className="text-[10px] text-slate-500 space-y-1 font-medium">
          <li>• Entrada: ${prices.inputUsdPer1M}/1M tokens · Saída: ${prices.outputUsdPer1M}/1M · Áudio: ${prices.audioUsdPer1M}/1M</li>
          <li>• "Chamadas/mês" = o teto que o plano PERMITE usar (custo máximo do plano).</li>
          <li>• Imagem ≈ 258 tokens; áudio ≈ 32 tokens/segundo (já embutidos nas estimativas).</li>
        </ul>
      </div>

      <div className="flex items-center gap-3 text-slate-400">
        <Brain size={16} />
        <span className="text-[10px] font-medium">Ajuste os tokens de cada função conforme a realidade — ou implemente o registro de consumo real para custo exato.</span>
      </div>
    </div>
  );
}
