-- ============================================================
-- Correction des groupes clients importés depuis Hygisoft (HGS, SERVIGECO, SADED)
--
-- Cause : à l'import, la colonne Hygisoft « Mandataire » a servi de groupe client
-- quand aucune enseigne n'était reconnue dans le nom. Or ce mandataire est le donneur
-- d'ordre qui commande la prestation (souvent une société de facility management comme
-- ONET pour les agences LCL), pas le groupe auquel appartient le client.
--
-- Correction, uniquement sur les groupes posés automatiquement (groupe_source = 'mot_cle') :
--   1. si le nom du client contient une enseigne connue, le groupe devient cette enseigne ;
--   2. sinon, si le nom de l'ancien groupe ne recoupe pas le nom du client, le groupe est retiré ;
--   3. sinon, le groupe est conservé.
-- Quand il ne recoupe pas le nom du client, l'ancien mandataire est gardé dans notes : « Donneur d'ordre (Hygisoft) : X ».
-- Les groupes saisis à la main (groupe_source = 'manuel') ne sont jamais modifiés.
-- ============================================================

create temp table marques(ordre int, motif text, groupe text) on commit drop;
insert into marques values
 (1,  '\m(LCL|CREDIT LYONNAIS)\M', 'Crédit Lyonnais (LCL)'),
 (2,  '\mCREDIT COOPERATIF\M', 'Crédit Coopératif'),
 (3,  '\m(FRANCE TRAVAIL|POLE EMPLOI)\M', 'France Travail (Pôle emploi)'),
 (4,  '\mMARIONNAUD\M', 'Marionnaud'),
 (5,  '\mGIFI\M', 'Gifi'),
 (6,  '\mBIO C.? ?BON\M', 'Bio c''Bon'),
 (7,  '\m(SUPERMARCHES? MATCH|MATCH)\M', 'Supermarchés Match'),
 (8,  '\m(INDITEX|ZARA|BERSHKA|PULL ?AND ?BEAR|MASSIMO DUTTI|STRADIVARIUS)\M', 'Inditex'),
 (9,  '\mRENAULT\M', 'Renault'),
 (10, '\mORANGE\M', 'Orange'),
 (11, '\mSFR\M', 'SFR'),
 (12, '\mBOUYGUES\M', 'Bouygues'),
 (13, '\mPANDORA\M', 'Pandora'),
 (14, '\mSWAROVSKI\M', 'Swarovski'),
 (15, '\mFOOT ?LOCKER\M', 'Foot Locker'),
 (16, '\mKLOECKNER\M', 'Kloeckner Metals'),
 (17, '\mLA POSTE\M', 'La Poste'),
 (18, '\mMAIF\M', 'MAIF'),
 (19, '\mRANDSTAD\M', 'Randstad'),
 (20, '\mSOCOTEC\M', 'Socotec'),
 (21, '\mMINISTERE\M', 'État (ministères)'),
 (22, '\mVILLE DE PARIS\M', 'Ville de Paris'),
 (23, '\mHISTOIRE D.?OR\M', 'Histoire d''Or'),
 (24, '\mNOCIBE\M', 'Nocibé'),
 (25, '\mJIMMY CHOO\M', 'Jimmy Choo'),
 (26, '\mVERSACE\M', 'Versace'),
 (27, '\m(DU PAREIL AU MEME|DPAM)\M', 'Du Pareil au Même'),
 (28, '\mURSSAF\M', 'URSSAF'),
 (29, '\mCARREFOUR\M', 'Carrefour'),
 (30, '\m(FRANPRIX|MONOPRIX|MONOP|NATURALIA|CASINO)\M', 'Casino'),
 (31, '\mALDI\M', 'Aldi'),
 (32, '\mAUCHAN\M', 'Auchan'),
 (33, '\mINTERMARCHE\M', 'Intermarché (Les Mousquetaires)'),
 (34, '\m(SUPER U|HYPER U|SYSTEME U|U EXPRESS)\M', 'Système U'),
 (35, '\m(LECLERC)\M', 'E.Leclerc'),
 (36, '\mFONCIA\M', 'Foncia'),
 (37, '\mCENTURY 21\M', 'Century 21'),
 (38, '\mPIERRE FABRE\M', 'Pierre Fabre');

create temp table calc on commit drop as
with c as (
  select cl.id, cl.raison_sociale, cl.notes, g.name as ancien,
         upper(translate(coalesce(cl.raison_sociale, ''),
           'àâäáãéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ''’',
           'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN  ')) as n,
         upper(translate(coalesce(g.name, ''),
           'àâäáãéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ''’',
           'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN  ')) as ng
  from public.clients cl
  join public.client_groups g on g.id = cl.group_id
  where cl.source_logiciel = 'Hygisoft' and cl.entite <> 'VHP'
    and cl.groupe_source = 'mot_cle' and cl.fusionne_vers is null
)
select c.id, c.ancien, c.notes,
       (select m.groupe from marques m where c.n ~ m.motif order by m.ordre limit 1) as marque,
       exists (
         select 1 from regexp_split_to_table(c.ng, '[^A-Z0-9]+') t
         where length(t) > 3
           and t not in ('CABINET','GROUPE','FRANCE','SERVICES','SERVICE','PROPRETE','SOCIETE','DISTRIBUTION')
           and c.n ~ ('\m' || t || '\M')
       ) as recoupe
from c;

insert into public.client_groups(name)
select distinct marque from calc where marque is not null
on conflict (name) do nothing;

update public.clients cl set
  group_id = case when k.marque is not null then (select id from public.client_groups where name = k.marque)
                  else null end,
  groupe_source = case when k.marque is not null then 'mot_cle' else null end,
  notes = case when k.recoupe or coalesce(cl.notes, '') like '%Donneur d''ordre (Hygisoft)%' then cl.notes
               else concat_ws(E'\n', nullif(cl.notes, ''), 'Donneur d''ordre (Hygisoft) : ' || k.ancien) end,
  updated_at = now()
from calc k
where cl.id = k.id
  and (k.marque is not null and k.marque <> k.ancien
       or k.marque is null and not k.recoupe);

select count(*) filter (where marque is not null and marque <> ancien) as remplaces_par_enseigne,
       count(*) filter (where marque is null and not recoupe) as groupes_retires,
       count(*) filter (where not (marque is not null and marque <> ancien) and not (marque is null and not recoupe)) as inchanges
from calc;
