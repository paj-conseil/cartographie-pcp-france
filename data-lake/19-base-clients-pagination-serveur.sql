-- Base clients (page Gestion commerciale) : pagination, filtres, tri et indicateurs calculés côté base.
-- Utilisé automatiquement par clients-base.js quand le périmètre affiché dépasse 15 000 fiches
-- (ex : BU SAPA, toutes entités), pour ne plus télécharger toute la base dans le navigateur.
-- Les fonctions appliquent elles-mêmes les droits de lecture de la table clients (administrateur : tout ;
-- sinon les entités de l'utilisateur), une seule fois par appel au lieu d'une fois par ligne.

-- Normalisation identique à REF.norm (clients-referentiel.js) : majuscules, sans accents,
-- tout caractère non alphanumérique remplacé par un espace.
create or replace function public.cb_norm(t text) returns text language sql immutable parallel safe as $$
  select trim(regexp_replace(upper(translate(coalesce(t, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŒÆ',
    'aaaaaaceeeeiiiinooooouuuuyyoaAAAAAACEEEEIIIINOOOOOUUUUYOA')), '[^A-Z0-9]+', ' ', 'g'))
$$;

-- Motifs de recherche tolérants aux accents : « ECOLE » trouve aussi « École ».
-- Chaque mot de q (déjà normalisé par le navigateur) devient une expression régulière ;
-- la condition est vraie si tous les mots sont présents (insensible à la casse).
create or replace function public.cb_motifs(q text) returns text[] language sql immutable parallel safe as $$
  select coalesce(array_agg(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      lower(w), 'a', '[aàâäá]', 'g'), 'e', '[eéèêë]', 'g'), 'i', '[iîïí]', 'g'), 'o', '[oôöó]', 'g'),
      'u', '[uùûüú]', 'g'), 'c', '[cç]', 'g'), 'y', '[yÿ]', 'g')), '{}')
  from unnest(string_to_array(regexp_replace(coalesce(q, ''), '[^A-Za-z0-9 ]', '', 'g'), ' ')) w
  where w <> ''
$$;

-- Entités lisibles par l'utilisateur connecté (null = toutes)
create or replace function public.cb_perimetre(p_agences uuid[]) returns uuid[] language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin(auth.uid()) then p_agences
    else array(select ua.agence_id from public.user_agences ua where ua.user_id = auth.uid()
               and (p_agences is null or ua.agence_id = any(p_agences)))
  end
$$;

-- Une page de clients filtrée et triée, avec le nombre total de clients correspondant aux filtres.
-- p_f : {q, type, segment ('__none__' = sans segment), statut, facture ('oui'|'non'), entite, nom, adresse, naf, groupe}
-- (textes déjà normalisés par le navigateur).
create or replace function public.clients_base_recherche(
  p_agences uuid[], p_f jsonb default '{}'::jsonb, p_sort text default 'nom', p_dir int default 1,
  p_offset int default 0, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  w text := 'c.fusionne_vers is null';
  perim uuid[];
  tri text;
  res jsonb;
  v text;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  perim := public.cb_perimetre(p_agences);
  if perim is not null then w := w || format(' and c.agence_id = any(%L::uuid[])', perim); end if;

  v := nullif(p_f->>'type', '');
  if v is not null then w := w || format(' and c.type_client = %L', v); end if;
  v := nullif(p_f->>'segment', '');
  if v = '__none__' then w := w || ' and c.segment_id is null';
  elsif v is not null then w := w || format(' and c.segment_id = %L::uuid', v); end if;
  v := nullif(p_f->>'statut', '');
  if v is not null then w := w || format(' and c.siret_statut = %L', v); end if;
  v := nullif(p_f->>'facture', '');
  if v = 'oui' then w := w || ' and c.nb_factures > 0';
  elsif v = 'non' then w := w || ' and c.nb_factures = 0'; end if;
  v := nullif(p_f->>'entite', '');
  if v is not null then w := w || format(' and coalesce(c.entite, %L) ~* all(%L::text[])', '', public.cb_motifs(v)); end if;
  v := nullif(p_f->>'nom', '');
  if v is not null then w := w || format($f$ and concat_ws(' ', c.raison_sociale, c.raison_sociale_officielle, c.enseigne, c.source_code_client) ~* all(%L::text[])$f$, public.cb_motifs(v)); end if;
  v := nullif(p_f->>'adresse', '');
  if v is not null then w := w || format($f$ and concat_ws(' ', c.adresse, c.code_postal, c.ville) ~* all(%L::text[])$f$, public.cb_motifs(v)); end if;
  v := nullif(p_f->>'naf', '');
  if v is not null then w := w || format($f$ and replace(coalesce(c.code_naf, ''), '.', '') ilike %L$f$, v || '%'); end if;
  v := nullif(p_f->>'groupe', '');
  if v is not null then w := w || format(' and coalesce(g.name, %L) ~* all(%L::text[])', '', public.cb_motifs(v)); end if;
  v := nullif(p_f->>'q', '');
  if v is not null then w := w || format($f$ and concat_ws(' ', c.raison_sociale, c.adresse, c.ville, c.code_postal, c.siret, g.name, c.raison_sociale_officielle, c.enseigne, c.source_code_client, c.email) ~* all(%L::text[])$f$, public.cb_motifs(v)); end if;

  tri := case p_sort when 'entite' then 'c.entite' when 'type_client' then 'c.type_client' when 'code_postal' then 'c.code_postal'
    when 'siret_statut' then 'c.siret_statut' when 'code_naf' then 'c.code_naf' when 'groupe_client' then 'g.name'
    when 'segment' then 's.label' when 'ca_ht' then 'c.ca_ht' else 'c.raison_sociale' end
    || case when p_dir < 0 then ' desc' else ' asc' end || ' nulls last, c.id';

  execute format($q$
    select jsonb_build_object(
      'total', (select count(*) from public.clients c left join public.client_groups g on g.id = c.group_id where %1$s),
      'rows', coalesce((select jsonb_agg(to_jsonb(p)) from (
        select c.id, c.entite, c.source_logiciel, c.source_code_client, c.raison_sociale, c.type_client, c.adresse, c.code_postal, c.ville,
          c.email, c.telephone, c.solde_actuel, c.siret, c.siren, c.raison_sociale_officielle, c.enseigne, c.code_naf, c.nature_juridique,
          c.etat_administratif, c.siret_statut, c.siret_score, c.siret_candidats, c.siret_recherche_le, c.group_id, c.groupe_source,
          c.segment_id, c.segment_source, c.classification_motif, c.notes, c.nb_factures, c.ca_ht, c.derniere_facture,
          g.name as groupe_client
        from public.clients c
        left join public.client_groups g on g.id = c.group_id
        left join public.client_segments s on s.id = c.segment_id
        where %1$s
        order by %2$s
        offset %3$s limit %4$s) p), '[]'::jsonb))
  $q$, w, tri, greatest(p_offset, 0), least(greatest(p_limit, 1), 1000)) into res;
  return res;
end $$;

-- Indicateurs du bandeau (comptes, facturés, SIRET...) pour le périmètre affiché
create or replace function public.clients_base_kpis(p_agences uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare perim uuid[]; res jsonb;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  perim := public.cb_perimetre(p_agences);
  select jsonb_build_object(
    'comptes', count(*),
    'factures', count(*) filter (where nb_factures > 0),
    'professionnels', count(*) filter (where type_client = 'professionnel'),
    'particuliers', count(*) filter (where type_client = 'particulier'),
    'a_determiner', count(*) filter (where type_client = 'a_determiner'),
    'siret', count(*) filter (where siret is not null),
    'a_verifier', count(*) filter (where siret_statut = 'a_verifier'),
    'sans_segment', count(*) filter (where segment_id is null),
    'a_rechercher', count(*) filter (where siret_statut = 'a_rechercher'))
  into res
  from public.clients
  where fusionne_vers is null and (perim is null or agence_id = any(perim));
  return res;
end $$;

revoke all on function public.cb_perimetre(uuid[]) from public, anon, authenticated;
revoke all on function public.clients_base_recherche(uuid[], jsonb, text, int, int, int) from public, anon;
revoke all on function public.clients_base_kpis(uuid[]) from public, anon;
grant execute on function public.clients_base_recherche(uuid[], jsonb, text, int, int, int) to authenticated;
grant execute on function public.clients_base_kpis(uuid[]) to authenticated;
grant execute on function public.cb_norm(text), public.cb_motifs(text) to authenticated;
