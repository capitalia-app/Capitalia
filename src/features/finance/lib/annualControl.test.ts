import { describe, expect, it } from 'vitest';

import { calculateVeramarMonthlyBalance } from '@/features/finance/lib/annualControl';

describe('annual control', () => {
  it.each([
    [820, 386, 434],
    [650, 46, 604],
    [287, 150, 137],
    [0, 100, -100],
    [500, 0, 500]
  ])('calculates Veramar balance as %i - %i = %i', (income, expenses, expected) => {
    expect(calculateVeramarMonthlyBalance([income], [expenses])[0]).toBe(expected);
  });

  it('does not double-negative Veramar expenses stored as outflows', () => {
    expect(calculateVeramarMonthlyBalance([820], [-386])[0]).toBe(434);
  });
});
