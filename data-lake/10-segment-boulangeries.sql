-- ============================================================
-- Boulangeries -> segment « Distribution alimentaire » (code distrib_alim).
-- Appliqué en base le 02/10/2026 : 33 clients reclassés.
-- Ré-exécutable ; ne touche pas aux segments choisis à la main. Les particuliers dont le
-- nom de famille est « Pain » ou « Fournil » (ex : « PAIN Baptiste ») sont exclus.
-- ============================================================
with cible as (
  select c.id
  from public.clients c left join public.client_segments s on s.id = c.segment_id
  where c.fusionne_vers is null and coalesce(c.segment_source, '') <> 'manuel' and coalesce(s.code, '') <> 'distrib_alim'
    and (upper(split_part(c.raison_sociale, ',', 1)) ~ '(^|[^A-Z])(BOULANGERIE|BOULANGERIES|BOULANGER PATISSIER|PANETERIE|FOURNIL|PAIN)([^A-Z]|$)'
         or c.code_naf in ('10.71C', '10.71D'))
    and upper(trim(c.raison_sociale)) not in ('PAIN', 'CONSORTS PAIN')
    and trim(c.raison_sociale) !~ '^(PAIN|FOURNIL|Pain|Fournil) [A-Z][a-zéèëï]+$'
)
update public.clients c set
  segment_id = (select id from public.client_segments where code = 'distrib_alim'),
  segment_source = 'mot_cle', classification_motif = 'boulangerie', type_client = 'professionnel',
  siret_statut = case when c.siret is null and c.siret_statut = 'non_applicable' then 'a_rechercher' else c.siret_statut end
from cible where c.id = cible.id;
