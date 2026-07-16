-- Capitalia: mortgages are liabilities, not real-estate assets.
--
-- Safe/idempotent repair:
-- - keeps the asset row and all movements intact;
-- - changes mortgage-looking assets to asset_type = liability;
-- - stores the pending debt as a negative manual_value;
-- - links the mortgage to the single real-estate asset in the workspace when that
--   relationship is unambiguous.

with single_real_estate as (
  select
    workspace_id,
    min(id) as real_estate_id,
    count(*) as real_estate_count
  from public.assets
  where deleted_at is null
    and status = 'active'
    and asset_type = 'real_estate'
    and lower(name) not like '%hipoteca%'
    and lower(name) not like '%mortgage%'
  group by workspace_id
),
mortgage_assets as (
  select
    mortgage.id,
    mortgage.workspace_id,
    case
      when estate.real_estate_count = 1 then estate.real_estate_id
      else mortgage.linked_asset_id
    end as target_linked_asset_id
  from public.assets mortgage
  left join single_real_estate estate
    on estate.workspace_id = mortgage.workspace_id
  where mortgage.deleted_at is null
    and mortgage.status = 'active'
    and (
      lower(mortgage.name) like '%hipoteca%'
      or lower(mortgage.name) like '%mortgage%'
    )
)
update public.assets asset
set
  asset_type = 'liability',
  type = 'other',
  manual_value = -abs(coalesce(asset.manual_value, 0)),
  linked_asset_id = mortgage.target_linked_asset_id,
  metadata = coalesce(asset.metadata, '{}'::jsonb) || jsonb_build_object(
    'mortgage_liability_repair',
    jsonb_build_object(
      'reason', 'mortgage_must_be_liability',
      'repaired_at', now()
    )
  )
from mortgage_assets mortgage
where asset.id = mortgage.id;

with single_real_estate_item as (
  select
    workspace_id,
    snapshot_id,
    min(linked_asset_id) as real_estate_asset_id,
    count(*) as real_estate_count
  from public.patrimonial_snapshot_items
  where type = 'real_estate'
    and lower(name) not like '%hipoteca%'
    and lower(name) not like '%mortgage%'
    and linked_asset_id is not null
  group by workspace_id, snapshot_id
),
mortgage_items as (
  select
    item.id,
    case
      when estate.real_estate_count = 1 then estate.real_estate_asset_id
      else item.linked_asset_id
    end as target_linked_asset_id
  from public.patrimonial_snapshot_items item
  left join single_real_estate_item estate
    on estate.workspace_id = item.workspace_id
   and estate.snapshot_id = item.snapshot_id
  where item.type <> 'liability'
    and (
      lower(item.name) like '%hipoteca%'
      or lower(item.name) like '%mortgage%'
    )
)
update public.patrimonial_snapshot_items item
set
  type = 'liability',
  value = -abs(item.value),
  linked_asset_id = mortgage.target_linked_asset_id
from mortgage_items mortgage
where item.id = mortgage.id;
