-- ============================================================
-- Suppression des doublons de clients
-- Doublon = même entité + même nom + même adresse + même code postal + même ville
-- (comparaison sans tenir compte des majuscules ni des espaces en trop).
-- Les fiches sans adresse ni code postal ne sont jamais considérées comme doublons.
--
-- Pour chaque groupe de doublons, une seule fiche est conservée, choisie dans cet ordre :
-- celle qui a un SIRET, puis celle modifiée à la main (segment ou groupe), puis celle qui
-- a le plus de devis et factures, puis la plus ancienne.
-- Les devis, factures, contrats, commandes et contacts des fiches supprimées sont
-- rattachés à la fiche conservée ; chaque déplacement est noté dans clients_fusion_log.
--
-- Utilisation (réservée aux administrateurs) :
--   select * from clients_supprimer_doublons(null, true);          -- simulation, toutes entités
--   select * from clients_supprimer_doublons('<agence_id>', false); -- suppression pour une entité
-- Le bouton « Doublons » de Gestion commerciale appelle cette fonction.
-- ============================================================

create or replace function public.clients_supprimer_doublons(p_agence_id uuid default null, p_simulation boolean default true)
returns table(groupes bigint, fiches_supprimees bigint, dont_particuliers bigint, dont_professionnels bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Fonction réservée aux administrateurs';
  end if;

  drop table if exists _doublons;
  create temp table _doublons on commit drop as
  with c as (
    select id, type_client, created_at, entite,
           upper(regexp_replace(trim(raison_sociale), '\s+', ' ', 'g')) as n,
           upper(regexp_replace(trim(coalesce(adresse, '')), '\s+', ' ', 'g')) as a,
           coalesce(trim(code_postal), '') as cp,
           upper(regexp_replace(trim(coalesce(ville, '')), '\s+', ' ', 'g')) as v,
           (siret is not null) as a_siret,
           (segment_source = 'manuel' or groupe_source = 'manuel') as manuel
    from public.clients
    where fusionne_vers is null
      and coalesce(trim(raison_sociale), '') <> ''
      -- sans adresse ni code postal, deux fiches de même nom peuvent être deux clients différents
      and (coalesce(trim(adresse), '') <> '' or coalesce(trim(code_postal), '') <> '')
      and (p_agence_id is null or agence_id = p_agence_id)
  ),
  g as (
    select c.*, count(*) over (partition by entite, n, a, cp, v) as nb from c
  ),
  d as (select * from g where nb > 1),
  liens as (
    select client_id, count(*) as nb from (
      select client_id from public.devis where client_id in (select id from d)
      union all select client_id from public.factures where client_id in (select id from d)
    ) x group by client_id
  ),
  r as (
    select d.id, d.type_client,
           first_value(d.id) over (partition by d.entite, d.n, d.a, d.cp, d.v
             order by d.a_siret desc, d.manuel desc, coalesce(l.nb, 0) desc, d.created_at, d.id) as garder
    from d left join liens l on l.client_id = d.id
  )
  select id as old_id, garder as keep_id, type_client from r where id <> garder;

  if not p_simulation then
    insert into public.clients_fusion_log (table_name, row_id, ancien_client_id, nouveau_client_id)
    select 'devis', x.id::text, f.old_id, f.keep_id from public.devis x join _doublons f on f.old_id = x.client_id
    union all select 'factures', x.id::text, f.old_id, f.keep_id from public.factures x join _doublons f on f.old_id = x.client_id
    union all select 'contrats', x.id::text, f.old_id, f.keep_id from public.contrats x join _doublons f on f.old_id = x.client_id
    union all select 'commandes', x.id::text, f.old_id, f.keep_id from public.commandes x join _doublons f on f.old_id = x.client_id
    union all select 'client_contacts', x.id::text, f.old_id, f.keep_id from public.client_contacts x join _doublons f on f.old_id = x.client_id
    union all select 'clients (doublon supprimé)', f.old_id::text, f.old_id, f.keep_id from _doublons f;

    update public.devis x set client_id = f.keep_id from _doublons f where x.client_id = f.old_id;
    update public.factures x set client_id = f.keep_id from _doublons f where x.client_id = f.old_id;
    update public.contrats x set client_id = f.keep_id from _doublons f where x.client_id = f.old_id;
    update public.commandes x set client_id = f.keep_id from _doublons f where x.client_id = f.old_id;
    update public.client_contacts x set client_id = f.keep_id from _doublons f where x.client_id = f.old_id;
    -- anciennes lignes déjà fusionnées dans une fiche supprimée : elles suivent la fiche conservée
    update public.clients x set fusionne_vers = f.keep_id from _doublons f where x.fusionne_vers = f.old_id;

    delete from public.clients where id in (select old_id from _doublons);
  end if;

  return query
    select count(distinct keep_id), count(*),
           count(*) filter (where type_client = 'particulier'),
           count(*) filter (where type_client <> 'particulier')
    from _doublons;
end;
$$;

revoke all on function public.clients_supprimer_doublons(uuid, boolean) from public, anon;
grant execute on function public.clients_supprimer_doublons(uuid, boolean) to authenticated;
