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

function parseDate(rawDate: any, format?: string): string {
  if (rawDate === undefined || rawDate === null) return '';
  const dateStr = String(rawDate).trim();
  
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  
  // Formato DD/MM/YYYY ou DD/MM/YY
  const brMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
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

export const StatementTemplateHelper = {
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
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        
        const transactions: any[] = [];
        const headerIdx = template.header_row_index ?? 0;
        const dataRows = rows.slice(headerIdx + 1);
        
        for (const row of dataRows) {
          if (!Array.isArray(row)) continue;
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
    
    if (isCard) {
      const { data: existingTxs } = await supabase
        .from('card_transactions')
        .select('date, amount, description')
        .eq('user_id', userId)
        .gte('date', minDate)
        .lte('date', maxDate);
        
      const existingSet = new Set(
        (existingTxs || []).map((e: any) => `${e.date}|${Math.abs(Number(e.amount)).toFixed(2)}`)
      );
      
      return transactions.map(t => {
        const key = `${t.date}|${Math.abs(Number(t.amount)).toFixed(2)}`;
        if (existingSet.has(key)) {
          return {
            ...t,
            potential_duplicate: true,
            duplicate_reason: 'Transação com mesma data e valor já existe no extrato do cartão'
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
        .gte('date', minDate)
        .lte('date', maxDate);
        
      const existingSet = new Set(
        (existingTxs || []).map((e: any) => `${e.date}|${Math.abs(Number(e.amount)).toFixed(2)}|${e.type}`)
      );
      
      return transactions.map(t => {
        const type = t.amount < 0 ? 'EXPENSE' : 'INCOME';
        const key = `${t.date}|${Math.abs(Number(t.amount)).toFixed(2)}|${type}`;
        if (existingSet.has(key)) {
          return {
            ...t,
            potential_duplicate: true,
            duplicate_reason: 'Transação com mesma data e valor já lançada no sistema'
          };
        }
        return t;
      });
    }
  }
};
