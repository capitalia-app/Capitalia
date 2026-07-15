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

  it('does not mark same amount and description on nearby days as a strong duplicate', () => {
    const match = findEquivalentTransaction(baseTransaction, [
      {
        ...baseTransaction,
        date: '2026-06-13',
        description: 'MERCADONA COMPRA'
      }
    ]);

    expect(match).toBeNull();
  });

  it('keeps nearby same amount and description as suspicious only', () => {
    const match = findSuspiciousTransaction(baseTransaction, [
      {
        ...baseTransaction,
        date: '2026-06-13',
        description: 'MERCADONA COMPRA'
      }
    ]);

    expect(match?.reason).toContain('fecha cercana');
  });

  it('matches nearby dates as duplicate only with the same stable bank reference', () => {
    const match = findEquivalentTransaction(
      { ...baseTransaction, stableReference: 'bbva-operation-1' },
      [
        {
          ...baseTransaction,
          date: '2026-06-13',
          description: 'MERCADONA COMPRA',
          stableReference: 'bbva-operation-1'
        }
      ]
    );

    expect(match?.reason).toContain('fecha cercana');
  });

  it('allows two real cash withdrawals on consecutive days to coexist', () => {
    const withdrawal = {
      accountId: 'bbva-account',
      amount: 1000,
      date: '2026-04-10',
      description: 'Retirada cajero BBVA',
      direction: 'outflow'
    } satisfies ComparableTransaction;

    expect(
      findEquivalentTransaction(withdrawal, [{ ...withdrawal, date: '2026-04-11' }])
    ).toBeNull();
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
