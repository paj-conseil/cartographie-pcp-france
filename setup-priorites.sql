-- ============================================================
-- Table des priorités croisées Activité PCP x Cible client
-- ============================================================
create table if not exists public.prospection_priorities (
  id uuid primary key default gen_random_uuid(),
  activity text not null,
  segment text not null,
  priority smallint check (priority in (1,2,3)),
  updated_at timestamptz not null default now(),
  unique(activity, segment)
);

alter table public.prospection_priorities enable row level security;

drop policy if exists "public_read" on public.prospection_priorities;
create policy "public_read"
  on public.prospection_priorities for select
  using (true);

drop policy if exists "admin_insert" on public.prospection_priorities;
create policy "admin_insert"
  on public.prospection_priorities for insert
  to authenticated
  with check (true);

drop policy if exists "admin_update" on public.prospection_priorities;
create policy "admin_update"
  on public.prospection_priorities for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin_delete" on public.prospection_priorities;
create policy "admin_delete"
  on public.prospection_priorities for delete
  to authenticated
  using (true);
