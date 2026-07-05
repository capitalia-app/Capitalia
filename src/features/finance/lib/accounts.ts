import { supabase } from '@/shared/lib/supabase';

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

type AccountBalanceRecord = {
  account_id: string;
  balance: number | string;
  captured_at: string;
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

  if (accountIds.length > 0) {
    const { data: balances, error: balancesError } = await supabase
      .from('account_balances')
      .select('account_id, balance, captured_at')
      .eq('workspace_id', workspaceId)
      .in('account_id', accountIds)
      .order('captured_at', { ascending: false })
      .returns<AccountBalanceRecord[]>();

    if (balancesError) {
      throw balancesError;
    }

    balances.forEach((balance) => {
      if (!balancesByAccount.has(balance.account_id)) {
        balancesByAccount.set(balance.account_id, balance);
      }
    });
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
      balance: balance ? Number(balance.balance) : null,
      balanceCapturedAt: balance?.captured_at ?? null
    } satisfies FinancialAccount;
  });
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
