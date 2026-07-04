import {
  getCurrentWorkspace,
  listFinancialAccounts,
  type FinancialAccount,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import { supabase } from '@/shared/lib/supabase';

export type ParsedCsvTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  direction: 'inflow' | 'outflow';
  transactionType: 'income' | 'expense' | 'transfer';
  fingerprint: string;
  raw: Record<string, string>;
};

export type CsvImportContext = {
  workspace: WorkspaceSummary;
  accounts: FinancialAccount[];
};

export type CsvSaveResult = {
  importedCount: number;
  duplicateCount: number;
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

const bbvaColumnAliases = {
  date: ['fecha operacion', 'fecha operación', 'fecha', 'f. operacion'],
  description: ['concepto', 'descripcion', 'descripción', 'movimiento'],
  amount: ['importe', 'cantidad'],
  currency: ['divisa', 'moneda']
};

export async function getCsvImportContext() {
  const workspace = await getCurrentWorkspace();
  const accounts = await listFinancialAccounts(workspace.id);

  return {
    workspace,
    accounts
  } satisfies CsvImportContext;
}

export async function parseBbvaCsvFile(file: File, fallbackCurrency: string) {
  const text = await file.text();
  const rows = parseCsv(text);

  if (rows.length < 2) {
    throw new Error('El CSV esta vacio o no contiene movimientos.');
  }

  const headers = rows[0]?.map(normalizeHeader) ?? [];
  const indexes = resolveBbvaIndexes(headers);

  if (!indexes) {
    throw new Error(
      'Formato CSV no reconocido. Por ahora Capitalia soporta CSV basico de BBVA con fecha, concepto e importe.'
    );
  }

  const parsedRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim()));
  const transactions = await Promise.all(
    parsedRows.map(async (row, index) => {
      const date = parseDateCell(row[indexes.date]);
      const description = (row[indexes.description] ?? '').trim();
      const amount = parseAmountCell(row[indexes.amount]);
      const currency = (row[indexes.currency] || fallbackCurrency || 'EUR')
        .trim()
        .toUpperCase();

      if (!date || !description || !Number.isFinite(amount)) {
        throw new Error(`No se pudo leer la fila ${index + 2} del CSV.`);
      }

      const transactionType = estimateTransactionType(description, amount);
      const direction = amount >= 0 ? 'inflow' : 'outflow';
      const fingerprint = await createTransactionFingerprint({
        date,
        description,
        amount,
        currency
      });

      return {
        id: `${index}-${fingerprint}`,
        date,
        description,
        amount,
        currency,
        direction,
        transactionType,
        fingerprint,
        raw: createRawPayload(headers, row)
      } satisfies ParsedCsvTransaction;
    })
  );

  if (transactions.length === 0) {
    throw new Error('No se encontraron movimientos importables en el CSV.');
  }

  return transactions;
}

export async function saveCsvImport(params: {
  workspaceId: string;
  accountId: string;
  fileName: string;
  transactions: ParsedCsvTransaction[];
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const fingerprints = params.transactions.map((transaction) => transaction.fingerprint);
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
  const newTransactions = params.transactions.filter(
    (transaction) => !existingFingerprints.has(transaction.fingerprint)
  );

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      workspace_id: params.workspaceId,
      source_type: 'csv',
      status: 'completed',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: {
        file_name: params.fileName,
        parser: 'bbva_basic',
        total_rows: params.transactions.length,
        imported_rows: newTransactions.length,
        duplicate_rows: params.transactions.length - newTransactions.length
      }
    })
    .select('id')
    .single<ImportBatchRecord>();

  if (batchError) {
    throw batchError;
  }

  if (newTransactions.length === 0) {
    return {
      importedCount: 0,
      duplicateCount: params.transactions.length
    } satisfies CsvSaveResult;
  }

  const { data: rawRecords, error: rawError } = await supabase
    .from('raw_import_records')
    .insert(
      newTransactions.map((transaction) => ({
        workspace_id: params.workspaceId,
        import_batch_id: batch.id,
        source_record_id: transaction.fingerprint,
        record_hash: transaction.fingerprint,
        raw_payload: transaction.raw,
        normalized_payload: {
          date: transaction.date,
          description: transaction.description,
          amount: transaction.amount,
          currency: transaction.currency,
          direction: transaction.direction,
          transaction_type: transaction.transactionType
        },
        status: 'imported'
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
      workspace_id: params.workspaceId,
      account_id: params.accountId,
      import_batch_id: batch.id,
      raw_import_record_id: rawRecordsByHash.get(transaction.fingerprint),
      amount: Math.abs(transaction.amount),
      currency: transaction.currency,
      direction: transaction.direction,
      occurred_at: `${transaction.date}T12:00:00.000Z`,
      booked_at: `${transaction.date}T12:00:00.000Z`,
      description: transaction.description,
      status: 'posted',
      transaction_type: transaction.transactionType,
      fingerprint: transaction.fingerprint,
      confidence_score: 0.82
    }))
  );

  if (transactionsError) {
    throw transactionsError;
  }

  return {
    importedCount: newTransactions.length,
    duplicateCount: params.transactions.length - newTransactions.length
  } satisfies CsvSaveResult;
}

function parseCsv(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let isInsideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && nextChar === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      isInsideQuotes = !isInsideQuotes;
      continue;
    }

    if (char === delimiter && !isInsideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !isInsideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const candidates = [';', ',', '\t'];

  return candidates.reduce((bestDelimiter, delimiter) => {
    const bestCount = firstLine.split(bestDelimiter).length;
    const candidateCount = firstLine.split(delimiter).length;

    return candidateCount > bestCount ? delimiter : bestDelimiter;
  }, ';');
}

function resolveBbvaIndexes(headers: string[]) {
  const date = findColumn(headers, bbvaColumnAliases.date);
  const description = findColumn(headers, bbvaColumnAliases.description);
  const amount = findColumn(headers, bbvaColumnAliases.amount);
  const currency = findColumn(headers, bbvaColumnAliases.currency);

  if (date === -1 || description === -1 || amount === -1) {
    return null;
  }

  return {
    date,
    description,
    amount,
    currency
  };
}

function findColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) =>
    aliases.some((alias) => header.includes(normalizeHeader(alias)))
  );
}

function normalizeHeader(header: string) {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseDateCell(value: string | undefined) {
  const cleanedValue = value?.trim();

  if (!cleanedValue) {
    return null;
  }

  const dateMatch = cleanedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (dateMatch) {
    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3];

    if (!day || !month || !year) {
      return null;
    }

    const fullYear = year.length === 2 ? `20${year}` : year;

    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const isoDate = new Date(cleanedValue);

  if (Number.isNaN(isoDate.getTime())) {
    return null;
  }

  return isoDate.toISOString().slice(0, 10);
}

function parseAmountCell(value: string | undefined) {
  if (!value) {
    return Number.NaN;
  }

  const normalizedValue = value
    .replace(/\s/g, '')
    .replace(/[€]/g, '')
    .replace(/\.(?=\d{3}(?:,|$))/g, '')
    .replace(',', '.');

  return Number(normalizedValue);
}

function estimateTransactionType(
  description: string,
  amount: number
): ParsedCsvTransaction['transactionType'] {
  const normalizedDescription = normalizeHeader(description);

  if (
    /\b(transferencia|traspaso|bizum|sepa|envio|recibido)\b/.test(normalizedDescription)
  ) {
    return 'transfer';
  }

  return amount >= 0 ? 'income' : 'expense';
}

async function createTransactionFingerprint(input: {
  date: string;
  description: string;
  amount: number;
  currency: string;
}) {
  const payload = `${input.date}|${normalizeHeader(input.description)}|${input.amount.toFixed(4)}|${input.currency}`;
  const bytes = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createRawPayload(headers: string[], row: string[]) {
  return headers.reduce<Record<string, string>>((payload, header, index) => {
    payload[header || `column_${index + 1}`] = row[index] ?? '';

    return payload;
  }, {});
}
