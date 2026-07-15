export type ComparableTransaction = {
  id?: string;
  accountId: string;
  amount: number;
  date: string;
  description: string;
  direction: 'inflow' | 'outflow';
  stableReference?: string | null;
};

export type DuplicateMatch = {
  transaction: ComparableTransaction;
  score: number;
  reason: string;
};

const duplicateSimilarityThreshold = 0.72;
const suspiciousSimilarityThreshold = 0.42;

export function findEquivalentTransaction(
  transaction: ComparableTransaction,
  candidates: ComparableTransaction[]
) {
  return findBestMatch(transaction, candidates, duplicateSimilarityThreshold);
}

export function findSuspiciousTransaction(
  transaction: ComparableTransaction,
  candidates: ComparableTransaction[]
) {
  return findBestMatch(transaction, candidates, suspiciousSimilarityThreshold);
}

export function isEquivalentTransaction(
  left: ComparableTransaction,
  right: ComparableTransaction
) {
  return Boolean(findEquivalentTransaction(left, [right]));
}

export function findDuplicateGroups<TTransaction extends ComparableTransaction>(
  transactions: TTransaction[]
) {
  const groups: Array<{ primary: TTransaction; duplicates: TTransaction[] }> = [];
  const consumedIds = new Set<string>();

  transactions.forEach((transaction) => {
    if (transaction.id && consumedIds.has(transaction.id)) {
      return;
    }

    const duplicates = transactions.filter((candidate) => {
      if (candidate === transaction) {
        return false;
      }

      if (candidate.id && consumedIds.has(candidate.id)) {
        return false;
      }

      return isEquivalentTransaction(transaction, candidate);
    });

    if (duplicates.length === 0) {
      return;
    }

    groups.push({ duplicates, primary: transaction });

    [transaction, ...duplicates].forEach((duplicate) => {
      if (duplicate.id) {
        consumedIds.add(duplicate.id);
      }
    });
  });

  return groups;
}

export function getDuplicateScore(
  left: ComparableTransaction,
  right: ComparableTransaction
) {
  if (left.accountId !== right.accountId) {
    return 0;
  }

  if (left.direction !== right.direction) {
    return 0;
  }

  if (toCents(left.amount) !== toCents(right.amount)) {
    return 0;
  }

  const dateDistance = getDateDistanceInDays(left.date, right.date);

  if (dateDistance > 2) {
    return 0;
  }

  const descriptionScore = getDescriptionSimilarity(left.description, right.description);
  const sameStableReference = hasSameStableReference(left, right);

  if (dateDistance > 0 && !sameStableReference) {
    return descriptionScore >= 0.78 ? suspiciousSimilarityThreshold : 0;
  }

  const dateScore = dateDistance === 0 ? 1 : dateDistance === 1 ? 0.92 : 0.84;

  return descriptionScore * 0.72 + dateScore * 0.28;
}

export function normalizeTransactionDescription(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(
  transaction: ComparableTransaction,
  candidates: ComparableTransaction[],
  minimumScore: number
): DuplicateMatch | null {
  const matches = candidates
    .map((candidate) => ({
      reason: getMatchReason(transaction, candidate),
      score: getDuplicateScore(transaction, candidate),
      transaction: candidate
    }))
    .filter((match) => match.score >= minimumScore)
    .sort((left, right) => right.score - left.score);

  return matches[0] ?? null;
}

function getMatchReason(left: ComparableTransaction, right: ComparableTransaction) {
  const days = getDateDistanceInDays(left.date, right.date);
  const dateReason =
    days === 0 ? 'misma fecha' : `fecha cercana (${days} dia${days === 1 ? '' : 's'})`;

  return `${dateReason}, mismo importe y descripcion similar`;
}

function hasSameStableReference(
  left: ComparableTransaction,
  right: ComparableTransaction
) {
  return Boolean(
    left.stableReference &&
    right.stableReference &&
    left.stableReference === right.stableReference
  );
}

function getDescriptionSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeTransactionDescription(left);
  const normalizedRight = normalizeTransactionDescription(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return 0.9;
  }

  const leftTokens = new Set(getDescriptionTokens(normalizedLeft));
  const rightTokens = new Set(getDescriptionTokens(normalizedRight));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function getDescriptionTokens(value: string) {
  return value
    .split(' ')
    .filter((token) => token.length >= 3 && !['the', 'por', 'para'].includes(token));
}

function getDateDistanceInDays(left: string, right: string) {
  const leftDate = new Date(`${left.slice(0, 10)}T12:00:00.000Z`);
  const rightDate = new Date(`${right.slice(0, 10)}T12:00:00.000Z`);

  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000));
}

function toCents(value: number) {
  return Math.round(Math.abs(value) * 100);
}
