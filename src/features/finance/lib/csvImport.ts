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

export type ParsedImportResult = {
  detectedFormat: string;
  transactions: ParsedCsvTransaction[];
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

type ImportSheet = {
  name: string;
  rows: string[][];
};

type HeaderMatch = {
  headerIndex: number;
  columns: {
    valueDate: number;
    date: number;
    concept: number;
    movement: number;
    amount: number;
    currency: number;
    availableBalance: number;
  };
};

type BankImportAdapter = {
  id: string;
  label: string;
  findHeader(rows: string[][]): HeaderMatch | null;
  mapRow(params: {
    row: string[];
    columns: HeaderMatch['columns'];
    headers: string[];
    rowIndex: number;
    fallbackCurrency: string;
  }): Promise<ParsedCsvTransaction | null>;
};

const bbvaAdapter: BankImportAdapter = {
  id: 'bbva_official',
  label: 'BBVA',
  findHeader: findBbvaHeader,
  mapRow: mapBbvaRow
};

const bankImportAdapters = [bbvaAdapter];

export async function getCsvImportContext() {
  const workspace = await getCurrentWorkspace();
  const accounts = await listFinancialAccounts(workspace.id);

  return {
    workspace,
    accounts
  } satisfies CsvImportContext;
}

export async function parseBbvaCsvFile(file: File, fallbackCurrency: string) {
  const sheets = await readImportSheets(file);
  const parsedImport = await parseWithAvailableAdapters(
    sheets,
    fallbackCurrency,
    isExcelFile(file) ? 'excel' : 'csv'
  );

  if (parsedImport.transactions.length === 0) {
    throw new Error('No se encontraron movimientos importables en el archivo.');
  }

  return parsedImport satisfies ParsedImportResult;
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
        parser: 'bbva_official',
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
      confidence_score: 0.92
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

async function readImportSheets(file: File) {
  if (isExcelFile(file)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: false,
      raw: false
    });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[firstSheetName];

    if (!sheet) {
      return [];
    }

    return [
      {
        name: firstSheetName,
        rows: normalizeRows(
          XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            blankrows: false,
            defval: '',
            raw: false
          })
        )
      }
    ].filter((importSheet) => importSheet.rows.length > 0);
  }

  return [
    {
      name: file.name,
      rows: parseCsv(await file.text())
    }
  ];
}

async function parseWithAvailableAdapters(
  sheets: ImportSheet[],
  fallbackCurrency: string,
  fileKind: 'csv' | 'excel'
) {
  for (const adapter of bankImportAdapters) {
    for (const sheet of sheets) {
      const headerMatch = adapter.findHeader(sheet.rows);

      if (!headerMatch) {
        continue;
      }

      const headers = sheet.rows[headerMatch.headerIndex] ?? [];
      const dataRows = sheet.rows
        .slice(headerMatch.headerIndex + 1)
        .filter((row) => row.some((cell) => cell.trim()));
      const transactions = (
        await Promise.all(
          dataRows.map((row, rowIndex) =>
            adapter.mapRow({
              row,
              columns: headerMatch.columns,
              headers,
              rowIndex,
              fallbackCurrency
            })
          )
        )
      ).filter((transaction): transaction is ParsedCsvTransaction =>
        Boolean(transaction)
      );

      if (transactions.length > 0) {
        return {
          detectedFormat: `${adapter.label} ${fileKind === 'excel' ? 'Excel' : 'CSV'}`,
          transactions
        } satisfies ParsedImportResult;
      }
    }
  }

  throw new Error(
    'Formato no reconocido. Capitalia espera el CSV o Excel oficial de BBVA con columnas Valor, Fecha, Concepto, Movimiento, Importe, Divisa y Disponible.'
  );
}

function findBbvaHeader(rows: string[][]) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const normalizedRow = rows[rowIndex]?.map(normalizeHeader) ?? [];
    const columns = {
      valueDate: findExactColumn(normalizedRow, ['valor', 'fecha valor', 'f valor']),
      date: findExactColumn(normalizedRow, ['fecha', 'fecha operacion']),
      concept: findExactColumn(normalizedRow, ['concepto']),
      movement: findExactColumn(normalizedRow, ['movimiento']),
      amount: findExactColumn(normalizedRow, ['importe']),
      currency: findExactColumn(normalizedRow, ['divisa', 'moneda']),
      availableBalance: findExactColumn(normalizedRow, ['disponible'])
    };

    if (
      columns.date !== -1 &&
      columns.amount !== -1 &&
      columns.currency !== -1 &&
      (columns.concept !== -1 || columns.movement !== -1)
    ) {
      return {
        headerIndex: rowIndex,
        columns
      } satisfies HeaderMatch;
    }
  }

  return null;
}

async function mapBbvaRow(params: {
  row: string[];
  columns: HeaderMatch['columns'];
  headers: string[];
  rowIndex: number;
  fallbackCurrency: string;
}) {
  const date = parseDateCell(getCell(params.row, params.columns.date));
  const concept = getCell(params.row, params.columns.concept);
  const movement = getCell(params.row, params.columns.movement);
  const description = [concept, movement].filter(Boolean).join(' - ').trim();
  const amount = parseAmountCell(getCell(params.row, params.columns.amount));
  const currency = (
    getCell(params.row, params.columns.currency) ||
    params.fallbackCurrency ||
    'EUR'
  )
    .trim()
    .toUpperCase();

  if (!date && !description && !Number.isFinite(amount)) {
    return null;
  }

  if (!date || !description || !Number.isFinite(amount)) {
    throw new Error(`No se pudo leer la fila ${params.rowIndex + 1} de BBVA.`);
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
    id: `${params.rowIndex}-${fingerprint}`,
    date,
    description,
    amount,
    currency,
    direction,
    transactionType,
    fingerprint,
    raw: createRawPayload(params.headers, params.row)
  } satisfies ParsedCsvTransaction;
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

  return normalizeRows(rows);
}

function detectDelimiter(text: string) {
  const meaningfulLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 15);
  const candidates = [';', ',', '\t'];

  return candidates.reduce((bestDelimiter, delimiter) => {
    const bestCount = meaningfulLines.reduce(
      (total, line) => total + line.split(bestDelimiter).length,
      0
    );
    const candidateCount = meaningfulLines.reduce(
      (total, line) => total + line.split(delimiter).length,
      0
    );

    return candidateCount > bestCount ? delimiter : bestDelimiter;
  }, ';');
}

function normalizeRows(rows: unknown[][]) {
  return rows
    .map((row) => row.map((cell) => normalizeCellValue(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function normalizeCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/^\uFEFF/, '').trim();
}

function findExactColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) =>
    aliases.some((alias) => header === normalizeHeader(alias))
  );
}

function normalizeHeader(header: string) {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getCell(row: string[], index: number) {
  return index === -1 ? '' : (row[index] ?? '').trim();
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

function isExcelFile(file: File) {
  return (
    file.name.toLowerCase().endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
