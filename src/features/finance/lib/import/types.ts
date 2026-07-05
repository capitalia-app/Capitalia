export type ImportTransactionType = 'income' | 'expense' | 'transfer';

export type NormalizedImportTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: ImportTransactionType;
  sourceFormat: string;
  rawRow: Record<string, string>;
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

export type AdapterMatch = {
  sheet: ImportSheet;
  headerIndex: number;
  columns: Record<string, number>;
};

export type ImportAdapter = {
  id: string;
  label: string;
  sourceFormat: string;
  detect(sheets: ImportSheet[]): AdapterMatch | null;
  parse(match: AdapterMatch, fallbackCurrency: string): Promise<ParsedCsvTransaction[]>;
};

export type ImportParseResult = {
  sourceFormat: string;
  label: string;
  transactions: ParsedCsvTransaction[];
};
