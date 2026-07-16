import type { ContainerType } from '@/features/finance/lib/snapshots';
import type {
  ImportTransactionType,
  MovementType
} from '@/features/finance/lib/import/types';

export type AssetPurchaseCandidate = {
  categoryName?: string | null;
  containerType?: ContainerType | null;
  description: string;
  movementType: MovementType;
  transactionType?: ImportTransactionType | null;
};

export type ImportedAssetRecord = {
  assetType?: string | null;
  containerId?: string | null;
  isin?: string | null;
  metadata?: Record<string, unknown> | null;
  name: string;
  purchaseDate?: string | null;
  provider?: string | null;
  quantity?: number | string | null;
  symbol?: string | null;
};

const investmentContainerTypes = new Set<ContainerType>(['broker', 'exchange', 'wallet']);

const investmentKeywords = [
  'accion',
  'acciones',
  'amundi',
  'bitcoin',
  'btc',
  'cardano',
  'cripto',
  'crypto',
  'ethereum',
  'etf',
  'fidelity',
  'fondo',
  'fondos',
  'index',
  'indexado',
  'ishares',
  'msci',
  'nasdaq',
  'participaciones',
  's&p',
  's&p 500',
  'solana',
  'sp500',
  'vanguard',
  'xrp'
];

const expenseMerchantKeywords = [
  'adeudo',
  'autopista',
  'compra con tarjeta',
  'dankesol',
  'eess',
  'gasolinera',
  'honorarios',
  'hostalgas',
  'jomisoleo',
  'maskom',
  'mercadona',
  'pago con tarjeta',
  'peaje',
  'recibo',
  'soloptical',
  'supermercado',
  'wang wang'
];

const validAssetTypes = new Set([
  'crypto',
  'etf',
  'fund',
  'gold',
  'real_estate',
  'stock'
]);

export function canCreateImportedAssetFromTransaction(candidate: AssetPurchaseCandidate) {
  if (
    candidate.movementType !== 'investment' ||
    candidate.transactionType !== 'asset_purchase'
  ) {
    return false;
  }

  const normalizedText = normalizeAssetText(
    `${candidate.description} ${candidate.categoryName ?? ''}`
  );

  if (containsAny(normalizedText, expenseMerchantKeywords)) {
    return false;
  }

  if (candidate.containerType && !investmentContainerTypes.has(candidate.containerType)) {
    return false;
  }

  return containsAny(normalizedText, investmentKeywords);
}

export function isLikelyInvalidImportedAsset(asset: ImportedAssetRecord) {
  const source = getAssetSource(asset.metadata);

  if (source && source !== 'asset_purchase_import') {
    return false;
  }

  const hasImportOrigin =
    source === 'asset_purchase_import' ||
    (!hasText(asset.provider) && !asset.containerId);

  const normalizedName = normalizeAssetText(asset.name);

  if (!hasImportOrigin || !containsAny(normalizedName, expenseMerchantKeywords)) {
    return false;
  }

  if (
    asset.assetType &&
    validAssetTypes.has(asset.assetType) &&
    containsAny(normalizedName, investmentKeywords)
  ) {
    return false;
  }

  return (
    !hasText(asset.symbol) &&
    !hasText(asset.isin) &&
    !hasText(asset.purchaseDate) &&
    !hasPositiveNumber(asset.quantity)
  );
}

export function normalizeAssetText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => containsKeyword(value, keyword));
}

function containsKeyword(value: string, keyword: string) {
  const normalizedKeyword = normalizeAssetText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  return new RegExp(`(^| )${escapeRegExp(normalizedKeyword)}( |$)`).test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAssetSource(metadata: ImportedAssetRecord['metadata']) {
  if (!metadata || typeof metadata.source !== 'string') {
    return null;
  }

  return metadata.source;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasPositiveNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  return Number(value) > 0;
}
