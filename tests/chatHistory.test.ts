import { describe, it, expect } from 'vitest';
import { sanitizeChatHistory, buildFallbackReply, MAX_HISTORY_MESSAGES } from '../api/_lib/chat-history';

describe('sanitizeChatHistory', () => {
  it('descarta a saudação do assistente que abre a conversa', () => {
    // Era exatamente este caso que travava o chat: o histórico da tela começa
    // com a saudação, o Gemini recebia um turno do modelo primeiro e devolvia
    // resposta vazia.
    const out = sanitizeChatHistory([
      { role: 'assistant', content: 'Olá! Sou o seu Assistente Zyvion.' },
      { role: 'user', content: 'qual meu saldo?' },
    ]);
    expect(out).toEqual([{ role: 'user', parts: [{ text: 'qual meu saldo?' }] }]);
  });

  it('descarta todos os turnos do modelo até a primeira fala do usuário', () => {
    const out = sanitizeChatHistory([
      { role: 'assistant', content: 'Olá!' },
      { role: 'model', content: 'Posso ajudar?' },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'Oi!' },
    ]);
    expect(out.map(c => c.role)).toEqual(['user', 'model']);
  });

  it('ignora mensagens vazias ou só com espaços', () => {
    const out = sanitizeChatHistory([
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: '' },
      { role: 'assistant', content: 'resposta' },
    ]);
    expect(out).toEqual([
      { role: 'user', parts: [{ text: 'primeira' }] },
      { role: 'model', parts: [{ text: 'resposta' }] },
    ]);
  });

  it('ignora papéis desconhecidos e conteúdo que não é texto', () => {
    const out = sanitizeChatHistory([
      { role: 'user', content: 'ok' },
      { role: 'system', content: 'instrução' },
      { role: 'user', content: { texto: 'objeto' } },
      { role: 'user' },
      null,
    ]);
    expect(out).toEqual([{ role: 'user', parts: [{ text: 'ok' }] }]);
  });

  it('mantém só as mensagens mais recentes e ainda começa pelo usuário', () => {
    const history = [];
    for (let i = 0; i < 20; i++) {
      history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
    }
    const out = sanitizeChatHistory(history, 5);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0].role).toBe('user');
    expect(out[out.length - 1].parts[0].text).toBe('msg 19');
  });

  it('devolve lista vazia quando não há histórico utilizável', () => {
    expect(sanitizeChatHistory(undefined)).toEqual([]);
    expect(sanitizeChatHistory('texto' as any)).toEqual([]);
    expect(sanitizeChatHistory([{ role: 'assistant', content: 'só a saudação' }])).toEqual([]);
  });

  it('usa 12 mensagens como padrão', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    expect(sanitizeChatHistory(history).length).toBe(MAX_HISTORY_MESSAGES);
  });
});

describe('buildFallbackReply', () => {
  it('monta o saldo e o patrimônio a partir da ferramenta de contas', () => {
    const reply = buildFallbackReply([
      {
        name: 'get_account_and_net_worth_summary',
        result: {
          accounts: [
            { institution: 'Itaú', type: 'CHECKING', balance: '14500.80' },
            { institution: 'Conta zerada', type: 'CHECKING', balance: '0.00' },
          ],
          totalBalance: '14500.80',
          totalPhysicalAssets: '1000.00',
          totalDebt: '500.00',
          netWorth: '15000.80',
        },
      },
    ]);
    expect(reply).toContain('R$ 14.500,80');
    expect(reply).toContain('Itaú');
    expect(reply).toContain('R$ 15.000,80');
    // Conta zerada não polui a resposta.
    expect(reply).not.toContain('Conta zerada');
  });

  it('formata faturas de cartão com vencimento em dia/mês/ano', () => {
    const reply = buildFallbackReply([
      {
        name: 'get_card_statements',
        result: {
          statements: [{ card: 'XP', dueDate: '2026-09-20', totalAmount: 1234.5, pendingAmount: 1234.5, status: 'OPEN' }],
          totals: { totalAmount: '1234.50', totalPaid: '0.00', totalPending: '1234.50' },
        },
      },
    ]);
    expect(reply).toContain('XP');
    expect(reply).toContain('20/09/2026');
    expect(reply).toContain('R$ 1.234,50');
  });

  it('ignora ferramentas que falharam', () => {
    expect(buildFallbackReply([{ name: 'get_card_statements', result: { error: 'falhou' } }])).toBe('');
  });

  it('devolve string vazia quando não há nada aproveitável', () => {
    expect(buildFallbackReply([])).toBe('');
    expect(buildFallbackReply(null as any)).toBe('');
    expect(buildFallbackReply([{ name: 'get_transactions', result: { transactions: [] } }])).toBe('');
  });
});
