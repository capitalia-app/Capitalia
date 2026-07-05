-- Capitalia Sprint 0.3: import dedupe, MyInvestor rules, safe workspace reset and patrimonial snapshots.

alter table public.transactions
  add column if not exists import_hash text;

create index if not exists transactions_workspace_import_hash_idx
  on public.transactions(workspace_id, import_hash)
  where import_hash is not null;

insert into public.transaction_categories (name, movement_type, system)
values
  ('Comisiones', 'expense', true)
on conflict do nothing;

update public.category_rules rule
set priority = 10
from public.transaction_categories category
where rule.category_id = category.id
  and rule.workspace_id is null
  and category.movement_type = 'investment'
  and lower(rule.keyword) in (
    'fondo',
    'fondos',
    'fondo indexado',
    'fidelity',
    'vanguard',
    'ishares',
    'amundi',
    'indexado',
    'msci',
    'msci world',
    'sp500',
    's&p500',
    's&p 500',
    'etf',
    'compra valor',
    'compra fondo',
    'suscripcion fondo',
    'aportacion fondo',
    'traspaso fondo',
    'valores',
    'mercado',
    'inversion',
    'accion',
    'acciones',
    'cripto',
    'criptomoneda',
    'criptomonedas',
    'crypto'
  );

update public.category_rules rule
set priority = 20
from public.transaction_categories category
where rule.category_id = category.id
  and rule.workspace_id is null
  and category.movement_type = 'transfer'
  and lower(rule.keyword) in (
    'myinvestor',
    'transferencia recibida',
    'transferencia emitida',
    'traspaso efectivo',
    'ingreso efectivo',
    'retirada efectivo',
    'cuenta efectivo',
    'broker'
  );

insert into public.category_rules (keyword, category_id, priority)
select rule.keyword, category.id, rule.priority
from (
  values
    ('fondo', 'Fondos', 'investment', 10),
    ('fondos', 'Fondos', 'investment', 10),
    ('fondo indexado', 'Fondos', 'investment', 10),
    ('fidelity', 'Fondos', 'investment', 10),
    ('amundi', 'Fondos', 'investment', 10),
    ('indexado', 'Fondos', 'investment', 10),
    ('compra fondo', 'Fondos', 'investment', 10),
    ('suscripcion fondo', 'Fondos', 'investment', 10),
    ('aportacion fondo', 'Fondos', 'investment', 10),
    ('traspaso fondo', 'Fondos', 'investment', 10),
    ('inversion', 'Fondos', 'investment', 10),
    ('vanguard', 'ETF', 'investment', 10),
    ('ishares', 'ETF', 'investment', 10),
    ('msci', 'ETF', 'investment', 10),
    ('msci world', 'ETF', 'investment', 10),
    ('sp500', 'ETF', 'investment', 10),
    ('s&p500', 'ETF', 'investment', 10),
    ('s&p 500', 'ETF', 'investment', 10),
    ('etf', 'ETF', 'investment', 10),
    ('compra valor', 'Acciones', 'investment', 10),
    ('valores', 'Acciones', 'investment', 10),
    ('mercado', 'Acciones', 'investment', 10),
    ('accion', 'Acciones', 'investment', 10),
    ('acciones', 'Acciones', 'investment', 10),
    ('cripto', 'Criptomonedas', 'investment', 10),
    ('criptomoneda', 'Criptomonedas', 'investment', 10),
    ('criptomonedas', 'Criptomonedas', 'investment', 10),
    ('crypto', 'Criptomonedas', 'investment', 10),
    ('myinvestor', 'Banco a broker', 'transfer', 20),
    ('transferencia recibida', 'Entre cuentas', 'transfer', 20),
    ('transferencia emitida', 'Entre cuentas', 'transfer', 20),
    ('traspaso efectivo', 'Entre cuentas', 'transfer', 20),
    ('ingreso efectivo', 'Efectivo', 'transfer', 20),
    ('retirada efectivo', 'Efectivo', 'transfer', 20),
    ('cuenta efectivo', 'Efectivo', 'transfer', 20),
    ('broker', 'Banco a broker', 'transfer', 20),
    ('dividendo', 'Dividendos', 'income', 30),
    ('dividendos', 'Dividendos', 'income', 30),
    ('cupon', 'Dividendos', 'income', 30),
    ('intereses', 'Intereses', 'income', 30),
    ('remuneracion', 'Intereses', 'income', 30),
    ('comision', 'Comisiones', 'expense', 100),
    ('custodia', 'Comisiones', 'expense', 100),
    ('retencion', 'Impuestos', 'expense', 100),
    ('impuesto', 'Impuestos', 'expense', 100)
) as rule(keyword, category_name, movement_type, priority)
join public.transaction_categories category
  on category.system = true
 and category.name = rule.category_name
 and category.movement_type = rule.movement_type
on conflict do nothing;

create table public.patrimonial_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  snapshot_date date not null,
  name text not null default 'Snapshot inicial',
  notes text,
  created_at timestamptz not null default now(),
  constraint patrimonial_snapshots_unique_workspace_date unique (workspace_id, snapshot_date)
);

create table public.patrimonial_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.patrimonial_snapshots(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null,
  value numeric(18, 4) not null,
  currency char(3) not null default 'EUR',
  linked_account_id uuid references public.financial_accounts(id) on delete set null,
  linked_asset_id uuid references public.assets(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint patrimonial_snapshot_items_type_check check (
    type in (
      'bank_account',
      'broker',
      'cash',
      'fund',
      'etf',
      'stock',
      'crypto',
      'real_estate',
      'vehicle',
      'other_asset',
      'liability'
    )
  ),
  constraint patrimonial_snapshot_items_currency_uppercase check (currency = upper(currency))
);

create index patrimonial_snapshots_workspace_date_idx
  on public.patrimonial_snapshots(workspace_id, snapshot_date desc);

create index patrimonial_snapshot_items_snapshot_idx
  on public.patrimonial_snapshot_items(snapshot_id);

create index patrimonial_snapshot_items_workspace_idx
  on public.patrimonial_snapshot_items(workspace_id);

alter table public.patrimonial_snapshots enable row level security;
alter table public.patrimonial_snapshot_items enable row level security;

create policy "patrimonial_snapshots_select_member"
on public.patrimonial_snapshots for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "patrimonial_snapshots_insert_editor"
on public.patrimonial_snapshots for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "patrimonial_snapshots_update_editor"
on public.patrimonial_snapshots for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "patrimonial_snapshot_items_select_member"
on public.patrimonial_snapshot_items for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "patrimonial_snapshot_items_insert_editor"
on public.patrimonial_snapshot_items for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "patrimonial_snapshot_items_update_editor"
on public.patrimonial_snapshot_items for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

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
