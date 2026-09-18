-- ============================================================
-- Système d'accès et de suivi d'utilisation
-- À exécuter une seule fois dans Supabase > SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1. Profils utilisateurs (rôle applicatif + dernière connexion)
--    Une ligne par compte créé dans Authentication > Users.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'lecteur' check (role in ('admin', 'editeur', 'lecteur')),
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Historique des pages consultées
-- ------------------------------------------------------------
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  page text not null,
  viewed_at timestamptz not null default now()
);

create index if not exists page_views_user_idx on public.page_views(user_id, viewed_at desc);

-- ------------------------------------------------------------
-- 3. Création automatique du profil à la création d'un compte
--    (dans Authentication > Users > Add user). Le compte
--    pierrejaubert@yahoo.com est provisionné directement en admin ;
--    tous les autres démarrent en "lecteur" et sont promus ensuite
--    depuis la page "Gestion des utilisateurs".
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when lower(new.email) = 'pierrejaubert@yahoo.com' then 'admin' else 'lecteur' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Provisionne aussi les comptes qui existeraient déjà avant l'exécution de ce script
-- (par exemple le compte admin créé lors de la mise en place initiale).
insert into public.profiles (id, email, role)
select id, email, case when lower(email) = 'pierrejaubert@yahoo.com' then 'admin' else 'lecteur' end
from auth.users
on conflict (id) do update set role = excluded.role where public.profiles.email = 'pierrejaubert@yahoo.com';

-- ------------------------------------------------------------
-- 4. Fonction utilitaire pour vérifier le rôle admin dans les
--    règles de sécurité (RLS), sans provoquer de récursion.
-- ------------------------------------------------------------
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = uid and role = 'admin');
$$;

create or replace function public.current_role_name()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 5. Sécurité (RLS)
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.page_views enable row level security;

drop policy if exists "own_profile_read" on public.profiles;
create policy "own_profile_read"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "own_profile_update_last_login" on public.profiles;
create policy "own_profile_update_last_login"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "page_views_insert_own" on public.page_views;
create policy "page_views_insert_own"
  on public.page_views for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "page_views_read_admin" on public.page_views;
create policy "page_views_read_admin"
  on public.page_views for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- 6. Étendre les règles existantes (agences, priorités) : seuls
--    les administrateurs peuvent modifier ; tout utilisateur
--    connecté peut lire. Remplace les anciennes règles qui
--    autorisaient tout "authenticated" à écrire.
-- ------------------------------------------------------------
drop policy if exists "public_read" on public.agences;
create policy "authenticated_read" on public.agences for select to authenticated using (true);

drop policy if exists "admin_insert" on public.agences;
create policy "admin_insert" on public.agences for insert to authenticated with check (public.is_admin(auth.uid()));

drop policy if exists "admin_update" on public.agences;
create policy "admin_update" on public.agences for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "admin_delete" on public.agences;
create policy "admin_delete" on public.agences for delete to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "public_read" on public.prospection_priorities;
create policy "authenticated_read" on public.prospection_priorities for select to authenticated using (true);

drop policy if exists "admin_insert" on public.prospection_priorities;
create policy "admin_insert" on public.prospection_priorities for insert to authenticated with check (public.is_admin(auth.uid()));

drop policy if exists "admin_update" on public.prospection_priorities;
create policy "admin_update" on public.prospection_priorities for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "admin_delete" on public.prospection_priorities;
create policy "admin_delete" on public.prospection_priorities for delete to authenticated using (public.is_admin(auth.uid()));
