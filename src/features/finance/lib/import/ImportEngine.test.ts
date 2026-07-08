import { describe, expect, it } from 'vitest';

import { parseImportSheetsForTesting } from '@/features/finance/lib/import/ImportEngine';
import type { ImportSheet } from '@/features/finance/lib/import/types';

describe('ImportEngine BBVA Excel detection', () => {
  it('detects the real BBVA header after decorative rows and normalizes movements', async () => {
    const sheet = {
      name: 'Movimientos',
      rows: [
        ['BBVA'],
        ['Extracto de movimientos'],
        ['Cuenta corriente', 'Periodo 2026'],
        [
          'Fecha Valor',
          'Fecha',
          'Concepto',
          'Movimiento',
          'Importe',
          'Divisa',
          'Disponible',
          'Observaciones'
        ],
        [
          '01/01/2026',
          '02/01/2026',
          'Pago Tarjeta',
          'Mercadona',
          '-23,45',
          'EUR',
          '1.200,00',
          ''
        ],
        [
          '03/01/2026',
          '04/01/2026',
          'Transferencia recibida',
          'Nomina Fran',
          '2.100,00',
          'EUR',
          '3.300,00',
          ''
        ],
        ['Saldo disponible', '', '', '', '', '', '3.300,00', ''],
        [
          '05/01/2026',
          '06/01/2026',
          'No debe importar',
          'Tras pie',
          '99,00',
          'EUR',
          '',
          ''
        ]
      ]
    } satisfies ImportSheet;

    const candidate = await parseImportSheetsForTesting([sheet]);

    expect(candidate).toBeDefined();
    expect(candidate?.sheet.name).toBe('Movimientos');
    expect(candidate?.headerIndex).toBe(3);
    expect(candidate?.transactions).toHaveLength(2);
    expect(candidate?.transactions[0]).toMatchObject({
      amount: -23.45,
      currency: 'EUR',
      date: '2026-01-02',
      description: 'Pago Tarjeta Mercadona'
    });
    expect(candidate?.transactions[1]).toMatchObject({
      amount: 2100,
      date: '2026-01-04',
      description: 'Transferencia recibida Nomina Fran',
      type: 'transfer'
    });
  });
});
