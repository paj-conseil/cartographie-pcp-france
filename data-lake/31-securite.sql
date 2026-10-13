-- 31 - Correctifs de sécurité (audit d'octobre 2026)
-- Ce fichier documente les changements déjà appliqués en base. L'état de référence reste la base elle-même.
-- Les politiques existantes ont été modifiées avec ALTER POLICY (pas de DROP) pour éviter la validation manuelle des suppressions.

-- 1. Secret partagé pour les tâches planifiées (pg_cron -> fonctions edge)
create table if not exists odoo.parametres (cle text primary key, valeur text not null);
revoke all on odoo.parametres from anon, authenticated;
-- insert into odoo.parametres(cle, valeur) values ('cron_secret', '<valeur aléatoire>');  -- fait, valeur non versionnée

-- odoo.lancer_sync() et odoo.lancer_siret() envoient l'en-tête :
--   'x-cron-secret', (select valeur from odoo.parametres where cle = 'cron_secret')
-- en plus du JWT anonyme. Elles sont SECURITY DEFINER avec search_path vide.

-- 2. Profils : un utilisateur non admin ne peut plus changer son rôle, son email, son id ni sa date de création
create or replace function public.profiles_proteger() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    if new.role is distinct from old.role or new.email is distinct from old.email
       or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'Modification du rôle ou de l''identité réservée aux administrateurs';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_proteger on public.profiles;
create trigger profiles_proteger before update on public.profiles
  for each row execute function public.profiles_proteger();

-- 3. Storage
--   devis-photos : modification et suppression réservées au propriétaire de l'objet ou à un admin (owner_id = auth.uid()).
--   entity-logos : écriture réservée aux admins (entity_logos_write).
--   commercial-data : lecture, écriture, modification et suppression réservées aux admins.
-- Restent publics en lecture : devis-photos et entity-logos.

-- 4. Politiques RLS : lecture des clients limitée aux agences de l'utilisateur (entity_read_clients),
--    tables d'import (stg_*), mappings et référentiels réservés aux admins (policies admin_all).
-- 5. Droits : retraits des privilèges superflus accordés à anon sur les tables et fonctions sensibles.

-- 6. Fonctions edge protégées par supabase-functions/autorise.ts :
--    siret-recherche, siret-clients-factures, odoo-sync  -> secret cron OU utilisateur admin
--    annuaire-entreprises, geocodage                     -> utilisateur connecté (JWT utilisateur vérifié via auth/v1/user)
--    odoo-test, clever-responder                         -> remplacées par un code 410
