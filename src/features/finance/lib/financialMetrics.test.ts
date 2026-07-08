import { describe, expect, it } from 'vitest';

import type { FinancialAccount } from '@/features/finance/lib/accounts';
import {
  buildMetricFilter,
  calculateMonthlyBalance,
  calculateMonthlyFinancialMetrics,
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
      createTransaction('myinvestor', 'MyInvestor', 200, 'inflow', 'investment'),
      createTransaction('bbva', 'BBVA / Cuenta principal', 80, 'outflow', 'expense'),
      createTransaction('bbva', 'BBVA / Cuenta principal', 2500, 'inflow', 'income')
    ];
    const savingsFilter = buildMetricFilter('savings', accounts);
    const dashboardTotal = sumMetricTransactions(aprilTransactions, savingsFilter);
    const visibleMovementTotal = aprilTransactions
      .filter((transaction) => matchesMetricFilter(transaction, savingsFilter))
      .reduce((total, transaction) => total + transaction.amount, 0);

    expect(dashboardTotal).toBe(3200);
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

  it('keeps dashboard monthly totals aligned with gastos and inversion sections', () => {
    const transactions = [
      createMonthlyTransaction(0, 'bbva', 'BBVA', 2000, 'inflow', 'income'),
      createMonthlyTransaction(0, 'bbva', 'BBVA', 500, 'outflow', 'expense'),
      createMonthlyTransaction(1, 'bbva', 'BBVA', 2100, 'inflow', 'income'),
      createMonthlyTransaction(1, 'bbva', 'BBVA', 600, 'outflow', 'expense'),
      createMonthlyTransaction(1, 'myinvestor', 'MyInvestor', 300, 'inflow', 'transfer'),
      createMonthlyTransaction(2, 'bbva', 'BBVA', 2200, 'inflow', 'income'),
      createMonthlyTransaction(2, 'ledger', 'Ledger', 125, 'inflow', 'investment'),
      createMonthlyTransaction(3, 'bbva', 'BBVA', 2500, 'inflow', 'income'),
      createMonthlyTransaction(3, 'bbva', 'BBVA', 80, 'outflow', 'expense'),
      createMonthlyTransaction(3, 'bbva', 'BBVA', 3000, 'outflow', 'transfer'),
      createMonthlyTransaction(3, 'myinvestor', 'MyInvestor', 3000, 'inflow', 'transfer'),
      createMonthlyTransaction(3, 'myinvestor', 'MyInvestor', 200, 'inflow', 'investment')
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
    expect(metrics.savings.slice(0, 4)).toEqual([0, 300, 125, 3200]);
    expect(metrics.balance.slice(0, 4)).toEqual([1500, 1200, 2075, -780]);
    expect(
      sumMetricTransactions(gastosSection, buildMetricFilter('expense', accounts))
    ).toBe(metrics.expenses.slice(0, 4).reduce((total, value) => total + value, 0));
    expect(
      sumMetricTransactions(investmentSection, buildMetricFilter('savings', accounts))
    ).toBe(metrics.savings.slice(0, 4).reduce((total, value) => total + value, 0));
  });
});

function createTransaction(
  accountId: string,
  accountName: string,
  amount: number,
  direction: MetricTransaction['direction'],
  movementType: MetricTransaction['movementType']
) {
  return {
    accountId,
    accountName,
    amount,
    description: accountName,
    direction,
    movementType
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
  movementType: MetricTransaction['movementType']
) {
  return {
    ...createTransaction(accountId, accountName, amount, direction, movementType),
    month
  };
}
