-- Capitalia Sprint 0.3 UX hotfix: reset only the patrimonial starting point.

create or replace function public.reset_patrimonial_starting_point(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.has_workspace_role(target_workspace_id, array['owner', 'admin', 'editor']) then
    raise exception 'No tienes permisos para rehacer el punto de partida.';
  end if;

  delete from public.patrimonial_snapshot_items
  where workspace_id = target_workspace_id;

  delete from public.patrimonial_snapshots
  where workspace_id = target_workspace_id;
end;
$$;

grant execute on function public.reset_patrimonial_starting_point(uuid) to authenticated;
