import { describe, it, expect } from 'vitest';
import { buildReceiptDescription, stripLabsPrefix } from '../lib/receiptDescription';

describe('descrição do lançamento vindo do cupom', () => {
  it('fica só o nome do estabelecimento, sem "Labs:" e sem espaço sobrando', () => {
    expect(buildReceiptDescription('Medidag Gramado', 'BRL')).toBe('Medidag Gramado');
    expect(buildReceiptDescription('  GASFORT F01 GRAMADO  ', 'BRL')).toBe('GASFORT F01 GRAMADO');
  });

  it('moeda estrangeira continua indicada', () => {
    expect(buildReceiptDescription('Walmart', 'USD')).toBe('Walmart [USD]');
    expect(buildReceiptDescription('Walmart', 'usd')).toBe('Walmart [USD]');
  });

  it('sem moeda ou sem nome não quebra', () => {
    expect(buildReceiptDescription('Farmácia', undefined)).toBe('Farmácia');
    expect(buildReceiptDescription('', 'BRL')).toBe('Compra');
    expect(buildReceiptDescription(null, null)).toBe('Compra');
  });

  it('não duplica o prefixo se a IA já devolveu "Labs:" no nome', () => {
    expect(buildReceiptDescription('Labs: Padaria', 'BRL')).toBe('Padaria');
  });
});

describe('itens que já estavam em Conciliar', () => {
  it('tira o "Labs: " gerado antes da mudança', () => {
    expect(stripLabsPrefix('Labs: Medidag Gramado')).toBe('Medidag Gramado');
    expect(stripLabsPrefix('Labs: GASFORT F01 GRAMADO ')).toBe('GASFORT F01 GRAMADO');
    expect(stripLabsPrefix('labs:Padaria [USD]')).toBe('Padaria [USD]');
  });

  it('não mexe em descrições de extrato', () => {
    expect(stripLabsPrefix('SMILES CLUBE SMILES')).toBe('SMILES CLUBE SMILES');
    expect(stripLabsPrefix('PIX ENVIADO LABS PRODUCOES ')).toBe('PIX ENVIADO LABS PRODUCOES ');
    expect(stripLabsPrefix('')).toBe('');
    expect(stripLabsPrefix(undefined)).toBe('');
  });
});
