import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import { StatementTemplateHelper as H } from '../api/_lib/statement-template-helper';

/** Extrato Bradesco em .xlsx: datas são células de data, Crédito e Débito em colunas separadas. */
const bradescoXlsx = (): Buffer => {
  const rows: any[][] = [
    ['Extrato de: Ag: 2202 | Conta: 172378-2', '', '', '', '', ''],
    ['Data', 'Histórico', 'Docto.', 'Crédito (R$)', 'Débito (R$)', 'Saldo (R$)'],
    [new Date(Date.UTC(2026, 9, 2)), 'PIX RECEBIDO', 619599, 1530, ' ', 26929.59],
    [new Date(Date.UTC(2026, 9, 5)), 'PAGTO ELETRONICO TRIBUTO', 6374000, ' ', 442.62, 26487.21],
    ['', '', 'Total', 0, 0, 0]
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'in');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

describe('planilha do extrato', () => {
  it('vira texto legível para a IA (datas AAAA-MM-DD, valores com ponto)', () => {
    const text = H.spreadsheetToText(bradescoXlsx());
    expect(text).toContain('2026-10-02 ; PIX RECEBIDO ; 619599 ; 1530');
    expect(text).toContain('2026-10-05 ; PAGTO ELETRONICO TRIBUTO ; 6374000 ;  ; 442.62');
    expect(text).not.toMatch(/PK\u0003\u0004/); // nada do zip cru
  });
  it('leitura local com modelo: crédito positivo, débito negativo', () => {
    const tx = H.tryLocalParse(bradescoXlsx(), 'xlsx', { file_type: 'xlsx', header_row_index: 1, date_column_index: 0, description_column_index: 1, amount_column_index: 3 });
    expect(tx).toEqual([
      { date: '2026-10-02', description: 'PIX RECEBIDO', amount: 1530 },
      { date: '2026-10-05', description: 'PAGTO ELETRONICO TRIBUTO', amount: -442.62 }
    ]);
  });
  it('data como número de série do Excel', () => {
    expect(H.parseDate(46297)).toBe('2026-10-02');
    expect(H.parseDate('02/10/2026')).toBe('2026-10-02');
  });
});

describe('duplicados do extrato bancário', () => {
  const fakeDb = (rows: any[]) => {
    const q: any = { select: () => q, eq: () => q, is: () => q, gte: () => q, lte: () => q, then: (r: any) => r({ data: rows, error: null }) };
    return { from: () => q };
  };
  it('compara só o dia (o banco guarda data com hora) e marca data próxima', async () => {
    const existing = [
      { date: '2026-10-02 00:00:00+00', amount: 1530, description: 'Aluguel recebido', type: 'INCOME' },
      { date: '2026-10-03T00:00:00+00:00', amount: 442.62, description: 'DARF', type: 'EXPENSE' }
    ];
    const out = await H.checkDuplicates(fakeDb(existing), 'u1', [
      { date: '2026-10-02', description: 'PIX RECEBIDO', amount: 1530 },
      { date: '2026-10-05', description: 'PAGTO ELETRONICO TRIBUTO', amount: -442.62 },
      { date: '2026-10-05', description: 'PIX ENVIADO', amount: -38 }
    ], false);
    expect(out[0].potential_duplicate).toBe(true);
    expect(out[0].duplicate_tx.date).toBe('2026-10-02');
    expect(out[1].potential_duplicate).toBe(true);
    expect(out[1].duplicate_reason).toMatch(/2 dia\(s\) antes/);
    expect(out[2].potential_duplicate).toBeFalsy();
  });
  it('uma linha já lançada só confirma UM item do extrato', async () => {
    const out = await H.checkDuplicates(fakeDb([{ date: '2026-10-02 00:00:00+00', amount: 50, description: 'x', type: 'EXPENSE' }]), 'u1', [
      { date: '2026-10-02', description: 'PIX ENVIADO', amount: -50 },
      { date: '2026-10-02', description: 'PIX ENVIADO', amount: -50 }
    ], false);
    expect(out.filter((t: any) => t.potential_duplicate)).toHaveLength(1);
  });
});
