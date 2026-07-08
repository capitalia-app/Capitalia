import type { FinancialAccount } from '@/features/finance/lib/accounts';
import type { MovementType } from '@/features/finance/lib/import/types';

export type FinancialMetric = 'income' | 'expense' | 'savings' | 'balance';

export type MetricTransaction = {
  accountId: string;
  accountName: string;
  amount: number;
  description: string;
  direction: 'inflow' | 'outflow';
  movementType: MovementType;
};

export type MetricFilter = {
  metric: FinancialMetric;
  movementTypes: MovementType[];
  accountIds?: string[];
  direction?: 'inflow' | 'outflow';
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
      accountIds: getWealthBuildingAccountIds(accounts),
      direction: 'inflow',
      metric,
      movementTypes: ['investment', 'transfer']
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
    .reduce((total, transaction) => total + getSignedAmount(transaction), 0);
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
      savings[month] = (savings[month] ?? 0) + getSignedAmount(transaction);
    }
  });

  return {
    balance: income.map((monthlyIncome, month) =>
      calculateMonthlyBalance({
        expenses: expenses[month] ?? 0,
        income: monthlyIncome,
        savings: savings[month] ?? 0
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
  savings: number;
}) {
  return input.income + input.expenses - input.savings;
}

export function getSignedAmount(transaction: MetricTransaction) {
  const amount = Math.abs(transaction.amount);

  return transaction.direction === 'inflow' ? amount : -amount;
}

export function getWealthBuildingAccountIds(accounts: FinancialAccount[]) {
  return accounts.filter(isWealthBuildingAccount).map((account) => account.id);
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
