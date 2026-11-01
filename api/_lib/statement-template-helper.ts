import XLSX from 'xlsx';
import Papa from 'papaparse';

export interface StatementTemplate {
  file_type: 'csv' | 'xlsx';
  header_row_index: number;
  date_column_index: number;
  description_column_index: number;
  amount_column_index: number;
  date_format?: string;
  decimal_separator?: string;
}

const isoOf = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

function parseDate(rawDate: any, format?: string): string {
  if (rawDate === undefined || rawDate === null || rawDate === '') return '';
  // Célula de data do Excel (lida com cellDates).
  if (rawDate instanceof Date) return isNaN(rawDate.getTime()) ? '' : isoOf(rawDate);
  const dateStr = String(rawDate).trim();
  if (!dateStr) return '';
  // Número de série do Excel (dias desde 1899-12-30), ex.: 46297 = 2026-10-02.
  if (/^\d{5}(\.\d+)?$/.test(dateStr)) {
    const serial = Number(dateStr);
    if (serial > 20000 && serial < 80000) return isoOf(new Date(Math.round((serial - 25569) * 86400000)));
    return '';
  }
  
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  
  // Formato DD/MM/YYYY ou DD/MM/YY ou DD-MM-YYYY ou DD-MM-YY
  const brMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (brMatch) {
    let year = brMatch[3];
    if (year.length === 2) year = '20' + year;
    const month = brMatch[2].padStart(2, '0');
    const day = brMatch[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Parse direto
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return '';
}

function parseAmount(rawAmount: any, decimalSeparator?: string): number {
  if (rawAmount === undefined || rawAmount === null) return 0;
  if (typeof rawAmount === 'number') return rawAmount;
  let str = String(rawAmount).trim();
  if (decimalSeparator === ',') {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    str = str.replace(/,/g, '');
  }
  return parseFloat(str.replace(/[^\d.-]/g, '')) || 0;
}

/**
 * Planilha (.xlsx/.xls) em TEXTO para a IA ler. O .xlsx é um zip: mandar o
 * arquivo como texto (buffer.toString) entregava lixo à IA, que devolvia 0
 * lançamentos — a importação terminava "pronta" e nada chegava em Conciliar.
 * Datas saem em AAAA-MM-DD e valores com ponto decimal, sem ambiguidade.
 */
function spreadsheetToText(buffer: Buffer, maxChars = 30000): string {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const out: string[] = [];
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[name], { header: 1, raw: true, defval: '' });
    const lines = rows
      .map(r => (Array.isArray(r) ? r : []).map(c => (c instanceof Date ? isoOf(c) : String(c ?? '').trim())))
      .filter(cells => cells.some(c => c !== ''))
      .map(cells => cells.join(' ; '));
    if (lines.length) out.push(`### Planilha: ${name}`, ...lines);
  }
  return out.join('\n').slice(0, maxChars);
}

const NEAR_DAYS = 3;
const dayOf = (d: any): string => String(d ?? '').trim().slice(0, 10);
const daysBetween = (a: string, b: string): number =>
  Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);
const shiftDays = (day: string, n: number): string => {
  const d = new Date(`${dayOf(day)}T12:00:00Z`);
  if (isNaN(d.getTime())) return dayOf(day);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
};

/** Colunas separadas de Crédito e Débito no cabeçalho (ex.: extrato Bradesco). */
function creditDebitColumns(header: any[]): { credit: number; debit: number } | null {
  const norm = (v: any) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const credit = header.findIndex(h => /^credito|^entrada/.test(norm(h).trim()));
  const debit = header.findIndex(h => /^debito|^saida/.test(norm(h).trim()));
  return credit >= 0 && debit >= 0 && credit !== debit ? { credit, debit } : null;
}

export const StatementTemplateHelper = {
  parseDate,
  parseAmount,
  spreadsheetToText,
  async getTemplate(supabase: any, userId: string, targetId: string, isCard: boolean, fileType: string): Promise<any | null> {
    if (!targetId) return null;
    let query = supabase
      .from('statement_templates')
      .select('template_data')
      .eq('user_id', userId)
      .eq('file_type', fileType);
      
    if (isCard) {
      query = query.eq('card_id', targetId);
    } else {
      query = query.eq('account_id', targetId);
    }
    
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return data.template_data;
  },

  async saveTemplate(supabase: any, userId: string, targetId: string, isCard: boolean, fileType: string, templateData: any) {
    if (!targetId || !templateData) return;
    
    const payload: any = {
      user_id: userId,
      file_type: fileType,
      template_data: templateData,
      updated_at: new Date().toISOString()
    };
    
    if (isCard) {
      payload.card_id = targetId;
    } else {
      payload.account_id = targetId;
    }
    
    const { error } = await supabase
      .from('statement_templates')
      .upsert(payload, {
        onConflict: isCard ? 'user_id,card_id,file_type' : 'user_id,account_id,file_type'
      });
      
    if (error) {
      console.error('[Template Helper] Error saving template:', error);
    } else {
      console.log('[Template Helper] Template learned & saved successfully for', targetId);
    }
  },

  tryLocalParse(buffer: Buffer, fileType: string, template: StatementTemplate): any[] {
    try {
      if (fileType === 'csv') {
        const content = buffer.toString('utf-8');
        const parsed = Papa.parse(content, { skipEmptyLines: true });
        const rows = parsed.data as string[][];
        
        const transactions: any[] = [];
        const headerIdx = template.header_row_index ?? 0;
        const dataRows = rows.slice(headerIdx + 1);
        
        for (const row of dataRows) {
          const rawDate = row[template.date_column_index];
          const rawDesc = row[template.description_column_index];
          const rawAmt = row[template.amount_column_index];
          
          const date = parseDate(rawDate, template.date_format);
          const amount = parseAmount(rawAmt, template.decimal_separator);
          const description = String(rawDesc || '').trim();
          
          if (date && amount !== 0 && description) {
            transactions.push({ date, description, amount });
          }
        }
        return transactions;
      } 
      
      if (fileType === 'xlsx') {
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        
        const transactions: any[] = [];
        const headerIdx = template.header_row_index ?? 0;
        const dataRows = rows.slice(headerIdx + 1);
        // Crédito e Débito em colunas separadas: valor = crédito − débito (senão os
        // débitos, sem valor na coluna "de valor" do modelo, sumiam).
        const cd = creditDebitColumns(Array.isArray(rows[headerIdx]) ? rows[headerIdx] : []);
        
        for (const row of dataRows) {
          if (!Array.isArray(row)) continue;
          const rawDate = row[template.date_column_index];
          const rawDesc = row[template.description_column_index];
          const rawAmt = row[template.amount_column_index];
          
          const date = parseDate(rawDate, template.date_format);
          const amount = cd
            ? parseAmount(row[cd.credit], template.decimal_separator) - Math.abs(parseAmount(row[cd.debit], template.decimal_separator))
            : parseAmount(rawAmt, template.decimal_separator);
          const description = String(rawDesc || '').trim();
          
          if (date && amount !== 0 && description) {
            transactions.push({ date, description, amount });
          }
        }
        return transactions;
      }
    } catch (e) {
      console.error('[Template Helper] Local parsing error:', e);
    }
    return [];
  },

  async checkDuplicates(supabase: any, userId: string, transactions: any[], isCard: boolean): Promise<any[]> {
    if (transactions.length === 0) return transactions;
    
    const dates = transactions.map(t => t.date).filter(Boolean);
    if (dates.length === 0) return transactions;
    
    const minDate = dates.reduce((a, b) => a < b ? a : b);
    const maxDate = dates.reduce((a, b) => a > b ? a : b);

    // Função de normalização para comparação de locais (estabelecimentos)
    const normalizeDesc = (d: string): string => {
      return String(d || '')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove acentos
        .replace(/[^a-z0-9]/g, "")       // remove caracteres especiais e espaços
        .replace(/^(pag|compra|tarifa|ted|doc|pix|cartao|saque|mensalidade|iof|juros)/g, "") // remove prefixos comuns
        .replace(/(sp|rj|mg|df|br|brasil|online|app|internet)$/g, ""); // remove sufixos comuns
    };
    
    // Cada transação já existente só pode confirmar a duplicidade de UM candidato do
    // import por vez. Sem isso, quando duas compras reais de mesmo valor/data vêm no
    // extrato (ex.: duas compras "Shopee" de R$46,75 no mesmo dia) e só uma já tinha
    // sido lançada manualmente, as DUAS eram marcadas como duplicata da mesma linha
    // já existente — escondendo a que era realmente nova e nunca tinha sido lançada.
    const consumeMatch = (pool: any[], chosen: any) => {
      const idx = pool.indexOf(chosen);
      if (idx !== -1) pool.splice(idx, 1);
    };

    if (isCard) {
      const { data: existingTxs } = await supabase
        .from('card_transactions')
        .select('date, amount, description')
        .eq('user_id', userId)
        .gte('date', minDate)
        .lte('date', maxDate);

      const availableExisting = [...(existingTxs || [])];

      return transactions.map(t => {
        const tAmountStr = Math.abs(Number(t.amount)).toFixed(2);

        // Encontrar transações existentes (ainda não usadas por outro candidato) de mesma data e valor
        const matches = availableExisting.filter((e: any) =>
          dayOf(e.date) === dayOf(t.date) &&
          Math.abs(Number(e.amount)).toFixed(2) === tAmountStr
        );

        if (matches.length > 0) {
          const normT = normalizeDesc(t.description);

          // Tentar encontrar uma que tenha local similar
          const similarMatch = matches.find((e: any) => {
            const normE = normalizeDesc(e.description);
            return normE === normT || normE.includes(normT) || normT.includes(normE);
          });

          const chosenMatch = similarMatch || matches[0];
          const isSimilar = !!similarMatch;
          consumeMatch(availableExisting, chosenMatch);

          return {
            ...t,
            potential_duplicate: true,
            duplicate_reason: isSimilar
              ? 'Transação com mesma data, valor e local similar já lançada'
              : 'Atenção: Transação com mesmo valor e data em local diferente',
            duplicate_tx: {
              description: chosenMatch.description,
              date: chosenMatch.date,
              amount: chosenMatch.amount
            }
          };
        }
        return t;
      });
    } else {
      const { data: existingTxs } = await supabase
        .from('transactions')
        .select('date, amount, description, type')
        .eq('user_id', userId)
        .is('is_deleted', false)
        .gte('date', shiftDays(minDate, -NEAR_DAYS))
        .lte('date', `${shiftDays(maxDate, NEAR_DAYS)} 23:59:59`);

      // A data em `transactions` vem com hora ("2026-10-02 00:00:00+00") e a do
      // extrato não ("2026-10-02"): comparando o texto inteiro, nenhum lançamento
      // de banco era marcado como duplicado. Compara só o dia.
      const availableExisting = (existingTxs || []).map((e: any) => ({ ...e, day: dayOf(e.date) }));
      const result: any[] = transactions.map(t => ({ ...t }));
      const candidates = result.map((t, i) => ({
        i,
        day: dayOf(parseDate(t.date) || t.date),
        amount: Math.abs(Number(t.amount)).toFixed(2),
        type: Number(t.amount) < 0 ? 'EXPENSE' : 'INCOME',
        norm: normalizeDesc(t.description)
      }));

      const mark = (c: any, chosen: any, reason: string) => {
        consumeMatch(availableExisting, chosen);
        result[c.i] = {
          ...result[c.i],
          potential_duplicate: true,
          duplicate_reason: reason,
          duplicate_tx: { description: chosen.description, date: chosen.day, amount: chosen.amount }
        };
      };
      const similar = (c: any, e: any) => {
        const normE = normalizeDesc(e.description);
        return !!normE && !!c.norm && (normE === c.norm || normE.includes(c.norm) || c.norm.includes(normE));
      };
      const sameValue = (c: any, e: any) => Math.abs(Number(e.amount)).toFixed(2) === c.amount && e.type === c.type;

      // 1ª passada: mesmo dia, mesmo valor e tipo.
      const pending: any[] = [];
      for (const c of candidates) {
        const matches = availableExisting.filter((e: any) => e.day === c.day && sameValue(c, e));
        if (!matches.length) { pending.push(c); continue; }
        const sim = matches.find((e: any) => similar(c, e));
        mark(c, sim || matches[0], sim
          ? 'Transação com mesma data, valor e local similar já lançada'
          : 'Atenção: Transação com mesmo valor e data em local diferente');
      }
      // 2ª passada: data próxima (até NEAR_DAYS dias), mesmo valor e tipo — lançamento
      // manual costuma ficar com a data do pagamento, e o banco compensa depois.
      for (const c of pending) {
        const near = availableExisting
          .filter((e: any) => sameValue(c, e) && Math.abs(daysBetween(e.day, c.day)) <= NEAR_DAYS)
          .sort((a: any, b: any) => Math.abs(daysBetween(a.day, c.day)) - Math.abs(daysBetween(b.day, c.day)));
        if (!near.length) continue;
        const chosen = near.find((e: any) => similar(c, e)) || near[0];
        const gap = Math.abs(daysBetween(chosen.day, c.day));
        mark(c, chosen, `Atenção: mesmo valor já lançado ${gap} dia(s) ${chosen.day < c.day ? 'antes' : 'depois'}`);
      }
      return result;
    }
  }
};
