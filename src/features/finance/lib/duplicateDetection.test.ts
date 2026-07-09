import { describe, expect, it } from 'vitest';

import {
  findEquivalentTransaction,
  findSuspiciousTransaction,
  isEquivalentTransaction,
  type ComparableTransaction
} from '@/features/finance/lib/duplicateDetection';

const baseTransaction = {
  accountId: 'bbva-account',
  amount: 42.35,
  date: '2026-06-12',
  description: 'MERCADONA COMPRA TARJETA 1234',
  direction: 'outflow'
} satisfies ComparableTransaction;

describe('duplicateDetection', () => {
  it('matches the same bank movement even if the normalized description changes', () => {
    expect(
      isEquivalentTransaction(baseTransaction, {
        ...baseTransaction,
        description: 'Mercadona compra tarjeta'
      })
    ).toBe(true);
  });

  it('matches movements with nearby BBVA value/operation dates', () => {
    const match = findEquivalentTransaction(baseTransaction, [
      {
        ...baseTransaction,
        date: '2026-06-13',
        description: 'MERCADONA COMPRA'
      }
    ]);

    expect(match?.reason).toContain('fecha cercana');
  });

  it('does not match different amounts', () => {
    expect(
      isEquivalentTransaction(baseTransaction, {
        ...baseTransaction,
        amount: 42.36
      })
    ).toBe(false);
  });

  it('flags low-confidence same-day same-amount rows as suspicious', () => {
    const match = findSuspiciousTransaction(baseTransaction, [
      {
        ...baseTransaction,
        description: 'MERCADONA ONLINE'
      }
    ]);

    expect(match).not.toBeNull();
  });
});
