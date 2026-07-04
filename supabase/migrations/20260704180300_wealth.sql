-- Capitalia MVP foundation: assets, valuations and net worth snapshots.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null,
  currency char(3) not null,
  status text not null default 'active',
  acquired_at date,
  disposed_at date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint assets_type_check check (
    type in ('cash', 'security', 'crypto', 'real_estate', 'vehicle', 'company', 'other')
  ),
  constraint assets_status_check check (status in ('active', 'disposed', 'archived')),
  constraint assets_currency_uppercase check (currency = upper(currency))
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  value numeric(18, 4) not null,
  currency char(3) not null,
  valued_at timestamptz not null,
  source text not null default 'manual',
  confidence numeric(5, 4),
  created_at timestamptz not null default now(),
  constraint asset_valuations_currency_uppercase check (currency = upper(currency)),
  constraint asset_valuations_source_check check (source in ('manual', 'market', 'import', 'ai_estimate', 'system')),
  constraint asset_valuations_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  total_assets numeric(18, 4) not null,
  total_liabilities numeric(18, 4) not null default 0,
  net_worth numeric(18, 4) not null,
  currency char(3) not null,
  snapshot_date date not null,
  created_at timestamptz not null default now(),
  constraint net_worth_snapshots_currency_uppercase check (currency = upper(currency)),
  constraint net_worth_snapshots_unique_date unique (workspace_id, snapshot_date)
);

create index assets_workspace_type_idx on public.assets(workspace_id, type);
create index assets_workspace_status_idx on public.assets(workspace_id, status);
create index asset_valuations_asset_valued_idx on public.asset_valuations(asset_id, valued_at desc);
create index asset_valuations_workspace_valued_idx on public.asset_valuations(workspace_id, valued_at desc);
create index net_worth_snapshots_workspace_date_idx on public.net_worth_snapshots(workspace_id, snapshot_date desc);

create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

alter table public.assets enable row level security;
alter table public.asset_valuations enable row level security;
alter table public.net_worth_snapshots enable row level security;

create policy "assets_select_member"
on public.assets for select
to authenticated
using (public.is_workspace_member(workspace_id) and deleted_at is null);

create policy "assets_insert_editor"
on public.assets for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "assets_update_editor"
on public.assets for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "asset_valuations_select_member"
on public.asset_valuations for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "asset_valuations_insert_editor"
on public.asset_valuations for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "net_worth_snapshots_select_member"
on public.net_worth_snapshots for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "net_worth_snapshots_insert_editor"
on public.net_worth_snapshots for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "net_worth_snapshots_update_editor"
on public.net_worth_snapshots for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
