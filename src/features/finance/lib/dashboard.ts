import {
  getCurrentWorkspace,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import { supabase } from '@/shared/lib/supabase';

export type DashboardAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number;
};

export type DashboardTransaction = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  direction: 'inflow' | 'outflow';
  occurredAt: string;
  transactionType: string;
};

export type DashboardSummary = {
  workspace: WorkspaceSummary;
  currency: string;
  netWorth: number;
  monthIncome: number;
  monthExpenses: number;
  monthBalance: number;
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
  transaction_type: string;
};

export async function getDashboardSummary() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const workspace = await getCurrentWorkspace();
  const [
    { data: accounts, error: accountsError },
    { data: transactions, error: transactionsError }
  ] = await Promise.all([
    supabase
      .from('financial_accounts')
      .select('id, name, currency')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .returns<AccountRecord[]>(),
    supabase
      .from('transactions')
      .select(
        'id, account_id, amount, currency, direction, occurred_at, description, transaction_type'
      )
      .eq('workspace_id', workspace.id)
      .eq('status', 'posted')
      .order('occurred_at', { ascending: false })
      .returns<TransactionRecord[]>()
  ]);

  if (accountsError) {
    throw accountsError;
  }

  if (transactionsError) {
    throw transactionsError;
  }

  const balances = await getLatestBalances(
    workspace.id,
    accounts.map((account) => account.id)
  );
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthTransactions = transactions.filter(
    (transaction) => new Date(transaction.occurred_at) >= monthStart
  );
  const monthIncome = sumTransactions(monthTransactions, 'inflow');
  const monthExpenses = sumTransactions(monthTransactions, 'outflow');
  const accountBalances = accounts.map((account) => {
    const balance = balances.get(account.id);

    return {
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: balance ? getBalanceWithTransactions(balance, transactions, account.id) : 0
    } satisfies DashboardAccount;
  });

  return {
    workspace,
    currency: workspace.baseCurrency,
    netWorth: accountBalances.reduce((total, account) => total + account.balance, 0),
    monthIncome,
    monthExpenses,
    monthBalance: monthIncome - monthExpenses,
    accounts: accountBalances,
    recentTransactions: transactions.slice(0, 6).map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      direction: transaction.direction,
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

function getBalanceWithTransactions(
  balance: BalanceRecord,
  transactions: TransactionRecord[],
  accountId: string
) {
  const capturedAt = new Date(balance.captured_at);
  const delta = transactions
    .filter(
      (transaction) =>
        transaction.account_id === accountId &&
        new Date(transaction.occurred_at) > capturedAt
    )
    .reduce(
      (total, transaction) =>
        total +
        (transaction.direction === 'inflow'
          ? Number(transaction.amount)
          : -Number(transaction.amount)),
      0
    );

  return Number(balance.balance) + delta;
}

function sumTransactions(
  transactions: TransactionRecord[],
  direction: TransactionRecord['direction']
) {
  return transactions
    .filter((transaction) => transaction.direction === direction)
    .reduce((total, transaction) => total + Number(transaction.amount), 0);
}
