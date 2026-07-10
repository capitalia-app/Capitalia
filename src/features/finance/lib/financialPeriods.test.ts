import { describe, expect, it } from 'vitest';

import {
  getDateInputRange,
  getFinancialMonthIndex,
  getFinancialYear,
  getMonthRange,
  getYearRange,
  isFinancialDateInMonth
} from '@/features/finance/lib/financialPeriods';

describe('financial periods', () => {
  it('builds January as month index 0 with a semi-open range', () => {
    expect(getMonthRange(2026, 0)).toEqual({
      endDate: '2026-01-31',
      endExclusiveDate: '2026-02-01',
      endExclusiveIso: '2026-02-01T00:00:00.000Z',
      monthIndex: 0,
      startDate: '2026-01-01',
      startIso: '2026-01-01T00:00:00.000Z',
      year: 2026
    });
  });

  it('builds December as month index 11 across the year boundary', () => {
    expect(getMonthRange(2026, 11)).toMatchObject({
      endDate: '2026-12-31',
      endExclusiveDate: '2027-01-01',
      endExclusiveIso: '2027-01-01T00:00:00.000Z',
      startDate: '2026-12-01',
      startIso: '2026-12-01T00:00:00.000Z'
    });
  });

  it('classifies first and last January dates in January but not February', () => {
    expect(isFinancialDateInMonth('2026-01-01T00:00:00.000Z', 2026, 0)).toBe(true);
    expect(isFinancialDateInMonth('2026-01-31T23:59:59.999Z', 2026, 0)).toBe(true);
    expect(isFinancialDateInMonth('2026-02-01T00:00:00.000Z', 2026, 0)).toBe(false);
  });

  it('keeps leap-year February and regular February ranges correct', () => {
    expect(getMonthRange(2024, 1).endDate).toBe('2024-02-29');
    expect(getMonthRange(2025, 1).endDate).toBe('2025-02-28');
  });

  it('extracts the financial calendar date without timezone shifting', () => {
    expect(getFinancialYear('2026-01-01T00:30:00+01:00')).toBe(2026);
    expect(getFinancialMonthIndex('2026-01-01T00:30:00+01:00')).toBe(0);
    expect(getFinancialMonthIndex('2026-12-31T23:30:00-03:00')).toBe(11);
  });

  it('uses the same date range for detail filters that monthly aggregation uses', () => {
    const monthRange = getMonthRange(2026, 0);
    const filterRange = getDateInputRange(monthRange.startDate, monthRange.endDate);

    expect(filterRange).toEqual({
      endExclusiveIso: monthRange.endExclusiveIso,
      startIso: monthRange.startIso
    });
  });

  it('includes January in annual ranges and excludes next January', () => {
    expect(getYearRange(2026)).toEqual({
      endExclusiveDate: '2027-01-01',
      endExclusiveIso: '2027-01-01T00:00:00.000Z',
      startDate: '2026-01-01',
      startIso: '2026-01-01T00:00:00.000Z',
      year: 2026
    });
  });
});
