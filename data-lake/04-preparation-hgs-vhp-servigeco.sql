-- ============================================================
-- Data lake : préparation de l'import HGS, VHP (Hygisoft) et SERVIGECO
-- À exécuter AVANT l'import des fichiers .json depuis Gestion commerciale.
-- Ré-exécutable sans risque.
-- ============================================================

-- Entité regroupant les structures Hygisoft « SADED by HGS » et « HYGIENE URBAINE by HGS ».
-- Sans adresse ni coordonnées : à compléter dans « Gestion des entités » pour qu'elle
-- apparaisse sur la carte.
insert into public.agences (name, address)
select 'SADED / HYGIENE URBAINE', ''
where not exists (select 1 from public.agences where upper(trim(name)) = 'SADED / HYGIENE URBAINE');

-- Vérification : les 5 entités cibles doivent toutes apparaître ci-dessous
select name from public.agences
where upper(trim(name)) in ('HYGIENE GLOBAL SERVICES (ILE DE FRANCE)', 'HYGIENE GLOBAL SERVICES (HAUTS DE FRANCE)',
                            'SADED / HYGIENE URBAINE', 'VHP', 'SERVIGECO')
order by name;
