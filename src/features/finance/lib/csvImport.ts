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
};

type ExistingTransactionRecord = {
  fingerprint: string | null;
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
  const fingerprints = classifiedTransactions.map(
    (transaction) => transaction.fingerprint
  );
  const { data: existingTransactions, error: existingError } = await supabase
    .from('transactions')
    .select('fingerprint')
    .eq('workspace_id', params.workspaceId)
    .in('fingerprint', fingerprints)
    .returns<ExistingTransactionRecord[]>();

  if (existingError) {
    throw existingError;
  }

  const existingFingerprints = new Set(
    existingTransactions
      .map((transaction) => transaction.fingerprint)
      .filter((fingerprint): fingerprint is string => Boolean(fingerprint))
  );
  const newTransactions = classifiedTransactions.filter(
    (transaction) => !existingFingerprints.has(transaction.fingerprint)
  );
  const sourceFormat = classifiedTransactions[0]?.sourceFormat ?? 'unknown';

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      completed_at: new Date().toISOString(),
      metadata: {
        duplicate_rows: classifiedTransactions.length - newTransactions.length,
        file_name: params.fileName,
        ignored_rows: params.ignoredRows?.length ?? 0,
        imported_rows: newTransactions.length,
        parser: sourceFormat,
        total_rows: classifiedTransactions.length
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
      duplicateCount: classifiedTransactions.length,
      ignoredCount: params.ignoredRows?.length ?? 0,
      importedCount: 0
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
    duplicateCount: classifiedTransactions.length - newTransactions.length,
    ignoredCount: params.ignoredRows?.length ?? 0,
    importedCount: newTransactions.length
  } satisfies CsvSaveResult;
}
