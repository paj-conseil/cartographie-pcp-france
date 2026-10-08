-- Appliqué le 2026-10-08.
-- La file de géolocalisation des chantiers (bouton "Géolocaliser chantiers" de la page
-- Gestion commerciale) ne progressait jamais : chantiers_geo restait à 0 ligne malgré
-- plus de 126 000 factures à géolocaliser.
--
-- Cause : le groupe le plus fréquent (21 981 factures) n'a ni adresse, ni ville, ni code
-- postal valide (code_postal_chantier = '0' — un défaut d'import, pas une vraie valeur).
-- factures_adresses_a_geocoder() le renvoyait quand même, et comme il arrive toujours en
-- tête (tri par fréquence décroissante), il composait la quasi-totalité de chaque lot
-- envoyé au géocodeur. Rien n'étant exploitable dans ces lignes, l'appel échouait, et
-- comme un lot en échec n'écrit rien dans chantiers_geo, ce même groupe revenait en tête
-- à chaque nouvelle tentative : la file restait bloquée indéfiniment sur ce seul lot.
--
-- Correctif : on exclut de la file les lignes qui n'ont vraiment rien d'exploitable
-- (ni ville, ni code postal à 5 chiffres) — il n'y a de toute façon rien à géolocaliser
-- pour elles. Les lignes avec seulement une ville/un code postal (sans numéro de rue)
-- restent incluses : le relais de géocodage sait déjà replier sur le centre de la commune.
--
-- Au même moment : le relais de géocodage (edge function "geocodage") retirait son ancien
-- repli api-adresse.data.gouv.fr/search/csv/, décommissionné depuis janvier 2026 (voir
-- supabase/functions/geocodage/index.ts).

create or replace function public.factures_adresses_a_geocoder(p_limite integer default 2000)
 returns table(adresse text, code_postal text, ville text, nb bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  select f.a, f.cp, f.v, count(*)
    from (select coalesce(adresse_chantier, '') a, coalesce(code_postal_chantier, '') cp, coalesce(ville_chantier, '') v
            from public.factures
           where code_postal_chantier is not null or ville_chantier is not null) f
   where not exists (select 1 from public.chantiers_geo g where g.adresse = f.a and g.code_postal = f.cp and g.ville = f.v)
     and (f.v <> '' or f.cp ~ '^[0-9]{5}$')
   group by 1, 2, 3
   order by 4 desc
   limit p_limite;
$function$;
