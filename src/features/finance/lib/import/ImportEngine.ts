import { BankFormatDetector } from '@/features/finance/lib/import/BankFormatDetector';
import type { ImportParseResult } from '@/features/finance/lib/import/types';
import { readImportSheets } from '@/features/finance/lib/import/utils';

export class ImportEngine {
  constructor(private readonly detector = new BankFormatDetector()) {}

  async parseFile(file: File, fallbackCurrency: string) {
    const sheets = await readImportSheets(file);
    const detectedFormat = this.detector.detect(sheets);

    if (!detectedFormat) {
      throw new Error(
        'Formato no reconocido. Capitalia soporta BBVA, MyInvestor y CSV generico con columnas de fecha, descripcion e importe.'
      );
    }

    const transactions = await detectedFormat.adapter.parse(
      detectedFormat.match,
      fallbackCurrency
    );

    if (transactions.length === 0) {
      throw new Error('No se encontraron movimientos importables en el archivo.');
    }

    return {
      label: detectedFormat.adapter.label,
      sourceFormat: detectedFormat.adapter.sourceFormat,
      transactions
    } satisfies ImportParseResult;
  }
}
