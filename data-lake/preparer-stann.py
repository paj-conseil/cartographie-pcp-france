#!/usr/bin/env python3
# Prépare les fichiers d'import SERVIGECO (export du logiciel Stann (autre que Hygisoft) : identifiants UUID) pour « Base clients > Importer ».
# Usage : python3 preparer-stann.py <dossier des 5 exports .xlsx> <dossier de sortie>
# Fichiers attendus : clients, contrats, devis, factures, paiements (le nom du fichier contient ce mot).
import pandas as pd, json, re, sys, subprocess, os, glob, io, zipfile
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segmentation import norm, txt, segment_pour, siret_ok

SRC = sys.argv[1].rstrip('/') + '/'
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
AGENCE, ENTITE, LOGICIEL = 'ec767196-aa99-4437-a7c8-bc0f13ac37d4', 'SERVIGECO', 'Stann'
DATE = None

def rd(name):
    global DATE
    cand = sorted(glob.glob(SRC + '*' + name + '*.xlsx'))
    if not cand: raise SystemExit('Fichier introuvable : *' + name + '*.xlsx dans ' + SRC)
    f = cand[-1]
    m = re.match(r'(\d{4}\.\d{2}\.\d{2})', os.path.basename(f).split('-', 1)[-1]) or re.search(r'(\d{4}\.\d{2}\.\d{2})', os.path.basename(f))
    if m and not DATE: DATE = m.group(1)
    zi = zipfile.ZipFile(f); buf = io.BytesIO(); zo = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED)
    for i in zi.infolist():
        d = zi.read(i.filename)
        if i.filename == 'xl/styles.xml': d = d.replace(b'biltinId', b'builtinId')
        zo.writestr(i, d)
    zo.close(); buf.seek(0)
    return pd.read_excel(buf, dtype=str)

cl, ct, dv, fa, pa = rd('clients'), rd('contrats'), rd('devis'), rd('factures'), rd('paiements')
DATE = DATE or '0000.00.00'

def num(v):
    try:
        x = float(v)
        return None if x != x else round(x, 2)
    except Exception:
        return None

def dt(v):
    s = txt(v)
    return s[:10] if s and re.match(r'\d{4}-\d{2}-\d{2}', s) else None

def dump(path, obj):
    json.dump(obj, open(path, 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)

# ---------------------------------------------------------------- activités
def act_texte(t):
    t = norm(t)
    if not t: return None
    d, s = 'DERAT' in t, 'DESINS' in t or 'DESINSECT' in t
    if d and s: return 'Dératisation - Désinsectisation'
    if d: return 'Dératisation'
    if s: return 'Désinsectisation'
    if 'HOTTE' in t: return 'Hottes'
    if re.search(r'\bDEIV\b', t): return "Entretien d'appareils"
    if 'DESINFECT' in t: return 'Désinfection'
    if 'PUNAISE' in t: return 'Punaises de lit'
    if 'AUDIT' in t or 'CONTROLE' in t: return 'Audit et expertise'
    if 'VMC' in t or re.search(r'\b(CTA|CLIM|BAC|VO)\b', t): return 'Nettoyage'
    if 'LIVRAISON' in t: return 'Livraison de produits'
    return None

# ---------------------------------------------------------------- clients
cl['nom_c'] = cl['name'].map(txt)
tmp = os.path.join(OUT, '_names.json')
json.dump([{'nom': x or ''} for x in cl['nom_c']], open(tmp, 'w'))
subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'groupes-clients.js'), tmp, tmp + '.out'], check=True)
grp = json.load(open(tmp + '.out')); os.remove(tmp); os.remove(tmp + '.out')
cl['siret_n'] = cl['siret'].map(siret_ok)
cl['cp_f'] = cl['billing_place_postal_code'].fillna(cl['place_postal_code'])
part = cl.dropna(subset=['siret_n']).groupby('siret_n')['cp_f'].nunique()
partages = set(part[part >= 3].index)
compte = dict(zip(cl['id'], cl['accounting_account_number']))

rows, seg_stats, type_stats = [], Counter(), Counter()
for i, r in cl.iterrows():
    nom = r['nom_c'] or ('Client ' + r['id'][:8])
    pers = r['type'] == 'person'
    seg, src, tcl, motif_nom = ('b2c', 'b2c', 'particulier', None) if pers else segment_pour(nom, None, None)
    if tcl == 'particulier' and not pers: pass
    if grp[i]['div'] and not pers: seg, src = 'division_pcp', 'mot_cle'
    motif = 'Stann : ' + (r['type'] or 'client') if not motif_nom else motif_nom
    s = r['siret_n'] if isinstance(r['siret_n'], str) else None
    partage = None
    if tcl == 'particulier': statut, s = 'non_applicable', None
    elif s and s in partages: statut, partage, s = 'a_rechercher', s, None
    elif s: statut = 'manuel'
    else: statut = 'a_rechercher'
    notes = []
    pn = txt(r['parent_name'])
    if pn and norm(pn) != norm(nom): notes.append("Donneur d'ordre (Stann) : " + pn)
    adr = txt(r['billing_place_street_address']) or txt(r['place_street_address'])
    row = {
        'entite': ENTITE, 'source_logiciel': LOGICIEL, 'source_code_client': r['id'], 'raison_sociale': nom,
        'adresse': adr, 'code_postal': txt(r['cp_f']), 'ville': txt(r['billing_place_address_locality']) or txt(r['place_address_locality']), 'pays': 'FR',
        'type_client': tcl, 'agence_source': 'societe', 'societe_source': ENTITE,
        'source_fichier': f'{DATE} - SERVIGECO - Liste des clients.xlsx', 'siret': s, 'siret_statut': statut,
        'code_naf': txt(r['nafCode']),
        'segment_code': seg, 'segment_source': src, 'classification_motif': motif,
        'groupe_client': grp[i]['g'] if not pers else None, 'groupe_source': 'mot_cle' if (grp[i]['g'] and not pers) else None,
        'notes': ' | '.join(notes) or None,
    }
    if partage:
        row['siret_candidats'] = [{'siret': partage, 'nom': 'SIRET du fichier source, partagé par plusieurs clients', 'source': 'fichier', 'score': None}]
    rows.append({k: v for k, v in row.items() if v is not None})
    seg_stats[seg] += 1; type_stats[tcl] += 1
dump(OUT + '/SERVIGECO-1-clients.json', rows)
print('clients', len(rows), dict(type_stats)); print(dict(seg_stats))

# ---------------------------------------------------------------- contrats
def ctr_ref(name):
    m = re.match(r'^([A-Z]?\d+(?:-\d+)?)(?:-(.*))?$', txt(name) or '')
    return (m.group(1), m.group(2)) if m else (txt(name), None)
ctr_act, ctr_by_ref, ctr_by_client = {}, {}, defaultdict(Counter)
ctr_rows = []
for _, r in ct.iterrows():
    ref, suffixe = ctr_ref(r['name'])
    act = act_texte(suffixe or r['name']) or 'Divers'
    ctr_act[r['id']] = act; ctr_by_ref.setdefault(ref, r['id']); ctr_by_client[r['customer_id']][act] += 1
    duree = num(r['duration']) if r['duration_unit'] == 'YEARS' else (round(num(r['duration']) / 12, 2) if num(r['duration']) and r['duration_unit'] == 'MONTHS' else None)
    ctr_rows.append({k: v for k, v in {
        'reference': ref, 'agence_id': AGENCE, 'source_logiciel': LOGICIEL, 'source_id': r['id'], 'source_ref': txt(r['name']),
        'source_client_code': r['customer_id'], 'type_contrat': txt(r['renewal_type']), 'activite': act, 'service_libelle': suffixe,
        'date_debut': dt(r['begins_on']), 'date_fin': dt(r['ends_on']), 'date_creation': dt(r['created_at']),
        'duree_annees': duree, 'source_file': f'{DATE} - SERVIGECO - Liste des contrats.xlsx',
    }.items() if v is not None})
dump(OUT + '/SERVIGECO-2-contrats.json', {'table': 'contrats', 'rows': ctr_rows})
print('contrats', len(ctr_rows), Counter(x['activite'] for x in ctr_rows).most_common(8))
def act_client(cid):
    c = ctr_by_client.get(cid)
    return c.most_common(1)[0][0] if c else None

# ---------------------------------------------------------------- factures (hors brouillons)
fa_ok = fa[fa['state'] != 'DRAFT'].reset_index(drop=True)
pay_sum = pa.assign(m=pa['amount'].map(lambda v: num(v) or 0)).groupby('invoice_id')['m'].sum().round(2).to_dict()
STATUT = {'PAID': 'Payée', 'LATE': 'En retard', 'WAITING_FOR_PAYMENT': 'En attente de paiement'}
dv_fact = {}   # devis -> première date de facture
for _, r in fa_ok.iterrows():
    q = txt(r['quotation_id']); d = dt(r['issued_at'])
    if q and d and (q not in dv_fact or d < dv_fact[q]): dv_fact[q] = d
dv_act = {}
for _, r in dv.iterrows():
    dv_act[r['id']] = act_texte(r['subject']) or act_texte(r['memo']) or act_client(r['customer_id'])

def lieu(a):
    a = txt(a)
    if not a: return None, None, None
    m = re.match(r'^(.*?)\s*(\d{5})\s+(.+?)(?:,\s*France)?$', str(a).replace('\r', '').replace('\n', ' '))
    return (txt(m.group(1)), m.group(2), txt(m.group(3))) if m else (txt(a), None, None)

fac_rows = []
for _, r in fa_ok.iterrows():
    ht, tva, ttc = num(r['total_amount']), num(r['amount_of_tax']), num(r['total_amount_including_tax'])
    regle = num(r['total_amount_paid'])
    if regle is None: regle = pay_sum.get(r['id'], 0)
    avoir = num(r['total_credit_note_amount_including_tax']) or 0
    solde = round((ttc or 0) - regle - avoir, 2)
    cref = re.match(r'^([A-Z]?\d+(?:-\d+)?)', txt(r['contract_reference']) or '')
    cid = ctr_by_ref.get(cref.group(1)) if cref else None
    q = txt(r['quotation_id'])
    act = act_texte(r['subject']) or (ctr_act.get(cid) if cid else None) or (dv_act.get(q) if q else None) or act_client(r['customer_id'])
    adr, cp, ville = lieu(r['delivery_address'] if txt(r['delivery_address']) else r['address'])
    soldee = r['state'] == 'PAID'
    fac_rows.append({k: v for k, v in {
        'reference': txt(r['reference']), 'agence_id': AGENCE, 'source_logiciel': LOGICIEL, 'source_id': r['id'],
        'source_client_code': r['customer_id'], 'source_contrat_code': cid, 'source_devis_code': q, 'client_nom': txt(r['customer_name']),
        'client_compte': txt(compte.get(r['customer_id'])),
        'montant_ht': ht, 'montant_tva': tva, 'montant_ttc': ttc, 'montant_regle': regle, 'solde': solde, 'soldee': soldee,
        'statut': STATUT.get(r['state'], r['state']), 'statut_paiement': 'paid' if soldee else ('partial' if regle > 0 else 'not_paid'),
        'date_facture': dt(r['issued_at']), 'date_echeance': dt(r['due_at']),
        'activite': act, 'prestation': txt(r['subject']),
        'adresse_chantier': adr, 'code_postal_chantier': cp, 'ville_chantier': ville,
        'vendeur': txt(r['owner_name']), 'societe_source': ENTITE, 'entite_source': ENTITE,
        'source_file': f'{DATE} - SERVIGECO - Liste des factures.xlsx',
    }.items() if v is not None})
par_an = defaultdict(list)
for x in fac_rows: par_an[(x.get('date_facture') or '0000')[:4]].append(x)
groupes = [('2022-2023', '2022', '2023'), ('2024', '2024', '2024'), ('2025', '2025', '2025'), ('2026', '2026', '2026')]
for nom, a, z in groupes:
    pr = [x for x in fac_rows if a <= (x.get('date_facture') or '0000')[:4] <= z]
    dump(OUT + f'/SERVIGECO-4-factures-{nom}.json', {'table': 'factures', 'rows': pr})
print('factures', len(fac_rows), 'brouillons ignorés', len(fa) - len(fa_ok), 'activités', Counter(x.get('activite') for x in fac_rows).most_common(8),
      'liées contrat', sum(1 for x in fac_rows if x.get('source_contrat_code')), 'liées devis', sum(1 for x in fac_rows if x.get('source_devis_code')))

# ---------------------------------------------------------------- devis
dev_rows = []
for _, r in dv.iterrows():
    ht, tva, ttc = num(r['total_amount']) or 0, num(r['amount_of_tax']) or 0, num(r['total_amount_including_tax']) or 0
    facture = r['id'] in dv_fact
    dev_rows.append({k: v for k, v in {
        'reference': txt(r['reference']), 'agence_id': AGENCE, 'source_logiciel': LOGICIEL, 'source_id': r['id'],
        'source_client_code': r['customer_id'], 'client_nom': txt(r['customer_name']),
        'statut': 'Accord' if facture else 'En attente', 'status': 'accepte' if facture else 'envoye', 'activite': dv_act.get(r['id']),
        'montant_ht': ht, 'taux_tva': round(100 * tva / ht, 1) if ht else 20, 'montant_tva': tva, 'montant_ttc': ttc,
        'date_devis': dt(r['created_at']), 'date_creation': dt(r['created_at']), 'date_commande': dv_fact.get(r['id']),
        'objet': txt(r['subject']), 'cree_par': txt(r['owner_name']), 'notes': txt(r['memo']),
        'source_file': f'{DATE} - SERVIGECO - Liste des devis.xlsx',
    }.items() if v is not None})
dump(OUT + '/SERVIGECO-3-devis.json', {'table': 'devis', 'rows': dev_rows})
print('devis', len(dev_rows), Counter(x['status'] for x in dev_rows), 'activité renseignée', sum(1 for x in dev_rows if x.get('activite')))

# ---------------------------------------------------------------- paiements
MODE = {'TRANSFER': 'Virement', 'CHECK': 'Chèque', 'CASH': 'Espèces', 'CANCELED': 'Annulation', 'CUSTOMER_BALANCE': 'Solde client', 'DEBIT': 'Prélèvement'}
pay_rows = []
for _, r in pa.iterrows():
    pay_rows.append({k: v for k, v in {
        'agence_id': AGENCE, 'source_logiciel': LOGICIEL, 'source_id': r['id'], 'source_facture_id': r['invoice_id'],
        'facture_reference': txt(r['invoice_reference']), 'source_client_code': r['customer_id'], 'client_nom': txt(r['customer_name']),
        'mode': MODE.get(r['method'], r['method']), 'montant': num(r['amount']), 'date_paiement': dt(r['paidAt']),
        'banque': txt(r['bank_name']), 'note': txt(r['note']), 'source_file': f'{DATE} - SERVIGECO - Liste des paiements.xlsx',
    }.items() if v is not None})
dump(OUT + '/SERVIGECO-5-paiements.json', {'table': 'paiements', 'rows': pay_rows})
print('paiements', len(pay_rows), Counter(x.get('mode') for x in pay_rows))
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'Ko')
