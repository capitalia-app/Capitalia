create table public.test_pipeline (
  id uuid primary key,
  created_at timestamptz not null default now(),
  name text
);
