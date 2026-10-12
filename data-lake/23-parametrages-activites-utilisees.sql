-- Appliqué le 2026-10-12.
-- Page « Paramétrages » (onglet Activités) : liste des activités présentes dans les factures et
-- les devis, avec leur volume, pour repérer celles qui ne sont pas encore classées dans
-- activites_familles (elles sont alors comptées dans « Autres activités » du pilotage).
-- Lecture seule. La ligne activite = null regroupe les factures et devis sans activité renseignée. Mêmes filtres que le pilotage : factures comptées dans le CA, devis non annulés.
create or replace function public.activites_utilisees()
returns table(activite text, nb_factures bigint, ca_ht numeric, nb_devis bigint)
language sql stable security invoker set search_path = public as $$
  select a, sum(nf)::bigint, sum(ca)::numeric, sum(nd)::bigint
    from (
      select f.activite as a, count(*) as nf, sum(f.montant_ht) as ca, 0::bigint as nd
        from public.factures f where coalesce(f.compte_ca, true) group by 1
      union all
      select d.activite, 0::bigint, 0::numeric, count(*)
        from public.devis d where coalesce(d.statut, '') <> 'Annulé' group by 1
    ) x
   group by a
   order by 3 desc nulls last;
$$;
revoke all on function public.activites_utilisees() from public, anon;
grant execute on function public.activites_utilisees() to authenticated;
