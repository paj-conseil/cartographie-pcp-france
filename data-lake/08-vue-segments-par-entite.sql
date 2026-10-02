-- Nombre de clients par entité et par segment (clients fusionnés exclus), pour la page Déploiement
create or replace view public.clients_segments_par_entite
with (security_invoker = true) as
select agence_id, segment_id, count(*) as nb
from public.clients
where fusionne_vers is null
group by agence_id, segment_id;
