-- Capitalia Sprint 0.2: financial movement model, categories, rules and asset readiness.

create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  movement_type text not null,
  icon text,
  color text,
  parent_id uuid references public.transaction_categories(id) on delete set null,
  system boolean not null default false,
  created_at timestamptz not null default now(),
  constraint transaction_categories_movement_type_check check (
    movement_type in ('income', 'expense', 'investment', 'transfer')
  ),
  constraint transaction_categories_scope_check check (
    (system = true and workspace_id is null) or (system = false and workspace_id is not null)
  )
);

insert into public.transaction_categories (
  id,
  workspace_id,
  name,
  movement_type,
  icon,
  color,
  parent_id,
  system,
  created_at
)
select
  id,
  workspace_id,
  name,
  case
    when type in ('income') then 'income'
    when type in ('investment', 'asset', 'saving') then 'investment'
    when type in ('transfer') then 'transfer'
    else 'expense'
  end,
  icon,
  color,
  null,
  false,
  created_at
from public.categories
on conflict (id) do nothing;

create unique index transaction_categories_system_unique_idx
  on public.transaction_categories(lower(name), movement_type)
  where system = true;

create unique index transaction_categories_workspace_unique_idx
  on public.transaction_categories(workspace_id, lower(name), movement_type)
  where system = false;

create index transaction_categories_workspace_type_idx
  on public.transaction_categories(workspace_id, movement_type);

create index transaction_categories_parent_idx
  on public.transaction_categories(parent_id);

insert into public.transaction_categories (name, movement_type, system)
values
  ('Nomina', 'income', true),
  ('Booking', 'income', true),
  ('Alquileres', 'income', true),
  ('Dividendos', 'income', true),
  ('Intereses', 'income', true),
  ('Reembolsos', 'income', true),
  ('Bizum recibido', 'income', true),
  ('Venta activos', 'income', true),
  ('Otros ingresos', 'income', true),
  ('Alimentacion', 'expense', true),
  ('Vivienda', 'expense', true),
  ('Hipoteca', 'expense', true),
  ('Luz', 'expense', true),
  ('Agua', 'expense', true),
  ('Internet', 'expense', true),
  ('Seguros', 'expense', true),
  ('Impuestos', 'expense', true),
  ('Salud', 'expense', true),
  ('Restaurantes', 'expense', true),
  ('Compras', 'expense', true),
  ('Ocio', 'expense', true),
  ('Viajes', 'expense', true),
  ('Suscripciones', 'expense', true),
  ('Educacion', 'expense', true),
  ('Mascotas', 'expense', true),
  ('Transporte', 'expense', true),
  ('Otros gastos', 'expense', true),
  ('ETF', 'investment', true),
  ('Fondos', 'investment', true),
  ('Acciones', 'investment', true),
  ('Criptomonedas', 'investment', true),
  ('Plan de pensiones', 'investment', true),
  ('Oro', 'investment', true),
  ('Crowdfunding', 'investment', true),
  ('Otros activos', 'investment', true),
  ('Entre cuentas', 'transfer', true),
  ('Banco a broker', 'transfer', true),
  ('Broker a banco', 'transfer', true),
  ('Efectivo', 'transfer', true),
  ('Ahorro', 'transfer', true),
  ('Revolut', 'transfer', true),
  ('MyInvestor', 'transfer', true),
  ('Otros traspasos', 'transfer', true)
on conflict do nothing;

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  match_type text not null default 'contains',
  keyword text not null,
  category_id uuid not null references public.transaction_categories(id) on delete cascade,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  constraint category_rules_match_type_check check (match_type in ('contains'))
);

create index category_rules_workspace_priority_idx
  on public.category_rules(workspace_id, priority, created_at);

create index category_rules_category_idx on public.category_rules(category_id);

create unique index category_rules_system_keyword_idx
  on public.category_rules(lower(keyword), category_id)
  where workspace_id is null;

insert into public.category_rules (keyword, category_id, priority)
select rule.keyword, category.id, rule.priority
from (
  values
    ('nomina', 'Nomina', 'income', 10),
    ('nomina', 'Nomina', 'income', 11),
    ('booking', 'Booking', 'income', 10),
    ('booking.com', 'Booking', 'income', 9),
    ('booking payments', 'Booking', 'income', 8),
    ('alquiler', 'Alquileres', 'income', 20),
    ('dividendo', 'Dividendos', 'income', 20),
    ('intereses', 'Intereses', 'income', 20),
    ('reembolso', 'Reembolsos', 'income', 20),
    ('bizum recibido', 'Bizum recibido', 'income', 20),
    ('mercadona', 'Alimentacion', 'expense', 20),
    ('lidl', 'Alimentacion', 'expense', 20),
    ('carrefour', 'Alimentacion', 'expense', 20),
    ('aldi', 'Alimentacion', 'expense', 20),
    ('spotify', 'Suscripciones', 'expense', 20),
    ('netflix', 'Suscripciones', 'expense', 20),
    ('prime video', 'Suscripciones', 'expense', 20),
    ('chatgpt', 'Suscripciones', 'expense', 20),
    ('amazon', 'Compras', 'expense', 30),
    ('repsol', 'Transporte', 'expense', 20),
    ('cepsa', 'Transporte', 'expense', 20),
    ('shell', 'Transporte', 'expense', 20),
    ('iberdrola', 'Luz', 'expense', 20),
    ('endesa', 'Luz', 'expense', 20),
    ('movistar', 'Internet', 'expense', 20),
    ('vodafone', 'Internet', 'expense', 20),
    ('mapfre', 'Seguros', 'expense', 20),
    ('fidelity', 'Fondos', 'investment', 10),
    ('vanguard', 'ETF', 'investment', 10),
    ('ishares', 'ETF', 'investment', 10),
    ('msci world', 'ETF', 'investment', 10),
    ('sp500', 'ETF', 'investment', 10),
    ('s&p 500', 'ETF', 'investment', 10),
    ('myinvestor inversion', 'Fondos', 'investment', 10),
    ('bitcoin', 'Criptomonedas', 'investment', 10),
    ('btc', 'Criptomonedas', 'investment', 10),
    ('ethereum', 'Criptomonedas', 'investment', 10),
    ('eth', 'Criptomonedas', 'investment', 10),
    ('solana', 'Criptomonedas', 'investment', 10),
    ('sol', 'Criptomonedas', 'investment', 10),
    ('coinbase', 'Criptomonedas', 'investment', 10),
    ('binance', 'Criptomonedas', 'investment', 10),
    ('kraken', 'Criptomonedas', 'investment', 10),
    ('myinvestor', 'Banco a broker', 'transfer', 30),
    ('revolut', 'Revolut', 'transfer', 30),
    ('transferencia emitida', 'Entre cuentas', 'transfer', 30),
    ('transferencia recibida', 'Entre cuentas', 'transfer', 30),
    ('traspaso', 'Entre cuentas', 'transfer', 30),
    ('efectivo', 'Efectivo', 'transfer', 30),
    ('cajero', 'Efectivo', 'transfer', 30)
) as rule(keyword, category_name, movement_type, priority)
join public.transaction_categories category
  on category.system = true
 and category.name = rule.category_name
 and category.movement_type = rule.movement_type
on conflict do nothing;

alter table public.transactions
  add column if not exists movement_type text,
  add column if not exists is_reviewed boolean not null default false,
  add column if not exists notes text;

update public.transactions
set movement_type = case
  when transaction_type = 'income' then 'income'
  when transaction_type in ('investment_buy', 'investment_sell') then 'investment'
  when transaction_type = 'transfer' then 'transfer'
  when transaction_type = 'refund' then 'income'
  else 'expense'
end
where movement_type is null;

alter table public.transactions
  alter column movement_type set default 'expense',
  alter column movement_type set not null;

alter table public.transactions
  drop constraint if exists transactions_movement_type_check,
  add constraint transactions_movement_type_check check (
    movement_type in ('income', 'expense', 'investment', 'transfer')
  );

alter table public.transactions
  drop constraint if exists transactions_category_id_fkey;

alter table public.transactions
  add constraint transactions_category_id_fkey
  foreign key (category_id)
  references public.transaction_categories(id)
  on delete set null;

create index if not exists transactions_workspace_movement_occurred_idx
  on public.transactions(workspace_id, movement_type, occurred_at desc);

create index if not exists transactions_workspace_review_idx
  on public.transactions(workspace_id, is_reviewed, occurred_at desc);

alter table public.assets
  add column if not exists symbol text,
  add column if not exists isin text,
  add column if not exists quantity numeric,
  add column if not exists manual_value numeric,
  add column if not exists provider text,
  add column if not exists auto_update boolean not null default false;

alter table public.assets
  alter column currency set default 'EUR';

create table public.asset_prices (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  price numeric not null,
  currency text not null default 'EUR',
  source text,
  priced_at timestamptz not null default now(),
  constraint asset_prices_currency_uppercase check (currency = upper(currency))
);

create table public.asset_holdings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  quantity numeric not null,
  average_cost numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index asset_prices_asset_priced_idx
  on public.asset_prices(asset_id, priced_at desc);

create index asset_holdings_workspace_asset_idx
  on public.asset_holdings(workspace_id, asset_id);

create trigger asset_holdings_set_updated_at
before update on public.asset_holdings
for each row execute function public.set_updated_at();

alter table public.transaction_categories enable row level security;
alter table public.category_rules enable row level security;
alter table public.asset_prices enable row level security;
alter table public.asset_holdings enable row level security;

create policy "transaction_categories_select_system_or_member"
on public.transaction_categories for select
to authenticated
using (system = true or public.is_workspace_member(workspace_id));

create policy "transaction_categories_insert_editor"
on public.transaction_categories for insert
to authenticated
with check (
  system = false
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
);

create policy "transaction_categories_update_editor"
on public.transaction_categories for update
to authenticated
using (
  system = false
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
)
with check (
  system = false
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
);

create policy "transaction_categories_delete_editor"
on public.transaction_categories for delete
to authenticated
using (
  system = false
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
);

create policy "category_rules_select_system_or_member"
on public.category_rules for select
to authenticated
using (workspace_id is null or public.is_workspace_member(workspace_id));

create policy "category_rules_insert_editor"
on public.category_rules for insert
to authenticated
with check (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
);

create policy "category_rules_update_editor"
on public.category_rules for update
to authenticated
using (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
)
with check (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
);

create policy "category_rules_delete_editor"
on public.category_rules for delete
to authenticated
using (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
);

create policy "asset_prices_select_member"
on public.asset_prices for select
to authenticated
using (
  exists (
    select 1
    from public.assets a
    where a.id = asset_prices.asset_id
      and public.is_workspace_member(a.workspace_id)
      and a.deleted_at is null
  )
);

create policy "asset_prices_insert_editor"
on public.asset_prices for insert
to authenticated
with check (
  exists (
    select 1
    from public.assets a
    where a.id = asset_prices.asset_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin', 'editor'])
      and a.deleted_at is null
  )
);

create policy "asset_prices_update_editor"
on public.asset_prices for update
to authenticated
using (
  exists (
    select 1
    from public.assets a
    where a.id = asset_prices.asset_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin', 'editor'])
      and a.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.assets a
    where a.id = asset_prices.asset_id
      and public.has_workspace_role(a.workspace_id, array['owner', 'admin', 'editor'])
      and a.deleted_at is null
  )
);

create policy "asset_holdings_select_member"
on public.asset_holdings for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "asset_holdings_insert_editor"
on public.asset_holdings for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "asset_holdings_update_editor"
on public.asset_holdings for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
