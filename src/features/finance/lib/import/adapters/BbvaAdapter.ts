import type {
  AdapterMatch,
  ImportAdapter,
  ImportSheet,
  ParsedCsvTransaction
} from '@/features/finance/lib/import/types';
import {
  createRawPayload,
  createTransactionFingerprint,
  estimateTransactionType,
  findExactColumn,
  getCell,
  normalizeHeader,
  parseAmountCell,
  parseDateCell
} from '@/features/finance/lib/import/utils';

const bbvaSourceFormat = 'BBVA Excel/CSV';

export const BbvaAdapter: ImportAdapter = {
  id: 'bbva_official',
  label: 'BBVA',
  sourceFormat: bbvaSourceFormat,
  detect(sheets: ImportSheet[]) {
    for (const sheet of sheets) {
      for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
        const normalizedRow = sheet.rows[rowIndex]?.map(normalizeHeader) ?? [];
        const columns = {
          amount: findExactColumn(normalizedRow, ['importe']),
          concept: findExactColumn(normalizedRow, ['concepto']),
          currency: findExactColumn(normalizedRow, ['divisa', 'moneda']),
          date: findExactColumn(normalizedRow, ['fecha', 'fecha operacion']),
          movement: findExactColumn(normalizedRow, ['movimiento']),
          valueDate: findExactColumn(normalizedRow, ['valor', 'fecha valor', 'f valor'])
        };

        if (
          columns.date !== -1 &&
          columns.amount !== -1 &&
          columns.currency !== -1 &&
          (columns.concept !== -1 || columns.movement !== -1)
        ) {
          return {
            columns,
            headerIndex: rowIndex,
            sheet
          } satisfies AdapterMatch;
        }
      }
    }

    return null;
  },
  async parse(match: AdapterMatch, fallbackCurrency: string) {
    const headers = match.sheet.rows[match.headerIndex] ?? [];
    const dataRows = match.sheet.rows
      .slice(match.headerIndex + 1)
      .filter((row) => row.some((cell) => cell.trim()));
    const transactions = await Promise.all(
      dataRows.map((row, rowIndex) =>
        mapBbvaRow({
          columns: match.columns,
          fallbackCurrency,
          headers,
          row,
          rowIndex
        })
      )
    );

    return transactions.filter((transaction): transaction is ParsedCsvTransaction =>
      Boolean(transaction)
    );
  }
};

async function mapBbvaRow(params: {
  row: string[];
  columns: Record<string, number>;
  headers: string[];
  rowIndex: number;
  fallbackCurrency: string;
}) {
  const date = parseDateCell(getCell(params.row, params.columns.date ?? -1));
  const concept = getCell(params.row, params.columns.concept ?? -1);
  const movement = getCell(params.row, params.columns.movement ?? -1);
  const description = [concept, movement].filter(Boolean).join(' - ').trim();
  const amount = parseAmountCell(getCell(params.row, params.columns.amount ?? -1));
  const currency = (
    getCell(params.row, params.columns.currency ?? -1) ||
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
    amount,
    currency,
    date,
    description
  });
  const rawRow = createRawPayload(params.headers, params.row);

  return {
    amount,
    currency,
    date,
    description,
    direction,
    fingerprint,
    id: `${params.rowIndex}-${fingerprint}`,
    raw: rawRow,
    rawRow,
    sourceFormat: bbvaSourceFormat,
    transactionType,
    type: transactionType
  } satisfies ParsedCsvTransaction;
}
