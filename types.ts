export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  is_approved: boolean;
  created_at: string;
}

export interface DashboardData {
  consolidatedBalance: number;
  netWorth: number;
  creditCards: {
    brand: string;
    current: number;
    forecasted: number;
    color: string;
  }[];
  alerts: {
    id: string;
    type: 'warning' | 'info' | 'critical';
    message: string;
    createdAt: string;
  }[];
  goals: {
    id: string;
    name: string;
    target: number;
    current: number;
    color: string;
  }[];
  cashFlow: {
    month: string;
    income: number;
    expense: number;
  }[];
  assets: {
    name: string;
    value: number;
    color: string;
  }[];
}

export type AccountType = 'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CASH';

export interface BankAccount {
  id: string;
  institution: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  limit: number;
  color: string;
  isArchived: boolean;
  includeInDashboard: boolean;
  lastSync?: string;
}

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'BILL_PAYMENT' | 'ADJUSTMENT';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: TransactionType;
  accountId: string;
  accountName: string;
  category: string;
  isDeleted?: boolean;
  isReconciled?: boolean;
  metadata?: Record<string, any>;

  // --- NOVOS CAMPOS (pagamentos) ---
  // Mantidos opcionais para não quebrar outras telas / dados antigos.
  isPaid?: boolean;          // true = pago / false = pendente
  paidAmount?: number;       // quanto já foi pago (parcial/total)
  paidAt?: string;           // quando quitou (ou último registro)
  parentId?: string | null;  // se for uma "diferença" gerada a partir de outra transação

  // --- RECONCILIAÇÃO / RECORRÊNCIA ---
  is_recurring?: boolean;
  recurrence_period?: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
  recurrence_group_id?: string;
  is_installment?: boolean;
  installment_number?: number;
  installment_total?: number;
  installment_group_id?: string;
}

export interface ReconcileItem {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  source: string;
  confidence: number;
}

export interface PhysicalAsset {
  id: string;
  name: string;
  category: 'REAL_ESTATE' | 'VEHICLE' | 'OTHER';
  estimatedValue: number;
  acquisitionDate: string;
  description: string;
}

export interface InvestmentBroker {
  id: string;
  name: string;
  balance: number;
  allocation: {
    type: string;
    percentage: number;
    value: number;
    color: string;
  }[];
}

export interface CreditCardDetailed {
  id: string;
  name: string;
  brand: string;
  lastDigits: string;
  limit: number;
  availableLimit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  invoices: {
    id: string;
    month: string;
    year: number;
    amount: number;
    status: 'PAID' | 'OPEN' | 'OVERDUE';
  }[];
}

export interface SystemSettings {
  theme: 'light' | 'dark';
  notifications: boolean;
  baseCurrency: string;
  rates: {
    iof: number;
    spread: number;
  };
}

// Fixed: Added missing interfaces used by AIService to resolve compilation errors
export interface ExtractedItem {
  id: string;
  originalName: string;
  normalizedName: string;
  price: number;
  category: string;
  matchConfidence: number;
}

export interface PriceComparison {
  id: string;
  itemId: string;
  establishment: string;
  price: number;
  date: string;
  isBestPrice: boolean;
}

export type MatchStatus = 'READY_TO_RECONCILE' | 'OK' | 'IGNORED' | 'processing' | 'ready' | 'error';

export interface ImportedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: MatchStatus;
  type: 'credit' | 'debit';
  installment_number?: number;
  installment_total?: number;
}

export interface ReceiptItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  category_hint?: string;
  selected?: boolean;
  currency?: string;
}

export interface ExtractedReceipt {
  merchant: string;
  merchant_category?: string;
  date: string;
  total: number;
  currency?: string;
  items: ReceiptItem[];
}
