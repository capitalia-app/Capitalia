create index if not exists transactions_workspace_account_amount_date_active_idx
  on public.transactions(workspace_id, account_id, amount, occurred_at)
  where deleted_at is null;
