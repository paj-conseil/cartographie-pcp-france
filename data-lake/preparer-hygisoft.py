#!/usr/bin/env python3
# Prépare les fichiers d'import HGS (Hygisoft) pour « Base clients > Importer ».
import pandas as pd, json, re, sys, subprocess, unicodedata, os
from collections import Counter

# Usage : python3 preparer-hygisoft.py <dossier des 4 exports .xlsx> <dossier de sortie> [hgs|hda|vhp]
# Les exports Hygisoft contiennent un attribut de style mal orthographié (biltinId) qui fait échouer
# openpyxl : il est corrigé en mémoire, les fichiers d'origine ne sont pas modifiés.
SRC = sys.argv[1].rstrip('/') + '/'
OUT = sys.argv[2]
PROFIL = (sys.argv[3] if len(sys.argv) > 3 else 'hgs').lower()
HDA = PROFIL == 'hda'
VHP = PROFIL == 'vhp'
SINGLE = HDA or VHP           # base Hygisoft à entité unique (pas de colonne Structure exploitable)
PFX = 'HDA-' if HDA else ('VHP-' if VHP else '')   # les numéros de devis, contrats et factures de chaque base Hygisoft peuvent se recouper
TAG = 'HDA' if HDA else ('VHP' if VHP else 'HGS')
os.makedirs(OUT, exist_ok=True)
import glob, io, zipfile
DATE = None

AG = {
    'HDA': ('f55bf4ea-6de8-49ad-b0f2-27c74c468374', 'HDA'),
    'VHP': ('2980a9aa-aa66-4d24-b853-56622b7f513d', 'VHP'),
    'IDF': ('8d43e28e-684b-4d7f-bf2c-8491e29cf858', 'HYGIENE GLOBAL SERVICES (Ile de France)'),
    'HDF': ('c04129dd-3640-4468-9c8b-cd01335c7e29', 'HYGIENE GLOBAL SERVICES (Hauts de France)'),
    'SADED': ('cc0922aa-cc27-49e3-9ec7-49606e6c3fe2', 'SADED / HYGIENE URBAINE'),
}
STRUCT = {
    None: TAG if SINGLE else 'HDA',
    'HYGIENE GLOBAL SERVICES ILE DE FRANCE': 'IDF', 'HGS - PARIS OUEST': 'IDF',
    'HYGIENE GLOBAL SERVICES HAUT DE FRANCE': 'HDF', 'HYGIENE GLOBAL SERVICES PACA': 'HDF',
    'SADED by HGS': 'SADED', 'HYGIENE URBAINE by HGS': 'SADED',
}

def norm(s):
    s = unicodedata.normalize('NFD', str(s if s == s and s is not None else ''))
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').upper()
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()

def txt(v):
    if v is None or (isinstance(v, float) and v != v): return None
    s = re.sub(r'\s+', ' ', str(v).replace('\r', ' ').replace('\n', ' ')).strip()
    return s or None

def num(v):
    try:
        x = float(v)
        return None if x != x else round(x, 2)
    except Exception:
        return None

def dt(v):
    s = txt(v)
    return s[:10] if s and re.match(r'\d{4}-\d{2}-\d{2}', s) else None

def rd(name):
    global DATE
    cand = sorted(glob.glob(SRC + '*' + name + '*.xlsx'))
    if not cand: raise SystemExit('Fichier introuvable : *' + name + '*.xlsx dans ' + SRC)
    f = cand[-1]
    m = re.match(r'(\d{4}\.\d{2}\.\d{2})', os.path.basename(f))
    if m and not DATE: DATE = m.group(1)
    zi = zipfile.ZipFile(f); buf = io.BytesIO(); zo = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED)
    for i in zi.infolist():
        d = zi.read(i.filename)
        if i.filename == 'xl/styles.xml': d = d.replace(b'biltinId', b'builtinId')
        zo.writestr(i, d)
    zo.close(); buf.seek(0)
    return pd.read_excel(buf, dtype=str)

cl, dv, fa, ct = rd('clients'), rd('devis'), rd('factures'), rd('contrats')
DATE = DATE or '0000.00.00'
# fiches de test ou sans nom exploitable : ignorées (ainsi que leurs devis et contrats)
EXCLUS = set(cl.loc[cl['Nom'].fillna('').str.strip().str.lower().isin(['client test', 'inconnu']), 'Code'])
cl = cl[~cl['Code'].isin(EXCLUS)].reset_index(drop=True)
dv = dv[~dv['Code Client'].isin(EXCLUS)].reset_index(drop=True)
ct = ct[~ct['Code client'].isin(EXCLUS)].reset_index(drop=True)
fa = fa[~fa['Code client'].isin(EXCLUS)].reset_index(drop=True)

# ---------------------------------------------------------------- activités
CODE_ACT = {
    'DER': 'Dératisation', 'SOU': 'Dératisation', 'RAG': 'Dératisation', 'INS': 'Désinsectisation', 'LOG': 'Désinsectisation',
    '2D': 'Dératisation - Désinsectisation', '3D': '3D (dératisation, désinsectisation, désinfection)', 'DES': 'Désinfection',
    'DIA': 'Punaises de lit', 'PNUL': 'Punaises de lit', 'PUNL': 'Punaises de lit', 'DEP': 'Dépigeonnisation', 'LIV': 'Livraison de produits',
    'EKOST': 'Livraison de produits', 'EKOCA': 'Livraison de produits', 'EKOMO': 'Livraison de produits', 'ENT': "Entretien d'appareils",
    'DEIV': "Entretien d'appareils", 'PLOD': "Entretien d'appareils", 'EXP': 'Audit et expertise', 'AUD': 'Audit et expertise',
    'NET': 'Nettoyage', 'VO': 'Nettoyage', 'LOC': 'Location de matériel', 'ETA': 'Étanchéité', 'TER': 'Termite',
    'DIV': 'Divers', 'DEB': 'Divers',
}

HDA_CODES = {'DSSP1': 'Désinsectisation', 'DSS': 'Désinsectisation', 'DSSG': 'Désinsectisation', 'DSSLG': 'Désinsectisation', 'DRA': 'Dératisation',
             'DRAB': 'Dératisation', 'DRAI': 'Dératisation', 'CUI': 'Hottes', '3DE1': 'Dératisation - Désinsectisation',
             'DIAGP': 'Punaises de lit', 'DIVER': 'Divers'}

def activite_texte(t):
    t = norm(t)
    if not t: return None
    if 'PUNAISE' in t or 'CANIN' in t: return 'Punaises de lit'
    if 'ETANCHEITE' in t: return 'Étanchéité'
    if 'HOTTE' in t or 'DEGRAISSAGE' in t: return 'Hottes'
    if 'VMC' in t: return 'Nettoyage'
    if t == 'PRODUITS' or t.startswith('PRODUITS '): return 'Livraison de produits'
    if 'DEPIGEON' in t: return 'Dépigeonnisation'
    if 'TERMITE' in t: return 'Termite'
    if 'DERATISATION' in t and 'DESINSECTISATION' in t and 'DESINFECTION' in t: return '3D (dératisation, désinsectisation, désinfection)'
    if 'DERATISATION' in t and 'DESINSECTISATION' in t: return 'Dératisation - Désinsectisation'
    if 'LIVRAISON' in t: return 'Livraison de produits'
    if 'ENTRETIEN' in t or 'MAINTENANCE' in t or 'PLODIA' in t or 'DEIV' in t: return "Entretien d'appareils"
    if 'LOCATION' in t: return 'Location de matériel'
    if 'VIDE ORDURE' in t or 'NETTOYAGE' in t: return 'Nettoyage'
    if 'AUDIT' in t or 'EXPERT' in t: return 'Audit et expertise'
    if 'DESINFECTION' in t: return 'Désinfection'
    if 'DERATISATION' in t or 'DESOURISATION' in t or 'RAGONDIN' in t: return 'Dératisation'
    if 'DESINSECTISATION' in t or 'DEMOUSTICATION' in t or 'PUCES' in t or 'MOUCHES' in t or 'GUEPES' in t: return 'Désinsectisation'
    if 'DIVERS' in t or 'DEBARRAS' in t: return 'Divers'
    return None

VHP_TERMITE = {'NOVIT', 'TRITH', 'TFILM', 'FICUR', 'FIPRE', 'BOIS', 'BOISP', 'SENTI', 'SENTM', 'INSEN'}
VHP_DIVERS = {'DEPLA', 'FOUIN', 'ISO', 'POISS', 'VTEDI', 'HOTTE'}

def activite_vhp(code, texte):
    """Vocabulaire déjà utilisé pour VHP : Termite, Mérule, 3D (pest control), Divers."""
    c = (code or '').strip().upper()
    if c in VHP_TERMITE: return 'Termite'
    if c == 'HUM': return 'Mérule'
    if c in VHP_DIVERS: return 'Divers'
    if c: return '3D'
    t = norm(texte)
    if re.search(r'NOVITHOR|TRITHOR|SENTRI|TERMITE|VRILLETTE|CAPRICORNE|TRAITEMENT DES BOIS|BARRIERE', t): return 'Termite'
    if 'MERULE' in t or 'CHAMPIGNON' in t: return 'Mérule'
    if 'VENTE DIRECTE' in t or 'DEPLACEMENT' in t or not t: return 'Divers'
    return '3D'

def activite(nature_code=None, service=None, label=None):
    """Activité normalisée : code nature Hygisoft d'abord (devis, contrats), sinon libellé de facture."""
    c = (nature_code or '').strip().upper()
    if VHP: return activite_vhp(nature_code, label)
    if HDA: return activite_texte(label) or activite_texte(service) or CODE_ACT.get(c) or HDA_CODES.get(c) or 'Divers'
    if c in CODE_ACT: return CODE_ACT[c]
    return activite_texte(label) or activite_texte(service) or 'Divers'

FAMILLE = {
    'Dératisation': 'pest_control', 'Désinsectisation': 'pest_control', 'Dératisation - Désinsectisation': 'pest_control',
    '3D (dératisation, désinsectisation, désinfection)': 'pest_control', 'Désinfection': 'pest_control', 'Punaises de lit': 'pest_control',
    'Dépigeonnisation': 'pest_control', 'Livraison de produits': 'pest_control', "Entretien d'appareils": 'pest_control',
    'Audit et expertise': 'pest_control', 'Termite': 'bois', 'Étanchéité': 'autres', 'Nettoyage': 'autres',
    'Location de matériel': 'autres', 'Divers': 'autres', 'Hottes': 'autres',
}

# ---------------------------------------------------------------- clients
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

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))
GROUPS_JS = os.path.join(HERE, 'groupes-clients.js')
cl['nom_c'] = cl['Nom'].map(txt)
tmp = os.path.join(OUT, '_names.json')
json.dump([{'nom': x or ''} for x in cl['nom_c']], open(tmp, 'w'))
subprocess.run(['node', GROUPS_JS, tmp, tmp + '.out'], check=True)
grp = json.load(open(tmp + '.out'))
os.remove(tmp); os.remove(tmp + '.out')

# SIRET partagés par plusieurs codes postaux : remis en recherche (règle de l'import du 14/09)
cl['siret_n'] = cl['SIRET'].map(siret_ok)
part = cl.dropna(subset=['siret_n']).groupby('siret_n')['CP fact.'].nunique()
partages = set(part[part >= 3].index)

clients_rows, seg_stats, type_stats = [], Counter(), Counter()
client_struct = {}
for i, r in cl.iterrows():
    code = r['Code']; st = TAG if SINGLE else STRUCT.get(r['Structure'])
    if st is None: raise SystemExit('Structure inconnue ' + str(r['Structure']))
    client_struct[code] = st
    nom = r['nom_c'] or ('Client ' + code)
    th = txt(r['Type de client'])
    seg, src, tcl, motif_nom = segment_pour(nom, th, txt(r['Titre']))
    if grp[i]['div']: seg, src = 'division_pcp', 'mot_cle'
    motif = ('Hygisoft : ' + th) if th else (('Hygisoft : titre ' + txt(r['Titre']).upper()) if txt(r['Titre']) else (motif_nom or 'nom (mot-clé / forme juridique)'))
    if motif_nom and th in (None, 'DIVERS'): motif = motif_nom if not txt(r['Titre']) else 'Hygisoft : titre ' + txt(r['Titre']).upper()
    s = r['siret_n'] if isinstance(r['siret_n'], str) else None
    partage = None
    if tcl == 'particulier': statut, s = 'non_applicable', None
    elif s and s in partages: statut, partage, s = 'a_rechercher', s, None
    elif s: statut = 'manuel'
    else: statut = 'a_rechercher'
    notes = []
    mand = txt(r['Mandataire'])
    if mand and norm(mand) != norm(nom):
        toks = [t for t in norm(nom).split() if len(t) > 3]
        if not any(t in norm(mand).split() for t in toks): notes.append("Donneur d'ordre (Hygisoft) : " + mand)
    if r['Prospect'] == '1': notes.append('Prospect (Hygisoft)')
    if r['Client bloqué'] == '1': notes.append('Client bloqué (Hygisoft)')
    row = {
        'entite': AG[st][1], 'source_logiciel': 'Hygisoft', 'source_code_client': code, 'raison_sociale': nom,
        'adresse': txt(r['Adresse fact.']), 'code_postal': txt(r['CP fact.']), 'ville': txt(r['Ville fact.']), 'pays': 'FR',
        'type_client': tcl, 'vendeur': txt(r['Représentant']), 'agence_source': 'structure', 'societe_source': txt(r['Structure']) or TAG,
        'source_fichier': f'{DATE} - {TAG} - Liste des clients.xlsx', 'siret': s, 'siret_statut': statut,
        'segment_code': seg, 'segment_source': src, 'classification_motif': motif,
        'groupe_client': grp[i]['g'], 'groupe_source': 'mot_cle' if grp[i]['g'] else None,
        'notes': ' | '.join(notes) or None,
    }
    if partage:
        row['siret_candidats'] = [{'siret': partage, 'nom': 'SIRET du fichier source, partagé par plusieurs clients', 'source': 'fichier', 'score': None}]
    row = {k: v for k, v in row.items() if v is not None}
    clients_rows.append(row)
    seg_stats[seg] += 1; type_stats[tcl] += 1
json.dump(clients_rows, open(OUT + '/' + TAG + '-1-clients.json', 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
print('clients', len(clients_rows), dict(type_stats)); print(dict(seg_stats))

# ---------------------------------------------------------------- factures
def vend(v):
    v = txt(v)
    return None if (not v or v.upper() in ('AUCUN REPRESENTANT', 'AUCUN')) else v

def b(v): return str(v).strip() in ('1', 'True', 'true')
def devis_code(ref):
    m = re.search(r'(?i)devis\s*(?:n°|no|n)?\s*0*(\d{1,6})', str(ref or ''))
    return (PFX + m.group(1).zfill(6)) if m else None
DUPS = set(fa.loc[fa['Numéro'].duplicated(keep=False), 'Numéro'])   # numéros de facture présents plusieurs fois (clients différents)
fac_rows = []
for _, r in fa.iterrows():
    st = TAG if SINGLE else STRUCT[r['Structure']]
    act = activite(None, None, txt(r['Nature']))   # VHP : libellé de la facture
    ht = num(r['Montant HT'])
    fac_rows.append({k: v for k, v in {
        'reference': txt(r['Numéro']), 'agence_id': AG[st][0], 'source_logiciel': 'Hygisoft', 'source_id': PFX + txt(r['Numéro']) + (('#' + txt(r['Code client'])) if r['Numéro'] in DUPS else ''),
        'source_client_code': txt(r['Code client']), 'source_contrat_code': (PFX + txt(r['Code contrat'])) if txt(r['Code contrat']) else None, 'client_nom': txt(r['Client']),
        'montant_ht': ht, 'montant_tva': num(r['Montant TVA']), 'montant_ttc': num(r['Montant TTC']), 'acompte': num(r['Acompte']),
        'montant_regle': num(r['Montant Réglé']), 'solde': num(r['Solde']), 'soldee': b(r['Soldée']), 'statut': txt(r['Etat']),
        'date_facture': dt(r['Date']), 'date_echeance': dt(r['Échéance']), 'type_contrat': txt(r['Type Ctr.']),
        'activite': act, 'prestation': txt(r['Nature']), 'nom_chantier': txt(r['Nom adresse interv.']),
        'adresse_chantier': txt(r['Adresse interv.']), 'code_postal_chantier': txt(r['CP interv.']), 'ville_chantier': txt(r['Ville interv.']),
        'contentieux': b(r['Contentieux']), 'non_recouvrable': b(r['Non recouvrable']), 'facture_acompte': b(r["Facture d'acompte"]),
        'source_devis_code': devis_code(r['Référence']),
        'vendeur': vend(r['Représentant']), 'societe_source': txt(r['Structure']) or TAG, 'entite_source': AG[st][1],
        'source_file': f'{DATE} - {TAG} - Liste des factures.xlsx',
    }.items() if v is not None});
for nom, a, z in (('2019-2020', '2019', '2020'), ('2021-2022', '2021', '2022'), ('2023-2024', '2023', '2024'), ('2025-2026', '2025', '2026')):
    part_rows = [x for x in fac_rows if x.get('date_facture') and a <= x['date_facture'][:4] <= z]
    json.dump({'table': 'factures', 'rows': part_rows}, open(OUT + f'/{TAG}-4-factures-{nom}.json', 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
print('factures', len(fac_rows), Counter(x['activite'] for x in fac_rows).most_common())

# ---------------------------------------------------------------- devis
TVA = {'1': 20, '2': 10, '3': 5.5}
STATUS = {'Accord': 'accepte', 'Refus': 'refuse', 'En attente': 'envoye', 'En attente BC': 'envoye'}
dev_rows = []
for _, r in dv.iterrows():
    code = txt(r['Code Client'])
    st = TAG if SINGLE else (STRUCT.get(r['Structure']) or client_struct[code])
    ht = num(r['Montant HT du devis']) or 0
    tx = TVA.get(str(r['Code TVA']).strip(), 20)
    tva = round(ht * tx / 100, 2)
    service = txt(r['Service']); det = txt(r['Détail service'])
    etat = txt(r['Etat du devis'])
    act_devis = activite(r['Nature'], (service or '') + ' ' + (det or ''))
    modele = ' - '.join(x for x in [act_devis, det.capitalize() if det else None] if x) or None
    notes = ' · '.join(x for x in [
        ("Offre : " + r["Type d'offre"]) if txt(r["Type d'offre"]) else None,
        ("Passages : " + str(r['Nb de passages'])) if txt(r['Nb de passages']) else None,
        ("Remise Hygisoft : " + str(r['Remise']) + ' %') if num(r['Remise']) else None,
        ("Mandataire : " + txt(r['Mandataire'])) if txt(r['Mandataire']) else None] if x) or None
    dec = dt(r['Date de decision'])
    dev_rows.append({k: v for k, v in {
        'reference': txt(r['N° devis']), 'agence_id': AG[st][0], 'source_logiciel': 'Hygisoft', 'source_id': PFX + txt(r['N° devis']),
        'source_client_code': code, 'client_nom': txt(r['Client']), 'client_adresse': txt(r['Adresse client']),
        'client_cp': txt(r['CP client']), 'client_commune': txt(r['Ville client']),
        'statut': etat, 'status': STATUS.get(etat, 'brouillon'), 'activite': act_devis,
        'modele_devis': modele, 'montant_ht': ht, 'taux_tva': tx, 'montant_tva': tva, 'montant_ttc': round(ht + tva, 2),
        'date_devis': dt(r['Date']), 'date_creation': dt(r['Date']), 'date_commande': dec if etat == 'Accord' else None,
        'nom_chantier': txt(r['Nom adresse interv.']), 'adresse_chantier': txt(r["Adresse d'intervention"]),
        'code_postal_chantier': txt(r["CP d'intervention"]), 'ville_chantier': txt(r["Ville d'intervention"]),
        'cree_par': vend(r['Représentant']), 'notes': notes, 'source_file': f'{DATE} - {TAG} - Liste des devis.xlsx',
    }.items() if v is not None})
json.dump({'table': 'devis', 'rows': dev_rows}, open(OUT + '/' + TAG + '-3-devis.json', 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
print('devis', len(dev_rows), Counter(x['statut'] for x in dev_rows))

# ---------------------------------------------------------------- contrats
ctr_rows = []
for _, r in ct.iterrows():
    code = txt(r['Code client']); st = client_struct[code]
    lib = (str(r['Libellé']).split('\n')[0] if txt(r['Libellé']) else None)
    ctr_rows.append({k: v for k, v in {
        'reference': txt(r['Code']), 'agence_id': AG[st][0], 'source_logiciel': 'Hygisoft', 'source_id': PFX + txt(r['Code']), 'source_ref': txt(r['Code']),
        'source_client_code': code, 'source_vendeur': vend(r['Représentant']), 'type_contrat': txt(r['Type']),
        'activite': activite(r['Nature'], txt(r['Service']) or '', (str(r['Libellé']).split('\n')[0] if (HDA or VHP) and txt(r['Libellé']) else None)),
        'service_libelle': txt(lib), 'montant': num(r['Montant']), 'acompte': num(r['Acompte']),
        'date_debut': dt(r['Du']), 'date_fin': dt(r['Au']), 'date_creation': dt(r['Créé le']), 'date_resiliation': dt(r['Date résiliation']),
        'duree_annees': num(r['Durée en année']), 'nb_visites': int(float(r['Nbre visite'])) if txt(r['Nbre visite']) else None,
        'adresse_intervention': txt(r["Adresse d'intervention"]), 'code_postal_intervention': txt(r['CP']), 'ville_intervention': txt(r['Ville']),
        'secteur': txt(r['Secteur contrat']) or txt(r['Secteur adresse']), 'source_file': f'{DATE} - {TAG} - Liste des contrats.xlsx',
    }.items() if v is not None})
json.dump({'table': 'contrats', 'rows': ctr_rows}, open(OUT + '/' + TAG + '-2-contrats.json', 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
print('contrats', len(ctr_rows), Counter(x['activite'] for x in ctr_rows).most_common(12))

# correspondances activité -> famille à ajouter dans activites_familles
for f in os.listdir(OUT): print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'Ko')
