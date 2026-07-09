alter table public.assets
  add column if not exists linked_asset_id uuid references public.assets(id) on delete set null;

create index if not exists assets_workspace_linked_asset_idx
  on public.assets(workspace_id, linked_asset_id)
  where linked_asset_id is not null and deleted_at is null;

insert into public.assets (
  workspace_id,
  name,
  type,
  asset_type,
  currency,
  status,
  manual_value,
  metadata
)
select
  account.workspace_id,
  account.name,
  'real_estate',
  'real_estate',
  account.currency,
  'active',
  abs(coalesce(latest_balance.balance, 0)),
  jsonb_build_object(
    'source', 'financial_account_reclassification',
    'source_account_id', account.id
  )
from public.financial_accounts account
left join lateral (
  select balance.balance
  from public.account_balances balance
  where balance.account_id = account.id
    and balance.workspace_id = account.workspace_id
    and balance.source <> 'system'
  order by balance.captured_at desc
  limit 1
) latest_balance on true
where account.deleted_at is null
  and (
    account.type = 'real_estate'
    or lower(account.name) similar to '%(propiedad|propiedades|vivienda|inmueble|casa)%'
  )
  and not exists (
    select 1
    from public.assets existing
    where existing.workspace_id = account.workspace_id
      and existing.deleted_at is null
      and existing.metadata ->> 'source_account_id' = account.id::text
  );

insert into public.assets (
  workspace_id,
  name,
  type,
  asset_type,
  currency,
  status,
  manual_value,
  metadata
)
select
  account.workspace_id,
  account.name,
  'other',
  'liability',
  account.currency,
  'active',
  -abs(coalesce(latest_balance.balance, 0)),
  jsonb_build_object(
    'source', 'financial_account_reclassification',
    'source_account_id', account.id
  )
from public.financial_accounts account
left join lateral (
  select balance.balance
  from public.account_balances balance
  where balance.account_id = account.id
    and balance.workspace_id = account.workspace_id
    and balance.source <> 'system'
  order by balance.captured_at desc
  limit 1
) latest_balance on true
where account.deleted_at is null
  and (
    account.type in ('loan', 'mortgage')
    or lower(account.name) similar to '%(hipoteca|prestamo|préstamo|deuda|mortgage)%'
  )
  and not exists (
    select 1
    from public.assets existing
    where existing.workspace_id = account.workspace_id
      and existing.deleted_at is null
      and existing.metadata ->> 'source_account_id' = account.id::text
  );

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check check (
    transaction_type in (
      'income',
      'expense',
      'transfer',
      'investment_transfer',
      'asset_purchase',
      'investment_buy',
      'investment_sell',
      'mortgage_payment',
      'mortgage_principal',
      'mortgage_interest',
      'fee',
      'tax',
      'refund',
      'adjustment'
    )
  );

insert into public.transaction_categories (name, movement_type, system)
values
  ('Amortizacion hipoteca', 'transfer', true),
  ('Intereses hipoteca', 'expense', true)
on conflict do nothing;

insert into public.category_rules (keyword, category_id, priority)
select rule.keyword, category.id, rule.priority
from (
  values
    ('amortizacion hipoteca', 'Amortizacion hipoteca', 'transfer', 10),
    ('amortización hipoteca', 'Amortizacion hipoteca', 'transfer', 10),
    ('capital hipoteca', 'Amortizacion hipoteca', 'transfer', 20),
    ('intereses hipoteca', 'Intereses hipoteca', 'expense', 20)
) as rule(keyword, category_name, movement_type, priority)
join public.transaction_categories category
  on category.name = rule.category_name
 and category.movement_type = rule.movement_type
on conflict do nothing;
