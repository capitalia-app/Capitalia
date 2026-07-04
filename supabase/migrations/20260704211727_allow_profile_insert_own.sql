create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (user_id = auth.uid());
