-- Capitalia MVP foundation: institutions, data sources and imports.

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type text not null,
  country text,
  website_url text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institutions_type_check check (
    type in ('bank', 'broker', 'crypto_exchange', 'wallet', 'email', 'csv', 'open_banking', 'manual')
  )
);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null,
  provider text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_sources_type_check check (type in ('csv', 'open_banking', 'gmail', 'api', 'manual'))
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete restrict,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  name text not null,
  status text not null default 'active',
  last_synced_at timestamptz,
  external_connection_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint connections_status_check check (status in ('active', 'error', 'paused', 'revoked'))
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  source_type text not null,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_source_type_check check (source_type in ('csv', 'api', 'gmail', 'manual')),
  constraint import_batches_status_check check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

create table public.import_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  created_at timestamptz not null default now()
);

create table public.raw_import_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_record_id text,
  record_hash text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_import_records_status_check check (status in ('pending', 'normalized', 'imported', 'duplicate', 'failed'))
);

create index institutions_type_idx on public.institutions(type);
create index data_sources_type_idx on public.data_sources(type);
create index connections_workspace_institution_idx on public.connections(workspace_id, institution_id);
create index connections_workspace_status_idx on public.connections(workspace_id, status);
create unique index connections_workspace_external_connection_idx
  on public.connections(workspace_id, external_connection_id)
  where external_connection_id is not null;
create index import_batches_workspace_created_idx on public.import_batches(workspace_id, created_at desc);
create index import_batches_connection_created_idx on public.import_batches(connection_id, created_at desc);
create index import_batches_workspace_status_idx on public.import_batches(workspace_id, status);
create index import_files_batch_idx on public.import_files(import_batch_id);
create index raw_import_records_batch_idx on public.raw_import_records(workspace_id, import_batch_id);
create index raw_import_records_hash_idx on public.raw_import_records(workspace_id, record_hash);
create index raw_import_records_source_record_idx on public.raw_import_records(workspace_id, source_record_id);

create trigger institutions_set_updated_at
before update on public.institutions
for each row execute function public.set_updated_at();

create trigger data_sources_set_updated_at
before update on public.data_sources
for each row execute function public.set_updated_at();

create trigger connections_set_updated_at
before update on public.connections
for each row execute function public.set_updated_at();

create trigger import_batches_set_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

create trigger raw_import_records_set_updated_at
before update on public.raw_import_records
for each row execute function public.set_updated_at();

insert into public.institutions (name, slug, type, country, website_url)
values
  ('CSV', 'csv', 'csv', null, null),
  ('Manual', 'manual', 'manual', null, null),
  ('BBVA', 'bbva', 'bank', 'ES', 'https://www.bbva.es'),
  ('MyInvestor', 'myinvestor', 'broker', 'ES', 'https://myinvestor.es'),
  ('Trade Republic', 'trade-republic', 'broker', 'DE', 'https://traderepublic.com'),
  ('Coinbase', 'coinbase', 'crypto_exchange', 'US', 'https://www.coinbase.com'),
  ('Ledger', 'ledger', 'wallet', 'FR', 'https://www.ledger.com'),
  ('Gmail', 'gmail', 'email', null, 'https://mail.google.com')
on conflict (slug) do nothing;

insert into public.data_sources (name, type, provider)
values
  ('CSV Upload', 'csv', 'capitalia'),
  ('Manual Entry', 'manual', 'capitalia'),
  ('Open Banking', 'open_banking', null),
  ('Gmail', 'gmail', 'google'),
  ('API', 'api', null)
on conflict (name) do nothing;

alter table public.institutions enable row level security;
alter table public.data_sources enable row level security;
alter table public.connections enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_files enable row level security;
alter table public.raw_import_records enable row level security;

create policy "institutions_select_authenticated"
on public.institutions for select
to authenticated
using (is_active = true);

create policy "data_sources_select_authenticated"
on public.data_sources for select
to authenticated
using (is_active = true);

create policy "connections_select_member"
on public.connections for select
to authenticated
using (public.is_workspace_member(workspace_id) and deleted_at is null);

create policy "connections_insert_editor"
on public.connections for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "connections_update_editor"
on public.connections for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "import_batches_select_member"
on public.import_batches for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "import_batches_insert_editor"
on public.import_batches for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "import_batches_update_editor"
on public.import_batches for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "import_files_select_member"
on public.import_files for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "import_files_insert_editor"
on public.import_files for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "raw_import_records_select_member"
on public.raw_import_records for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "raw_import_records_insert_editor"
on public.raw_import_records for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "raw_import_records_update_editor"
on public.raw_import_records for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
