-- ============================================================
-- Data lake : fusion des anciens clients VHP dans les fiches Hygisoft
-- À exécuter APRÈS l'import de « VHP - clients.json ».
--
-- Les 1 387 anciens clients VHP du data lake viennent d'un export Hygisoft
-- antérieur, reliés aux devis, factures et contrats. Chacun est rattaché à la
-- fiche Hygisoft importée :
--   1. par le code client Hygisoft (ex : CLT004145) quand il est connu et non générique ;
--   2. sinon par le nom, s'il n'existe qu'une fiche VHP de ce nom
--      (ou une seule avec le même code postal).
-- Les devis, factures, contrats, commandes et contacts suivent ; l'ancienne
-- ligne est conservée, marquée « fusionne_vers » et masquée ; chaque
-- déplacement est noté dans clients_fusion_log. Ré-exécutable.
-- ============================================================

drop table if exists fusion;
create temp table fusion as
with anciens as (
  select id, upper(trim(raison_sociale)) as n, code_postal as cp, nullif(trim(source_ref), '') as code
  from public.clients
  where source_logiciel is null and fusionne_vers is null and entite = 'VHP'
),
nouveaux as (
  select id, upper(trim(raison_sociale)) as n, code_postal as cp, source_code_client as code
  from public.clients
  where source_logiciel = 'Hygisoft' and entite = 'VHP' and fusionne_vers is null
),
codes_fiables as (   -- codes non génériques (pas « 00000000 ») et présents une seule fois de chaque côté
  select code from anciens where code is not null and code !~ '^0+$' group by code having count(*) = 1
  intersect
  select code from nouveaux where code is not null and code !~ '^0+$' group by code having count(*) = 1
),
par_code as (
  select a.id as old_id, n.id as new_id
  from anciens a join nouveaux n on n.code = a.code
  where a.code in (select code from codes_fiables)
),
m as (
  select a.id as old_id, n.id as new_id, (a.cp is not distinct from n.cp) as meme_cp
  from anciens a join nouveaux n on n.n = a.n
  where a.id not in (select old_id from par_code)
),
r as (
  select *, count(*) over (partition by old_id) as nb,
         count(*) filter (where meme_cp) over (partition by old_id) as nb_cp
  from m
)
select old_id, new_id from par_code
union all
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

-- Le SIRET déjà trouvé sur l'ancienne ligne est repris s'il manque sur la nouvelle fiche
update public.clients n set siret = o.siret, raison_sociale_officielle = o.raison_sociale_officielle, code_naf = o.code_naf,
       nature_juridique = o.nature_juridique, etat_administratif = o.etat_administratif, siret_statut = o.siret_statut
from fusion f join public.clients o on o.id = f.old_id
where n.id = f.new_id and n.siret is null and o.siret is not null;

update public.clients c set fusionne_vers = f.new_id from fusion f where c.id = f.old_id;

select (select count(*) from fusion) as anciens_clients_fusionnes,
       (select count(*) from public.clients where source_logiciel is null and fusionne_vers is null and entite = 'VHP') as anciens_restants;
