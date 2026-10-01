// Référentiel commun de la base clients (data lake) :
// - liste des segments clients
// - correspondance code NAF / nature juridique -> segment
// - détection des groupes clients (enseignes, réseaux, bailleurs...)
// - rapprochement d'un client avec les résultats de l'API recherche-entreprises (SIRET)
// Utilisable dans le navigateur (window.CLIENTS_REF) et dans Node (module.exports) pour les tests.
(function(root){

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
  if(d2 === 84 || d2 === 85 || d2 === 91 || d2 === 99) return 'Services publics';
  return null;
}

// Segment final d'un client rapproché d'une entreprise : les mots-clés très spécifiques
// (habitat social, entité PCP) priment, puis le code NAF ; à défaut on garde l'existant.
function segmentForCompany(names, naf, natureJuridique){
  const n = norm(names.join(' '));
  if(DIVISION_PCP_RX.test(n)) return 'Division PCP';
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

function nameTokens(s){
  return norm(s).split(' ').filter(t => t && !LEGAL_FORMS.has(t) && !STOP.has(t));
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
      let loc = 0;
      if(cp && etab.code_postal === cp) loc = 25;
      else if(cp && dept(etab.code_postal) === dept(cp)) loc = 10;
      const actif = (etab.etat_administratif || company.etat_administratif) !== 'F';
      const score = Math.round(70 * sim + loc + (actif ? 5 : -10));
      out.push({
        score, sim: Math.round(sim * 100) / 100, memeCp: loc === 25,
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

// Décision automatique.
//  - professionnel : trouvé si nom très proche (>= 80 %) ET même code postal, nettement
//                    devant le 2e candidat (ou même SIREN) ; à vérifier si score >= 55 ;
//                    sinon introuvable.
//  - a_determiner (nom qui ressemble à un patronyme) : on ne retient une entreprise que si
//    c'est une personne morale au nom quasi identique dans la même zone ; sinon particulier.
function decide(client, candidates){
  const best = candidates[0], second = candidates[1];
  const top3 = candidates.slice(0, 3).map(c => ({
    siret: c.siret, nom: c.nom, enseigne: c.enseigne, adresse: c.adresse, code_postal: c.code_postal,
    naf: c.naf, nature_juridique: c.nature_juridique, etat: c.etat, score: c.score
  }));
  if(client.type_client === 'a_determiner'){
    const pm = best && !String(best.nature_juridique || '').startsWith('1');
    if(pm && best.sim >= 0.9 && best.memeCp) return { statut: 'trouve', match: best, type: 'professionnel', candidats: null };
    if(pm && best.sim >= 0.8 && best.score >= 80) return { statut: 'a_verifier', match: null, type: 'a_determiner', candidats: top3 };
    return { statut: 'non_applicable', match: null, type: 'particulier', candidats: null };
  }
  if(!best) return { statut: 'introuvable', match: null, candidats: null };
  const clearLead = !second || second.siren === best.siren || (best.score - second.score) >= 8;
  const noCp = !(client.code_postal || '').trim();
  const homonymes = candidates.filter(c => c.sim >= 0.95 && c.siren !== best.siren).length;
  if(clearLead && best.sim >= 0.8 && best.memeCp) return { statut: 'trouve', match: best, candidats: null };
  if(clearLead && noCp && best.sim >= 0.95 && !homonymes) return { statut: 'trouve', match: best, candidats: null };
  if(best.score >= 55) return { statut: 'a_verifier', match: null, candidats: top3 };
  return { statut: 'introuvable', match: null, candidats: top3.length ? top3 : null };
}

// Requête de recherche : nom normalisé complet (l'API gère elle-même les formes juridiques).
function searchQuery(nom){
  const q = norm(nom).slice(0, 100);
  return q.replace(/\s/g, '').length >= 3 ? q : null;
}

const API = { SEGMENTS, norm, segmentFromNaf, segmentForCompany, detectGroup, nameSimilarity, scoreCandidates, decide, searchQuery, dept };
if(typeof module !== 'undefined' && module.exports) module.exports = API;
else root.CLIENTS_REF = API;

})(typeof window !== 'undefined' ? window : globalThis);
