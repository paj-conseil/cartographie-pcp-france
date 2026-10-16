-- Journal du chargement ESBH du 2026-10-16 (exécuté directement via Supabase, non rejouable tel quel).
-- Sources : 2026_10_16_-_Liste_des_factures_ESBH.xml, 2026_10_16_-_Liste_des_devis_ESBH.xml, 2026_10_16_-_Liste_des_clients_ESBH.xml
-- Agence ESBH : 0aa5bbd4-6c18-4384-af8a-8427d58bfa3a (BU SAPA)

-- 1. Normalisation des factures existantes (extraits du 2026-09-14) pour activer la clé unique (source_logiciel, source_id)
update public.factures set source_logiciel='EBP', source_id='ESBH-'||reference, societe_source='ESBH', entite_source='ESBH',
  statut = case when montant_ht < 0 then 'avoir' else 'facture' end
where agence_id='0aa5bbd4-6c18-4384-af8a-8427d58bfa3a' and source_logiciel is null and source_id is null;

-- 2. Insertion de 431 factures nouvelles (références 56216 à 56646), on conflict (source_logiciel, source_id) do nothing.
--    Activité via stg_activite_mapping sur le Sujet, client_id via clients.source_code_client.

-- 3. Correction de la facture 56145 : montant HT 1916.00 -> 1700.00 (valeur du fichier du 16/10)
update public.factures set montant_ht = 1700.00
where agence_id='0aa5bbd4-6c18-4384-af8a-8427d58bfa3a' and reference='56145' and montant_ht=1916.00;

-- 4. Insertion de 368 devis nouveaux (références 00050689 à 00051056, 1 023 876 EUR HT), garde "where not exists" sur (agence_id, reference).
--    Activité via devis_activite_mapping sur le Sujet, vendeur via vendeurs.nom = initiales, client via source_code_client.

-- Contrôles : aucun doublon de référence entre fichier et base ; écart vs fichier officiel 2025 : -882 EUR (-0,02 %), 2026 janv-sept : +4 EUR.
-- Points ouverts : fichier clients non intégré (clients en base à fiabiliser), 346 des 431 factures nouvelles et 29 sur 368 devis nouveaux sans client_id.
