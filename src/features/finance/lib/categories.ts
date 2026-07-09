import type {
  ImportTransactionType,
  MovementType,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import { supabase } from '@/shared/lib/supabase';

export type TransactionCategory = {
  id: string;
  workspaceId: string | null;
  name: string;
  movementType: MovementType;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  system: boolean;
};

export type CategoryRule = {
  id: string;
  workspaceId: string | null;
  keyword: string;
  categoryId: string;
  priority: number;
};

export type SaveCategoryInput = {
  id?: string;
  workspaceId: string;
  name: string;
  movementType: MovementType;
  icon?: string | null;
  color?: string | null;
  parentId?: string | null;
};

export type SaveCategoryRuleInput = {
  id?: string;
  workspaceId: string;
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
  icon: string | null;
  color: string | null;
  parent_id: string | null;
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
    .select('id, workspace_id, name, movement_type, icon, color, parent_id, system')
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

export async function saveTransactionCategory(input: SaveCategoryInput) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const payload = {
    color: input.color?.trim() || null,
    icon: input.icon?.trim() || null,
    movement_type: input.movementType,
    name: input.name.trim(),
    parent_id: input.parentId || null,
    system: false,
    workspace_id: input.workspaceId
  };

  const request = input.id
    ? supabase
        .from('transaction_categories')
        .update(payload)
        .eq('id', input.id)
        .eq('workspace_id', input.workspaceId)
        .eq('system', false)
    : supabase.from('transaction_categories').insert(payload);

  const { error } = await request;

  if (error) {
    throw error;
  }
}

export async function deleteTransactionCategory(input: {
  workspaceId: string;
  categoryId: string;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { count, error: countError } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', input.workspaceId)
    .eq('category_id', input.categoryId);

  if (countError) {
    throw countError;
  }

  if ((count ?? 0) > 0) {
    throw new Error('No puedes eliminar una categoria con movimientos asociados.');
  }

  const { error } = await supabase
    .from('transaction_categories')
    .delete()
    .eq('id', input.categoryId)
    .eq('workspace_id', input.workspaceId)
    .eq('system', false);

  if (error) {
    throw error;
  }
}

export async function saveCategoryRule(input: SaveCategoryRuleInput) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const payload = {
    category_id: input.categoryId,
    keyword: input.keyword.trim(),
    match_type: 'contains',
    priority: input.priority,
    workspace_id: input.workspaceId
  };

  const request = input.id
    ? supabase
        .from('category_rules')
        .update(payload)
        .eq('id', input.id)
        .eq('workspace_id', input.workspaceId)
    : supabase.from('category_rules').insert(payload);

  const { error } = await request;

  if (error) {
    throw error;
  }

  await applyCategoryRuleToExistingTransactions({
    categoryId: input.categoryId,
    keyword: input.keyword,
    workspaceId: input.workspaceId
  });
}

export async function applyCategoryRuleToExistingTransactions(input: {
  workspaceId: string;
  keyword: string;
  categoryId: string;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const keyword = input.keyword.trim();

  if (!keyword) {
    return;
  }

  const categories = await listTransactionCategories(input.workspaceId);
  const category = categories.find((candidate) => candidate.id === input.categoryId);

  if (!category) {
    throw new Error('Categoria no encontrada.');
  }

  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: category.id,
      is_reviewed: true,
      movement_type: category.movementType,
      transaction_type: mapCategoryToTransactionType(category)
    })
    .eq('workspace_id', input.workspaceId)
    .ilike('description', `%${escapeIlikePattern(keyword)}%`);

  if (error) {
    throw error;
  }
}

export async function deleteCategoryRule(input: { workspaceId: string; ruleId: string }) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { error } = await supabase
    .from('category_rules')
    .delete()
    .eq('id', input.ruleId)
    .eq('workspace_id', input.workspaceId);

  if (error) {
    throw error;
  }
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
  const categoriesByName = new Map(
    categories.map((category) => [
      `${normalizeForMatch(category.name)}|${category.movementType}`,
      category
    ])
  );

  return transactions.map((transaction) => {
    const normalizedDescription = normalizeForMatch(
      [
        transaction.description,
        ...Object.values(transaction.rawRow).filter(Boolean)
      ].join(' ')
    );
    const workspaceRule = findBestRuleMatch(
      rules.filter((rule) => rule.workspaceId),
      normalizedDescription
    );
    const workspaceRuleCategory = workspaceRule
      ? categoriesById.get(workspaceRule.categoryId)
      : null;
    const priorityCategory = workspaceRuleCategory
      ? null
      : getPriorityCategory(normalizedDescription, categoriesByName);
    const systemRule =
      workspaceRuleCategory || priorityCategory
        ? null
        : findBestRuleMatch(
            rules.filter((rule) => !rule.workspaceId),
            normalizedDescription
          );
    const category =
      workspaceRuleCategory ??
      priorityCategory ??
      (systemRule ? categoriesById.get(systemRule.categoryId) : null);
    const movementType = category?.movementType ?? transaction.type;
    const transactionType = getDetailedTransactionType(
      movementType,
      normalizedDescription
    );

    return {
      ...transaction,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      isReviewed: Boolean(category),
      movementType,
      transactionType,
      type: movementType
    } satisfies ClassifiedImportTransaction;
  });
}

function getPriorityCategory(
  normalizedDescription: string,
  categoriesByName: Map<string, TransactionCategory>
) {
  if (matchesAny(normalizedDescription, transferKeywords)) {
    if (normalizedDescription.includes('revolut')) {
      return getCategoryByName(categoriesByName, 'Revolut', 'transfer');
    }

    if (normalizedDescription.includes('myinvestor')) {
      return getCategoryByName(categoriesByName, 'Banco a broker', 'transfer');
    }

    return getCategoryByName(categoriesByName, 'Entre cuentas', 'transfer');
  }

  if (matchesAny(normalizedDescription, fundPriorityKeywords)) {
    return getCategoryByName(categoriesByName, 'Fondos', 'investment');
  }

  if (matchesAny(normalizedDescription, etfPriorityKeywords)) {
    return getCategoryByName(categoriesByName, 'ETF', 'investment');
  }

  return null;
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
    const keyword = deriveRuleKeyword(params.description);

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
    return 'asset_purchase';
  }

  return type;
}

function mapCategoryToTransactionType(category: TransactionCategory) {
  const normalizedName = normalizeForMatch(category.name);

  if (
    normalizedName.includes('amortizacion hipoteca') ||
    normalizedName.includes('pago hipoteca')
  ) {
    return 'mortgage_principal';
  }

  if (normalizedName.includes('intereses hipoteca')) {
    return 'mortgage_interest';
  }

  return mapMovementTypeToTransactionType(category.movementType);
}

function getDetailedTransactionType(
  movementType: MovementType,
  normalizedDescription: string
): ImportTransactionType {
  if (movementType === 'investment') {
    return 'asset_purchase';
  }

  if (
    movementType === 'transfer' &&
    matchesAny(normalizedDescription, investmentPlatformKeywords)
  ) {
    return 'investment_transfer';
  }

  return movementType;
}

function mapCategoryRecord(record: CategoryRecord) {
  return {
    color: record.color,
    icon: record.icon,
    id: record.id,
    movementType: record.movement_type,
    name: record.name,
    parentId: record.parent_id,
    system: record.system,
    workspaceId: record.workspace_id
  } satisfies TransactionCategory;
}

function findBestRuleMatch(rules: CategoryRule[], normalizedDescription: string) {
  const matchingRules = rules.filter((rule) =>
    normalizedDescription.includes(normalizeForMatch(rule.keyword))
  );

  return [...matchingRules].sort((left, right) => {
    if (left.workspaceId && !right.workspaceId) {
      return -1;
    }

    if (!left.workspaceId && right.workspaceId) {
      return 1;
    }

    return left.priority - right.priority;
  })[0];
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const fundPriorityKeywords = [
  'fondo',
  'fondos',
  'indexado',
  'fidelity',
  'amundi',
  'clase',
  'participaciones',
  'suscripcion fondo',
  'traspaso fondo',
  'reembolso fondo'
];

const etfPriorityKeywords = [
  'etf',
  'ucits etf',
  'ishares etf',
  'vanguard etf',
  'ticker',
  'compra etf'
];

const transferKeywords = [
  'transferencia emitida',
  'transferencia recibida',
  'traspaso',
  'ingreso efectivo',
  'retirada efectivo',
  'myinvestor',
  'binance',
  'ledger',
  'trade republic',
  'revolut',
  'entre cuentas'
];

const investmentPlatformKeywords = [
  'myinvestor',
  'binance',
  'ledger',
  'trade republic',
  'trading 212',
  'coinbase',
  'kraken',
  'broker'
];

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(normalizeForMatch(keyword)));
}

function getCategoryByName(
  categoriesByName: Map<string, TransactionCategory>,
  name: string,
  movementType: MovementType
) {
  return categoriesByName.get(`${normalizeForMatch(name)}|${movementType}`) ?? null;
}

function escapeIlikePattern(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function deriveRuleKeyword(description: string) {
  const ignoredWords = new Set(['pago', 'compra', 'tarjeta', 'recibo', 'cargo']);

  return normalizeForMatch(description)
    .split(' ')
    .filter((word) => word.length >= 4 && !ignoredWords.has(word))
    .slice(0, 2)
    .join(' ');
}
