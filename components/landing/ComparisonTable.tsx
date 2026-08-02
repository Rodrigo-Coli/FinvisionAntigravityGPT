import React from 'react';
import { ShieldCheck, Check } from 'lucide-react';

const ROWS = [
  {
    label: 'Sincronização de Extratos',
    excel: 'Manual (Copiar & Colar)',
    trad: 'Exige Senha do Banco (Open Finance instável)',
    pro: 'Upload OFX/CSV em 1-Click (sem dar suas senhas)',
    isShield: false,
  },
  {
    label: 'Privacidade & Custódia de Dados',
    excel: 'Local (seguro, porém isolado)',
    trad: 'Venda de perfil de consumo para crédito/publicidade',
    pro: 'Cofre PostgreSQL com RLS isolado (dados 100% seus)',
    isShield: true,
  },
  {
    label: 'Classificação Inteligente de Gastos',
    excel: 'Manual ou fórmulas complexas',
    trad: 'Regras básicas por nome (falha em casos fora do padrão)',
    pro: 'IA autônoma (LLM + OCR de cupons fiscais)',
    isShield: false,
  },
  {
    label: 'DRE Pessoal e Empresarial',
    excel: 'Monta na mão, sem padronização',
    trad: 'Não possui',
    pro: 'DRE completo, exportável em PDF e Excel',
    isShield: false,
  },
  {
    label: 'Financiamento com Amortização',
    excel: 'Fórmulas manuais sujeitas a erro',
    trad: 'Não possui',
    pro: 'Motor de amortização com parcela-balão e indexação IPCA/INCC',
    isShield: false,
  },
  {
    label: 'Módulo de Consórcio',
    excel: 'Não possui',
    trad: 'Não possui',
    pro: 'Módulo dedicado, com contemplação e parcelas',
    isShield: false,
  },
  {
    label: 'Medição de Inflação Pessoal Real',
    excel: 'Impossível',
    trad: 'Usa apenas índices genéricos (IPCA)',
    pro: 'Mapeamento item a item das suas próprias compras',
    isShield: false,
  },
  {
    label: 'Separação Pessoal x Empresa',
    excel: 'Planilhas separadas, sem consolidação',
    trad: 'Não possui',
    pro: 'Mesma conta, entidades separadas e consolidação opcional',
    isShield: false,
  },
  {
    label: 'Assistente por Voz',
    excel: 'Não possui',
    trad: 'Não possui',
    pro: 'Lança e responde por áudio, direto pelo app',
    isShield: false,
  },
  {
    label: 'Entrada Rápida via Mobile',
    excel: 'Péssima no celular',
    trad: 'Formulários longos e cheios de etapas',
    pro: 'Envio instantâneo de áudio ou foto por WhatsApp',
    isShield: false,
  },
];

export default function ComparisonTable() {
  return (
    <section className="py-24 md:py-32 relative z-10 bg-[#020617] border-t border-white/5">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight mb-4">Por que migrar para o <span className="text-brand-500">Zyvion</span>?</h2>
          <p className="text-slate-400 font-medium">Compare e descubra por que os métodos tradicionais custam o seu tempo e a sua privacidade.</p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/30">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-6 font-bold text-slate-500 uppercase tracking-widest text-xs w-[35%]">Recurso & Segurança</th>
                <th className="p-6 text-center border-l border-white/5 w-[20%]">
                  <span className="inline-block bg-white/5 border border-white/10 px-3 py-1 rounded-md text-slate-400 font-bold text-[10px] uppercase tracking-widest">Planilhas Excel</span>
                </th>
                <th className="p-6 text-center border-l border-white/5 w-[25%]">
                  <span className="inline-block bg-white/5 border border-white/10 px-3 py-1 rounded-md text-slate-400 font-bold text-[10px] uppercase tracking-widest">Apps Tradicionais</span>
                </th>
                <th className="p-6 text-center border-l border-brand-500/30 bg-brand-900/10 w-[20%]">
                  <span className="inline-block bg-brand-500 text-white px-4 py-1.5 rounded-md font-black text-[10px] uppercase tracking-[0.2em] shadow-lg">Zyvion</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ROWS.map((row) => (
                <tr key={row.label} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-6 px-6 font-bold text-slate-300">{row.label}</td>
                  <td className="p-6 text-center border-l border-white/5 text-slate-400 font-medium text-sm">{row.excel}</td>
                  <td className="p-6 text-center border-l border-white/5 text-slate-400 font-medium text-sm">{row.trad}</td>
                  <td className="p-6 text-center border-l border-brand-500/30 bg-brand-900/10 text-emerald-400 font-bold text-sm">
                    <span className="flex flex-col items-center gap-1.5">
                      {row.isShield ? <ShieldCheck size={18} className="mx-auto" /> : <Check size={18} strokeWidth={3} className="mx-auto" />}
                      <span className="text-[10px] text-brand-200">{row.pro}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
