import { getCurrentWorkspace } from '@/features/finance/lib/accounts';
import { findDuplicateGroups } from '@/features/finance/lib/duplicateDetection';
import { getYearRange } from '@/features/finance/lib/financialPeriods';
import {
  getLatestPatrimonialSnapshot,
  listFinancialContainers,
  type FinancialContainer,
  type PatrimonialSnapshot,
  type PatrimonyAsset
} from '@/features/finance/lib/snapshots';
import {
  getSupabasePageRange,
  hasMoreSupabasePages
} from '@/shared/lib/supabasePagination';
import { supabase } from '@/shared/lib/supabase';

export type AuditAccountKind = 'cash' | 'investment_platform' | 'debt' | 'other';

export type AuditAccountRow = {
  accountId: string;
  accountName: string;
  accountType: string;
  containerId: string | null;
  containerName: string | null;
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
  platformAssetValue: number;
  platformDebtValue: number;
  platformTotal: number;
  latestImportedBalance: number | null;
  latestImportedBalanceDate: string | null;
  difference: number | null;
  formula: string;
};

export type AuditSuspiciousMovement = {
  id: string;
  transactionId: string;
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
  realEstateAssets: number;
  grossPatrimony: number;
  debts: number;
  currentPatrimony: number;
  warning: string | null;
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
  duplicateGroups: AuditDuplicateGroup[];
  suspiciousMovements: AuditSuspiciousMovement[];
  logs: string[];
};

export type AuditDuplicateGroup = {
  primary: AuditDuplicateTransaction;
  duplicates: AuditDuplicateTransaction[];
};

export type AuditDuplicateTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  amount: number;
  date: string;
  description: string;
  direction: 'inflow' | 'outflow';
};

export type AuditRecoveryType = 'duplicate' | 'suspicious';

type AuditRecoverySupabaseError = {
  code?: string;
  message?: string;
};

type RestoredTransactionRecord = {
  id: string;
  deleted_at: string | null;
  manually_validated: boolean;
  status: string;
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
  manually_validated: boolean;
};

export async function getAccountingAuditSummary(year: number) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const workspace = await getCurrentWorkspace();
  const yearRange = getYearRange(year);
  const yearStart = new Date(yearRange.startIso);
  const [accounts, balances, transactions, snapshot, containers] = await Promise.all([
    getAccounts(workspace.id),
    getAccountBalances(workspace.id),
    getYearTransactions(workspace.id, yearRange),
    getLatestPatrimonialSnapshot(workspace.id),
    listFinancialContainers(workspace.id)
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const balancesByAccount = groupBalancesByAccount(balances);
  const transactionsByAccount = groupTransactionsByAccount(transactions);
  const containerByAccountId = matchContainersToAccounts(accounts, containers);
  const linkedTransactionsById = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );
  const rows = accounts.map((account) =>
    buildAuditAccountRow({
      account,
      balances: balancesByAccount.get(account.id) ?? [],
      container: containerByAccountId.get(account.id) ?? null,
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
      `Contenedores patrimoniales leidos: ${containers.length}`,
      'Los saldos system=0 se muestran, pero no se usan como saldo inicial contable.'
    ],
    patrimony,
    duplicateGroups: findExistingDuplicateGroups({
      accountsById,
      transactions
    }),
    suspiciousMovements: findSuspiciousMovements({
      accountsById,
      linkedTransactionsById,
      transactions
    }),
    year
  } satisfies AccountingAuditSummary;
}

export async function hideDuplicateTransaction(transactionId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const workspace = await getCurrentWorkspace();
  const { error } = await supabase
    .from('transactions')
    .update({
      deleted_at: new Date().toISOString()
    })
    .eq('id', transactionId)
    .eq('workspace_id', workspace.id);

  if (error) {
    throw error;
  }
}

export async function recoverAuditedMovement(input: {
  auditType: AuditRecoveryType;
  movementId: string;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  if (!input.movementId.trim()) {
    throw new Error('No se pudo identificar el movimiento a recuperar.');
  }

  const workspace = await getCurrentWorkspace();
  const payload = {
    p_transaction_id: input.movementId,
    p_workspace_id: workspace.id
  };
  const recoveryResponse = (await supabase.rpc(
    'restore_audited_transaction',
    payload
  )) as {
    data: RestoredTransactionRecord | null;
    error: AuditRecoverySupabaseError | null;
  };
  const recoveryError = recoveryResponse.error;

  if (recoveryError) {
    if (import.meta.env.DEV) {
      console.error('Recover audited movement failed', {
        auditType: input.auditType,
        error: recoveryError,
        movementId: input.movementId,
        payload
      });
    }

    throw new Error(getAuditRecoveryErrorMessage(recoveryError));
  }

  const restoredTransaction = recoveryResponse.data;

  if (!isRestoredTransactionActive(restoredTransaction)) {
    if (import.meta.env.DEV) {
      console.error('Recover audited movement returned an inactive transaction', {
        auditType: input.auditType,
        movementId: input.movementId,
        restoredTransaction
      });
    }

    throw new Error('No se pudo restaurar el movimiento por completo.');
  }
}

export function getAuditRecoveryErrorMessage(error: AuditRecoverySupabaseError) {
  if (error.code === '42501' || error.message?.includes('not allowed')) {
    return 'No tienes permisos para recuperar este movimiento.';
  }

  if (error.code === 'P0002' || error.message?.includes('transaction not found')) {
    return 'El movimiento ya no existe o ha cambiado.';
  }

  if (error.code === 'P0001' || error.message?.includes('profile not found')) {
    return 'No se pudo confirmar tu perfil de usuario.';
  }

  return 'No se pudo recuperar el movimiento. Vuelve a intentarlo.';
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

async function getYearTransactions(
  workspaceId: string,
  yearRange: ReturnType<typeof getYearRange>
) {
  if (!supabase) {
    return [];
  }

  const transactions: TransactionRecord[] = [];
  let pageIndex = 0;

  while (true) {
    const pageRange = getSupabasePageRange(pageIndex);
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, account_id, amount, direction, occurred_at, description, category_id, movement_type, transaction_type, linked_transaction_id, transfer_group_id, manually_validated'
      )
      .eq('workspace_id', workspaceId)
      .eq('status', 'posted')
      .gte('occurred_at', yearRange.startIso)
      .lt('occurred_at', yearRange.endExclusiveIso)
      .order('occurred_at', { ascending: true })
      .range(pageRange.from, pageRange.to)
      .returns<TransactionRecord[]>();

    if (error) {
      throw error;
    }

    transactions.push(...data);

    if (!hasMoreSupabasePages(data.length)) {
      break;
    }

    pageIndex += 1;
  }

  return transactions;
}

function buildAuditAccountRow(input: {
  account: AccountRecord;
  balances: BalanceRecord[];
  container: FinancialContainer | null;
  snapshot: PatrimonialSnapshot | null;
  transactions: TransactionRecord[];
  yearStart: Date;
}) {
  const initialBalance = getInitialBalance({
    accountId: input.account.id,
    balances: input.balances,
    container: input.container,
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
  const platformAssetValue = input.container
    ? sumContainerAssets(input.container.assets, isPatrimonialAsset)
    : 0;
  const platformDebtValue = input.container
    ? sumContainerAssets(input.container.assets, isLiabilityAsset)
    : 0;
  const platformTotal = calculatedBalance + platformAssetValue;

  return {
    accountId: input.account.id,
    accountName: input.account.name,
    accountType: input.account.type,
    assetPurchases,
    calculatedBalance,
    containerId: input.container?.id ?? null,
    containerName: input.container ? getContainerDisplayName(input.container) : null,
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
    outgoingTransfers,
    platformAssetValue,
    platformDebtValue,
    platformTotal
  } satisfies AuditAccountRow;
}

function getInitialBalance(input: {
  accountId: string;
  balances: BalanceRecord[];
  container: FinancialContainer | null;
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

  const snapshotContainerCash = getSnapshotContainerCash(input.snapshot, input.container);

  if (snapshotContainerCash !== null) {
    return {
      amount: snapshotContainerCash,
      source: `snapshot contenedor ${input.snapshot?.snapshotDate ?? ''}`.trim()
    };
  }

  const containerCash = getContainerInitialCash(input.container);

  if (containerCash !== null) {
    return {
      amount: containerCash,
      source: `cash actual ${getContainerDisplayName(input.container)}`
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
    (total, container) => total + sumContainerAssets(container.assets, isFinancialAsset),
    0
  );
  const realEstateAssets = input.containers.reduce(
    (total, container) => total + sumContainerAssets(container.assets, isRealEstateAsset),
    0
  );
  const debts = input.containers.reduce(
    (total, container) => total + sumContainerAssets(container.assets, isLiabilityAsset),
    0
  );
  const hasRealEstateAsset = input.containers.some((container) =>
    container.assets.some((asset) => asset.assetType === 'real_estate')
  );

  const grossPatrimony =
    cashAccounts + investmentPlatforms + financialAssets + realEstateAssets;

  return {
    cashAccounts,
    currentPatrimony: grossPatrimony - debts,
    debts,
    financialAssets,
    grossPatrimony,
    initialDebt: input.snapshot?.initialDebt ?? null,
    initialGrossWorth: input.snapshot?.initialGrossWorth ?? null,
    initialNetWorth: input.snapshot?.initialNetWorth ?? null,
    investmentPlatforms,
    realEstateAssets,
    warning:
      debts > 0 && !hasRealEstateAsset
        ? 'Hay deuda registrada sin vivienda/inmueble asociado. El patrimonio puede parecer artificialmente bajo hasta registrar el activo financiado.'
        : null
  } satisfies AuditPatrimonyBreakdown;
}

function findSuspiciousMovements(input: {
  accountsById: Map<string, AccountRecord>;
  linkedTransactionsById: Map<string, TransactionRecord>;
  transactions: TransactionRecord[];
}) {
  const suspicious: AuditSuspiciousMovement[] = [];
  const reviewableTransactions = input.transactions.filter(
    (transaction) => !isAuditDetectionProtected(transaction)
  );
  const duplicates = findPossibleDuplicateIds(reviewableTransactions);

  reviewableTransactions.forEach((transaction) => {
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
      !isInvestmentAccount(input.accountsById.get(transaction.account_id)) &&
      isPotentialInvestmentTransaction(transaction)
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
    reason,
    transactionId: transaction.id
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

function findExistingDuplicateGroups(input: {
  accountsById: Map<string, AccountRecord>;
  transactions: TransactionRecord[];
}) {
  return findDuplicateGroups(
    input.transactions
      .filter((transaction) => !isAuditDetectionProtected(transaction))
      .map((transaction) => ({
        accountId: transaction.account_id,
        accountName: input.accountsById.get(transaction.account_id)?.name ?? 'Cuenta',
        amount: Number(transaction.amount),
        date: transaction.occurred_at.slice(0, 10),
        description: transaction.description,
        direction: transaction.direction,
        id: transaction.id
      }))
  ).map((group) => ({
    duplicates: group.duplicates.map(mapAuditDuplicateTransaction),
    primary: mapAuditDuplicateTransaction(group.primary)
  }));
}

export function isAuditDetectionProtected(transaction: {
  manually_validated?: boolean | null;
}) {
  return transaction.manually_validated === true;
}

export function isRestoredTransactionActive(
  transaction: RestoredTransactionRecord | null
) {
  return Boolean(
    transaction &&
    transaction.status === 'posted' &&
    transaction.deleted_at === null &&
    transaction.manually_validated === true
  );
}

function mapAuditDuplicateTransaction(transaction: {
  accountId: string;
  accountName: string;
  amount: number;
  date: string;
  description: string;
  direction: 'inflow' | 'outflow';
  id?: string;
}) {
  return {
    accountId: transaction.accountId,
    accountName: transaction.accountName,
    amount: transaction.amount,
    date: transaction.date,
    description: transaction.description,
    direction: transaction.direction,
    id: transaction.id ?? ''
  } satisfies AuditDuplicateTransaction;
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

function isPotentialInvestmentTransaction(transaction: TransactionRecord) {
  const text = normalizeText(
    `${transaction.description} ${transaction.transaction_type ?? ''}`
  );

  return [
    'fondo',
    'fondos',
    'etf',
    'cripto',
    'bitcoin',
    'btc',
    'ethereum',
    'eth',
    'myinvestor',
    'broker',
    'vanguard',
    'fidelity',
    'amundi',
    'ishares',
    'binance',
    'coinbase',
    'ledger'
  ].some((keyword) => text.includes(keyword));
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

function matchContainersToAccounts(
  accounts: AccountRecord[],
  containers: FinancialContainer[]
) {
  const unmatchedContainers = [...containers];
  const result = new Map<string, FinancialContainer>();

  accounts.forEach((account) => {
    const matchIndex = unmatchedContainers.findIndex((container) =>
      isLikelySameAccountAndContainer(account, container)
    );

    if (matchIndex >= 0) {
      const [container] = unmatchedContainers.splice(matchIndex, 1);

      if (container) {
        result.set(account.id, container);
      }
    }
  });

  return result;
}

function isLikelySameAccountAndContainer(
  account: AccountRecord,
  container: FinancialContainer
) {
  const accountText = normalizeText(`${account.name} ${account.type}`);
  const containerText = normalizeText(
    `${container.name} ${container.institution ?? ''} ${container.containerType}`
  );
  const accountTokens = getMeaningfulTokens(accountText);
  const containerTokens = getMeaningfulTokens(containerText);
  const sharesToken = accountTokens.some((token) => containerTokens.includes(token));

  if (!sharesToken) {
    return false;
  }

  if (getAccountKind(account) === 'investment_platform') {
    return ['broker', 'wallet', 'exchange'].includes(container.containerType);
  }

  if (getAccountKind(account) === 'cash') {
    return ['bank', 'cash'].includes(container.containerType);
  }

  return true;
}

function getMeaningfulTokens(value: string) {
  return value
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !['cuenta', 'principal'].includes(token));
}

function getContainerInitialCash(container: FinancialContainer | null) {
  if (!container) {
    return null;
  }

  const cash = sumContainerAssets(container.assets, isCashAsset);

  return cash > 0 ? cash : null;
}

function getSnapshotContainerCash(
  snapshot: PatrimonialSnapshot | null,
  container: FinancialContainer | null
) {
  if (!snapshot || !container) {
    return null;
  }

  const cash = snapshot.items
    .filter(
      (item) =>
        item.linkedContainerId === container.id &&
        ['bank_account', 'broker', 'cash'].includes(item.type)
    )
    .reduce((total, item) => total + item.value, 0);

  return cash > 0 ? cash : null;
}

function sumContainerAssets(
  assets: PatrimonyAsset[],
  predicate: (asset: PatrimonyAsset) => boolean
) {
  return assets
    .filter(predicate)
    .reduce((total, asset) => total + Math.abs(asset.manualValue), 0);
}

function isCashAsset(asset: PatrimonyAsset) {
  return asset.assetType === 'cash';
}

function isLiabilityAsset(asset: PatrimonyAsset) {
  return asset.assetType === 'liability';
}

function isPatrimonialAsset(asset: PatrimonyAsset) {
  return asset.assetType !== 'cash' && asset.assetType !== 'liability';
}

function isFinancialAsset(asset: PatrimonyAsset) {
  return (
    asset.assetType !== 'cash' &&
    asset.assetType !== 'liability' &&
    asset.assetType !== 'real_estate'
  );
}

function isRealEstateAsset(asset: PatrimonyAsset) {
  return asset.assetType === 'real_estate';
}

function getContainerDisplayName(container: FinancialContainer | null) {
  if (!container) {
    return 'contenedor';
  }

  return [container.institution, container.name].filter(Boolean).join(' / ');
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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
