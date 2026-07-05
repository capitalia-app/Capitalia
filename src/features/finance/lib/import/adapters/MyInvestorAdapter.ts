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
  parseDateCell,
  sheetContainsText
} from '@/features/finance/lib/import/utils';

const myInvestorSourceFormat = 'MyInvestor Excel';

export const MyInvestorAdapter: ImportAdapter = {
  id: 'myinvestor_official',
  label: 'MyInvestor',
  sourceFormat: myInvestorSourceFormat,
  detect(sheets: ImportSheet[]) {
    for (const sheet of sheets) {
      const hasBrandSignal = sheetContainsText(sheet.rows, /myinvestor/i);

      for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
        const normalizedRow = sheet.rows[rowIndex]?.map(normalizeHeader) ?? [];
        const columns = {
          amount: findExactColumn(normalizedRow, ['importe']),
          balance: findExactColumn(normalizedRow, ['saldo']),
          date: findExactColumn(normalizedRow, ['fecha operacion']),
          movement: findExactColumn(normalizedRow, ['movimiento']),
          valueDate: findExactColumn(normalizedRow, ['fecha valor'])
        };
        const hasRequiredHeaders =
          columns.date !== -1 && columns.movement !== -1 && columns.amount !== -1;

        if (hasRequiredHeaders || (hasBrandSignal && columns.amount !== -1)) {
          if (!hasRequiredHeaders) {
            continue;
          }

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
        mapMyInvestorRow({
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

async function mapMyInvestorRow(params: {
  row: string[];
  columns: Record<string, number>;
  headers: string[];
  rowIndex: number;
  fallbackCurrency: string;
}) {
  const date = parseDateCell(getCell(params.row, params.columns.date ?? -1));
  const description = getCell(params.row, params.columns.movement ?? -1);
  const amount = parseAmountCell(getCell(params.row, params.columns.amount ?? -1));
  const currency = (params.fallbackCurrency || 'EUR').trim().toUpperCase();

  if (!date && !description && !Number.isFinite(amount)) {
    return null;
  }

  if (!date || !description || !Number.isFinite(amount)) {
    throw new Error(`No se pudo leer la fila ${params.rowIndex + 1} de MyInvestor.`);
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
    sourceFormat: myInvestorSourceFormat,
    transactionType,
    type: transactionType
  } satisfies ParsedCsvTransaction;
}
