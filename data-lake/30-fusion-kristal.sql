-- Fusion KRISTAL TRAITEMENT -> KRISTAL
-- KRISTAL (c299ae73-5a08-4629-90b9-171c7082cc0e) porte toutes les données.
-- KRISTAL TRAITEMENT (dd437156-5778-425d-a66e-99a4352ae078) n'avait aucune ligne liée.
update agences set activities = '["Humidité","ILX","Toiture","3D"]'::jsonb
 where id = 'c299ae73-5a08-4629-90b9-171c7082cc0e';
-- À exécuter par Anne (suppression refusée par le garde-fou de l'outil) :
-- delete from agences where id = 'dd437156-5778-425d-a66e-99a4352ae078';
