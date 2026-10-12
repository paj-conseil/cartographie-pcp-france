#!/usr/bin/env python3
# Segmentation commune des clients (mots-clés, formes juridiques, prénoms) pour les scripts de préparation des imports.
import re, unicodedata

def norm(s):
    s = unicodedata.normalize('NFD', str(s if s == s and s is not None else ''))
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').upper()
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()

def txt(v):
    if v is None or (isinstance(v, float) and v != v): return None
    s = re.sub(r'\s+', ' ', str(v).replace('\r', ' ').replace('\n', ' ')).strip()
    return s or None

SEG_TYPE = {  # type Hygisoft -> segment par défaut (même logique que l'import HGS du 14/09)
    'ENTREPRISE - GMS': 'distrib_alim', 'ENTREPRISE - Commerce': 'distrib_non_alim', 'ENTREPRISE - Service': 'gestion_immo',
    'SYNDIC - Syndic': 'gestion_immo', 'RESTAURANT': 'chr', 'HOTEL': 'chr', 'ADMINISTRATION - Marché publique': 'secteur_public',
    'ENTREPRISE - Agro alimentaires': 'agroalim', 'SANTE': 'sante', 'ENTREPRISE - Agricole': 'agriculture',
    'ENTREPRISE - Négoce': 'distrib_non_alim', 'ENTREPRISE - Pharmaceutique': 'pharma', 'HLM': 'habitat_social',
    'ENTREPRISE - Coopératives': 'agriculture', 'PARTICULIER': 'b2c',
    # types de la base HDA
    'ADMINISTRATION - Mairie': 'secteur_public', 'ADMINISTRATION - Ecole': 'secteur_public', 'ADMINISTRATION - Hôpitaux': 'sante',
    'ADMINISTRATION - Maison de retraite': 'sante', 'ADMINISTRATION -  Collectivité territoriale': 'secteur_public', 'ADMINISTRATION - Divers': 'secteur_public',
    'HOTEL RESTAURANT': 'chr', 'SANTE - Maison de retraite': 'sante', 'SANTE - Clinique': 'sante', 'ENTREPRISE - Distribution': 'distrib_non_alim',
    'MAIRIE': 'secteur_public', 'ENSEIGNEMENT': 'secteur_public', 'IMMOBILIER': 'gestion_immo', 'OCCASIONNELS PARTICULIER': 'b2c',
}
STRONG = {'ENTREPRISE - GMS', 'SYNDIC - Syndic', 'RESTAURANT', 'HOTEL', 'ADMINISTRATION - Marché publique', 'ENTREPRISE - Agro alimentaires',
          'SANTE', 'ENTREPRISE - Agricole', 'ENTREPRISE - Pharmaceutique', 'HLM', 'ENTREPRISE - Coopératives', 'PARTICULIER',
          'ADMINISTRATION - Mairie', 'ADMINISTRATION - Ecole', 'ADMINISTRATION - Hôpitaux', 'ADMINISTRATION - Maison de retraite',
          'ADMINISTRATION -  Collectivité territoriale', 'ADMINISTRATION - Divers', 'HOTEL RESTAURANT', 'SANTE - Maison de retraite', 'SANTE - Clinique',
          'MAIRIE', 'ENSEIGNEMENT', 'IMMOBILIER', 'OCCASIONNELS PARTICULIER'}

KW = [  # (segment, regex sur le nom normalisé) ; premier qui correspond
    ('division_pcp', r'\b(AADS|SAPA|AVILIA|HYGIENE GLOBAL SERVICES|SERVIGECO|ENVIRONNEMENT SERVICES|PEST CONTROL PARTNERSHIP|HDA BOURGOGNE|SADED|HYGIENE URBAINE|HYGIENE OFFICE)\b'),
    ('gestion_immo', r'\b(LCL|CREDIT COOPERATIF|CREDIT LYONNAIS|BANQUE|MAIF)\b'),
    ('habitat_social', r'\b(HLM|HABITAT|LOGEMENT SOCIAL|PODELIHA|SOCLOVA|VILOGIA|ADOMA|OFFICE PUBLIC|SIA HABITAT|OPH)\b'),
    ('secteur_public', r'^(O ?G ?E ?C|ECOLE|COLLEGE|LYCEE|UNIVERSITE|SORBONNE) |(^| )(MAIRIE|VILLE DE|COMMUNE|COMMUNAUTE|DEPARTEMENT|PREFECTURE|MINISTERE|TRIBUNAL|GENDARMERIE|POLICE|URSSAF|POLE EMPLOI|FRANCE TRAVAIL|CPAM|CARSAT|CAF|AMBASSADE|CENTRE PENITENTIAIRE|CIVIPOL|OPCO|MUSEE|BIBLIOTHEQUE|MEDIATHEQUE|SMICTOM|EPS|E P S|MAISON DE LA SOLIDARITE)( |$)'),
    ('sante', r'\b(CLINIQUE|HOPITAL|EHPAD|MEDICAL|PHARMACIE|DENTAIRE|IMAGERIE|RADIOLOGIE|MAISON DE RETRAITE|RESIDENCE SENIOR|SANTE)\b'),
    ('infrastructures', r'\b(SNCF|RATP|METRO|AEROPORT|AUTOROUTE|TRAMWAY|KEOLIS)\b'),
    ('logistique', r'\b(LOGISTIC|LOGISTICS|LOGISTIQUE|TRANSPORT|ENTREPOT|MESSAGERIE|STOCKAGE|SUPPLY CHAIN|DHL|GEODIS|FRET)\b|C LOGISTICS'),
    ('construction', r'\b(BATIMENT|BTP|CONSTRUCTION|TRAVAUX|PLOMBERIE|ELECTRICITE|COUVERTURE|MACONNERIE|PEINTURE)\b'),
    ('agriculture', r'\b(AGRICOLE|FERME|EXPLOITATION AGRICOLE|COOPERATIVE|ELEVAGE|GAEC|EARL|SILO|MINOTERIE)\b'),
    ('agroalim', r'\b(AGRO|ALIMENTAIRE|LAITERIE|ABATTOIR|CONSERVERIE)\b'),
    ('pharma', r'\b(PHARMACEUTIQUE|PIERRE FABRE)\b'),
    ('chr', r'\b(RESTAURANT|BRASSERIE|HOTEL|CAFE|BAR|PIZZERIA|TRAITEUR|SNACK|CAMPING|RITZ|LEGEND HOTEL|PENICHE)\b'),
    ('distrib_alim', r'\b(BOULANGERIE|SUPERMARCHE|SUPERETTE|EPICERIE|BOUCHERIE|CHARCUTERIE|POISSONNERIE|PRIMEUR|FROMAGERIE|CARREFOUR|AUCHAN|LECLERC|INTERMARCHE|LIDL|ALDI|MONOPRIX|FRANPRIX|CASINO|BIOCOOP|PICARD|GRAND FRAIS|NATURALIA|SO BIO|BIO C BON|MATCH|LEADER PRICE|SAMADA|VIVAL|SPAR|PAIN CHAUD)\b'),
    ('gestion_immo', r'\b(SYNDIC|CABINET|IMMOBILIER|IMMOBLIER|IMMO|FONCIA|NEXITY|CITYA|COPROPRIETE|SDC|SCI|SCPI|ASL|RESIDENCE|AGENCE|BUREAUX|FACILITY|PROPERTY|FUTURE HOME|GESTION)\b'),
    ('distrib_non_alim', r'\b(GIFI|MARIONNAUD|PANDORA|SWAROVSKI|ZARA|DECATHLON|LEROY MERLIN|CASTORAMA|NOCIBE|KIABI|ACTION|MAGASIN|BOUTIQUE|PRET A PORTER|BIJOUTERIE|CHAUSSURES|DIOR|PIERRE FREY|RENAULT)\b'),
]
KWC = [(s, re.compile(r)) for s, r in KW]

PRENOMS = set('''ALAIN ALBERT ALEXANDRE ALEXIS ALICE ALINE AMELIE ANDRE ANNE ANNIE ANTOINE ARNAUD AURELIE BERNARD BRIGITTE BRUNO CAMILLE CARINE CAROLE CAROLINE CATHERINE CECILE CEDRIC CHANTAL CHARLES CHARLOTTE CHRISTELLE CHRISTIAN CHRISTINE CHRISTOPHE CLAIRE CLAUDE CLEMENCE CLEMENT CORINNE DANIEL DANIELE DAVID DENIS DIDIER DOMINIQUE EDOUARD ELISE ELODIE EMILIE EMMANUEL ERIC ERIK ESTELLE ETIENNE EVELYNE FABIEN FABRICE FATIMA FLORENCE FLORENT FRANCIS FRANCOIS FRANCOISE FREDERIC GABRIEL GAEL GERARD GILBERT GILLES GREGORY GUILLAUME GUY HELENE HENRI HERVE HUGUES ISABELLE JACKY JACQUES JEAN JEANNE JEROME JOEL JOSEPH JULIE JULIEN KARINE LAETITIA LAURA LAURE LAURENCE LAURENT LEA LEO LIONEL LISE LOIC LOUIS LUC LUDOVIC LUCIE MAEVA MARC MARCEL MARGAUX MARIE MARIO MARTIN MARYSE MATHIEU MAURICE MAXIME MELANIE MICHEL MICHELE MONIQUE MYRIAM NADIA NADINE NATALIE NATHALIE NICOLAS NOEL NELLY OLIVIER OLIVIA PASCAL PASCALE PATRICE PATRICIA PATRICK PAUL PAULINE PHILIPPE PIERRE QUENTIN RAPHAEL RAYMOND REGIS REMI RENE RICHARD ROBERT ROGER ROMAIN SANDRA SANDRINE SEBASTIEN SERGE SIMON SOPHIE STEPHANE STEPHANIE SUZANNE SYLVIE THEO THIERRY THOMAS VALERIE VERONIQUE VICTOR VINCENT VIRGINIE XAVIER YANN YVES YVETTE BRUNO'''.split())
FORMES = re.compile(r'\b(SARL|SAS|SASU|SA|EURL|SNC|SCI|SCM|SELARL|STE|SOCIETE|ETS|ETABLISSEMENTS|GROUPE|ASSOCIATION|CABINET|AGENCE|HOTEL|RESTAURANT|BAR|CAFE|SYNDIC|SDC|EARL|GAEC|CLUB|CENTRE|MAIRIE|COMMUNE|INTERNATIONAL|FRANCE|SERVICE|SERVICES)\b')

def est_personne(nom, titre):
    n = norm(nom)
    if titre and norm(titre) in ('MONSIEUR', 'MADAME', 'MADEMOISELLE'): return 'titre ' + titre.upper()
    if re.match(r'^(MONSIEUR|MADAME|MME|MLLE|MR|M) ', n): return 'civilité'
    toks = n.split()
    if any(rx.search(n) for _, rx in KWC): return None
    if 2 <= len(toks) <= 3 and not FORMES.search(n) and not re.search(r'\b(SAINT|ST|CONGREGATION)\b', n) and any(t in PRENOMS for t in toks): return 'nom + prénom'
    return None

def segment_pour(nom, type_hyg, titre):
    """-> (segment_code ou None, source, type_client)"""
    n = norm(nom)
    if type_hyg in ('PARTICULIER', 'OCCASIONNELS PARTICULIER'): return 'b2c', 'b2c', 'particulier', None
    if type_hyg in (None, 'DIVERS', 'INDUSTRIE', 'OCCASIONNELS PROFESSIONNELS') or type_hyg not in SEG_TYPE:
        p = est_personne(nom, titre)
        if p: return 'b2c', 'b2c', 'particulier', p
    if type_hyg in STRONG:
        return SEG_TYPE[type_hyg], 'mot_cle', 'professionnel', None
    for seg, rx in KWC:
        if rx.search(n): return seg, 'mot_cle', 'professionnel', None
    if type_hyg in SEG_TYPE: return SEG_TYPE[type_hyg], 'mot_cle', 'professionnel', None
    return None, None, 'professionnel', None

def siret_ok(v):
    s = re.sub(r'\D', '', str(v or ''))
    return s if len(s) == 14 and not re.match(r'^(0+|1+|9+)$', s) else None

