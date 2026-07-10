import type {
  ImportTransactionType,
  MovementType,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import {
  deriveRuleKeyword,
  findBestRuleMatch,
  getRuleMatchResult,
  getRuleSpecificity,
  normalizeRuleText,
  shouldApplyRuleToPendingTransaction
} from '@/features/finance/lib/ruleMatching';
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
  accountId: string | null;
  normalizedKeyword: string | null;
  specificity: number | null;
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
  account_id: string | null;
  normalized_keyword: string | null;
  specificity: number | null;
};

type PendingTransactionRecord = {
  id: string;
  account_id: string | null;
  description: string;
  is_reviewed: boolean;
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
    .select(
      'id, workspace_id, keyword, category_id, priority, account_id, normalized_keyword, specificity'
    )
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<RuleRecord[]>();

  if (error) {
    throw error;
  }

  return data.map((rule) => ({
    accountId: rule.account_id,
    categoryId: rule.category_id,
    id: rule.id,
    keyword: rule.keyword,
    normalizedKeyword: rule.normalized_keyword,
    priority: rule.priority,
    specificity: rule.specificity,
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
    account_id: null,
    category_id: input.categoryId,
    keyword: input.keyword.trim(),
    match_type: 'contains',
    normalized_keyword: normalizeRuleText(input.keyword),
    priority: input.priority,
    specificity: getRuleSpecificity(input.keyword),
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

  return applyCategoryRuleToExistingTransactions({
    categoryId: input.categoryId,
    keyword: input.keyword,
    workspaceId: input.workspaceId
  });
}

export async function rememberCategoryRule(input: {
  workspaceId: string;
  categoryId: string;
  keyword: string;
  priority: number;
  accountId?: string | null;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const keyword = input.keyword.trim();
  const normalizedKeyword = normalizeRuleText(keyword);

  if (!normalizedKeyword) {
    return null;
  }

  let existingQuery = supabase
    .from('category_rules')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('category_id', input.categoryId)
    .eq('normalized_keyword', normalizedKeyword)
    .limit(1);

  existingQuery = input.accountId
    ? existingQuery.eq('account_id', input.accountId)
    : existingQuery.is('account_id', null);

  const { data: existingRules, error: existingError } =
    await existingQuery.returns<{ id: string }[]>();

  if (existingError) {
    throw existingError;
  }

  if (existingRules[0]) {
    return existingRules[0].id;
  }

  const { data, error } = await supabase
    .from('category_rules')
    .insert({
      account_id: input.accountId ?? null,
      category_id: input.categoryId,
      keyword,
      match_type: 'contains',
      normalized_keyword: normalizedKeyword,
      priority: input.priority,
      specificity: getRuleSpecificity(keyword),
      workspace_id: input.workspaceId
    })
    .select('id')
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data.id;
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
    return 0;
  }

  const categories = await listTransactionCategories(input.workspaceId);
  const category = categories.find((candidate) => candidate.id === input.categoryId);

  if (!category) {
    throw new Error('Categoria no encontrada.');
  }

  const { data: pendingTransactions, error: pendingError } = await supabase
    .from('transactions')
    .select('id, account_id, description, is_reviewed')
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'posted')
    .eq('is_reviewed', false)
    .returns<PendingTransactionRecord[]>();

  if (pendingError) {
    throw pendingError;
  }

  const rule = {
    accountId: null,
    categoryId: category.id,
    id: 'pending-rule',
    keyword,
    movementType: category.movementType,
    normalizedKeyword: normalizeRuleText(keyword),
    priority: 25,
    specificity: getRuleSpecificity(keyword),
    workspaceId: input.workspaceId
  };
  const matchingTransactions = pendingTransactions.filter((transaction) => {
    const result = getRuleMatchResult([rule], transaction.description, {
      accountId: transaction.account_id
    });

    debugRuleMatch({
      description: transaction.description,
      result: result.debug
    });

    return shouldApplyRuleToPendingTransaction({
      accountId: transaction.account_id,
      description: transaction.description,
      isReviewed: transaction.is_reviewed,
      rule
    });
  });

  if (matchingTransactions.length === 0) {
    return 0;
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
    .in(
      'id',
      matchingTransactions.map((transaction) => transaction.id)
    );

  if (error) {
    throw error;
  }

  if (import.meta.env.DEV) {
    console.debug('Capitalia rule retroactive update', {
      categoryId: category.id,
      keyword,
      updatedTransactions: matchingTransactions.length,
      workspaceId: input.workspaceId
    });
  }

  return matchingTransactions.length;
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
      transaction_type: mapCategoryToTransactionType(category)
    })
    .eq('id', params.transactionId)
    .eq('workspace_id', params.workspaceId);

  if (error) {
    throw error;
  }

  if (params.rememberRule) {
    const keyword = deriveRuleKeyword(params.description);

    if (keyword) {
      await rememberCategoryRule({
        categoryId: category.id,
        keyword,
        priority: 50,
        workspaceId: params.workspaceId
      });

      return applyCategoryRuleToExistingTransactions({
        categoryId: category.id,
        keyword,
        workspaceId: params.workspaceId
      });
    }
  }

  return 0;
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

function normalizeForMatch(value: string) {
  return normalizeRuleText(value);
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

function debugRuleMatch(input: {
  description: string;
  result: ReturnType<typeof getRuleMatchResult>['debug'];
}) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug('Capitalia rule match', {
    candidates: input.result.candidates,
    normalizedDescription: input.result.normalizedDescription,
    originalDescription: input.description,
    selectedRuleId: input.result.selectedRuleId
  });
}
