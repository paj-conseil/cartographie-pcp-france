-- ============================================================
-- 29 - Pilotage commercial : répartition du CA par activité (12/10/2026)
-- Appliqué le 2026-10-13.
-- pilotage_repartition(p_ref) : CA HT facturé par année (année de p_ref et précédente), entité et activité,
-- pour les deux camemberts de la page Pilotage commercial. Même périmètre que les autres fonctions de
-- pilotage (compte_ca, montant non nul), lecture par l'index couvrant factures_pilotage_idx.
-- ============================================================
create or replace function public.pilotage_repartition(p_ref date default current_date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare res jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'réservé aux administrateurs'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(an, agence_id, activite, round(ht))), '[]'::jsonb) into res
    from (select extract(year from f.date_facture)::int as an, f.agence_id, f.activite, sum(f.montant_ht) as ht
            from public.factures f
           where f.date_facture between make_date(extract(year from p_ref)::int - 1, 1, 1) and p_ref
             and coalesce(f.compte_ca, true) and f.montant_ht is not null
           group by 1, 2, 3) t;
  return res;
end $function$;
