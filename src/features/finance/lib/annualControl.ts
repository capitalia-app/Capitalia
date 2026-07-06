import type { FinancialAccount } from '@/features/finance/lib/accounts';
import { listFinancialAccounts } from '@/features/finance/lib/accounts';
import {
  listTransactionCategories,
  type TransactionCategory
} from '@/features/finance/lib/categories';
import type { DashboardSummary } from '@/features/finance/lib/dashboard';
import type { MovementType } from '@/features/finance/lib/import/types';
import { supabase } from '@/shared/lib/supabase';

export type AnnualMonthIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type AnnualCellTarget = {
  movementType: MovementType | 'all';
  month: number;
  year: number;
  search?: string;
  categoryId?: string;
};

export type AnnualTableRow = {
  key: string;
  label: string;
  group?: string;
  values: number[];
  total: number;
  tone: 'income' | 'expense' | 'investment' | 'balance' | 'neutral';
  targets: AnnualCellTarget[];
};

export type VeramarSummary = {
  incomeRows: AnnualTableRow[];
  expenseRows: AnnualTableRow[];
  monthlyIncome: number[];
  monthlyExpenses: number[];
  monthlyBalance: number[];
  totalIncome: number;
  totalExpenses: number;
  totalBalance: number;
};

export type SavingsSummary = {
  transferRows: AnnualTransferRow[];
  destinationRows: AnnualTableRow[];
  platformRows: AnnualTableRow[];
};

export type AnnualTransferRow = {
  id: string;
  date: string;
  origin: string;
  destination: string;
  amount: number;
  month: number;
  currency: string;
};

export type AnnualControlSummary = {
  year: number;
  availableYears: number[];
  currency: string;
  annualIncome: number;
  annualExpenses: number;
  annualBalance: number;
  netWorth: number;
  balanceRows: AnnualTableRow[];
  incomeRows: AnnualTableRow[];
  expenseRows: AnnualTableRow[];
  veramar: VeramarSummary;
  savings: SavingsSummary;
  accounts: DashboardSummary['accounts'];
};

type TransactionRecord = {
  id: string;
  account_id: string;
  amount: number | string;
  currency: string;
  direction: 'inflow' | 'outflow';
  occurred_at: string;
  description: string;
  category_id: string | null;
  movement_type: MovementType | null;
  linked_transaction_id: string | null;
};

type LinkedTransactionRecord = {
  id: string;
  account_id: string;
};

type AnnualTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  currency: string;
  description: string;
  direction: 'inflow' | 'outflow';
  linkedAccountName: string | null;
  month: AnnualMonthIndex;
  movementType: MovementType;
  occurredAt: string;
  searchText: string;
};

export const monthLabels = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic'
] as const;

export async function getAnnualControlSummary(input: {
  summary: DashboardSummary;
  year: number;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const [accounts, categories, transactions, availableYears] = await Promise.all([
    listFinancialAccounts(input.summary.workspace.id),
    listTransactionCategories(input.summary.workspace.id),
    getYearTransactions(input.summary.workspace.id, input.year),
    getAvailableYears(input.summary.workspace.id)
  ]);

  const linkedTransactionsById = await getLinkedTransactionsById(
    transactions
      .map((transaction) => transaction.linked_transaction_id)
      .filter((transactionId): transactionId is string => Boolean(transactionId))
  );
  const annualTransactions = normalizeTransactions({
    accounts,
    categories,
    linkedTransactionsById,
    transactions
  });
  const monthlyIncome = sumMonthly(
    annualTransactions.filter((transaction) => transaction.movementType === 'income')
  );
  const monthlyExpenses = sumMonthly(
    annualTransactions.filter((transaction) => transaction.movementType === 'expense')
  );
  const monthlyInvestment = sumMonthly(
    annualTransactions.filter(
      (transaction) =>
        transaction.movementType === 'investment' ||
        transaction.movementType === 'transfer'
    )
  );
  const monthlyBalance = monthlyIncome.map(
    (income, month) => income - (monthlyExpenses[month] ?? 0)
  );
  const incomeRows = buildIncomeRows(annualTransactions, input.year);
  const expenseRows = buildExpenseRows(annualTransactions, input.year);
  const veramar = buildVeramarSummary(annualTransactions, input.year);
  const savings = buildSavingsSummary(annualTransactions, input.year);
  const yearSet = new Set([...availableYears, input.year]);

  return {
    accounts: input.summary.accounts,
    annualBalance: sum(monthlyBalance),
    annualExpenses: sum(monthlyExpenses),
    annualIncome: sum(monthlyIncome),
    availableYears: [...yearSet].sort((first, second) => second - first),
    balanceRows: [
      createStaticRow(
        'income',
        'Ingresos',
        monthlyIncome,
        'income',
        input.year,
        'income'
      ),
      createStaticRow(
        'expenses',
        'Gastos',
        monthlyExpenses,
        'expense',
        input.year,
        'expense'
      ),
      createStaticRow(
        'savings',
        'Ahorro e inversion',
        monthlyInvestment,
        'investment',
        input.year,
        'investment'
      ),
      createStaticRow(
        'balance',
        'Balance mensual',
        monthlyBalance,
        'balance',
        input.year,
        'all'
      )
    ],
    currency: input.summary.currency,
    expenseRows,
    incomeRows,
    netWorth: input.summary.netWorth,
    savings,
    veramar,
    year: input.year
  } satisfies AnnualControlSummary;
}

function normalizeTransactions(input: {
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
  linkedTransactionsById: Map<string, LinkedTransactionRecord>;
  transactions: TransactionRecord[];
}) {
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(
    input.categories.map((category) => [category.id, category])
  );

  return input.transactions.map((transaction) => {
    const account = accountsById.get(transaction.account_id);
    const linkedAccount = transaction.linked_transaction_id
      ? accountsById.get(
          input.linkedTransactionsById.get(transaction.linked_transaction_id)
            ?.account_id ?? ''
        )
      : null;
    const category = transaction.category_id
      ? categoriesById.get(transaction.category_id)
      : null;
    const movementType =
      transaction.movement_type ?? fallbackMovementType(transaction.direction);
    const month = new Date(transaction.occurred_at).getUTCMonth() as AnnualMonthIndex;
    const categoryName = category?.name ?? null;
    const accountName = account ? getAccountDisplayName(account) : 'Cuenta';

    return {
      accountId: transaction.account_id,
      accountName,
      amount: Number(transaction.amount),
      categoryId: transaction.category_id,
      categoryName,
      currency: transaction.currency,
      description: transaction.description,
      direction: transaction.direction,
      id: transaction.id,
      linkedAccountName: linkedAccount ? getAccountDisplayName(linkedAccount) : null,
      month,
      movementType,
      occurredAt: transaction.occurred_at,
      searchText: normalizeText(
        `${transaction.description} ${categoryName ?? ''} ${accountName}`
      )
    } satisfies AnnualTransaction;
  });
}

function buildIncomeRows(transactions: AnnualTransaction[], year: number) {
  const incomeTransactions = transactions.filter(
    (transaction) => transaction.movementType === 'income'
  );

  return [
    buildRuleRow(
      'income-fran',
      'Nomina Fran',
      incomeTransactions,
      year,
      ['nomina fran', 'nómina fran', 'fran'],
      'income'
    ),
    buildRuleRow(
      'income-nieves',
      'Nomina Nieves',
      incomeTransactions,
      year,
      ['nomina nieves', 'nómina nieves', 'nieves'],
      'income'
    ),
    buildRuleRow(
      'income-veramar',
      'Veramar',
      incomeTransactions,
      year,
      ['veramar', 'booking'],
      'income'
    ),
    buildRuleRow(
      'income-dividends',
      'Dividendos / intereses',
      incomeTransactions,
      year,
      ['dividendo', 'dividend', 'interes', 'interés', 'interest'],
      'income'
    ),
    buildOtherIncomeRow(incomeTransactions, year)
  ];
}

function buildExpenseRows(transactions: AnnualTransaction[], year: number) {
  const expenseTransactions = transactions.filter(
    (transaction) => transaction.movementType === 'expense'
  );
  const fixedRules = [
    ['Hipoteca', ['hipoteca']],
    ['Luz', ['luz', 'iberdrola', 'endesa']],
    ['Agua', ['agua']],
    [
      'Internet / Telefonia',
      ['internet', 'telefonia', 'telefonía', 'movistar', 'vodafone']
    ],
    ['Seguros', ['seguro', 'seguros', 'mapfre']],
    ['Comunidad', ['comunidad']],
    ['Veramar', ['veramar']],
    ['Otros fijos', ['fijo', 'fijos']]
  ] satisfies [string, string[]][];
  const variableRules = [
    ['Compras', ['compras', 'amazon', 'carrefour', 'mercadona', 'lidl', 'aldi']],
    ['Ocio / Entretenimiento', ['ocio', 'spotify', 'netflix', 'prime video']],
    ['Comidas / Restaurantes', ['restaurante', 'restaurantes', 'comida', 'bar']],
    ['Salud', ['salud', 'farmacia', 'medico', 'médico']],
    ['Transporte', ['transporte', 'repsol', 'cepsa', 'shell', 'gasolina']],
    ['Otros variables', []]
  ] satisfies [string, string[]][];
  const matchedIds = new Set<string>();
  const fixedRows = fixedRules.map(([label, keywords]) =>
    buildExpenseRuleRow(
      label,
      keywords,
      expenseTransactions,
      year,
      'Gastos fijos',
      matchedIds
    )
  );
  const variableRows = variableRules.map(([label, keywords]) =>
    buildExpenseRuleRow(
      label,
      keywords,
      expenseTransactions,
      year,
      'Gastos variables',
      matchedIds
    )
  );

  return [...fixedRows, ...variableRows];
}

function buildVeramarSummary(transactions: AnnualTransaction[], year: number) {
  const veramarTransactions = transactions.filter(isVeramarTransaction);
  const incomeTransactions = veramarTransactions.filter(
    (transaction) => transaction.movementType === 'income'
  );
  const expenseTransactions = veramarTransactions.filter(
    (transaction) => transaction.movementType === 'expense'
  );
  const incomeRows = [
    buildRuleRow(
      'veramar-booking',
      'Booking',
      incomeTransactions,
      year,
      ['booking'],
      'income'
    ),
    buildRuleRow(
      'veramar-income-1',
      'Ingreso 1',
      incomeTransactions,
      year,
      ['ingreso 1'],
      'income'
    ),
    buildRuleRow(
      'veramar-income-2',
      'Ingreso 2',
      incomeTransactions,
      year,
      ['ingreso 2'],
      'income'
    ),
    buildRuleRow(
      'veramar-income-3',
      'Ingreso 3',
      incomeTransactions,
      year,
      ['ingreso 3'],
      'income'
    ),
    buildOtherRuleRow(
      'veramar-other-income',
      'Otros',
      incomeTransactions,
      year,
      ['booking', 'ingreso 1', 'ingreso 2', 'ingreso 3'],
      'income'
    )
  ];
  const expenseRows = [
    buildRuleRow(
      'veramar-luz',
      'Luz',
      expenseTransactions,
      year,
      ['luz', 'iberdrola', 'endesa'],
      'expense'
    ),
    buildRuleRow(
      'veramar-comunidad',
      'Comunidad',
      expenseTransactions,
      year,
      ['comunidad'],
      'expense'
    ),
    buildRuleRow(
      'veramar-internet',
      'Internet',
      expenseTransactions,
      year,
      ['internet', 'movistar', 'vodafone'],
      'expense'
    ),
    buildRuleRow(
      'veramar-impuestos',
      'Impuestos',
      expenseTransactions,
      year,
      ['impuesto', 'ibi'],
      'expense'
    ),
    buildRuleRow(
      'veramar-hacienda',
      'Hacienda',
      expenseTransactions,
      year,
      ['hacienda'],
      'expense'
    ),
    buildOtherRuleRow(
      'veramar-varios',
      'Gastos varios',
      expenseTransactions,
      year,
      [
        'luz',
        'iberdrola',
        'endesa',
        'comunidad',
        'internet',
        'movistar',
        'vodafone',
        'impuesto',
        'ibi',
        'hacienda'
      ],
      'expense'
    )
  ];
  const monthlyIncome = sumMonthly(incomeTransactions);
  const monthlyExpenses = sumMonthly(expenseTransactions);
  const monthlyBalance = monthlyIncome.map(
    (income, month) => income - (monthlyExpenses[month] ?? 0)
  );

  return {
    expenseRows,
    incomeRows,
    monthlyBalance,
    monthlyExpenses,
    monthlyIncome,
    totalBalance: sum(monthlyBalance),
    totalExpenses: sum(monthlyExpenses),
    totalIncome: sum(monthlyIncome)
  } satisfies VeramarSummary;
}

function buildSavingsSummary(transactions: AnnualTransaction[], year: number) {
  const investmentTransactions = transactions.filter(
    (transaction) => transaction.movementType === 'investment'
  );
  const transferTransactions = transactions.filter(
    (transaction) => transaction.movementType === 'transfer'
  );
  const destinations = ['BBVA', 'MyInvestor', 'Binance', 'Ledger'];

  return {
    destinationRows: destinations.map((destination) =>
      buildRuleRow(
        `destination-${destination}`,
        destination,
        [...investmentTransactions, ...transferTransactions],
        year,
        [destination],
        'investment'
      )
    ),
    platformRows: destinations
      .filter((destination) => destination !== 'BBVA')
      .map((destination) =>
        buildRuleRow(
          `platform-${destination}`,
          destination,
          investmentTransactions,
          year,
          [destination],
          'investment'
        )
      ),
    transferRows: transferTransactions.map((transaction) => ({
      amount: transaction.amount,
      currency: transaction.currency,
      date: transaction.occurredAt,
      destination: getTransferDestination(transaction),
      id: transaction.id,
      month: transaction.month,
      origin: transaction.accountName
    }))
  } satisfies SavingsSummary;
}

function buildRuleRow(
  key: string,
  label: string,
  transactions: AnnualTransaction[],
  year: number,
  keywords: string[],
  tone: AnnualTableRow['tone']
) {
  const matchingTransactions =
    keywords.length > 0
      ? transactions.filter((transaction) =>
          keywords.some((keyword) =>
            transaction.searchText.includes(normalizeText(keyword))
          )
        )
      : transactions;

  return createTransactionRow(key, label, matchingTransactions, tone, year, keywords[0]);
}

function buildExpenseRuleRow(
  label: string,
  keywords: string[],
  transactions: AnnualTransaction[],
  year: number,
  group: string,
  matchedIds: Set<string>
) {
  const matchingTransactions =
    keywords.length > 0
      ? transactions.filter(
          (transaction) =>
            !matchedIds.has(transaction.id) &&
            keywords.some((keyword) =>
              transaction.searchText.includes(normalizeText(keyword))
            )
        )
      : transactions.filter((transaction) => !matchedIds.has(transaction.id));

  matchingTransactions.forEach((transaction) => matchedIds.add(transaction.id));

  return {
    ...createTransactionRow(
      `${group}-${label}`,
      label,
      matchingTransactions,
      'expense',
      year,
      keywords[0]
    ),
    group
  } satisfies AnnualTableRow;
}

function buildOtherIncomeRow(transactions: AnnualTransaction[], year: number) {
  const knownKeywords = [
    'nomina',
    'nómina',
    'fran',
    'nieves',
    'veramar',
    'booking',
    'dividendo',
    'dividend',
    'interes',
    'interés',
    'interest'
  ];
  const otherTransactions = transactions.filter(
    (transaction) =>
      !knownKeywords.some((keyword) =>
        transaction.searchText.includes(normalizeText(keyword))
      )
  );

  return createTransactionRow('income-other', 'Otros', otherTransactions, 'income', year);
}

function buildOtherRuleRow(
  key: string,
  label: string,
  transactions: AnnualTransaction[],
  year: number,
  excludedKeywords: string[],
  tone: AnnualTableRow['tone']
) {
  const otherTransactions = transactions.filter(
    (transaction) =>
      !excludedKeywords.some((keyword) =>
        transaction.searchText.includes(normalizeText(keyword))
      )
  );

  return createTransactionRow(key, label, otherTransactions, tone, year);
}

function createTransactionRow(
  key: string,
  label: string,
  transactions: AnnualTransaction[],
  tone: AnnualTableRow['tone'],
  year: number,
  searchHint?: string
) {
  const values = sumMonthly(transactions);
  const firstCategoryId = transactions.find(
    (transaction) => transaction.categoryId
  )?.categoryId;

  return {
    key,
    label,
    targets: values.map((_, month) => ({
      categoryId: searchHint ? undefined : (firstCategoryId ?? undefined),
      month,
      movementType:
        tone === 'income'
          ? 'income'
          : tone === 'expense'
            ? 'expense'
            : tone === 'investment'
              ? 'investment'
              : 'all',
      search: searchHint,
      year
    })),
    tone,
    total: sum(values),
    values
  } satisfies AnnualTableRow;
}

function createStaticRow(
  key: string,
  label: string,
  values: number[],
  tone: AnnualTableRow['tone'],
  year: number,
  movementType: AnnualCellTarget['movementType']
) {
  return {
    key,
    label,
    targets: values.map((_, month) => ({
      month,
      movementType,
      year
    })),
    tone,
    total: sum(values),
    values
  } satisfies AnnualTableRow;
}

async function getYearTransactions(workspaceId: string, year: number) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, account_id, amount, currency, direction, occurred_at, description, category_id, movement_type, linked_transaction_id'
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .gte('occurred_at', `${year}-01-01T00:00:00.000Z`)
    .lte('occurred_at', `${year}-12-31T23:59:59.999Z`)
    .returns<TransactionRecord[]>();

  if (error) {
    throw error;
  }

  return data;
}

async function getAvailableYears(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('occurred_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'posted')
    .order('occurred_at', { ascending: false })
    .returns<{ occurred_at: string }[]>();

  if (error) {
    throw error;
  }

  return [
    ...new Set(
      data.map((transaction) => new Date(transaction.occurred_at).getUTCFullYear())
    )
  ];
}

async function getLinkedTransactionsById(transactionIds: string[]) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  if (transactionIds.length === 0) {
    return new Map<string, LinkedTransactionRecord>();
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('id, account_id')
    .in('id', [...new Set(transactionIds)])
    .returns<LinkedTransactionRecord[]>();

  if (error) {
    throw error;
  }

  return new Map(data.map((transaction) => [transaction.id, transaction]));
}

function sumMonthly(transactions: AnnualTransaction[]) {
  const values = createEmptyMonths();

  transactions.forEach((transaction) => {
    values[transaction.month] = (values[transaction.month] ?? 0) + transaction.amount;
  });

  return values;
}

function createEmptyMonths() {
  return Array.from({ length: 12 }, () => 0);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function isVeramarTransaction(transaction: AnnualTransaction) {
  return (
    transaction.searchText.includes('veramar') ||
    transaction.searchText.includes('booking')
  );
}

function getTransferDestination(transaction: AnnualTransaction) {
  return transaction.linkedAccountName ?? transaction.description;
}

function fallbackMovementType(direction: AnnualTransaction['direction']) {
  return direction === 'inflow' ? 'income' : 'expense';
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getAccountDisplayName(account: FinancialAccount) {
  if (
    account.institutionName &&
    account.institutionName !== 'Manual' &&
    !account.name.toLowerCase().includes(account.institutionName.toLowerCase())
  ) {
    return `${account.institutionName} / ${account.name}`;
  }

  return account.name;
}
