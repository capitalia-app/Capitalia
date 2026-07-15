import {
  getCurrentWorkspace,
  type FinancialAccountType,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import {
  classifyImportedTransactions,
  mapMovementTypeToTransactionType,
  type ClassifiedImportTransaction
} from '@/features/finance/lib/categories';
import {
  findEquivalentTransaction,
  findSuspiciousTransaction,
  type ComparableTransaction
} from '@/features/finance/lib/duplicateDetection';
import { ImportEngine } from '@/features/finance/lib/import/ImportEngine';
import type {
  IgnoredImportRow,
  ImportParseResult,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import { normalizeHeader } from '@/features/finance/lib/import/utils';
import {
  ensureCashFinancialContainer,
  listFinancialContainers,
  type ContainerType,
  type FinancialContainer
} from '@/features/finance/lib/snapshots';
import { supabase } from '@/shared/lib/supabase';

export type { IgnoredImportRow, ImportParseResult, ParsedCsvTransaction };

export type CsvImportContext = {
  workspace: WorkspaceSummary;
  containers: ImportContainerOption[];
};

export type ImportContainerOption = {
  id: string;
  name: string;
  label: string;
  institution: string | null;
  containerType: ContainerType;
  currency: string;
};

export type CsvSaveResult = {
  importedCount: number;
  duplicateCount: number;
  ignoredCount: number;
  pendingReviewCount: number;
  suspiciousCount: number;
};

export type ImportDuplicateStatus = 'new' | 'duplicate' | 'suspicious';

export type ImportPreviewItem = {
  transaction: ParsedCsvTransaction;
  status: ImportDuplicateStatus;
  reason: string | null;
  matchedTransaction: ExistingComparableTransaction | null;
};

export type ImportPreviewAnalysis = {
  items: ImportPreviewItem[];
  newCount: number;
  duplicateCount: number;
  suspiciousCount: number;
};

type ExistingTransactionRecord = {
  id: string;
  account_id: string;
  amount: number | string;
  description: string;
  direction: 'inflow' | 'outflow';
  fingerprint: string | null;
  import_hash: string | null;
  occurred_at: string;
};

type ExistingHashRecord = {
  fingerprint: string | null;
  import_hash: string | null;
};

type ExistingComparableTransaction = ComparableTransaction & {
  accountName: string;
  fingerprint: string | null;
  importHash: string | null;
  id: string;
  occurredAt: string;
};

type ClassifiedPreviewItem = {
  transaction: ClassifiedImportTransaction & { importHash: string };
  status: ImportDuplicateStatus;
  reason: string | null;
  matchedTransaction: ExistingComparableTransaction | null;
};

type TransferCandidateRecord = {
  id: string;
  account_id: string;
  occurred_at: string;
  amount: number | string;
  direction: 'inflow' | 'outflow';
  transfer_group_id: string | null;
};

type AutoCounterpartRecord = {
  amount: number | string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
};

type ImportBatchRecord = {
  id: string;
};

type RawImportRecord = {
  id: string;
  record_hash: string;
};

type FinancialAccountRecord = {
  id: string;
  name: string;
};

type InsertedTransactionRecord = {
  id: string;
  fingerprint: string;
  transfer_group_id: string | null;
};

type AssetCostRecord = {
  id: string;
  asset_type: string | null;
  manual_value: number | string | null;
  name: string;
  total_cost: number | string | null;
};

type TransferLinkPlan = {
  fingerprint: string;
  transferGroupId: string;
  linkedTransactionId: string | null;
  counterpartyContainerId: string | null;
  counterpartyAccountId: string | null;
};

export async function getCsvImportContext() {
  const workspace = await getCurrentWorkspace();
  await ensureCashFinancialContainer(workspace.id);
  const containers = (await listFinancialContainers(workspace.id))
    .filter((container) => container.id !== 'unassigned')
    .map(mapContainerToImportOption);

  return {
    containers,
    workspace
  } satisfies CsvImportContext;
}

export async function parseImportFile(file: File, fallbackCurrency: string) {
  return new ImportEngine().parseFile(file, fallbackCurrency);
}

export async function analyzeImportPreview(params: {
  workspaceId: string;
  container: ImportContainerOption;
  transactions: ParsedCsvTransaction[];
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const accountId = await findFinancialAccountForContainer({
    container: params.container,
    workspaceId: params.workspaceId
  });

  if (!accountId) {
    const items = params.transactions.map((transaction) => ({
      matchedTransaction: null,
      reason: null,
      status: 'new',
      transaction
    })) satisfies ImportPreviewItem[];

    return buildPreviewAnalysis(items);
  }

  const existingTransactions = await getExistingComparableTransactions({
    accountId,
    transactions: params.transactions,
    workspaceId: params.workspaceId
  });
  const strictExistingMatches = await getStrictExistingHashMatches({
    accountId,
    transactions: params.transactions,
    workspaceId: params.workspaceId
  });
  const seenNewTransactions: ComparableTransaction[] = [];
  const transactionsWithImportHash = await Promise.all(
    params.transactions.map(async (transaction) => ({
      importHash: await createImportHash({
        accountId,
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.description,
        workspaceId: params.workspaceId
      }),
      transaction
    }))
  );
  const items = transactionsWithImportHash.map(({ importHash, transaction }) => {
    const strictDuplicate =
      strictExistingMatches.get(transaction.fingerprint) ??
      strictExistingMatches.get(importHash);

    if (strictDuplicate) {
      return {
        matchedTransaction: strictDuplicate,
        reason: 'Duplicado exacto por fingerprint/import_hash activo',
        status: 'duplicate',
        transaction
      } satisfies ImportPreviewItem;
    }

    const comparableTransaction = mapImportToComparableTransaction({
      accountId,
      importHash,
      transaction
    });
    const existingDuplicate = findEquivalentTransaction(
      comparableTransaction,
      existingTransactions
    );

    if (existingDuplicate) {
      return {
        matchedTransaction:
          existingDuplicate.transaction as ExistingComparableTransaction,
        reason: existingDuplicate.reason,
        status: 'duplicate',
        transaction
      } satisfies ImportPreviewItem;
    }

    const duplicateInFile = findEquivalentTransaction(
      comparableTransaction,
      seenNewTransactions
    );

    if (duplicateInFile) {
      return {
        matchedTransaction: null,
        reason: 'Duplicado dentro del archivo seleccionado',
        status: 'duplicate',
        transaction
      } satisfies ImportPreviewItem;
    }

    const suspicious = findSuspiciousTransaction(
      comparableTransaction,
      existingTransactions
    );

    if (suspicious) {
      return {
        matchedTransaction: suspicious.transaction as ExistingComparableTransaction,
        reason: suspicious.reason,
        status: 'suspicious',
        transaction
      } satisfies ImportPreviewItem;
    }

    seenNewTransactions.push(comparableTransaction);

    return {
      matchedTransaction: null,
      reason: null,
      status: 'new',
      transaction
    } satisfies ImportPreviewItem;
  });

  return buildPreviewAnalysis(items);
}

export async function saveCsvImport(params: {
  workspaceId: string;
  container: ImportContainerOption;
  fileName: string;
  transactions: ParsedCsvTransaction[];
  ignoredRows?: IgnoredImportRow[];
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const accountId = await ensureFinancialAccountForContainer({
    container: params.container,
    workspaceId: params.workspaceId
  });
  await ensureCashFinancialContainer(params.workspaceId);
  const containers = (await listFinancialContainers(params.workspaceId))
    .filter((container) => container.id !== 'unassigned')
    .map(mapContainerToImportOption);
  const classifiedTransactions = await classifyImportedTransactions(
    params.workspaceId,
    params.transactions
  );
  const transactionsWithImportHash = await Promise.all(
    classifiedTransactions.map(async (transaction) => ({
      ...transaction,
      importHash: await createImportHash({
        accountId,
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.description,
        workspaceId: params.workspaceId
      })
    }))
  );
  const fingerprints = transactionsWithImportHash.map(
    (transaction) => transaction.fingerprint
  );
  const importHashes = transactionsWithImportHash.map(
    (transaction) => transaction.importHash
  );
  const [existingByFingerprint, existingByImportHash] = await Promise.all([
    supabase
      .from('transactions')
      .select('fingerprint, import_hash')
      .eq('workspace_id', params.workspaceId)
      .is('deleted_at', null)
      .in('fingerprint', fingerprints)
      .returns<ExistingHashRecord[]>(),
    supabase
      .from('transactions')
      .select('fingerprint, import_hash')
      .eq('workspace_id', params.workspaceId)
      .is('deleted_at', null)
      .in('import_hash', importHashes)
      .returns<ExistingHashRecord[]>()
  ]);

  if (existingByFingerprint.error) {
    throw existingByFingerprint.error;
  }

  if (existingByImportHash.error) {
    throw existingByImportHash.error;
  }

  const existingTransactions = [
    ...existingByFingerprint.data,
    ...existingByImportHash.data
  ];

  const existingFingerprints = new Set(
    existingTransactions
      .map((transaction) => transaction.fingerprint)
      .filter((fingerprint): fingerprint is string => Boolean(fingerprint))
  );
  const existingImportHashes = new Set(
    existingTransactions
      .map((transaction) => transaction.import_hash)
      .filter((importHash): importHash is string => Boolean(importHash))
  );
  const candidateTransactions = transactionsWithImportHash.filter(
    (transaction) =>
      !existingFingerprints.has(transaction.fingerprint) &&
      !existingImportHashes.has(transaction.importHash)
  );
  const strictDuplicateCount =
    transactionsWithImportHash.length - candidateTransactions.length;
  const robustDuplicateAnalysis = await analyzeClassifiedDuplicates({
    accountId,
    transactions: candidateTransactions,
    workspaceId: params.workspaceId
  });
  const robustDuplicateFingerprints = new Set(
    robustDuplicateAnalysis.items
      .filter((item) => item.status !== 'new')
      .map((item) => item.transaction.fingerprint)
  );
  const equivalentDuplicateCount = robustDuplicateAnalysis.items.filter(
    (item) => item.status === 'duplicate'
  ).length;
  const robustSuspiciousCount = robustDuplicateAnalysis.items.filter(
    (item) => item.status === 'suspicious'
  ).length;
  const robustNewTransactions = candidateTransactions.filter(
    (transaction) => !robustDuplicateFingerprints.has(transaction.fingerprint)
  );
  const existingAutoCounterparts = await findExistingAutoCounterparts({
    accountId,
    transactions: robustNewTransactions,
    workspaceId: params.workspaceId
  });
  const newTransactions = robustNewTransactions.filter(
    (transaction) => !existingAutoCounterparts.has(transaction.fingerprint)
  );
  const autoCounterpartDuplicateCount =
    robustNewTransactions.length - newTransactions.length;
  const sourceFormat = transactionsWithImportHash[0]?.sourceFormat ?? 'unknown';
  const duplicateCount =
    strictDuplicateCount + equivalentDuplicateCount + autoCounterpartDuplicateCount;
  const pendingReviewCount = newTransactions.filter(
    (transaction) => !transaction.isReviewed
  ).length;
  const transferPlans = await createTransferLinkPlans({
    accountId,
    containers,
    selectedContainer: params.container,
    transactions: newTransactions,
    workspaceId: params.workspaceId
  });
  const transferPlansByFingerprint = new Map(
    transferPlans.map((plan) => [plan.fingerprint, plan])
  );

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      completed_at: new Date().toISOString(),
      metadata: {
        duplicate_rows: duplicateCount,
        file_name: params.fileName,
        ignored_rows: params.ignoredRows?.length ?? 0,
        imported_rows: newTransactions.length,
        pending_review_rows: pendingReviewCount,
        parser: sourceFormat,
        suspicious_rows: robustSuspiciousCount,
        total_rows: transactionsWithImportHash.length
      },
      source_type: 'csv',
      started_at: new Date().toISOString(),
      status: 'completed',
      workspace_id: params.workspaceId
    })
    .select('id')
    .single<ImportBatchRecord>();

  if (batchError) {
    throw batchError;
  }

  if (newTransactions.length === 0) {
    return {
      duplicateCount,
      ignoredCount: params.ignoredRows?.length ?? 0,
      importedCount: 0,
      pendingReviewCount: 0,
      suspiciousCount: robustSuspiciousCount
    } satisfies CsvSaveResult;
  }

  const { data: rawRecords, error: rawError } = await supabase
    .from('raw_import_records')
    .insert(
      newTransactions.map((transaction) => ({
        import_batch_id: batch.id,
        normalized_payload: {
          amount: transaction.amount,
          currency: transaction.currency,
          date: transaction.date,
          description: transaction.description,
          direction: transaction.direction,
          import_hash: transaction.importHash,
          is_reviewed: transaction.isReviewed,
          movement_type: transaction.movementType,
          source_format: transaction.sourceFormat,
          transaction_type:
            transaction.transactionType ??
            mapMovementTypeToTransactionType(transaction.movementType),
          type: transaction.type
        },
        raw_payload: transaction.rawRow,
        record_hash: transaction.fingerprint,
        source_record_id: transaction.fingerprint,
        status: 'imported',
        workspace_id: params.workspaceId
      }))
    )
    .select('id, record_hash')
    .returns<RawImportRecord[]>();

  if (rawError) {
    throw rawError;
  }

  const rawRecordsByHash = new Map(
    rawRecords.map((record) => [record.record_hash, record.id])
  );

  const { data: insertedTransactions, error: transactionsError } = await supabase
    .from('transactions')
    .insert(
      newTransactions.map((transaction) => {
        const transferPlan = transferPlansByFingerprint.get(transaction.fingerprint);

        return {
          account_id: accountId,
          amount: Math.abs(transaction.amount),
          booked_at: `${transaction.date}T12:00:00.000Z`,
          category_id: transaction.categoryId,
          confidence_score: 0.92,
          counterparty_container_id: transferPlan?.counterpartyContainerId ?? null,
          currency: transaction.currency,
          description: transaction.description,
          direction: transaction.direction,
          fingerprint: transaction.fingerprint,
          import_batch_id: batch.id,
          import_hash: transaction.importHash,
          is_reviewed: transaction.isReviewed,
          linked_transaction_id: transferPlan?.linkedTransactionId ?? null,
          movement_type: transaction.movementType,
          occurred_at: `${transaction.date}T12:00:00.000Z`,
          raw_import_record_id: rawRecordsByHash.get(transaction.fingerprint),
          status: 'posted',
          transaction_type: mapMovementTypeToTransactionType(transaction.movementType),
          transfer_group_id: transferPlan?.transferGroupId ?? null,
          workspace_id: params.workspaceId
        };
      })
    )
    .select('id, fingerprint, transfer_group_id')
    .returns<InsertedTransactionRecord[]>();

  if (transactionsError) {
    throw transactionsError;
  }

  await linkMatchedTransferTransactions({
    accountId,
    batchId: batch.id,
    container: params.container,
    insertedTransactions,
    plansByFingerprint: transferPlansByFingerprint,
    selectedContainerId: params.container.id,
    workspaceId: params.workspaceId
  });
  await applyAssetPurchasesToContainer({
    containerId: params.container.id,
    transactions: newTransactions,
    workspaceId: params.workspaceId
  });

  return {
    duplicateCount,
    ignoredCount: params.ignoredRows?.length ?? 0,
    importedCount: newTransactions.length,
    pendingReviewCount,
    suspiciousCount: robustSuspiciousCount
  } satisfies CsvSaveResult;
}

async function analyzeClassifiedDuplicates(input: {
  workspaceId: string;
  accountId: string;
  transactions: (ClassifiedImportTransaction & { importHash: string })[];
}) {
  const existingTransactions = await getExistingComparableTransactions({
    accountId: input.accountId,
    transactions: input.transactions,
    workspaceId: input.workspaceId
  });
  const seenNewTransactions: ComparableTransaction[] = [];
  const items: ClassifiedPreviewItem[] = input.transactions.map((transaction) => {
    const comparableTransaction = mapClassifiedToComparableTransaction({
      accountId: input.accountId,
      transaction
    });
    const existingDuplicate = findEquivalentTransaction(
      comparableTransaction,
      existingTransactions
    );

    if (existingDuplicate) {
      return {
        matchedTransaction:
          existingDuplicate.transaction as ExistingComparableTransaction,
        reason: existingDuplicate.reason,
        status: 'duplicate',
        transaction
      } satisfies ClassifiedPreviewItem;
    }

    const duplicateInFile = findEquivalentTransaction(
      comparableTransaction,
      seenNewTransactions
    );

    if (duplicateInFile) {
      return {
        matchedTransaction: null,
        reason: 'Duplicado dentro del archivo seleccionado',
        status: 'duplicate',
        transaction
      } satisfies ClassifiedPreviewItem;
    }

    const suspicious = findSuspiciousTransaction(
      comparableTransaction,
      existingTransactions
    );

    if (suspicious) {
      return {
        matchedTransaction: suspicious.transaction as ExistingComparableTransaction,
        reason: suspicious.reason,
        status: 'suspicious',
        transaction
      } satisfies ClassifiedPreviewItem;
    }

    seenNewTransactions.push(comparableTransaction);

    return {
      matchedTransaction: null,
      reason: null,
      status: 'new',
      transaction
    } satisfies ClassifiedPreviewItem;
  });

  return buildPreviewAnalysis(items);
}

async function getExistingComparableTransactions(input: {
  workspaceId: string;
  accountId: string;
  transactions: Array<{ date: string }>;
}) {
  if (!supabase || input.transactions.length === 0) {
    return [];
  }

  const dates = input.transactions.map((transaction) => transaction.date).sort();
  const from = new Date(`${dates[0]}T00:00:00.000Z`);
  const to = new Date(`${dates[dates.length - 1]}T23:59:59.999Z`);
  from.setUTCDate(from.getUTCDate() - 2);
  to.setUTCDate(to.getUTCDate() + 2);

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, account_id, amount, direction, occurred_at, description, fingerprint, import_hash'
    )
    .eq('workspace_id', input.workspaceId)
    .eq('account_id', input.accountId)
    .eq('status', 'posted')
    .is('deleted_at', null)
    .gte('occurred_at', from.toISOString())
    .lte('occurred_at', to.toISOString())
    .returns<ExistingTransactionRecord[]>();

  if (error) {
    throw error;
  }

  return data.map((transaction) => mapExistingToComparableTransaction(transaction));
}

async function getStrictExistingHashMatches(input: {
  workspaceId: string;
  accountId: string;
  transactions: ParsedCsvTransaction[];
}) {
  if (!supabase || input.transactions.length === 0) {
    return new Map<string, ExistingComparableTransaction>();
  }

  const importHashes = await Promise.all(
    input.transactions.map((transaction) =>
      createImportHash({
        accountId: input.accountId,
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.description,
        workspaceId: input.workspaceId
      })
    )
  );
  const fingerprints = input.transactions.map((transaction) => transaction.fingerprint);
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, account_id, amount, direction, occurred_at, description, fingerprint, import_hash'
    )
    .eq('workspace_id', input.workspaceId)
    .eq('account_id', input.accountId)
    .eq('status', 'posted')
    .is('deleted_at', null)
    .or(
      [
        `fingerprint.in.(${fingerprints.map(escapePostgrestListValue).join(',')})`,
        `import_hash.in.(${importHashes.map(escapePostgrestListValue).join(',')})`
      ].join(',')
    )
    .returns<ExistingTransactionRecord[]>();

  if (error) {
    throw error;
  }

  const matches = new Map<string, ExistingComparableTransaction>();

  data.forEach((transaction) => {
    const comparable = mapExistingToComparableTransaction(transaction);

    if (transaction.fingerprint) {
      matches.set(transaction.fingerprint, comparable);
    }

    if (transaction.import_hash) {
      matches.set(transaction.import_hash, comparable);
    }
  });

  return matches;
}

function mapImportToComparableTransaction(input: {
  accountId: string;
  importHash?: string | null;
  transaction: ParsedCsvTransaction;
}) {
  return {
    accountId: input.accountId,
    amount: input.transaction.amount,
    date: input.transaction.date,
    description: input.transaction.description,
    direction: input.transaction.direction,
    stableReference: input.importHash ?? null
  } satisfies ComparableTransaction;
}

function mapClassifiedToComparableTransaction(input: {
  accountId: string;
  transaction: ClassifiedImportTransaction & { importHash?: string };
}) {
  return {
    accountId: input.accountId,
    amount: input.transaction.amount,
    date: input.transaction.date,
    description: input.transaction.description,
    direction: input.transaction.direction,
    stableReference: input.transaction.importHash ?? null
  } satisfies ComparableTransaction;
}

function mapExistingToComparableTransaction(
  transaction: ExistingTransactionRecord,
  accountName = 'Cuenta'
) {
  return {
    accountId: transaction.account_id,
    accountName,
    amount: Number(transaction.amount),
    date: transaction.occurred_at.slice(0, 10),
    description: transaction.description,
    direction: transaction.direction,
    fingerprint: transaction.fingerprint,
    id: transaction.id,
    importHash: transaction.import_hash,
    occurredAt: transaction.occurred_at,
    stableReference: transaction.import_hash
  } satisfies ExistingComparableTransaction;
}

function buildPreviewAnalysis<TItem extends { status: ImportDuplicateStatus }>(
  items: TItem[]
) {
  return {
    duplicateCount: items.filter((item) => item.status === 'duplicate').length,
    items,
    newCount: items.filter((item) => item.status === 'new').length,
    suspiciousCount: items.filter((item) => item.status === 'suspicious').length
  } satisfies {
    duplicateCount: number;
    items: TItem[];
    newCount: number;
    suspiciousCount: number;
  };
}

function escapePostgrestListValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function applyAssetPurchasesToContainer(input: {
  workspaceId: string;
  containerId: string;
  transactions: ClassifiedImportTransaction[];
}) {
  const purchases = input.transactions.filter(
    (transaction) =>
      transaction.movementType === 'investment' ||
      transaction.transactionType === 'asset_purchase'
  );

  if (!supabase || purchases.length === 0) {
    return;
  }

  for (const purchase of purchases) {
    const amount = Math.abs(purchase.amount);
    const assetName = getAssetNameFromPurchase(purchase);
    const existingAsset = await findContainerAsset({
      assetName,
      containerId: input.containerId,
      workspaceId: input.workspaceId
    });
    const nextTotalCost = Number(existingAsset?.total_cost ?? 0) + amount;
    const nextManualValue = Number(existingAsset?.manual_value ?? 0) || nextTotalCost;

    if (existingAsset) {
      const { error } = await supabase
        .from('assets')
        .update({
          manual_value: nextManualValue,
          total_cost: nextTotalCost
        })
        .eq('id', existingAsset.id)
        .eq('workspace_id', input.workspaceId);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.from('assets').insert({
        asset_type: mapCategoryNameToAssetType(purchase.categoryName),
        container_id: input.containerId,
        currency: purchase.currency.toUpperCase(),
        manual_value: amount,
        metadata: {
          source: 'asset_purchase_import'
        },
        name: assetName,
        provider: null,
        status: 'active',
        total_cost: amount,
        type: mapCategoryNameToLegacyAssetType(purchase.categoryName),
        workspace_id: input.workspaceId
      });

      if (error) {
        throw error;
      }
    }

    await decreaseContainerCashAsset({
      amount,
      containerId: input.containerId,
      workspaceId: input.workspaceId
    });
  }
}

async function findContainerAsset(input: {
  workspaceId: string;
  containerId: string;
  assetName: string;
}) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('assets')
    .select('id, name, asset_type, manual_value, total_cost')
    .eq('workspace_id', input.workspaceId)
    .eq('container_id', input.containerId)
    .ilike('name', input.assetName)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle<AssetCostRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function decreaseContainerCashAsset(input: {
  workspaceId: string;
  containerId: string;
  amount: number;
}) {
  if (!supabase) {
    return;
  }

  const { data, error } = await supabase
    .from('assets')
    .select('id, name, asset_type, manual_value, total_cost')
    .eq('workspace_id', input.workspaceId)
    .eq('container_id', input.containerId)
    .eq('asset_type', 'cash')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle<AssetCostRecord>();

  if (error) {
    throw error;
  }

  if (!data) {
    return;
  }

  const nextValue = Math.max(0, Number(data.manual_value ?? 0) - input.amount);
  const { error: updateError } = await supabase
    .from('assets')
    .update({
      manual_value: nextValue
    })
    .eq('id', data.id)
    .eq('workspace_id', input.workspaceId);

  if (updateError) {
    throw updateError;
  }
}

function getAssetNameFromPurchase(transaction: ClassifiedImportTransaction) {
  return transaction.description;
}

function mapCategoryNameToAssetType(categoryName: string | null) {
  const normalizedName = normalizeHeader(categoryName ?? '');

  if (normalizedName.includes('cripto')) {
    return 'crypto';
  }

  if (normalizedName.includes('etf')) {
    return 'etf';
  }

  if (normalizedName.includes('accion')) {
    return 'stock';
  }

  if (normalizedName.includes('oro')) {
    return 'gold';
  }

  return 'fund';
}

function mapCategoryNameToLegacyAssetType(categoryName: string | null) {
  const assetType = mapCategoryNameToAssetType(categoryName);

  if (assetType === 'crypto') {
    return 'crypto';
  }

  return 'security';
}

async function findExistingAutoCounterparts(input: {
  workspaceId: string;
  accountId: string;
  transactions: (ClassifiedImportTransaction & { importHash: string })[];
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const transferTransactions = input.transactions.filter(
    (transaction) => transaction.movementType === 'transfer'
  );

  if (transferTransactions.length === 0) {
    return new Set<string>();
  }

  const dates = transferTransactions.map((transaction) => transaction.date).sort();
  const from = `${dates[0]}T00:00:00.000Z`;
  const to = `${dates[dates.length - 1]}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, direction, occurred_at')
    .eq('workspace_id', input.workspaceId)
    .eq('account_id', input.accountId)
    .eq('status', 'posted')
    .eq('movement_type', 'transfer')
    .not('linked_transaction_id', 'is', null)
    .like('fingerprint', 'internal-transfer-counterpart|%')
    .gte('occurred_at', from)
    .lte('occurred_at', to)
    .returns<AutoCounterpartRecord[]>();

  if (error) {
    throw error;
  }

  const existingKeys = new Set(
    data.map((transaction) =>
      getTransferDeduplicationKey({
        amount: Number(transaction.amount),
        date: transaction.occurred_at.slice(0, 10),
        direction: transaction.direction
      })
    )
  );

  return new Set(
    transferTransactions
      .filter((transaction) =>
        existingKeys.has(
          getTransferDeduplicationKey({
            amount: transaction.amount,
            date: transaction.date,
            direction: transaction.direction
          })
        )
      )
      .map((transaction) => transaction.fingerprint)
  );
}

function getTransferDeduplicationKey(input: {
  date: string;
  amount: number;
  direction: 'inflow' | 'outflow';
}) {
  return [input.date, input.direction, Math.abs(input.amount).toFixed(4)].join('|');
}

async function createTransferLinkPlans(input: {
  workspaceId: string;
  accountId: string;
  selectedContainer: ImportContainerOption;
  containers: ImportContainerOption[];
  transactions: ClassifiedImportTransaction[];
}) {
  const plans: TransferLinkPlan[] = [];

  for (const transaction of input.transactions) {
    if (transaction.movementType !== 'transfer') {
      continue;
    }

    const transferGroupId = crypto.randomUUID();
    const match = await findMatchingTransfer({
      accountId: input.accountId,
      amount: transaction.amount,
      date: transaction.date,
      direction: transaction.direction,
      workspaceId: input.workspaceId
    });
    const counterparty = match
      ? null
      : resolveCounterpartyContainer({
          containers: input.containers,
          description: transaction.description,
          selectedContainer: input.selectedContainer
        });
    const counterpartyAccountId = counterparty
      ? await ensureFinancialAccountForContainer({
          container: counterparty,
          workspaceId: input.workspaceId
        })
      : null;

    plans.push({
      counterpartyAccountId,
      counterpartyContainerId: counterparty?.id ?? null,
      fingerprint: transaction.fingerprint,
      linkedTransactionId: match?.id ?? null,
      transferGroupId: match?.transfer_group_id ?? transferGroupId
    });
  }

  return plans;
}

async function findMatchingTransfer(input: {
  workspaceId: string;
  accountId: string;
  date: string;
  amount: number;
  direction: 'inflow' | 'outflow';
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const occurredAt = new Date(`${input.date}T12:00:00.000Z`);
  const from = new Date(occurredAt);
  from.setUTCDate(from.getUTCDate() - 3);
  const to = new Date(occurredAt);
  to.setUTCDate(to.getUTCDate() + 3);

  const { data, error } = await supabase
    .from('transactions')
    .select('id, account_id, occurred_at, amount, direction, transfer_group_id')
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'posted')
    .eq('movement_type', 'transfer')
    .eq('amount', Math.abs(input.amount))
    .eq('direction', input.direction === 'inflow' ? 'outflow' : 'inflow')
    .neq('account_id', input.accountId)
    .is('linked_transaction_id', null)
    .gte('occurred_at', from.toISOString())
    .lte('occurred_at', to.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(1)
    .returns<TransferCandidateRecord[]>();

  if (error) {
    throw error;
  }

  return data[0] ?? null;
}

async function linkMatchedTransferTransactions(input: {
  workspaceId: string;
  accountId: string;
  batchId: string;
  container: ImportContainerOption;
  selectedContainerId: string;
  insertedTransactions: InsertedTransactionRecord[];
  plansByFingerprint: Map<string, TransferLinkPlan>;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const client = supabase;

  await Promise.all(
    input.insertedTransactions.map(async (transaction) => {
      const plan = input.plansByFingerprint.get(transaction.fingerprint);

      if (!plan?.linkedTransactionId) {
        if (plan?.counterpartyAccountId) {
          await createCounterpartyTransferTransaction({
            accountId: input.accountId,
            batchId: input.batchId,
            container: input.container,
            counterpartyAccountId: plan.counterpartyAccountId,
            counterpartyContainerId: plan.counterpartyContainerId,
            insertedTransaction: transaction,
            plan,
            workspaceId: input.workspaceId
          });
        }

        return;
      }

      const { error } = await client
        .from('transactions')
        .update({
          counterparty_container_id: input.selectedContainerId,
          linked_transaction_id: transaction.id,
          transfer_group_id: plan.transferGroupId
        })
        .eq('id', plan.linkedTransactionId)
        .eq('workspace_id', input.workspaceId);

      if (error) {
        throw error;
      }
    })
  );
}

async function createCounterpartyTransferTransaction(input: {
  workspaceId: string;
  accountId: string;
  batchId: string;
  container: ImportContainerOption;
  counterpartyAccountId: string;
  counterpartyContainerId: string | null;
  insertedTransaction: InsertedTransactionRecord;
  plan: TransferLinkPlan;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data: source, error: sourceError } = await supabase
    .from('transactions')
    .select('amount, currency, direction, occurred_at, booked_at, description')
    .eq('id', input.insertedTransaction.id)
    .eq('workspace_id', input.workspaceId)
    .single<{
      amount: number | string;
      currency: string;
      direction: 'inflow' | 'outflow';
      occurred_at: string;
      booked_at: string | null;
      description: string;
    }>();

  if (sourceError) {
    throw sourceError;
  }

  const counterpartyDirection = source.direction === 'inflow' ? 'outflow' : 'inflow';
  const counterpartyDescription =
    source.direction === 'outflow'
      ? `Transferencia interna desde ${input.container.label}`
      : `Transferencia interna hacia ${input.container.label}`;
  const fingerprint = [
    'internal-transfer-counterpart',
    input.workspaceId,
    input.insertedTransaction.fingerprint,
    input.counterpartyAccountId
  ].join('|');
  const importHash = await createImportHash({
    accountId: input.counterpartyAccountId,
    amount: Number(source.amount),
    date: source.occurred_at.slice(0, 10),
    description: counterpartyDescription,
    workspaceId: input.workspaceId
  });

  const { data: existingCounterpart, error: existingError } = await supabase
    .from('transactions')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('account_id', input.counterpartyAccountId)
    .eq('fingerprint', fingerprint)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw existingError;
  }

  let counterpartId = existingCounterpart?.id ?? null;

  if (!counterpartId) {
    const { data: insertedCounterpart, error: insertError } = await supabase
      .from('transactions')
      .insert({
        account_id: input.counterpartyAccountId,
        amount: Number(source.amount),
        booked_at: source.booked_at,
        category_id: null,
        confidence_score: 0.9,
        counterparty_container_id: input.container.id,
        currency: source.currency,
        description: counterpartyDescription,
        direction: counterpartyDirection,
        fingerprint,
        import_batch_id: input.batchId,
        import_hash: importHash,
        is_reviewed: true,
        linked_transaction_id: input.insertedTransaction.id,
        movement_type: 'transfer',
        occurred_at: source.occurred_at,
        raw_import_record_id: null,
        status: 'posted',
        transaction_type: 'investment_transfer',
        transfer_group_id: input.plan.transferGroupId,
        workspace_id: input.workspaceId
      })
      .select('id')
      .single<{ id: string }>();

    if (insertError) {
      throw insertError;
    }

    counterpartId = insertedCounterpart.id;
  } else {
    const { error: relinkError } = await supabase
      .from('transactions')
      .update({
        counterparty_container_id: input.container.id,
        linked_transaction_id: input.insertedTransaction.id,
        transfer_group_id: input.plan.transferGroupId
      })
      .eq('id', counterpartId)
      .eq('workspace_id', input.workspaceId);

    if (relinkError) {
      throw relinkError;
    }
  }

  if (!counterpartId) {
    throw new Error('No se pudo crear la contrapartida de la transferencia.');
  }

  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      counterparty_container_id: input.counterpartyContainerId,
      linked_transaction_id: counterpartId,
      transfer_group_id: input.plan.transferGroupId
    })
    .eq('id', input.insertedTransaction.id)
    .eq('workspace_id', input.workspaceId);

  if (updateError) {
    throw updateError;
  }
}

function resolveCounterpartyContainer(input: {
  selectedContainer: ImportContainerOption;
  containers: ImportContainerOption[];
  description: string;
}) {
  const normalizedDescription = normalizeImportText(input.description);

  return (
    input.containers.find((container) => {
      if (container.id === input.selectedContainer.id) {
        return false;
      }

      const candidates = [
        container.institution,
        container.name,
        container.label,
        ...getContainerAliases(container)
      ]
        .filter((candidate): candidate is string => Boolean(candidate?.trim()))
        .map(normalizeImportText);

      return candidates.some(
        (candidate) => candidate.length >= 3 && normalizedDescription.includes(candidate)
      );
    }) ?? null
  );
}

function getContainerAliases(container: ImportContainerOption) {
  const label = `${container.institution ?? ''} ${container.name}`.toLowerCase();

  if (label.includes('myinvestor')) {
    return ['my investor', 'myinvestor'];
  }

  if (label.includes('trade')) {
    return ['trade republic', 'traderepublic'];
  }

  return [];
}

function normalizeImportText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapContainerToImportOption(container: FinancialContainer) {
  return {
    containerType: container.containerType,
    currency: container.currency,
    id: container.id,
    institution: container.institution,
    label: getContainerLabel(container),
    name: container.name
  } satisfies ImportContainerOption;
}

async function ensureFinancialAccountForContainer(input: {
  workspaceId: string;
  container: ImportContainerOption;
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
      name: input.container.label,
      status: 'active',
      type: mapContainerTypeToAccountType(input.container.containerType),
      workspace_id: input.workspaceId
    })
    .select('id')
    .single<{ id: string }>();

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
  container: ImportContainerOption;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const candidateNames = [
    input.container.label,
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

function getContainerLabel(container: FinancialContainer) {
  if (
    container.institution &&
    container.institution.trim().toLowerCase() !== container.name.trim().toLowerCase()
  ) {
    return `${container.institution} / ${container.name}`;
  }

  return container.name;
}

async function createImportHash(input: {
  workspaceId: string;
  accountId: string;
  date: string;
  amount: number;
  description: string;
}) {
  const payload = [
    input.workspaceId,
    input.accountId,
    input.date,
    input.amount.toFixed(4),
    normalizeHeader(input.description)
  ].join('|');

  if (crypto.subtle) {
    const bytes = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  let hash = 0;

  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash << 5) - hash + payload.charCodeAt(index);
    hash |= 0;
  }

  return `fallback-${Math.abs(hash).toString(16)}`;
}
