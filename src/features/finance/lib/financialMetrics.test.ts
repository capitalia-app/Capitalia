import { describe, expect, it } from 'vitest';

import type { FinancialAccount } from '@/features/finance/lib/accounts';
import {
  buildMetricFilter,
  calculateMonthlyBalance,
  calculateMonthlyFinancialMetrics,
  getMetricAmount,
  isVeramarExpense,
  isVeramarIncome,
  matchesMetricFilter,
  sumMetricTransactions,
  type MetricTransaction
} from '@/features/finance/lib/financialMetrics';

describe('financial metrics', () => {
  const accounts = [
    createAccount('bbva', 'Cuenta principal', 'checking', 'BBVA'),
    createAccount('myinvestor', 'MyInvestor', 'brokerage', 'MyInvestor'),
    createAccount('ledger', 'Ledger', 'crypto_wallet', 'Ledger')
  ];

  it('uses the same April savings definition for dashboard and movement filters', () => {
    const aprilTransactions = [
      createTransaction('bbva', 'BBVA / Cuenta principal', 3000, 'outflow', 'transfer'),
      createTransaction('myinvestor', 'MyInvestor', 3000, 'inflow', 'transfer'),
      createTransaction('myinvestor', 'Fidelity S&P 500', 200, 'outflow', 'investment'),
      createTransaction('bbva', 'BBVA / Cuenta principal', 80, 'outflow', 'expense'),
      createTransaction('bbva', 'BBVA / Cuenta principal', 2500, 'inflow', 'income')
    ];
    const savingsFilter = buildMetricFilter('savings', accounts);
    const dashboardTotal = sumMetricTransactions(aprilTransactions, savingsFilter);
    const visibleMovementTotal = aprilTransactions
      .filter((transaction) => matchesMetricFilter(transaction, savingsFilter))
      .reduce(
        (total, transaction) => total + getMetricAmount(transaction, savingsFilter),
        0
      );

    expect(dashboardTotal).toBe(3000);
    expect(visibleMovementTotal).toBe(dashboardTotal);
  });

  it('calculates monthly balance without counting internal transfer exits twice', () => {
    const transactions = [
      createTransaction('bbva', 'BBVA / Cuenta principal', 2500, 'inflow', 'income'),
      createTransaction('bbva', 'BBVA / Cuenta principal', 80, 'outflow', 'expense'),
      createTransaction('bbva', 'BBVA / Cuenta principal', 3000, 'outflow', 'transfer'),
      createTransaction('myinvestor', 'MyInvestor', 3000, 'inflow', 'transfer')
    ];

    const income = sumMetricTransactions(
      transactions,
      buildMetricFilter('income', accounts)
    );
    const expenses = sumMetricTransactions(
      transactions,
      buildMetricFilter('expense', accounts)
    );
    const savings = sumMetricTransactions(
      transactions,
      buildMetricFilter('savings', accounts)
    );

    expect(income).toBe(2500);
    expect(expenses).toBe(-80);
    expect(savings).toBe(3000);
    expect(calculateMonthlyBalance({ expenses, income, savings })).toBe(-580);
  });

  it('counts a source-account transfer to an investment platform when the destination leg is missing', () => {
    const transactions = [
      createTransaction(
        'bbva',
        'BBVA / Cuenta principal',
        300,
        'outflow',
        'transfer',
        'Transferencia emitida MyInvestor'
      )
    ];

    expect(
      sumMetricTransactions(transactions, buildMetricFilter('savings', accounts))
    ).toBe(300);
  });

  it('keeps dashboard monthly totals aligned with gastos and inversion sections', () => {
    const transactions = [
      createMonthlyTransaction(0, 'bbva', 'BBVA', 2000, 'inflow', 'income'),
      createMonthlyTransaction(0, 'bbva', 'BBVA', 500, 'outflow', 'expense'),
      createMonthlyTransaction(1, 'bbva', 'BBVA', 2100, 'inflow', 'income'),
      createMonthlyTransaction(1, 'bbva', 'BBVA', 600, 'outflow', 'expense'),
      createMonthlyTransaction(1, 'myinvestor', 'MyInvestor', 300, 'inflow', 'transfer'),
      createMonthlyTransaction(2, 'bbva', 'BBVA', 2200, 'inflow', 'income'),
      createMonthlyTransaction(2, 'bbva', 'BBVA', 125, 'outflow', 'transfer', 'Ledger'),
      createMonthlyTransaction(3, 'bbva', 'BBVA', 2500, 'inflow', 'income'),
      createMonthlyTransaction(3, 'bbva', 'BBVA', 80, 'outflow', 'expense'),
      createMonthlyTransaction(3, 'bbva', 'BBVA', 3000, 'outflow', 'transfer'),
      createMonthlyTransaction(3, 'myinvestor', 'MyInvestor', 3000, 'inflow', 'transfer'),
      createMonthlyTransaction(
        3,
        'myinvestor',
        'Fidelity S&P 500',
        200,
        'outflow',
        'investment'
      )
    ];
    const metrics = calculateMonthlyFinancialMetrics(
      transactions,
      accounts,
      (transaction) => transaction.month
    );
    const gastosSection = transactions.filter((transaction) =>
      matchesMetricFilter(transaction, buildMetricFilter('expense', accounts))
    );
    const investmentSection = transactions.filter((transaction) =>
      matchesMetricFilter(transaction, buildMetricFilter('savings', accounts))
    );

    expect(metrics.income.slice(0, 4)).toEqual([2000, 2100, 2200, 2500]);
    expect(metrics.expenses.slice(0, 4)).toEqual([-500, -600, 0, -80]);
    expect(metrics.savings.slice(0, 4)).toEqual([0, 300, 125, 3000]);
    expect(metrics.balance.slice(0, 4)).toEqual([1500, 1200, 2075, -580]);
    expect(
      sumMetricTransactions(gastosSection, buildMetricFilter('expense', accounts))
    ).toBe(metrics.expenses.slice(0, 4).reduce((total, value) => total + value, 0));
    expect(
      sumMetricTransactions(investmentSection, buildMetricFilter('savings', accounts))
    ).toBe(metrics.savings.slice(0, 4).reduce((total, value) => total + value, 0));
  });

  it('excludes linked internal transfers and asset purchases from income and expenses', () => {
    const transactions = [
      createTransaction('bbva', 'BBVA', 300, 'outflow', 'transfer', 'BBVA a MyInvestor', {
        linkedTransactionId: 'transfer-in'
      }),
      createTransaction(
        'myinvestor',
        'MyInvestor',
        300,
        'inflow',
        'transfer',
        'Desde BBVA',
        {
          linkedTransactionId: 'transfer-out'
        }
      ),
      createTransaction(
        'myinvestor',
        'MyInvestor',
        40,
        'outflow',
        'investment',
        'Fidelity S&P 500',
        { transactionType: 'asset_purchase' }
      ),
      createTransaction('bbva', 'BBVA', 60, 'outflow', 'expense', 'Mercadona'),
      createTransaction('bbva', 'BBVA', 2500, 'inflow', 'income', 'Nomina Fran')
    ];

    expect(
      sumMetricTransactions(transactions, buildMetricFilter('income', accounts))
    ).toBe(2500);
    expect(
      sumMetricTransactions(transactions, buildMetricFilter('expense', accounts))
    ).toBe(-60);
  });

  it('identifies Veramar income and expenses from category-aware transactions', () => {
    const booking = createTransaction(
      'bbva',
      'BBVA',
      900,
      'inflow',
      'income',
      'Booking Payments',
      { categoryName: 'Ingresos Veramar / Booking' }
    );
    const veramarExpense = createTransaction(
      'bbva',
      'BBVA',
      120,
      'outflow',
      'expense',
      'Factura luz apartamento',
      { categoryName: 'Gastos Veramar' }
    );
    const personalExpense = createTransaction(
      'bbva',
      'BBVA',
      80,
      'outflow',
      'expense',
      'Factura luz vivienda'
    );

    expect(isVeramarIncome(booking)).toBe(true);
    expect(isVeramarExpense(veramarExpense)).toBe(true);
    expect(isVeramarExpense(personalExpense)).toBe(false);
  });
});

function createTransaction(
  accountId: string,
  accountName: string,
  amount: number,
  direction: MetricTransaction['direction'],
  movementType: MetricTransaction['movementType'],
  description = accountName,
  overrides: Partial<MetricTransaction> = {}
) {
  return {
    accountId,
    accountName,
    amount,
    description,
    direction,
    movementType,
    ...overrides
  } satisfies MetricTransaction;
}

function createAccount(
  id: string,
  name: string,
  type: FinancialAccount['type'],
  institutionName: string
) {
  return {
    balance: null,
    balanceCapturedAt: null,
    currency: 'EUR',
    id,
    institutionName,
    name,
    type
  } satisfies FinancialAccount;
}

function createMonthlyTransaction(
  month: number,
  accountId: string,
  accountName: string,
  amount: number,
  direction: MetricTransaction['direction'],
  movementType: MetricTransaction['movementType'],
  description = accountName
) {
  return {
    ...createTransaction(
      accountId,
      accountName,
      amount,
      direction,
      movementType,
      description
    ),
    month
  };
}
