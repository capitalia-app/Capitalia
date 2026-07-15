import { describe, expect, it } from 'vitest';

import { validateManualMovement, type CreateManualMovementInput } from './movements';

describe('manual movements', () => {
  const baseInput = {
    accountId: 'bbva',
    amount: 1000,
    categoryId: null,
    counterpartyAccountId: 'cash',
    currency: 'EUR',
    date: '2026-04-10',
    description: 'Retirada cajero',
    isReviewed: true,
    movementType: 'transfer',
    notes: null,
    workspaceId: 'workspace'
  } satisfies CreateManualMovementInput;

  it('accepts a valid manual transfer to cash', () => {
    expect(() => validateManualMovement(baseInput)).not.toThrow();
  });

  it('rejects invalid manual amounts and dates', () => {
    expect(() => validateManualMovement({ ...baseInput, amount: 0 })).toThrow(
      'El importe debe ser mayor que cero.'
    );
    expect(() => validateManualMovement({ ...baseInput, date: '' })).toThrow(
      'La fecha no es valida.'
    );
  });

  it('rejects a transfer to the same account', () => {
    expect(() =>
      validateManualMovement({
        ...baseInput,
        counterpartyAccountId: 'bbva'
      })
    ).toThrow('La cuenta origen y destino deben ser distintas.');
  });
});
