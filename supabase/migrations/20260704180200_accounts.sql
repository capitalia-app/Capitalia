-- Capitalia MVP foundation: financial accounts and balance snapshots.

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete restrict,
  name text not null,
  type text not null,
  currency char(3) not null,
  external_account_id text,
  iban_last4 text,
  account_mask text,
  status text not null default 'active',
  opened_at date,
  closed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint financial_accounts_type_check check (
    type in ('checking', 'savings', 'credit_card', 'brokerage', 'crypto_wallet', 'cash', 'loan', 'mortgage', 'other')
  ),
  constraint financial_accounts_status_check check (status in ('active', 'inactive', 'closed')),
  constraint financial_accounts_currency_uppercase check (currency = upper(currency))
);

create table public.account_balances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  balance numeric(18, 4) not null,
  available_balance numeric(18, 4),
  currency char(3) not null,
  captured_at timestamptz not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint account_balances_currency_uppercase check (currency = upper(currency)),
  constraint account_balances_source_check check (source in ('manual', 'import', 'sync', 'system'))
);

create index financial_accounts_workspace_type_idx on public.financial_accounts(workspace_id, type);
create index financial_accounts_workspace_institution_idx on public.financial_accounts(workspace_id, institution_id);
create index financial_accounts_connection_idx on public.financial_accounts(connection_id);
create unique index financial_accounts_workspace_external_account_idx
  on public.financial_accounts(workspace_id, external_account_id)
  where external_account_id is not null;
create index account_balances_account_captured_idx on public.account_balances(account_id, captured_at desc);
create index account_balances_workspace_captured_idx on public.account_balances(workspace_id, captured_at desc);

create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function public.set_updated_at();

alter table public.financial_accounts enable row level security;
alter table public.account_balances enable row level security;

create policy "financial_accounts_select_member"
on public.financial_accounts for select
to authenticated
using (public.is_workspace_member(workspace_id) and deleted_at is null);

create policy "financial_accounts_insert_editor"
on public.financial_accounts for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "financial_accounts_update_editor"
on public.financial_accounts for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "account_balances_select_member"
on public.account_balances for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "account_balances_insert_editor"
on public.account_balances for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
