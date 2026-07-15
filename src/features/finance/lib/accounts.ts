import { supabase } from '@/shared/lib/supabase';
import type { ContainerType, FinancialContainer } from '@/features/finance/lib/snapshots';

export type FinancialAccountType =
  | 'checking'
  | 'brokerage'
  | 'crypto_wallet'
  | 'cash'
  | 'real_estate'
  | 'business'
  | 'other';

export type InstitutionOption = {
  id: string;
  name: string;
  slug: string;
};

export type FinancialAccount = {
  id: string;
  name: string;
  type: FinancialAccountType;
  currency: string;
  institutionName: string;
  balance: number | null;
  balanceCapturedAt: string | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  baseCurrency: string;
};

export type CreateFinancialAccountInput = {
  workspaceId: string;
  name: string;
  type: FinancialAccountType;
  institutionId: string | null;
  currency: string;
  initialBalance: number;
};

type WorkspaceMemberRecord = {
  workspace_id: string;
};

type WorkspaceRecord = {
  id: string;
  name: string;
  base_currency: string;
};

type InstitutionRecord = {
  id: string;
  name: string;
  slug: string;
};

type FinancialAccountRecord = {
  id: string;
  name: string;
  type: FinancialAccountType;
  currency: string;
  institution_id: string | null;
};

type CreatedFinancialAccountRecord = {
  id: string;
};

type AccountBalanceRecord = {
  account_id: string;
  balance: number | string;
  captured_at: string;
  source: string;
};

type BalanceTransactionRecord = {
  account_id: string;
  amount: number | string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
};

const institutionOrder = [
  'bbva',
  'myinvestor',
  'ledger',
  'trade-republic',
  'coinbase',
  'manual'
];

export async function getCurrentWorkspace() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('status', 'active')
    .limit(1)
    .returns<WorkspaceMemberRecord[]>();

  if (membershipError) {
    throw membershipError;
  }

  const workspaceId = memberships[0]?.workspace_id;

  if (!workspaceId) {
    throw new Error('No se encontro un workspace activo.');
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, name, base_currency')
    .eq('id', workspaceId)
    .single<WorkspaceRecord>();

  if (workspaceError) {
    throw workspaceError;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    baseCurrency: workspace.base_currency
  } satisfies WorkspaceSummary;
}

export async function listInstitutions() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data, error } = await supabase
    .from('institutions')
    .select('id, name, slug')
    .eq('is_active', true)
    .in('slug', institutionOrder)
    .returns<InstitutionRecord[]>();

  if (error) {
    throw error;
  }

  return [...data]
    .sort(
      (left, right) =>
        institutionOrder.indexOf(left.slug) - institutionOrder.indexOf(right.slug)
    )
    .map((institution) => ({
      id: institution.id,
      name: institution.name,
      slug: institution.slug
    })) satisfies InstitutionOption[];
}

export async function listFinancialAccounts(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const [
    { data: accounts, error: accountsError },
    { data: institutions, error: institutionsError }
  ] = await Promise.all([
    supabase
      .from('financial_accounts')
      .select('id, name, type, currency, institution_id')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .returns<FinancialAccountRecord[]>(),
    supabase.from('institutions').select('id, name, slug').returns<InstitutionRecord[]>()
  ]);

  if (accountsError) {
    throw accountsError;
  }

  if (institutionsError) {
    throw institutionsError;
  }

  const accountIds = accounts.map((account) => account.id);
  const balancesByAccount = new Map<string, AccountBalanceRecord>();
  let balanceTransactions: BalanceTransactionRecord[] = [];

  if (accountIds.length > 0) {
    const { data: balances, error: balancesError } = await supabase
      .from('account_balances')
      .select('account_id, balance, captured_at, source')
      .eq('workspace_id', workspaceId)
      .in('account_id', accountIds)
      .order('captured_at', { ascending: false })
      .returns<AccountBalanceRecord[]>();

    if (balancesError) {
      throw balancesError;
    }

    balances
      .filter((balance) => balance.source !== 'system')
      .forEach((balance) => {
        if (!balancesByAccount.has(balance.account_id)) {
          balancesByAccount.set(balance.account_id, balance);
        }
      });

    balanceTransactions = await getBalanceTransactions(
      workspaceId,
      accountIds,
      balancesByAccount
    );
  }

  const institutionsById = new Map(
    institutions.map((institution) => [institution.id, institution.name])
  );

  return accounts.map((account) => {
    const balance = balancesByAccount.get(account.id);

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      institutionName: account.institution_id
        ? (institutionsById.get(account.institution_id) ?? 'Manual')
        : 'Manual',
      balance: getBalanceWithTransactions(balance, balanceTransactions, account.id),
      balanceCapturedAt: balance?.captured_at ?? null
    } satisfies FinancialAccount;
  });
}

export async function ensureFinancialAccountsForContainers(input: {
  workspaceId: string;
  containers: FinancialContainer[];
}) {
  const eligibleContainers = input.containers.filter(isTransferContainer);

  if (eligibleContainers.length === 0) {
    return;
  }

  await Promise.all(
    eligibleContainers.map((container) =>
      ensureFinancialAccountForContainer({
        container,
        workspaceId: input.workspaceId
      })
    )
  );
}

async function ensureFinancialAccountForContainer(input: {
  workspaceId: string;
  container: FinancialContainer;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const existingAccountId = await findFinancialAccountForContainer(input);

  if (existingAccountId) {
    return existingAccountId;
  }

  const { data: account, error: accountError } = await supabase
    .from('financial_accounts')
    .insert({
      currency: input.container.currency.toUpperCase(),
      institution_id: null,
      name: getContainerFinancialAccountLabel(input.container),
      status: 'active',
      type: mapContainerTypeToAccountType(input.container.containerType),
      workspace_id: input.workspaceId
    })
    .select('id')
    .single<CreatedFinancialAccountRecord>();

  if (accountError) {
    throw accountError;
  }

  const { error: balanceError } = await supabase.from('account_balances').insert({
    account_id: account.id,
    available_balance: 0,
    balance: 0,
    captured_at: new Date().toISOString(),
    currency: input.container.currency.toUpperCase(),
    source: 'system',
    workspace_id: input.workspaceId
  });

  if (balanceError) {
    throw balanceError;
  }

  return account.id;
}

async function findFinancialAccountForContainer(input: {
  workspaceId: string;
  container: FinancialContainer;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const candidateNames = [
    getContainerFinancialAccountLabel(input.container),
    input.container.name,
    input.container.institution
  ].filter((name): name is string => Boolean(name?.trim()));

  for (const candidateName of candidateNames) {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('id, name')
      .eq('workspace_id', input.workspaceId)
      .ilike('name', candidateName)
      .limit(1)
      .maybeSingle<FinancialAccountRecord>();

    if (error) {
      throw error;
    }

    if (data) {
      return data.id;
    }
  }

  return null;
}

function isTransferContainer(container: FinancialContainer) {
  return ['bank', 'broker', 'wallet', 'exchange', 'cash'].includes(
    container.containerType
  );
}

function mapContainerTypeToAccountType(type: ContainerType): FinancialAccountType {
  if (type === 'broker') {
    return 'brokerage';
  }

  if (type === 'wallet' || type === 'exchange') {
    return 'crypto_wallet';
  }

  if (type === 'cash') {
    return 'cash';
  }

  return type === 'bank' ? 'checking' : 'other';
}

function getContainerFinancialAccountLabel(container: FinancialContainer) {
  if (
    container.institution &&
    container.institution.trim().toLowerCase() !== container.name.trim().toLowerCase()
  ) {
    return `${container.institution} / ${container.name}`;
  }

  return container.name;
}

async function getBalanceTransactions(
  workspaceId: string,
  accountIds: string[],
  balancesByAccount: Map<string, AccountBalanceRecord>
) {
  if (!supabase || accountIds.length === 0) {
    return [];
  }

  const query = supabase
    .from('transactions')
    .select('account_id, amount, direction, occurred_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .is('deleted_at', null)
    .in('account_id', accountIds);

  if (balancesByAccount.size > 0) {
    const oldestBalanceDate = [...balancesByAccount.values()].reduce(
      (oldest, balance) => {
        const capturedAt = new Date(balance.captured_at);

        return capturedAt < oldest ? capturedAt : oldest;
      },
      new Date()
    );

    query.gt('occurred_at', oldestBalanceDate.toISOString());
  }

  const { data, error } = await query.returns<BalanceTransactionRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

function getBalanceWithTransactions(
  balance: AccountBalanceRecord | undefined,
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

export async function createFinancialAccount(input: CreateFinancialAccountInput) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const currency = input.currency.toUpperCase();

  const { data: account, error: accountError } = await supabase
    .from('financial_accounts')
    .insert({
      workspace_id: input.workspaceId,
      institution_id: input.institutionId,
      name: input.name,
      type: input.type,
      currency,
      status: 'active'
    })
    .select('id')
    .single<{ id: string }>();

  if (accountError) {
    throw accountError;
  }

  const { error: balanceError } = await supabase.from('account_balances').insert({
    workspace_id: input.workspaceId,
    account_id: account.id,
    balance: input.initialBalance,
    available_balance: input.initialBalance,
    currency,
    captured_at: new Date().toISOString(),
    source: 'manual'
  });

  if (balanceError) {
    throw balanceError;
  }
}
