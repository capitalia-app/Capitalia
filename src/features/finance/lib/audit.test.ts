import { describe, expect, it } from 'vitest';

import {
  getAuditRecoveryErrorMessage,
  isAuditDetectionProtected,
  isRestoredTransactionActive
} from '@/features/finance/lib/audit';

describe('audit recovery', () => {
  it('keeps manually validated movements out of automatic audit detection', () => {
    expect(isAuditDetectionProtected({ manually_validated: true })).toBe(true);
    expect(isAuditDetectionProtected({ manually_validated: false })).toBe(false);
    expect(isAuditDetectionProtected({ manually_validated: null })).toBe(false);
  });

  it('returns a clear message when the movement belongs to another workspace or role is denied', () => {
    expect(getAuditRecoveryErrorMessage({ code: '42501' })).toBe(
      'No tienes permisos para recuperar este movimiento.'
    );
  });

  it('returns a clear message when the movement no longer exists', () => {
    expect(getAuditRecoveryErrorMessage({ code: 'P0002' })).toBe(
      'El movimiento ya no existe o ha cambiado.'
    );
  });

  it('returns a clear message when the authenticated user has no profile', () => {
    expect(getAuditRecoveryErrorMessage({ code: 'P0001' })).toBe(
      'No se pudo confirmar tu perfil de usuario.'
    );
  });

  it('does not leak raw Supabase errors for generic mutation failures', () => {
    expect(
      getAuditRecoveryErrorMessage({
        code: '23503',
        message:
          'insert or update on table "transactions" violates foreign key constraint'
      })
    ).toBe('No se pudo recuperar el movimiento. Vuelve a intentarlo.');
  });

  it('accepts a fully restored transaction as active again', () => {
    expect(
      isRestoredTransactionActive({
        deleted_at: null,
        id: 'movement-1',
        manually_validated: true,
        status: 'posted'
      })
    ).toBe(true);
  });

  it('rejects partial recovery states that would leave a movement in limbo', () => {
    expect(
      isRestoredTransactionActive({
        deleted_at: '2026-07-01T00:00:00.000Z',
        id: 'movement-1',
        manually_validated: true,
        status: 'posted'
      })
    ).toBe(false);
    expect(
      isRestoredTransactionActive({
        deleted_at: null,
        id: 'movement-1',
        manually_validated: true,
        status: 'ignored'
      })
    ).toBe(false);
    expect(
      isRestoredTransactionActive({
        deleted_at: null,
        id: 'movement-1',
        manually_validated: false,
        status: 'posted'
      })
    ).toBe(false);
  });
});
