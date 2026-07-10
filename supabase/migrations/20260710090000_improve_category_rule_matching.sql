-- Capitalia: safer learned-rule matching metadata.

alter table public.category_rules
  add column if not exists normalized_keyword text,
  add column if not exists account_id uuid references public.financial_accounts(id) on delete set null,
  add column if not exists specificity integer,
  add column if not exists updated_at timestamptz not null default now();

update public.category_rules
set
  normalized_keyword = coalesce(normalized_keyword, lower(trim(keyword))),
  specificity = coalesce(specificity, greatest(length(trim(keyword)), 1))
where normalized_keyword is null
   or specificity is null;

create index if not exists category_rules_workspace_normalized_keyword_idx
  on public.category_rules(workspace_id, normalized_keyword)
  where workspace_id is not null;

create index if not exists category_rules_account_idx
  on public.category_rules(account_id)
  where account_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'category_rules_set_updated_at'
  ) then
    create trigger category_rules_set_updated_at
    before update on public.category_rules
    for each row execute function public.set_updated_at();
  end if;
end $$;
