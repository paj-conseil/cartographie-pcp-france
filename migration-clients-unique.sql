-- ============================================================
-- Data lake : table CLIENTS unique pour toutes les entités PCP France
-- Ré-exécutable sans risque. À lancer avant les fichiers import-clients-*.sql.
--
-- Part de la table clients du data lake (raison_sociale, agence_id, group_id,
-- segment_id..., reliée aux devis, factures, contrats et commandes) et :
--   1-2. (filet de sécurité) si une table clients_ancien existe encore, la
--        remet en place sous le nom clients ;
--   3. lui ajoute les colonnes de la base clients (entité, source, SIRET...) ;
--   4. remplit l'entité et le type de client pour les clients déjà présents ;
--   5. remplace l'index d'unicité nom + code postal (qui fusionnait les clients
--      de toutes les entités) par un index simple : une ligne par client et par
--      entité source, les doublons étant repérés par le SIRET ;
--   6. recrée les règles d'accès, déclencheurs et vues.
-- ============================================================

-- 1. Table vide créée par erreur
drop view if exists public.clients_v;
drop view if exists public.clients_doublons_siret;
drop view if exists public.clients_doublons_siren;
drop view if exists public.clients_synthese;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients_ancien') then
    if (select count(*) from public.clients) > 0 then
      raise exception 'La table clients contient des lignes : arrêt par sécurité.';
    end if;
    drop table public.clients;
    alter table public.clients_ancien rename to clients;
  end if;
end $$;

-- Segment manquant dans le référentiel existant
create unique index if not exists client_segments_code_key on public.client_segments(code);
insert into public.client_segments (code, label, sort_order)
select 'division_pcp', 'Division PCP', 15
where not exists (select 1 from public.client_segments where code = 'division_pcp');

-- 3. Nouvelles colonnes
alter table public.clients
  add column if not exists entite text,
  add column if not exists source_logiciel text,
  add column if not exists source_code_client text,
  add column if not exists source_fichier text,
  add column if not exists importe_le timestamptz,
  add column if not exists type_client text not null default 'a_determiner',
  add column if not exists pays text default 'FR',
  add column if not exists email text,
  add column if not exists telephone text,
  add column if not exists fax text,
  add column if not exists solde_actuel numeric(14,2),
  add column if not exists siret text,
  add column if not exists raison_sociale_officielle text,
  add column if not exists enseigne text,
  add column if not exists code_naf text,
  add column if not exists nature_juridique text,
  add column if not exists etat_administratif text,
  add column if not exists siret_statut text not null default 'a_rechercher',
  add column if not exists siret_score smallint,
  add column if not exists siret_candidats jsonb,
  add column if not exists siret_recherche_le timestamptz,
  add column if not exists groupe_source text,
  add column if not exists segment_source text,
  add column if not exists classification_motif text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.clients add column if not exists siren text generated always as (left(siret, 9)) stored;

alter table public.clients drop constraint if exists clients_type_client_check;
alter table public.clients add constraint clients_type_client_check
  check (type_client in ('particulier', 'professionnel', 'a_determiner'));
alter table public.clients drop constraint if exists clients_siret_check;
alter table public.clients add constraint clients_siret_check
  check (siret is null or siret ~ '^[0-9]{14}$');
alter table public.clients drop constraint if exists clients_siret_statut_check;
alter table public.clients add constraint clients_siret_statut_check
  check (siret_statut in ('non_applicable', 'a_rechercher', 'trouve', 'a_verifier', 'introuvable', 'manuel'));
alter table public.clients drop constraint if exists clients_groupe_source_check;
alter table public.clients add constraint clients_groupe_source_check
  check (groupe_source is null or groupe_source in ('mot_cle', 'siren', 'manuel'));
alter table public.clients drop constraint if exists clients_segment_source_check;
alter table public.clients add constraint clients_segment_source_check
  check (segment_source is null or segment_source in ('mot_cle', 'naf', 'b2c', 'manuel'));

-- 4. Reprise des clients existants
update public.clients c set entite = a.name
  from public.agences a
  where a.id = c.agence_id and c.entite is null;

update public.clients c set source_code_client = c.source_ref
  where c.source_code_client is null and c.source_ref is not null;

update public.clients c set
    type_client = case when s.code = 'b2c' then 'particulier' else 'professionnel' end,
    siret_statut = case when s.code = 'b2c' then 'non_applicable' else 'a_rechercher' end,
    segment_source = case when s.code = 'b2c' then 'b2c' else 'mot_cle' end
  from public.client_segments s
  where s.id = c.segment_id and c.segment_source is null;

-- 5. Index
drop index if exists public.clients_dedup_idx;
create index if not exists clients_nom_cp_idx on public.clients (lower(raison_sociale), coalesce(code_postal, ''));
create unique index if not exists clients_source_key on public.clients (entite, source_logiciel, source_code_client);
create index if not exists clients_entite_idx on public.clients (entite);
create index if not exists clients_siret_idx on public.clients (siret) where siret is not null;
create index if not exists clients_siren_idx on public.clients (siren) where siren is not null;
create index if not exists clients_statut_idx on public.clients (siret_statut);

-- 6. Déclencheurs
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

-- Entité <-> agence : l'un est déduit de l'autre s'il manque
create or replace function public.clients_resolve_agence()
returns trigger language plpgsql as $$
begin
  if new.agence_id is null and new.entite is not null then
    select id into new.agence_id from public.agences
      where upper(trim(name)) = upper(trim(new.entite)) limit 1;
  elsif new.entite is null and new.agence_id is not null then
    select name into new.entite from public.agences where id = new.agence_id;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_agence on public.clients;
create trigger clients_agence before insert or update of entite, agence_id on public.clients
  for each row execute function public.clients_resolve_agence();

-- Règles d'accès : la règle admin existante (admin_all) est conservée ;
-- les autres utilisateurs lisent les clients de leurs propres entités.
drop policy if exists "entity_read_clients" on public.clients;
create policy "entity_read_clients"
  on public.clients for select to authenticated
  using (exists (
    select 1 from public.user_agences ua
    where ua.user_id = auth.uid() and ua.agence_id = clients.agence_id
  ));

drop policy if exists "auth_read_client_groups" on public.client_groups;
create policy "auth_read_client_groups"
  on public.client_groups for select to authenticated using (true);

-- Vues
create or replace view public.clients_v
with (security_invoker = true) as
select c.*, s.code as segment_code, s.label as segment_label, g.name as groupe_client
from public.clients c
left join public.client_segments s on s.id = c.segment_id
left join public.client_groups g on g.id = c.group_id;

create or replace view public.clients_doublons_siret
with (security_invoker = true) as
select siret,
       count(*) as nb_lignes,
       count(distinct entite) as nb_entites,
       string_agg(distinct entite, ', ') as entites,
       string_agg(raison_sociale || ' [' || coalesce(entite, '?') || ' ' || coalesce(source_code_client, '') || ']', ' | ' order by entite) as clients
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
