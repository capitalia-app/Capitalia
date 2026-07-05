import { BbvaAdapter } from '@/features/finance/lib/import/adapters/BbvaAdapter';
import { GenericCsvAdapter } from '@/features/finance/lib/import/adapters/GenericCsvAdapter';
import { MyInvestorAdapter } from '@/features/finance/lib/import/adapters/MyInvestorAdapter';
import type {
  AdapterMatch,
  ImportAdapter,
  ImportSheet
} from '@/features/finance/lib/import/types';

export type DetectedBankFormat = {
  adapter: ImportAdapter;
  match: AdapterMatch;
};

const adapters: ImportAdapter[] = [BbvaAdapter, MyInvestorAdapter, GenericCsvAdapter];

export class BankFormatDetector {
  constructor(private readonly availableAdapters: ImportAdapter[] = adapters) {}

  detect(sheets: ImportSheet[]) {
    for (const adapter of this.availableAdapters) {
      const match = adapter.detect(sheets);

      if (match) {
        return {
          adapter,
          match
        } satisfies DetectedBankFormat;
      }
    }

    return null;
  }
}

export function getAvailableImportAdapters() {
  return adapters;
}
