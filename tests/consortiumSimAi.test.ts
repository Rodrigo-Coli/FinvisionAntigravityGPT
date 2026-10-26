import { describe, it, expect } from 'vitest';
import { buildConsortiumSimPrompt, parseConsortiumSimResponse, CONSORTIUM_SIM_SYSTEM_PROMPT } from '../api/_lib/consortium-sim-ai';
import { AI_ACTION_CATEGORIES } from '../api/_lib/ai-usage-limits';

/**
 * IA do simulador: só devolve parâmetros (o motor do app calcula) e lê o JSON
 * sem confiar no formato. Conta no limite de Chat IA do plano.
 */
describe('IA do simulador de consórcio', () => {
  it('o prompt leva as cotas cadastradas, a simulação atual, a conversa e o pedido', () => {
    const p = buildConsortiumSimPrompt({
      message: 'Quero 2 cotas da Ademicon de 174 mil, lance de 60 embutidas e 65 pagas',
      history: Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `msg ${i}` })) as any,
      state: { quotas: [{ name: 'Cota 1' }] },
      known: [{ id: 'C1', name: 'Ademicon 570-807', adminFeePct: 24 }],
      today: '2026-10-26'
    });
    expect(p).toContain('Hoje: 2026-10-26');
    expect(p).toContain('"cotasCadastradas":[{"id":"C1","name":"Ademicon 570-807","adminFeePct":24}]');
    expect(p).toContain('"simulacaoAtual":{"quotas":[{"name":"Cota 1"}]}');
    expect(p).toContain('PEDIDO DO USUÁRIO: Quero 2 cotas da Ademicon');
    expect(p).not.toContain('msg 3');   // só as últimas 6 mensagens
    expect(p).toContain('msg 9');
  });

  it('as regras dizem que a IA não calcula e não inventa saldo', () => {
    expect(CONSORTIUM_SIM_SYSTEM_PROMPT).toMatch(/NÃO calcula/);
    expect(CONSORTIUM_SIM_SYSTEM_PROMPT).toMatch(/Nunca invente saldo/);
  });

  it('lê o JSON da IA de forma defensiva', () => {
    expect(parseConsortiumSimResponse('```json\n{"reply":"Montei 2 cotas","quotas":[{"name":"A"},null,"x"]}\n```'))
      .toEqual({ reply: 'Montei 2 cotas', quotas: [{ name: 'A' }] });
    expect(parseConsortiumSimResponse('{"reply":"","premises":{"indexPct":5}}'))
      .toEqual({ reply: 'Simulação atualizada.', premises: { indexPct: 5 } });
    expect(() => parseConsortiumSimResponse('não é json')).toThrow();
  });

  it('conta no limite de Chat IA do plano', () => {
    expect(AI_ACTION_CATEGORIES.consortium_sim).toBe('ai_chat');
  });
});
