create table if not exists public.financial_containers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  institution text,
  container_type text not null,
  currency char(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_containers_type_check check (
    container_type in ('bank', 'broker', 'wallet', 'exchange', 'cash', 'other')
  ),
  constraint financial_containers_currency_uppercase check (currency = upper(currency))
);

create unique index if not exists financial_containers_workspace_name_idx
  on public.financial_containers(workspace_id, lower(name));

create index if not exists financial_containers_workspace_type_idx
  on public.financial_containers(workspace_id, container_type);

drop trigger if exists financial_containers_set_updated_at
  on public.financial_containers;

create trigger financial_containers_set_updated_at
before update on public.financial_containers
for each row execute function public.set_updated_at();

alter table public.financial_containers enable row level security;

drop policy if exists "financial_containers_select_member"
  on public.financial_containers;
drop policy if exists "financial_containers_insert_editor"
  on public.financial_containers;
drop policy if exists "financial_containers_update_editor"
  on public.financial_containers;

create policy "financial_containers_select_member"
on public.financial_containers for select
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer']));

create policy "financial_containers_insert_editor"
on public.financial_containers for insert
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "financial_containers_update_editor"
on public.financial_containers for update
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

alter table public.assets
  add column if not exists container_id uuid references public.financial_containers(id) on delete set null,
  add column if not exists asset_type text,
  add column if not exists notes text;

update public.assets
set asset_type = case
  when type = 'cash' then 'cash'
  when type = 'security' then 'fund'
  when type = 'crypto' then 'crypto'
  when type = 'real_estate' then 'real_estate'
  when type = 'vehicle' then 'vehicle'
  else 'other'
end
where asset_type is null;

alter table public.assets
  alter column asset_type set default 'other',
  alter column asset_type set not null;

alter table public.assets
  drop constraint if exists assets_asset_type_check;

alter table public.assets
  add constraint assets_asset_type_check check (
    asset_type in (
      'cash',
      'fund',
      'etf',
      'stock',
      'crypto',
      'real_estate',
      'vehicle',
      'gold',
      'other',
      'liability'
    )
  );

create index if not exists assets_workspace_container_idx
  on public.assets(workspace_id, container_id);

create index if not exists assets_workspace_asset_type_idx
  on public.assets(workspace_id, asset_type);

alter table public.patrimonial_snapshot_items
  add column if not exists linked_container_id uuid references public.financial_containers(id) on delete set null;

create index if not exists patrimonial_snapshot_items_container_idx
  on public.patrimonial_snapshot_items(linked_container_id);

create or replace function public.reset_workspace_financial_data(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.has_workspace_role(target_workspace_id, array['owner', 'admin']) then
    raise exception 'No tienes permisos para resetear este workspace.';
  end if;

  delete from public.asset_prices
  where asset_id in (
    select id from public.assets where workspace_id = target_workspace_id
  );

  delete from public.asset_holdings
  where workspace_id = target_workspace_id;

  delete from public.asset_valuations
  where workspace_id = target_workspace_id;

  delete from public.assets
  where workspace_id = target_workspace_id;

  delete from public.financial_containers
  where workspace_id = target_workspace_id;

  delete from public.patrimonial_snapshot_items
  where workspace_id = target_workspace_id;

  delete from public.patrimonial_snapshots
  where workspace_id = target_workspace_id;

  delete from public.net_worth_snapshots
  where workspace_id = target_workspace_id;

  delete from public.raw_import_records
  where workspace_id = target_workspace_id;

  delete from public.import_files
  where workspace_id = target_workspace_id;

  delete from public.import_batches
  where workspace_id = target_workspace_id;

  delete from public.transactions
  where workspace_id = target_workspace_id;

  delete from public.account_balances
  where workspace_id = target_workspace_id;

  delete from public.financial_accounts
  where workspace_id = target_workspace_id;

  delete from public.category_rules
  where workspace_id = target_workspace_id;

  delete from public.transaction_categories
  where workspace_id = target_workspace_id
    and system = false;
end;
$$;

grant execute on function public.reset_workspace_financial_data(uuid) to authenticated;
