-- Entité EGM GAMA (business unit SAPA), appelée « ENTREPRISE T T C » dans Odoo.
-- Appliqué le 2026-10-02. Coordonnées à compléter en enregistrant l'adresse dans « Gestion des entités ».
insert into public.agences(name, address, business_unit, color, activities)
select 'EGM GAMA', '21 rue du Professeur Pierre Dangeard, 33300 Bordeaux', 'SAPA', color, '["Termite","ILX","Mérule","Humidité"]'::jsonb
  from public.agences where name = 'GARROS'
   and not exists (select 1 from public.agences where name = 'EGM GAMA');
