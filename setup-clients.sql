-- ============================================================
-- Data lake commercial : table CLIENTS consolidée (toutes entités PCP France)
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Nécessite setup.sql et setup-access.sql déjà exécutés (tables agences,
-- profiles, user_agences et fonction is_admin).
-- Ré-exécutable sans risque (create if not exists / on conflict).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Référentiel des segments : on réutilise la table existante
--    client_segments (id, code, label, sort_order) sans rien modifier.
--    Seul le segment "Division PCP" est ajouté s'il n'existe pas.
-- ------------------------------------------------------------
create unique index if not exists client_segments_code_key on public.client_segments(code);

insert into public.client_segments (code, label, sort_order)
select 'division_pcp', 'Division PCP', 15
where not exists (select 1 from public.client_segments where code = 'division_pcp');

-- Lecture des segments par les utilisateurs connectés (sans effet si la
-- sécurité RLS n'est pas activée sur cette table ; les règles existantes sont conservées).
drop policy if exists "auth_read_client_segments" on public.client_segments;
create policy "auth_read_client_segments"
  on public.client_segments for select to authenticated using (true);

-- ------------------------------------------------------------
-- 1 bis. Une ancienne table "clients" (autre structure) est mise de côté
--        sous le nom clients_ancien, sans suppression de données.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'source_code_client') then
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients_ancien') then
      raise exception 'Une table clients_ancien existe déjà : renommez-la avant de relancer ce script.';
    end if;
    alter table public.clients rename to clients_ancien;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Table CLIENTS : une ligne par client et par entité source.
--    Un même client présent dans deux entités = deux lignes, reliées
--    par le même SIRET (voir vues de doublons plus bas).
-- ------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),

  -- Entité PCP
  agence_id uuid references public.agences(id) on delete set null,
  entite text not null,                         -- nom de l'entité PCP (ex : AADS)

  -- Provenance
  source_logiciel text not null,                -- EBP, Hygisoft, STANE, Odoo, ServiGeco...
  source_code_client text not null,             -- code client dans le logiciel source
  source_fichier text,
  importe_le timestamptz not null default now(),

  -- Identité et coordonnées (telles que dans le logiciel source)
  nom text not null,
  type_client text not null default 'a_determiner'
    check (type_client in ('particulier', 'professionnel', 'a_determiner')),
  adresse text,
  code_postal text,
  ville text,
  pays text default 'FR',
  email text,
  telephone text,
  fax text,
  solde_actuel numeric(14,2),

  -- Identification légale (API recherche-entreprises)
  siret text check (siret is null or siret ~ '^[0-9]{14}$'),
  siren text generated always as (left(siret, 9)) stored,
  raison_sociale_officielle text,
  enseigne text,
  code_naf text,
  nature_juridique text,
  etat_administratif text,                      -- A = actif, F = fermé
  siret_statut text not null default 'a_rechercher'
    check (siret_statut in ('non_applicable', 'a_rechercher', 'trouve', 'a_verifier', 'introuvable', 'manuel')),
  siret_score smallint,
  siret_candidats jsonb,                        -- propositions à valider quand siret_statut = 'a_verifier'
  siret_recherche_le timestamptz,

  -- Classification commerciale
  groupe_client text,
  groupe_source text check (groupe_source is null or groupe_source in ('mot_cle', 'siren', 'manuel')),
  segment_id uuid references public.client_segments(id) on delete set null,
  segment_source text check (segment_source is null or segment_source in ('mot_cle', 'naf', 'b2c', 'manuel')),
  classification_motif text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (entite, source_logiciel, source_code_client)
);

create index if not exists clients_agence_idx on public.clients(agence_id);
create index if not exists clients_entite_idx on public.clients(entite);
create index if not exists clients_siret_idx on public.clients(siret) where siret is not null;
create index if not exists clients_siren_idx on public.clients(siren) where siren is not null;
create index if not exists clients_segment_idx on public.clients(segment_id);
create index if not exists clients_groupe_idx on public.clients(groupe_client);
create index if not exists clients_statut_idx on public.clients(siret_statut);

-- Mise à jour automatique de updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- Rattachement automatique à l'entité (agences) à partir du nom d'entité
create or replace function public.clients_resolve_agence()
returns trigger language plpgsql as $$
begin
  if new.agence_id is null and new.entite is not null then
    select id into new.agence_id from public.agences
      where upper(trim(name)) = upper(trim(new.entite)) limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_agence on public.clients;
create trigger clients_agence before insert or update of entite on public.clients
  for each row execute function public.clients_resolve_agence();

-- ------------------------------------------------------------
-- 3. Sécurité : admin = tout ; autres utilisateurs = lecture de
--    leurs propres entités uniquement (même logique que le CRM).
-- ------------------------------------------------------------
alter table public.clients enable row level security;

drop policy if exists "admin_all_clients" on public.clients;
create policy "admin_all_clients"
  on public.clients for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "entity_read_clients" on public.clients;
create policy "entity_read_clients"
  on public.clients for select to authenticated
  using (exists (
    select 1 from public.user_agences ua
    where ua.user_id = auth.uid() and ua.agence_id = clients.agence_id
  ));

-- ------------------------------------------------------------
-- 4. Vues de contrôle des doublons
--    - même SIRET = même établissement, présent plusieurs fois
--    - même SIREN = même société (plusieurs établissements / entités)
-- ------------------------------------------------------------
create or replace view public.clients_doublons_siret
with (security_invoker = true) as
select siret,
       count(*) as nb_lignes,
       count(distinct entite) as nb_entites,
       string_agg(distinct entite, ', ') as entites,
       string_agg(nom || ' [' || entite || ' ' || source_code_client || ']', ' | ' order by entite) as clients
from public.clients
where siret is not null
group by siret
having count(*) > 1;

create or replace view public.clients_doublons_siren
with (security_invoker = true) as
select siren,
       max(raison_sociale_officielle) as raison_sociale,
       count(*) as nb_lignes,
       count(distinct siret) as nb_etablissements,
       count(distinct entite) as nb_entites,
       string_agg(distinct entite, ', ') as entites
from public.clients
where siren is not null
group by siren
having count(*) > 1;

-- Synthèse rapide par entité
create or replace view public.clients_synthese
with (security_invoker = true) as
select entite,
       count(*) as nb_clients,
       count(*) filter (where type_client = 'professionnel') as professionnels,
       count(*) filter (where type_client = 'particulier') as particuliers,
       count(*) filter (where type_client = 'a_determiner') as a_determiner,
       count(*) filter (where siret is not null) as avec_siret,
       count(*) filter (where siret_statut = 'a_verifier') as siret_a_verifier,
       count(*) filter (where segment_id is null) as sans_segment
from public.clients
group by entite;

-- Vue d'analyse : clients avec le code et le libellé de leur segment
create or replace view public.clients_v
with (security_invoker = true) as
select c.*, s.code as segment_code, s.label as segment_label
from public.clients c
left join public.client_segments s on s.id = c.segment_id;
