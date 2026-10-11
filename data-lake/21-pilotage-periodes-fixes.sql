-- Page « Pilotage commercial » : résultats présentés sur des périodes fixes.
--   a2  : année N-2 complète (2024)
--   a1  : année N-1 complète (2025)
--   ytd : année N du 1er janvier à la date de référence (YTD 2026)
--   m   : dernier mois complet (septembre 2026 au 11/10/2026)
--   m1  : même mois un an plus tôt (septembre 2025)
-- Une ligne par (période, entité, commercial, famille). Réservé aux administrateurs.
-- Mêmes règles que pilotage_donnees (20-pilotage-activites-commerciaux.sql).
create or replace function public.pilotage_tableau(p_ref date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  y int := extract(year from p_ref)::int;
  m_deb date := (date_trunc('month', p_ref) - interval '1 month')::date;
  m_fin date := (date_trunc('month', p_ref) - interval '1 day')::date;
begin
  if not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;
  with per(code, debut, fin) as (values
    ('a2', make_date(y - 2, 1, 1), make_date(y - 2, 12, 31)),
    ('a1', make_date(y - 1, 1, 1), make_date(y - 1, 12, 31)),
    ('ytd', make_date(y, 1, 1), p_ref),
    ('m', m_deb, m_fin),
    ('m1', (m_deb - interval '1 year')::date, (m_fin - interval '1 year')::date)
  ),
  bornes as (select min(debut) d0, max(fin) d1 from per),
  dv as (
    select p.code as periode, d.agence_id,
      coalesce(nullif(trim(d.cree_par), ''), nullif(trim(v.nom), ''), '(non attribué)') as commercial,
      coalesce(af.famille, 'autres') as famille,
      count(*) as nb, sum(d.montant_ht) as ht,
      count(*) filter (where d.status = 'accepte' or d.statut in ('Accepté', 'Accord', 'Terminé')) as nb_ok,
      sum(d.montant_ht) filter (where d.status = 'accepte' or d.statut in ('Accepté', 'Accord', 'Terminé')) as ht_ok
    from public.devis d
    cross join bornes b
    join per p on d.date_devis between p.debut and p.fin
    left join public.vendeurs v on v.id = d.vendeur_id
    left join public.activites_familles af on af.activite = d.activite
    where d.date_devis between b.d0 and b.d1
      and coalesce(d.statut, '') <> 'Annulé'
    group by 1, 2, 3, 4
  ),
  fa as (
    select p.code as periode, f.agence_id,
      coalesce(nullif(trim(f.vendeur), ''), '(non attribué)') as commercial,
      coalesce(af.famille, 'autres') as famille,
      count(*) as nb, sum(f.montant_ht) as ht,
      sum(f.montant_ht) filter (where f.activite is null) as ht_nc
    from public.factures f
    cross join bornes b
    join per p on f.date_facture between p.debut and p.fin
    left join public.activites_familles af on af.activite = f.activite
    where f.date_facture between b.d0 and b.d1
      and coalesce(f.compte_ca, true) and f.montant_ht is not null
    group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'periodes', (select jsonb_object_agg(code, jsonb_build_object('debut', debut, 'fin', fin)) from per),
    'devis', coalesce((select jsonb_agg(jsonb_build_array(periode, agence_id, commercial, famille, nb, round(ht), nb_ok, round(coalesce(ht_ok, 0)))) from dv), '[]'),
    'factures', coalesce((select jsonb_agg(jsonb_build_array(periode, agence_id, commercial, famille, nb, round(ht), round(coalesce(ht_nc, 0)))) from fa), '[]')
  ) into res;
  return res;
end $$;

revoke all on function public.pilotage_tableau(date) from public, anon;
grant execute on function public.pilotage_tableau(date) to authenticated;

create index if not exists factures_date_idx on public.factures (date_facture);
