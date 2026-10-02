-- Rattachement automatique d'une facture à son client dès son insertion (appliqué le 2026-10-02).
-- Remplace l'ancien rattachement en masse, qui dépassait le délai de 8 s accordé aux utilisateurs
-- sur 70 000 factures. Index ajoutés pour le rattachement et la géolocalisation.
create index if not exists clients_source_code_idx on public.clients (source_logiciel, source_code_client);
create index if not exists factures_a_geocoder_idx on public.factures (adresse_chantier, code_postal_chantier, ville_chantier) where geo_le is null;

create or replace function public.factures_resoudre_client() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.source_client_code is not null and new.source_logiciel is not null
     and (new.client_id is null or (tg_op = 'UPDATE' and new.source_client_code is distinct from old.source_client_code)) then
    select coalesce(c.fusionne_vers, c.id) into new.client_id
      from public.clients c
     where c.source_logiciel = new.source_logiciel and c.source_code_client = new.source_client_code
     order by c.fusionne_vers nulls first
     limit 1;
  end if;
  return new;
end; $$;

drop trigger if exists factures_resoudre_client on public.factures;
create trigger factures_resoudre_client before insert or update of source_client_code on public.factures
  for each row execute function public.factures_resoudre_client();
