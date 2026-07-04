-- Capitalia MVP foundation: financial goals.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null,
  target_amount numeric(18, 4) not null,
  current_amount numeric(18, 4) not null default 0,
  currency char(3) not null,
  target_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint goals_type_check check (
    type in ('emergency_fund', 'investment', 'debt_reduction', 'purchase', 'retirement', 'custom')
  ),
  constraint goals_status_check check (status in ('active', 'paused', 'completed', 'archived')),
  constraint goals_currency_uppercase check (currency = upper(currency)),
  constraint goals_target_amount_positive check (target_amount > 0)
);

create index goals_workspace_status_idx on public.goals(workspace_id, status);
create index goals_workspace_target_date_idx on public.goals(workspace_id, target_date);

create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

create policy "goals_select_member"
on public.goals for select
to authenticated
using (public.is_workspace_member(workspace_id) and deleted_at is null);

create policy "goals_insert_editor"
on public.goals for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "goals_update_editor"
on public.goals for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
