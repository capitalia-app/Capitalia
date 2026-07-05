import type {
  IgnoredImportRow,
  ImportParseResult,
  ImportSheet,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import {
  createRawPayload,
  createTransactionFingerprint,
  estimateTransactionType,
  getCell,
  normalizeHeader,
  parseAmountCell,
  parseDateCell,
  readImportSheets
} from '@/features/finance/lib/import/utils';

type UniversalColumns = {
  date: number;
  description: number;
  amount: number;
  balance: number;
  currency: number;
};

type CandidateTable = {
  sheet: ImportSheet;
  headerIndex: number;
  columns: UniversalColumns;
  headers: string[];
  transactions: ParsedCsvTransaction[];
  ignoredRows: IgnoredImportRow[];
};

const columnAliases = {
  amount: [
    'importe',
    'cantidad',
    'amount',
    'cargo/abono',
    'cargo abono',
    'debit/credit',
    'debit credit'
  ],
  balance: ['saldo', 'balance'],
  currency: ['divisa', 'moneda', 'currency'],
  date: [
    'fecha',
    'fecha operacion',
    'fecha valor',
    'booking date',
    'operation date',
    'transaction date'
  ],
  description: [
    'concepto',
    'movimiento',
    'descripcion',
    'description',
    'concepto operacion',
    'detalle'
  ]
} satisfies Record<keyof UniversalColumns, string[]>;

export class ImportEngine {
  async parseFile(file: File, fallbackCurrency: string) {
    const sheets = await readImportSheets(file);
    const candidates = await Promise.all(
      sheets.flatMap((sheet) =>
        sheet.rows.map((_, rowIndex) =>
          parseCandidateTable(sheet, rowIndex, fallbackCurrency)
        )
      )
    );
    const bestCandidate = candidates
      .filter((candidate): candidate is CandidateTable => candidate !== null)
      .sort((first, second) => second.transactions.length - first.transactions.length)[0];

    if (!bestCandidate || bestCandidate.transactions.length === 0) {
      throw new Error(
        'Formato no reconocido. No se encontro una tabla con columnas de fecha, descripcion e importe.'
      );
    }

    return {
      ignoredRows: bestCandidate.ignoredRows,
      label: 'Importador universal',
      sourceFormat: 'Importador universal',
      transactions: bestCandidate.transactions
    } satisfies ImportParseResult;
  }
}

async function parseCandidateTable(
  sheet: ImportSheet,
  headerIndex: number,
  fallbackCurrency: string
) {
  const headers = sheet.rows[headerIndex] ?? [];
  const columns = detectColumns(headers);

  if (!columns) {
    return null;
  }

  const transactions: ParsedCsvTransaction[] = [];
  const ignoredRows: IgnoredImportRow[] = [];
  const dataRows = sheet.rows.slice(headerIndex + 1);

  for (let rowOffset = 0; rowOffset < dataRows.length; rowOffset += 1) {
    const row = dataRows[rowOffset];

    if (!row || !row.some((cell) => cell.trim())) {
      continue;
    }

    const parsedRow = await parseMovementRow({
      columns,
      fallbackCurrency,
      headers,
      row,
      rowNumber: headerIndex + rowOffset + 2,
      sheetName: sheet.name
    });

    if (parsedRow.transaction) {
      transactions.push(parsedRow.transaction);
      continue;
    }

    if (parsedRow.ignoredRow) {
      ignoredRows.push(parsedRow.ignoredRow);
    }
  }

  return {
    columns,
    headerIndex,
    headers,
    ignoredRows,
    sheet,
    transactions
  } satisfies CandidateTable;
}

function detectColumns(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const columns = {
    amount: findAliasColumn(normalizedHeaders, columnAliases.amount),
    balance: findAliasColumn(normalizedHeaders, columnAliases.balance),
    currency: findAliasColumn(normalizedHeaders, columnAliases.currency),
    date: findAliasColumn(normalizedHeaders, columnAliases.date),
    description: findAliasColumn(normalizedHeaders, columnAliases.description)
  } satisfies UniversalColumns;

  if (columns.date === -1 || columns.description === -1 || columns.amount === -1) {
    return null;
  }

  return columns;
}

function findAliasColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) =>
    aliases.some((alias) => header === normalizeHeader(alias))
  );
}

async function parseMovementRow(params: {
  row: string[];
  headers: string[];
  columns: UniversalColumns;
  fallbackCurrency: string;
  sheetName: string;
  rowNumber: number;
}) {
  const rawRow = createRawPayload(params.headers, params.row);
  const dateValue = getCell(params.row, params.columns.date);
  const description = getCell(params.row, params.columns.description);
  const amountValue = getCell(params.row, params.columns.amount);
  const date = parseDateCell(dateValue);
  const amount = parseAmountCell(amountValue);
  const currency = (
    getCell(params.row, params.columns.currency) ||
    params.fallbackCurrency ||
    'EUR'
  )
    .trim()
    .toUpperCase();

  if (!date && !description && !Number.isFinite(amount)) {
    return {
      ignoredRow: null,
      transaction: null
    };
  }

  const reason = getIgnoredReason({
    amount,
    amountValue,
    date,
    dateValue,
    description
  });

  if (reason) {
    return {
      ignoredRow: {
        rawRow,
        reason,
        rowNumber: params.rowNumber,
        sheetName: params.sheetName
      },
      transaction: null
    };
  }

  if (!date) {
    return {
      ignoredRow: {
        rawRow,
        reason: 'Fecha no reconocida',
        rowNumber: params.rowNumber,
        sheetName: params.sheetName
      },
      transaction: null
    };
  }

  const transactionType = estimateTransactionType(description, amount);
  const direction = amount >= 0 ? 'inflow' : 'outflow';
  const fingerprint = await createTransactionFingerprint({
    amount,
    currency,
    date,
    description
  });

  return {
    ignoredRow: null,
    transaction: {
      amount,
      currency,
      date,
      description,
      direction,
      fingerprint,
      id: `${params.sheetName}-${params.rowNumber}-${fingerprint}`,
      raw: rawRow,
      rawRow,
      sourceFormat: 'Importador universal',
      transactionType,
      type: transactionType
    } satisfies ParsedCsvTransaction
  };
}

function getIgnoredReason(input: {
  date: string | null;
  dateValue: string;
  description: string;
  amount: number;
  amountValue: string;
}) {
  if (!input.date) {
    return `Fecha no reconocida: ${input.dateValue || 'sin valor'}`;
  }

  if (!input.description.trim()) {
    return 'Descripcion vacia';
  }

  if (!Number.isFinite(input.amount)) {
    return `Importe no reconocido: ${input.amountValue || 'sin valor'}`;
  }

  return null;
}
