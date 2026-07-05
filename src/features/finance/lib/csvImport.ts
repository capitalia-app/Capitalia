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
import { ImportEngine } from '@/features/finance/lib/import/ImportEngine';
import type {
  IgnoredImportRow,
  ImportParseResult,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import { normalizeHeader } from '@/features/finance/lib/import/utils';
import {
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
};

type ExistingTransactionRecord = {
  fingerprint: string | null;
  import_hash: string | null;
};

type TransferCandidateRecord = {
  id: string;
  account_id: string;
  occurred_at: string;
  amount: number | string;
  direction: 'inflow' | 'outflow';
  transfer_group_id: string | null;
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

type TransferLinkPlan = {
  fingerprint: string;
  transferGroupId: string;
  linkedTransactionId: string | null;
};

export async function getCsvImportContext() {
  const workspace = await getCurrentWorkspace();
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
  const transferPlans = await createTransferLinkPlans({
    accountId,
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
          counterparty_container_id: null,
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
    insertedTransactions,
    plansByFingerprint: transferPlansByFingerprint,
    selectedContainerId: params.container.id,
    workspaceId: params.workspaceId
  });

  return {
    duplicateCount,
    ignoredCount: params.ignoredRows?.length ?? 0,
    importedCount: newTransactions.length,
    pendingReviewCount
  } satisfies CsvSaveResult;
}

async function createTransferLinkPlans(input: {
  workspaceId: string;
  accountId: string;
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

    plans.push({
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
