export type MovementType = 'income' | 'expense' | 'investment' | 'transfer';

export type ImportTransactionType = MovementType;

export type NormalizedImportTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: ImportTransactionType;
  sourceFormat: string;
  rawRow: Record<string, string>;
  movementType?: MovementType;
  categoryId?: string | null;
  categoryName?: string | null;
  isReviewed?: boolean;
};

export type ParsedCsvTransaction = NormalizedImportTransaction & {
  direction: 'inflow' | 'outflow';
  transactionType: ImportTransactionType;
  fingerprint: string;
  raw: Record<string, string>;
};

export type ImportSheet = {
  name: string;
  rows: string[][];
};

export type IgnoredImportRow = {
  sheetName: string;
  rowNumber: number;
  reason: string;
  rawRow: Record<string, string>;
};

export type ImportParseResult = {
  sourceFormat: string;
  label: string;
  transactions: ParsedCsvTransaction[];
  ignoredRows: IgnoredImportRow[];
};
