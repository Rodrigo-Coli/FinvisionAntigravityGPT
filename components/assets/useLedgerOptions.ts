import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { DateUtils } from '../../lib/dateUtils';
import { normalizeStr } from '../../lib/stringUtils';
import { ClassifiedTx, CategorySuggestion, suggestCategory } from '../../lib/categorySuggestion';

/**
 * Opções dos lançamentos manuais dos bens (extrato do veículo/outros bens e o
 * "Registrar Gasto / Receita" do imóvel).
 *
 * Antes esses formulários tinham Categoria e Subcategoria como texto livre —
 * sem lista do que já existe, o usuário criava "Combustivel" ao lado de
 * "Combustível" — e não tinham campo de CONTA: o lançamento entrava pago, mas
 * sem conta nenhuma, e o saldo do banco não se mexia.
 *
 * Carrega uma vez, quando o formulário abre:
 * - contas bancárias ativas (para o seletor de conta);
 * - categorias e subcategorias existentes (para as sugestões dos campos);
 * - o histórico classificado (para sugerir categoria pela descrição, a mesma
 *   regra do cupom — `suggestCategory`).
 */

export interface LedgerAccount { id: string; institution: string }

export const NO_ACCOUNT = '__none__';

export function useLedgerOptions(enabled: boolean) {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<{ name: string; category_name?: string }[]>([]);
  const [history, setHistory] = useState<ClassifiedTx[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded || !supabase) return;
    let alive = true;
    (async () => {
      try {
        const user = await getSessionUser(supabase);
        if (!user) return;
        const today = DateUtils.formatToISODate();
        const [accRes, catRes, subRes, txRes] = await Promise.all([
          supabase.from('accounts').select('id, institution, name').eq('user_id', user.id).eq('is_archived', false),
          supabase.from('categories').select('id, name, is_archived').eq('user_id', user.id),
          supabase.from('subcategories').select('name, category_id').eq('user_id', user.id),
          // Só o passado e só o que tem categoria; as mais recentes primeiro.
          supabase.from('transactions').select('description, category, subcategory, date')
            .eq('user_id', user.id).not('category', 'is', null).lte('date', today)
            .order('date', { ascending: false }).limit(1500)
        ]);
        if (!alive) return;

        setAccounts(
          (accRes.data || [])
            .map((a: any) => ({ id: a.id, institution: a.institution || a.name || 'Conta' }))
            .sort((a: LedgerAccount, b: LedgerAccount) => a.institution.localeCompare(b.institution, 'pt-BR'))
        );

        const cats = (catRes.data || []).filter((c: any) => c.name && c.is_archived !== true);
        setCategories(Array.from(new Set<string>(cats.map((c: any) => String(c.name)))).sort((a, b) => a.localeCompare(b, 'pt-BR')));
        setSubcategories(
          (subRes.data || [])
            .map((s: any) => ({ name: s.name, category_name: cats.find((c: any) => c.id === s.category_id)?.name }))
            .filter((s: any) => s.name && s.category_name)
        );
        setHistory(
          (txRes.data || [])
            .filter((t: any) => t.description && t.category)
            .map((t: any) => ({ description: t.description, category: t.category, subcategory: t.subcategory, date: String(t.date || '').slice(0, 10) }))
        );
      } catch (err) {
        // Sugestões são conveniência: sem elas o formulário segue funcionando.
        console.warn('[Bens] Opções do lançamento indisponíveis:', err);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [enabled, loaded]);

  /** Subcategorias já usadas dentro da categoria escolhida. */
  const subcategoriesFor = useCallback((category: string): string[] => {
    const key = normalizeStr(category || '');
    if (!key) return [];
    return Array.from(new Set(
      subcategories.filter(s => normalizeStr(s.category_name || '') === key).map(s => s.name)
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [subcategories]);

  /** Categoria/subcategoria que o usuário já usou para descrições parecidas. */
  const suggestFor = useCallback((description: string): CategorySuggestion | null => {
    if (!description || description.trim().length < 3) return null;
    return suggestCategory(description, history, categories, subcategories);
  }, [history, categories, subcategories]);

  const accountName = useCallback(
    (id: string) => accounts.find(a => a.id === id)?.institution || '',
    [accounts]
  );

  return useMemo(() => ({
    accounts, categories, subcategoriesFor, suggestFor, accountName, loaded
  }), [accounts, categories, subcategoriesFor, suggestFor, accountName, loaded]);
}
