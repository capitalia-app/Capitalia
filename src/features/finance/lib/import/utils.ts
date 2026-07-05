import type {
  ImportSheet,
  ImportTransactionType
} from '@/features/finance/lib/import/types';

export async function readImportSheets(file: File) {
  if (isExcelFile(file)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), {
      cellDates: false,
      raw: false,
      type: 'array'
    });

    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        return null;
      }

      return {
        name: sheetName,
        rows: normalizeRows(
          XLSX.utils.sheet_to_json<string[]>(sheet, {
            blankrows: false,
            defval: '',
            header: 1,
            raw: false
          })
        )
      };
    }).filter((sheet): sheet is ImportSheet => sheet !== null && sheet.rows.length > 0);
  }

  return [
    {
      name: file.name,
      rows: parseCsv(await file.text())
    }
  ];
}

export function parseCsv(text: string) {
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

export function detectDelimiter(text: string) {
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

export function normalizeRows(rows: unknown[][]) {
  return rows
    .map((row) => row.map((cell) => normalizeCellValue(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function normalizeCellValue(value: unknown) {
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

export function findExactColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) =>
    aliases.some((alias) => header === normalizeHeader(alias))
  );
}

export function normalizeHeader(header: string) {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getCell(row: string[], index: number) {
  return index === -1 ? '' : (row[index] ?? '').trim();
}

export function parseDateCell(value: string | undefined) {
  const cleanedValue = value?.trim();

  if (!cleanedValue) {
    return null;
  }

  const dateMatch = cleanedValue.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);

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

export function parseAmountCell(value: string | undefined) {
  if (!value) {
    return Number.NaN;
  }

  const compactValue = value.replace(/\s/g, '').replace(/\u00A0/g, '');
  const isNegative =
    compactValue.includes('(') ||
    compactValue.startsWith('-') ||
    compactValue.endsWith('-');
  const numericValue = compactValue.replace(/[^\d.,+-]/g, '').replace(/[()+-]/g, '');

  if (!numericValue) {
    return Number.NaN;
  }

  const decimalSeparator = detectDecimalSeparator(numericValue);
  const normalizedValue = normalizeNumericAmount(numericValue, decimalSeparator);
  const amount = Number(normalizedValue);

  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }

  return isNegative ? -Math.abs(amount) : amount;
}

function detectDecimalSeparator(value: string) {
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    return lastComma > lastDot ? ',' : '.';
  }

  if (lastComma !== -1) {
    const decimals = value.length - lastComma - 1;

    return decimals > 0 && decimals <= 2 ? ',' : null;
  }

  if (lastDot !== -1) {
    const decimals = value.length - lastDot - 1;

    return decimals > 0 && decimals <= 2 ? '.' : null;
  }

  return null;
}

function normalizeNumericAmount(value: string, decimalSeparator: ',' | '.' | null) {
  if (decimalSeparator === ',') {
    return value.replace(/\./g, '').replace(',', '.');
  }

  if (decimalSeparator === '.') {
    return value.replace(/,/g, '');
  }

  return value.replace(/[,.]/g, '');
}

export function estimateTransactionType(
  description: string,
  amount: number
): ImportTransactionType {
  const normalizedDescription = normalizeHeader(description);

  if (
    /\b(transferencia|traspaso|bizum|sepa|envio|recibido|myinvestor|revolut)\b/.test(
      normalizedDescription
    ) ||
    normalizedDescription.includes('ingreso efectivo') ||
    normalizedDescription.includes('retirada efectivo') ||
    normalizedDescription.includes('entre cuentas')
  ) {
    return 'transfer';
  }

  return amount >= 0 ? 'income' : 'expense';
}

export async function createTransactionFingerprint(input: {
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

export function createRawPayload(headers: string[], row: string[]) {
  return headers.reduce<Record<string, string>>((payload, header, index) => {
    payload[header || `column_${index + 1}`] = row[index] ?? '';

    return payload;
  }, {});
}

export function isExcelFile(file: File) {
  return (
    file.name.toLowerCase().endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

export function sheetContainsText(rows: string[][], pattern: RegExp) {
  return rows.some((row) => row.some((cell) => pattern.test(normalizeHeader(cell))));
}
