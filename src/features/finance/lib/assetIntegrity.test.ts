import { describe, expect, it } from 'vitest';

import {
  canCreateImportedAssetFromTransaction,
  getImportedAssetName,
  getNextAssetValueAfterPurchase,
  getNextLiabilityValueAfterPrincipalPayment,
  isLikelyInvalidImportedAsset,
  normalizeAssetText
} from '@/features/finance/lib/assetIntegrity';

describe('asset integrity', () => {
  it('does not create an asset from Mercadona card expenses', () => {
    expect(
      canCreateImportedAssetFromTransaction({
        categoryName: 'Acciones',
        containerType: 'bank',
        description: 'Mercadona cala de mijas Pago con tarjeta',
        movementType: 'investment',
        transactionType: 'asset_purchase'
      })
    ).toBe(false);
  });

  it('does not create an asset from an expense movement', () => {
    expect(
      canCreateImportedAssetFromTransaction({
        categoryName: 'Alimentacion',
        containerType: 'broker',
        description: 'Mercadona Pago con tarjeta',
        movementType: 'expense',
        transactionType: 'expense'
      })
    ).toBe(false);
  });

  it('creates an imported asset only for clear investment purchases on investment containers', () => {
    expect(
      canCreateImportedAssetFromTransaction({
        categoryName: 'Fondos',
        containerType: 'broker',
        description: 'Fidelity MSCI World Index P AC',
        movementType: 'investment',
        transactionType: 'asset_purchase'
      })
    ).toBe(true);
  });

  it('does not use generic card payment text as an investment signal', () => {
    expect(
      canCreateImportedAssetFromTransaction({
        categoryName: 'ETF',
        containerType: 'broker',
        description: 'Eess fuengirola petrol Pago con tarjeta',
        movementType: 'investment',
        transactionType: 'asset_purchase'
      })
    ).toBe(false);
  });

  it('detects invalid imported expense assets safely', () => {
    expect(
      isLikelyInvalidImportedAsset({
        assetType: 'stock',
        metadata: { source: 'asset_purchase_import' },
        name: 'Mercadona el boquetillo Pago con tarjeta',
        purchaseDate: null,
        quantity: null,
        symbol: null
      })
    ).toBe(true);
  });

  it('does not mark manual assets as invalid', () => {
    expect(
      isLikelyInvalidImportedAsset({
        assetType: 'stock',
        metadata: { source: 'manual' },
        name: 'Mercadona el boquetillo Pago con tarjeta',
        purchaseDate: null,
        quantity: null,
        symbol: null
      })
    ).toBe(false);
  });

  it('detects legacy orphan expense assets without import metadata', () => {
    expect(
      isLikelyInvalidImportedAsset({
        assetType: 'stock',
        containerId: null,
        metadata: null,
        name: 'Transferencia realizada Honorarios por redaccion de certificado',
        provider: null,
        purchaseDate: null,
        quantity: null,
        symbol: null
      })
    ).toBe(true);
  });

  it('does not mark platform-owned manual assets as invalid without import metadata', () => {
    expect(
      isLikelyInvalidImportedAsset({
        assetType: 'stock',
        containerId: 'manual-container',
        metadata: null,
        name: 'Mercadona acciones manuales',
        provider: 'Manual',
        purchaseDate: null,
        quantity: null,
        symbol: null
      })
    ).toBe(false);
  });

  it('does not modify real crypto, ETF, fund or stock assets', () => {
    const validAssets = [
      { assetType: 'crypto', name: 'BTC' },
      { assetType: 'etf', name: 'iShares Core MSCI World UCITS ETF' },
      { assetType: 'fund', name: 'Fidelity MSCI World Index P AC' },
      { assetType: 'stock', name: 'Apple Inc', symbol: 'AAPL' }
    ];

    validAssets.forEach((asset) => {
      expect(
        isLikelyInvalidImportedAsset({
          ...asset,
          metadata: { source: 'asset_purchase_import' },
          purchaseDate: null,
          quantity: asset.symbol ? null : 1,
          symbol: asset.symbol ?? null
        })
      ).toBe(false);
    });
  });

  it('normalizes asset text consistently for repair checks', () => {
    expect(normalizeAssetText('Mercadona Cala de Mijas - Pago con tarjeta')).toBe(
      'mercadona cala de mijas pago con tarjeta'
    );
  });

  it('keeps recurring fund purchases grouped under a stable asset name', () => {
    expect(
      getImportedAssetName({
        categoryName: 'Fondos',
        description: 'Compra fondo Fidelity S&P 500 25,00 EUR'
      })
    ).toBe('Fidelity S&P 500');
  });

  it('adds asset purchases to the estimated asset value', () => {
    expect(
      getNextAssetValueAfterPurchase({
        currentValue: 100,
        purchaseAmount: 25
      })
    ).toBe(125);
  });

  it('reduces mortgage debt with principal payments', () => {
    expect(
      getNextLiabilityValueAfterPrincipalPayment({
        currentValue: -64131.53,
        principalAmount: 500
      })
    ).toBe(-63631.53);
  });
});
