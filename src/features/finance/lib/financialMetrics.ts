import type { FinancialAccount } from '@/features/finance/lib/accounts';
import type { MovementType } from '@/features/finance/lib/import/types';

export type FinancialMetric = 'income' | 'expense' | 'savings' | 'balance';

export type MetricTransaction = {
  accountId: string;
  accountName: string;
  amount: number;
  categoryId?: string | null;
  categoryName?: string | null;
  description: string;
  direction: 'inflow' | 'outflow';
  linkedTransactionId?: string | null;
  movementType: MovementType;
  transactionType?: string | null;
};

export type MetricFilter = {
  metric: FinancialMetric;
  movementTypes: MovementType[];
  accountIds?: string[];
  direction?: 'inflow' | 'outflow';
  wealthAccountIds?: string[];
  wealthKeywords?: string[];
};

export type MonthlyFinancialMetrics = {
  income: number[];
  expenses: number[];
  savings: number[];
  balance: number[];
};

export function buildMetricFilter(metric: FinancialMetric, accounts: FinancialAccount[]) {
  if (metric === 'income') {
    return {
      direction: 'inflow',
      metric,
      movementTypes: ['income']
    } satisfies MetricFilter;
  }

  if (metric === 'expense') {
    return {
      direction: 'outflow',
      metric,
      movementTypes: ['expense']
    } satisfies MetricFilter;
  }

  if (metric === 'savings') {
    return {
      metric,
      movementTypes: ['transfer'],
      wealthAccountIds: getWealthBuildingAccountIds(accounts),
      wealthKeywords: getWealthBuildingKeywords(accounts)
    } satisfies MetricFilter;
  }

  return {
    metric,
    movementTypes: ['income', 'expense']
  } satisfies MetricFilter;
}

export function matchesMetricFilter(
  transaction: MetricTransaction,
  filter: MetricFilter
) {
  if (filter.metric === 'savings') {
    return matchesSavingsMetric(transaction, filter);
  }

  if (filter.metric === 'income' && !isRealIncome(transaction)) {
    return false;
  }

  if (filter.metric === 'expense' && !isRealExpense(transaction)) {
    return false;
  }

  if (!filter.movementTypes.includes(transaction.movementType)) {
    return false;
  }

  if (filter.accountIds && !filter.accountIds.includes(transaction.accountId)) {
    return false;
  }

  if (filter.direction && transaction.direction !== filter.direction) {
    return false;
  }

  return true;
}

export function sumMetricTransactions(
  transactions: MetricTransaction[],
  filter: MetricFilter
) {
  return transactions
    .filter((transaction) => matchesMetricFilter(transaction, filter))
    .reduce((total, transaction) => total + getMetricAmount(transaction, filter), 0);
}

export function calculateMonthlyFinancialMetrics<TTransaction extends MetricTransaction>(
  transactions: TTransaction[],
  accounts: FinancialAccount[],
  getMonth: (transaction: TTransaction) => number
) {
  const incomeFilter = buildMetricFilter('income', accounts);
  const expenseFilter = buildMetricFilter('expense', accounts);
  const savingsFilter = buildMetricFilter('savings', accounts);
  const income = createEmptyMonths();
  const expenses = createEmptyMonths();
  const savings = createEmptyMonths();

  transactions.forEach((transaction) => {
    const month = getMonth(transaction);

    if (month < 0 || month > 11) {
      return;
    }

    if (matchesMetricFilter(transaction, incomeFilter)) {
      income[month] = (income[month] ?? 0) + getSignedAmount(transaction);
    }

    if (matchesMetricFilter(transaction, expenseFilter)) {
      expenses[month] = (expenses[month] ?? 0) + getSignedAmount(transaction);
    }

    if (matchesMetricFilter(transaction, savingsFilter)) {
      savings[month] =
        (savings[month] ?? 0) + getMetricAmount(transaction, savingsFilter);
    }
  });

  return {
    balance: income.map((monthlyIncome, month) =>
      calculateMonthlyBalance({
        expenses: expenses[month] ?? 0,
        income: monthlyIncome
      })
    ),
    expenses,
    income,
    savings
  } satisfies MonthlyFinancialMetrics;
}

export function calculateMonthlyBalance(input: {
  income: number;
  expenses: number;
  savings?: number;
}) {
  return input.income + input.expenses;
}

export function getSignedAmount(transaction: MetricTransaction) {
  const amount = Math.abs(transaction.amount);

  return transaction.direction === 'inflow' ? amount : -amount;
}

export function isRealIncome(transaction: MetricTransaction) {
  return (
    transaction.movementType === 'income' &&
    transaction.direction === 'inflow' &&
    transaction.transactionType !== 'investment_transfer' &&
    transaction.transactionType !== 'asset_purchase' &&
    !transaction.linkedTransactionId
  );
}

export function isRealExpense(transaction: MetricTransaction) {
  return (
    transaction.movementType === 'expense' &&
    transaction.direction === 'outflow' &&
    transaction.transactionType !== 'investment_transfer' &&
    transaction.transactionType !== 'asset_purchase' &&
    !transaction.linkedTransactionId
  );
}

export function isVeramarIncome(transaction: MetricTransaction) {
  return isRealIncome(transaction) && isVeramarTransaction(transaction);
}

export function isVeramarExpense(transaction: MetricTransaction) {
  return isRealExpense(transaction) && isVeramarTransaction(transaction);
}

export function isVeramarTransaction(transaction: MetricTransaction) {
  const normalizedText = normalizeText(
    `${transaction.description} ${transaction.categoryName ?? ''} ${transaction.accountName}`
  );

  return normalizedText.includes('veramar') || normalizedText.includes('booking');
}

export function getMetricAmount(transaction: MetricTransaction, filter: MetricFilter) {
  if (filter.metric === 'savings') {
    return Math.abs(transaction.amount);
  }

  return getSignedAmount(transaction);
}

export function getWealthBuildingAccountIds(accounts: FinancialAccount[]) {
  return accounts.filter(isWealthBuildingAccount).map((account) => account.id);
}

function matchesSavingsMetric(transaction: MetricTransaction, filter: MetricFilter) {
  if (!filter.movementTypes.includes(transaction.movementType)) {
    return false;
  }

  if (transaction.transactionType === 'asset_purchase') {
    return false;
  }

  const wealthAccountIds = filter.wealthAccountIds ?? [];
  const isWealthAccount = wealthAccountIds.includes(transaction.accountId);

  if (transaction.direction === 'inflow' && isWealthAccount) {
    return true;
  }

  if (transaction.direction !== 'outflow' || transaction.linkedTransactionId) {
    return false;
  }

  const normalizedText = normalizeText(
    `${transaction.description} ${transaction.accountName}`
  );

  return (filter.wealthKeywords ?? []).some((keyword) =>
    normalizedText.includes(keyword)
  );
}

function getWealthBuildingKeywords(accounts: FinancialAccount[]) {
  const systemKeywords = [
    'ahorro',
    'broker',
    'inversion',
    'investment',
    'wallet',
    'myinvestor',
    'binance',
    'ledger',
    'coinbase',
    'trade republic',
    'trading 212',
    'kraken'
  ];
  const accountKeywords = accounts
    .filter(isWealthBuildingAccount)
    .flatMap((account) => [account.name, account.institutionName])
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeText);

  return [...new Set([...systemKeywords.map(normalizeText), ...accountKeywords])];
}

function isWealthBuildingAccount(account: FinancialAccount) {
  if (account.type === 'brokerage' || account.type === 'crypto_wallet') {
    return true;
  }

  const normalizedText = normalizeText(
    `${account.name} ${account.institutionName} ${account.type}`
  );

  return [
    'ahorro',
    'broker',
    'inversion',
    'investment',
    'wallet',
    'myinvestor',
    'binance',
    'ledger',
    'coinbase'
  ].some((keyword) => normalizedText.includes(keyword));
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function createEmptyMonths() {
  return Array.from({ length: 12 }, () => 0);
}
