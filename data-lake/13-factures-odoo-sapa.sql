-- ============================================================
-- Factures : colonnes pour l'import Odoo (GROUPE SAPA), l'analyse par mois et
-- par année, les adresses de chantier géolocalisées et les métiers.
-- Les factures ESBH et VHP déjà en base ne sont pas modifiées.
-- ============================================================

alter table public.factures
  add column if not exists source_logiciel text,
  add column if not exists source_id text,                    -- identifiant de la facture dans le logiciel source
  add column if not exists societe_source text,               -- société Odoo émettrice
  add column if not exists entite_source text,                -- comment l'entité a été choisie : societe, equipe, chantier, defaut
  add column if not exists source_client_code text,           -- identifiant du client dans le logiciel source
  add column if not exists client_nom text,                   -- nom du client tel qu'écrit sur la facture
  add column if not exists client_compte text,                -- compte comptable client (411…)
  add column if not exists client_rapprochement text,         -- comment le client a été retrouvé
  add column if not exists prestation text,                   -- modèle de devis Odoo
  add column if not exists categorie_prestation text,         -- catégorie du modèle de devis
  add column if not exists nom_chantier text,
  add column if not exists adresse_chantier_source text,      -- fiche chantier ou fiche client
  add column if not exists equipe_commerciale text,
  add column if not exists vendeur text,
  add column if not exists technicien text,
  add column if not exists etiquette_client text,
  add column if not exists intragroupe boolean not null default false,  -- facture entre deux sociétés du groupe
  add column if not exists compte_ca boolean,                 -- compte dans le chiffre d'affaires (null = oui)
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geo_precision text,                -- housenumber, street, locality, municipality
  add column if not exists geo_score numeric,
  add column if not exists geo_le timestamptz,
  add column if not exists annee int generated always as (extract(year from date_facture)::int) stored,
  add column if not exists mois date generated always as ((date_trunc('month', date_facture::timestamp))::date) stored;

create unique index if not exists factures_source_key on public.factures (source_logiciel, source_id);
create index if not exists factures_date_idx on public.factures (date_facture);
create index if not exists factures_agence_mois_idx on public.factures (agence_id, mois);
create index if not exists factures_client_idx on public.factures (client_id);
create index if not exists factures_source_client_idx on public.factures (source_client_code);

-- Rattache les factures à leur client à partir de l'identifiant du logiciel source.
-- Si le client a été fusionné, la facture va sur la fiche conservée.
create or replace function public.factures_rattacher_clients(p_logiciel text default 'Odoo')
returns table(rattachees bigint, sans_client bigint)
language plpgsql security invoker set search_path = public as $$
begin
  update public.factures f
     set client_id = coalesce(c.fusionne_vers, c.id)
    from public.clients c
   where f.source_logiciel = p_logiciel
     and c.source_logiciel = p_logiciel
     and c.source_code_client = f.source_client_code
     and f.client_id is distinct from coalesce(c.fusionne_vers, c.id);
  return query
    select count(*) filter (where client_id is not null), count(*) filter (where client_id is null)
      from public.factures where source_logiciel = p_logiciel;
end; $$;

-- Adresses de chantier restant à géolocaliser (une ligne par adresse distincte).
create or replace function public.factures_adresses_a_geocoder(p_limite int default 2000)
returns table(adresse text, code_postal text, ville text, nb bigint)
language sql security invoker set search_path = public stable as $$
  select coalesce(adresse_chantier, ''), coalesce(code_postal_chantier, ''), coalesce(ville_chantier, ''), count(*)
    from public.factures
   where geo_le is null and (code_postal_chantier is not null or ville_chantier is not null)
   group by 1, 2, 3
   order by 4 desc
   limit p_limite;
$$;

-- Enregistre les coordonnées trouvées : p_resultats = [{adresse, code_postal, ville, lat, lon, precision, score}]
create or replace function public.factures_enregistrer_geocodage(p_resultats jsonb)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare n bigint;
begin
  update public.factures f
     set latitude = r.lat, longitude = r.lon, geo_precision = r.precision, geo_score = r.score, geo_le = now()
    from jsonb_to_recordset(p_resultats) as r(adresse text, code_postal text, ville text, lat double precision, lon double precision, precision text, score numeric)
   where f.geo_le is null
     and coalesce(f.adresse_chantier, '') = coalesce(r.adresse, '')
     and coalesce(f.code_postal_chantier, '') = coalesce(r.code_postal, '')
     and coalesce(f.ville_chantier, '') = coalesce(r.ville, '');
  get diagnostics n = row_count;
  return n;
end; $$;

grant execute on function public.factures_rattacher_clients(text) to authenticated;
grant execute on function public.factures_adresses_a_geocoder(int) to authenticated;
grant execute on function public.factures_enregistrer_geocodage(jsonb) to authenticated;

-- Vue d'analyse : une ligne par facture avec entité, business unit, client, segment et groupe.
-- Pour le chiffre d'affaires, filtrer sur compte_ca (exclut les factures annulées,
-- extournées, intragroupe et les quittances de loyer).
create or replace view public.factures_analyse with (security_invoker = true) as
select f.id, f.reference, f.date_facture, f.annee, f.mois, f.date_echeance,
       f.agence_id, a.name as entite, a.business_unit,
       f.client_id, coalesce(c.raison_sociale, f.client_nom) as client, c.type_client,
       s.label as segment, g.name as groupe_client,
       f.montant_ht, f.montant_tva, f.montant_ttc, f.statut, f.statut_paiement,
       f.activite as metier, f.type_contrat, f.prestation, f.categorie_prestation,
       f.nom_chantier, f.adresse_chantier, f.code_postal_chantier, f.ville_chantier, f.latitude, f.longitude, f.geo_precision,
       f.vendeur, f.equipe_commerciale, f.technicien, f.intragroupe,
       coalesce(f.compte_ca, true) as compte_ca, f.source_logiciel, f.source_file
  from public.factures f
  left join public.agences a on a.id = f.agence_id
  left join public.clients c on c.id = f.client_id
  left join public.client_segments s on s.id = c.segment_id
  left join public.client_groups g on g.id = c.group_id;

grant select on public.factures_analyse to authenticated;
