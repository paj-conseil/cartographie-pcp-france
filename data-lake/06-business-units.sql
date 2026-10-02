-- ============================================================
-- Business units des entités (table agences, colonne business_unit)
-- Ré-exécutable sans risque.
-- ============================================================
alter table public.agences add column if not exists business_unit text;

update public.agences set business_unit = 'ES'
where upper(trim(name)) in ('AADS', 'HDA', 'ENVIRONNEMENT SERVICES (SUD)', 'ENIRONNEMENT SERVICES (NORD)', 'ENVIRONNEMENT SERVICES (NORD)', 'ENVIRONNEMENT SERVICES (CENTRE)');

update public.agences set business_unit = 'HGS'
where upper(trim(name)) in ('HYGIENE GLOBAL SERVICES (ILE DE FRANCE)', 'HYGIENE GLOBAL SERVICES (HAUTS DE FRANCE)',
                            'SADED / HYGIENE URBAINE', 'SERVIGECO', 'SERVIGECO (DEPOT)');

update public.agences set business_unit = 'SAPA'
where upper(trim(name)) like 'SAPA%'
   or upper(trim(name)) in ('AVILIA', 'BEST', 'BORDEAUX TERMITES', 'DALL''AGNOL', 'AS85', 'HDV', 'KRISTAL', 'KRISTAL TRAITEMENT',
                            'PAMI', 'PARAXILOCENTRE', 'PERLADE', 'PR HYGIENE', 'ROLLAND DES BOIS', 'TRAIT''ILE', 'VHP',
                            'GARROS', 'TERMICAP', 'BERNON', 'CHARPENET', 'ESBH', 'EGM GAMA');

-- Contrôle : entités restées sans business unit
select name from public.agences where business_unit is null order by name;
