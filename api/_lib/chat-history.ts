// Preparo do histórico do chat e rede de segurança da resposta.
//
// POR QUE ISTO EXISTE
// O chat do site mandava para o Gemini exatamente o que estava na tela, e a
// primeira mensagem da tela é a saudação do assistente. Resultado: a conversa
// enviada começava com um turno do MODELO, não do usuário. Nessa situação o
// Gemini 2.5 responde `finishReason: STOP` com a resposta VAZIA — sem texto e
// sem chamada de ferramenta —, sempre, para o mesmo histórico. O usuário via
// "Não consegui concluir a análise com os dados disponíveis agora", inclusive
// para "qual meu saldo?".
//
// Também entravam no histórico mensagens de conteúdo vazio (uma resposta que
// falhou antes), que produzem uma `part` de texto vazia e têm o mesmo efeito.
//
// As funções aqui são puras de propósito: dá para testar sem chamar a API
// (ver tests/chatHistory.test.ts).

export interface ChatTurn {
  role?: string;
  content?: unknown;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/** Quantas mensagens do histórico seguem para o modelo (as mais recentes). */
export const MAX_HISTORY_MESSAGES = 12;

/**
 * Converte o histórico da tela no formato que o Gemini aceita:
 *  - descarta mensagens sem texto de verdade;
 *  - mapeia assistant/model -> 'model' e user -> 'user' (ignora o resto);
 *  - mantém só as últimas MAX_HISTORY_MESSAGES;
 *  - garante que a conversa COMEÇA com um turno do usuário, descartando as
 *    mensagens do modelo que ficaram na frente (a saudação inicial é a mais
 *    comum). Sem isso o modelo devolve resposta vazia.
 */
export function sanitizeChatHistory(history: unknown, maxMessages = MAX_HISTORY_MESSAGES): GeminiContent[] {
  if (!Array.isArray(history)) return [];

  const mapped: GeminiContent[] = [];
  for (const raw of history as ChatTurn[]) {
    if (!raw || typeof raw !== 'object') continue;
    const text = typeof raw.content === 'string' ? raw.content.trim() : '';
    if (!text) continue;

    const role = raw.role === 'assistant' || raw.role === 'model'
      ? 'model'
      : raw.role === 'user' ? 'user' : null;
    if (!role) continue;

    mapped.push({ role, parts: [{ text }] });
  }

  const recent = maxMessages > 0 ? mapped.slice(-maxMessages) : mapped;

  let start = 0;
  while (start < recent.length && recent[start].role === 'model') start++;
  return recent.slice(start);
}

// ── Rede de segurança: resposta montada com os dados reais ──────────────────
// Se o modelo não devolver texto nenhum (acontece), mas as ferramentas já
// tiverem trazido os números do usuário, respondemos com esses números em vez
// da mensagem genérica de desculpas. É melhor entregar o dado cru e correto do
// que não entregar nada.

const brl = (value: unknown): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const asDate = (iso: unknown): string => {
  const s = String(iso || '').split('T')[0];
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export interface ToolResult {
  name: string;
  result: any;
}

/**
 * Monta uma resposta em português a partir do que as ferramentas retornaram.
 * Devolve string vazia quando não há nada aproveitável — aí o chamador usa a
 * mensagem genérica.
 */
export function buildFallbackReply(toolResults: ToolResult[]): string {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return '';

  const blocks: string[] = [];

  for (const { name, result } of toolResults) {
    if (!result || typeof result !== 'object' || result.error) continue;

    if (name === 'get_account_and_net_worth_summary') {
      const lines = (result.accounts || [])
        .filter((a: any) => Number(a?.balance) !== 0)
        .map((a: any) => `• ${a.institution || 'Conta'}: ${brl(a.balance)}`);
      const block = [
        `**Saldo em contas: ${brl(result.totalBalance)}**`,
        ...lines,
        '',
        `• Bens cadastrados: ${brl(result.totalPhysicalAssets)}`,
        `• Dívidas: ${brl(result.totalDebt)}`,
        `• **Patrimônio líquido: ${brl(result.netWorth)}**`,
      ].join('\n');
      blocks.push(block);
    }

    if (name === 'get_card_statements' && result.totals) {
      const lines = (result.statements || []).slice(0, 10).map((s: any) =>
        `• ${s.card}: ${brl(s.totalAmount)} (vence ${asDate(s.dueDate)}) — ${s.status === 'PAID' ? 'paga' : `falta ${brl(s.pendingAmount)}`}`
      );
      blocks.push([`**Faturas de cartão**`, ...lines, '', `Total: ${brl(result.totals.totalAmount)} · A pagar: ${brl(result.totals.totalPending)}`].join('\n'));
    }

    if (name === 'get_category_breakdown' && Array.isArray(result.breakdown)) {
      const lines = result.breakdown.slice(0, 10).map((c: any) => `• ${c.category}: ${brl(c.total)}`);
      if (lines.length) blocks.push([`**Por categoria**`, ...lines].join('\n'));
    }

    if (name === 'get_liabilities_detail' && Array.isArray(result.liabilities)) {
      const lines = result.liabilities.slice(0, 10).map((l: any) => `• ${l.name}: saldo devedor ${brl(l.remainingBalance)}`);
      if (lines.length) blocks.push([`**Dívidas**`, ...lines].join('\n'));
    }

    if (name === 'get_goals_and_budgets') {
      const goals = (result.goals || []).slice(0, 8).map((g: any) => `• ${g.name}: ${brl(g.currentAmount)} de ${brl(g.targetAmount)}`);
      if (goals.length) blocks.push([`**Metas**`, ...goals].join('\n'));
    }

    if (name === 'get_transactions' && Array.isArray(result.transactions) && result.transactions.length > 0) {
      const lines = result.transactions.slice(0, 10).map((t: any) =>
        `• ${asDate(t.date)} — ${t.description}: ${brl(t.amount)}`
      );
      blocks.push([`**Lançamentos (${result.totalMatched} encontrados)**`, ...lines].join('\n'));
    }

    if (name === 'get_investments_summary' && typeof result.summary === 'string' && result.summary.trim()) {
      blocks.push(result.summary.trim());
    }
  }

  if (blocks.length === 0) return '';

  return `${blocks.join('\n\n')}\n\n_Estes são os seus números atuais. A análise em texto falhou desta vez — pode perguntar de novo para eu comentar os dados._`;
}
