-- Appliqué le 2026-10-03.
-- 1. Facturation par client (nombre de factures, CA HT, date de la dernière facture), tenue à jour
--    par des déclencheurs sur factures. Seules les factures retenues dans le CA comptent.
-- 2. La vue de la page Déploiement compte désormais les clients facturés (nb) et garde le nombre
--    total de comptes (nb_comptes).
-- 3. Géolocalisation des chantiers stockée par adresse (table chantiers_geo) et non plus facture
--    par facture : une adresse partagée par des milliers de factures se met à jour en une ligne.

alter table public.clients add column if not exists nb_factures int not null default 0,
  add column if not exists ca_ht numeric, add column if not exists derniere_facture date;

create or replace function public.clients_maj_facturation(p_ids uuid[] default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  update public.clients c
     set nb_factures = coalesce(s.nb, 0), ca_ht = s.ht, derniere_facture = s.der
    from (select k.id, x.nb, x.ht, x.der
            from (select id from public.clients where p_ids is null or id = any(p_ids)) k
            left join (select client_id, count(*) nb, sum(montant_ht) ht, max(date_facture) der
                         from public.factures
                        where coalesce(compte_ca, true) and client_id is not null
                          and (p_ids is null or client_id = any(p_ids))
                        group by client_id) x on x.client_id = k.id) s
   where c.id = s.id
     and (c.nb_factures is distinct from coalesce(s.nb, 0) or c.ca_ht is distinct from s.ht or c.derniere_facture is distinct from s.der);
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.clients_maj_facturation(uuid[]) from public, anon;
grant execute on function public.clients_maj_facturation(uuid[]) to authenticated;

create or replace function public.factures_maj_clients_stmt() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct client_id) into ids from nt where client_id is not null;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct client_id) into ids from ot where client_id is not null;
  else
    select array_agg(distinct x) into ids from (
      select n.client_id x from nt n join ot o on o.id = n.id
       where n.client_id is distinct from o.client_id or n.montant_ht is distinct from o.montant_ht
          or n.compte_ca is distinct from o.compte_ca or n.date_facture is distinct from o.date_facture
      union
      select o.client_id from nt n join ot o on o.id = n.id
       where n.client_id is distinct from o.client_id or n.montant_ht is distinct from o.montant_ht
          or n.compte_ca is distinct from o.compte_ca or n.date_facture is distinct from o.date_facture) u
     where x is not null;
  end if;
  if ids is not null then perform public.clients_maj_facturation(ids); end if;
  return null;
end; $$;
create trigger factures_maj_clients_ins after insert on public.factures referencing new table as nt for each statement execute function public.factures_maj_clients_stmt();
create trigger factures_maj_clients_upd after update on public.factures referencing old table as ot new table as nt for each statement execute function public.factures_maj_clients_stmt();
create trigger factures_maj_clients_del after delete on public.factures referencing old table as ot for each statement execute function public.factures_maj_clients_stmt();
select public.clients_maj_facturation(null);

create or replace view public.clients_segments_par_entite with (security_invoker = true) as
select agence_id, segment_id, count(*) filter (where nb_factures > 0) as nb, count(*) as nb_comptes
  from public.clients where fusionne_vers is null group by agence_id, segment_id;

create table if not exists public.chantiers_geo(
  adresse text not null default '', code_postal text not null default '', ville text not null default '',
  lat double precision, lon double precision, precision text, score numeric, geo_le timestamptz not null default now(),
  primary key (adresse, code_postal, ville));
alter table public.chantiers_geo enable row level security;
create policy admin_all on public.chantiers_geo for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
-- factures_adresses_a_geocoder / factures_enregistrer_geocodage : lecture et écriture dans chantiers_geo,
-- et la vue factures_analyse prend les coordonnées dans chantiers_geo (voir définitions en base).
