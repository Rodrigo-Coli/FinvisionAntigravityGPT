import React, { useState, useEffect } from 'react';
import { Calculator, TrendingUp, Info, DollarSign, Brain } from 'lucide-react';

interface TokenCalculatorProps {
  usdToBrl: number;
}

export default function TokenCalculator({ usdToBrl }: TokenCalculatorProps) {
  const [inputs, setInputs] = useState({
    avgScansPerMonth: 100,
    avgImagesPerScan: 1,
    avgAudioSecondsPerScan: 10,
    avgOutputTokensPerScan: 800,
  });

  const [costs, setCosts] = useState({
    inputUsd: 0.30, // per 1M
    outputUsd: 2.50, // per 1M
    audioUsd: 1.00,  // per 1M
  });

  // Constants from Gemini 2.5 Flash
  const TOKENS_PER_IMAGE = 258;
  const TOKENS_PER_AUDIO_SEC = 32;

  const calculate = () => {
    const inputTokensPerScan = (inputs.avgImagesPerScan * TOKENS_PER_IMAGE) + 1000; // base text + image
    const audioTokensPerScan = (inputs.avgAudioSecondsPerScan * TOKENS_PER_AUDIO_SEC);
    const outputTokensPerScan = inputs.avgOutputTokensPerScan;

    const monthlyInputTokens = inputTokensPerScan * inputs.avgScansPerMonth;
    const monthlyAudioTokens = audioTokensPerScan * inputs.avgScansPerMonth;
    const monthlyOutputTokens = outputTokensPerScan * inputs.avgScansPerMonth;

    const inputCostUsd = (monthlyInputTokens / 1_000_000) * costs.inputUsd;
    const audioCostUsd = (monthlyAudioTokens / 1_000_000) * costs.audioUsd;
    const outputCostUsd = (monthlyOutputTokens / 1_000_000) * costs.outputUsd;

    const totalUsd = inputCostUsd + audioCostUsd + outputCostUsd;
    const totalBrl = totalUsd * usdToBrl;

    return {
      totalUsd,
      totalBrl,
      perScanBrl: totalBrl / inputs.avgScansPerMonth
    };
  };

  const results = calculate();

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
          <Calculator size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">ROI & Custo de IA</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Baseado no Gemini 2.5 Flash</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <TrendingUp size={14} /> Simulação de Uso (Médio/Mês)
            </h3>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-500">Scans/Transações por Mês: {inputs.avgScansPerMonth}</label>
                </div>
                <input type="range" min="1" max="1000" step="10" value={inputs.avgScansPerMonth} 
                  onChange={(e) => setInputs({...inputs, avgScansPerMonth: parseInt(e.target.value)})}
                  className="w-full accent-brand-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fotos por Scan</label>
                  <input type="number" value={inputs.avgImagesPerScan} 
                    onChange={(e) => setInputs({...inputs, avgImagesPerScan: parseInt(e.target.value)})}
                    className="w-full h-10 bg-slate-50 rounded-xl px-3 font-bold text-sm border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seg. áudio por Scan</label>
                  <input type="number" value={inputs.avgAudioSecondsPerScan} 
                    onChange={(e) => setInputs({...inputs, avgAudioSecondsPerScan: parseInt(e.target.value)})}
                    className="w-full h-10 bg-slate-50 rounded-xl px-3 font-bold text-sm border-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-slate-400">
               <Info size={14} />
               <span className="text-[10px] font-bold uppercase tracking-widest">Premissas Técnicas:</span>
            </div>
            <ul className="text-[10px] text-slate-500 space-y-1 font-medium">
              <li>• Tokens/Imagem: {TOKENS_PER_IMAGE}</li>
              <li>• Tokens/Seg. Áudio: {TOKENS_PER_AUDIO_SEC}</li>
              <li>• Prompt Base: ~1.000 tokens</li>
              <li>• Taxa Câmbio: R$ {usdToBrl.toFixed(2)}</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center bg-brand-50 rounded-[40px] p-10 text-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-200/20 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-brand-300/30 transition-all duration-700" />
          
          <Brain size={40} className="text-brand-600 mb-4 animate-pulse" />
          <h4 className="text-[10px] font-black text-brand-400 uppercase tracking-[0.2em] mb-2">Custo Estimado da IA</h4>
          <div className="text-4xl font-black text-slate-900 mb-2">
            R$ {results.totalBrl.toFixed(2).replace('.', ',')}
            <span className="text-xs text-slate-400 ml-2">/mês/user</span>
          </div>
          <p className="text-xs font-bold text-slate-500 max-w-[200px]">
            Custo por interação: <span className="text-indigo-600">R$ {results.perScanBrl.toFixed(3)}</span>
          </p>

          <div className="mt-8 pt-8 border-t border-brand-200/50 w-full grid grid-cols-2 gap-4">
             <div>
                <p className="text-[9px] font-bold text-brand-400 uppercase tracking-widest">Custo USD</p>
                <p className="text-lg font-black text-slate-700">${results.totalUsd.toFixed(3)}</p>
             </div>
             <div>
                <p className="text-[9px] font-bold text-brand-400 uppercase tracking-widest">Margem Recomendada</p>
                <p className="text-lg font-black text-emerald-600">x5 ~ x10</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
