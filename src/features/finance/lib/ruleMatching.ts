import type { MovementType } from '@/features/finance/lib/import/types';

export type RuleScope = {
  accountId?: string | null;
  categoryId: string;
  id: string;
  keyword: string;
  movementType?: MovementType;
  normalizedKeyword?: string | null;
  priority: number;
  specificity?: number | null;
  workspaceId: string | null;
};

export type RuleMatchDebug = {
  normalizedDescription: string;
  candidates: Array<{
    ruleId: string;
    keyword: string;
    normalizedKeyword: string;
    matched: boolean;
    reason: string;
  }>;
  selectedRuleId: string | null;
};

export function normalizeRuleText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bs\s*&\s*p\s*500\b/g, 'sp500')
    .replace(/\bs\s+p\s*500\b/g, 'sp500')
    .replace(/\bsp\s*500\b/g, 'sp500')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 0 && !/^\d{4,}$/.test(token))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveRuleKeyword(description: string) {
  const ignoredWords = new Set([
    'abono',
    'cargo',
    'compra',
    'operacion',
    'pago',
    'ref',
    'referencia',
    'recibo',
    'tarjeta',
    'transferencia'
  ]);
  const tokens = normalizeRuleText(description)
    .split(' ')
    .filter((word) => word.length >= 3 && !ignoredWords.has(word));

  return tokens.slice(0, 5).join(' ');
}

export function getRuleSpecificity(keyword: string) {
  const normalizedKeyword = normalizeRuleText(keyword);
  const tokenCount = normalizedKeyword.split(' ').filter(Boolean).length;

  return normalizedKeyword.length + tokenCount * 8;
}

export function findBestRuleMatch(
  rules: RuleScope[],
  description: string,
  context: { accountId?: string | null } = {}
) {
  return getRuleMatchResult(rules, description, context).rule;
}

export function shouldApplyRuleToPendingTransaction(input: {
  accountId?: string | null;
  description: string;
  isReviewed: boolean;
  rule: RuleScope;
}) {
  if (input.isReviewed) {
    return false;
  }

  return Boolean(
    findBestRuleMatch([input.rule], input.description, {
      accountId: input.accountId
    })
  );
}

export function getRuleMatchResult(
  rules: RuleScope[],
  description: string,
  context: { accountId?: string | null } = {}
) {
  const normalizedDescription = normalizeRuleText(description);
  const candidates = rules.map((rule) => {
    const normalizedKeyword = normalizeRuleText(rule.normalizedKeyword ?? rule.keyword);

    if (!normalizedKeyword) {
      return {
        matched: false,
        normalizedKeyword,
        reason: 'empty-keyword',
        rule
      };
    }

    if (rule.accountId && context.accountId && rule.accountId !== context.accountId) {
      return {
        matched: false,
        normalizedKeyword,
        reason: 'account-mismatch',
        rule
      };
    }

    if (normalizedDescription === normalizedKeyword) {
      return {
        matched: true,
        normalizedKeyword,
        reason: 'exact-normalized-description',
        rule
      };
    }

    if (normalizedDescription.includes(normalizedKeyword)) {
      return {
        matched: true,
        normalizedKeyword,
        reason: 'contains-normalized-keyword',
        rule
      };
    }

    return {
      matched: false,
      normalizedKeyword,
      reason: 'keyword-not-found',
      rule
    };
  });
  const matchingRules = candidates.filter((candidate) => candidate.matched);
  const rule = [...matchingRules].sort((left, right) => {
    if (left.rule.workspaceId && !right.rule.workspaceId) {
      return -1;
    }

    if (!left.rule.workspaceId && right.rule.workspaceId) {
      return 1;
    }

    const specificityDifference =
      getRuleSpecificity(right.normalizedKeyword) -
      getRuleSpecificity(left.normalizedKeyword);

    if (specificityDifference !== 0) {
      return specificityDifference;
    }

    return left.rule.priority - right.rule.priority;
  })[0]?.rule;

  return {
    debug: {
      candidates: candidates.map((candidate) => ({
        keyword: candidate.rule.keyword,
        matched: candidate.matched,
        normalizedKeyword: candidate.normalizedKeyword,
        reason: candidate.reason,
        ruleId: candidate.rule.id
      })),
      normalizedDescription,
      selectedRuleId: rule?.id ?? null
    } satisfies RuleMatchDebug,
    rule: rule ?? null
  };
}
