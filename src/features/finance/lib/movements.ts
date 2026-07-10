import type { FinancialAccount } from '@/features/finance/lib/accounts';
import { listFinancialAccounts } from '@/features/finance/lib/accounts';
import {
  applyCategoryRuleToExistingTransactions,
  listTransactionCategories,
  mapMovementTypeToTransactionType,
  rememberCategoryRule,
  type TransactionCategory
} from '@/features/finance/lib/categories';
import {
  buildMetricFilter,
  matchesMetricFilter,
  type FinancialMetric
} from '@/features/finance/lib/financialMetrics';
import type { MovementType } from '@/features/finance/lib/import/types';
import { deriveRuleKeyword } from '@/features/finance/lib/ruleMatching';
import { supabase } from '@/shared/lib/supabase';

export type MovementReviewFilter = MovementType | 'all' | 'pending';

export type MovementFilters = {
  search: string;
  movementType: MovementReviewFilter;
  metric?: FinancialMetric;
  accountId: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
};

export type MoneyMovement = {
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
  notes: string | null;
  transferGroupId: string | null;
  linkedTransactionId: string | null;
  linkedAccountId: string | null;
  linkedAccountName: string | null;
};

export type MovementListResult = {
  movements: MoneyMovement[];
  total: number;
};

type TransactionRecord = {
  id: string;
  account_id: string;
  category_id: string | null;
  description: string;
  amount: number | string;
  currency: string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
  movement_type: MovementType;
  transaction_type: string;
  is_reviewed: boolean;
  notes: string | null;
  transfer_group_id: string | null;
  linked_transaction_id: string | null;
};

type LinkedTransactionRecord = {
  id: string;
  account_id: string;
};

type EditableTransactionRecord = {
  id: string;
  account_id: string;
  amount: number | string;
  booked_at: string | null;
  category_id: string | null;
  currency: string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
  description: string;
  linked_transaction_id: string | null;
  transfer_group_id: string | null;
};

export async function getMovementFiltersContext(workspaceId: string) {
  const [accounts, categories] = await Promise.all([
    listFinancialAccounts(workspaceId),
    listTransactionCategories(workspaceId)
  ]);

  return { accounts, categories };
}

export async function listMovements(input: {
  workspaceId: string;
  filters: MovementFilters;
  limit: number;
  offset: number;
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  let query = supabase
    .from('transactions')
    .select(
      'id, account_id, category_id, description, amount, currency, direction, occurred_at, movement_type, transaction_type, is_reviewed, notes, transfer_group_id, linked_transaction_id',
      { count: 'exact' }
    )
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'posted')
    .order('occurred_at', { ascending: false });

  if (input.filters.search.trim()) {
    query = query.ilike('description', `%${input.filters.search.trim()}%`);
  }

  if (input.filters.metric) {
    const metricFilter = buildMetricFilter(input.filters.metric, input.accounts);

    if (metricFilter.movementTypes.length > 0) {
      query = query.in('movement_type', metricFilter.movementTypes);
    }
  } else if (input.filters.movementType === 'pending') {
    query = query.eq('is_reviewed', false);
  } else if (input.filters.movementType !== 'all') {
    query = query.eq('movement_type', input.filters.movementType);
  }

  if (input.filters.accountId) {
    query = query.eq('account_id', input.filters.accountId);
  }

  if (input.filters.categoryId) {
    query = query.eq('category_id', input.filters.categoryId);
  }

  if (input.filters.dateFrom) {
    query = query.gte('occurred_at', `${input.filters.dateFrom}T00:00:00.000Z`);
  }

  if (input.filters.dateTo) {
    query = query.lte('occurred_at', `${input.filters.dateTo}T23:59:59.999Z`);
  }

  const paginatedQuery = input.filters.metric
    ? query
    : query.range(input.offset, input.offset + input.limit - 1);
  const { count, data, error } = await paginatedQuery.returns<TransactionRecord[]>();

  if (error) {
    throw error;
  }

  const metricFilter = input.filters.metric
    ? buildMetricFilter(input.filters.metric, input.accounts)
    : null;
  const filteredData = metricFilter
    ? data.filter((transaction) => {
        const account = input.accounts.find(
          (candidate) => candidate.id === transaction.account_id
        );

        return matchesMetricFilter(
          {
            accountId: transaction.account_id,
            accountName: account ? getAccountDisplayName(account) : 'Cuenta',
            amount: Number(transaction.amount),
            description: transaction.description,
            direction: transaction.direction,
            linkedTransactionId: transaction.linked_transaction_id,
            movementType: transaction.movement_type,
            transactionType: transaction.transaction_type
          },
          metricFilter
        );
      })
    : data;
  const page = metricFilter
    ? filteredData.slice(input.offset, input.offset + input.limit)
    : filteredData;
  const linkedTransactionsById = await getLinkedTransactionsById(
    page
      .map((transaction) => transaction.linked_transaction_id)
      .filter((transactionId): transactionId is string => Boolean(transactionId))
  );
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(
    input.categories.map((category) => [category.id, category])
  );

  return {
    movements: page.map((transaction) => {
      const account = accountsById.get(transaction.account_id);
      const linkedAccount = transaction.linked_transaction_id
        ? accountsById.get(
            linkedTransactionsById.get(transaction.linked_transaction_id)?.account_id ??
              ''
          )
        : null;

      return {
        accountId: transaction.account_id,
        accountName: account ? getAccountDisplayName(account) : 'Cuenta',
        amount: Number(transaction.amount),
        categoryId: transaction.category_id,
        categoryName: transaction.category_id
          ? (categoriesById.get(transaction.category_id)?.name ?? null)
          : null,
        currency: transaction.currency,
        description: transaction.description,
        direction: transaction.direction,
        id: transaction.id,
        isReviewed: transaction.is_reviewed,
        linkedAccountId: linkedAccount?.id ?? null,
        linkedAccountName: linkedAccount ? getAccountDisplayName(linkedAccount) : null,
        linkedTransactionId: transaction.linked_transaction_id,
        movementType: transaction.movement_type,
        notes: transaction.notes,
        occurredAt: transaction.occurred_at,
        transactionType: transaction.transaction_type,
        transferGroupId: transaction.transfer_group_id
      };
    }),
    total: metricFilter ? filteredData.length : (count ?? 0)
  } satisfies MovementListResult;
}

export async function updateMovement(input: {
  workspaceId: string;
  transactionId: string;
  description: string;
  movementType: MovementType;
  categoryId: string | null;
  accountId: string;
  counterpartyAccountId?: string | null;
  notes: string | null;
  isReviewed: boolean;
  rememberRule: boolean;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const transferGroupId =
    input.movementType === 'transfer' ? await ensureTransferCounterpart(input) : null;

  const { error } = await supabase
    .from('transactions')
    .update({
      account_id: input.accountId,
      category_id: input.categoryId,
      is_reviewed: input.isReviewed,
      movement_type: input.movementType,
      notes: input.notes,
      transaction_type: mapMovementTypeToTransactionType(input.movementType),
      transfer_group_id: transferGroupId
    })
    .eq('id', input.transactionId)
    .eq('workspace_id', input.workspaceId);

  if (error) {
    throw error;
  }

  if (input.rememberRule && input.categoryId) {
    const keyword = deriveRuleKeyword(input.description);

    if (keyword) {
      await rememberCategoryRule({
        categoryId: input.categoryId,
        keyword,
        priority: 25,
        workspaceId: input.workspaceId
      });

      const appliedCount = await applyCategoryRuleToExistingTransactions({
        categoryId: input.categoryId,
        keyword,
        workspaceId: input.workspaceId
      });

      return { appliedRuleCount: appliedCount };
    }
  }

  return { appliedRuleCount: 0 };
}

async function ensureTransferCounterpart(input: {
  workspaceId: string;
  transactionId: string;
  accountId: string;
  counterpartyAccountId?: string | null;
  movementType: MovementType;
}) {
  if (!supabase || input.movementType !== 'transfer') {
    return null;
  }

  const { data: source, error: sourceError } = await supabase
    .from('transactions')
    .select(
      'id, account_id, amount, booked_at, category_id, currency, direction, occurred_at, description, linked_transaction_id, transfer_group_id'
    )
    .eq('id', input.transactionId)
    .eq('workspace_id', input.workspaceId)
    .single<EditableTransactionRecord>();

  if (sourceError) {
    throw sourceError;
  }

  const transferGroupId = source.transfer_group_id ?? crypto.randomUUID();

  if (!input.counterpartyAccountId || input.counterpartyAccountId === input.accountId) {
    return transferGroupId;
  }

  const counterpartDirection = source.direction === 'inflow' ? 'outflow' : 'inflow';
  const counterpartDescription =
    source.direction === 'outflow'
      ? `Transferencia interna desde ${source.description}`
      : `Transferencia interna hacia ${source.description}`;

  if (source.linked_transaction_id) {
    const { error: linkedError } = await supabase
      .from('transactions')
      .update({
        account_id: input.counterpartyAccountId,
        amount: Number(source.amount),
        booked_at: source.booked_at,
        currency: source.currency,
        direction: counterpartDirection,
        movement_type: 'transfer',
        occurred_at: source.occurred_at,
        status: 'posted',
        transaction_type: 'transfer',
        transfer_group_id: transferGroupId
      })
      .eq('id', source.linked_transaction_id)
      .eq('workspace_id', input.workspaceId);

    if (linkedError) {
      throw linkedError;
    }

    return transferGroupId;
  }

  const { data: counterpart, error: counterpartError } = await supabase
    .from('transactions')
    .insert({
      account_id: input.counterpartyAccountId,
      amount: Number(source.amount),
      booked_at: source.booked_at,
      category_id: null,
      confidence_score: 0.9,
      currency: source.currency,
      description: counterpartDescription,
      direction: counterpartDirection,
      fingerprint: `manual-transfer-counterpart|${input.workspaceId}|${input.transactionId}|${input.counterpartyAccountId}`,
      import_batch_id: null,
      is_reviewed: true,
      linked_transaction_id: input.transactionId,
      movement_type: 'transfer',
      occurred_at: source.occurred_at,
      raw_import_record_id: null,
      status: 'posted',
      transaction_type: 'transfer',
      transfer_group_id: transferGroupId,
      workspace_id: input.workspaceId
    })
    .select('id')
    .single<{ id: string }>();

  if (counterpartError) {
    throw counterpartError;
  }

  const { error: sourceLinkError } = await supabase
    .from('transactions')
    .update({
      linked_transaction_id: counterpart.id,
      transfer_group_id: transferGroupId
    })
    .eq('id', input.transactionId)
    .eq('workspace_id', input.workspaceId);

  if (sourceLinkError) {
    throw sourceLinkError;
  }

  return transferGroupId;
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

function getAccountDisplayName(account: FinancialAccount) {
  if (
    account.institutionName &&
    account.institutionName !== 'Manual' &&
    !account.name.toLowerCase().includes(account.institutionName.toLowerCase())
  ) {
    return `${account.institutionName} / ${account.name}`;
  }

  return account.name;
}
