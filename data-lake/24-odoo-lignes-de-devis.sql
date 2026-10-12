-- NON APPLIQUÉ (migration annulée le 2026-10-12, en attente de validation).
-- Lignes de devis Odoo (sale.order.line) : synchronisées dans l'espace odoo, puis copiées dans
-- public.devis_lignes pour s'afficher dans l'onglet Prestations de la page Devis.
-- Jusque-là, seul le montant global des devis Odoo était repris ; le modèle sale.order.line était
-- configuré mais désactivé, et sa table n'existait pas.
-- Contrôle côté Odoo (fonction odoo-test) : 209 791 lignes de produit (331 888 avec sections et notes,
-- non reprises), tous les champs ci-dessous existent.

create table if not exists odoo.sale_order_line (
  id int primary key,
  order_id int, sequence int, name text, product_id int,
  product_uom_qty numeric, price_unit numeric, discount numeric, price_subtotal numeric, price_total numeric,
  categ_id int, company_id int, margin numeric, purchase_price numeric, qty_invoiced numeric,
  untaxed_amount_invoiced numeric, untaxed_amount_to_invoice numeric,
  state text, write_date timestamptz,
  supprime_dans_odoo boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists sale_order_line_order_idx on odoo.sale_order_line (order_id);
alter table odoo.sale_order_line enable row level security;   -- comme les autres tables odoo : aucun accès direct

-- Champs supplémentaires : libellé et ordre d'affichage de la ligne.
insert into odoo.champs (modele, champ, colonne, type) values
  ('sale.order.line', 'name', 'name', 'txt'),
  ('sale.order.line', 'sequence', 'sequence', 'int');

-- Copie vers public.devis_lignes pour les devis Odoo.
--   désignation  = libellé de la ligne (retours à la ligne remplacés par « – »), sinon nom du produit
--   quantité     = quantité commandée
--   prix unit.   = prix unitaire ; si une remise est appliquée, prix net (sous-total / quantité),
--                  pour que quantité × prix donne bien le montant HT de la ligne
-- Un devis est recopié (lignes remplacées) quand une de ses lignes a changé dans Odoo depuis p_depuis,
-- ou quand il n'a encore aucune ligne côté application. Les devis créés dans l'application ne sont pas touchés.
create or replace function odoo.alimenter_devis_lignes(p_depuis timestamptz default null, p_annee integer default null)
 returns integer
 language plpgsql
 set statement_timeout to '0'
as $function$
declare n int;
begin
  drop table if exists _cibles_lignes;
  create temp table _cibles_lignes on commit drop as
    select d.id as devis_id, d.source_id::int as order_id
      from public.devis d
     where d.source_logiciel = 'Odoo' and d.source_id ~ '^[0-9]+$'
       and (p_annee is null or extract(year from d.date_devis) = p_annee)
       and exists (select 1 from odoo.sale_order_line l where l.order_id = d.source_id::int)
       and (p_depuis is null
            or exists (select 1 from odoo.sale_order_line l
                        where l.order_id = d.source_id::int
                          and (l.write_date >= p_depuis or (l.supprime_dans_odoo and l.synced_at >= p_depuis)))
            or not exists (select 1 from public.devis_lignes dl where dl.devis_id = d.id));
  delete from public.devis_lignes dl using _cibles_lignes c where dl.devis_id = c.devis_id;
  insert into public.devis_lignes (devis_id, ordre, designation, quantite, prix_unitaire_ht)
  select c.devis_id,
         (row_number() over (partition by c.devis_id order by l.sequence, l.id) - 1)::int,
         coalesce(nullif(btrim(regexp_replace(coalesce(l.name, ''), E'\\s*\\n+\\s*', ' – ', 'g')), ''), p.name, 'Prestation'),
         coalesce(l.product_uom_qty, 0),
         case when coalesce(l.discount, 0) <> 0 and coalesce(l.product_uom_qty, 0) <> 0
              then l.price_subtotal / l.product_uom_qty else coalesce(l.price_unit, 0) end
    from _cibles_lignes c
    join odoo.sale_order_line l on l.order_id = c.order_id and not l.supprime_dans_odoo
    left join odoo.product_product p on p.id = l.product_id;
  get diagnostics n = row_count;
  return n;
end $function$;

-- Après chaque synchro : copie aussi les lignes de devis.
create or replace function odoo.apres_sync(p_complet boolean default false)
 returns jsonb
 language plpgsql
 set statement_timeout to '0'
as $function$
declare r jsonb := '{}'; n int;
begin
  refresh materialized view concurrently odoo.partenaires_groupe;
  refresh materialized view concurrently odoo.partner_client_mapping;
  refresh materialized view concurrently odoo.clients_factures;
  n := odoo.creer_clients_manquants(); r := r || jsonb_build_object('clients_crees', n);
  n := odoo.alimenter_factures(case when p_complet then null else now() - interval '3 hours' end, null);
  r := r || jsonb_build_object('factures_maj', n);
  n := odoo.alimenter_devis(case when p_complet then null else now() - interval '3 hours' end, null);
  r := r || jsonb_build_object('devis_maj', n);
  n := odoo.alimenter_devis_lignes(now() - interval '3 hours', null);
  r := r || jsonb_build_object('lignes_devis_maj', n);
  return r;
end $function$;

-- Activation en dernier dans l'ordre de synchro (après les factures) : une erreur éventuelle
-- sur ce modèle ne peut pas empêcher la synchro des autres. Chargement initial par curseur,
-- repris à chaque passage (40 000 enregistrements au plus par passage).
update odoo.modeles set ordre = 9, actif = true where modele = 'sale.order.line';
