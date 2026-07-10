drop function if exists public.restore_audited_transaction(uuid, uuid);

create or replace function public.restore_audited_transaction(
  p_workspace_id uuid,
  p_transaction_id uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_transaction public.transactions;
begin
  v_profile_id := public.current_profile_id();

  if v_profile_id is null then
    raise exception 'profile not found'
      using errcode = 'P0001';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin', 'editor']) then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  update public.transactions
  set
    deleted_at = null,
    status = 'posted',
    is_reviewed = true,
    manually_validated = true,
    recovered_at = now(),
    recovered_by = v_profile_id,
    updated_at = now()
  where id = p_transaction_id
    and workspace_id = p_workspace_id
  returning * into v_transaction;

  if v_transaction.id is null then
    raise exception 'transaction not found'
      using errcode = 'P0002';
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

  return v_transaction;
end;
$$;

grant execute on function public.restore_audited_transaction(uuid, uuid) to authenticated;
