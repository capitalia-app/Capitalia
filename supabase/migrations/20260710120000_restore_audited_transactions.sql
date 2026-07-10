alter table public.transactions
  add column if not exists manually_validated boolean not null default false,
  add column if not exists recovered_at timestamptz,
  add column if not exists recovered_by uuid references public.profiles(id) on delete set null;

create index if not exists transactions_workspace_manually_validated_idx
  on public.transactions(workspace_id, manually_validated)
  where manually_validated = true;

create or replace function public.restore_audited_transaction(
  p_workspace_id uuid,
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin', 'editor']) then
    raise exception 'not allowed';
  end if;

  update public.transactions
  set
    deleted_at = null,
    status = 'posted',
    is_reviewed = true,
    manually_validated = true,
    recovered_at = now(),
    recovered_by = auth.uid(),
    updated_at = now()
  where id = p_transaction_id
    and workspace_id = p_workspace_id;

  if not found then
    raise exception 'transaction not found';
  end if;

  update public.duplicate_candidates
  set
    status = 'dismissed',
    reviewed_at = now()
  where workspace_id = p_workspace_id
    and status <> 'dismissed'
    and (
      primary_transaction_id = p_transaction_id
      or candidate_transaction_id = p_transaction_id
    );

  update public.manual_review_items
  set
    status = 'resolved',
    resolved_at = now()
  where workspace_id = p_workspace_id
    and entity_type = 'transaction'
    and entity_id = p_transaction_id
    and status = 'pending';
end;
$$;

grant execute on function public.restore_audited_transaction(uuid, uuid) to authenticated;
