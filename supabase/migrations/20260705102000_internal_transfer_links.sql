alter table public.transactions
  add column if not exists transfer_group_id uuid,
  add column if not exists linked_transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists counterparty_container_id uuid references public.financial_containers(id) on delete set null;

create index if not exists transactions_workspace_transfer_group_idx
  on public.transactions(workspace_id, transfer_group_id)
  where transfer_group_id is not null;

create index if not exists transactions_workspace_linked_transaction_idx
  on public.transactions(workspace_id, linked_transaction_id)
  where linked_transaction_id is not null;

create index if not exists transactions_counterparty_container_idx
  on public.transactions(counterparty_container_id)
  where counterparty_container_id is not null;

update public.category_rules rule
set priority = 10
from public.transaction_categories category
where rule.category_id = category.id
  and rule.workspace_id is null
  and category.name = 'Fondos'
  and category.movement_type = 'investment'
  and lower(rule.keyword) in (
    'fondo',
    'fondos',
    'indexado',
    'fidelity',
    'amundi',
    'clase',
    'participaciones',
    'suscripcion fondo',
    'suscripción fondo',
    'traspaso fondo',
    'reembolso fondo'
  );

update public.category_rules rule
set priority = 20
from public.transaction_categories category
where rule.category_id = category.id
  and rule.workspace_id is null
  and category.name = 'ETF'
  and category.movement_type = 'investment'
  and lower(rule.keyword) in (
    'msci',
    'msci world',
    'sp500',
    's&p500',
    's&p 500',
    'vanguard',
    'ishares'
  );

insert into public.category_rules (keyword, category_id, priority)
select rule.keyword, category.id, rule.priority
from (
  values
    ('clase', 'Fondos', 'investment', 10),
    ('participaciones', 'Fondos', 'investment', 10),
    ('suscripcion fondo', 'Fondos', 'investment', 10),
    ('suscripción fondo', 'Fondos', 'investment', 10),
    ('reembolso fondo', 'Fondos', 'investment', 10),
    ('ucits etf', 'ETF', 'investment', 20),
    ('ishares etf', 'ETF', 'investment', 20),
    ('vanguard etf', 'ETF', 'investment', 20),
    ('ticker', 'ETF', 'investment', 20),
    ('compra etf', 'ETF', 'investment', 20),
    ('entre cuentas', 'Entre cuentas', 'transfer', 10),
    ('ingreso efectivo', 'Efectivo', 'transfer', 10),
    ('retirada efectivo', 'Efectivo', 'transfer', 10),
    ('revolut', 'Revolut', 'transfer', 10)
) as rule(keyword, category_name, movement_type, priority)
join public.transaction_categories category
  on category.system = true
 and category.name = rule.category_name
 and category.movement_type = rule.movement_type
on conflict do nothing;
