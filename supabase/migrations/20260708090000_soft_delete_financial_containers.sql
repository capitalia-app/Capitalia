alter table public.financial_containers
  add column if not exists deleted_at timestamptz;

drop index if exists financial_containers_workspace_name_idx;

create unique index if not exists financial_containers_workspace_name_active_idx
  on public.financial_containers(workspace_id, lower(name))
  where deleted_at is null;

create index if not exists financial_containers_workspace_deleted_idx
  on public.financial_containers(workspace_id, deleted_at);

drop policy if exists "financial_containers_select_member"
  on public.financial_containers;

create policy "financial_containers_select_member"
on public.financial_containers for select
using (
  public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer'])
  and deleted_at is null
);
