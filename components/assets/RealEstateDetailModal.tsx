import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Printer, FileSpreadsheet, Archive, Check, AlertTriangle, TrendingUp, Landmark, Wallet, Building2, HelpCircle, Edit3, DollarSign, Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { PhysicalAsset, Transaction } from '../../types';
import * as XLSX from 'xlsx';

interface RealEstateDetailModalProps {
  asset: PhysicalAsset;
  onClose: () => void;
  onSuccess: () => void;
  transactions: Transaction[];
}

export const RealEstateDetailModal: React.FC<RealEstateDetailModalProps> = ({
  asset,
  onClose,
  onSuccess,
  transactions: allTransactions
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editable fields in card
  const [name, setName] = useState(asset.name);
  const [estimatedValue, setEstimatedValue] = useState(String(asset.estimatedValue));
  const [propertyStage, setPropertyStage] = useState<'PLANTA' | 'PRONTO'>(asset.metadata?.propertyStage || 'PRONTO');
  const [purpose, setPurpose] = useState<'uso' | 'investimento'>(asset.metadata?.purpose || 'uso');
  const [purchaseValue, setPurchaseValue] = useState(String(asset.metadata?.purchaseValue || ''));
  const [despesasCartorarias, setDespesasCartorarias] = useState(String(asset.metadata?.despesasCartorarias || ''));
  const [mobiliarios, setMobiliarios] = useState(String(asset.metadata?.mobiliarios || ''));
  const [historicalPaidAmount, setHistoricalPaidAmount] = useState(String(asset.metadata?.historicalPaidAmount || ''));
  const [consortiumAllocationRatio, setConsortiumAllocationRatio] = useState(String(asset.metadata?.consortiumAllocationRatio || '100'));

  // Rental states
  const [isRented, setIsRented] = useState(!!asset.metadata?.isRented);
  const [rentalType, setRentalType] = useState<'anual' | 'short_stay'>(asset.metadata?.rentalType || 'anual');
  const [rentalIncome, setRentalIncome] = useState(String(asset.metadata?.rentalIncome || ''));
  const [rentalDate, setRentalDate] = useState(asset.metadata?.rentalDate || new Date().toISOString().split('T')[0]);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'VALUE'>(asset.metadata?.discountType || 'VALUE');
  const [discountValue, setDiscountValue] = useState(String(asset.metadata?.discountValue || ''));
  const [inquilinoPaysCondo, setInquilinoPaysCondo] = useState(!!asset.metadata?.inquilinoPaysCondo);
  const [inquilinoPaysIPTU, setInquilinoPaysIPTU] = useState(!!asset.metadata?.inquilinoPaysIPTU);

  // Cost inputs for Condo/IPTU configurations
  const [condoFee, setCondoFee] = useState(String(asset.metadata?.condoFee || ''));
  const [iptuFee, setIptuFee] = useState(String(asset.metadata?.iptuFee || ''));
  const [condoDueDay, setCondoDueDay] = useState(String(asset.metadata?.condoDueDay || '10'));
  const [iptuDueDay, setIptuDueDay] = useState(String(asset.metadata?.iptuDueDay || '10'));
  const [iptuFrequency, setIptuFrequency] = useState<'monthly' | 'yearly'>(asset.metadata?.iptuFrequency || 'monthly');

  // New Quick Transaction states
  const [showQuickTxForm, setShowQuickTxForm] = useState(false);
  const [quickTxType, setQuickTxType] = useState<'CONDO' | 'IPTU' | 'RENOVATION' | 'MAINTENANCE' | 'OTHER'>('MAINTENANCE');
  const [quickTxAmount, setQuickTxAmount] = useState('');
  const [quickTxDate, setQuickTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [quickTxDescription, setQuickTxDescription] = useState('');
  const [quickTxIsPaid, setQuickTxIsPaid] = useState(true);

  // Period filtering state for yield
  const [filterPeriod, setFilterPeriod] = useState<'ALL' | 'MONTH' | 'YEAR' | 'CUSTOM'>('ALL');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterStartDate, setFilterStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Sincronizar transações vinculadas a este imóvel
  const assetTransactions = useMemo(() => {
    return allTransactions.filter(t => t.metadata?.linked_asset_id === asset.id);
  }, [allTransactions, asset.id]);

  // Dynamic values calculated from transactions
  const reformsValue = useMemo(() => {
    return assetTransactions
      .filter(t => t.type === 'EXPENSE' && t.subcategory?.toLowerCase() === 'reforma' && t.isPaid)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [assetTransactions]);

  const totalInvestedInitially = useMemo(() => {
    const buy = parseFloat(purchaseValue) || 0;
    const cart = parseFloat(despesasCartorarias) || 0;
    const mob = parseFloat(mobiliarios) || 0;
    return buy + reformsValue + cart + mob;
  }, [purchaseValue, reformsValue, despesasCartorarias, mobiliarios]);

  const totalPaid = useMemo(() => {
    const hist = parseFloat(historicalPaidAmount) || 0;
    const paidTxs = assetTransactions
      .filter(t => t.type === 'EXPENSE' && t.isPaid)
      .reduce((sum, t) => {
        const isConsortiumTx = t.metadata?.type === 'consortium_installment' || t.liability_id || t.description.toLowerCase().includes('consórcio');
        const ratio = isConsortiumTx ? ((parseFloat(consortiumAllocationRatio) || 100) / 100) : 1;
        return sum + ((t.paidAmount || t.amount) * ratio);
      }, 0);
    return hist + paidTxs;
  }, [historicalPaidAmount, assetTransactions, consortiumAllocationRatio]);

  const totalToPay = useMemo(() => {
    return assetTransactions
      .filter(t => t.type === 'EXPENSE' && !t.isPaid)
      .reduce((sum, t) => {
        const isConsortiumTx = t.metadata?.type === 'consortium_installment' || t.liability_id || t.description.toLowerCase().includes('consórcio');
        const ratio = isConsortiumTx ? ((parseFloat(consortiumAllocationRatio) || 100) / 100) : 1;
        return sum + (t.amount * ratio);
      }, 0);
  }, [assetTransactions, consortiumAllocationRatio]);

  const agioDesagio = useMemo(() => {
    const current = parseFloat(estimatedValue) || 0;
    return current - totalInvestedInitially;
  }, [estimatedValue, totalInvestedInitially]);

  const agioDesagioPercent = useMemo(() => {
    if (totalInvestedInitially <= 0) return 0;
    return (agioDesagio / totalInvestedInitially) * 100;
  }, [agioDesagio, totalInvestedInitially]);

  // Filter transactions for calculations based on period
  const filteredTransactions = useMemo(() => {
    return assetTransactions.filter(t => {
      if (filterPeriod === 'ALL') return true;
      if (filterPeriod === 'MONTH') {
        return t.date.substring(0, 7) === filterMonth;
      }
      if (filterPeriod === 'YEAR') {
        return t.date.substring(0, 4) === filterYear;
      }
      if (filterPeriod === 'CUSTOM') {
        return t.date >= filterStartDate && t.date <= filterEndDate;
      }
      return true;
    });
  }, [assetTransactions, filterPeriod, filterMonth, filterYear, filterStartDate, filterEndDate]);

  // Rental yield and flow metrics
  const performanceMetrics = useMemo(() => {
    const rentIncomes = filteredTransactions
      .filter(t => t.type === 'INCOME' && t.isPaid)
      .reduce((sum, t) => sum + t.amount, 0);

    const operationalExpenses = filteredTransactions
      .filter(t => {
        if (t.type !== 'EXPENSE' || !t.isPaid) return false;
        const subLower = (t.subcategory || '').toLowerCase();
        // Reforma accumulates to asset value, not operational expense
        return subLower === 'condomínio' || subLower === 'condominio' || subLower === 'iptu' || subLower === 'manutenção/reparos' || subLower === 'manutencao';
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const financingExpenses = filteredTransactions
      .filter(t => {
        if (t.type !== 'EXPENSE' || !t.isPaid) return false;
        const subLower = (t.subcategory || '').toLowerCase();
        return subLower !== 'condomínio' && subLower !== 'condominio' && subLower !== 'iptu' && subLower !== 'manutenção/reparos' && subLower !== 'manutencao' && subLower !== 'reforma';
      })
      .reduce((sum, t) => {
        const isConsortiumTx = t.metadata?.type === 'consortium_installment' || t.liability_id || t.description.toLowerCase().includes('consórcio');
        const ratio = isConsortiumTx ? ((parseFloat(consortiumAllocationRatio) || 100) / 100) : 1;
        return sum + (t.amount * ratio);
      }, 0);

    const netIncome = rentIncomes - operationalExpenses;
    
    // Yield calculation based on total invested initially (annualized if whole history, or monthly)
    const yielRate = totalInvestedInitially > 0 ? (netIncome / totalInvestedInitially) * 100 : 0;

    return {
      rentIncomes,
      operationalExpenses,
      financingExpenses,
      netIncome,
      yielRate,
      totalExpenses: operationalExpenses + financingExpenses
    };
  }, [filteredTransactions, totalInvestedInitially]);

  // Sync / Auto-generate rolling monthly rents or delete future ones
  const syncRentalTransactions = async (
    assetId: string,
    isRentedVal: boolean,
    rentIncomeVal: number,
    assetName: string,
    userId: string,
    rentTypeVal: 'anual' | 'short_stay',
    rentDateVal: string,
    discType: 'PERCENT' | 'VALUE',
    discVal: number
  ) => {
    if (!supabase) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Fetch all non-deleted rental transactions for this asset
      const { data: allTxs, error: fetchErr } = await supabase
        .from('transactions')
        .select('id, date, is_paid, metadata')
        .eq('user_id', userId)
        .eq('is_deleted', false);

      if (fetchErr) throw fetchErr;

      // Clean up future unpaid rents if deactivated or type is short_stay
      if (!isRentedVal || rentTypeVal === 'short_stay' || rentIncomeVal <= 0) {
        const targetTxs = (allTxs || []).filter((t: any) =>
          t.metadata?.linked_asset_id === assetId &&
          t.metadata?.type === 'rental_income' &&
          t.date > todayStr &&
          !t.is_paid
        );

        if (targetTxs.length > 0) {
          const idsToDelete = targetTxs.map((t: any) => t.id);
          await supabase.from('transactions').delete().in('id', idsToDelete);
        }
        return;
      }

      // Generate or extend rolling 24 months rents
      const categoryName = 'Receita Operacional Imobiliária';
      let catId = '';
      const { data: existingCat } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', categoryName)
        .maybeSingle();

      if (existingCat) {
        catId = existingCat.id;
      } else {
        const { data: c } = await supabase
          .from('categories')
          .insert({
            user_id: userId,
            name: categoryName,
            type: 'INCOME',
            color: 'bg-emerald-50 text-emerald-600'
          })
          .select('id')
          .maybeSingle();
        if (c) catId = c.id;
      }

      const existingRentTxs = (allTxs || []).filter((t: any) =>
        t.metadata?.linked_asset_id === assetId &&
        t.metadata?.type === 'rental_income'
      );

      // Determine net rent amount after discounts/commissions
      let netAmount = rentIncomeVal;
      if (discVal > 0) {
        if (discType === 'PERCENT') {
          netAmount = rentIncomeVal * (1 - discVal / 100);
        } else {
          netAmount = rentIncomeVal - discVal;
        }
      }

      const today = new Date();
      const baseDate = rentDateVal ? new Date(rentDateVal) : today;
      const rentDay = baseDate.getDate();

      const currentMonthFirst = new Date(today.getFullYear(), today.getMonth(), rentDay);
      let startGeneratingFromDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), rentDay);

      if (existingRentTxs.length > 0) {
        const dates = existingRentTxs.map((t: any) => new Date(t.date).getTime());
        const maxTime = Math.max(...dates);
        const maxDate = new Date(maxTime);
        const nextMonthOfMax = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, rentDay);

        if (nextMonthOfMax.getTime() < currentMonthFirst.getTime()) {
          startGeneratingFromDate = currentMonthFirst;
        } else {
          startGeneratingFromDate = nextMonthOfMax;
        }
      }

      const horizonDate = new Date(today.getFullYear(), today.getMonth() + 23, rentDay);
      const futureRentTxs = [];

      let currentYear = startGeneratingFromDate.getFullYear();
      let currentMonth = startGeneratingFromDate.getMonth();

      while (true) {
        const currentTarget = new Date(currentYear, currentMonth, rentDay);
        if (currentTarget > horizonDate) break;

        const dateStr = currentTarget.toISOString().split('T')[0];

        // Ensure we don't duplicate a rent in the same month
        const hasRentInMonth = existingRentTxs.some((t: any) => t.date.substring(0, 7) === dateStr.substring(0, 7));

        if (dateStr >= todayStr && !hasRentInMonth) {
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
            metadata: {
              linked_asset_id: assetId,
              type: 'rental_income',
              auto_generated: true
            }
          });
        }

        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }
      }

      if (futureRentTxs.length > 0) {
        await supabase.from('transactions').insert(futureRentTxs);
      }
    } catch (e) {
      console.error('Error syncing rents:', e);
    }
  };

  // Sync Condomínio / IPTU expenses if paid by owner
  const syncExpenseProvisions = async (userId: string) => {
    if (!supabase) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const today = new Date();

      // Retrieve all existing condo/iptu transactions for this asset
      const { data: allTxs } = await supabase
        .from('transactions')
        .select('id, date, is_paid, subcategory')
        .eq('user_id', userId)
        .eq('metadata->linked_asset_id', asset.id)
        .eq('is_deleted', false);

      const existingTxs = allTxs || [];

      // Category Id
      let catId = '';
      const { data: catRes } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', 'Ativos Imobiliários')
        .maybeSingle();
      if (catRes) catId = catRes.id;

      // 1. CONDO PROVISIONS (if owner pays and condoFee is specified)
      const condoAmt = parseFloat(condoFee) || 0;
      if (!inquilinoPaysCondo && condoAmt > 0) {
        const day = parseInt(condoDueDay) || 10;
        const newProvisions = [];
        for (let i = 0; i < 24; i++) {
          const txDate = new Date(today.getFullYear(), today.getMonth() + i, day);
          const dateStr = txDate.toISOString().split('T')[0];
          const monthStr = dateStr.substring(0, 7);

          const hasCondo = existingTxs.some((t: any) => t.date.substring(0, 7) === monthStr && (t.subcategory?.toLowerCase() === 'condomínio' || t.subcategory?.toLowerCase() === 'condominio'));

          if (dateStr >= todayStr && !hasCondo) {
            newProvisions.push({
              user_id: userId,
              description: `Despesa Condomínio - ${name}`,
              amount: condoAmt,
              date: dateStr,
              type: 'EXPENSE',
              category: 'Ativos Imobiliários',
              subcategory: 'Condomínio',
              category_id: catId || null,
              is_paid: false,
              metadata: { linked_asset_id: asset.id, type: 'condo_provision' }
            });
          }
        }
        if (newProvisions.length > 0) {
          await supabase.from('transactions').insert(newProvisions);
        }
      }

      // 2. IPTU PROVISIONS (if owner pays and iptuFee is specified)
      const iptuAmt = parseFloat(iptuFee) || 0;
      if (!inquilinoPaysIPTU && iptuAmt > 0) {
        const day = parseInt(iptuDueDay) || 10;
        const newProvisions = [];
        const iterations = iptuFrequency === 'monthly' ? 24 : 2; // 24 months vs 2 years
        const monthStep = iptuFrequency === 'monthly' ? 1 : 12;

        for (let i = 0; i < iterations; i++) {
          const txDate = new Date(today.getFullYear(), today.getMonth() + (i * monthStep), day);
          const dateStr = txDate.toISOString().split('T')[0];
          const monthStr = dateStr.substring(0, 7);

          const hasIptu = existingTxs.some((t: any) => t.date.substring(0, 7) === monthStr && t.subcategory?.toLowerCase() === 'iptu');

          if (dateStr >= todayStr && !hasIptu) {
            newProvisions.push({
              user_id: userId,
              description: `Despesa IPTU - ${name}`,
              amount: iptuAmt,
              date: dateStr,
              type: 'EXPENSE',
              category: 'Ativos Imobiliários',
              subcategory: 'IPTU',
              category_id: catId || null,
              is_paid: false,
              metadata: { linked_asset_id: asset.id, type: 'iptu_provision' }
            });
          }
        }
        if (newProvisions.length > 0) {
          await supabase.from('transactions').insert(newProvisions);
        }
      }
    } catch (err) {
      console.error('Error syncing condo/iptu provisions:', err);
    }
  };

  const handleSaveChanges = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const estVal = parseFloat(estimatedValue) || 0;
      const buyVal = parseFloat(purchaseValue) || 0;
      const cartVal = parseFloat(despesasCartorarias) || 0;
      const mobVal = parseFloat(mobiliarios) || 0;
      const histPaid = parseFloat(historicalPaidAmount) || 0;
      const rentVal = parseFloat(rentalIncome) || 0;
      const condoVal = parseFloat(condoFee) || 0;
      const iptuVal = parseFloat(iptuFee) || 0;
      const discVal = parseFloat(discountValue) || 0;

      const updatedMetadata = {
        ...(asset.metadata || {}),
        propertyStage,
        purpose,
        purchaseValue: buyVal,
        despesasCartorarias: cartVal,
        mobiliarios: mobVal,
        historicalPaidAmount: histPaid,
        isRented,
        rentalType,
        rentalIncome: rentVal,
        rentalDate,
        discountType,
        discountValue: discVal,
        inquilinoPaysCondo,
        inquilinoPaysIPTU,
        condoFee: condoVal,
        iptuFee: iptuVal,
        condoDueDay: parseInt(condoDueDay, 10) || 10,
        iptuDueDay: parseInt(iptuDueDay, 10) || 10,
        iptuFrequency,
        consortiumAllocationRatio: asset.metadata?.selectedConsortiumId ? (parseFloat(consortiumAllocationRatio) || 100) : undefined
      };

      // Update physical assets table
      const { error } = await supabase
        .from('physical_assets')
        .update({
          name: name,
          estimated_value: estVal,
          metadata: updatedMetadata
        })
        .eq('id', asset.id);

      if (error) throw error;

      // Sync future rental incomes
      await syncRentalTransactions(
        asset.id,
        isRented,
        rentVal,
        name,
        user.id,
        rentalType,
        rentalDate,
        discountType,
        discVal
      );

      // Sync condo / iptu expenses
      await syncExpenseProvisions(user.id);

      alert('Dados do imóvel atualizados com sucesso!');
      onSuccess();
    } catch (err: any) {
      alert(`Erro ao salvar alterações: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTxPaid = async (tx: Transaction) => {
    if (!supabase) return;
    try {
      const newPaid = !tx.isPaid;
      const todayStr = new Date().toISOString();
      const { error } = await supabase
        .from('transactions')
        .update({
          is_paid: newPaid,
          paid_amount: newPaid ? tx.amount : 0,
          paid_at: newPaid ? todayStr : null
        })
        .eq('id', tx.id);

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      alert(`Erro ao atualizar pagamento: ${err.message}`);
    }
  };

  const handleDeleteTx = async (txId: string) => {
    if (!supabase) return;
    if (!window.confirm('Tem certeza que deseja excluir esta transação?')) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ is_deleted: true })
        .eq('id', txId);

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      alert(`Erro ao excluir transação: ${err.message}`);
    }
  };

  const handleAddQuickTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    try {
      const amt = parseFloat(quickTxAmount) || 0;
      if (amt <= 0) {
        alert('Preencha um valor válido.');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let categoryName = 'Ativos Imobiliários';
      let subcatName = '';

      if (quickTxType === 'CONDO') {
        subcatName = 'Condomínio';
      } else if (quickTxType === 'IPTU') {
        subcatName = 'IPTU';
      } else if (quickTxType === 'RENOVATION') {
        subcatName = 'Reforma';
      } else if (quickTxType === 'MAINTENANCE') {
        subcatName = 'Manutenção/Reparos';
      } else {
        subcatName = quickTxDescription || 'Outros';
      }

      // Check category
      let catId = '';
      const { data: catRes } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', categoryName)
        .maybeSingle();

      if (catRes) {
        catId = catRes.id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({
            user_id: user.id,
            name: categoryName,
            type: 'EXPENSE',
            color: 'bg-brand-50 text-brand-600'
          })
          .select('id')
          .single();
        if (newCat) catId = newCat.id;
      }

      const todayStr = new Date().toISOString();

      await supabase.from('transactions').insert([{
        user_id: user.id,
        description: `${subcatName} - ${name}`,
        amount: amt,
        date: quickTxDate,
        type: 'EXPENSE',
        category: categoryName,
        category_id: catId || null,
        subcategory: subcatName,
        is_paid: quickTxIsPaid,
        paid_amount: quickTxIsPaid ? amt : 0,
        paid_at: quickTxIsPaid ? todayStr : null,
        metadata: {
          linked_asset_id: asset.id,
          property_tx_type: quickTxType
        }
      }]);

      setShowQuickTxForm(false);
      setQuickTxAmount('');
      setQuickTxDescription('');
      onSuccess();
    } catch (err: any) {
      alert(`Erro ao lançar despesa: ${err.message}`);
    }
  };

  const handleArchiveAsset = async () => {
    if (!supabase) return;
    if (!window.confirm(`Tem certeza que deseja marcar o imóvel "${name}" como vendido e arquivá-lo? Isso desativará projeções futuras.`)) return;
    try {
      const { error } = await supabase
        .from('physical_assets')
        .update({ is_archived: true })
        .eq('id', asset.id);

      if (error) throw error;
      alert('Imóvel arquivado com sucesso!');
      onClose();
      onSuccess();
    } catch (err: any) {
      alert(`Erro ao arquivar: ${err.message}`);
    }
  };

  // Statement exports: Excel and PDF
  const exportToExcel = () => {
    const rows = assetTransactions.map((t, idx) => ({
      '#': idx + 1,
      'Descrição': t.description,
      'Valor (R$)': t.amount,
      'Data': new Date(t.date).toLocaleDateString('pt-BR'),
      'Categoria': t.category,
      'Subcategoria': t.subcategory || '-',
      'Situação': t.isPaid ? 'Pago' : (new Date(t.date) < new Date() ? 'Atrasado' : 'A Vencer')
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato do Imóvel');
    
    // Add file metadata header rows
    XLSX.utils.sheet_add_aoa(ws, [
      [`Extrato Consolidado: ${name}`],
      [`Situação: ${propertyStage === 'PLANTA' ? 'Na Planta' : 'Entregue'}`],
      [`Finalidade: ${purpose === 'uso' ? 'Uso Pessoal' : 'Investimento'}`],
      [`Valor de Compra: R$ ${parseFloat(purchaseValue).toLocaleString('pt-BR')}`],
      [`Valor Investido Inicialmente: R$ ${totalInvestedInitially.toLocaleString('pt-BR')}`],
      [`Yield do Período Filtrado: ${performanceMetrics.yielRate.toFixed(2)}% am`],
      []
    ], { origin: 'A1' });

    XLSX.writeFile(wb, `extrato_${name.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
  };

  const exportToPdf = () => {
    window.print();
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in print:bg-white print:p-0 print:static">
      <div className="bg-white rounded-[40px] w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-white/20 print:shadow-none print:border-none print:w-full print:max-h-none print:overflow-visible">
        
        {/* HEADER */}
        <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><Building2 size={24} /></div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight italic">Evolução do Ativo: {name}</h3>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Acompanhamento de Obras, Rentabilidade & Transações</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportToExcel} className="p-3 bg-white border border-slate-200 text-slate-500 hover:text-brand-600 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Exportar Excel"><FileSpreadsheet size={18} /></button>
            <button onClick={exportToPdf} className="p-3 bg-white border border-slate-200 text-slate-500 hover:text-brand-600 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Imprimir PDF"><Printer size={18} /></button>
            <button onClick={handleArchiveAsset} className="p-3 bg-white border border-slate-200 text-slate-500 hover:text-rose-600 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Arquivar / Marcar como Vendido"><Archive size={18} /></button>
            <button onClick={onClose} className="w-12 h-12 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-2xl flex items-center justify-center transition-all shadow-sm ml-2"><X size={20} /></button>
          </div>
        </div>

        {/* PRINT ONLY HEADER */}
        <div className="hidden print:flex flex-col mb-6 pb-4 border-b border-slate-200">
          <h2 className="text-2xl font-bold">{name}</h2>
          <p className="text-sm text-slate-500">Relatório Patrimonial de Ativos Imobiliários - FinVision Pro</p>
        </div>

        {/* SCROLL CONTAINER */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-8 print:p-0 print:overflow-visible">
          
          {/* SECTION 1: GENERAL CONTROLS & DUAL STAGE SELECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:grid-cols-2">
            
            {/* Status Panel */}
            <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Identificação Básica</p>
                <div className="flex bg-slate-200/50 p-0.5 rounded-lg border">
                  <button onClick={() => setPropertyStage('PLANTA')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-wider ${propertyStage === 'PLANTA' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}>Na Planta</button>
                  <button onClick={() => setPropertyStage('PRONTO')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-wider ${propertyStage === 'PRONTO' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}>Entregue</button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nome do Imóvel</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Atual (FIPE/Aval.)</label>
                    <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor de Compra</label>
                    <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={purchaseValue} onChange={e => setPurchaseValue(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Purposes and Capital Costs */}
            <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Custos de Aquisição & Capital</p>
                <div className="flex bg-slate-200/50 p-0.5 rounded-lg border">
                  <button onClick={() => setPurpose('uso')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-wider ${purpose === 'uso' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400'}`}>Uso Próprio</button>
                  <button onClick={() => setPurpose('investimento')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-wider ${purpose === 'investimento' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400'}`}>Investimento</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Reformas Obras (Saldo)</label>
                  <div className="w-full h-10 px-4 bg-slate-100 rounded-xl font-black text-slate-900 text-xs flex items-center">{formatCurrency(reformsValue)}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Despesas Cartório</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={despesasCartorarias} onChange={e => setDespesasCartorarias(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mobiliário / Decoração</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={mobiliarios} onChange={e => setMobiliarios(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Histórico Pago (Fora Tx)</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={historicalPaidAmount} onChange={e => setHistoricalPaidAmount(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Consortium settings if linked */}
            {asset.metadata?.selectedConsortiumId && (
              <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Consórcio Vinculado</p>
                  <span className="text-[8px] font-bold px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full uppercase">Garantia / Recurso</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Percentual Alocado ao Imóvel (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="w-full h-10 px-4 bg-white border border-slate-200 rounded-xl text-slate-900 font-bold text-xs"
                    value={consortiumAllocationRatio}
                    onChange={e => {
                      const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                      setConsortiumAllocationRatio(String(val));
                    }}
                  />
                </div>
                <p className="text-[8px] text-slate-400 font-bold uppercase leading-normal">
                  * Apenas {consortiumAllocationRatio}% das parcelas pagas deste consórcio contarão como custo do imóvel. O excedente é considerado caixa livre ("dinheiro novo").
                </p>
              </div>
            )}

            {/* Balanço Patrimonial Integrado */}
            <div className="bg-slate-900 text-white p-6 rounded-3xl space-y-4">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 pb-1">Balanço Patrimonial do Ativo</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Investimento Inicial Custo:</span>
                  <span className="font-bold">{formatCurrency(totalInvestedInitially)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Total Pago (Histórico + Tx):</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Restante a Pagar:</span>
                  <span className="font-bold text-rose-400">{formatCurrency(totalToPay)}</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-sm">
                  <span className="text-slate-300">Ágio / Deságio:</span>
                  <span className={agioDesagio >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {agioDesagio >= 0 ? '+' : ''}{formatCurrency(agioDesagio)} ({agioDesagioPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <button disabled={isSubmitting} onClick={handleSaveChanges} className="w-full h-10 bg-brand-600 hover:bg-brand-500 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                Salvar Alterações
              </button>
            </div>

          </div>

          {/* SECTION 2: RENTALS (IF PURPOSE IS INVESTIMENTO AND READY) */}
          {purpose === 'investimento' && propertyStage === 'PRONTO' && (
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 gap-4">
                <h4 className="text-base font-black italic text-slate-900 flex items-center gap-2">
                  <TrendingUp size={20} className="text-slate-500" />
                  Módulo de Locação e Rentabilidade
                </h4>
                <div className="flex items-center gap-2 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                  <button onClick={() => setIsRented(true)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${isRented ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400'}`}>Alugado: Sim</button>
                  <button onClick={() => setIsRented(false)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${!isRented ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400'}`}>Alugado: Não</button>
                </div>
              </div>

              {isRented && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Locação settings */}
                  <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Configurações de Locação</p>
                    <div className="flex bg-slate-200/50 p-0.5 rounded-lg border w-fit">
                      <button onClick={() => setRentalType('anual')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-wider ${rentalType === 'anual' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}>Mensal</button>
                      <button onClick={() => setRentalType('short_stay')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-wider ${rentalType === 'short_stay' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}>Short Stay</button>
                    </div>

                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor do Aluguel (Gross)</label>
                        <input className="w-full h-9 px-3 bg-white border rounded-lg font-bold text-xs" type="number" value={rentalIncome} onChange={e => setRentalIncome(e.target.value)} />
                      </div>
                      {rentalType === 'anual' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Inicial de Cobrança</label>
                            <input className="w-full h-9 px-3 bg-white border rounded-lg font-bold text-xs" type="date" value={rentalDate} onChange={e => setRentalDate(e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipo Desconto</label>
                              <select className="w-full h-9 px-2 bg-white border rounded-lg font-bold text-xs outline-none" value={discountType} onChange={e => setDiscountType(e.target.value as any)}>
                                <option value="VALUE">Valor Fixo (R$)</option>
                                <option value="PERCENT">Percentual (%)</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Desconto / Taxa adm</label>
                              <input className="w-full h-9 px-3 bg-white border rounded-lg font-bold text-xs" type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Condominio and IPTU choices */}
                  <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Despesas Periódicas (Quem Paga?)</p>
                    <div className="space-y-3">
                      <div className="p-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-slate-900 uppercase">Condomínio</p>
                          <p className="text-[8px] text-slate-400 font-medium">Inquilino paga diretamente?</p>
                        </div>
                        <button onClick={() => setInquilinoPaysCondo(!inquilinoPaysCondo)} className={`w-10 h-6 rounded-full p-1 transition-all flex items-center shadow-inner ${inquilinoPaysCondo ? 'bg-brand-600' : 'bg-slate-200'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-all transform ${inquilinoPaysCondo ? 'translate-x-4' : ''}`} />
                        </button>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-slate-900 uppercase">IPTU</p>
                          <p className="text-[8px] text-slate-400 font-medium">Inquilino paga diretamente?</p>
                        </div>
                        <button onClick={() => setInquilinoPaysIPTU(!inquilinoPaysIPTU)} className={`w-10 h-6 rounded-full p-1 transition-all flex items-center shadow-inner ${inquilinoPaysIPTU ? 'bg-brand-600' : 'bg-slate-200'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-all transform ${inquilinoPaysIPTU ? 'translate-x-4' : ''}`} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Condo (R$)</label>
                          <input className="w-full h-8 px-2 bg-white border rounded-lg text-xs" type="number" value={condoFee} onChange={e => setCondoFee(e.target.value)} disabled={inquilinoPaysCondo} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor IPTU (R$)</label>
                          <input className="w-full h-8 px-2 bg-white border rounded-lg text-xs" type="number" value={iptuFee} onChange={e => setIptuFee(e.target.value)} disabled={inquilinoPaysIPTU} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Frequência IPTU</label>
                          <select className="w-full h-8 px-1 bg-white border rounded-lg text-[9px] font-bold outline-none" value={iptuFrequency} onChange={e => setIptuFrequency(e.target.value as any)}>
                            <option value="monthly">Mensal</option>
                            <option value="yearly">Anual</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Dia do Venc.</label>
                          <input className="w-full h-8 px-2 bg-white border rounded-lg text-xs" type="number" value={iptuDueDay} onChange={e => setIptuDueDay(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Operational financial indicators */}
                  <div className="space-y-4 bg-slate-900 text-white p-6 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rentabilidade Operacional (Yield)</p>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Renda de Aluguel:</span>
                        <span className="font-bold text-emerald-400">+{formatCurrency(performanceMetrics.rentIncomes)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Despesas Operacionais (IPTU/Condo):</span>
                        <span className="font-bold text-rose-400">-{formatCurrency(performanceMetrics.operationalExpenses)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Prestações de Financiamento:</span>
                        <span className="font-bold text-rose-400">-{formatCurrency(performanceMetrics.financingExpenses)}</span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-sm">
                        <span className="text-slate-300">Lucro Operacional Líquido:</span>
                        <span className={performanceMetrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {formatCurrency(performanceMetrics.netIncome)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Yield Mensal Operacional:</span>
                        <span className="font-black text-emerald-400">{performanceMetrics.yielRate.toFixed(2)}% am</span>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* SECTION 3: TRANSACTION FLOW HISTORY */}
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 print:shadow-none print:border-none print:p-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4 print:hidden">
              <div>
                <h4 className="text-base font-black italic text-slate-900">Histórico de Transações & Parcelas</h4>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Cronograma completo de fluxos (preto: a vencer, vermelho: vencido, verde: pago)</p>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border">
                <button onClick={() => setFilterPeriod('ALL')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${filterPeriod === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Tudo</button>
                <button onClick={() => setFilterPeriod('MONTH')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${filterPeriod === 'MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Mês</button>
                <button onClick={() => setFilterPeriod('YEAR')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${filterPeriod === 'YEAR' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Ano</button>
                <button onClick={() => setFilterPeriod('CUSTOM')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${filterPeriod === 'CUSTOM' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Período</button>
              </div>
            </div>

            {/* Filter Detail inputs */}
            {filterPeriod !== 'ALL' && (
              <div className="p-4 bg-slate-50 border rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end animate-in slide-in-from-top-2 print:hidden">
                {filterPeriod === 'MONTH' && (
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Selecionar Mês</label>
                    <input className="w-full h-9 px-3 bg-white border rounded-lg text-xs" type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
                  </div>
                )}
                {filterPeriod === 'YEAR' && (
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Selecionar Ano</label>
                    <input className="w-full h-9 px-3 bg-white border rounded-lg text-xs" type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)} />
                  </div>
                )}
                {filterPeriod === 'CUSTOM' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Início</label>
                      <input className="w-full h-9 px-3 bg-white border rounded-lg text-xs" type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Fim</label>
                      <input className="w-full h-9 px-3 bg-white border rounded-lg text-xs" type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Quick launch expense button */}
            <div className="flex justify-between items-center">
              <h5 className="text-xs font-black uppercase text-slate-400">Lançamentos Encontrados ({filteredTransactions.length})</h5>
              <button onClick={() => setShowQuickTxForm(!showQuickTxForm)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all print:hidden">
                {showQuickTxForm ? 'Fechar Lançador ✕' : '+ Registrar Gasto / Receita'}
              </button>
            </div>

            {showQuickTxForm && (
              <form onSubmit={handleAddQuickTx} className="p-6 bg-slate-50 border border-slate-200 rounded-3xl grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-4 items-end animate-in slide-in-from-top-2 print:hidden">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Subcategoria de Gasto</label>
                  <select className="w-full h-10 px-3 bg-white border rounded-xl text-xs font-bold" value={quickTxType} onChange={e => setQuickTxType(e.target.value as any)}>
                    <option value="CONDO">Condomínio</option>
                    <option value="IPTU">IPTU</option>
                    <option value="RENOVATION">Reforma (Custo Capital)</option>
                    <option value="MAINTENANCE">Manutenção/Reparos</option>
                    <option value="OTHER">Outros Gastos</option>
                  </select>
                </div>

                {quickTxType === 'OTHER' && (
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Descrição Customizada</label>
                    <input required className="w-full h-10 px-3 bg-white border rounded-xl text-xs" value={quickTxDescription} onChange={e => setQuickTxDescription(e.target.value)} placeholder="Ex: Pintura interna" />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor (R$)</label>
                  <input required className="w-full h-10 px-3 bg-white border rounded-xl text-xs" type="number" step="0.01" value={quickTxAmount} onChange={e => setQuickTxAmount(e.target.value)} placeholder="0.00" />
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data do Lançamento</label>
                  <input required className="w-full h-10 px-3 bg-white border rounded-xl text-xs" type="date" value={quickTxDate} onChange={e => setQuickTxDate(e.target.value)} />
                </div>

                <div className="flex items-center gap-2 h-10">
                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                    <input type="checkbox" checked={quickTxIsPaid} onChange={e => setQuickTxIsPaid(e.target.checked)} className="w-4 h-4 rounded text-brand-600" />
                    Pago / Concluído
                  </label>
                </div>

                <div>
                  <button type="submit" className="w-full h-10 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">Lançar</button>
                </div>
              </form>
            )}

            {/* List of transactions */}
            <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-slate-50/50">
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                      <th className="p-4">Situação</th>
                      <th className="p-4">Descrição</th>
                      <th className="p-4">Data</th>
                      <th className="p-4">Subcategoria</th>
                      <th className="p-4 text-right">Valor</th>
                      <th className="p-4 text-right print:hidden">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[9px]">Nenhum lançamento no período</td>
                      </tr>
                    ) : (
                      filteredTransactions
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map((tx) => {
                          const todayStr = new Date().toISOString().split('T')[0];
                          const isOverdue = !tx.isPaid && tx.date < todayStr;
                          
                          let colorClass = 'text-slate-900'; // Default black (future unpaid)
                          if (tx.isPaid) {
                            colorClass = 'text-emerald-600'; // Green (paid)
                          } else if (isOverdue) {
                            colorClass = 'text-rose-600'; // Red (overdue)
                          }

                          const isConsortiumTx = tx.metadata?.type === 'consortium_installment' || tx.liability_id || tx.description.toLowerCase().includes('consórcio');
                          const ratio = isConsortiumTx ? ((parseFloat(consortiumAllocationRatio) || 100) / 100) : 1;

                          return (
                            <tr key={tx.id} className="border-b border-slate-100 hover:bg-white transition-colors bg-white/40">
                              <td className="p-4">
                                <button onClick={() => handleToggleTxPaid(tx)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all print:hidden ${tx.isPaid ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : (isOverdue ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' : 'bg-slate-100 text-slate-900 border border-slate-200')}`}>
                                  {tx.isPaid ? 'Pago' : (isOverdue ? 'Atrasado' : 'A Vencer')}
                                </button>
                                <span className={`hidden print:inline font-bold ${colorClass}`}>
                                  {tx.isPaid ? 'Pago' : (isOverdue ? 'Atrasado' : 'A Vencer')}
                                </span>
                              </td>
                              <td className={`p-4 font-bold ${colorClass}`}>{tx.description}</td>
                              <td className="p-4 text-slate-400 font-medium">{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
                              <td className="p-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{tx.subcategory || '-'}</span></td>
                              <td className={`p-4 text-right font-black ${colorClass}`}>
                                {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount * ratio)}
                                {isConsortiumTx && ratio < 1 && (
                                  <span className="block text-[8px] font-bold text-slate-400">
                                    (Cheio: {formatCurrency(tx.amount)})
                                  </span>
                                )}
                              </td>
                              <td className="p-4 text-right print:hidden">
                                <button onClick={() => handleDeleteTx(tx.id)} className="p-2 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-all"><Trash2 size={14} /></button>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
