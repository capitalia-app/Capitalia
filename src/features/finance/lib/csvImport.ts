import {
  getCurrentWorkspace,
  listFinancialAccounts,
  type FinancialAccount,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import {
  classifyImportedTransactions,
  mapMovementTypeToTransactionType
} from '@/features/finance/lib/categories';
import { ImportEngine } from '@/features/finance/lib/import/ImportEngine';
import type {
  IgnoredImportRow,
  ImportParseResult,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import { normalizeHeader } from '@/features/finance/lib/import/utils';
import { supabase } from '@/shared/lib/supabase';

export type { IgnoredImportRow, ImportParseResult, ParsedCsvTransaction };

export type CsvImportContext = {
  workspace: WorkspaceSummary;
  accounts: FinancialAccount[];
};

export type CsvSaveResult = {
  importedCount: number;
  duplicateCount: number;
  ignoredCount: number;
  pendingReviewCount: number;
};

type ExistingTransactionRecord = {
  fingerprint: string | null;
  import_hash: string | null;
};

type ImportBatchRecord = {
  id: string;
};

type RawImportRecord = {
  id: string;
  record_hash: string;
};

export async function getCsvImportContext() {
  const workspace = await getCurrentWorkspace();
  const accounts = await listFinancialAccounts(workspace.id);

  return {
    workspace,
    accounts
  } satisfies CsvImportContext;
}

export async function parseImportFile(file: File, fallbackCurrency: string) {
  return new ImportEngine().parseFile(file, fallbackCurrency);
}

export async function saveCsvImport(params: {
  workspaceId: string;
  accountId: string;
  fileName: string;
  transactions: ParsedCsvTransaction[];
  ignoredRows?: IgnoredImportRow[];
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const classifiedTransactions = await classifyImportedTransactions(
    params.workspaceId,
    params.transactions
  );
  const transactionsWithImportHash = await Promise.all(
    classifiedTransactions.map(async (transaction) => ({
      ...transaction,
      importHash: await createImportHash({
        accountId: params.accountId,
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
      .in('fingerprint', fingerprints)
      .returns<ExistingTransactionRecord[]>(),
    supabase
      .from('transactions')
      .select('fingerprint, import_hash')
      .eq('workspace_id', params.workspaceId)
      .in('import_hash', importHashes)
      .returns<ExistingTransactionRecord[]>()
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
  const newTransactions = transactionsWithImportHash.filter(
    (transaction) =>
      !existingFingerprints.has(transaction.fingerprint) &&
      !existingImportHashes.has(transaction.importHash)
  );
  const sourceFormat = transactionsWithImportHash[0]?.sourceFormat ?? 'unknown';
  const duplicateCount = transactionsWithImportHash.length - newTransactions.length;
  const pendingReviewCount = newTransactions.filter(
    (transaction) => !transaction.isReviewed
  ).length;

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
      duplicateCount: transactionsWithImportHash.length,
      ignoredCount: params.ignoredRows?.length ?? 0,
      importedCount: 0,
      pendingReviewCount: 0
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
          transaction_type: mapMovementTypeToTransactionType(transaction.movementType),
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

  const { error: transactionsError } = await supabase.from('transactions').insert(
    newTransactions.map((transaction) => ({
      account_id: params.accountId,
      amount: Math.abs(transaction.amount),
      booked_at: `${transaction.date}T12:00:00.000Z`,
      category_id: transaction.categoryId,
      confidence_score: 0.92,
      currency: transaction.currency,
      description: transaction.description,
      direction: transaction.direction,
      fingerprint: transaction.fingerprint,
      import_batch_id: batch.id,
      import_hash: transaction.importHash,
      is_reviewed: transaction.isReviewed,
      movement_type: transaction.movementType,
      occurred_at: `${transaction.date}T12:00:00.000Z`,
      raw_import_record_id: rawRecordsByHash.get(transaction.fingerprint),
      status: 'posted',
      transaction_type: mapMovementTypeToTransactionType(transaction.movementType),
      workspace_id: params.workspaceId
    }))
  );

  if (transactionsError) {
    throw transactionsError;
  }

  return {
    duplicateCount,
    ignoredCount: params.ignoredRows?.length ?? 0,
    importedCount: newTransactions.length,
    pendingReviewCount
  } satisfies CsvSaveResult;
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
