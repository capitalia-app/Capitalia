-- Capitalia MVP foundation: categories, transactions, learned rules and review.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  type text not null,
  icon text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint categories_type_check check (
    type in ('income', 'expense', 'investment', 'transfer', 'debt', 'saving', 'asset', 'other')
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  raw_import_record_id uuid references public.raw_import_records(id) on delete set null,
  amount numeric(18, 4) not null,
  currency char(3) not null,
  direction text not null,
  occurred_at timestamptz not null,
  booked_at timestamptz,
  description text not null,
  merchant_name text,
  counterparty_name text,
  category_id uuid references public.categories(id) on delete set null,
  status text not null default 'posted',
  transaction_type text not null default 'expense',
  fingerprint text,
  external_transaction_id text,
  confidence_score numeric(5, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transactions_currency_uppercase check (currency = upper(currency)),
  constraint transactions_direction_check check (direction in ('inflow', 'outflow')),
  constraint transactions_status_check check (status in ('pending', 'posted', 'ignored')),
  constraint transactions_type_check check (
    transaction_type in (
      'income',
      'expense',
      'transfer',
      'investment_buy',
      'investment_sell',
      'fee',
      'tax',
      'refund',
      'adjustment'
    )
  ),
  constraint transactions_confidence_score_check check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  )
);

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary_transaction_id uuid not null references public.transactions(id) on delete cascade,
  candidate_transaction_id uuid not null references public.transactions(id) on delete cascade,
  score numeric(5, 4) not null,
  status text not null default 'pending',
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint duplicate_candidates_status_check check (status in ('pending', 'confirmed', 'dismissed')),
  constraint duplicate_candidates_score_check check (score >= 0 and score <= 1),
  constraint duplicate_candidates_not_same_transaction check (primary_transaction_id <> candidate_transaction_id),
  constraint duplicate_candidates_unique_pair unique (primary_transaction_id, candidate_transaction_id)
);

create table public.manual_review_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  reason text not null,
  priority smallint not null default 3,
  status text not null default 'pending',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint manual_review_items_priority_check check (priority between 1 and 5),
  constraint manual_review_items_status_check check (status in ('pending', 'resolved', 'dismissed'))
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null,
  condition_payload jsonb not null,
  action_payload jsonb not null,
  status text not null default 'active',
  source text not null default 'user',
  confidence_score numeric(5, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rules_type_check check (
    type in ('classification', 'duplicate_detection', 'transfer_detection', 'review', 'alert')
  ),
  constraint rules_status_check check (status in ('active', 'paused', 'archived')),
  constraint rules_source_check check (source in ('user', 'ai', 'system')),
  constraint rules_confidence_score_check check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  )
);

create index categories_workspace_type_idx on public.categories(workspace_id, type);
create unique index categories_unique_name_per_parent_idx
  on public.categories(workspace_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where deleted_at is null;
create index transactions_workspace_occurred_idx on public.transactions(workspace_id, occurred_at desc);
create index transactions_account_occurred_idx on public.transactions(account_id, occurred_at desc);
create index transactions_workspace_category_occurred_idx
  on public.transactions(workspace_id, category_id, occurred_at desc);
create index transactions_workspace_fingerprint_idx on public.transactions(workspace_id, fingerprint);
create index transactions_workspace_amount_occurred_idx on public.transactions(workspace_id, amount, occurred_at);
create index transactions_import_batch_idx on public.transactions(import_batch_id);
create index transactions_raw_import_record_idx on public.transactions(raw_import_record_id);
create index transactions_description_search_idx
  on public.transactions
  using gin (to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(merchant_name, '') || ' ' || coalesce(counterparty_name, '')));
create index duplicate_candidates_workspace_status_idx on public.duplicate_candidates(workspace_id, status);
create index duplicate_candidates_primary_idx on public.duplicate_candidates(primary_transaction_id);
create index duplicate_candidates_candidate_idx on public.duplicate_candidates(candidate_transaction_id);
create index manual_review_items_workspace_status_priority_idx
  on public.manual_review_items(workspace_id, status, priority);
create index manual_review_items_workspace_created_idx on public.manual_review_items(workspace_id, created_at desc);
create index rules_workspace_type_idx on public.rules(workspace_id, type);
create index rules_workspace_status_idx on public.rules(workspace_id, status);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger rules_set_updated_at
before update on public.rules
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.duplicate_candidates enable row level security;
alter table public.manual_review_items enable row level security;
alter table public.rules enable row level security;

create policy "categories_select_member"
on public.categories for select
to authenticated
using (public.is_workspace_member(workspace_id) and deleted_at is null);

create policy "categories_insert_editor"
on public.categories for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "categories_update_editor"
on public.categories for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "transactions_select_member"
on public.transactions for select
to authenticated
using (public.is_workspace_member(workspace_id) and deleted_at is null);

create policy "transactions_insert_editor"
on public.transactions for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "transactions_update_editor"
on public.transactions for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "duplicate_candidates_select_member"
on public.duplicate_candidates for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "duplicate_candidates_insert_editor"
on public.duplicate_candidates for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "duplicate_candidates_update_editor"
on public.duplicate_candidates for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "manual_review_items_select_member"
on public.manual_review_items for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "manual_review_items_insert_editor"
on public.manual_review_items for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "manual_review_items_update_editor"
on public.manual_review_items for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "rules_select_member"
on public.rules for select
to authenticated
using (public.is_workspace_member(workspace_id) and deleted_at is null);

create policy "rules_insert_editor"
on public.rules for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "rules_update_editor"
on public.rules for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
