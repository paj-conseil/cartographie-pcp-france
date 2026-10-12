-- ============================================================
-- 26 - Intégration Hygisoft : entité VHP (12/10/2026)
-- Appliqué le 2026-10-12.
--
-- Les factures, devis et contrats VHP chargés le 15/09 n'ont ni source_logiciel ni source_id.
-- Ce script leur donne la clé Hygisoft utilisée par les nouveaux fichiers (préfixe VHP-, devis et
-- contrats sur 6 chiffres) : l'import du 12/10 les met à jour au lieu de les dupliquer.
-- Les clients VHP existent déjà (clé entite + source_logiciel + code client) : rien à faire.
-- Préparation des fichiers : python3 preparer-hygisoft.py <exports> <sortie> vhp
-- ============================================================
update public.factures set source_logiciel = 'Hygisoft', source_id = 'VHP-' || reference
 where agence_id = '2980a9aa-aa66-4d24-b853-56622b7f513d' and source_logiciel is null and reference ~ '^FAC';
update public.devis set source_logiciel = 'Hygisoft', source_id = 'VHP-' || lpad(reference, 6, '0')
 where agence_id = '2980a9aa-aa66-4d24-b853-56622b7f513d' and source_logiciel is null and reference ~ '^[0-9]{1,6}$';
update public.contrats set source_logiciel = 'Hygisoft', source_id = 'VHP-' || lpad(reference, 6, '0')
 where agence_id = '2980a9aa-aa66-4d24-b853-56622b7f513d' and source_logiciel is null and reference ~ '^[0-9]{1,6}$';
