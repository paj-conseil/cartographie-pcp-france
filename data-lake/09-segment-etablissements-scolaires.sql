-- ============================================================
-- OGEC et établissements scolaires -> segment « Secteur public & établissements scolaires »
-- (code secteur_public). Appliqué en base le 02/10/2026 : 107 clients reclassés, puis
-- « SCI ECOLE » (SCI -> particulier) et « SDC LYCEE » (syndic -> gestion immobilière) rétablis.
-- Ré-exécutable ; ne touche pas aux segments choisis à la main. Seul le nom avant la
-- première virgule est examiné (« SLB, Groupe scolaire X » = entreprise de BTP, inchangée).
-- ============================================================
with cible as (
  select c.id
  from public.clients c left join public.client_segments s on s.id = c.segment_id
  where c.fusionne_vers is null and coalesce(c.segment_source, '') <> 'manuel' and coalesce(s.code, '') <> 'secteur_public'
    and upper(split_part(c.raison_sociale, ',', 1)) ~ '(^|[^A-Z])(O\.?G\.?E\.?C\.?|ECOLE|ÉCOLE|COLLEGE|COLLÈGE|LYCEE|LYCÉE|GROUPE SCOLAIRE|ENSEMBLE SCOLAIRE|UNIVERSITE|UNIVERSITÉ|IUT|CFA|MFR|MAISON FAMILIALE RURALE|RESTAURANT SCOLAIRE|CANTINE SCOLAIRE|INTERNAT|MATERNELLE|ELEMENTAIRE|ÉLÉMENTAIRE|INSTITUTION)([^A-Z]|$)'
    and upper(split_part(c.raison_sociale, ',', 1)) !~ '(AUTO.?ECOLE|ECOLE DE CONDUITE|ECOLE DE DANSE|ECOLE DE MUSIQUE|ECOLE DE GOLF|ECOLE DE VOILE|ECOLE DE SURF|ECOLE D.EQUITATION|PREVOYANCE|^SCI |^SDC |SYNDIC)'
)
update public.clients c set
  segment_id = (select id from public.client_segments where code = 'secteur_public'),
  segment_source = 'mot_cle',
  classification_motif = 'établissement scolaire / OGEC',
  type_client = 'professionnel',
  siret_statut = case when c.siret is null and c.siret_statut = 'non_applicable' then 'a_rechercher' else c.siret_statut end
from cible where c.id = cible.id;
