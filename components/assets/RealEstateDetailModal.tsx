import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Printer, FileSpreadsheet, Archive, Check, AlertTriangle, TrendingUp, Landmark, Wallet, Building2, HelpCircle, Edit3, DollarSign, Calendar, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { PhysicalAsset, Transaction } from '../../types';
import { DateUtils } from '../../lib/dateUtils';
import * as XLSX from 'xlsx';
import { syncRentalTransactions as sharedSyncRentalTransactions, syncCondoIptuTransactions } from './realEstatePropertySync';

// Trava global contra salvamento concorrente. syncRentalTransactions/syncExpenseProvisions
// apagam as parcelas futuras e recriam do zero a cada chamada — se handleSaveChanges rodar
// duas vezes ao mesmo tempo (ex.: o segundo clique chega antes do primeiro terminar), a
// segunda chamada lê o estado "antigo" (ainda sem o apagamento da primeira) e insere um
// segundo lote inteiro por cima, duplicando todas as parcelas dos próximos 24 meses.
let realEstateSaveInFlight = false;

const getMonthsDifference = (d1: string, d2: string) => {
  const parts1 = d1.split('-');
  const parts2 = d2.split('-');
  if (parts1.length !== 3 || parts2.length !== 3) return 0;
  const year1 = parseInt(parts1[0], 10);
  const month1 = parseInt(parts1[1], 10);
  const year2 = parseInt(parts2[0], 10);
  const month2 = parseInt(parts2[1], 10);
  
  const diff = (year2 - year1) * 12 + (month2 - month1);
  return Math.max(0, diff);
};

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
  const [acquisitionDate, setAcquisitionDate] = useState(asset.acquisitionDate || new Date().toISOString().split('T')[0]);
  const [despesasCartorarias, setDespesasCartorarias] = useState(String(asset.metadata?.despesasCartorarias || ''));
  const [mobiliarios, setMobiliarios] = useState(String(asset.metadata?.mobiliarios || ''));
  const [reformsManual, setReformsManual] = useState(String(asset.metadata?.reformsManual || ''));
  const [historicalPaidAmount, setHistoricalPaidAmount] = useState(String(asset.metadata?.historicalPaidAmount || ''));
  const [historicalRentReceived, setHistoricalRentReceived] = useState(String(asset.metadata?.historicalRentReceived || ''));
  const [consortiumAllocationRatio, setConsortiumAllocationRatio] = useState(String(asset.metadata?.consortiumAllocationRatio || '100'));
  const [saleValue, setSaleValue] = useState(String(asset.metadata?.saleValue || ''));
  const [brokerFee, setBrokerFee] = useState(String(asset.metadata?.brokerFee || ''));
  const [isSold, setIsSold] = useState(!!asset.metadata?.isSold);
  const [saleCommission, setSaleCommission] = useState(String(asset.metadata?.saleCommission || asset.metadata?.saleComission || ''));
  const [salePaymentMethod, setSalePaymentMethod] = useState<'A_VISTA' | 'PARCELADO' | 'PERMUTA' | 'HIBRIDO'>(
    asset.metadata?.salePaymentMethod || 'A_VISTA'
  );
  const [saleDate, setSaleDate] = useState(asset.metadata?.saleDate || new Date().toISOString().split('T')[0]);
  const [saleCashAmount, setSaleCashAmount] = useState(String(asset.metadata?.saleCashAmount || ''));
  const [permutaItems, setPermutaItems] = useState<{ type: 'VEHICLE' | 'REAL_ESTATE' | 'OTHER'; name: string; value: string }[]>(
    asset.metadata?.permutaItems || []
  );

  // Constructor correction states
  const [constructorIndexType, setConstructorIndexType] = useState<'INCC' | 'IPCA' | 'IGP-M' | 'FIXED'>(
    asset.metadata?.constructorIndexType || 'INCC'
  );
  const [constructorIndexRate, setConstructorIndexRate] = useState(
    String(asset.metadata?.constructorIndexRate || '0.0')
  );

  // Rental states
  const [isRented, setIsRented] = useState(!!asset.metadata?.isRented);
  const [rentalType, setRentalType] = useState<'anual' | 'short_stay'>(asset.metadata?.rentalType || 'anual');
  const [rentalIncome, setRentalIncome] = useState(String(asset.metadata?.rentalIncome || ''));
  const [rentalDate, setRentalDate] = useState(asset.metadata?.rentalDate || new Date().toISOString().split('T')[0]);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'VALUE'>(asset.metadata?.discountType || 'VALUE');
  const [discountValue, setDiscountValue] = useState(String(asset.metadata?.discountValue || ''));
  const [inquilinoPaysCondo, setInquilinoPaysCondo] = useState(!!asset.metadata?.inquilinoPaysCondo);
  const [inquilinoPaysIPTU, setInquilinoPaysIPTU] = useState(!!asset.metadata?.inquilinoPaysIPTU);

  // Condo and IPTU Payer Options
  const [condoPayer, setCondoPayer] = useState<'PROPRIETARIO' | 'INQUILINO_DIRETO' | 'PROPRIETARIO_REEMBOLSO'>(
    asset.metadata?.condoPayer || (asset.metadata?.inquilinoPaysCondo ? 'INQUILINO_DIRETO' : 'PROPRIETARIO')
  );
  const [iptuPayer, setIptuPayer] = useState<'PROPRIETARIO' | 'INQUILINO_DIRETO' | 'PROPRIETARIO_REEMBOLSO'>(
    asset.metadata?.iptuPayer || (asset.metadata?.inquilinoPaysIPTU ? 'INQUILINO_DIRETO' : 'PROPRIETARIO')
  );

  // Cost inputs for Condo/IPTU configurations
  const [condoFee, setCondoFee] = useState(String(asset.metadata?.condoFee || ''));
  const [iptuFee, setIptuFee] = useState(String(asset.metadata?.iptuFee || ''));
  const [condoDueDay, setCondoDueDay] = useState(String(asset.metadata?.condoDueDay || '10'));
  const [iptuDueDay, setIptuDueDay] = useState(String(asset.metadata?.iptuDueDay || '10'));
  const [iptuFrequency, setIptuFrequency] = useState<'monthly' | 'yearly'>(asset.metadata?.iptuFrequency || 'monthly');

  // Next due dates (escolha de data) for Condo and IPTU
  const [condoNextDate, setCondoNextDate] = useState(
    asset.metadata?.condoNextDate || (asset.metadata?.condoDueDay ? 
      `${new Date().toISOString().substring(0, 8)}${String(asset.metadata.condoDueDay).padStart(2, '0')}` : 
      new Date().toISOString().split('T')[0])
  );
  const [iptuNextDate, setIptuNextDate] = useState(
    asset.metadata?.iptuNextDate || (asset.metadata?.iptuDueDay ? 
      `${new Date().toISOString().substring(0, 8)}${String(asset.metadata.iptuDueDay).padStart(2, '0')}` : 
      new Date().toISOString().split('T')[0])
  );

  // Short Stay Bookings
  const [shortStayBookings, setShortStayBookings] = useState<{ id: string; date: string; amount: number; description: string; isPaid: boolean }[]>(
    asset.metadata?.shortStayBookings || []
  );
  const [newBookingDesc, setNewBookingDesc] = useState('');
  const [newBookingAmount, setNewBookingAmount] = useState('');
  const [newBookingDate, setNewBookingDate] = useState(new Date().toISOString().split('T')[0]);

  // New Quick Transaction states
  const [showQuickTxForm, setShowQuickTxForm] = useState(false);
  const [quickTxType, setQuickTxType] = useState<'CONDO' | 'IPTU' | 'RENOVATION' | 'MAINTENANCE' | 'OTHER'>('MAINTENANCE');
  const [quickTxAmount, setQuickTxAmount] = useState('');
  const [quickTxDate, setQuickTxDate] = useState(DateUtils.formatToISODate(new Date()));
  const [quickTxDescription, setQuickTxDescription] = useState('');
  const [quickTxIsPaid, setQuickTxIsPaid] = useState(true);

  // Period filtering state for yield
  const [filterPeriod, setFilterPeriod] = useState<'ALL' | 'MONTH' | 'YEAR' | 'CUSTOM'>('ALL');
  const [filterMonth, setFilterMonth] = useState(DateUtils.formatToISODate(new Date()).substring(0, 7)); // YYYY-MM
  const [filterYear, setFilterYear] = useState(DateUtils.formatToISODate(new Date()).substring(0, 4));
  const [filterStartDate, setFilterStartDate] = useState(DateUtils.formatToISODate(new Date(new Date().getFullYear(), 0, 1)));
  const [filterEndDate, setFilterEndDate] = useState(DateUtils.formatToISODate(new Date()));

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
    const reformsManualVal = parseFloat(reformsManual) || 0;
    // Reformas contam tanto o valor digitado manualmente quanto o que foi lançado em transações de reforma.
    return buy + reformsValue + reformsManualVal + cart + mob;
  }, [purchaseValue, reformsValue, reformsManual, despesasCartorarias, mobiliarios]);

  const paidTransactionsAmount = useMemo(() => {
    return assetTransactions
      .filter(t => t.type === 'EXPENSE' && t.isPaid && t.metadata?.type !== 'asset_purchase')
      .reduce((sum, t) => {
        // Consórcio é detectado pela marca carimbada quando a parcela é criada (não por adivinhação de vínculo/texto).
        const isConsortiumTx = t.metadata?.is_consortium_installment === true || !!t.metadata?.consortium_id;
        const ratio = isConsortiumTx ? ((parseFloat(consortiumAllocationRatio) || 100) / 100) : 1;
        return sum + ((t.paidAmount || t.amount) * ratio);
      }, 0);
  }, [assetTransactions, consortiumAllocationRatio]);

  const totalPaid = useMemo(() => {
    const hist = parseFloat(historicalPaidAmount) || 0;
    return hist + paidTransactionsAmount;
  }, [historicalPaidAmount, paidTransactionsAmount]);

  const totalToPay = useMemo(() => {
    return assetTransactions
      .filter(t => t.type === 'EXPENSE' && !t.isPaid)
      .reduce((sum, t) => {
        // Consórcio é detectado pela marca carimbada quando a parcela é criada (não por adivinhação de vínculo/texto).
        const isConsortiumTx = t.metadata?.is_consortium_installment === true || !!t.metadata?.consortium_id;
        const ratio = isConsortiumTx ? ((parseFloat(consortiumAllocationRatio) || 100) / 100) : 1;
        return sum + (t.amount * ratio);
      }, 0);
  }, [assetTransactions, consortiumAllocationRatio]);

  const totalRentTransactions = useMemo(() => {
    return assetTransactions
      .filter(t => t.type === 'INCOME' && t.isPaid && (t.metadata?.type === 'rental_income' || t.metadata?.type === 'short_stay_booking'))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [assetTransactions]);

  const totalRentReceived = useMemo(() => {
    const histRent = parseFloat(historicalRentReceived) || 0;
    return histRent + totalRentTransactions;
  }, [historicalRentReceived, totalRentTransactions]);

  const agioDesagio = useMemo(() => {
    const saleVal = parseFloat(saleValue) || 0;
    const current = saleVal > 0 ? saleVal : (parseFloat(estimatedValue) || 0);
    return current - totalInvestedInitially;
  }, [estimatedValue, saleValue, totalInvestedInitially]);

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
        const cleanDateStr = t.date.substring(0, 10);
        return cleanDateStr >= filterStartDate && cleanDateStr <= filterEndDate;
      }
      return true;
    });
  }, [assetTransactions, filterPeriod, filterMonth, filterYear, filterStartDate, filterEndDate]);

  // Rental yield and flow metrics
  const performanceMetrics = useMemo(() => {
    const rentIncomes = filteredTransactions
      .filter(t => t.type === 'INCOME' && t.isPaid && t.metadata?.type !== 'condo_revenue' && t.metadata?.type !== 'iptu_revenue')
      .reduce((sum, t) => sum + t.amount, 0);

    const reimbursementIncomes = filteredTransactions
      .filter(t => t.type === 'INCOME' && t.isPaid && (t.metadata?.type === 'condo_revenue' || t.metadata?.type === 'iptu_revenue'))
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
        // Consórcio é detectado pela marca carimbada quando a parcela é criada (não por adivinhação de vínculo/texto).
        const isConsortiumTx = t.metadata?.is_consortium_installment === true || !!t.metadata?.consortium_id;
        const ratio = isConsortiumTx ? ((parseFloat(consortiumAllocationRatio) || 100) / 100) : 1;
        return sum + (t.amount * ratio);
      }, 0);

    const netIncome = rentIncomes + reimbursementIncomes - operationalExpenses;
    
    // Yield calculation based on total invested initially (annualized if whole history, or monthly)
    const yielRate = totalInvestedInitially > 0 ? (netIncome / totalInvestedInitially) * 100 : 0;

    return {
      rentIncomes,
      reimbursementIncomes,
      operationalExpenses,
      financingExpenses,
      netIncome,
      yielRate,
      totalExpenses: operationalExpenses + financingExpenses
    };
  }, [filteredTransactions, totalInvestedInitially, consortiumAllocationRatio]);

  // Sync / Auto-generate rolling monthly rents or delete future ones
  // Wrapper fino sobre o motor compartilhado (realEstatePropertySync.ts) — mesma
  // lógica usada por "Editar" e pelo cadastro inicial, pra nunca mais divergir.
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
    await sharedSyncRentalTransactions({
      assetId,
      userId,
      assetName,
      isRented: isRentedVal,
      rentalIncome: rentIncomeVal,
      rentalType: rentTypeVal,
      rentalDate: rentDateVal,
      discountType: discType,
      discountValue: discVal
    });
  };

  // Wrapper fino sobre o motor compartilhado (realEstatePropertySync.ts).
  // Observação: o payer efetivo só vale a regra de reembolso/inquilino quando o
  // imóvel está alugado no modelo "anual" — fora disso, o proprietário arca
  // direto (mesma regra que já existia aqui).
  const syncExpenseProvisions = async (userId: string) => {
    const effCondoPayer = (isRented && rentalType === 'anual') ? condoPayer : 'PROPRIETARIO';
    const effIptuPayer = (isRented && rentalType === 'anual') ? iptuPayer : 'PROPRIETARIO';
    await syncCondoIptuTransactions({
      assetId: asset.id,
      userId,
      assetName: name,
      propertyStage,
      condoPayer: effCondoPayer,
      condoFee: parseFloat(condoFee) || 0,
      condoNextDate,
      iptuPayer: effIptuPayer,
      iptuFee: parseFloat(iptuFee) || 0,
      iptuNextDate,
      iptuFrequency
    });
  };

  // Sync Short Stay bookings
  const syncShortStayBookings = async (userId: string) => {
    if (!supabase) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Fetch existing bookings transactions from DB
      const { data: dbBookings } = await supabase
        .from('transactions')
        .select('id, metadata')
        .eq('user_id', userId)
        .eq('metadata->>linked_asset_id', asset.id)
        .eq('metadata->>type', 'short_stay_booking');
        
      const dbBookingsList = dbBookings || [];
      
      // 1. Delete transactions that are no longer in shortStayBookings state
      const stateBookingIds = shortStayBookings.map(b => b.id);
      const toDelete = dbBookingsList.filter((tx: any) => !stateBookingIds.includes(tx.metadata?.booking_id));
      if (toDelete.length > 0) {
        await supabase.from('transactions').delete().in('id', toDelete.map((tx: any) => tx.id));
      }
      
      // 2. Insert new bookings or update existing ones
      if (isRented && rentalType === 'short_stay') {
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
            .insert({ user_id: userId, name: categoryName, type: 'INCOME', color: 'bg-emerald-50 text-emerald-600' })
            .select('id').maybeSingle();
          if (c) catId = c.id;
        }
        
        for (const booking of shortStayBookings) {
          const existingTx = dbBookingsList.find((tx: any) => tx.metadata?.booking_id === booking.id);
          if (existingTx) {
            // Update transaction
            await supabase
              .from('transactions')
              .update({
                amount: booking.amount,
                date: booking.date,
                description: booking.description || `Receita Short Stay - ${name}`
              })
              .eq('id', existingTx.id);
          } else {
            // Insert new transaction
            await supabase
              .from('transactions')
              .insert({
                user_id: userId,
                description: booking.description || `Receita Short Stay - ${name}`,
                amount: booking.amount,
                date: booking.date,
                type: 'INCOME',
                category: categoryName,
                subcategory: 'Short Stay',
                category_id: catId || null,
                is_paid: booking.isPaid || false,
                metadata: {
                  linked_asset_id: asset.id,
                  type: 'short_stay_booking',
                  booking_id: booking.id
                }
              });
          }
        }
      } else {
        // If not short stay, delete all future unpaid short stay bookings
        const { data: dbFutureUnpaidBookings } = await supabase
          .from('transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('metadata->>linked_asset_id', asset.id)
          .eq('metadata->>type', 'short_stay_booking')
          .eq('is_paid', false)
          .gt('date', todayStr);
          
        if (dbFutureUnpaidBookings && dbFutureUnpaidBookings.length > 0) {
          await supabase.from('transactions').delete().in('id', dbFutureUnpaidBookings.map((tx: any) => tx.id));
        }
      }
    } catch (e) {
      console.error('Error syncing short stay bookings:', e);
    }
  };

  // Wrapper fino: só garante que a lógica de verdade (handleSaveChangesInner) nunca
  // rode duas vezes em paralelo — ver realEstateSaveInFlight acima.
  const handleSaveChanges = async () => {
    if (realEstateSaveInFlight) return;
    realEstateSaveInFlight = true;
    try {
      await handleSaveChangesInner();
    } finally {
      realEstateSaveInFlight = false;
    }
  };

  const handleSaveChangesInner = async () => {
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
      const histRent = parseFloat(historicalRentReceived) || 0;
      const saleVal = parseFloat(saleValue) || 0;
      const rentVal = parseFloat(rentalIncome) || 0;
      const condoVal = parseFloat(condoFee) || 0;
      const iptuVal = parseFloat(iptuFee) || 0;
      const discVal = parseFloat(discountValue) || 0;

      // Evolução de Histórico de Valor Atual
      let valuationHistory = [...(asset.metadata?.valuationHistory || [])];
      if (valuationHistory.length > 0 && valuationHistory[0].label === 'Aquisição') {
        valuationHistory[0].date = acquisitionDate;
      } else if (valuationHistory.length === 0 && (buyVal || asset.estimatedValue)) {
        valuationHistory.push({
          date: acquisitionDate,
          value: buyVal || asset.estimatedValue,
          label: 'Aquisição'
        });
      }
      const lastVal = valuationHistory.length > 0 ? valuationHistory[valuationHistory.length - 1] : null;
      if (!lastVal || lastVal.value !== estVal) {
        valuationHistory.push({
          date: new Date().toISOString().split('T')[0],
          value: estVal,
          label: 'Atualização'
        });
      }

      const updatedMetadata = {
        ...(asset.metadata || {}),
        propertyStage,
        purpose,
        purchaseValue: buyVal,
        reformsManual: parseFloat(reformsManual) || 0,
        despesasCartorarias: cartVal,
        mobiliarios: mobVal,
        historicalPaidAmount: histPaid,
        historicalRentReceived: propertyStage === 'PLANTA' ? 0 : histRent,
        saleValue: saleVal,
        isRented,
        rentalType,
        rentalIncome: rentVal,
        rentalDate,
        discountType,
        discountValue: discVal,
        inquilinoPaysCondo: condoPayer === 'INQUILINO_DIRETO',
        inquilinoPaysIPTU: iptuPayer === 'INQUILINO_DIRETO',
        condoPayer,
        iptuPayer,
        condoFee: condoVal,
        iptuFee: iptuVal,
        condoNextDate,
        iptuNextDate,
        iptuFrequency,
        shortStayBookings,
        valuationHistory,
        consortiumAllocationRatio: asset.metadata?.selectedConsortiumId ? (parseFloat(consortiumAllocationRatio) || 100) : undefined,
        isSold,
        brokerFee: parseFloat(brokerFee) || 0,
        saleCommission: parseFloat(saleCommission) || 0,
        saleComission: parseFloat(saleCommission) || 0, // deprecated legacy fallback
        salePaymentMethod,
        saleDate,
        saleCashAmount: parseFloat(saleCashAmount) || 0,
        permutaItems
      };

      const wasSoldBefore = !!asset.metadata?.isSold;
      if (isSold && !wasSoldBefore) {
        const soldAmount = saleVal;
        const comission = parseFloat(saleCommission) || 0;
        const saleDateStr = saleDate || new Date().toISOString().split('T')[0];

        // 1. Excluir provisões futuras não pagas vinculadas ao imóvel
        const { data: oldProvisions } = await supabase
          .from('transactions')
          .select('id, metadata')
          .eq('user_id', user.id)
          .eq('is_paid', false);

        if (oldProvisions && oldProvisions.length > 0) {
          const idsToDelete = oldProvisions
            .filter((t: any) => 
              t.metadata?.linked_asset_id === asset.id &&
              (t.metadata?.type === 'rental_income' ||
               t.metadata?.type === 'condo_provision' ||
               t.metadata?.type === 'condo_expense' ||
               t.metadata?.type === 'condo_revenue' ||
               t.metadata?.type === 'iptu_provision' ||
               t.metadata?.type === 'iptu_expense' ||
               t.metadata?.type === 'iptu_revenue' ||
               t.metadata?.type === 'short_stay_booking')
            )
            .map((p: any) => p.id);
          
          if (idsToDelete.length > 0) {
            await supabase.from('transactions').delete().in('id', idsToDelete);
          }
        }

        // 2. Comissão de venda (se houver)
        if (comission > 0) {
          let catId = null;
          const { data: catRes } = await supabase
            .from('categories')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', 'Ativos Imobiliários')
            .maybeSingle();
          if (catRes) catId = catRes.id;

          await supabase.from('transactions').insert([{
            user_id: user.id,
            description: `${name} - Comissão de Venda`,
            amount: comission,
            date: saleDateStr,
            type: 'EXPENSE',
            category: 'Ativos Imobiliários',
            subcategory: 'Comissão',
            category_id: catId,
            is_paid: true,
            paid_amount: comission,
            paid_at: saleDateStr,
            metadata: { linked_asset_id: asset.id, type: 'real_estate_sale_comission' }
          }]);
        }

        // 3. Receita da venda
        let revenueCatId = null;
        const { data: revCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', 'Venda de Ativos')
          .maybeSingle();
        if (revCat) {
          revenueCatId = revCat.id;
        } else {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({
              user_id: user.id,
              name: 'Venda de Ativos',
              type: 'INCOME',
              color: 'bg-emerald-50 text-emerald-600'
            })
            .select('id')
            .single();
          if (newCat) revenueCatId = newCat.id;
        }

        if (salePaymentMethod === 'A_VISTA' || salePaymentMethod === 'HIBRIDO') {
          let cashVal = soldAmount;
          if (salePaymentMethod === 'HIBRIDO') {
            cashVal = parseFloat(saleCashAmount) || 0;
          }

          if (cashVal > 0) {
            await supabase.from('transactions').insert([{
              user_id: user.id,
              description: salePaymentMethod === 'HIBRIDO'
                ? `${name} - Receita Venda de Imóvel (Parte Dinheiro)`
                : `${name} - Receita Venda de Imóvel (À Vista)`,
              amount: cashVal,
              date: saleDateStr,
              type: 'INCOME',
              category: 'Venda de Ativos',
              subcategory: 'Venda de Imóvel',
              category_id: revenueCatId,
              is_paid: true,
              paid_amount: cashVal,
              paid_at: saleDateStr,
              metadata: { linked_asset_id: asset.id, type: 'real_estate_sale_revenue' }
            }]);
          }
        } 
        else if (salePaymentMethod === 'PARCELADO') {
          const parcelas = 10;
          const valorParcela = soldAmount / parcelas;
          const newSaleInstallments = [];
          
          for (let i = 0; i < parcelas; i++) {
            const futureDate = new Date(saleDateStr + 'T00:00:00');
            futureDate.setMonth(futureDate.getMonth() + i);
            const futureDateStr = futureDate.toISOString().split('T')[0];

            newSaleInstallments.push({
              user_id: user.id,
              description: `${name} - Receita Parcelada Venda (${i+1}/${parcelas})`,
              amount: valorParcela,
              date: futureDateStr,
              type: 'INCOME',
              category: 'Venda de Ativos',
              subcategory: 'Venda de Imóvel',
              category_id: revenueCatId,
              is_paid: false,
              metadata: { linked_asset_id: asset.id, type: 'real_estate_sale_installment', installment: i+1 }
            });
          }
          if (newSaleInstallments.length > 0) {
            await supabase.from('transactions').insert(newSaleInstallments);
          }
        }

        // 4. Criar bens de permuta automaticamente com metadados de origem de permuta
        if (Array.isArray(permutaItems) && permutaItems.length > 0) {
          const assetsToInsert = permutaItems
            .filter((item: any) => item.name && (parseFloat(item.value) || 0) > 0)
            .map((item: any) => ({
              user_id: user.id,
              name: item.name,
              category: item.type,
              estimated_value: parseFloat(item.value) || 0,
              acquisition_date: saleDateStr,
              description: `Recebido em permuta na venda de ${name}`,
              metadata: {
                ...(item.type === 'REAL_ESTATE' ? { propertyStage: 'PRONTO', purpose: 'uso' } : { purpose: 'uso' }),
                permuta_origem_asset_id: asset.id,
                permuta_original_value: parseFloat(item.value) || 0
              }
            }));
          if (assetsToInsert.length > 0) {
            await supabase.from('physical_assets').insert(assetsToInsert);
          }
        }

        // 5. Se este imóvel for um bem de permuta e está sendo vendido, propagar o valor de venda real ao ativo principal
        if (asset.metadata?.permuta_origem_asset_id) {
          const origId = asset.metadata.permuta_origem_asset_id;
          const origVal = parseFloat(asset.metadata.permuta_original_value) || 0;
          const diff = soldAmount - origVal;
          
          if (diff !== 0) {
            const { data: origAsset } = await supabase
              .from('physical_assets')
              .select('*')
              .eq('id', origId)
              .maybeSingle();
              
            if (origAsset) {
              const origMeta = { ...(origAsset.metadata || {}) };
              if (origAsset.category === 'REAL_ESTATE') {
                origMeta.saleValue = (parseFloat(origMeta.saleValue) || 0) + diff;
              } else {
                origMeta.soldValue = (parseFloat(origMeta.soldValue) || 0) + diff;
              }
              
              await supabase
                .from('physical_assets')
                .update({ metadata: origMeta })
                .eq('id', origId);
                
              // Atualizar transação de receita de venda do ativo de origem
              const { data: origTxs } = await supabase
                .from('transactions')
                .select('id, amount, account_id')
                .eq('is_deleted', false)
                .eq('metadata->>linked_asset_id', origId)
                .in('metadata->>type', ['real_estate_sale_revenue', 'vehicle_sale_revenue']);
                
              if (origTxs && origTxs.length > 0) {
                for (const tx of origTxs) {
                  const newAmt = tx.amount + diff;
                  await supabase
                    .from('transactions')
                    .update({ amount: newAmt, paid_amount: newAmt })
                    .eq('id', tx.id);
                    
                  if (tx.account_id) {
                    await supabase.rpc('recalculate_account_balance', { p_account_id: tx.account_id });
                  }
                }
              }
            }
          }
        }
      }

      if (propertyStage === 'PLANTA') {
        updatedMetadata.constructorIndexType = constructorIndexType;
        updatedMetadata.constructorIndexRate = parseFloat(constructorIndexRate) || 0;
      }

      // Recalcular parcelas da construtora se mudou a taxa/índice
      if (propertyStage === 'PLANTA') {
        const oldRate = asset.metadata?.constructorIndexRate !== undefined ? parseFloat(asset.metadata.constructorIndexRate) : null;
        const oldIndex = asset.metadata?.constructorIndexType || null;
        const newRate = parseFloat(constructorIndexRate) || 0;

        const rateChanged = oldRate !== newRate || oldIndex !== constructorIndexType;

        if (rateChanged) {
          // Fetch all active unpaid constructor transactions for this asset
          const { data: txsToRecalc, error: txFetchErr } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_paid', false)
            .eq('is_deleted', false)
            .eq('metadata->>linked_asset_id', asset.id);

          if (txFetchErr) throw txFetchErr;

          if (txsToRecalc && txsToRecalc.length > 0) {
            const acquisitionDateStr = asset.acquisitionDate || new Date().toISOString().split('T')[0];
            const ratePercent = newRate / 100;

            for (const tx of txsToRecalc) {
              const txType = tx.metadata?.property_tx_type;
              if (txType === 'DOWN_PAYMENT' || txType === 'BALLOON' || txType === 'CONSTRUCTOR_INSTALLMENT') {
                const originalAmount = tx.metadata?.original_amount !== undefined ? parseFloat(tx.metadata.original_amount) : tx.amount;
                
                const t = getMonthsDifference(acquisitionDateStr, tx.date);
                const correctedAmount = originalAmount * Math.pow(1 + ratePercent, t);

                const updatedMeta = {
                  ...(tx.metadata || {}),
                  original_amount: originalAmount
                };

                await supabase
                  .from('transactions')
                  .update({
                    amount: correctedAmount,
                    metadata: updatedMeta
                  })
                  .eq('id', tx.id);
              }
            }
          }
        }
      }

      // Update physical assets table
      const { error } = await supabase
        .from('physical_assets')
        .update({
          name: name,
          estimated_value: estVal,
          acquisition_date: acquisitionDate || null,
          metadata: updatedMetadata,
          is_archived: isSold
        })
        .eq('id', asset.id);

      if (error) throw error;

      // Sincronizar datas de transações vinculadas de aquisição e financiamento
      await supabase
        .from('transactions')
        .update({
          date: acquisitionDate,
          paid_at: acquisitionDate
        })
        .eq('user_id', user.id)
        .eq('metadata->>linked_asset_id', asset.id)
        .in('metadata->>type', ['asset_purchase', 'liability_inflow']);

      if (!isSold) {
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

        // Sync condo / iptu expenses & revenues
        await syncExpenseProvisions(user.id);

        // Sync short stay bookings
        await syncShortStayBookings(user.id);
      }

      alert('Dados do imóvel atualizados com sucesso!');
      onSuccess();
      onClose(); // Close modal on success
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

  const handleArchiveAsset = () => {
    setIsSold(true);
    alert('Marcar como Vendido selecionado. Preencha os detalhes da venda no painel de Custos de Aquisição & Capital abaixo e clique em Salvar Alterações.');
  };

  const handleDeleteAsset = async () => {
    if (!supabase) return;
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente o imóvel "${name}" e todas as suas transações vinculadas? Esta ação não poderá ser desfeita.`)) return;
    
    setIsSubmitting(true);
    try {
      // 1. Delete linked transactions
      const { error: txErr } = await supabase
        .from('transactions')
        .delete()
        .eq('metadata->>linked_asset_id', asset.id);
        
      if (txErr) throw txErr;

      // 2. Unlink consortium liabilities if any
      const { error: liabErr } = await supabase
        .from('liabilities')
        .update({ linked_asset_id: null })
        .eq('linked_asset_id', asset.id);
        
      if (liabErr) throw liabErr;

      // 3. Delete physical asset
      const { error: assetErr } = await supabase
        .from('physical_assets')
        .delete()
        .eq('id', asset.id);

      if (assetErr) throw assetErr;

      alert('Imóvel e suas transações excluídos com sucesso!');
      onClose();
      onSuccess();
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    } finally {
      setIsSubmitting(false);
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
            <button onClick={handleDeleteAsset} className="p-3 bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Excluir Lançamento do Imóvel"><Trash2 size={18} /></button>
            <button onClick={onClose} className="w-12 h-12 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-2xl flex items-center justify-center transition-all shadow-sm ml-2" aria-label="Fechar"><X size={20} /></button>
          </div>
        </div>

        {/* PRINT ONLY HEADER */}
        <div className="hidden print:flex flex-col mb-6 pb-4 border-b border-slate-200">
          <h2 className="text-2xl font-bold">{name}</h2>
          <p className="text-sm text-slate-500">Relatório Patrimonial de Ativos Imobiliários - Zyvion</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Atual</label>
                    <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor de Compra</label>
                    <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={purchaseValue} onChange={e => setPurchaseValue(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data de Aquisição / Compra</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="date" value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)} />
                </div>

                {/* Histórico de Evolução de Valor */}
                {asset.metadata?.valuationHistory && asset.metadata.valuationHistory.length > 0 && (
                  <div className="border-t border-slate-200/60 pt-3 mt-2 space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Histórico de Valor Atual</p>
                    <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                      {asset.metadata.valuationHistory.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-[9px] text-slate-500">
                          <span>{item.date ? new Date(item.date).toLocaleDateString('pt-BR') : ''} ({item.label || 'Atualização'}):</span>
                          <span className="font-bold text-slate-800">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Condomínio e IPTU (Evolução Inicial) */}
                {propertyStage !== 'PLANTA' && (
                  <div className="border-t border-slate-200/60 pt-3 mt-2 space-y-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Despesas Periódicas Básicas</p>
                    
                    {/* Condomínio */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Condomínio Mensal (R$)</label>
                        <input className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={condoFee} onChange={e => setCondoFee(e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Próx. Venc. Condo</label>
                        <input className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" type="date" value={condoNextDate} onChange={e => setCondoNextDate(e.target.value)} />
                      </div>
                    </div>

                    {/* IPTU */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor IPTU (R$)</label>
                        <input className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={iptuFee} onChange={e => setIptuFee(e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Freq. IPTU</label>
                        <select className="w-full h-9 px-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" value={iptuFrequency} onChange={e => setIptuFrequency(e.target.value as any)}>
                          <option value="monthly">Mensal</option>
                          <option value="yearly">Anual</option>
                        </select>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Próx. Venc. IPTU</label>
                        <input className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" type="date" value={iptuNextDate} onChange={e => setIptuNextDate(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Reformas / Obras (R$)</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={reformsManual} onChange={e => setReformsManual(e.target.value)} placeholder="0" />
                  {reformsValue > 0 && (
                    <p className="text-[8px] font-bold text-slate-400 pl-1">+ {formatCurrency(reformsValue)} já lançados em transações de reforma</p>
                  )}
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
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Pago Anteriormente (Histórico)</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={historicalPaidAmount} onChange={e => setHistoricalPaidAmount(e.target.value)} placeholder="0" />
                </div>
                {propertyStage !== 'PLANTA' && (
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Aluguel Recebido Anteriormente (Histórico)</label>
                    <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={historicalRentReceived} onChange={e => setHistoricalRentReceived(e.target.value)} placeholder="0" />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Taxa de Corretagem (R$)</label>
                  <input className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs" type="number" value={brokerFee} onChange={e => setBrokerFee(e.target.value)} placeholder="0" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none pt-6">
                  <input
                    type="checkbox"
                    checked={isSold}
                    onChange={(e) => setIsSold(e.target.checked)}
                  />
                  Marcar como Vendido
                </label>

                {isSold && (
                  <div className="col-span-1 sm:col-span-2 space-y-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Venda (R$)</label>
                        <input
                          type="number"
                          className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs"
                          value={saleValue}
                          onChange={(e) => setSaleValue(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Comissão de Venda (R$)</label>
                        <input
                          type="number"
                          className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs"
                          value={saleCommission}
                          onChange={(e) => setSaleCommission(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Forma de Recebimento</label>
                      <select
                        className="w-full h-10 px-3 bg-white border rounded-xl font-bold text-xs outline-none"
                        value={salePaymentMethod}
                        onChange={(e) => setSalePaymentMethod(e.target.value as any)}
                      >
                        <option value="A_VISTA">À Vista (Dinheiro/PIX)</option>
                        <option value="PARCELADO">Parcelado (Contas a Receber)</option>
                        <option value="PERMUTA">Permuta Integral (Troca de Bens)</option>
                        <option value="HIBRIDO">Híbrido (Parte Dinheiro, Parte Permuta)</option>
                      </select>
                    </div>

                    {salePaymentMethod === 'A_VISTA' && (
                      <div className="space-y-1 animate-in slide-in-from-top-2">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data de Recebimento</label>
                        <input
                          type="date"
                          className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs"
                          value={saleDate}
                          onChange={(e) => setSaleDate(e.target.value)}
                        />
                      </div>
                    )}

                    {salePaymentMethod === 'HIBRIDO' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor em Dinheiro (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs"
                            value={saleCashAmount}
                            onChange={(e) => setSaleCashAmount(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data do Recebimento</label>
                          <input
                            type="date"
                            className="w-full h-10 px-4 bg-white border rounded-xl font-bold text-slate-900 outline-none text-xs"
                            value={saleDate}
                            onChange={(e) => setSaleDate(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {(salePaymentMethod === 'PERMUTA' || salePaymentMethod === 'HIBRIDO') && (
                      <div className="space-y-3 pt-2 border-t border-dashed border-slate-200">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Bens Recebidos na Permuta</p>
                        
                        {permutaItems && permutaItems.map((item, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 bg-white p-3 rounded-xl border border-slate-100 items-end">
                            <div className="col-span-3">
                              <label className="block text-[8px] font-bold text-slate-400 mb-1">Tipo</label>
                              <select
                                className="w-full h-8 px-1.5 bg-slate-50 border rounded-lg text-[10px] font-bold outline-none"
                                value={item.type}
                                onChange={(e) => {
                                  const newItems = [...permutaItems];
                                  newItems[idx].type = e.target.value as any;
                                  setPermutaItems(newItems);
                                }}
                              >
                                <option value="VEHICLE">Veículo</option>
                                <option value="REAL_ESTATE">Imóvel</option>
                                <option value="OTHER">Outro Bem</option>
                              </select>
                            </div>
                            
                            <div className="col-span-5">
                              <label className="block text-[8px] font-bold text-slate-400 mb-1">Nome / Descrição</label>
                              <input
                                className="w-full h-8 px-2 bg-slate-50 border rounded-lg text-xs"
                                value={item.name}
                                onChange={(e) => {
                                  const newItems = [...permutaItems];
                                  newItems[idx].name = e.target.value;
                                  setPermutaItems(newItems);
                                }}
                                placeholder={
                                  item.type === 'VEHICLE'
                                    ? 'Ex: Fiat Uno 2012'
                                    : item.type === 'REAL_ESTATE'
                                    ? 'Ex: Terreno Condomínio'
                                    : 'Ex: Cota Consórcio'
                                }
                              />
                            </div>

                            <div className="col-span-3">
                              <label className="block text-[8px] font-bold text-slate-400 mb-1">Valor (R$)</label>
                              <input
                                type="number"
                                className="w-full h-8 px-2 bg-slate-50 border rounded-lg text-xs font-bold"
                                value={item.value}
                                onChange={(e) => {
                                  const newItems = [...permutaItems];
                                  newItems[idx].value = e.target.value;
                                  setPermutaItems(newItems);
                                }}
                                placeholder="0.00"
                              />
                            </div>

                            <div className="col-span-1 flex justify-center pb-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = permutaItems.filter((_, i) => i !== idx);
                                  setPermutaItems(newItems);
                                }}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => {
                            setPermutaItems([
                              ...permutaItems,
                              { type: 'VEHICLE', name: '', value: '' }
                            ]);
                          }}
                          className="w-full h-9 border border-dashed border-slate-300 rounded-xl text-[10px] font-bold text-slate-500 hover:border-brand-500 hover:text-brand-600 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus size={12} />
                          Adicionar Bem Recebido
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

            {/* Correção e Reajuste da Construtora (Apenas Na Planta) */}
            {propertyStage === 'PLANTA' && (
              <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Correção / Reajuste da Construtora</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Índice Correção</label>
                    <select 
                      className="w-full h-10 px-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" 
                      value={constructorIndexType} 
                      onChange={e => setConstructorIndexType(e.target.value as any)}
                    >
                      <option value="INCC">INCC</option>
                      <option value="IPCA">IPCA</option>
                      <option value="IGP-M">IGP-M</option>
                      <option value="FIXED">Fixo (Sem reajuste)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Projeção Reajuste (% am)</label>
                    <input 
                      className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 outline-none text-xs" 
                      type="number" 
                      step="0.01" 
                      value={constructorIndexRate} 
                      onChange={e => setConstructorIndexRate(e.target.value)} 
                      placeholder="0.0" 
                    />
                  </div>
                </div>
                <p className="text-[8px] text-slate-400 font-bold uppercase leading-normal">
                  * Alterar estes campos recalculará automaticamente os valores projetados de todas as parcelas futuras (Entradas, Intermediárias e Construtora) não pagas.
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
                  <span className="text-slate-400 font-medium">Valor Pago Anteriormente (Histórico):</span>
                  <span className="font-bold text-slate-300">{formatCurrency(parseFloat(historicalPaidAmount) || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Valor Pago em Transações (Tx):</span>
                  <span className="font-bold text-slate-300">{formatCurrency(paidTransactionsAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-1.5">
                  <span className="text-slate-400 font-medium">Total Pago (Histórico + Tx):</span>
                  <span className="font-bold text-emerald-400">{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Restante a Pagar:</span>
                  <span className="font-bold text-rose-400">{formatCurrency(totalToPay)}</span>
                </div>
                {propertyStage === 'PLANTA' && (
                  <>
                    <div className="flex justify-between border-t border-white/5 pt-1.5">
                      <span className="text-slate-400 font-medium">Financiamento na Entrega:</span>
                      <span className="font-bold text-slate-300">
                        {formatCurrency(parseFloat(asset.metadata?.deliveryBalance) || parseFloat(asset.metadata?.financingOriginalTotal) || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Valor Total em Obra (Gastos):</span>
                      <span className="font-bold text-slate-300">{formatCurrency(totalPaid + totalToPay)}</span>
                    </div>
                  </>
                )}
                {propertyStage !== 'PLANTA' && (
                  <>
                    <div className="flex justify-between border-t border-white/5 pt-1.5">
                      <span className="text-slate-400 font-medium">Aluguel Recebido Anteriormente (Histórico):</span>
                      <span className="font-bold text-slate-300">{formatCurrency(parseFloat(historicalRentReceived) || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Aluguel Recebido em Transações (Tx):</span>
                      <span className="font-bold text-slate-300">{formatCurrency(totalRentTransactions)}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/5 pt-1.5 font-bold text-emerald-400">
                      <span>Total de Aluguel Recebido:</span>
                      <span>{formatCurrency(totalRentReceived)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-sm">
                  <span className="text-slate-300">
                    {parseFloat(saleValue) > 0 ? 'Resultado da Venda (Lucro/Preju.):' : 'Ágio / Deságio:'}
                  </span>
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
                      {rentalType === 'anual' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor do Aluguel (Gross)</label>
                            <input className="w-full h-9 px-3 bg-white border rounded-lg font-bold text-xs" type="number" value={rentalIncome} onChange={e => setRentalIncome(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Inicial de Cobrança</label>
                            <input className="w-full h-9 px-3 bg-white border rounded-lg font-bold text-xs" type="date" value={rentalDate} onChange={e => setRentalDate(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Taxa ADM (R$)</label>
                            <input className="w-full h-9 px-3 bg-white border rounded-lg font-bold text-xs" type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder="0" />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-3 p-1">
                          <p className="text-[10px] font-black text-slate-800 uppercase">Reservas de Short Stay</p>
                          
                          {/* List existing bookings */}
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar border border-slate-100 p-2 rounded-xl bg-white">
                            {shortStayBookings.length === 0 ? (
                              <p className="text-[9px] text-slate-400 font-bold uppercase italic text-center py-4">Nenhuma reserva.</p>
                            ) : (
                              shortStayBookings.map((booking) => (
                                <div key={booking.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100 text-[10px] font-bold text-slate-700">
                                  <div className="truncate max-w-[80%]">
                                    <p className="font-black text-slate-900 truncate">{booking.description}</p>
                                    <p className="text-[8px] text-slate-400 font-medium">{new Date(booking.date + 'T00:00:00').toLocaleDateString('pt-BR')} • {formatCurrency(booking.amount)}</p>
                                  </div>
                                  <button 
                                    onClick={() => {
                                      setShortStayBookings(prev => prev.filter(b => b.id !== booking.id));
                                    }} 
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                                    title="Remover Reserva"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Inline form to add new booking */}
                          <div className="border-t border-slate-200/80 pt-2 space-y-2 bg-slate-50/50 p-2 rounded-xl">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nova Reserva</p>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Descrição</label>
                              <input 
                                className="w-full h-8 px-2 bg-white border rounded-lg text-xs font-bold" 
                                type="text" 
                                value={newBookingDesc} 
                                onChange={e => setNewBookingDesc(e.target.value)} 
                                placeholder="Reserva Airbnb João"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor (R$)</label>
                                <input 
                                  className="w-full h-8 px-2 bg-white border rounded-lg text-xs font-bold" 
                                  type="number" 
                                  value={newBookingAmount} 
                                  onChange={e => setNewBookingAmount(e.target.value)} 
                                  placeholder="0"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                                <input 
                                  className="w-full h-8 px-2 bg-white border rounded-lg text-xs font-bold" 
                                  type="date" 
                                  value={newBookingDate} 
                                  onChange={e => setNewBookingDate(e.target.value)} 
                                />
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                const amt = parseFloat(newBookingAmount);
                                if (!newBookingDate || isNaN(amt) || amt <= 0) {
                                  alert('Por favor, informe data e valor válidos para a reserva.');
                                  return;
                                }
                                const newBooking = {
                                  id: 'booking_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                                  date: newBookingDate,
                                  amount: amt,
                                  description: newBookingDesc.trim() || 'Reserva Short Stay',
                                  isPaid: false
                                };
                                setShortStayBookings(prev => [...prev, newBooking]);
                                setNewBookingDesc('');
                                setNewBookingAmount('');
                              }} 
                              className="w-full h-8 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-[8px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 mt-1 shadow-sm"
                            >
                              <Plus size={12} />
                              Adicionar Reserva
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Condominio and IPTU choices */}
                  <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Despesas Periódicas (Quem Paga?)</p>
                    
                    {rentalType === 'anual' ? (
                      <div className="space-y-3">
                        {/* Condo Payer Select */}
                        <div className="p-3 bg-white rounded-xl border border-slate-100 space-y-1">
                          <p className="text-[9px] font-black text-slate-900 uppercase">Condomínio</p>
                          <select 
                            className="w-full h-9 px-2 bg-slate-55 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 mt-1" 
                            value={condoPayer} 
                            onChange={e => setCondoPayer(e.target.value as any)}
                          >
                            <option value="PROPRIETARIO">Proprietário Paga (Despesa)</option>
                            <option value="INQUILINO_DIRETO">Inquilino Paga Diretamente</option>
                            <option value="PROPRIETARIO_REEMBOLSO">Proprietário Paga e Recebe do Inquilino</option>
                          </select>
                        </div>

                        {/* IPTU Payer Select */}
                        <div className="p-3 bg-white rounded-xl border border-slate-100 space-y-1">
                          <p className="text-[9px] font-black text-slate-900 uppercase">IPTU</p>
                          <select 
                            className="w-full h-9 px-2 bg-slate-55 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 mt-1" 
                            value={iptuPayer} 
                            onChange={e => setIptuPayer(e.target.value as any)}
                          >
                            <option value="PROPRIETARIO">Proprietário Paga (Despesa)</option>
                            <option value="INQUILINO_DIRETO">Inquilino Paga Diretamente</option>
                            <option value="PROPRIETARIO_REEMBOLSO">Proprietário Paga e Recebe do Inquilino</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2">
                        <AlertTriangle size={18} className="text-amber-400" />
                        <p className="text-[10px] font-bold uppercase tracking-wider">Regra de Short Stay</p>
                        <p className="text-[9px] text-slate-355 leading-relaxed font-medium">
                          No modelo de Short Stay, as despesas de Condomínio e IPTU são <strong>sempre pagas pelo proprietário</strong> e serão lançadas como despesas automáticas conforme vencimento.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Operational financial indicators */}
                  <div className="space-y-4 bg-slate-900 text-white p-6 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rentabilidade Operacional (Yield)</p>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Renda de Aluguel:</span>
                        <span className="font-bold text-emerald-400">+{formatCurrency(performanceMetrics.rentIncomes)}</span>
                      </div>
                      {(condoPayer === 'PROPRIETARIO_REEMBOLSO' || iptuPayer === 'PROPRIETARIO_REEMBOLSO' || performanceMetrics.reimbursementIncomes > 0) && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Reembolso Condo/IPTU Recebido:</span>
                          <span className="font-bold text-emerald-400">+{formatCurrency(performanceMetrics.reimbursementIncomes)}</span>
                        </div>
                      )}
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

            <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-slate-50/50">
              <div className="max-h-[300px] overflow-y-auto overflow-x-auto custom-scrollbar">
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

                          const isConsortiumTx = tx.metadata?.is_consortium_installment === true || !!tx.metadata?.consortium_id;
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

        {/* FOOTER DE AÇÕES GLOBAIS */}
        <div className="px-10 py-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50 print:hidden">
          <button 
            onClick={onClose} 
            disabled={isSubmitting} 
            className="px-6 h-11 bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Cancelar Alterações
          </button>
          <button 
            onClick={handleSaveChanges} 
            disabled={isSubmitting} 
            className="px-6 h-11 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm shadow-brand-500/10"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>

      </div>
    </div>
  );
};
