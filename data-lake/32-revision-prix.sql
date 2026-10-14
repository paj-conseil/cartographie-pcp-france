-- ============================================================
-- 32 - Suivi de la révision des prix (14/10/2026)
-- Appliqué le 2026-10-14 via execute_sql.
-- Principe : la base ne garde pas l'historique des tarifs de contrat (une ligne de contrat = un montant).
-- Le suivi repose donc sur la facturation récurrente : pour une même entité, un même client et une même
-- activité, on compare la facture unique d'un mois de l'année N à celle du même mois de l'année N-1
-- (mois de janvier au mois de p_ref). Les couples dont le montant varie de plus d'un facteur 2 sont écartés
-- (changement de périmètre). Même périmètre CA que le pilotage : factures, compte_ca non faux, hors intragroupe.
-- ============================================================
create or replace function public._rp_paires(p_ref date)
returns table (an int, agence_id uuid, client_id uuid, activite text, mm int, ht_n numeric, ht_p numeric)
language sql stable security definer set search_path to 'public' as $$
  with k as (
    select f.agence_id, f.client_id, f.activite, extract(month from f.date_facture)::int mm,
      sum(f.montant_ht) filter (where f.annee = extract(year from p_ref)::int)     h0, count(*) filter (where f.annee = extract(year from p_ref)::int)     c0,
      sum(f.montant_ht) filter (where f.annee = extract(year from p_ref)::int - 1) h1, count(*) filter (where f.annee = extract(year from p_ref)::int - 1) c1,
      sum(f.montant_ht) filter (where f.annee = extract(year from p_ref)::int - 2) h2, count(*) filter (where f.annee = extract(year from p_ref)::int - 2) c2
    from public.factures f
    where f.client_id is not null and f.activite is not null and f.statut = 'facture'
      and coalesce(f.compte_ca, true) and not coalesce(f.intragroupe, false)
      and f.annee between extract(year from p_ref)::int - 2 and extract(year from p_ref)::int
      and extract(month from f.date_facture) <= extract(month from p_ref)
    group by 1, 2, 3, 4
  )
  select extract(year from p_ref)::int, agence_id, client_id, activite, mm, h0, h1 from k
    where c0 = 1 and c1 = 1 and h0 > 0 and h1 > 0 and h0 between h1 * 0.5 and h1 * 2
  union all
  select extract(year from p_ref)::int - 1, agence_id, client_id, activite, mm, h1, h2 from k
    where c1 = 1 and c2 = 1 and h1 > 0 and h2 > 0 and h1 between h2 * 0.5 and h2 * 2;
$$;
revoke all on function public._rp_paires(date) from public, anon, authenticated;

create or replace function public.revision_prix(p_ref date default current_date, p_seuil numeric default 2)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare res jsonb; y int := extract(year from p_ref)::int;
begin
  if not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;
  select jsonb_build_object('annee', y, 'mois', extract(month from p_ref)::int, 'seuil', p_seuil,
    'lignes', coalesce(jsonb_agg(jsonb_build_array(agence_id, an, paires, rev, faibles, ident, baisses, ht_p, ht_n)), '[]'::jsonb))
  into res
  from (
    select agence_id, an, count(*) paires,
      count(*) filter (where (ht_n / ht_p - 1) * 100 >= p_seuil) rev,
      count(*) filter (where (ht_n / ht_p - 1) * 100 >= 0.5 and (ht_n / ht_p - 1) * 100 < p_seuil) faibles,
      count(*) filter (where abs(ht_n / ht_p - 1) * 100 < 0.5) ident,
      count(*) filter (where (ht_n / ht_p - 1) * 100 <= -0.5) baisses,
      round(sum(ht_p), 2) ht_p, round(sum(ht_n), 2) ht_n
    from public._rp_paires(p_ref) group by 1, 2
  ) s;
  return res;
end $$;
grant execute on function public.revision_prix(date, numeric) to authenticated;

create or replace function public.revision_prix_detail(p_ref date, p_agence uuid, p_seuil numeric default 2)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare res jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(x.client_id, coalesce(c.raison_sociale, '(client inconnu)'), x.activite, x.mm, x.ht_p, x.ht_n) order by x.ht_n desc), '[]'::jsonb)
  into res
  from (
    select * from public._rp_paires(p_ref)
    where an = extract(year from p_ref)::int and agence_id = p_agence and (ht_n / ht_p - 1) * 100 < p_seuil
    order by ht_n desc limit 500
  ) x left join public.clients c on c.id = x.client_id;
  return res;
end $$;
grant execute on function public.revision_prix_detail(date, uuid, numeric) to authenticated;

-- Droits : lecture réservée aux utilisateurs connectés (et la garde is_admin dans chaque fonction).
revoke execute on function public.revision_prix(date, numeric) from public, anon;
revoke execute on function public.revision_prix_detail(date, uuid, numeric) from public, anon;
