import { describe, expect, it } from 'vitest';

import type { FinancialAccount } from '@/features/finance/lib/accounts';
import {
  buildMetricFilter,
  calculateMonthlyBalance,
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
      createTransaction('bbva', 'BBVA / Cuenta principal', -3000, 'transfer'),
      createTransaction('myinvestor', 'MyInvestor', 3000, 'transfer'),
      createTransaction('myinvestor', 'MyInvestor', 200, 'investment'),
      createTransaction('bbva', 'BBVA / Cuenta principal', -80, 'expense'),
      createTransaction('bbva', 'BBVA / Cuenta principal', 2500, 'income')
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
      createTransaction('bbva', 'BBVA / Cuenta principal', 2500, 'income'),
      createTransaction('bbva', 'BBVA / Cuenta principal', -80, 'expense'),
      createTransaction('bbva', 'BBVA / Cuenta principal', -3000, 'transfer'),
      createTransaction('myinvestor', 'MyInvestor', 3000, 'transfer')
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
    expect(calculateMonthlyBalance({ expenses, income })).toBe(2420);
  });
});

function createTransaction(
  accountId: string,
  accountName: string,
  amount: number,
  movementType: MetricTransaction['movementType']
) {
  return {
    accountId,
    accountName,
    amount,
    description: accountName,
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
