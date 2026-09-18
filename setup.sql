-- ============================================================
-- 1. Table principale
-- ============================================================
create table if not exists public.agences (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  address text default '',
  lat double precision,
  lng double precision,
  color text default '#1b6b3c',
  activities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. Sécurité (Row Level Security)
--    - Lecture : ouverte à tout le monde (site public)
--    - Écriture (insert/update/delete) : réservée aux utilisateurs
--      authentifiés (votre compte admin uniquement)
-- ============================================================
alter table public.agences enable row level security;

drop policy if exists "public_read" on public.agences;
create policy "public_read"
  on public.agences for select
  using (true);

drop policy if exists "admin_insert" on public.agences;
create policy "admin_insert"
  on public.agences for insert
  to authenticated
  with check (true);

drop policy if exists "admin_update" on public.agences;
create policy "admin_update"
  on public.agences for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin_delete" on public.agences;
create policy "admin_delete"
  on public.agences for delete
  to authenticated
  using (true);

-- ============================================================
-- 3. Données initiales (39 entités du fichier Excel)
--    A n'exécuter qu'une seule fois.
-- ============================================================
insert into public.agences (name, address, lat, lng, color, activities) values
  ('SAPA Périgueux (24)', '6, bd Georges Saumande 24000 PERIGUEUX', 45.182826, 0.7236319, '#1b6b3c', '[]'::jsonb),
  ('SAPA Langon (33)', '35, avenue du 8 mai 1945 33210 TOULENNE', 44.557805, -0.2576205, '#1b6b3c', '[]'::jsonb),
  ('SAPA Mont-de-Marsan (40)', '406 rue de Péglé 40000 MONT DE MARSAN', 43.8952906, -0.5134716, '#1b6b3c', '[]'::jsonb),
  ('SAPA 44 - Loire-Atlantique - Puceul', '13 bis, av.du Coeur de l''Ouest Parc d''activités de l''Oseraye 44390 PUCEUL', 47.5219582, -1.6410589, '#1b6b3c', '[]'::jsonb),
  ('SAPA Pau (64)', 'rue de l''Aubisque, Route de Bordeaux, 64121 SERRES CASTET', 43.3690322, -0.380297, '#1b6b3c', '[]'::jsonb),
  ('SAPA 64 - Pyrénées-Atlantiques - Pau', '50 Rue Chapelet 64200 BIARRITZ', 43.4661117, -1.5397629, '#1b6b3c', '[]'::jsonb),
  ('SAPA 79 - Deux-Sèvres - Niort', '199 Avenue de PARIS, 79000 NIORT', 46.3280742, -0.447562, '#1b6b3c', '[]'::jsonb),
  ('SAPA 79 - Deux-Sèvres - Thouars', 'Zone Industrielle de Borie 47480 Pont-du-Casse', 44.2248366, 0.6613532, '#1b6b3c', '[]'::jsonb),
  ('SAPA 85 - Vendée - Challans', 'ZA les Plantes 85370 Nalliers', 46.4732203, -1.0507118, '#1b6b3c', '[]'::jsonb),
  ('SAPA 86 - Vienne - Poitiers', '142 avenue de la Libération 86000 POITIERS', 46.5672297, 0.3195227, '#1b6b3c', '[]'::jsonb),
  ('HGS IDF', '1 avenue Christian Doppler, 77700 Serris', 48.8395428, 2.7940407, '#1b6b3c', '[]'::jsonb),
  ('HGS HDF', '41 Rue Simon Vollant, 59130 Lambersart', 50.6645187, 3.0267196, '#1b6b3c', '[]'::jsonb),
  ('SERVIGECO', '89 rue Pascal, 75013 Paris', 48.8332445, 2.3473413, '#1b6b3c', '[]'::jsonb),
  ('AADS', '135 Le Breuil, 49125 Tiercé', 47.6155271, -0.4478239, '#1b6b3c', '[]'::jsonb),
  ('AS85', '7 Rue de la Fauconnière, 85150 Landeronde', 46.6547182, -1.5661617, '#1b6b3c', '[]'::jsonb),
  ('AVILIA', '25 Rue de l''Industrie, 17700 Saint-Georges-du-Bois', 46.1378025, -0.7262233, '#1b6b3c', '[]'::jsonb),
  ('BERNON', '6 chemin de la Besse, 81000 Albi', 43.9181594, 2.0960025, '#1b6b3c', '[]'::jsonb),
  ('BEST', 'Zone Industrielle de Borie 47480 Pont-du-Casse', 44.2248366, 0.6613532, '#1b6b3c', '[]'::jsonb),
  ('BORDEAUX TERMITES', '331 Bd Jean Jacques Bosc, 33800 Bordeaux', 44.8151963, -0.5524885, '#1b6b3c', '[]'::jsonb),
  ('DALL''AGNOL', '78 Rte de Tercis, 40100 Dax', 43.6968919, -1.0676718, '#1b6b3c', '[]'::jsonb),
  ('DTN', '78 Rte de Tercis, 40100 Dax', 43.6968919, -1.0676718, '#1b6b3c', '[]'::jsonb),
  ('ES CENTRE', NULL, NULL, NULL, '#1b6b3c', '[]'::jsonb),
  ('ES NORD', 'Parc d''Activité de la Chaussée de la Moselle, Porte 5 Bis, Port 3161, 76600 Le Havre', 49.4854504, 0.1679453, '#1b6b3c', '[]'::jsonb),
  ('ES SUD', '49 rue de la Traversée, 13016 Marseille', 43.3656898, 5.3455329, '#1b6b3c', '[]'::jsonb),
  ('GARROS', '573 rue Sacha Guitry, 47520 Le Passage', 44.2099119, 0.5965051, '#1b6b3c', '[]'::jsonb),
  ('HDA', 'ZA du champs chassy, 71380 Châtenoy-en-Bresse', 46.7863264, 4.9090387, '#1b6b3c', '[]'::jsonb),
  ('HDV', '7 Rue de la Fauconnière, 85150 Landeronde', 46.6547182, -1.5661617, '#1b6b3c', '[]'::jsonb),
  ('KRITAL', '146 Av. Gambetta, 17300 Rochefort', 45.9412346, -0.9738131, '#1b6b3c', '[]'::jsonb),
  ('PAMI', '14 Rue Marcel Dassault, 81990 Cambon', 43.9244638, 2.2041854, '#1b6b3c', '[]'::jsonb),
  ('PARAXILOCENTRE', '5 Rue Denis Papin, 18230 Saint-Doulchard', 47.0990947, 2.384545, '#1b6b3c', '[]'::jsonb),
  ('PERLADE', '73 Av. Robespierre, 17000 La Rochelle', 46.1509676, -1.124002, '#1b6b3c', '[]'::jsonb),
  ('PR HYGIENE', '25 Rue de l''Industrie, 17700 Saint-Georges-du-Bois', 46.1378025, -0.7262233, '#1b6b3c', '[]'::jsonb),
  ('ROLLAND DES BOIS', '82 Av. des Noëlles, 44500 La Baule-Escoublac', 47.2960405, -2.3869603, '#1b6b3c', '[]'::jsonb),
  ('TERMICAP', '21 Rue du Prof Pierre Dangeard, 33300 Bordeaux', 44.8873655, -0.5561771, '#1b6b3c', '[]'::jsonb),
  ('TRAIT''ILE', '71 Bis Av. de Bel air, 17310 Saint-Pierre-d''Oléron', 45.9385043, -1.3110211, '#1b6b3c', '[]'::jsonb),
  ('VHP', 'Route des Sables – la Marbrerie, 85190 Venansault', 46.640173, -1.539527, '#1b6b3c', '[]'::jsonb),
  ('SAPA', '25 Rue de l''Industrie, 17700 Saint-Georges-du-Bois', 46.1378025, -0.7262233, '#1b6b3c', '[]'::jsonb),
  ('CHARPENET', '17 impasse Castelviel, 31180 Rouffiac-Tolosan', 43.6717405, 1.5186583, '#1b6b3c', '[]'::jsonb),
  ('ESBH', 'Route ZA SUD, lieu dit Pouga, route d''Orthez, 40700 HAGETMAU', 43.637329, -0.6150947, '#1b6b3c', '[]'::jsonb);
