-- Capitalia: acquisition cost fields for patrimonial assets.

alter table public.assets
  add column if not exists purchase_price numeric,
  add column if not exists average_cost numeric,
  add column if not exists total_cost numeric,
  add column if not exists purchase_date date;

create index if not exists assets_workspace_purchase_date_idx
  on public.assets(workspace_id, purchase_date)
  where purchase_date is not null;
