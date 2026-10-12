-- ============================================================
-- 27 - Intégration SERVIGECO (logiciel Servigeco, identifiants UUID) - 12/10/2026
-- Appliqué le 2026-10-12.
--
-- 1. Table paiements (règlements de factures : date, mode, montant), rattachée à la facture et au client.
-- 2. hgs_rattacher() et clients_completer_import() traitent aussi source_logiciel = 'Servigeco'
--    (en plus de 'Hygisoft') ; hgs_rattacher() rattache aussi les paiements à leur facture et à leur client.
-- Préparation des fichiers : python3 preparer-servigeco.py <exports> <sortie>
-- Hors SQL : siret-clients-factures (v5) cherche aussi le SIRET des clients Servigeco sans facture.
-- ============================================================
create table if not exists public.paiements (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid references public.agences(id),
  facture_id uuid references public.factures(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  source_logiciel text not null,
  source_id text not null,
  source_facture_id text,
  source_client_code text,
  facture_reference text,
  client_nom text,
  mode text,
  montant numeric,
  date_paiement date,
  banque text,
  note text,
  source_file text,
  created_at timestamptz default now()
);
create unique index if not exists paiements_source_key on public.paiements (source_logiciel, source_id);
create index if not exists paiements_facture_idx on public.paiements (facture_id);
create index if not exists paiements_client_idx on public.paiements (client_id);
create index if not exists paiements_date_idx on public.paiements (date_paiement);
alter table public.paiements enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'paiements' and policyname = 'admin_all') then
    create policy admin_all on public.paiements for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
  end if;
end $$;

do $$
declare d text;
begin
  -- clients_completer_import : Hygisoft et Servigeco
  d := pg_get_functiondef('public.clients_completer_import(jsonb)'::regprocedure);
  d := regexp_replace(d, '(\w+\.)?source_logiciel = ''Hygisoft''', '\1source_logiciel in (''Hygisoft'', ''Servigeco'')', 'g');
  execute d;

  -- hgs_rattacher : Hygisoft et Servigeco, plus les paiements
  d := pg_get_functiondef('public.hgs_rattacher(integer)'::regprocedure);
  d := regexp_replace(d, '(\w+\.)?source_logiciel = ''Hygisoft''', '\1source_logiciel in (''Hygisoft'', ''Servigeco'')', 'g');
  d := regexp_replace(d, 'end; \$function\$\s*$', $p$
  with t as (select p.id, (select f.id from public.factures f where f.source_logiciel = p.source_logiciel and f.source_id = p.source_facture_id) fid
               from public.paiements p where p.facture_id is null and p.source_facture_id is not null limit p_limite)
  update public.paiements p set facture_id = t.fid from t where p.id = t.id and t.fid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.paiements p where p.facture_id is null and p.source_facture_id is not null
     and exists (select 1 from public.factures f where f.source_logiciel = p.source_logiciel and f.source_id = p.source_facture_id);
  etape := 'paiements : facture'; traitees := n; restant := r; return next;

  with t as (select p.id, (select coalesce(c.fusionne_vers, c.id) from public.clients c
                            where c.source_logiciel = p.source_logiciel and c.source_code_client = p.source_client_code
                            order by c.fusionne_vers nulls first limit 1) cid
               from public.paiements p where p.client_id is null and p.source_client_code is not null limit p_limite)
  update public.paiements p set client_id = t.cid from t where p.id = t.id and t.cid is not null;
  get diagnostics n = row_count;
  select count(*) into r from public.paiements p where p.client_id is null and p.source_client_code is not null
     and exists (select 1 from public.clients c where c.source_logiciel = p.source_logiciel and c.source_code_client = p.source_client_code);
  etape := 'paiements : client'; traitees := n; restant := r; return next;
end; $function$
$p$);
  execute d;
end $$;
