-- ============================================================
-- Data lake commercial : table CLIENTS consolidée (toutes entités PCP France)
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Nécessite setup.sql et setup-access.sql déjà exécutés (tables agences,
-- profiles, user_agences et fonction is_admin).
-- Ré-exécutable sans risque (create if not exists / on conflict).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Référentiel des segments clients (liste éditable)
-- ------------------------------------------------------------
create table if not exists public.client_segments (
  nom text primary key,
  ordre smallint not null default 100,
  created_at timestamptz not null default now()
);

insert into public.client_segments (nom, ordre) values
  ('Industrie agroalimentaire', 1),
  ('Industrie pharmaceutique', 2),
  ('Santé', 3),
  ('Agriculture', 4),
  ('Distribution alimentaire', 5),
  ('Distribution non alimentaire', 6),
  ('Horeca', 7),
  ('Construction', 8),
  ('Logistique', 9),
  ('Gestion immobilier & bureaux', 10),
  ('Services publics', 11),
  ('Habitat social', 12),
  ('Infrastructure (rail, construction)', 13),
  ('B2C Particuliers', 14),
  ('Division PCP', 15)
on conflict (nom) do nothing;

alter table public.client_segments enable row level security;

drop policy if exists "auth_read_client_segments" on public.client_segments;
create policy "auth_read_client_segments"
  on public.client_segments for select to authenticated using (true);

drop policy if exists "admin_all_client_segments" on public.client_segments;
create policy "admin_all_client_segments"
  on public.client_segments for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

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
  segment text references public.client_segments(nom) on update cascade on delete set null,
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
create index if not exists clients_segment_idx on public.clients(segment);
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
       count(*) filter (where segment is null) as sans_segment
from public.clients
group by entite;
