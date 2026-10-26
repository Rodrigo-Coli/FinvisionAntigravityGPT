/**
 * Exportar a simulação de consórcio (planilha e PDF). Só gera arquivo no
 * aparelho — nada vai para o banco. As tabelas são montadas aqui (testáveis);
 * xlsx e jsPDF são carregados só na hora de exportar.
 */
import type { PlanResult, QuotaSummary } from './consortiumSimulator';
import type { QuotaDraft, SimPremises } from './consortiumSimState';

export interface ExportInput {
  title: string;
  premises: SimPremises;
  quotas: QuotaDraft[];
  results: PlanResult[];
  summaries: QuotaSummary[];
  total: QuotaSummary;
  monthly: number[];
  generatedAt?: Date;
}

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const unitLabel = (u: QuotaDraft['unit']) => (u === 'PCT' ? '% da carta' : u === 'BRL' ? 'R$' : 'parcelas');

export const QUOTA_HEADER = [
  'Cota', 'Tipo', 'Carta (R$)', 'Prazo / parcelas restantes', 'Taxa adm (%)', 'Fundo reserva (%)',
  'Lance do bolso (R$)', 'Lance embutido (R$)', 'Contempla em (meses)', 'Lance abate',
  'Crédito líquido (R$)', 'Saque líquido (R$)', 'Parcela inicial (R$)', 'Parcela depois (R$)', 'Meses depois',
  'Saldo depois do lance (R$)', 'Total que sai do bolso (R$)'
];

export function quotaTable(input: ExportInput): (string | number)[][] {
  return input.quotas.map((q, i) => {
    const s = input.summaries[i];
    const r = input.results[i];
    return [
      q.name, q.source ? 'Minha (situação de hoje)' : 'Nova', r2(s.credit),
      Number(q.source ? q.remaining : q.term) || 0,
      Number(String(q.adm).replace(',', '.')) || 0, Number(String(q.fr).replace(',', '.')) || 0,
      r2(s.bidCash), r2(s.bidEmbedded), s.contemplationMonth, q.mode === 'REDUCE_TERM' ? 'Prazo' : 'Parcela',
      r2(s.netCredit), r2(s.netCash), r2(s.initialInstallment), r2(s.postInstallment), s.monthsAfter,
      r2(r.balanceAfterBid), r2(s.totalCashOut)
    ];
  });
}

export function totalRow(input: ExportInput): (string | number)[] {
  const t = input.total;
  return ['Total', '', r2(t.credit), '', '', '', r2(t.bidCash), r2(t.bidEmbedded), '', '', r2(t.netCredit), r2(t.netCash),
    r2(t.initialInstallment), r2(t.postInstallment), '', r2(input.results.reduce((s, r) => s + r.balanceAfterBid, 0)), r2(t.totalCashOut)];
}

/** Parcelas mês a mês: uma coluna por cota + total (sem os lances). */
export function monthlyTable(input: ExportInput): (string | number)[][] {
  return input.monthly.map((total, i) => [
    i + 1,
    ...input.results.map(r => (r.rows[i] ? r2(r.rows[i].installment + r.rows[i].insurance) : 0)),
    r2(total)
  ]);
}

/** Mesma coisa somada por ano (para o PDF caber). */
export function yearlyTable(input: ExportInput): (string | number)[][] {
  const years = Math.ceil(input.monthly.length / 12);
  return Array.from({ length: years }, (_, y) => {
    const slice = (arr: number[]) => arr.slice(y * 12, y * 12 + 12).reduce((s, v) => s + v, 0);
    return [
      `Ano ${y + 1} (meses ${y * 12 + 1}–${Math.min(input.monthly.length, y * 12 + 12)})`,
      ...input.results.map(r => r2(slice(r.rows.map(row => row.installment + row.insurance)))),
      r2(slice(input.monthly))
    ];
  });
}

export function premisesRows(input: ExportInput): (string | number)[][] {
  return [
    ['Simulação', input.title],
    ['Gerada em', (input.generatedAt || new Date()).toLocaleString('pt-BR')],
    ['Reajuste anual (%)', input.premises.index],
    ['Seguro prestamista (% a.m.)', input.premises.insurance],
    ['Rendimento do dinheiro (% a.a.)', input.premises.opportunity],
    ['Lance informado em', input.quotas.map(q => `${q.name}: ${unitLabel(q.unit)}`).join(' · ')],
    ['Aviso', 'Simulação. Os valores oficiais são os da administradora (proposta e contrato).']
  ];
}

const fileSafe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'simulacao';

export async function exportSimulationXlsx(input: ExportInput): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const resumo = [
    ...premisesRows(input), [],
    ['Totais'],
    ['Crédito contratado (R$)', r2(input.total.credit)],
    ['Lance do bolso (R$)', r2(input.total.bidCash)],
    ['Lance embutido (R$)', r2(input.total.bidEmbedded)],
    ['Crédito liberado (R$)', r2(input.total.netCredit)],
    ['Saque líquido (R$)', r2(input.total.netCash)],
    ['Parcela inicial — soma (R$)', r2(input.total.initialInstallment)],
    ['Parcela depois — soma (R$)', r2(input.total.postInstallment)],
    ['Total que sai do bolso (R$)', r2(input.total.totalCashOut)],
    ['Meses até quitar tudo', input.monthly.length]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([QUOTA_HEADER, ...quotaTable(input), totalRow(input)]), 'Cotas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Mês', ...input.quotas.map(q => q.name), 'Total'], ...monthlyTable(input)]), 'Parcelas mês a mês');
  XLSX.writeFile(wb, `Zyvion_Simulacao_Consorcio_${fileSafe(input.title)}.xlsx`);
}

export async function exportSimulationPdf(input: ExportInput): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Zyvion — Simulação de Consórcio', 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${input.title} · gerada em ${(input.generatedAt || new Date()).toLocaleString('pt-BR')}`, 40, 58);
  doc.text(`Reajuste ${input.premises.index}% a.a. · seguro ${input.premises.insurance}% a.m. · rendimento ${input.premises.opportunity}% a.a. — simulação; valores oficiais são os da administradora.`, 40, 72);

  const t = input.total;
  autoTable(doc, {
    startY: 88,
    head: [['Crédito contratado', 'Lance do bolso', 'Embutido', 'Crédito liberado', 'Saque líquido', 'Parcela inicial (soma)', 'Parcela depois (soma)', 'Total do bolso']],
    body: [[brl(t.credit), brl(t.bidCash), brl(t.bidEmbedded), brl(t.netCredit), brl(t.netCash), brl(t.initialInstallment), brl(t.postInstallment), brl(t.totalCashOut)]],
    theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: [30, 64, 175] }
  });

  const money = (v: string | number) => (typeof v === 'number' ? brl(v) : v);
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 16,
    head: [['Cota', 'Tipo', 'Carta', 'Lance bolso', 'Embutido', 'Contempla', 'Crédito líquido', 'Saque líquido', 'Parcela inicial', 'Parcela depois', 'Meses depois']],
    body: [...quotaTable(input), totalRow(input)].map(r => [
      r[0], r[1], money(r[2]), money(r[6]), money(r[7]), r[8] === '' ? '' : `${r[8]} m`, money(r[10]), money(r[11]), money(r[12]), money(r[13]), r[14]
    ]),
    theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [30, 64, 175] }
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 16,
    head: [['Período', ...input.quotas.map(q => q.name), 'Total']],
    body: yearlyTable(input).map(r => r.map((v, i) => (i === 0 ? v : brl(Number(v))))),
    theme: 'striped', styles: { fontSize: 8 }, headStyles: { fillColor: [71, 85, 105] }
  });
  doc.save(`Zyvion_Simulacao_Consorcio_${fileSafe(input.title)}.pdf`);
}
