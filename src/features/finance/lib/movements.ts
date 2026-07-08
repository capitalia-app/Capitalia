import type { FinancialAccount } from '@/features/finance/lib/accounts';
import { listFinancialAccounts } from '@/features/finance/lib/accounts';
import {
  applyCategoryRuleToExistingTransactions,
  deriveRuleKeyword,
  listTransactionCategories,
  mapMovementTypeToTransactionType,
  type TransactionCategory
} from '@/features/finance/lib/categories';
import type { MovementType } from '@/features/finance/lib/import/types';
import { supabase } from '@/shared/lib/supabase';

export type MovementReviewFilter = MovementType | 'all' | 'pending';

export type MovementFilters = {
  search: string;
  movementType: MovementReviewFilter;
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

  if (input.filters.movementType === 'pending') {
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

  const { count, data, error } = await query
    .range(input.offset, input.offset + input.limit - 1)
    .returns<TransactionRecord[]>();

  if (error) {
    throw error;
  }

  const page = data;
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
        linkedAccountName: linkedAccount ? getAccountDisplayName(linkedAccount) : null,
        linkedTransactionId: transaction.linked_transaction_id,
        movementType: transaction.movement_type,
        notes: transaction.notes,
        occurredAt: transaction.occurred_at,
        transactionType: transaction.transaction_type,
        transferGroupId: transaction.transfer_group_id
      };
    }),
    total: count ?? 0
  } satisfies MovementListResult;
}

export async function updateMovement(input: {
  workspaceId: string;
  transactionId: string;
  description: string;
  movementType: MovementType;
  categoryId: string | null;
  accountId: string;
  notes: string | null;
  isReviewed: boolean;
  rememberRule: boolean;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { error } = await supabase
    .from('transactions')
    .update({
      account_id: input.accountId,
      category_id: input.categoryId,
      is_reviewed: input.isReviewed,
      movement_type: input.movementType,
      notes: input.notes,
      transaction_type: mapMovementTypeToTransactionType(input.movementType),
      transfer_group_id: input.movementType === 'transfer' ? crypto.randomUUID() : null
    })
    .eq('id', input.transactionId)
    .eq('workspace_id', input.workspaceId);

  if (error) {
    throw error;
  }

  if (input.rememberRule && input.categoryId) {
    const keyword = deriveRuleKeyword(input.description);

    if (keyword) {
      const { error: ruleError } = await supabase.from('category_rules').insert({
        category_id: input.categoryId,
        keyword,
        match_type: 'contains',
        priority: 25,
        workspace_id: input.workspaceId
      });

      if (ruleError) {
        throw ruleError;
      }

      await applyCategoryRuleToExistingTransactions({
        categoryId: input.categoryId,
        keyword,
        workspaceId: input.workspaceId
      });
    }
  }
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
