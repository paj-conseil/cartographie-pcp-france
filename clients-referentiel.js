// Référentiel commun de la base clients (data lake) :
// - liste des segments clients
// - correspondance code NAF / nature juridique -> segment
// - détection des groupes clients (enseignes, réseaux, bailleurs...)
// - rapprochement d'un client avec les résultats de l'API recherche-entreprises (SIRET)
// Utilisable dans le navigateur (window.CLIENTS_REF) et dans Node (module.exports) pour les tests.
(function(root){

// Codes de la table client_segments (Supabase) pour chaque segment calculé ci-dessous.
const CODE_BY_LABEL = {
  'Industrie agroalimentaire': 'agroalim', 'Industrie pharmaceutique': 'pharma', 'Santé': 'sante',
  'Agriculture': 'agriculture', 'Distribution alimentaire': 'distrib_alim', 'Distribution non alimentaire': 'distrib_non_alim',
  'Horeca': 'chr', 'Construction': 'construction', 'Logistique': 'logistique',
  'Gestion immobilier & bureaux': 'gestion_immo', 'Services publics': 'secteur_public', 'Habitat social': 'habitat_social',
  'Infrastructure (rail, construction)': 'infrastructures', 'B2C Particuliers': 'b2c', 'Division PCP': 'division_pcp'
};
function segmentCode(label){ return label ? (CODE_BY_LABEL[label] || null) : null; }

const SEGMENTS = [
  'Industrie agroalimentaire', 'Industrie pharmaceutique', 'Santé', 'Agriculture',
  'Distribution alimentaire', 'Distribution non alimentaire', 'Horeca', 'Construction',
  'Logistique', 'Gestion immobilier & bureaux', 'Services publics', 'Habitat social',
  'Infrastructure (rail, construction)', 'B2C Particuliers', 'Division PCP'
];

function norm(s){
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Segment à partir du code NAF (ex : "68.32A") et de la nature juridique INSEE
// (ex : "7210" = commune). Renvoie null si aucun segment de la liste ne convient
// (ex : industrie manufacturière hors agroalimentaire / pharmacie).
// ---------------------------------------------------------------------------
const HLM_NATURES = ['5546', '5547', '5646', '5647', '7364']; // SA d'HLM, coop HLM, OPH
// Établissements scolaires et OGEC : toujours « Secteur public & établissements scolaires »
const SCOLAIRE_RX = /(^|\s)(O ?G ?E ?C|ECOLE|COLLEGE|LYCEE|GROUPE SCOLAIRE|ENSEMBLE SCOLAIRE|UNIVERSITE|IUT|CFA|MFR|MAISON FAMILIALE RURALE|RESTAURANT SCOLAIRE|CANTINE SCOLAIRE|INTERNAT|MATERNELLE|ELEMENTAIRE)(\s|$)/;
const PAS_SCOLAIRE_RX = /\b(AUTO ?ECOLE|ECOLE DE CONDUITE|ECOLE DE DANSE|ECOLE DE MUSIQUE|ECOLE DE GOLF|ECOLE DE VOILE|ECOLE DE SURF|SCI|SDC|SYNDIC)\b/;
const HABITAT_SOCIAL_RX = /\b(HLM|HABITAT|LOGEMENT SOCIAL|PODELIHA|SOCLOVA|VILOGIA|ADOMA|OFFICE PUBLIC)\b/;
const DIVISION_PCP_RX = /\b(AADS|SAPA|AVILIA|HYGIENE GLOBAL SERVICES|SERVIGECO|ENVIRONNEMENT SERVICES|PEST CONTROL PARTNERSHIP|HDA BOURGOGNE|SADED|HYGIENE URBAINE|BORDEAUX TERMITES|PARAXILOCENTRE|TERMICAP|KRISTAL TRAITEMENT|ESBH|EGM GAMA)\b/;

function segmentFromNaf(naf, natureJuridique){
  const nj = String(natureJuridique || '');
  if(HLM_NATURES.includes(nj)) return 'Habitat social';
  if(nj.startsWith('7')) return 'Services publics'; // personnes morales de droit public
  const c = String(naf || '').replace(/\./g, '').toUpperCase();
  if(!c) return null;
  const d2 = parseInt(c.slice(0, 2), 10);
  const c3 = c.slice(0, 3), c4 = c.slice(0, 4);
  if(d2 >= 1 && d2 <= 3) return 'Agriculture';
  if(c === '1071C' || c === '1071D') return 'Distribution alimentaire'; // boulangerie / pâtisserie artisanale
  if(d2 === 10 || d2 === 11) return 'Industrie agroalimentaire';
  if(d2 === 21 || c4 === '4646') return 'Industrie pharmaceutique';
  if(d2 >= 35 && d2 <= 39) return 'Infrastructure (rail, construction)';
  if(d2 === 42) return 'Infrastructure (rail, construction)';
  if(d2 === 41 || d2 === 43) return 'Construction';
  if(d2 === 45) return 'Distribution non alimentaire';
  if(d2 === 46){
    if(c3 === '462') return 'Agriculture';
    if(c3 === '463') return 'Distribution alimentaire';
    return 'Distribution non alimentaire';
  }
  if(d2 === 47){
    if(c4 === '4711' || c3 === '472' || c4 === '4781') return 'Distribution alimentaire';
    return 'Distribution non alimentaire';
  }
  if(d2 === 49){
    if(c3 === '491' || c3 === '492' || c3 === '495') return 'Infrastructure (rail, construction)';
    return 'Logistique';
  }
  if(d2 === 50 || d2 === 51 || d2 === 53) return 'Logistique';
  if(d2 === 52){
    if(c4 === '5221' || c4 === '5222' || c4 === '5223') return 'Infrastructure (rail, construction)';
    return 'Logistique';
  }
  if(d2 === 55 || d2 === 56) return 'Horeca';
  if(c === '7111Z' || c === '7112B') return 'Construction';
  if(d2 === 75 || (d2 >= 86 && d2 <= 88)) return 'Santé';
  if(d2 === 68 || (d2 >= 58 && d2 <= 74) || (d2 >= 77 && d2 <= 82)) return 'Gestion immobilier & bureaux';
  if(d2 === 85) return ['851', '852', '853', '854'].includes(c3) ? 'Services publics' : null;  // enseignement scolaire et supérieur ; pas la formation continue, le sport, la culture, l'auto-école
  if(d2 === 84 || d2 === 91 || d2 === 99) return 'Services publics';
  return null;
}

// Segment final d'un client rapproché d'une entreprise : les mots-clés très spécifiques
// (habitat social, entité PCP) priment, puis le code NAF ; à défaut on garde l'existant.
function segmentForCompany(names, naf, natureJuridique){
  const n = norm(names.join(' '));
  if(DIVISION_PCP_RX.test(n)) return 'Division PCP';
  const tete = norm(String(names[0] || '').split(',')[0]);
  if(SCOLAIRE_RX.test(tete) && !PAS_SCOLAIRE_RX.test(tete)) return 'Services publics';
  if(/(^|\s)(BOULANGERIE|BOULANGERIES|BOULANGER PATISSIER|PANETERIE|FOURNIL)(\s|$)/.test(tete)) return 'Distribution alimentaire';
  const fromNaf = segmentFromNaf(naf, natureJuridique);
  if(HABITAT_SOCIAL_RX.test(n) && (fromNaf === 'Gestion immobilier & bureaux' || fromNaf === 'Services publics' || HLM_NATURES.includes(String(natureJuridique||'')))) return 'Habitat social';
  return fromNaf;
}

// ---------------------------------------------------------------------------
// Groupes clients : enseignes et réseaux reconnus dans le nom, l'enseigne ou la
// raison sociale. Compléter la liste au fil des imports.
// ---------------------------------------------------------------------------
const GROUPS = [
  ['Carrefour', /\bCARREFOUR\b/], ['E.Leclerc', /\b(E LECLERC|LECLERC)\b/], ['Intermarché (Les Mousquetaires)', /\b(INTERMARCHE|BRICOMARCHE|NETTO|ROADY)\b/],
  ['Système U', /\b(SUPER U|HYPER U|U EXPRESS|MARCHE U|SYSTEME U)\b/], ['Lidl', /\bLIDL\b/], ['Aldi', /\bALDI\b/], ['Auchan', /\bAUCHAN\b/],
  ['Casino', /\b(CASINO|SPAR|VIVAL|FRANPRIX|MONOPRIX|LEADER PRICE)\b/], ['Biocoop', /\bBIOCOOP\b/], ['Grand Frais', /\bGRAND FRAIS\b/],
  ["McDonald's", /\b(MC DONALD|MCDONALD|MCDONALDS)\b/], ['Burger King', /\bBURGER KING\b/], ['KFC', /\bKFC\b/], ['Buffalo Grill', /\bBUFFALO GRILL\b/],
  ['Sodexo', /\bSODEXO\b/], ['Elior', /\bELIOR\b/], ['Compass', /\bCOMPASS\b/], ['API Restauration', /\bAPI RESTAURATION\b/],
  ['Podeliha', /\bPODELIHA\b/], ['Angers Loire Habitat', /\bANGERS LOIRE HABITAT\b/], ['Maine-et-Loire Habitat', /\bMAINE ET LOIRE HABITAT\b/], ['Saumur Habitat', /\bSAUMUR HABITAT\b/], ['Soclova', /\bSOCLOVA\b/],
  ['Angers Loire Métropole', /\bANGERS LOIRE METROPOLE\b/], ["Ville d'Angers", /\b(MAIRIE D ANGERS|VILLE D ANGERS|COMMUNE D ANGERS)\b/],
  ['Foncia', /\bFONCIA\b/], ['Nexity', /\bNEXITY\b/], ['Citya', /\bCITYA\b/], ['Orpi', /\bORPI\b/], ['Century 21', /\bCENTURY 21\b/], ['Square Habitat', /\bSQUARE HABITAT\b/], ['Sergic', /\bSERGIC\b/], ['Laforêt', /\bLAFORET\b/], ['Guy Hoquet', /\bGUY HOQUET\b/],
  ['SNCF', /\bSNCF\b/], ['La Poste', /\bLA POSTE\b/], ['Veolia', /\bVEOLIA\b/], ['Suez', /\bSUEZ\b/], ['Saur', /\bSAUR\b/], ['Enedis', /\bENEDIS\b/], ['EDF', /\bEDF\b/], ['Keolis', /\bKEOLIS\b/],
  ['Clariane (Korian)', /\b(KORIAN|CLARIANE)\b/], ['Emeis (Orpea)', /\b(ORPEA|EMEIS)\b/], ['DomusVi', /\bDOMUSVI\b/], ['ADMR', /\bADMR\b/], ['Croix-Rouge', /\bCROIX ROUGE\b/], ['VYV', /\bVYV\b/],
  ['Crédit Agricole', /\bCREDIT AGRICOLE\b/], ['Crédit Mutuel', /\bCREDIT MUTUEL\b/], ["Caisse d'Épargne", /\bCAISSE D EPARGNE\b/], ['BNP Paribas', /\bBNP\b/], ['Groupama', /\bGROUPAMA\b/],
  ['Lactalis', /\b(LACTALIS|BRIDEL)\b/], ['Terrena', /\bTERRENA\b/], ['LDC', /\b(LDC|MAITRE COQ)\b/], ['ArcelorMittal', /\bARCELOR\b/], ['Vinci', /\b(VINCI|ACTEMIUM|COFIROUTE|SOGEA|EUROVIA)\b/],
  ['Bouygues', /\bBOUYGUES\b/], ['Eiffage', /\bEIFFAGE\b/], ['Saint-Gobain', /\b(SAINT GOBAIN|POINT P|LAPEYRE|CEDEO)\b/], ['Leroy Merlin', /\bLEROY MERLIN\b/], ['Castorama', /\bCASTORAMA\b/],
  ['Gamm Vert', /\bGAMM VERT\b/], ['Jardiland', /\bJARDILAND\b/], ['Truffaut', /\bTRUFFAUT\b/], ['Decathlon', /\bDECATHLON\b/], ['Accor', /\b(IBIS|NOVOTEL|MERCURE)\b/], ['Campanile', /\bCAMPANILE\b/], ['B&B Hotels', /\bB B HOTEL\b/]
];

function detectGroup(texts){
  const n = norm((texts || []).filter(Boolean).join(' | '));
  for(const [label, rx] of GROUPS){ if(rx.test(n)) return label; }
  return null;
}

// ---------------------------------------------------------------------------
// Rapprochement client <-> API recherche-entreprises
// ---------------------------------------------------------------------------
const LEGAL_FORMS = new Set('SARL SAS SASU SA EURL SNC SCP SELARL SELAS SCM SCEA EARL GAEC SCI SCA EI EIRL STE SOCIETE ETS ETABLISSEMENTS'.split(' '));
const STOP = new Set('LE LA LES L DE DU DES D ET A AU AUX EN SUR'.split(' '));

const NAME_ABBR = { CC: ['CENTRE', 'COMMERCIAL'], CCIAL: ['COMMERCIAL'], ST: ['SAINT'], STE: ['SAINTE'], STES: ['SAINTES'], STS: ['SAINTS'] };
function nameTokens(s){
  return norm(s).split(' ').filter(t => t && !LEGAL_FORMS.has(t) && !STOP.has(t))
    .reduce((acc, t) => acc.concat(NAME_ABBR[t] || [t]), []);
}
// Adresse d'un tiers (« C/O CPG… », « chez… ») : ce n'est pas l'adresse du client lui-même
function isTiersAddress(adr){ return /(^|\s)(C\s?\/\s?O|C\.O\.|CHEZ|AUX BONS SOINS DE)(\s|$)/i.test(String(adr || '')); }
// SIREN suggéré par le fichier source (SIRET d'un siège ou d'un autre magasin, mis de côté)
function sirenIndice(client){
  const h = (client.siret_candidats || []).find(c => c && c.source === 'fichier' && c.siret);
  return h ? String(h.siret).slice(0, 9) : null;
}
function bigrams(s){
  const out = [];
  for(let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
function diceBigrams(a, b){
  if(!a || !b) return 0;
  if(a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if(!A.length || !B.length) return 0;
  const m = new Map();
  A.forEach(x => m.set(x, (m.get(x) || 0) + 1));
  let inter = 0;
  B.forEach(x => { const c = m.get(x); if(c){ inter++; m.set(x, c - 1); } });
  return 2 * inter / (A.length + B.length);
}
// Similarité de deux noms (0..1) : tolère l'ordre des mots, les formes juridiques,
// la ponctuation ("HEMP.IT" = "HEMP IT") et un nom client inclus dans un nom plus long.
function nameSimilarity(clientName, candidateName){
  const a = nameTokens(clientName), b = nameTokens(candidateName);
  if(!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0; sa.forEach(t => { if(sb.has(t)) inter++; });
  const dice = 2 * inter / (sa.size + sb.size);
  const contained = inter === sa.size ? (sa.size >= 2 ? 0.92 : 0.8) : 0; // tous les mots du client sont dans le candidat
  const compact = diceBigrams(a.join(''), b.join('')) * 0.95;
  return Math.max(dice, contained, compact);
}

// ---------------------------------------------------------------------------
// Similarité d'adresse (0..1) : numéro de voie + mots significatifs de la rue.
// L'adresse de l'établissement (API) est de la forme « 27 RUE DE DURTAL 72300 PRECIGNE ».
// ---------------------------------------------------------------------------
const VOIE = new Set('RUE R AV AVE AVENUE BD BOULEVARD BLVD CHEMIN CHE CH ROUTE RTE IMPASSE IMP ALLEE ALL PLACE PL QUAI COURS SQUARE SQ PASSAGE RESIDENCE RES LIEU DIT LD ZA ZI ZAC ZONE PARC LOTISSEMENT LOT BP CS TSA CEDEX BIS TER HAMEAU VOIE SENTIER PROMENADE ESPLANADE FAUBOURG FG'.split(' '));
const ABBR = { ST: 'SAINT', STE: 'SAINTE', GAL: 'GENERAL', GEN: 'GENERAL', MAL: 'MARECHAL', PDT: 'PRESIDENT', DR: 'DOCTEUR', PROF: 'PROFESSEUR', NOTRE: 'NOTRE' };
function addrTokens(s){
  return norm(s).split(' ').filter(Boolean).map(t => ABBR[t] || t);
}
function addressSimilarity(clientAdr, etabAdr, etabCp){
  if(!clientAdr || !etabAdr) return 0;
  let e = norm(etabAdr);
  if(etabCp){ const i = e.lastIndexOf(etabCp); if(i > 0) e = e.slice(0, i); }   // retire CP + ville
  const ct = addrTokens(clientAdr), et = addrTokens(e);
  const words = ct.filter(t => !/^\d/.test(t) && !VOIE.has(t) && !STOP.has(t) && t.length > 1);
  if(!words.length) return 0;
  const eset = new Set(et);
  const hit = words.filter(w => eset.has(w) || et.some(x => x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x)))).length;
  const wsim = hit / words.length;
  const num = (ct.find(t => /^\d+$/.test(t)) || null);
  const enums = et.filter(t => /^\d+$/.test(t));
  const f = !num ? 0.9 : (enums.includes(num) ? 1 : (enums.length ? 0.5 : 0.8));
  return Math.round(wsim * f * 100) / 100;
}

function candidateNames(company, etab){
  const names = [company.nom_complet, company.nom_raison_sociale, company.sigle];
  if(etab){
    (etab.liste_enseignes || []).forEach(e => names.push(e));
    if(etab.nom_commercial) names.push(etab.nom_commercial);
  }
  if(company.siege){
    (company.siege.liste_enseignes || []).forEach(e => names.push(e));
  }
  return names.filter(Boolean);
}

function dept(cp){
  if(!cp) return '';
  cp = String(cp);
  if(cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3);
  return cp.slice(0, 2);
}

// Évalue tous les établissements renvoyés par l'API et renvoie les meilleurs candidats triés.
function scoreCandidates(client, results){
  const out = [];
  const cp = (client.code_postal || '').trim();
  (results || []).forEach(company => {
    const etabs = (company.matching_etablissements && company.matching_etablissements.length)
      ? company.matching_etablissements
      : (company.siege ? [company.siege] : []);
    etabs.forEach(etab => {
      if(!etab || !etab.siret) return;
      const names = candidateNames(company, etab);
      const sim = names.reduce((m, n) => Math.max(m, nameSimilarity(client.nom, n)), 0);
      const addr = addressSimilarity(client.adresse, etab.adresse, etab.code_postal);
      let loc = 0;
      if(cp && etab.code_postal === cp) loc = 15;
      else if(cp && dept(etab.code_postal) === dept(cp)) loc = 6;
      const actif = (etab.etat_administratif || company.etat_administratif) !== 'F';
      const score = Math.round(45 * sim + 30 * addr + loc + (actif ? 5 : -10));
      out.push({
        score, sim: Math.round(sim * 100) / 100, addr, memeCp: loc === 15,
        siret: etab.siret, siren: company.siren,
        nom: company.nom_complet || company.nom_raison_sociale || '',
        raison_sociale: company.nom_raison_sociale || company.nom_complet || '',
        enseigne: (etab.liste_enseignes || [])[0] || etab.nom_commercial || null,
        adresse: etab.adresse || '',
        code_postal: etab.code_postal || '',
        naf: etab.activite_principale || company.activite_principale || null,
        nature_juridique: company.nature_juridique || null,
        etat: etab.etat_administratif || company.etat_administratif || null,
        names
      });
    });
  });
  out.sort((x, y) => y.score - x.score);
  // un seul candidat par SIRET
  const seen = new Set();
  return out.filter(c => (seen.has(c.siret) ? false : (seen.add(c.siret), true)));
}

// Décision automatique. Score sur 95 : nom 45 + adresse 30 + même code postal 15 + actif 5.
//  - professionnel : trouvé, dans le même code postal, si le nom est très proche (>= 80 %)
//    OU si l'adresse correspond (>= 85 %) avec un nom au moins en partie commun (>= 40 %),
//    et que le candidat devance nettement le 2e (ou a le même SIREN) ;
//    trouvé aussi quand une seule entreprise active se trouve à l'adresse exacte du client ;
//    à vérifier si le nom ou l'adresse est proche ; sinon introuvable.
//  - a_determiner (nom qui ressemble à un patronyme) : on ne retient qu'une personne morale
//    du même code postal au nom quasi identique, ou au nom proche à la même adresse ;
//    sinon le client est classé particulier.
function decide(client, candidates){
  const best = candidates[0], second = candidates[1];
  const top3 = candidates.slice(0, 3).map(c => ({
    siret: c.siret, nom: c.nom, enseigne: c.enseigne, adresse: c.adresse, code_postal: c.code_postal,
    naf: c.naf, nature_juridique: c.nature_juridique, etat: c.etat, score: c.score
  }));
  if(client.type_client === 'a_determiner'){
    const pm = best && !String(best.nature_juridique || '').startsWith('1');
    if(pm && best.memeCp && (best.sim >= 0.9 || (best.sim >= 0.7 && best.addr >= 0.85))) return { statut: 'trouve', match: best, type: 'professionnel', candidats: null };
    if(pm && best.sim >= 0.8 && best.memeCp) return { statut: 'a_verifier', match: null, type: 'a_determiner', candidats: top3 };
    return { statut: 'non_applicable', match: null, type: 'particulier', candidats: null };
  }
  if(!best) return { statut: 'introuvable', match: null, candidats: null };
  const tiers = isTiersAddress(client.adresse);
  // 1. Établissement de l'entreprise indiquée par le fichier source, dans le code postal du client
  const indice = sirenIndice(client);
  if(indice && !tiers){
    const ici = candidates.filter(c => c.siren === indice && c.memeCp && c.etat !== 'F');
    if(ici.length === 1) return { statut: 'trouve', match: ici[0], candidats: null, motif: 'établissement de l\'entreprise source dans ce code postal' };
    if(ici.length > 1){
      const tri = ici.slice().sort((x, y) => y.addr - x.addr);
      if(tri[0].addr >= 0.6 && tri[0].addr - (tri[1].addr || 0) >= 0.3) return { statut: 'trouve', match: tri[0], candidats: null, motif: 'établissement de l\'entreprise source à cette adresse' };
    }
  }
  // 2. Adresse d'un gestionnaire (C/O…) : seul le nom compte, au niveau national
  if(tiers){
    const proches = candidates.filter(c => c.sim >= 0.9 && c.etat !== 'F');
    if(proches.length && new Set(proches.map(c => c.siren)).size === 1 && best.sim >= 0.9)
      return { statut: 'trouve', match: proches.sort((x, y) => y.score - x.score)[0], candidats: null, motif: 'nom (adresse du gestionnaire)' };
    if(best.sim >= 0.6) return { statut: 'a_verifier', match: null, candidats: candidates.slice(0, 3).map(c => ({ siret: c.siret, nom: c.nom, enseigne: c.enseigne, adresse: c.adresse, code_postal: c.code_postal, naf: c.naf, nature_juridique: c.nature_juridique, etat: c.etat, score: c.score })) };
    return { statut: 'introuvable', match: null, candidats: null };
  }
  const clearLead = !second || second.siren === best.siren || (best.score - second.score) >= 8;
  const noCp = !(client.code_postal || '').trim();
  const homonymes = candidates.filter(c => c.sim >= 0.95 && c.siren !== best.siren).length;
  const fort = best.memeCp && (best.sim >= 0.8 || (best.addr >= 0.85 && best.sim >= 0.4));
  if(clearLead && fort) return { statut: 'trouve', match: best, candidats: null };
  // Une seule entreprise active à cette adresse exacte (même numéro, même rue, même CP) :
  // c'est très probablement le client, même si le nom saisi diffère (sigle, enseigne...).
  const aLAdresse = candidates.filter(c => c.memeCp && c.addr >= 0.95 && c.etat !== 'F' && !String(c.nature_juridique || '').startsWith('1'));
  if(!tiers && aLAdresse.length && new Set(aLAdresse.map(c => c.siren)).size === 1 && best.sim < 0.8){
    return { statut: 'trouve', match: aLAdresse[0], candidats: null, motif: 'seule entreprise à cette adresse' };
  }
  if(clearLead && noCp && best.sim >= 0.95 && !homonymes) return { statut: 'trouve', match: best, candidats: null };
  if(best.sim >= 0.5 || (best.memeCp && best.addr >= 0.85)) return { statut: 'a_verifier', match: null, candidats: top3 };
  return { statut: 'introuvable', match: null, candidats: top3.length ? top3 : null };
}

// Requête de recherche : nom normalisé complet (l'API gère elle-même les formes juridiques).
function searchQuery(nom){
  const q = norm(nom).slice(0, 100);
  return q.replace(/\s/g, '').length >= 3 ? q : null;
}

// Requête par adresse : rue nettoyée (sans complément type BP / CS / CEDEX), si elle contient un nom de voie.
function addressQuery(adresse){
  if(!adresse) return null;
  const first = String(adresse).split(/[,;]/)[0];
  const t = norm(first).split(' ').filter(x => x && !/^(BP|CS|TSA|CEDEX)$/.test(x));
  const mots = t.filter(x => !/^\d/.test(x) && !VOIE.has(x) && !STOP.has(x) && x.length > 1);
  return mots.length ? t.join(' ').slice(0, 80) : null;
}

const API = { SEGMENTS, addressSimilarity, addressQuery, isTiersAddress, sirenIndice, CODE_BY_LABEL, segmentCode, norm, segmentFromNaf, segmentForCompany, detectGroup, nameSimilarity, scoreCandidates, decide, searchQuery, dept };
if(typeof module !== 'undefined' && module.exports) module.exports = API;
else root.CLIENTS_REF = API;

})(typeof window !== 'undefined' ? window : globalThis);
