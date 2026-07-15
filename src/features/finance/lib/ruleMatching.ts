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
  stableDescription: string;
  candidates: Array<{
    ruleId: string;
    keyword: string;
    normalizedKeyword: string;
    matched: boolean;
    reason: string;
  }>;
  selectedRuleId: string | null;
};

const genericRuleTokens = new Set([
  'autorizacion',
  'autorizaciones',
  'cargo',
  'compra',
  'movimiento',
  'operacion',
  'operaciones',
  'pago',
  'ref',
  'referencia',
  'referencias',
  'terminal',
  'terminales',
  'tarjeta'
]);

const stableStopWords = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'los',
  'para',
  'por',
  'un',
  'una'
]);

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

export function normalizeStableRuleText(value: string) {
  const normalizedValue = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bs\s*&\s*p\s*500\b/g, 'sp500')
    .replace(/\bs\s+p\s*500\b/g, 'sp500')
    .replace(/\bsp\s*500\b/g, 'sp500')
    .replace(/\be\s*\.?\s*s\.?\b/g, 'eess')
    .replace(/\bestacion(?:es)?\s+de\s+servicio\b/g, 'eess')
    .replace(/\bgasolinera(?:s)?\b/g, 'eess')
    .replace(/\bpago\s+con\s+tarjeta\b/g, ' ')
    .replace(/\bcompra\s+con\s+tarjeta\b/g, ' ')
    .replace(/\boperacion(?:es)?\s+tarjeta\b/g, ' ')
    .replace(
      /\b(?:ref|referencia|referencias|autorizacion|terminal)\s*[a-z0-9-]+\b/g,
      ' '
    )
    .replace(/\b(?!sp500\b)(?=[a-z0-9]*\d)[a-z0-9]{4,}\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ');

  const tokens = normalizedValue
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => !stableStopWords.has(token))
    .filter((token) => !genericRuleTokens.has(token));

  if (tokens.length === 0) {
    return '';
  }

  if (tokens.length === 1 && tokens[0] === 'eess') {
    return '';
  }

  return tokens.join(' ').replace(/\s+/g, ' ').trim();
}

export function deriveRuleKeyword(description: string) {
  const stableKeyword = normalizeStableRuleText(description);

  if (stableKeyword) {
    return stableKeyword.split(' ').slice(0, 6).join(' ');
  }

  return '';
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
  const stableDescription = normalizeStableRuleText(description);
  const candidates = rules.map((rule) => {
    const normalizedKeyword = normalizeRuleText(rule.normalizedKeyword ?? rule.keyword);
    const stableKeyword = normalizeStableRuleText(rule.normalizedKeyword ?? rule.keyword);

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

    // Keep the historical matching behavior first for compatibility with existing rules.
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

    // New safer fallback for learned rules with variable bank references.
    if (
      stableDescription &&
      stableKeyword &&
      containsTokenSequence(stableDescription, stableKeyword)
    ) {
      return {
        matched: true,
        normalizedKeyword: stableKeyword,
        reason:
          stableDescription === stableKeyword
            ? 'exact-stable-description'
            : 'contains-stable-keyword',
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
      stableDescription,
      selectedRuleId: rule?.id ?? null
    } satisfies RuleMatchDebug,
    rule: rule ?? null
  };
}

function containsTokenSequence(value: string, pattern: string) {
  const valueTokens = value.split(' ').filter(Boolean);
  const patternTokens = pattern.split(' ').filter(Boolean);

  if (patternTokens.length === 0 || valueTokens.length < patternTokens.length) {
    return false;
  }

  return valueTokens.some((_, index) =>
    patternTokens.every((token, offset) => valueTokens[index + offset] === token)
  );
}
