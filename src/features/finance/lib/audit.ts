import { getCurrentWorkspace } from '@/features/finance/lib/accounts';
import {
  getLatestPatrimonialSnapshot,
  listFinancialContainers,
  type FinancialContainer,
  type PatrimonialSnapshot
} from '@/features/finance/lib/snapshots';
import { supabase } from '@/shared/lib/supabase';

export type AuditAccountKind = 'cash' | 'investment_platform' | 'debt' | 'other';

export type AuditAccountRow = {
  accountId: string;
  accountName: string;
  accountType: string;
  kind: AuditAccountKind;
  currency: string;
  initialBalance: number;
  initialBalanceSource: string;
  income: number;
  expenses: number;
  outgoingTransfers: number;
  incomingTransfers: number;
  assetPurchases: number;
  movementDelta: number;
  calculatedBalance: number;
  latestImportedBalance: number | null;
  latestImportedBalanceDate: string | null;
  difference: number | null;
  formula: string;
};

export type AuditSuspiciousMovement = {
  id: string;
  date: string;
  accountName: string;
  description: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  reason: string;
};

export type AuditPatrimonyBreakdown = {
  cashAccounts: number;
  investmentPlatforms: number;
  financialAssets: number;
  debts: number;
  currentPatrimony: number;
  initialNetWorth: number | null;
  initialGrossWorth: number | null;
  initialDebt: number | null;
};

export type AccountingAuditSummary = {
  year: number;
  currency: string;
  accounts: AuditAccountRow[];
  containers: FinancialContainer[];
  patrimony: AuditPatrimonyBreakdown;
  suspiciousMovements: AuditSuspiciousMovement[];
  logs: string[];
};

type AccountRecord = {
  id: string;
  name: string;
  currency: string;
  type: string;
};

type BalanceRecord = {
  account_id: string;
  balance: number | string;
  captured_at: string;
  source: string;
};

type TransactionRecord = {
  id: string;
  account_id: string;
  amount: number | string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
  description: string;
  category_id: string | null;
  movement_type: string | null;
  transaction_type: string | null;
  linked_transaction_id: string | null;
  transfer_group_id: string | null;
};

export async function getAccountingAuditSummary(year: number) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const workspace = await getCurrentWorkspace();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const [accounts, balances, transactions, snapshot, containers] = await Promise.all([
    getAccounts(workspace.id),
    getAccountBalances(workspace.id),
    getYearTransactions(workspace.id, yearStart, yearEnd),
    getLatestPatrimonialSnapshot(workspace.id),
    listFinancialContainers(workspace.id)
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const balancesByAccount = groupBalancesByAccount(balances);
  const transactionsByAccount = groupTransactionsByAccount(transactions);
  const linkedTransactionsById = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );
  const rows = accounts.map((account) =>
    buildAuditAccountRow({
      account,
      balances: balancesByAccount.get(account.id) ?? [],
      snapshot,
      transactions: transactionsByAccount.get(account.id) ?? [],
      yearStart
    })
  );
  const patrimony = buildPatrimonyBreakdown({ containers, rows, snapshot });

  return {
    accounts: rows,
    containers,
    currency: workspace.baseCurrency,
    logs: [
      `Workspace: ${workspace.name}`,
      `Año auditado: ${year}`,
      `Cuentas leidas: ${accounts.length}`,
      `Movimientos del año: ${transactions.length}`,
      `Balances historicos leidos: ${balances.length}`,
      `Snapshot patrimonial: ${snapshot ? snapshot.snapshotDate : 'no existe'}`,
      'Los saldos system=0 se muestran, pero no se usan como saldo inicial contable.'
    ],
    patrimony,
    suspiciousMovements: findSuspiciousMovements({
      accountsById,
      linkedTransactionsById,
      transactions
    }),
    year
  } satisfies AccountingAuditSummary;
}

async function getAccounts(workspaceId: string) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, name, currency, type')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .returns<AccountRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function getAccountBalances(workspaceId: string) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('account_balances')
    .select('account_id, balance, captured_at, source')
    .eq('workspace_id', workspaceId)
    .order('captured_at', { ascending: true })
    .returns<BalanceRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function getYearTransactions(workspaceId: string, yearStart: Date, yearEnd: Date) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, account_id, amount, direction, occurred_at, description, category_id, movement_type, transaction_type, linked_transaction_id, transfer_group_id'
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .gte('occurred_at', yearStart.toISOString())
    .lte('occurred_at', yearEnd.toISOString())
    .order('occurred_at', { ascending: true })
    .returns<TransactionRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

function buildAuditAccountRow(input: {
  account: AccountRecord;
  balances: BalanceRecord[];
  snapshot: PatrimonialSnapshot | null;
  transactions: TransactionRecord[];
  yearStart: Date;
}) {
  const initialBalance = getInitialBalance({
    accountId: input.account.id,
    balances: input.balances,
    snapshot: input.snapshot,
    yearStart: input.yearStart
  });
  const latestImportedBalance = getLatestImportedBalance(input.balances);
  const income = sumTransactions(input.transactions, isIncomeTransaction);
  const expenses = sumTransactions(input.transactions, isExpenseTransaction);
  const outgoingTransfers = sumTransactions(input.transactions, isOutgoingTransfer);
  const incomingTransfers = sumTransactions(input.transactions, isIncomingTransfer);
  const assetPurchases = sumTransactions(input.transactions, isAssetPurchase);
  const movementDelta =
    income - expenses - outgoingTransfers + incomingTransfers - assetPurchases;
  const calculatedBalance = initialBalance.amount + movementDelta;
  const difference = latestImportedBalance
    ? calculatedBalance - latestImportedBalance.amount
    : null;

  return {
    accountId: input.account.id,
    accountName: input.account.name,
    accountType: input.account.type,
    assetPurchases,
    calculatedBalance,
    currency: input.account.currency,
    difference,
    expenses,
    formula:
      'saldo final = saldo inicial + ingresos - gastos - transferencias salientes + transferencias entrantes - compras de activos',
    income,
    incomingTransfers,
    initialBalance: initialBalance.amount,
    initialBalanceSource: initialBalance.source,
    kind: getAccountKind(input.account),
    latestImportedBalance: latestImportedBalance?.amount ?? null,
    latestImportedBalanceDate: latestImportedBalance?.capturedAt ?? null,
    movementDelta,
    outgoingTransfers
  } satisfies AuditAccountRow;
}

function getInitialBalance(input: {
  accountId: string;
  balances: BalanceRecord[];
  snapshot: PatrimonialSnapshot | null;
  yearStart: Date;
}) {
  const eligibleBalance = [...input.balances]
    .filter(
      (balance) =>
        balance.source !== 'system' && new Date(balance.captured_at) <= input.yearStart
    )
    .sort(
      (left, right) =>
        new Date(right.captured_at).getTime() - new Date(left.captured_at).getTime()
    )[0];

  if (eligibleBalance) {
    return {
      amount: Number(eligibleBalance.balance),
      source: `${eligibleBalance.source} ${eligibleBalance.captured_at.slice(0, 10)}`
    };
  }

  const snapshotItem = input.snapshot?.items.find(
    (item) => item.linkedAccountId === input.accountId
  );

  if (snapshotItem) {
    return {
      amount: snapshotItem.value,
      source: `snapshot ${input.snapshot?.snapshotDate ?? ''}`.trim()
    };
  }

  return {
    amount: 0,
    source: 'sin saldo inicial'
  };
}

function getLatestImportedBalance(balances: BalanceRecord[]) {
  const balance = [...balances]
    .filter((candidate) => candidate.source !== 'system')
    .sort(
      (left, right) =>
        new Date(right.captured_at).getTime() - new Date(left.captured_at).getTime()
    )[0];

  return balance
    ? {
        amount: Number(balance.balance),
        capturedAt: balance.captured_at
      }
    : null;
}

function buildPatrimonyBreakdown(input: {
  rows: AuditAccountRow[];
  containers: FinancialContainer[];
  snapshot: PatrimonialSnapshot | null;
}) {
  const cashAccounts = input.rows
    .filter((row) => row.kind === 'cash')
    .reduce((total, row) => total + row.calculatedBalance, 0);
  const investmentPlatforms = input.rows
    .filter((row) => row.kind === 'investment_platform')
    .reduce((total, row) => total + row.calculatedBalance, 0);
  const financialAssets = input.containers.reduce(
    (total, container) =>
      total +
      container.assets
        .filter((asset) => asset.assetType !== 'cash' && asset.assetType !== 'liability')
        .reduce((assetTotal, asset) => assetTotal + asset.manualValue, 0),
    0
  );
  const debts = input.containers.reduce(
    (total, container) =>
      total +
      container.assets
        .filter((asset) => asset.assetType === 'liability')
        .reduce((assetTotal, asset) => assetTotal + Math.abs(asset.manualValue), 0),
    0
  );

  return {
    cashAccounts,
    currentPatrimony: cashAccounts + investmentPlatforms + financialAssets - debts,
    debts,
    financialAssets,
    initialDebt: input.snapshot?.initialDebt ?? null,
    initialGrossWorth: input.snapshot?.initialGrossWorth ?? null,
    initialNetWorth: input.snapshot?.initialNetWorth ?? null,
    investmentPlatforms
  } satisfies AuditPatrimonyBreakdown;
}

function findSuspiciousMovements(input: {
  accountsById: Map<string, AccountRecord>;
  linkedTransactionsById: Map<string, TransactionRecord>;
  transactions: TransactionRecord[];
}) {
  const suspicious: AuditSuspiciousMovement[] = [];
  const duplicates = findPossibleDuplicateIds(input.transactions);

  input.transactions.forEach((transaction) => {
    const accountName = input.accountsById.get(transaction.account_id)?.name ?? 'Cuenta';

    if (!transaction.category_id) {
      suspicious.push(mapSuspicious(transaction, accountName, 'Sin categoria'));
    }

    if (transaction.movement_type === 'transfer' && !transaction.linked_transaction_id) {
      suspicious.push(
        mapSuspicious(transaction, accountName, 'Transferencia sin origen/destino')
      );
    }

    if (
      transaction.movement_type === 'investment' &&
      !isInvestmentAccount(input.accountsById.get(transaction.account_id))
    ) {
      suspicious.push(
        mapSuspicious(transaction, accountName, 'Inversion sin plataforma destino clara')
      );
    }

    if (duplicates.has(transaction.id)) {
      suspicious.push(
        mapSuspicious(transaction, accountName, 'Importe duplicado posible')
      );
    }

    if (
      transaction.movement_type === 'transfer' &&
      transaction.linked_transaction_id &&
      !input.linkedTransactionsById.has(transaction.linked_transaction_id)
    ) {
      suspicious.push(
        mapSuspicious(transaction, accountName, 'Transferencia enlazada fuera del año')
      );
    }
  });

  return suspicious.slice(0, 80);
}

function mapSuspicious(
  transaction: TransactionRecord,
  accountName: string,
  reason: string
) {
  return {
    accountName,
    amount: Number(transaction.amount),
    date: transaction.occurred_at,
    description: transaction.description,
    direction: transaction.direction,
    id: `${transaction.id}-${reason}`,
    reason
  } satisfies AuditSuspiciousMovement;
}

function findPossibleDuplicateIds(transactions: TransactionRecord[]) {
  const groups = new Map<string, TransactionRecord[]>();

  transactions.forEach((transaction) => {
    const key = [
      transaction.account_id,
      transaction.occurred_at.slice(0, 10),
      Number(transaction.amount).toFixed(2),
      transaction.direction
    ].join('|');

    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  });

  return new Set(
    [...groups.values()]
      .filter((group) => group.length > 1)
      .flatMap((group) => group.map((transaction) => transaction.id))
  );
}

function sumTransactions(
  transactions: TransactionRecord[],
  predicate: (transaction: TransactionRecord) => boolean
) {
  return transactions
    .filter(predicate)
    .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0);
}

function isIncomeTransaction(transaction: TransactionRecord) {
  return transaction.movement_type === 'income' && transaction.direction === 'inflow';
}

function isExpenseTransaction(transaction: TransactionRecord) {
  return transaction.movement_type === 'expense' && transaction.direction === 'outflow';
}

function isOutgoingTransfer(transaction: TransactionRecord) {
  return transaction.movement_type === 'transfer' && transaction.direction === 'outflow';
}

function isIncomingTransfer(transaction: TransactionRecord) {
  return transaction.movement_type === 'transfer' && transaction.direction === 'inflow';
}

function isAssetPurchase(transaction: TransactionRecord) {
  return (
    (transaction.movement_type === 'investment' ||
      transaction.transaction_type === 'asset_purchase') &&
    transaction.direction === 'outflow'
  );
}

function getAccountKind(account: AccountRecord): AuditAccountKind {
  if (account.type === 'brokerage' || account.type === 'crypto_wallet') {
    return 'investment_platform';
  }

  if (account.type === 'cash' || account.type === 'checking') {
    return 'cash';
  }

  return 'other';
}

function isInvestmentAccount(account: AccountRecord | undefined) {
  return account ? getAccountKind(account) === 'investment_platform' : false;
}

function groupBalancesByAccount(balances: BalanceRecord[]) {
  const grouped = new Map<string, BalanceRecord[]>();

  balances.forEach((balance) => {
    grouped.set(balance.account_id, [
      ...(grouped.get(balance.account_id) ?? []),
      balance
    ]);
  });

  return grouped;
}

function groupTransactionsByAccount(transactions: TransactionRecord[]) {
  const grouped = new Map<string, TransactionRecord[]>();

  transactions.forEach((transaction) => {
    grouped.set(transaction.account_id, [
      ...(grouped.get(transaction.account_id) ?? []),
      transaction
    ]);
  });

  return grouped;
}
