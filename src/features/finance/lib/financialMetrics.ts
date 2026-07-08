import type { FinancialAccount } from '@/features/finance/lib/accounts';
import type { MovementType } from '@/features/finance/lib/import/types';

export type FinancialMetric = 'income' | 'expense' | 'savings' | 'balance';

export type MetricTransaction = {
  accountId: string;
  accountName: string;
  amount: number;
  description: string;
  movementType: MovementType;
};

export type MetricFilter = {
  metric: FinancialMetric;
  movementTypes: MovementType[];
  accountIds?: string[];
  amountSign?: 'positive' | 'negative';
};

export function buildMetricFilter(metric: FinancialMetric, accounts: FinancialAccount[]) {
  if (metric === 'income') {
    return {
      amountSign: 'positive',
      metric,
      movementTypes: ['income']
    } satisfies MetricFilter;
  }

  if (metric === 'expense') {
    return {
      amountSign: 'negative',
      metric,
      movementTypes: ['expense']
    } satisfies MetricFilter;
  }

  if (metric === 'savings') {
    return {
      accountIds: getWealthBuildingAccountIds(accounts),
      amountSign: 'positive',
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

  if (filter.amountSign === 'positive' && transaction.amount <= 0) {
    return false;
  }

  if (filter.amountSign === 'negative' && transaction.amount >= 0) {
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
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function calculateMonthlyBalance(input: { income: number; expenses: number }) {
  return input.income + input.expenses;
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
