-- Capitalia Sprint 0.3 UX hotfix: platform/institution for patrimonial snapshot items.

alter table public.patrimonial_snapshot_items
  add column if not exists platform text;

create index if not exists patrimonial_snapshot_items_workspace_platform_idx
  on public.patrimonial_snapshot_items(workspace_id, lower(platform))
  where platform is not null;
