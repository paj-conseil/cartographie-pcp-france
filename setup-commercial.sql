-- ============================================================
-- Gestion commerciale : données par entité (clients, factures, devis...)
-- À exécuter une seule fois dans Supabase > SQL Editor
-- Nécessite setup.sql et setup-access.sql déjà exécutés.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table des documents/données rattachés à une entité
--    "data" (jsonb) accueille des informations saisies ou
--    structurées ultérieurement, sans imposer de format figé —
--    utile tant que les formats sources varient d'une entité à l'autre.
-- ------------------------------------------------------------
create table if not exists public.entity_documents (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  category text not null check (category in ('client', 'facture', 'devis', 'autre')),
  title text not null,
  file_path text,        -- chemin dans le bucket Storage "commercial-data", si un fichier est joint
  file_name text,        -- nom d'origine du fichier
  notes text,            -- texte libre (montant, référence, contexte...)
  data jsonb,            -- données structurées optionnelles (ajoutées au fur et à mesure)
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists entity_documents_agence_idx on public.entity_documents(agence_id, category);

alter table public.entity_documents enable row level security;

drop policy if exists "admin_all_entity_documents" on public.entity_documents;
create policy "admin_all_entity_documents"
  on public.entity_documents for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- 2. Bucket de stockage privé pour les fichiers sources
--    (Excel, PDF, CSV, Word... quel que soit le format)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('commercial-data', 'commercial-data', false)
on conflict (id) do nothing;

drop policy if exists "admin_read_commercial_data" on storage.objects;
create policy "admin_read_commercial_data"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'commercial-data' and public.is_admin(auth.uid()));

drop policy if exists "admin_write_commercial_data" on storage.objects;
create policy "admin_write_commercial_data"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'commercial-data' and public.is_admin(auth.uid()));

drop policy if exists "admin_update_commercial_data" on storage.objects;
create policy "admin_update_commercial_data"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'commercial-data' and public.is_admin(auth.uid()));

drop policy if exists "admin_delete_commercial_data" on storage.objects;
create policy "admin_delete_commercial_data"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'commercial-data' and public.is_admin(auth.uid()));
