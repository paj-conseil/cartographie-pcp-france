-- Page « Pilotage commercial » (pilotage-commercial.html) : chiffre d'affaires par famille d'activité
-- et performance des commerciaux (devis émis, devis acceptés, chiffre d'affaires facturé).

-- Familles d'activité : regroupement des métiers des devis et factures en trois familles.
-- Modifiable ici (une ligne par métier) ; tout métier absent ou non renseigné compte dans « Autres ».
create table if not exists public.activites_familles (
  activite text primary key,
  famille text not null check (famille in ('pest_control', 'bois', 'autres'))
);
alter table public.activites_familles enable row level security;
create policy "lecture" on public.activites_familles for select to authenticated using (true);
create policy "admin" on public.activites_familles for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
insert into public.activites_familles (activite, famille) values
  ('3D', 'pest_control'), ('Fumigation', 'pest_control'),
  ('Termite', 'bois'), ('ILX', 'bois'), ('Mérule', 'bois'),
  ('Isolation', 'autres'), ('Toiture', 'autres'), ('Humidité', 'autres'), ('Assainissement', 'autres'), ('Hottes', 'autres')
on conflict (activite) do nothing;

-- Données agrégées de la page, pour une période et la même période un an plus tôt (comparaison N-1).
-- Une ligne par (période, type, entité, commercial, famille). Réservé aux administrateurs.
--  - devis émis : tous les devis datés dans la période, hors devis annulés ;
--    acceptés : statut accepté / confirmé / à facturer / accord / terminé ;
--  - facturé : factures retenues dans le chiffre d'affaires (hors annulées, brouillons, intragroupe),
--    avoirs déduits ; commercial = vendeur de la facture (renseigné pour les entités sous Odoo).
create or replace function public.pilotage_donnees(p_debut date, p_fin date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb; d0 date := (p_debut - interval '1 year')::date; f0 date := (p_fin - interval '1 year')::date;
begin
  if not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;
  with dv as (
    select case when d.date_devis between p_debut and p_fin then 'N' else 'N-1' end as periode,
      d.agence_id, coalesce(nullif(trim(d.cree_par), ''), nullif(trim(v.nom), ''), '(non attribué)') as commercial,
      coalesce(af.famille, 'autres') as famille,
      count(*) as nb, sum(d.montant_ht) as ht,
      count(*) filter (where d.status = 'accepte' or d.statut in ('Accepté', 'Accord', 'Terminé')) as nb_ok,
      sum(d.montant_ht) filter (where d.status = 'accepte' or d.statut in ('Accepté', 'Accord', 'Terminé')) as ht_ok
    from public.devis d
    left join public.vendeurs v on v.id = d.vendeur_id
    left join public.activites_familles af on af.activite = d.activite
    where (d.date_devis between p_debut and p_fin or d.date_devis between d0 and f0)
      and coalesce(d.statut, '') <> 'Annulé'
    group by 1, 2, 3, 4
  ),
  fa as (
    select case when f.date_facture between p_debut and p_fin then 'N' else 'N-1' end as periode,
      f.agence_id, coalesce(nullif(trim(f.vendeur), ''), '(non attribué)') as commercial,
      coalesce(af.famille, 'autres') as famille,
      count(*) as nb, sum(f.montant_ht) as ht
    from public.factures f
    left join public.activites_familles af on af.activite = f.activite
    where (f.date_facture between p_debut and p_fin or f.date_facture between d0 and f0)
      and coalesce(f.compte_ca, true) and f.montant_ht is not null
    group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'devis', coalesce((select jsonb_agg(jsonb_build_array(periode, agence_id, commercial, famille, nb, round(ht), nb_ok, round(coalesce(ht_ok, 0)))) from dv), '[]'),
    'factures', coalesce((select jsonb_agg(jsonb_build_array(periode, agence_id, commercial, famille, nb, round(ht))) from fa), '[]'),
    'non_classe', jsonb_build_object(
      'factures_ht', (select round(sum(montant_ht)) from public.factures where date_facture between p_debut and p_fin and coalesce(compte_ca, true) and activite is null),
      'factures_total_ht', (select round(sum(montant_ht)) from public.factures where date_facture between p_debut and p_fin and coalesce(compte_ca, true)))
  ) into res;
  return res;
end $$;

revoke all on function public.pilotage_donnees(date, date) from public, anon;
grant execute on function public.pilotage_donnees(date, date) to authenticated;

create index if not exists devis_date_idx on public.devis (date_devis);
