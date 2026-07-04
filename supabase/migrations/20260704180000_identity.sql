-- Capitalia MVP foundation: identity, workspaces and shared RLS helpers.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  display_name text,
  avatar_url text,
  locale text not null default 'es-ES',
  country text not null default 'ES',
  base_currency char(3) not null default 'EUR',
  timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_base_currency_uppercase check (base_currency = upper(base_currency))
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'personal',
  base_currency char(3) not null default 'EUR',
  country text not null default 'ES',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workspaces_type_check check (type in ('personal', 'family', 'business', 'advisor')),
  constraint workspaces_base_currency_uppercase check (base_currency = upper(base_currency))
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_role_check check (role in ('owner', 'admin', 'editor', 'viewer')),
  constraint workspace_members_status_check check (status in ('active', 'invited', 'suspended')),
  constraint workspace_members_unique_profile unique (workspace_id, profile_id)
);

create index profiles_user_id_idx on public.profiles(user_id);
create index workspaces_created_by_idx on public.workspaces(created_by);
create index workspaces_deleted_at_idx on public.workspaces(deleted_at);
create index workspace_members_profile_id_idx on public.workspace_members(profile_id);
create index workspace_members_workspace_role_idx on public.workspace_members(workspace_id, role);
create index workspace_members_active_idx
  on public.workspace_members(workspace_id, profile_id)
  where status = 'active';

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.profiles p on p.id = wm.profile_id
    where wm.workspace_id = target_workspace_id
      and wm.status = 'active'
      and p.user_id = auth.uid()
  )
$$;

create or replace function public.has_workspace_role(
  target_workspace_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join public.profiles p on p.id = wm.profile_id
    where wm.workspace_id = target_workspace_id
      and wm.status = 'active'
      and wm.role = any(allowed_roles)
      and p.user_id = auth.uid()
  )
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (user_id, full_name, display_name, avatar_url)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.create_owner_membership_for_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, profile_id, role, status, joined_at)
  values (new.id, new.created_by, 'owner', 'active', now())
  on conflict (workspace_id, profile_id) do nothing;

  return new;
end;
$$;

create trigger on_workspace_created_create_owner_membership
after insert on public.workspaces
for each row execute function public.create_owner_membership_for_workspace();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (user_id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "workspaces_select_member"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id) and deleted_at is null);

create policy "workspaces_insert_own"
on public.workspaces for insert
to authenticated
with check (created_by = public.current_profile_id());

create policy "workspaces_update_admin"
on public.workspaces for update
to authenticated
using (public.has_workspace_role(id, array['owner', 'admin']))
with check (public.has_workspace_role(id, array['owner', 'admin']));

create policy "workspace_members_select_member"
on public.workspace_members for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace_members_insert_admin"
on public.workspace_members for insert
to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "workspace_members_update_admin"
on public.workspace_members for update
to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
