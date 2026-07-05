import {
  getCurrentWorkspace,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import type { MovementType } from '@/features/finance/lib/import/types';
import { supabase } from '@/shared/lib/supabase';

export type DashboardAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number;
};

export type DashboardTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  description: string;
  amount: number;
  currency: string;
  direction: 'inflow' | 'outflow';
  occurredAt: string;
  movementType: MovementType;
  transactionType: string;
  isReviewed: boolean;
};

export type DashboardSummary = {
  workspace: WorkspaceSummary;
  currency: string;
  netWorth: number;
  monthIncome: number;
  monthExpenses: number;
  monthInvested: number;
  monthTransfers: number;
  monthBalance: number;
  wealthBuildRate: number | null;
  accounts: DashboardAccount[];
  recentTransactions: DashboardTransaction[];
};

type AccountRecord = {
  id: string;
  name: string;
  currency: string;
};

type BalanceRecord = {
  account_id: string;
  balance: number | string;
  captured_at: string;
};

type TransactionRecord = {
  id: string;
  account_id: string;
  amount: number | string;
  currency: string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
  description: string;
  category_id: string | null;
  movement_type: MovementType;
  transaction_type: string;
  is_reviewed: boolean;
};

type BalanceTransactionRecord = {
  account_id: string;
  amount: number | string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
};

type MonthlyTransactionRecord = {
  amount: number | string;
  direction: 'inflow' | 'outflow';
  movement_type: MovementType | null;
};

type CategoryRecord = {
  id: string;
  name: string;
};

export async function getDashboardSummary() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const workspace = await getCurrentWorkspace();
  const { data: accounts, error: accountsError } = await supabase
    .from('financial_accounts')
    .select('id, name, currency')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .returns<AccountRecord[]>();

  if (accountsError) {
    throw accountsError;
  }

  const balances = await getLatestBalances(
    workspace.id,
    accounts.map((account) => account.id)
  );
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [monthTransactions, recentTransactions, balanceTransactions] = await Promise.all([
    getMonthlyTransactions(workspace.id, monthStart),
    getRecentTransactions(workspace.id),
    getBalanceTransactions(workspace.id, accounts, balances)
  ]);
  const categoryIds = recentTransactions
    .map((transaction) => transaction.category_id)
    .filter((categoryId): categoryId is string => Boolean(categoryId));
  const categoriesById = await getCategoriesById(categoryIds);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const monthIncome = sumByMovement(monthTransactions, 'income');
  const monthExpenses = sumByMovement(monthTransactions, 'expense');
  const monthInvested = sumByMovement(monthTransactions, 'investment');
  const monthTransfers = sumByMovement(monthTransactions, 'transfer');
  const monthBalance = monthIncome - monthExpenses;
  const accountBalances = accounts.map((account) => {
    const balance = balances.get(account.id);

    return {
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: getBalanceWithTransactions(balance, balanceTransactions, account.id)
    } satisfies DashboardAccount;
  });

  return {
    workspace,
    currency: workspace.baseCurrency,
    netWorth: accountBalances.reduce((total, account) => total + account.balance, 0),
    monthIncome,
    monthExpenses,
    monthInvested,
    monthTransfers,
    monthBalance,
    wealthBuildRate: monthIncome > 0 ? (monthBalance / monthIncome) * 100 : null,
    accounts: accountBalances,
    recentTransactions: recentTransactions.map((transaction) => ({
      accountId: transaction.account_id,
      accountName: accountsById.get(transaction.account_id)?.name ?? 'Cuenta',
      id: transaction.id,
      categoryId: transaction.category_id,
      categoryName: transaction.category_id
        ? (categoriesById.get(transaction.category_id)?.name ?? null)
        : null,
      description: transaction.description,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      direction: transaction.direction,
      isReviewed: transaction.is_reviewed,
      movementType: transaction.movement_type,
      occurredAt: transaction.occurred_at,
      transactionType: transaction.transaction_type
    }))
  } satisfies DashboardSummary;
}

async function getLatestBalances(workspaceId: string, accountIds: string[]) {
  if (!supabase || accountIds.length === 0) {
    return new Map<string, BalanceRecord>();
  }

  const { data, error } = await supabase
    .from('account_balances')
    .select('account_id, balance, captured_at')
    .eq('workspace_id', workspaceId)
    .in('account_id', accountIds)
    .order('captured_at', { ascending: false })
    .returns<BalanceRecord[]>();

  if (error) {
    throw error;
  }

  const balances = new Map<string, BalanceRecord>();

  data.forEach((balance) => {
    if (!balances.has(balance.account_id)) {
      balances.set(balance.account_id, balance);
    }
  });

  return balances;
}

async function getMonthlyTransactions(workspaceId: string, monthStart: Date) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, direction, movement_type')
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .gte('occurred_at', monthStart.toISOString())
    .returns<MonthlyTransactionRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function getRecentTransactions(workspaceId: string) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, account_id, amount, currency, direction, occurred_at, description, category_id, movement_type, transaction_type, is_reviewed'
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .order('occurred_at', { ascending: false })
    .limit(10)
    .returns<TransactionRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function getCategoriesById(categoryIds: string[]) {
  if (!supabase || categoryIds.length === 0) {
    return new Map<string, CategoryRecord>();
  }

  const uniqueCategoryIds = [...new Set(categoryIds)];
  const { data, error } = await supabase
    .from('transaction_categories')
    .select('id, name')
    .in('id', uniqueCategoryIds)
    .returns<CategoryRecord[]>();

  if (error) {
    throw error;
  }

  return new Map(data.map((category) => [category.id, category]));
}

async function getBalanceTransactions(
  workspaceId: string,
  accounts: AccountRecord[],
  balances: Map<string, BalanceRecord>
) {
  if (!supabase || accounts.length === 0) {
    return [];
  }

  const query = supabase
    .from('transactions')
    .select('account_id, amount, direction, occurred_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .in(
      'account_id',
      accounts.map((account) => account.id)
    );

  if (balances.size > 0) {
    const oldestBalanceDate = [...balances.values()].reduce((oldest, balance) => {
      const capturedAt = new Date(balance.captured_at);

      return capturedAt < oldest ? capturedAt : oldest;
    }, new Date());

    query.gt('occurred_at', oldestBalanceDate.toISOString());
  }

  const { data, error } = await query.returns<BalanceTransactionRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

function getBalanceWithTransactions(
  balance: BalanceRecord | undefined,
  transactions: BalanceTransactionRecord[],
  accountId: string
) {
  const capturedAt = balance ? new Date(balance.captured_at) : null;
  const delta = transactions
    .filter(
      (transaction) =>
        transaction.account_id === accountId &&
        (!capturedAt || new Date(transaction.occurred_at) > capturedAt)
    )
    .reduce(
      (total, transaction) =>
        total +
        (transaction.direction === 'inflow'
          ? Number(transaction.amount)
          : -Number(transaction.amount)),
      0
    );

  return Number(balance?.balance ?? 0) + delta;
}

function sumByMovement(
  transactions: MonthlyTransactionRecord[],
  movementType: MovementType
) {
  return transactions
    .filter(
      (transaction) =>
        (transaction.movement_type ?? fallbackMovementType(transaction.direction)) ===
        movementType
    )
    .reduce((total, transaction) => total + Number(transaction.amount), 0);
}

function fallbackMovementType(direction: MonthlyTransactionRecord['direction']) {
  return direction === 'inflow' ? 'income' : 'expense';
}
