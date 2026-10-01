-- ============================================================
-- Data lake : préparation de l'import des clients du groupe SAPA (Odoo)
-- À exécuter une fois, AVANT l'import du fichier depuis Gestion commerciale.
-- Ré-exécutable sans risque.
-- ============================================================

alter table public.clients
  add column if not exists vendeur text,
  add column if not exists agence_source text,      -- comment l'entité a été déterminée : equipe, vendeur, departement, societe, defaut
  add column if not exists societe_source text,     -- société d'origine dans le logiciel (ex : SAPA, PAMI PROTECTION)
  add column if not exists fusionne_vers uuid references public.clients(id) on delete set null;

create index if not exists clients_fusion_idx on public.clients (fusionne_vers) where fusionne_vers is not null;

-- Journal des rattachements déplacés lors des fusions (permet de revenir en arrière)
create table if not exists public.clients_fusion_log (
  id bigserial primary key,
  table_name text not null,
  row_id text not null,
  ancien_client_id uuid not null,
  nouveau_client_id uuid not null,
  fusionne_le timestamptz not null default now()
);
alter table public.clients_fusion_log enable row level security;
drop policy if exists "admin_all_fusion_log" on public.clients_fusion_log;
create policy "admin_all_fusion_log" on public.clients_fusion_log for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Les clients fusionnés dans un autre ne sont plus comptés
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
where fusionne_vers is null
group by entite;

drop view if exists public.clients_v;
create view public.clients_v
with (security_invoker = true) as
select c.*, s.code as segment_code, s.label as segment_label, g.name as groupe_client
from public.clients c
left join public.client_segments s on s.id = c.segment_id
left join public.client_groups g on g.id = c.group_id
where c.fusionne_vers is null;
