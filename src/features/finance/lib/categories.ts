import type {
  MovementType,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import { supabase } from '@/shared/lib/supabase';

export type TransactionCategory = {
  id: string;
  workspaceId: string | null;
  name: string;
  movementType: MovementType;
  system: boolean;
};

export type CategoryRule = {
  id: string;
  workspaceId: string | null;
  keyword: string;
  categoryId: string;
  priority: number;
};

export type ClassifiedImportTransaction = ParsedCsvTransaction & {
  movementType: MovementType;
  categoryId: string | null;
  categoryName: string | null;
  isReviewed: boolean;
};

type CategoryRecord = {
  id: string;
  workspace_id: string | null;
  name: string;
  movement_type: MovementType;
  system: boolean;
};

type RuleRecord = {
  id: string;
  workspace_id: string | null;
  keyword: string;
  category_id: string;
  priority: number;
};

export async function listTransactionCategories(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('id, workspace_id, name, movement_type, system')
    .or(`system.eq.true,workspace_id.eq.${workspaceId}`)
    .order('movement_type', { ascending: true })
    .order('name', { ascending: true })
    .returns<CategoryRecord[]>();

  if (error) {
    throw error;
  }

  return data.map(mapCategoryRecord);
}

export async function listCategoryRules(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data, error } = await supabase
    .from('category_rules')
    .select('id, workspace_id, keyword, category_id, priority')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<RuleRecord[]>();

  if (error) {
    throw error;
  }

  return data.map((rule) => ({
    categoryId: rule.category_id,
    id: rule.id,
    keyword: rule.keyword,
    priority: rule.priority,
    workspaceId: rule.workspace_id
  }));
}

export async function classifyImportedTransactions(
  workspaceId: string,
  transactions: ParsedCsvTransaction[]
) {
  const [categories, rules] = await Promise.all([
    listTransactionCategories(workspaceId),
    listCategoryRules(workspaceId)
  ]);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return transactions.map((transaction) => {
    const normalizedDescription = normalizeForMatch(transaction.description);
    const matchedRule = rules.find((rule) =>
      normalizedDescription.includes(normalizeForMatch(rule.keyword))
    );
    const category = matchedRule ? categoriesById.get(matchedRule.categoryId) : null;
    const movementType = category?.movementType ?? transaction.type;

    return {
      ...transaction,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      isReviewed: Boolean(category),
      movementType,
      transactionType: movementType,
      type: movementType
    } satisfies ClassifiedImportTransaction;
  });
}

export async function updateTransactionCategory(params: {
  workspaceId: string;
  transactionId: string;
  categoryId: string;
  rememberRule: boolean;
  description: string;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const categories = await listTransactionCategories(params.workspaceId);
  const category = categories.find((candidate) => candidate.id === params.categoryId);

  if (!category) {
    throw new Error('Categoria no encontrada.');
  }

  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: category.id,
      is_reviewed: true,
      movement_type: category.movementType,
      transaction_type: mapMovementTypeToTransactionType(category.movementType)
    })
    .eq('id', params.transactionId)
    .eq('workspace_id', params.workspaceId);

  if (error) {
    throw error;
  }

  if (params.rememberRule) {
    const keyword = deriveKeyword(params.description);

    if (keyword) {
      const { error: ruleError } = await supabase.from('category_rules').insert({
        category_id: category.id,
        keyword,
        match_type: 'contains',
        priority: 50,
        workspace_id: params.workspaceId
      });

      if (ruleError) {
        throw ruleError;
      }
    }
  }
}

export function getMovementTypeLabel(type: MovementType) {
  if (type === 'income') {
    return 'Ingreso';
  }

  if (type === 'investment') {
    return 'Inversion';
  }

  if (type === 'transfer') {
    return 'Transferencia';
  }

  return 'Gasto real';
}

export function mapMovementTypeToTransactionType(type: MovementType) {
  if (type === 'investment') {
    return 'investment_buy';
  }

  return type;
}

function mapCategoryRecord(record: CategoryRecord) {
  return {
    id: record.id,
    movementType: record.movement_type,
    name: record.name,
    system: record.system,
    workspaceId: record.workspace_id
  } satisfies TransactionCategory;
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveKeyword(description: string) {
  const ignoredWords = new Set(['pago', 'compra', 'tarjeta', 'recibo', 'cargo']);

  return normalizeForMatch(description)
    .split(' ')
    .filter((word) => word.length >= 4 && !ignoredWords.has(word))
    .slice(0, 2)
    .join(' ');
}
