-- Chiffre d'affaires HT facturé par entité et par mois (page Déploiement). Appliqué le 2026-10-03.
-- Exclut les factures marquées compte_ca = false (annulées, brouillons, extournées, intragroupe, loyers).
create or replace view public.factures_ca_mensuel with (security_invoker = true) as
select agence_id, mois, sum(montant_ht) as ht, count(*) as nb
  from public.factures
 where coalesce(compte_ca, true) and mois is not null and montant_ht is not null
 group by agence_id, mois;
grant select on public.factures_ca_mensuel to authenticated;
