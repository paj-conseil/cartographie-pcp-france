-- ============================================================
-- Data lake : fusion des anciens clients Odoo dans les fiches clients Odoo
-- À exécuter APRÈS l'import du fichier « GROUPE SAPA » depuis Gestion commerciale.
--
-- Les anciens clients du groupe SAPA avaient été créés à partir des devis et
-- factures : une ligne par nom de client ET par code postal de chantier
-- (ex : « MCA 24 » existait une fois par commune de chantier).
-- Ce script rattache chacune de ces lignes à la vraie fiche client Odoo de
-- même nom dans la même société :
--   - les devis, factures, contrats, commandes et contacts sont déplacés vers la fiche Odoo ;
--   - l'ancienne ligne est conservée, marquée « fusionne_vers », et masquée partout ;
--   - chaque déplacement est noté dans clients_fusion_log (retour arrière possible).
-- Un ancien client n'est fusionné que si la correspondance est sans ambiguïté
-- (une seule fiche de ce nom, ou une seule avec le même code postal).
-- Ré-exécutable : les lignes déjà fusionnées sont ignorées.
-- ============================================================

drop table if exists fusion;
create temp table fusion as
with anciens as (
  select id, upper(trim(raison_sociale)) as n, code_postal as cp,
         case when entite = 'SAPA 17' then 'SAPA' else entite end as soc
  from public.clients
  where source_logiciel is null and fusionne_vers is null
    and entite in ('SAPA 17', 'PAMI', 'AVILIA', 'KRISTAL', 'TRAIT''ILE', 'PR HYGIENE', 'BORDEAUX TERMITES', 'DALL''AGNOL',
                   'BEST', 'PERLADE', 'BERNON', 'ROLLAND DES BOIS', 'HDV', 'PARAXILOCENTRE', 'CHARPENET', 'GARROS', 'AS85')
),
odoo as (
  select id, upper(trim(raison_sociale)) as n, code_postal as cp,
         case when societe_source = 'SAPA' then 'SAPA' else entite end as soc
  from public.clients
  where source_logiciel = 'Odoo' and fusionne_vers is null
),
m as (
  select a.id as old_id, o.id as new_id, (a.cp is not distinct from o.cp) as meme_cp
  from anciens a join odoo o on o.n = a.n and o.soc = a.soc
),
r as (
  select *, count(*) over (partition by old_id) as nb,
         count(*) filter (where meme_cp) over (partition by old_id) as nb_cp
  from m
)
select old_id, new_id from r where nb = 1 or (nb_cp = 1 and meme_cp);

insert into public.clients_fusion_log (table_name, row_id, ancien_client_id, nouveau_client_id)
select 'devis', d.id::text, f.old_id, f.new_id from public.devis d join fusion f on f.old_id = d.client_id
union all select 'factures', x.id::text, f.old_id, f.new_id from public.factures x join fusion f on f.old_id = x.client_id
union all select 'contrats', x.id::text, f.old_id, f.new_id from public.contrats x join fusion f on f.old_id = x.client_id
union all select 'commandes', x.id::text, f.old_id, f.new_id from public.commandes x join fusion f on f.old_id = x.client_id
union all select 'client_contacts', x.id::text, f.old_id, f.new_id from public.client_contacts x join fusion f on f.old_id = x.client_id;

update public.devis d set client_id = f.new_id from fusion f where d.client_id = f.old_id;
update public.factures x set client_id = f.new_id from fusion f where x.client_id = f.old_id;
update public.contrats x set client_id = f.new_id from fusion f where x.client_id = f.old_id;
update public.commandes x set client_id = f.new_id from fusion f where x.client_id = f.old_id;
update public.client_contacts x set client_id = f.new_id from fusion f where x.client_id = f.old_id;

-- Le SIRET déjà trouvé sur une ancienne ligne est repris s'il manque sur la fiche Odoo
update public.clients n set siret = o.siret, raison_sociale_officielle = o.raison_sociale_officielle, code_naf = o.code_naf,
       nature_juridique = o.nature_juridique, etat_administratif = o.etat_administratif, siret_statut = o.siret_statut
from (select distinct on (f.new_id) f.new_id, c.* from fusion f join public.clients c on c.id = f.old_id
      where c.siret is not null order by f.new_id, c.updated_at desc) o
where n.id = o.new_id and n.siret is null;

update public.clients c set fusionne_vers = f.new_id from fusion f where c.id = f.old_id;

-- Bilan
select (select count(*) from fusion) as anciens_clients_fusionnes,
       (select count(*) from public.clients where source_logiciel is null and fusionne_vers is null
          and entite in ('SAPA 17', 'PAMI', 'AVILIA', 'KRISTAL', 'TRAIT''ILE', 'PR HYGIENE', 'BORDEAUX TERMITES', 'DALL''AGNOL',
                         'BEST', 'PERLADE', 'BERNON', 'ROLLAND DES BOIS', 'HDV', 'PARAXILOCENTRE', 'CHARPENET', 'GARROS', 'AS85')) as anciens_restants;
