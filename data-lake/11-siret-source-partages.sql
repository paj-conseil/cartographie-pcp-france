-- ============================================================
-- SIRET des fichiers sources partagés par plusieurs magasins (ex : Carrefour, AFUL de centres
-- commerciaux, Monoprix, Renault) : le fichier donnait à chaque site le SIRET du siège ou d'un
-- seul établissement. Appliqué en base le 02/10/2026 : 331 clients remis « à rechercher ».
-- L'ancien SIRET est gardé comme piste dans siret_candidats (source = 'fichier') : la recherche
-- cherche d'abord l'établissement de cette entreprise dans le code postal du client.
-- ============================================================
with partages as (
  select siret, count(*) nb from public.clients
  where fusionne_vers is null and siret is not null and siret_statut = 'manuel'
  group by siret having count(distinct code_postal) >= 3
)
update public.clients c set
  siret_candidats = jsonb_build_array(jsonb_build_object('siret', c.siret, 'nom', 'SIRET du fichier source, partagé par ' || p.nb || ' clients', 'source', 'fichier', 'score', null)),
  siret = null, raison_sociale_officielle = null, code_naf = null, nature_juridique = null, etat_administratif = null,
  siret_statut = 'a_rechercher', siret_score = null,
  classification_motif = coalesce(c.classification_motif, '') || ' | SIRET source partagé remis en recherche'
from partages p
where c.siret = p.siret and c.fusionne_vers is null and c.siret_statut = 'manuel';
