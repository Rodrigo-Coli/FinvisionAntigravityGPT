export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  is_approved: boolean;
  preferences?: {
    bottom_nav_items?: string[];
    show_bottom_nav?: boolean;
  };
  created_at: string;
}

export interface DashboardData {
  consolidatedBalance: number;
  netWorth: number;
  totalLiabilities?: number;
  totalAssets?: number;
  totalExpenses?: number;
  lastMonthExpenses?: number;
  netWorthGrowth?: number;
  creditCards: {
    brand: string;
    current: number;
    forecasted: number;
    limit?: number;
    last4?: string;
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
  projectedCashFlow?: CashFlowProjectionItem[];
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
  user_id?: string;
  card_id?: string;
  statement_id?: string;
  category_id?: string;
  is_manual?: boolean;
  source?: string;
  description: string;
  amount: number;
  date: string;
  type: TransactionType;
  accountId: string;
  accountName: string;
  category: string;
  subcategory?: string;
  isDeleted?: boolean;
  isReconciled?: boolean;
  metadata?: Record<string, any>;
  owner_name?: string; // --- NOVA ENTIDADE (PESSOAL/EMPRESA) ---

  // --- NOVOS CAMPOS (pagamentos) ---
  // Mantidos opcionais para não quebrar outras telas / dados antigos.
  isPaid?: boolean;          // true = pago / false = pendente
  paidAmount?: number;       // quanto já foi pago (parcial/total)
  paidAt?: string;           // quando quitou (ou último registro)
  parentId?: string | null;  // se for uma "diferença" gerada a partir de outra transação

  // --- RECONCILIAÇÃO / RECORRÊNCIA ---
  is_recurring?: boolean;
  recurrence_period?: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
  liability_id?: string;     // Link to a debt/liability
  is_amortization?: boolean; // True if this transaction pays off a liability
  recurrence_group_id?: string;
  is_installment?: boolean;
  installment_number?: number;
  installment_total?: number;
  installment_group_id?: string;
  is_incomplete?: boolean;    // Flag para dados legados que precisam de revisão
  document_id?: string;       // Link para anexo principal (legado)
  attachments?: Document[];   // Lista de múltiplos anexos
  notes?: string;
  tags?: string[];
}

export interface Document {
  id: string;
  user_id: string;
  bucket: string;
  path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  source: string;
  created_at: string;
}

export interface ReconcileItem {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  source: string;
  confidence: number;
  owner_name?: string;
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
  default_owner?: string;
  default_category?: string;
  default_subcategory?: string;
  invoices: {
    id: string;
    month: string;
    year: number;
    amount: number;
    status: 'PAID' | 'OPEN' | 'OVERDUE';
  }[];
}

export interface Entity {
  id: string;
  name: string;
  isArchived: boolean;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  type?: 'INCOME' | 'EXPENSE';
  created_at: string;
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
  owner_name?: string;
  category?: string;
  subcategory?: string;
  potential_duplicate?: boolean;
  duplicate_reason?: string;
  account_id?: string;
  accountId?: string;
  metadata?: any;
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

export type LiabilityType = 'MORTGAGE' | 'VEHICLE_FINANCING' | 'PERSONAL_LOAN' | 'CONSORTIUM' | 'CREDIT_CARD' | 'OTHER';

export interface Liability {
  id: string;
  name: string;
  type: LiabilityType;
  totalAmount: number;
  remainingBalance: number;
  interestRate?: number;
  linkedAssetId?: string;
  installmentAmount?: number;
  installmentsRemaining?: number;
  dueDay?: number;
  metadata?: any;
}

export interface BalloonPayment {
  month: number;
  year: number;
  amount: number;
}

export interface RealEstateLiability extends Liability {
  installments_count: number;
  balloon_payments: BalloonPayment[];
  indexation_rate: number; // Ex: IPCA or INCC yearly estimate
}

export interface CashFlowProjectionItem {
  date: string; // YYYY-MM
  label: string; // Ex: "Out/2026"
  startingBalance: number;
  projectedIncome: number;
  projectedExpense: number;
  recurringIncome: number;
  recurringExpense: number;
  liabilityPayments: number;
  balloonPayments: number;
  netCashFlow: number;
  endingBalance: number;
}

export interface Goal {
  id: string;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  color: string;
  deadline?: string;
  isCompleted: boolean;
}

export interface Budget {
  id: string;
  category: string;
  monthlyLimit: number;
  color: string;
  isActive: boolean;
  currentMonthSpent?: number; // computed client-side
}
