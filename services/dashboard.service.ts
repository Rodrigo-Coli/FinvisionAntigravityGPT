import { supabase } from '../lib/supabase/client';
import { DashboardData } from '../types';
import { projectionService } from './projection.service';
import { safeStorage } from '../lib/safeStorage';
import { getSessionUser } from '../lib/session';
import { pickCurrentStatement as pickStatementFor, targetStatementPeriod } from '../lib/cardStatements';
import { ownerKey } from '../lib/ownerUtils';
import { plantaRemainingDebt } from '../lib/plantaDebt';
import { syncAllConsortiumBalances } from './consortiumBalance.service';
import { withTimeout } from '../lib/connectivity';
import { isOrphanPendingFinancing } from '../lib/pendingFinancing';
import { SALE_RECEIVABLE_TYPES, saleReceivablesTotal } from '../lib/saleAccounting';
import { loanOpenBalance } from '../lib/loanSummary';
import { DateUtils } from '../lib/dateUtils';

export const DashboardService = {
  getSummary: async (): Promise<DashboardData> => {
    const sb = supabase;
    if (!sb) return { consolidatedBalance: 0, netWorth: 0, creditCards: [], alerts: [], goals: [], cashFlow: [], assets: [] };

    const user = await getSessionUser(sb);
    if (!user) return { consolidatedBalance: 0, netWorth: 0, creditCards: [], alerts: [], goals: [], cashFlow: [], assets: [] };

    // Consórcio: saldo devedor atualizado pelo que foi pago antes de somar as dívidas.
    try { await withTimeout(syncAllConsortiumBalances(user.id), 4000, 'saldo dos consórcios', { silent: true }); } catch { /* segue com o saldo gravado */ }


    // 1. Fetch all core data in parallel using Promise.all
    const [
      accountsRes,
      cardsRes,
      physRes,
      entitiesRes,
      txsRes,
      liabsRes,
      futureTxsRes,
      saleRecvRes
    ] = await Promise.all([
      sb.from('accounts').select('id, current_balance, type, include_in_dashboard').eq('user_id', user.id).eq('is_archived', false),
      sb.from('cards').select('id, brand, name, limit_total, last4, is_additional, parent_card_id, sums_into_invoice').eq('user_id', user.id).eq('is_archived', false),
      sb.from('physical_assets').select('id, name, estimated_value, category, metadata, is_archived, acquisition_date').eq('user_id', user.id),
      sb.from('entities').select('name').eq('user_id', user.id).eq('include_in_totals', false),
      sb.from('transactions').select('date, amount, type, owner_name, metadata').eq('user_id', user.id).eq('is_deleted', false).gte('date', new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString()),
      sb.from('liabilities').select('*').eq('user_id', user.id),
      sb.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).or(`date.gte.${new Date().toISOString()},is_recurring.eq.true`),
      // Vendas a receber (entrada/parcelas de bens vendidos ainda não recebidas)
      sb.from('transactions').select('amount, is_paid, paid_amount, metadata').eq('user_id', user.id).eq('is_deleted', false).eq('is_paid', false).in('metadata->>type', SALE_RECEIVABLE_TYPES)
    ]);

    if (accountsRes.error) throw accountsRes.error;

    const accounts = accountsRes.data || [];
    const cards = cardsRes.data || [];
    // Arquivado (vendido, devolvido) não é mais seu: fica fora, como na tela de Patrimônio.
    // Vendido (mesmo desarquivado para editar) também fica fora: entra o que falta receber.
    const physicalAssets = (physRes.data || []).filter((a: any) => !a.is_archived && !a.metadata?.isSold);
    const excludedEntities = entitiesRes.data || [];
    const txs = txsRes.data || [];
    const archivedAssetIds = new Set<string>((physRes.data || []).filter((a: any) => a.is_archived).map((a: any) => a.id));
    const liabilitiesData = (liabsRes.data || []).filter((l: any) => !l.is_archived && !isOrphanPendingFinancing(l, archivedAssetIds));
    const futureTxs = futureTxsRes.data || [];

    let consolidatedBalance = 0;
    let netWorth = 0;
    let totalAssets = 0;
    // Ativos separados para o card do Início (contas x bens x a receber).
    const assetsBreakdown = { accounts: 0, investments: 0, physical: 0, receivables: 0 };
    // De onde vem o "a receber": parcelas de bens vendidos x empréstimos que você fez.
    const receivablesDetail = { sales: 0, loans: 0 };

    accounts.forEach((acc: any) => {
      if (acc.include_in_dashboard === false) return; // Ignores private/registration accounts

      const balance = Number(acc.current_balance || 0);
      netWorth += balance;
      totalAssets += balance;
      if ((acc.type || '').toUpperCase() === 'INVESTMENT') assetsBreakdown.investments += balance;
      else assetsBreakdown.accounts += balance;
      if (['CHECKING', 'SAVINGS', 'CASH'].includes((acc.type || '').toUpperCase())) {
        consolidatedBalance += balance;
      }
    });

    // 2. Credit Cards Summary
    // Mostra apenas cartões titulares + adicionais com fatura separada.
    // Adicionais que somam na fatura do titular já estão contabilizados no principal.
    const displayCards = cards.filter((c: any) => !c.is_additional || c.sums_into_invoice === false);

    // Todas as faturas dos cartões exibidos numa consulta só (antes era uma por
    // cartão, em Promise.all).
    const displayCardIds = displayCards.map((c: any) => c.id);
    const allStatementsRes = displayCardIds.length > 0
      ? await sb
        .from('card_statements')
        .select('card_id, month, year, due_date, status, total_amount, paid_amount')
        .in('card_id', displayCardIds)
      : { data: [] as any[] };
    const allStatements = allStatementsRes.data || [];

    // Qual é a fatura "atual" de um cartão — MESMA regra da tela de Cartões
    // (loadCardContext em CreditCardsSection): a fatura do período de uso de hoje,
    // pulando para o mês seguinte quando já passou o dia de fechamento.
    // Antes aqui era `order('due_date', { ascending: false }).limit(1)`, que pega a
    // fatura de vencimento MAIS DISTANTE: cartões com faturas futuras já criadas
    // mostravam no Painel uma fatura de 2028 zerada no lugar da fatura real do mês.
    const pickCurrentStatement = (card: any) => {
      const mine = allStatements.filter((s: any) => s.card_id === card.id);
      if (mine.length === 0) return null;
      const { year, month } = targetStatementPeriod(new Date(), Number(card.closing_day) || null);
      return pickStatementFor<any>(mine, year, month) || null;
    };

    const creditCardsSummary = displayCards.map((card: any) => {
      const stmt = pickCurrentStatement(card);
      const total = Number(stmt?.total_amount || 0);
      const paid = Number(stmt?.paid_amount || 0);

      return {
        brand: card.name || card.brand,
        current: total - paid,
        forecasted: total,
        limit: Number(card.limit_total || 0),
        last4: card.last4 || '0000',
        color: (card.brand || '').toLowerCase().includes('visa') ? 'bg-brand-600' : 'bg-slate-900'
      };
    });

    // Empréstimos concedidos: valor em aberto HOJE (o que falta receber, com juros
    // e acréscimos), a mesma conta do cartão do empréstimo em Patrimônio. Antes
    // somava o valor original emprestado, ignorando o que já foi devolvido.
    const loanIds = physicalAssets.filter((a: any) => a.metadata?.isLoan).map((a: any) => a.id);
    const loanTxsByAsset = new Map<string, any[]>();
    if (loanIds.length > 0) {
      const loanTxsRes = await sb
        .from('transactions')
        .select('id, type, amount, date, is_paid, description, metadata')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .in('metadata->>linked_asset_id', loanIds);
      for (const t of loanTxsRes?.data || []) {
        const key = t.metadata?.linked_asset_id;
        if (!key) continue;
        if (!loanTxsByAsset.has(key)) loanTxsByAsset.set(key, []);
        loanTxsByAsset.get(key)!.push(t);
      }
    }
    const today = DateUtils.formatToISODate();

    // 3. Physical Assets mapping
    // Investimento vinculado a uma corretora já está no saldo dela (o saldo da conta
    // de investimento soma os investimentos): contar de novo dobrava o valor.
    const accountIds = new Set<string>(accounts.map((a: any) => a.id));
    physicalAssets.forEach((asset: any) => {
      const isBrokerInvestment = asset.category === 'INVESTMENT' && accountIds.has(asset.metadata?.brokerAccountId);
      if (isBrokerInvestment) return;
      const val = asset.metadata?.isLoan
        ? loanOpenBalance({
          metadata: asset.metadata,
          concessionDate: asset.acquisition_date,
          linked: loanTxsByAsset.get(asset.id) || [],
          today,
          fallbackPrincipal: asset.estimated_value
        })
        : Number(asset.estimated_value || 0);
      netWorth += val;
      totalAssets += val;
      if (asset.category === 'INVESTMENT') assetsBreakdown.investments += val;
      else if (asset.metadata?.isLoan) { assetsBreakdown.receivables += val; receivablesDetail.loans += val; }
      else assetsBreakdown.physical += val;
    });

    // Vendas a receber: o bem vendido saiu do patrimônio, o dinheiro a receber entra
    // (mesma regra do card "Vendas a Receber" em Patrimônio).
    const activeAssetIds = new Set<string>(physicalAssets.map((a: any) => a.id));
    const saleReceivables = saleReceivablesTotal(
      (saleRecvRes?.data || []).filter((t: any) => !activeAssetIds.has(t.metadata?.linked_asset_id))
    );
    netWorth += saleReceivables;
    totalAssets += saleReceivables;
    assetsBreakdown.receivables += saleReceivables;
    receivablesDetail.sales += saleReceivables;

    const excludedSet = new Set((excludedEntities || []).map((e: any) => ownerKey(e.name)));

    // 4. Cash Flow & Metrics
    const cashFlow: any[] = [];
    let totalExpenses = 0;
    let lastMonthExpenses = 0;
    const now = new Date();
    const currentMonth = now.getUTCMonth();
    const lastMonth = (currentMonth - 1 + 12) % 12;
 
    if (txs) {
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const grouped = txs.reduce((acc: any, tx: any) => {
        if (tx.owner_name && excludedSet.has(ownerKey(tx.owner_name))) return acc;
        if (tx.metadata?.is_historical === true || tx.metadata?.is_historical === 'true') return acc;
        if (tx.metadata?.isCapitalized === true || tx.metadata?.type === 'asset_purchase') return acc;
 
        // tx.date is usually YYYY-MM-DD
        const datePart = tx.date.split('T')[0];
        const [y, mStr, d] = datePart.split('-');
        const m = parseInt(mStr) - 1; // 0-indexed
        const key = months[m];
        if (!acc[key]) acc[key] = { month: key, income: 0, expense: 0 };
 
        const val = Number(tx.amount || 0);
        if (tx.type === 'INCOME') {
          acc[key].income += val;
        } else if (tx.type === 'EXPENSE' || tx.type === 'BILL_PAYMENT') {
          acc[key].expense += val;
          if (m === currentMonth) totalExpenses += val;
          if (m === lastMonth) lastMonthExpenses += val;
        }
        return acc;
      }, {});
 
      const today = new Date().getUTCMonth();
      for (let i = 5; i >= 0; i--) {
        const mIdx = (today - i + 12) % 12;
        const key = months[mIdx];
        cashFlow.push(grouped[key] || { month: key, income: 0, expense: 0 });
      }
    }

    // 5. Assets Summary
    const assetsSummary = [
      { name: 'Conta Corrente', value: Number(consolidatedBalance || 0), color: '#3b82f6' },
      { name: 'Investimentos', value: (accounts || []).filter((a: any) => a.type === 'INVESTMENT').reduce((s: any, a: any) => s + Number(a.current_balance || 0), 0), color: '#8b5cf6' },
      { name: 'Bens Físicos', value: (physicalAssets || []).filter((a: any) => a.category !== 'INVESTMENT').reduce((s: any, a: any) => s + Number(a.estimated_value || 0), 0), color: '#10b981' },
    ];

    // 6. Net Worth Growth (comparing to previous month)
    // This would require storing historical net worth or calculating it from historical data.
    // For now, we'll return 0 or a placeholder.
    const netWorthGrowth = 0;

    // 7. Liabilities (Debts/Passivos)
    let totalLiabilities = 0;

    // Imóvel na planta: o que falta pagar até a entrega (e o saldo da entrega,
    // se ainda não virou passivo) também é dívida — mesma regra da tela de
    // Patrimônio (lib/plantaDebt.ts). Antes o Painel contava o imóvel cheio.
    const plantaAssets = physicalAssets.filter((a: any) => a.category === 'REAL_ESTATE' && a.metadata?.propertyStage === 'PLANTA' && !a.metadata?.isLoan);
    if (plantaAssets.length > 0) {
      const { data: plantaTxs } = await sb
        .from('transactions')
        .select('type, amount, paid_amount, is_paid, is_deleted, liability_id, metadata')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('is_paid', false)
        .in('metadata->>linked_asset_id', plantaAssets.map((a: any) => a.id));
      for (const asset of plantaAssets) {
        const linked = (plantaTxs || []).filter((t: any) => t.metadata?.linked_asset_id === asset.id);
        const hasLinkedLiability = liabilitiesData.some((l: any) => l.linked_asset_id === asset.id && !l.is_archived);
        totalLiabilities += plantaRemainingDebt(asset, linked, hasLinkedLiability).total;
      }
    }
    const liabilitiesForProj: any[] = [];
    const realEstateLiabilitiesForProj: any[] = [];
    if (liabilitiesData) {
      liabilitiesData.forEach((liab: any) => {
        totalLiabilities += Number(liab.remaining_balance || 0);
        liabilitiesForProj.push({
          ...liab,
          installmentAmount: Number(liab.installment_amount || 0),
          installmentsRemaining: Number(liab.installments_remaining || 0)
        });
        
        if (liab.type === 'MORTGAGE' || liab.metadata?.isRealEstate) {
          realEstateLiabilitiesForProj.push({
             ...liab,
             installmentAmount: Number(liab.installment_amount || 0),
             installments_count: Number(liab.installments_remaining || 0),
             indexation_rate: Number(liab.metadata?.indexationRate || 0),
             balloon_payments: liab.metadata?.balloons || []
          });
        }
      });
      netWorth -= totalLiabilities; // Net Worth = Assets - Liabilities
    }

    // 7.5 Projected Cash Flow (Advanced Engine)
    const filteredFutureTxs = (futureTxs || []).filter((tx: any) => {
      if (tx.owner_name && excludedSet.has(ownerKey(tx.owner_name))) return false;
      if (tx.metadata?.is_historical === true || tx.metadata?.is_historical === 'true') return false;
      return true;
    });

    const projectedCashFlow = projectionService.calculateFutureCashFlow(
      consolidatedBalance,
      filteredFutureTxs,
      liabilitiesForProj,
      realEstateLiabilitiesForProj,
      12 // project next 12 months
    );

    // 8. Smart Alerts Generation
    const smartAlerts: any[] = [];

    // Saldo de entrega de imóvel na planta com a forma de pagamento ainda a definir
    // (financiamento pendente): vira lembrete no Início, com a data de entrega quando houver.
    const pendingDecisions = liabilitiesData
      .filter((l: any) => l.metadata?.isPendingFinancing)
      .map((l: any) => {
        const asset = (physRes.data || []).find((a: any) => a.id === l.linked_asset_id);
        const deliveryDate = l.metadata?.deliveryDate || asset?.metadata?.deliveryDate || null;
        return {
          id: l.id,
          name: asset?.name || String(l.name || '').replace(/^Financiamento:\s*/i, ''),
          amount: Number(l.remaining_balance || 0),
          deliveryDate: deliveryDate ? String(deliveryDate).split('T')[0] : null
        };
      });
    if (consolidatedBalance < 1000) {
      smartAlerts.push({ id: 'low-bal', type: 'warning', message: 'Atenção: Saldo consolidado abaixo de R$ 1.000', createdAt: new Date().toISOString() });
    }
    creditCardsSummary.forEach((c: any) => {
      if (c.limit > 0 && c.current / c.limit > 0.8) {
        smartAlerts.push({ id: `cc-high-${c.brand}`, type: 'critical', message: `Cartão ${c.brand} com mais de 80% do limite utilizado`, createdAt: new Date().toISOString() });
      }
    });

    return {
      consolidatedBalance: Number(consolidatedBalance || 0),
      netWorth: Number(netWorth || 0),
      totalAssets: Number(totalAssets || 0),
      assetsBreakdown,
      receivablesDetail: { sales: Math.round(receivablesDetail.sales * 100) / 100, loans: Math.round(receivablesDetail.loans * 100) / 100 },
      pendingDecisions,
      totalLiabilities: Number(totalLiabilities || 0),
      creditCards: creditCardsSummary,
      alerts: smartAlerts,
      goals: [],
      cashFlow,
      assets: assetsSummary,
      totalExpenses: Number(totalExpenses || 0),
      netWorthGrowth: Number(netWorthGrowth || 0),
      projectedCashFlow
    };
  },

  getCachedSummary: (): DashboardData | null => {
    return safeStorage.getJSON<DashboardData>('finvision_dashboard_summary');
  },

  setCachedSummary: (data: DashboardData): void => {
    safeStorage.setItem('finvision_dashboard_summary', JSON.stringify(data));
  },

  refreshBalance: async (): Promise<number> => {
    // This could trigger a sync in the future
    return 0;
  }
};
