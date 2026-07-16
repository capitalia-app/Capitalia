-- Capitalia: archive invalid assets that were created from ordinary expense movements.
--
-- This is intentionally conservative:
-- - it touches assets generated automatically by the import asset-purchase flow
--   or orphan assets with no platform/provider signal;
-- - it keeps the original bank transaction intact;
-- - it uses soft delete semantics via deleted_at/status;
-- - it avoids assets with symbols, ISINs, quantities or purchase dates.

do $$
declare
  archived_count integer;
begin
  update public.assets
  set
    deleted_at = coalesce(deleted_at, now()),
    status = 'archived',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'invalid_asset_repair',
      jsonb_build_object(
        'reason', 'ordinary_expense_was_imported_as_asset',
        'repaired_at', now()
      )
    )
  where deleted_at is null
    and status = 'active'
    and (
      metadata ->> 'source' = 'asset_purchase_import'
      or container_id is null
      or coalesce(provider, '') = ''
    )
    and coalesce(symbol, '') = ''
    and coalesce(isin, '') = ''
    and quantity is null
    and purchase_date is null
    and (
      lower(name) like '%pago con tarjeta%'
      or lower(name) like '%compra con tarjeta%'
      or lower(name) like '%mercadona%'
      or lower(name) like '%maskom%'
      or lower(name) like '%supermercado%'
      or lower(name) like '%wang wang%'
      or lower(name) like '%jomisoleo%'
      or lower(name) like '%hostalgas%'
      or lower(name) like '%soloptical%'
      or lower(name) like '%autopista%'
      or lower(name) like '%peaje%'
      or lower(name) like '%dankesol%'
      or lower(name) like '%honorarios%'
      or lower(name) like '%adeudo%'
      or lower(name) like '%recibo%'
    )
    and not (
      lower(name) like '%bitcoin%'
      or lower(name) like '%btc%'
      or lower(name) like '%ethereum%'
      or lower(name) like '%eth%'
      or lower(name) like '%solana%'
      or lower(name) like '%xrp%'
      or lower(name) like '%cardano%'
      or lower(name) like '%etf%'
      or lower(name) like '%fondo%'
      or lower(name) like '%fund%'
      or lower(name) like '%fidelity%'
      or lower(name) like '%amundi%'
      or lower(name) like '%vanguard%'
      or lower(name) like '%ishares%'
      or lower(name) like '%msci%'
      or lower(name) like '%nasdaq%'
      or lower(name) like '%s&p%'
      or lower(name) like '%sp500%'
    );

  get diagnostics archived_count = row_count;
  raise notice 'Archived invalid expense assets: %', archived_count;
end $$;
