-- ============================================================
-- Remise à zéro des tables clients du data lake (ancienne version)
-- À exécuter UNE SEULE FOIS, avant setup-clients.sql.
-- Supprime définitivement les tables clients, client_segments,
-- client_groups et client_contacts ainsi que leurs données.
-- Ne touche pas aux autres tables (agences, devis du CRM, prospection...) :
-- "cascade" retire seulement les liens (clés étrangères, vues) qui
-- pointaient vers ces tables.
-- ============================================================

drop view if exists public.clients_doublons_siret cascade;
drop view if exists public.clients_doublons_siren cascade;
drop view if exists public.clients_synthese cascade;

drop table if exists public.client_contacts cascade;
drop table if exists public.clients cascade;
drop table if exists public.client_groups cascade;
drop table if exists public.client_segments cascade;
