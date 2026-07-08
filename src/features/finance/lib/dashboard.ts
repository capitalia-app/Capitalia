import {
  getCurrentWorkspace,
  type FinancialAccount,
  type FinancialAccountType,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import type { MovementType } from '@/features/finance/lib/import/types';
import {
  getLatestPatrimonialSnapshot,
  listFinancialContainers,
  type FinancialContainer,
  type PatrimonialSnapshot
} from '@/features/finance/lib/snapshots';
import {
  calculateMonthlyFinancialMetrics,
  sumMetricTransactions,
  buildMetricFilter,
  type MetricTransaction
} from '@/features/finance/lib/financialMetrics';
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
  transferGroupId: string | null;
  linkedTransactionId: string | null;
  linkedAccountName: string | null;
  counterpartyContainerId: string | null;
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
  snapshot: PatrimonialSnapshot | null;
  initialNetWorth: number | null;
  initialGrossWorth: number | null;
  initialDebt: number | null;
  incomeSinceStart: number;
  expensesSinceStart: number;
  investedSinceStart: number;
  transfersSinceStart: number;
  estimatedNetWorth: number;
  containers: FinancialContainer[];
  accounts: DashboardAccount[];
  recentTransactions: DashboardTransaction[];
};

type AccountRecord = {
  id: string;
  name: string;
  currency: string;
  type: FinancialAccountType;
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
  transfer_group_id: string | null;
  linked_transaction_id: string | null;
  counterparty_container_id: string | null;
};

type BalanceTransactionRecord = {
  account_id: string;
  amount: number | string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
};

type MonthlyTransactionRecord = {
  account_id: string;
  amount: number | string;
  description: string;
  direction: 'inflow' | 'outflow';
  linked_transaction_id: string | null;
  movement_type: MovementType | null;
  transaction_type: string | null;
};

type CategoryRecord = {
  id: string;
  name: string;
};

type LinkedTransactionRecord = {
  id: string;
  account_id: string;
};

export async function getDashboardSummary() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const workspace = await getCurrentWorkspace();
  const { data: accounts, error: accountsError } = await supabase
    .from('financial_accounts')
    .select('id, name, currency, type')
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
  const [snapshot, containers] = await Promise.all([
    getLatestPatrimonialSnapshot(workspace.id),
    listFinancialContainers(workspace.id)
  ]);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [monthTransactions, startTransactions, recentTransactions, balanceTransactions] =
    await Promise.all([
      getTransactionsFrom(workspace.id, monthStart),
      snapshot
        ? getTransactionsFrom(workspace.id, snapshot.snapshotDate)
        : Promise.resolve([]),
      getRecentTransactions(workspace.id),
      getBalanceTransactions(workspace.id, accounts, balances)
    ]);
  const categoryIds = recentTransactions
    .map((transaction) => transaction.category_id)
    .filter((categoryId): categoryId is string => Boolean(categoryId));
  const categoriesById = await getCategoriesById(categoryIds);
  const linkedTransactionsById = await getLinkedTransactionsById(
    recentTransactions
      .map((transaction) => transaction.linked_transaction_id)
      .filter((transactionId): transactionId is string => Boolean(transactionId))
  );
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const metricAccounts = accounts.map(mapAccountRecordToMetricAccount);
  const monthMetricTransactions = monthTransactions.map((transaction) =>
    mapMonthlyTransactionToMetricTransaction(transaction, accountsById)
  );
  const startMetricTransactions = startTransactions.map((transaction) =>
    mapMonthlyTransactionToMetricTransaction(transaction, accountsById)
  );
  const monthMetrics = calculateMonthlyFinancialMetrics(
    monthMetricTransactions,
    metricAccounts,
    () => now.getUTCMonth()
  );
  const monthIndex = now.getUTCMonth();
  const monthIncome = monthMetrics.income[monthIndex] ?? 0;
  const monthExpenses = monthMetrics.expenses[monthIndex] ?? 0;
  const monthInvested = monthMetrics.savings[monthIndex] ?? 0;
  const monthTransfers = sumMetricTransactions(
    monthMetricTransactions,
    buildMetricFilter('savings', metricAccounts)
  );
  const monthBalance = monthMetrics.balance[monthIndex] ?? 0;
  const incomeSinceStart = sumMetricTransactions(
    startMetricTransactions,
    buildMetricFilter('income', metricAccounts)
  );
  const expensesSinceStart = sumMetricTransactions(
    startMetricTransactions,
    buildMetricFilter('expense', metricAccounts)
  );
  const investedSinceStart = sumMetricTransactions(
    startMetricTransactions,
    buildMetricFilter('savings', metricAccounts)
  );
  const transfersSinceStart = investedSinceStart;
  const accountBalances = accounts.map((account) => {
    const balance = balances.get(account.id);

    return {
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: getBalanceWithTransactions(balance, balanceTransactions, account.id)
    } satisfies DashboardAccount;
  });

  const accountNetWorth = accountBalances.reduce(
    (total, account) => total + account.balance,
    0
  );
  const containerNetWorth = containers.reduce(
    (total, container) => total + container.totalValue,
    0
  );
  const estimatedNetWorth = snapshot
    ? snapshot.initialNetWorth + incomeSinceStart - expensesSinceStart
    : containerNetWorth || accountNetWorth;

  return {
    workspace,
    currency: workspace.baseCurrency,
    netWorth: estimatedNetWorth,
    monthIncome,
    monthExpenses,
    monthInvested,
    monthTransfers,
    monthBalance,
    wealthBuildRate: monthIncome > 0 ? (monthBalance / monthIncome) * 100 : null,
    snapshot,
    initialNetWorth: snapshot?.initialNetWorth ?? null,
    initialGrossWorth: snapshot?.initialGrossWorth ?? null,
    initialDebt: snapshot?.initialDebt ?? null,
    incomeSinceStart,
    expensesSinceStart,
    investedSinceStart,
    transfersSinceStart,
    estimatedNetWorth,
    containers,
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
      transactionType: transaction.transaction_type,
      transferGroupId: transaction.transfer_group_id,
      linkedTransactionId: transaction.linked_transaction_id,
      linkedAccountName: transaction.linked_transaction_id
        ? (accountsById.get(
            linkedTransactionsById.get(transaction.linked_transaction_id)?.account_id ??
              ''
          )?.name ?? null)
        : null,
      counterpartyContainerId: transaction.counterparty_container_id
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

async function getTransactionsFrom(workspaceId: string, fromDate: Date | string) {
  if (!supabase) {
    return [];
  }

  const fromIso =
    typeof fromDate === 'string' ? `${fromDate}T00:00:00.000Z` : fromDate.toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'account_id, amount, direction, movement_type, description, transaction_type, linked_transaction_id'
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .gte('occurred_at', fromIso)
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
      'id, account_id, amount, currency, direction, occurred_at, description, category_id, movement_type, transaction_type, is_reviewed, transfer_group_id, linked_transaction_id, counterparty_container_id'
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

async function getLinkedTransactionsById(transactionIds: string[]) {
  if (!supabase || transactionIds.length === 0) {
    return new Map<string, LinkedTransactionRecord>();
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('id, account_id')
    .in('id', [...new Set(transactionIds)])
    .returns<LinkedTransactionRecord[]>();

  if (error) {
    throw error;
  }

  return new Map(data.map((transaction) => [transaction.id, transaction]));
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

function fallbackMovementType(direction: MonthlyTransactionRecord['direction']) {
  return direction === 'inflow' ? 'income' : 'expense';
}

function mapAccountRecordToMetricAccount(account: AccountRecord) {
  return {
    balance: null,
    balanceCapturedAt: null,
    currency: account.currency,
    id: account.id,
    institutionName: '',
    name: account.name,
    type: account.type
  } satisfies FinancialAccount;
}

function mapMonthlyTransactionToMetricTransaction(
  transaction: MonthlyTransactionRecord,
  accountsById: Map<string, AccountRecord>
) {
  const account = accountsById.get(transaction.account_id);

  return {
    accountId: transaction.account_id,
    accountName: account?.name ?? 'Cuenta',
    amount: Number(transaction.amount),
    description: transaction.description,
    direction: transaction.direction,
    linkedTransactionId: transaction.linked_transaction_id,
    movementType:
      transaction.movement_type ?? fallbackMovementType(transaction.direction),
    transactionType: transaction.transaction_type
  } satisfies MetricTransaction;
}
