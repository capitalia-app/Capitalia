import { describe, expect, it } from 'vitest';

import {
  deriveRuleKeyword,
  findBestRuleMatch,
  normalizeRuleText,
  shouldApplyRuleToPendingTransaction,
  type RuleScope
} from '@/features/finance/lib/ruleMatching';

describe('rule matching', () => {
  const foodRule = createRule('mercadona', 'food', 25);
  const genericInvestmentRule = createRule('sp500', 'generic-sp500', 60);
  const specificFundRule = createRule('fidelity sp500 index', 'fund-sp500', 25);

  it('normalizes case, accents, symbols and spaces without requiring exact amount', () => {
    expect(normalizeRuleText('  MERCÁDONA  Compra / Ref. 12345678  ')).toBe(
      'mercadona compra ref'
    );
    expect(findBestRuleMatch([foodRule], 'mercadona compra 18,20 EUR')?.categoryId).toBe(
      'food'
    );
    expect(findBestRuleMatch([foodRule], 'MERCÁDONA compra 91,45 EUR')?.categoryId).toBe(
      'food'
    );
  });

  it('normalizes S&P 500 variants consistently', () => {
    expect(normalizeRuleText('Fidelity S&P 500 Index P AC')).toContain(
      'fidelity sp500 index'
    );
    expect(normalizeRuleText('Fidelity SP 500 Index P AC')).toContain(
      'fidelity sp500 index'
    );
    expect(normalizeRuleText('Fidelity SP500 Index P AC')).toContain(
      'fidelity sp500 index'
    );
  });

  it('ignores variable bank references but keeps meaningful words', () => {
    const keyword = deriveRuleKeyword('Compra Fondo Fidelity S&P 500 ref 987654321');

    expect(keyword).toBe('fondo fidelity sp500');
    expect(
      findBestRuleMatch(
        [createRule(keyword, 'fund', 25)],
        'FONDO Fidelity SP500 REF 123456789'
      )?.categoryId
    ).toBe('fund');
  });

  it('prioritizes manual and more specific rules over generic ones', () => {
    expect(
      findBestRuleMatch(
        [genericInvestmentRule, specificFundRule],
        'Aportacion Fidelity S&P 500 Index P AC'
      )?.categoryId
    ).toBe('fund-sp500');
  });

  it('can use account context without blocking global rules', () => {
    const accountRule = createRule('nomina', 'income-account', 10, 'account-a');
    const globalRule = createRule('nomina', 'income-global', 25);

    expect(
      findBestRuleMatch([accountRule, globalRule], 'Nomina Fran', {
        accountId: 'account-b'
      })?.categoryId
    ).toBe('income-global');
    expect(
      findBestRuleMatch([accountRule, globalRule], 'Nomina Fran', {
        accountId: 'account-a'
      })?.categoryId
    ).toBe('income-account');
  });

  it('applies learned rules only to pending equivalent transactions', () => {
    expect(
      shouldApplyRuleToPendingTransaction({
        description: 'Mercadona compra ref 123456',
        isReviewed: false,
        rule: foodRule
      })
    ).toBe(true);
    expect(
      shouldApplyRuleToPendingTransaction({
        description: 'Mercadona compra ref 123456',
        isReviewed: true,
        rule: foodRule
      })
    ).toBe(false);
  });
});

function createRule(
  keyword: string,
  categoryId: string,
  priority: number,
  accountId: string | null = null
) {
  return {
    accountId,
    categoryId,
    id: `${categoryId}-${keyword}`,
    keyword,
    normalizedKeyword: normalizeRuleText(keyword),
    priority,
    workspaceId: 'workspace'
  } satisfies RuleScope;
}
