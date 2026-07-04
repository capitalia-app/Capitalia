create unique index transactions_workspace_fingerprint_unique_idx
on public.transactions(workspace_id, fingerprint)
where fingerprint is not null and deleted_at is null;
