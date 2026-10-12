-- Appliqué le 2026-10-12.
-- Page « Pilotage commercial » : données mensuelles, de janvier N-2 jusqu'à la date de référence.
-- Sert à deux choses :
--   1. le filtre « Mois affiché » des tableaux (mois choisi et même mois un an plus tôt) ;
--   2. la section « Vision mensuelle » (12 mois, comparés au même mois de l'année précédente).
-- Une ligne par (mois, entité, commercial, famille). Réservé aux administrateurs.
-- Mêmes règles que pilotage_tableau (21-pilotage-periodes-fixes.sql). Le mois de la date de
-- référence est inclus : il est partiel, la page l'affiche « en cours » sans écart.
create or replace function public.pilotage_mensuel(p_ref date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  d0 date := make_date(extract(year from p_ref)::int - 2, 1, 1);
begin
  if not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;
  with dv as (
    select to_char(d.date_devis, 'YYYY-MM') as mois, d.agence_id,
      coalesce(nullif(trim(d.cree_par), ''), nullif(trim(v.nom), ''), '(non attribué)') as commercial,
      coalesce(af.famille, 'autres') as famille,
      count(*) as nb, sum(d.montant_ht) as ht,
      count(*) filter (where d.status = 'accepte' or d.statut in ('Accepté', 'Accord', 'Terminé')) as nb_ok,
      sum(d.montant_ht) filter (where d.status = 'accepte' or d.statut in ('Accepté', 'Accord', 'Terminé')) as ht_ok
    from public.devis d
    left join public.vendeurs v on v.id = d.vendeur_id
    left join public.activites_familles af on af.activite = d.activite
    where d.date_devis between d0 and p_ref
      and coalesce(d.statut, '') <> 'Annulé'
    group by 1, 2, 3, 4
  ),
  fa as (
    select to_char(f.date_facture, 'YYYY-MM') as mois, f.agence_id,
      coalesce(nullif(trim(f.vendeur), ''), '(non attribué)') as commercial,
      coalesce(af.famille, 'autres') as famille,
      count(*) as nb, sum(f.montant_ht) as ht
    from public.factures f
    left join public.activites_familles af on af.activite = f.activite
    where f.date_facture between d0 and p_ref
      and coalesce(f.compte_ca, true) and f.montant_ht is not null
    group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'devis', coalesce((select jsonb_agg(jsonb_build_array(mois, agence_id, commercial, famille, nb, round(ht), nb_ok, round(coalesce(ht_ok, 0)))) from dv), '[]'),
    'factures', coalesce((select jsonb_agg(jsonb_build_array(mois, agence_id, commercial, famille, nb, round(ht))) from fa), '[]')
  ) into res;
  return res;
end $$;

revoke all on function public.pilotage_mensuel(date) from public, anon;
grant execute on function public.pilotage_mensuel(date) to authenticated;
