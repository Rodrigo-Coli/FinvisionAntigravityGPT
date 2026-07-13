import { supabase } from '../../lib/supabase/client';

// ============================================================
// Motor único de geração de lançamentos recorrentes de imóveis
// (aluguel, condomínio, IPTU).
//
// Antes, cada tela (cadastro, edição rápida, "Detalhes & Evolução")
// tinha sua PRÓPRIA cópia dessa lógica, com pequenas diferenças entre
// elas — foi exatamente isso que causou o bug de parcelas duplicadas
// e o de financiamento que nunca virava lançamento. Daqui pra frente,
// toda tela que precisa gerar/atualizar essas recorrências chama as
// funções daqui, então o comportamento é sempre o mesmo em qualquer
// lugar do app.
//
// Cada função aqui: apaga as parcelas FUTURAS e NÃO PAGAS já geradas
// automaticamente, e recria do zero (24 meses pra frente). Parcelas
// já pagas nunca são tocadas.
// ============================================================

export type PayerOption = 'PROPRIETARIO' | 'INQUILINO_DIRETO' | 'PROPRIETARIO_REEMBOLSO';

export interface RentalSyncParams {
  assetId: string;
  userId: string;
  assetName: string;
  isRented: boolean;
  rentalIncome: number;
  rentalType: 'anual' | 'short_stay';
  rentalDate: string;
  discountType?: 'PERCENT' | 'VALUE';
  discountValue?: number;
}

export async function syncRentalTransactions(params: RentalSyncParams): Promise<void> {
  if (!supabase) return;
  const { assetId, userId, assetName, isRented, rentalIncome, rentalType, rentalDate } = params;
  const discountType = params.discountType || 'VALUE';
  const discountValue = params.discountValue || 0;

  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: allTxs, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, date, is_paid, metadata')
      .eq('user_id', userId)
      .eq('is_deleted', false);

    if (fetchErr) throw fetchErr;

    // Desativado, short-stay, ou sem valor: apaga só as parcelas futuras não pagas.
    if (!isRented || rentalType === 'short_stay' || rentalIncome <= 0) {
      const targetTxs = (allTxs || []).filter((t: any) =>
        t.metadata?.linked_asset_id === assetId &&
        t.metadata?.type === 'rental_income' &&
        t.date >= todayStr &&
        !t.is_paid
      );
      if (targetTxs.length > 0) {
        await supabase.from('transactions').delete().in('id', targetTxs.map((t: any) => t.id));
      }
      return;
    }

    // Apaga futuras não pagas para regenerar com os valores atualizados.
    const targetTxs = (allTxs || []).filter((t: any) =>
      t.metadata?.linked_asset_id === assetId &&
      t.metadata?.type === 'rental_income' &&
      t.date >= todayStr &&
      !t.is_paid
    );
    if (targetTxs.length > 0) {
      await supabase.from('transactions').delete().in('id', targetTxs.map((t: any) => t.id));
    }

    const categoryName = 'Receita Operacional Imobiliária';
    let catId = '';
    const { data: existingCat } = await supabase
      .from('categories').select('id').eq('user_id', userId).eq('name', categoryName).maybeSingle();
    if (existingCat) {
      catId = existingCat.id;
    } else {
      const { data: c } = await supabase
        .from('categories').insert({ user_id: userId, name: categoryName, type: 'INCOME', color: 'bg-emerald-50 text-emerald-600' })
        .select('id').maybeSingle();
      if (c) catId = c.id;
    }

    let netAmount = rentalIncome;
    if (discountValue > 0) {
      netAmount = discountType === 'PERCENT' ? rentalIncome * (1 - discountValue / 100) : rentalIncome - discountValue;
    }

    const today = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const baseDate = rentalDate ? new Date(rentalDate + 'T00:00:00') : today;
    const rentDay = baseDate.getDate();

    const futureRentTxs: any[] = [];
    let currentYear = baseDate.getFullYear();
    let currentMonth = baseDate.getMonth();
    const startTarget = new Date(currentYear, currentMonth, rentDay);
    if (startTarget < sixtyDaysAgo) {
      currentYear = today.getFullYear();
      currentMonth = today.getMonth();
    }

    for (let i = 0; i < 24; i++) {
      const currentTarget = new Date(currentYear, currentMonth, rentDay);
      const dateStr = currentTarget.toISOString().split('T')[0];

      if (dateStr < todayStr) {
        const txDate = new Date(dateStr + 'T00:00:00');
        if (txDate < sixtyDaysAgo || dateStr < rentalDate) {
          currentMonth++;
          if (currentMonth > 11) { currentMonth = 0; currentYear++; }
          continue;
        }
      }

      const hasPaidRentInMonth = (allTxs || []).some((t: any) =>
        t.metadata?.linked_asset_id === assetId &&
        t.metadata?.type === 'rental_income' &&
        t.date.substring(0, 7) === dateStr.substring(0, 7) &&
        t.is_paid
      );

      if (!hasPaidRentInMonth) {
        futureRentTxs.push({
          user_id: userId,
          description: `Receita de Aluguel Regular - ${assetName}`,
          amount: netAmount,
          date: dateStr,
          type: 'INCOME',
          category: categoryName,
          subcategory: 'Aluguel Regular',
          category_id: catId || null,
          is_paid: false,
          paid_amount: 0,
          paid_at: null,
          metadata: { linked_asset_id: assetId, type: 'rental_income', auto_generated: true }
        });
      }

      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    }

    if (futureRentTxs.length > 0) {
      await supabase.from('transactions').insert(futureRentTxs);
    }
  } catch (e) {
    console.error('[realEstatePropertySync] Erro ao sincronizar aluguéis:', e);
  }
}

export interface CondoIptuSyncParams {
  assetId: string;
  userId: string;
  assetName: string;
  propertyStage: 'PLANTA' | 'PRONTO';
  condoPayer: PayerOption;
  condoFee: number;
  condoNextDate: string;
  iptuPayer: PayerOption;
  iptuFee: number;
  iptuNextDate: string;
  iptuFrequency: 'monthly' | 'yearly';
}

export async function syncCondoIptuTransactions(params: CondoIptuSyncParams): Promise<void> {
  if (!supabase) return;
  const { assetId, userId, assetName, propertyStage, condoPayer, condoFee, condoNextDate, iptuPayer, iptuFee, iptuNextDate, iptuFrequency } = params;

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: allTxs } = await supabase
      .from('transactions')
      .select('id, date, is_paid, subcategory, metadata')
      .eq('user_id', userId)
      .eq('metadata->>linked_asset_id', assetId)
      .eq('is_deleted', false);
    const existingTxs = allTxs || [];

    let catId = '';
    const { data: catRes } = await supabase.from('categories').select('id').eq('user_id', userId).eq('name', 'Ativos Imobiliários').maybeSingle();
    if (catRes) catId = catRes.id;

    let rentCatId = '';
    const { data: rentCatRes } = await supabase.from('categories').select('id').eq('user_id', userId).eq('name', 'Receita Operacional Imobiliária').maybeSingle();
    if (rentCatRes) rentCatId = rentCatRes.id;

    // 1. CONDOMÍNIO
    const condoAmt = propertyStage === 'PLANTA' ? 0 : (condoFee || 0);
    const condoFutureUnpaid = existingTxs.filter((t: any) =>
      (t.metadata?.type === 'condo_provision' || t.metadata?.type === 'condo_expense' || t.metadata?.type === 'condo_revenue') &&
      t.date >= todayStr && !t.is_paid
    );
    if (condoFutureUnpaid.length > 0) {
      await supabase.from('transactions').delete().in('id', condoFutureUnpaid.map((t: any) => t.id));
    }

    if (condoAmt > 0 && condoPayer !== 'INQUILINO_DIRETO') {
      const start = new Date(condoNextDate + 'T00:00:00');
      const newCondoProvisions: any[] = [];
      let currentYear = start.getFullYear();
      let currentMonth = start.getMonth();
      const startTarget = new Date(currentYear, currentMonth, start.getDate());
      if (startTarget < sixtyDaysAgo) {
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
      }

      for (let i = 0; i < 24; i++) {
        const txDate = new Date(currentYear, currentMonth, start.getDate());
        const dateStr = txDate.toISOString().split('T')[0];

        if (dateStr < todayStr) {
          const txDateObj = new Date(dateStr + 'T00:00:00');
          if (txDateObj < sixtyDaysAgo || dateStr < condoNextDate) {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            continue;
          }
        }

        const hasPaidCondoExpense = existingTxs.some((t: any) =>
          t.date.substring(0, 7) === dateStr.substring(0, 7) &&
          (t.metadata?.type === 'condo_provision' || t.metadata?.type === 'condo_expense') && t.is_paid
        );
        if (!hasPaidCondoExpense) {
          newCondoProvisions.push({
            user_id: userId, description: `Despesa Condomínio - ${assetName}`, amount: condoAmt, date: dateStr,
            type: 'EXPENSE', category: 'Ativos Imobiliários', subcategory: 'Condomínio', category_id: catId || null,
            is_paid: false, metadata: { linked_asset_id: assetId, type: 'condo_expense' }
          });
        }

        if (condoPayer === 'PROPRIETARIO_REEMBOLSO') {
          const hasPaidCondoRevenue = existingTxs.some((t: any) =>
            t.date.substring(0, 7) === dateStr.substring(0, 7) && t.metadata?.type === 'condo_revenue' && t.is_paid
          );
          if (!hasPaidCondoRevenue) {
            newCondoProvisions.push({
              user_id: userId, description: `Reembolso Condomínio - ${assetName}`, amount: condoAmt, date: dateStr,
              type: 'INCOME', category: 'Receita Operacional Imobiliária', subcategory: 'Condomínio', category_id: rentCatId || null,
              is_paid: false, metadata: { linked_asset_id: assetId, type: 'condo_revenue' }
            });
          }
        }

        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      }

      if (newCondoProvisions.length > 0) {
        await supabase.from('transactions').insert(newCondoProvisions);
      }
    }

    // 2. IPTU
    const iptuAmt = propertyStage === 'PLANTA' ? 0 : (iptuFee || 0);
    const iptuFutureUnpaid = existingTxs.filter((t: any) =>
      (t.metadata?.type === 'iptu_provision' || t.metadata?.type === 'iptu_expense' || t.metadata?.type === 'iptu_revenue') &&
      t.date >= todayStr && !t.is_paid
    );
    if (iptuFutureUnpaid.length > 0) {
      await supabase.from('transactions').delete().in('id', iptuFutureUnpaid.map((t: any) => t.id));
    }

    if (iptuAmt > 0 && iptuPayer !== 'INQUILINO_DIRETO') {
      const start = new Date(iptuNextDate + 'T00:00:00');
      const newIptuProvisions: any[] = [];
      const iterations = iptuFrequency === 'monthly' ? 24 : 2;
      const monthStep = iptuFrequency === 'monthly' ? 1 : 12;

      let currentYear = start.getFullYear();
      let currentMonth = start.getMonth();
      const startTarget = new Date(currentYear, currentMonth, start.getDate());
      if (startTarget < sixtyDaysAgo) {
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
      }

      for (let i = 0; i < iterations; i++) {
        const txDate = new Date(currentYear, currentMonth + (i * monthStep), start.getDate());
        const dateStr = txDate.toISOString().split('T')[0];

        if (dateStr < todayStr) {
          const txDateObj = new Date(dateStr + 'T00:00:00');
          if (txDateObj < sixtyDaysAgo || dateStr < iptuNextDate) continue;
        }

        const hasPaidIptuExpense = existingTxs.some((t: any) =>
          t.date.substring(0, 7) === dateStr.substring(0, 7) &&
          (t.metadata?.type === 'iptu_provision' || t.metadata?.type === 'iptu_expense') && t.is_paid
        );
        if (!hasPaidIptuExpense) {
          newIptuProvisions.push({
            user_id: userId, description: `Despesa IPTU - ${assetName}`, amount: iptuAmt, date: dateStr,
            type: 'EXPENSE', category: 'Ativos Imobiliários', subcategory: 'IPTU', category_id: catId || null,
            is_paid: false, metadata: { linked_asset_id: assetId, type: 'iptu_expense' }
          });
        }

        if (iptuPayer === 'PROPRIETARIO_REEMBOLSO') {
          const hasPaidIptuRevenue = existingTxs.some((t: any) =>
            t.date.substring(0, 7) === dateStr.substring(0, 7) && t.metadata?.type === 'iptu_revenue' && t.is_paid
          );
          if (!hasPaidIptuRevenue) {
            newIptuProvisions.push({
              user_id: userId, description: `Reembolso IPTU - ${assetName}`, amount: iptuAmt, date: dateStr,
              type: 'INCOME', category: 'Receita Operacional Imobiliária', subcategory: 'IPTU', category_id: rentCatId || null,
              is_paid: false, metadata: { linked_asset_id: assetId, type: 'iptu_revenue' }
            });
          }
        }
      }

      if (newIptuProvisions.length > 0) {
        await supabase.from('transactions').insert(newIptuProvisions);
      }
    }
  } catch (e) {
    console.error('[realEstatePropertySync] Erro ao sincronizar condomínio/IPTU:', e);
  }
}
