-- ============================================================
-- Data lake : intégration des exports Hygisoft HGS (clients, contrats, devis, factures)
-- Appliqué le 2026-10-12.
-- Fichiers du 12/10/2026 : « HGS - Liste des clients / contrats / devis / factures .xlsx »
-- Ré-exécutable sans risque.
--
-- 1. colonnes de rattachement (code client, code contrat, code devis, représentant) ;
-- 2. correspondance activité -> famille des prestations HGS (modifiable dans Paramétrages) ;
-- 3. rattachement des factures à leur client : le code client Hygisoft n'est unique que dans une base
--    Hygisoft (HGS, VHP...), le rattachement tient donc compte de la business unit ;
-- 4. hgs_rattacher() : lie devis, contrats et factures à leur client, les factures à leur contrat
--    et à leur devis (« SELON DEVIS 14409 »), crée les commerciaux ;
-- 5. clients_completer_import() : complète les fiches clients déjà présentes (segment, groupe, SIRET du
--    fichier, adresse...) sans jamais écraser une valeur déjà renseignée.
--
-- Hors SQL : la fonction de recherche de SIRET en tâche de fond (siret-clients-factures, v3) cherche aussi
-- les clients HGS sans facture. Préparation des fichiers d'import : preparer-hygisoft-hgs.py.
-- ============================================================

-- 1. Colonnes ---------------------------------------------------------------------------------
alter table public.factures add column if not exists source_contrat_code text;
alter table public.factures add column if not exists source_devis_code text;
alter table public.devis    add column if not exists source_client_code text;
alter table public.contrats add column if not exists source_logiciel text;
alter table public.contrats add column if not exists source_id text;
alter table public.contrats add column if not exists source_client_code text;
alter table public.contrats add column if not exists source_vendeur text;
create unique index if not exists contrats_source_key on public.contrats (source_logiciel, source_id);
create index if not exists factures_source_contrat_idx on public.factures (source_contrat_code) where source_contrat_code is not null;
create index if not exists factures_source_devis_idx on public.factures (source_devis_code) where source_devis_code is not null;

-- 2. Activités HGS -> familles ------------------------------------------------------------------
insert into public.activites_familles (activite, famille) values
  ('Dératisation', 'pest_control'), ('Désinsectisation', 'pest_control'), ('Dératisation - Désinsectisation', 'pest_control'),
  ('3D (dératisation, désinsectisation, désinfection)', 'pest_control'), ('Désinfection', 'pest_control'),
  ('Punaises de lit', 'pest_control'), ('Dépigeonnisation', 'pest_control'), ('Livraison de produits', 'pest_control'),
  ('Entretien d''appareils', 'pest_control'), ('Audit et expertise', 'pest_control'), ('Termite', 'bois'),
  ('Étanchéité', 'autres'), ('Nettoyage', 'autres'), ('Location de matériel', 'autres'), ('Divers', 'autres')
on conflict do nothing;

-- 3. Rattachement facture -> client, avec la business unit pour les codes Hygisoft -------------
create or replace function public.factures_resoudre_client()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.source_client_code is not null and new.source_logiciel is not null
     and (new.client_id is null or (tg_op = 'UPDATE' and new.source_client_code is distinct from old.source_client_code)) then
    select coalesce(c.fusionne_vers, c.id) into new.client_id
      from public.clients c
     where c.source_logiciel = new.source_logiciel and c.source_code_client = new.source_client_code
       and (new.source_logiciel <> 'Hygisoft' or new.agence_id is null
            or (select a1.business_unit from public.agences a1 where a1.id = c.agence_id)
               is not distinct from (select a2.business_unit from public.agences a2 where a2.id = new.agence_id))
     order by (c.agence_id = new.agence_id) desc nulls last, c.fusionne_vers nulls first
     limit 1;
  end if;
  return new;
end; $function$;

create or replace function public.factures_rattacher_clients(p_logiciel text default 'Odoo')
returns table(rattachees bigint, sans_client bigint) language plpgsql set search_path to 'public' as $function$
begin
  update public.factures f
     set client_id = k.cid
    from (select f2.id as fid, (
            select coalesce(c.fusionne_vers, c.id) from public.clients c
             where c.source_logiciel = p_logiciel and c.source_code_client = f2.source_client_code
               and (p_logiciel <> 'Hygisoft' or f2.agence_id is null
                    or (select a1.business_unit from public.agences a1 where a1.id = c.agence_id)
                       is not distinct from (select a2.business_unit from public.agences a2 where a2.id = f2.agence_id))
             order by (c.agence_id = f2.agence_id) desc nulls last, c.fusionne_vers nulls first limit 1) as cid
            from public.factures f2
           where f2.source_logiciel = p_logiciel and f2.source_client_code is not null) k
   where f.id = k.fid and k.cid is not null and f.client_id is distinct from k.cid;
  return query
    select count(*) filter (where client_id is not null), count(*) filter (where client_id is null)
      from public.factures where source_logiciel = p_logiciel;
end; $function$;

-- 4. Liens devis / contrats / factures ----------------------------------------------------------
-- À rappeler jusqu'à ce que « restant » soit à 0 (traite p_limite lignes par étape et par appel).
create or replace function public.hgs_rattacher(p_limite int default 4000)
returns table(etape text, traitees bigint, restant bigint) language plpgsql security definer set search_path to 'public' as $function$
declare n bigint; r bigint;
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;

  -- commerciaux (une fiche par nom et par entité), puis lien sur devis et contrats
  insert into public.vendeurs (nom, agence_id)
  select distinct v.nom, v.agence_id from (
    select cree_par as nom, agence_id from public.devis where source_logiciel = 'Hygisoft'
    union select source_vendeur, agence_id from public.contrats where source_logiciel = 'Hygisoft') v
  where v.nom is not null and v.agence_id is not null
  on conflict (nom, agence_id) do nothing;

  with t as (select d.id, (select v.id from public.vendeurs v where v.nom = d.cree_par and v.agence_id = d.agence_id) vid
               from public.devis d where d.source_logiciel = 'Hygisoft' and d.vendeur_id is null and d.cree_par is not null limit p_limite)
  update public.devis d set vendeur_id = t.vid from t where d.id = t.id and t.vid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.devis d where d.source_logiciel = 'Hygisoft' and d.vendeur_id is null and d.cree_par is not null
     and exists (select 1 from public.vendeurs v where v.nom = d.cree_par and v.agence_id = d.agence_id);
  etape := 'devis : commercial'; traitees := n; restant := r; return next;

  with t as (select k.id, (select v.id from public.vendeurs v where v.nom = k.source_vendeur and v.agence_id = k.agence_id) vid
               from public.contrats k where k.source_logiciel = 'Hygisoft' and k.vendeur_id is null and k.source_vendeur is not null limit p_limite)
  update public.contrats k set vendeur_id = t.vid from t where k.id = t.id and t.vid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.contrats k where k.source_logiciel = 'Hygisoft' and k.vendeur_id is null and k.source_vendeur is not null
     and exists (select 1 from public.vendeurs v where v.nom = k.source_vendeur and v.agence_id = k.agence_id);
  etape := 'contrats : commercial'; traitees := n; restant := r; return next;

  -- devis -> client
  with t as (select d.id, (select coalesce(c.fusionne_vers, c.id) from public.clients c
                            join public.agences a on a.id = c.agence_id and a.business_unit = 'HGS'
                           where c.source_logiciel = 'Hygisoft' and c.source_code_client = d.source_client_code
                           order by c.fusionne_vers nulls first limit 1) cid
               from public.devis d where d.source_logiciel = 'Hygisoft' and d.client_id is null and d.source_client_code is not null limit p_limite)
  update public.devis d set client_id = t.cid from t where d.id = t.id and t.cid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.devis d where d.source_logiciel = 'Hygisoft' and d.client_id is null and d.source_client_code is not null
     and exists (select 1 from public.clients c join public.agences a on a.id = c.agence_id and a.business_unit = 'HGS'
                  where c.source_logiciel = 'Hygisoft' and c.source_code_client = d.source_client_code);
  etape := 'devis : client'; traitees := n; restant := r; return next;

  -- contrats -> client
  with t as (select k.id, (select coalesce(c.fusionne_vers, c.id) from public.clients c
                            join public.agences a on a.id = c.agence_id and a.business_unit = 'HGS'
                           where c.source_logiciel = 'Hygisoft' and c.source_code_client = k.source_client_code
                           order by c.fusionne_vers nulls first limit 1) cid
               from public.contrats k where k.source_logiciel = 'Hygisoft' and k.client_id is null and k.source_client_code is not null limit p_limite)
  update public.contrats k set client_id = t.cid from t where k.id = t.id and t.cid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.contrats k where k.source_logiciel = 'Hygisoft' and k.client_id is null and k.source_client_code is not null
     and exists (select 1 from public.clients c join public.agences a on a.id = c.agence_id and a.business_unit = 'HGS'
                  where c.source_logiciel = 'Hygisoft' and c.source_code_client = k.source_client_code);
  etape := 'contrats : client'; traitees := n; restant := r; return next;

  -- factures -> client (rattrape les factures importées avant leurs clients)
  with t as (select f.id, (select coalesce(c.fusionne_vers, c.id) from public.clients c
                            join public.agences a on a.id = c.agence_id and a.business_unit = 'HGS'
                           where c.source_logiciel = 'Hygisoft' and c.source_code_client = f.source_client_code
                           order by c.fusionne_vers nulls first limit 1) cid
               from public.factures f where f.source_logiciel = 'Hygisoft' and f.client_id is null and f.source_client_code is not null limit p_limite)
  update public.factures f set client_id = t.cid from t where f.id = t.id and t.cid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.factures f where f.source_logiciel = 'Hygisoft' and f.client_id is null and f.source_client_code is not null
     and exists (select 1 from public.clients c join public.agences a on a.id = c.agence_id and a.business_unit = 'HGS'
                  where c.source_logiciel = 'Hygisoft' and c.source_code_client = f.source_client_code);
  etape := 'factures : client'; traitees := n; restant := r; return next;

  -- factures -> contrat
  with t as (select f.id, (select k.id from public.contrats k where k.source_logiciel = 'Hygisoft' and k.source_id = f.source_contrat_code limit 1) kid
               from public.factures f where f.source_logiciel = 'Hygisoft' and f.contrat_id is null and f.source_contrat_code is not null limit p_limite)
  update public.factures f set contrat_id = t.kid from t where f.id = t.id and t.kid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.factures f where f.source_logiciel = 'Hygisoft' and f.contrat_id is null and f.source_contrat_code is not null
     and exists (select 1 from public.contrats k where k.source_logiciel = 'Hygisoft' and k.source_id = f.source_contrat_code);
  etape := 'factures : contrat'; traitees := n; restant := r; return next;

  -- factures -> devis
  with t as (select f.id, (select d.id from public.devis d where d.source_logiciel = 'Hygisoft' and d.source_id = f.source_devis_code limit 1) did
               from public.factures f where f.source_logiciel = 'Hygisoft' and f.devis_id is null and f.source_devis_code is not null limit p_limite)
  update public.factures f set devis_id = t.did from t where f.id = t.id and t.did is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.factures f where f.source_logiciel = 'Hygisoft' and f.devis_id is null and f.source_devis_code is not null
     and exists (select 1 from public.devis d where d.source_logiciel = 'Hygisoft' and d.source_id = f.source_devis_code);
  etape := 'factures : devis'; traitees := n; restant := r; return next;
end; $function$;

revoke all on function public.hgs_rattacher(int) from public, anon;
grant execute on function public.hgs_rattacher(int) to authenticated;

-- 5. Compléter les fiches clients déjà présentes -----------------------------------------------
-- p_rows : tableau d'objets du fichier d'import clients (entite, source_code_client, segment_code,
-- segment_source, classification_motif, groupe_client, siret, type_client, vendeur, adresse...).
-- Ne renseigne que ce qui est vide : un segment, un groupe ou un SIRET déjà présent n'est jamais remplacé.
create or replace function public.clients_completer_import(p_rows jsonb)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare n bigint;
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;
  insert into public.client_groups (name)
  select distinct x.groupe_client from jsonb_to_recordset(p_rows) as x(groupe_client text)
   where x.groupe_client is not null and not exists (select 1 from public.client_groups g where lower(g.name) = lower(x.groupe_client))
  on conflict (name) do nothing;

  with x as (select * from jsonb_to_recordset(p_rows) as r(entite text, source_code_client text, segment_code text, segment_source text,
               classification_motif text, groupe_client text, siret text, type_client text, vendeur text, adresse text, code_postal text, ville text)),
  m as (
    select c.id, s.id as seg, x.segment_source, x.classification_motif, g.id as gid, x.siret, x.type_client, x.vendeur, x.adresse, x.code_postal, x.ville
      from x join public.clients c on c.source_logiciel = 'Hygisoft' and c.entite = x.entite and c.source_code_client = x.source_code_client
      left join public.client_segments s on s.code = x.segment_code
      left join public.client_groups g on lower(g.name) = lower(x.groupe_client))
  update public.clients c set
    segment_id = case when c.segment_id is null and m.seg is not null then m.seg else c.segment_id end,
    segment_source = case when c.segment_id is null and m.seg is not null then m.segment_source else c.segment_source end,
    segment_confidence = case when c.segment_id is null and m.seg is not null then 'auto' else c.segment_confidence end,
    classification_motif = case when c.segment_id is null and m.seg is not null then m.classification_motif else c.classification_motif end,
    type_client = case when c.segment_id is null and m.segment_source = 'b2c' and c.siret is null then 'particulier' else c.type_client end,
    siret_statut = case when c.segment_id is null and m.segment_source = 'b2c' and c.siret is null then 'non_applicable'
                        when c.siret is null and m.siret ~ '^[0-9]{14}$' and c.siret_statut in ('a_rechercher', 'introuvable', 'a_verifier') then 'manuel'
                        else c.siret_statut end,
    siret = case when c.siret is null and m.siret ~ '^[0-9]{14}$' and c.siret_statut in ('a_rechercher', 'introuvable', 'a_verifier') then m.siret else c.siret end,
    group_id = case when c.group_id is null and m.gid is not null then m.gid else c.group_id end,
    groupe_source = case when c.group_id is null and m.gid is not null then 'mot_cle' else c.groupe_source end,
    vendeur = coalesce(c.vendeur, m.vendeur), adresse = coalesce(c.adresse, m.adresse),
    code_postal = coalesce(c.code_postal, m.code_postal), ville = coalesce(c.ville, m.ville),
    updated_at = now()
  from m where c.id = m.id
    and (c.segment_id is null or c.group_id is null or c.siret is null or c.vendeur is null or c.adresse is null);
  get diagnostics n = row_count;
  return n;
end; $function$;

revoke all on function public.clients_completer_import(jsonb) from public, anon;
grant execute on function public.clients_completer_import(jsonb) to authenticated;
