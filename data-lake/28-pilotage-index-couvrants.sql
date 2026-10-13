-- ============================================================
-- 28 - Pilotage commercial : index couvrants (12/10/2026)
-- Appliqué le 2026-10-12.
--
-- Avec les imports HGS, HDA, VHP et SERVIGECO (157 000 factures, 120 000 devis), les fonctions
-- pilotage_donnees / pilotage_mensuel / pilotage_tableau dépassaient le délai de 8 s des requêtes
-- de l'application (« canceling statement due to statement timeout »). Ces index permettent de lire
-- les colonnes utiles sans toucher à la table : 4,1 s -> 0,6 s pour l'agrégat des factures.
-- ============================================================
create index if not exists factures_pilotage_idx on public.factures (date_facture) include (agence_id, vendeur, activite, montant_ht, compte_ca);
create index if not exists devis_pilotage_idx on public.devis (date_devis) include (agence_id, cree_par, vendeur_id, activite, montant_ht, status, statut);
-- vacuum analyze public.factures; vacuum analyze public.devis;   (à lancer une fois, pour activer les lectures d'index seul)

-- Paiements : index partiels pour que le rattachement (hgs_rattacher) reste sous le délai de 8 s à l'import.
create index if not exists paiements_a_lier_facture_idx on public.paiements (source_logiciel, source_facture_id) where facture_id is null;
create index if not exists paiements_a_lier_client_idx on public.paiements (source_logiciel, source_client_code) where client_id is null;
