(function(){

const CONFIG = window.PROSPECTION_CONFIG;
const API_BASE = 'https://recherche-entreprises.api.gouv.fr';
const PER_PAGE = 25;
const MAX_PAGES_PER_GROUP = 4; // limite raisonnable par catégorie NAF (100 résultats)
const MAX_PAGES_LEGAL = 8; // filet de sécurité plus large pour le secteur public (200 résultats bruts avant filtrage)
const CALL_DELAY_MS = 160; // ~6 appels/s, sous la limite de 7/s de l'API

// Activités PCP (mêmes clés que la cartographie et l'admin des priorités)
const ACTIVITIES = ['3D','Termite','ILX','Mérule','Hottes','Humidité','Assainissement','Isolation','Thermique','Fumigation','Portuaire','Toiture'];
const ACTIVITY_SHORT = { 'Toiture':'Façade/Toiture' };

let sb = null;
let priorities = {}; // `${activity}|${segment}` -> 1|2|3
const segmentLabelEls = {}; // segment key -> label DOM element (pour la coloration par priorité)

const DEPARTEMENTS = [
  ['01','Ain'],['02','Aisne'],['03','Allier'],['04','Alpes-de-Haute-Provence'],['05','Hautes-Alpes'],
  ['06','Alpes-Maritimes'],['07','Ardèche'],['08','Ardennes'],['09','Ariège'],['10','Aube'],
  ['11','Aude'],['12','Aveyron'],['13','Bouches-du-Rhône'],['14','Calvados'],['15','Cantal'],
  ['16','Charente'],['17','Charente-Maritime'],['18','Cher'],['19','Corrèze'],['2A','Corse-du-Sud'],
  ['2B','Haute-Corse'],['21','Côte-d\'Or'],['22','Côtes-d\'Armor'],['23','Creuse'],['24','Dordogne'],
  ['25','Doubs'],['26','Drôme'],['27','Eure'],['28','Eure-et-Loir'],['29','Finistère'],
  ['30','Gard'],['31','Haute-Garonne'],['32','Gers'],['33','Gironde'],['34','Hérault'],
  ['35','Ille-et-Vilaine'],['36','Indre'],['37','Indre-et-Loire'],['38','Isère'],['39','Jura'],
  ['40','Landes'],['41','Loir-et-Cher'],['42','Loire'],['43','Haute-Loire'],['44','Loire-Atlantique'],
  ['45','Loiret'],['46','Lot'],['47','Lot-et-Garonne'],['48','Lozère'],['49','Maine-et-Loire'],
  ['50','Manche'],['51','Marne'],['52','Haute-Marne'],['53','Mayenne'],['54','Meurthe-et-Moselle'],
  ['55','Meuse'],['56','Morbihan'],['57','Moselle'],['58','Nièvre'],['59','Nord'],
  ['60','Oise'],['61','Orne'],['62','Pas-de-Calais'],['63','Puy-de-Dôme'],['64','Pyrénées-Atlantiques'],
  ['65','Hautes-Pyrénées'],['66','Pyrénées-Orientales'],['67','Bas-Rhin'],['68','Haut-Rhin'],['69','Rhône'],
  ['70','Haute-Saône'],['71','Saône-et-Loire'],['72','Sarthe'],['73','Savoie'],['74','Haute-Savoie'],
  ['75','Paris'],['76','Seine-Maritime'],['77','Seine-et-Marne'],['78','Yvelines'],['79','Deux-Sèvres'],
  ['80','Somme'],['81','Tarn'],['82','Tarn-et-Garonne'],['83','Var'],['84','Vaucluse'],
  ['85','Vendée'],['86','Vienne'],['87','Haute-Vienne'],['88','Vosges'],['89','Yonne'],
  ['90','Territoire de Belfort'],['91','Essonne'],['92','Hauts-de-Seine'],['93','Seine-Saint-Denis'],
  ['94','Val-de-Marne'],['95','Val-d\'Oise'],['971','Guadeloupe'],['972','Martinique'],
  ['973','Guyane'],['974','La Réunion'],['976','Mayotte']
];

let map, markersLayer;
let currentResults = []; // {siren, nom, adresse, cp, commune, naf, dirigeants, lat, lng, distance, groupes:[label,...]}
let searchPoint = null; // {lat,lng} si mode ville
let selectedSiren = null; // SIREN de la cible actuellement isolée sur la carte

function el(id){ return document.getElementById(id); }

function showToast(msg){
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 3000);
}

async function geocode(address){
  if(!address || !address.trim()) return null;
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=' + encodeURIComponent(address);
  const res = await fetch(url, {headers: {'Accept':'application/json'}});
  if(!res.ok) throw new Error('Service de géocodage indisponible');
  const data = await res.json();
  if(!data || !data.length) return null;
  return {lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon)};
}

function departementFromPostcode(pc){
  if(!pc) return null;
  if(pc.startsWith('97') || pc.startsWith('98')) return [pc.slice(0,3)];
  if(pc.startsWith('20')) return ['2A','2B']; // Corse : ambigu par code postal, on interroge les deux
  return [pc.slice(0,2)];
}

// Détermine le(s) département(s) couvrant le point recherché, via géocodage inverse Nominatim.
async function findDepartements(lat, lng){
  try{
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, {headers: {'Accept':'application/json'}});
    if(!res.ok) return null;
    const data = await res.json();
    const addr = data && data.address;
    if(!addr) return null;
    if(addr.postcode) return departementFromPostcode(addr.postcode);
    // repli : correspondance du nom de département/état dans notre liste connue
    const candidate = (addr.state_district || addr.county || addr.state || '').toLowerCase();
    const match = DEPARTEMENTS.find(([,name]) => candidate.includes(name.toLowerCase()));
    return match ? [match[0]] : null;
  } catch(e){
    return null;
  }
}

function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function apiGet(path, params){
  const usp = new URLSearchParams(params);
  const url = `${API_BASE}${path}?${usp.toString()}`;
  const res = await fetch(url);
  if(!res.ok){
    if(res.status === 429) throw new Error('RATE_LIMIT');
    throw new Error('Erreur API (' + res.status + ')');
  }
  return res.json();
}

// Récupère toutes les pages (jusqu'à maxPages) pour une requête donnée
async function fetchAllPages(path, baseParams, maxPages){
  maxPages = maxPages || MAX_PAGES_PER_GROUP;
  let out = [];
  let page = 1;
  let totalPages = 1;
  do{
    const data = await apiGet(path, Object.assign({}, baseParams, {page, per_page: PER_PAGE}));
    out = out.concat(data.results || []);
    totalPages = Math.min(data.total_pages || 1, maxPages);
    page++;
    if(page <= totalPages) await sleep(CALL_DELAY_MS);
  } while(page <= totalPages);
  return out;
}

// Filtre de sécurité côté client : vérifie que l'entreprise correspond réellement
// aux critères demandés, indépendamment de ce que l'API a filtré côté serveur.
function matchesNaf(entreprise, nafCodes){
  const codes = new Set(nafCodes);
  if(codes.has(entreprise.activite_principale)) return true;
  const etabs = entreprise.matching_etablissements || [];
  return etabs.some(e => e && codes.has(e.activite_principale));
}
function matchesLegal(entreprise, legalCodes){
  return legalCodes.includes(entreprise.nature_juridique);
}
// Exclut les entrepreneurs individuels / personnes physiques (codes 1000, 1100-1900)
// afin de ne cibler que des sociétés et personnes morales.
function isPersonnePhysique(entreprise){
  const nj = entreprise.nature_juridique || '';
  return nj.startsWith('1');
}

// Déduit le code département à partir d'un code postal (gère la Corse et les DOM).
function codeDeptFromCp(cp){
  if(!cp) return null;
  cp = String(cp).trim();
  if(cp.length < 5) return null;
  if(cp.startsWith('20')){
    // Corse : 200-199 = 2A, 202-... = 2B (règle usuelle : <20200 => 2A, >=20200 => 2B)
    return parseInt(cp, 10) < 20200 ? '2A' : '2B';
  }
  if(cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0,3);
  return cp.slice(0,2);
}

function extractRow(entreprise, groupLabel, point, departementFilter){
  // Exclut les entreprises radiées / cessées au niveau de l'unité légale
  if(entreprise.etat_administratif && entreprise.etat_administratif !== 'A') return null;

  // Ne retient que les établissements actifs (ignore les sites fermés, même si leur adresse
  // matchait historiquement le critère de recherche — seule l'adresse active doit être affichée)
  let etabs = (entreprise.matching_etablissements && entreprise.matching_etablissements.length)
    ? entreprise.matching_etablissements
    : [entreprise.siege];
  etabs = etabs.filter(e => e && (!e.etat_administratif || e.etat_administratif === 'A'));
  if(!etabs.length){
    // Repli : le siège lui-même s'il est actif, sinon aucune adresse fiable disponible → exclusion
    if(entreprise.siege && (!entreprise.siege.etat_administratif || entreprise.siege.etat_administratif === 'A')){
      etabs = [entreprise.siege];
    } else {
      return null;
    }
  }

  // Recherche par département : l'établissement retenu doit réellement se trouver dans le
  // département demandé. Sans ce filtre, un repli sur le siège social (hors matching_etablissements)
  // peut faire apparaître un établissement situé dans un tout autre département.
  if(departementFilter){
    const inDept = etabs.filter(e => codeDeptFromCp(e && e.code_postal) === departementFilter);
    if(!inDept.length) return null;
    etabs = inDept;
  }

  let best = etabs[0];
  let bestDist = null;
  if(point){
    let bd = Infinity;
    etabs.forEach(e=>{
      if(e && e.latitude && e.longitude){
        const d = haversineKm(point.lat, point.lng, parseFloat(e.latitude), parseFloat(e.longitude));
        if(d < bd){ bd = d; best = e; }
      }
    });
    bestDist = isFinite(bd) ? bd : null;
  } else {
    best = etabs.find(e => e && e.latitude) || etabs[0];
  }
  const dirigeant = (entreprise.dirigeants && entreprise.dirigeants[0])
    ? [entreprise.dirigeants[0].prenoms, entreprise.dirigeants[0].nom].filter(Boolean).join(' ')
    : '';
  // Pour la recherche LinkedIn : ne retenir que le premier prénom (un dirigeant avec plusieurs
  // prénoms officiels empêche souvent la recherche d'aboutir si on les inclut tous).
  const dirigeantSearch = (entreprise.dirigeants && entreprise.dirigeants[0])
    ? [(entreprise.dirigeants[0].prenoms || '').trim().split(/\s+/)[0], entreprise.dirigeants[0].nom].filter(Boolean).join(' ')
    : '';
  const isMasked = !best || best.adresse === '[NON-DIFFUSIBLE]' || best.statut_diffusion_etablissement === 'P';
  return {
    siren: entreprise.siren,
    siret: best ? best.siret : null,
    nom: entreprise.nom_raison_sociale || entreprise.nom_complet || '(nom inconnu)',
    adresse: isMasked ? '' : (best ? best.adresse : ''),
    cp: isMasked ? '' : (best ? best.code_postal : ''),
    commune: isMasked ? '' : (best ? best.libelle_commune : ''),
    naf: entreprise.activite_principale,
    dirigeant,
    dirigeantSearch,
    lat: isMasked ? null : (best ? parseFloat(best.latitude) : null),
    lng: isMasked ? null : (best ? parseFloat(best.longitude) : null),
    distance: isMasked ? null : bestDist,
    masked: isMasked,
    groupe: groupLabel
  };
}

function dedupeAndMerge(rowsArrays){
  const map = new Map();
  rowsArrays.forEach(rows=>{
    rows.forEach(r=>{
      if(map.has(r.siren)){
        const existing = map.get(r.siren);
        if(!existing.groupes.includes(r.groupe)) existing.groupes.push(r.groupe);
      } else {
        map.set(r.siren, Object.assign({}, r, {groupes:[r.groupe]}));
      }
    });
  });
  return Array.from(map.values());
}

async function runSearch(){
  const checkedSousKeys = Array.from(document.querySelectorAll('.sous-check:checked'))
    .map(c => ({groupe: c.dataset.groupe, sous: c.dataset.sous}));
  if(!checkedSousKeys.length){ showToast('Sélectionnez au moins une cible client'); return; }

  // Résout chaque case cochée vers sa définition (naf/legal) et un libellé "Cible — Sous-catégorie"
  const groupes = [];
  checkedSousKeys.forEach(({groupe, sous})=>{
    const g = CONFIG.segments.find(x => x.key === groupe);
    if(!g) return;
    const s = g.sousCategories.find(x => x.key === sous);
    if(!s) return;
    groupes.push({ key: `${groupe}.${sous}`, label: `${g.label} — ${s.label}`, naf: s.naf, legal: s.legal });
  });
  if(!groupes.length){ showToast('Sélectionnez au moins une cible client'); return; }

  const mode = document.querySelector('input[name="mode"]:checked').value;
  let geoParams = null;
  searchPoint = null;
  let villeDepartements = null;

  if(mode === 'ville'){
    const ville = el('ville-input').value.trim();
    if(!ville){ showToast('Indiquez une ville'); return; }
    setStatus('Géocodage de la ville...');
    let pt;
    try{ pt = await geocode(ville + ', France'); }
    catch(e){ showToast('Erreur de géocodage : ' + e.message); setStatus(''); return; }
    if(!pt){ showToast('Ville introuvable'); setStatus(''); return; }
    searchPoint = pt;
    const radius = el('radius-input').value || 50;
    geoParams = {type:'near_point', lat: pt.lat, long: pt.lng, radius};
    villeDepartements = await findDepartements(pt.lat, pt.lng);
  } else if(mode === 'departement'){
    const dep = el('departement-select').value;
    if(!dep){ showToast('Sélectionnez un département'); return; }
    geoParams = {type:'departement', departement: dep};
  } else {
    geoParams = {type:'france'};
  }

  el('run-search').disabled = true;
  el('run-search').textContent = 'Recherche en cours...';

  const resultArrays = [];
  let step = 0;
  for(const g of groupes){
    // Requête par code NAF
    if(g.naf && g.naf.length){
      step++;
      setStatus(`Recherche "${g.label}" (${step})...`);
      try{
        let params, path;
        if(geoParams.type === 'near_point'){
          params = {lat: geoParams.lat, long: geoParams.long, radius: geoParams.radius, activite_principale: g.naf.join(',')};
          path = '/near_point';
        } else if(geoParams.type === 'departement'){
          params = {departement: geoParams.departement, activite_principale: g.naf.join(',')};
          path = '/search';
        } else {
          params = {activite_principale: g.naf.join(',')};
          path = '/search';
        }
        const raw = await fetchAllPages(path, params);
        const filtered = raw.filter(e => matchesNaf(e, g.naf) && !isPersonnePhysique(e));
        const deptFilter = geoParams.type === 'departement' ? geoParams.departement : null;
        resultArrays.push(filtered.map(e => extractRow(e, g.label, searchPoint, deptFilter)).filter(Boolean));
        await sleep(CALL_DELAY_MS);
      } catch(e){
        console.error('Erreur groupe NAF', g.key, e);
        showToast(`Erreur sur "${g.label}" : ${e.message}`);
      }
    }
    // Requête par catégorie juridique (secteur public) — recherche départementale exhaustive
    // (les communes/EPCI sont trop rares pour être fiablement trouvées par simple proximité)
    if(g.legal && g.legal.length){
      step++;
      setStatus(`Recherche "${g.label}" — secteur public (${step})...`);
      try{
        let raw = [];
        if(mode === 'ville' && villeDepartements){
          raw = await fetchAllPages('/search', {departement: villeDepartements.join(','), nature_juridique: g.legal.join(',')}, 15);
        } else if(mode === 'ville'){
          // repli si le département n'a pas pu être déterminé
          raw = await fetchAllPages('/near_point', {lat: geoParams.lat, long: geoParams.long, radius: geoParams.radius, nature_juridique: g.legal.join(',')}, MAX_PAGES_LEGAL);
        } else if(mode === 'departement'){
          raw = await fetchAllPages('/search', {departement: geoParams.departement, nature_juridique: g.legal.join(',')}, MAX_PAGES_LEGAL);
        } else {
          raw = await fetchAllPages('/search', {nature_juridique: g.legal.join(',')}, MAX_PAGES_LEGAL);
        }
        const filtered = raw.filter(e => matchesLegal(e, g.legal) && !isPersonnePhysique(e));
        const deptFilterLegal = mode === 'departement' ? geoParams.departement : null;
        resultArrays.push(filtered.map(e => extractRow(e, g.label, searchPoint, deptFilterLegal)).filter(Boolean));
        if(mode === 'ville' && !villeDepartements && filtered.length < 3){
          showToast(`Département non déterminé pour cette ville — résultats "${g.label}" potentiellement incomplets`);
        }
        await sleep(CALL_DELAY_MS);
      } catch(e){
        console.error('Erreur groupe légal', g.key, e);
        showToast(`Erreur sur "${g.label}" (collectivités) : ${e.message}`);
      }
    }
  }

  currentResults = dedupeAndMerge(resultArrays);
  selectedSiren = null;
  if(searchPoint){
    const radiusKm = parseFloat(el('radius-input').value || 50);
    // Filet de sécurité : élimine les résultats trop éloignés si l'API n'a pas respecté le rayon
    currentResults = currentResults.filter(r => r.distance == null || r.distance <= radiusKm + 2);
    currentResults.sort((a,b)=> (a.distance ?? 9999) - (b.distance ?? 9999));
  }

  el('run-search').disabled = false;
  el('run-search').textContent = 'Lancer la recherche';
  setStatus('');
  renderResults();
}

function setStatus(text){
  el('search-status').textContent = text;
}

function renderResults(){
  el('count-text').textContent = currentResults.length + ' cible' + (currentResults.length>1?'s':'') + ' trouvée' + (currentResults.length>1?'s':'');
  el('export-xlsx').disabled = currentResults.length === 0;

  const list = el('results-list');
  list.innerHTML = '';
  if(!currentResults.length){
    list.innerHTML = '<div class="empty-state">Aucun résultat. Lancez une recherche pour afficher les cibles.</div>';
  }
  currentResults.forEach(r=>{
    const card = document.createElement('div');
    card.className = 'result-card' + (r.siren === selectedSiren ? ' active' : '');
    card.dataset.siren = r.siren;
    const distTxt = (r.distance != null) ? `<span class="result-dist">${r.distance.toFixed(1)} km</span>` : '';
    const addrTxt = r.masked
      ? '<span class="addr-masked">Adresse non communiquée (diffusion restreinte)</span>'
      : `${escapeHtml(r.adresse||'')} ${escapeHtml(r.cp||'')} ${escapeHtml(r.commune||'')}`;
    const linkedinCo = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([r.nom, r.commune].filter(Boolean).join(' '))}`;
    const linkedinDir = r.dirigeant ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(r.dirigeantSearch + ' ' + r.nom)}` : null;
    const annuaireUrl = `https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`;
    card.innerHTML = `
      <div class="result-top">
        <a class="result-name" href="${annuaireUrl}" target="_blank" rel="noopener">${escapeHtml(r.nom)}</a>
        ${distTxt}
      </div>
      <div class="result-tags">${r.groupes.map(g=>`<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
      <div class="result-addr">${addrTxt}</div>
      <div class="result-meta">
        <span>NAF ${escapeHtml(r.naf||'—')}</span>
        ${r.dirigeant ? `<span>Dirigeant : <a href="${linkedinDir}" target="_blank" rel="noopener" class="linkedin-inline">${escapeHtml(r.dirigeant)}</a></span>` : ''}
      </div>
      <div class="result-links">
        <a class="result-link proposition" href="${rdvUrl(r)}">📋 Proposition</a>
        <a class="result-link linkedin" href="${linkedinCo}" target="_blank" rel="noopener">🔗 Contacts LinkedIn (entreprise)</a>
      </div>
    `;
    card.addEventListener('click', (ev)=>{
      if(ev.target.tagName === 'A') return;
      if(r.lat && r.lng && map){
        selectedSiren = r.siren;
        renderMap();
        map.setView([r.lat, r.lng], 15, {animate:true});
        document.querySelectorAll('.result-card.active').forEach(c=>c.classList.remove('active'));
        card.classList.add('active');
        if(isMobileLayout()) closePanel();
      } else {
        showToast('Localisation non disponible : cette entreprise a demandé la non-diffusion de ses données');
      }
    });
    list.appendChild(card);
  });

  renderMap();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function rdvUrl(r){
  const params = new URLSearchParams({
    siren: r.siren || '',
    nom: r.nom || '',
    adresse: r.adresse || '',
    cp: r.cp || '',
    commune: r.commune || '',
    naf: r.naf || '',
    groupe: (r.groupes && r.groupes[0]) || ''
  });
  return 'rdv.html?' + params.toString();
}

function popupHtml(r){
  const linkedinCo = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([r.nom, r.commune].filter(Boolean).join(' '))}`;
  const linkedinDir = r.dirigeant ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(r.dirigeantSearch + ' ' + r.nom)}` : null;
  const annuaireUrl = `https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`;
  return `<a href="${annuaireUrl}" target="_blank" rel="noopener"><strong>${escapeHtml(r.nom)}</strong></a><br>${escapeHtml(r.groupes.join(', '))}<br>${escapeHtml(r.adresse||'')} ${escapeHtml(r.cp||'')} ${escapeHtml(r.commune||'')}
    ${r.dirigeant ? `<br>Dirigeant : <a href="${linkedinDir}" target="_blank" rel="noopener" style="color:#0a66c2;">${escapeHtml(r.dirigeant)}</a>` : ''}
    <div style="margin-top:6px; display:flex; flex-direction:column; gap:2px;">
      <a href="${rdvUrl(r)}">📋 Proposition</a>
      <a href="${linkedinCo}" target="_blank" rel="noopener" style="color:#0a66c2;">🔗 Contacts LinkedIn (entreprise)</a>
    </div>`;
}

function renderMap(){
  if(!map) return;
  markersLayer.clearLayers();
  const showAllBtn = document.getElementById('show-all-btn');

  if(selectedSiren){
    const r = currentResults.find(x => x.siren === selectedSiren);
    if(r && r.lat && r.lng){
      const m = L.circleMarker([r.lat, r.lng], {
        radius:8, color:'#b23b3b', fillColor:'#b23b3b', fillOpacity:0.9, weight:2
      }).bindPopup(popupHtml(r)).openPopup();
      markersLayer.addLayer(m);
      if(showAllBtn) showAllBtn.style.display = 'block';
      return;
    }
  }

  if(showAllBtn) showAllBtn.style.display = 'none';
  const pts = [];
  if(searchPoint){
    const centerMarker = L.circleMarker([searchPoint.lat, searchPoint.lng], {
      radius:7, color:'#0e4527', fillColor:'#0e4527', fillOpacity:1, weight:2
    }).bindPopup('Point de recherche');
    markersLayer.addLayer(centerMarker);
    pts.push([searchPoint.lat, searchPoint.lng]);
    const radiusKm = parseFloat(el('radius-input').value || 50);
    const circle = L.circle([searchPoint.lat, searchPoint.lng], {radius: radiusKm*1000, color:'#1b6b3c', weight:1, fillOpacity:0.04});
    markersLayer.addLayer(circle);
  }
  currentResults.forEach(r=>{
    if(r.lat && r.lng){
      const m = L.circleMarker([r.lat, r.lng], {
        radius:6, color:'#b23b3b', fillColor:'#b23b3b', fillOpacity:0.85, weight:1
      }).bindPopup(popupHtml(r));
      m.on('click', ()=>{
        selectedSiren = r.siren;
        renderMap();
        map.setView([r.lat, r.lng], 15, {animate:true});
        document.querySelectorAll('.result-card.active').forEach(c=>c.classList.remove('active'));
        const card = document.querySelector(`.result-card[data-siren="${r.siren}"]`);
        if(card) card.classList.add('active');
      });
      markersLayer.addLayer(m);
      pts.push([r.lat, r.lng]);
    }
  });
  if(pts.length){
    map.fitBounds(pts, {padding:[30,30], maxZoom: searchPoint ? 12 : 9});
  }
}

function exportXlsx(){
  if(!currentResults.length) return;
  const headers = ['Raison sociale','SIREN','SIRET','Cible(s)','Adresse','Code postal','Commune','NAF','Dirigeant','Distance (km)','Fiche'];
  const rows = currentResults.map(r => [
    r.nom, r.siren, r.siret||'', r.groupes.join(' / '), r.adresse||'', r.cp||'', r.commune||'',
    r.naf||'', r.dirigeant||'', r.distance!=null ? Number(r.distance.toFixed(1)) : '',
    'https://annuaire-entreprises.data.gouv.fr/entreprise/' + r.siren
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    {wch:30}, {wch:12}, {wch:16}, {wch:28}, {wch:30}, {wch:10}, {wch:20},
    {wch:8}, {wch:22}, {wch:12}, {wch:45}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Prospection');
  const dateStr = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `prospection-pcp-${dateStr}.xlsx`);
}

function buildGroupCheckboxes(){
  const wrap = el('groupes-list');
  wrap.innerHTML = '';
  CONFIG.segments.forEach(g=>{
    const parent = document.createElement('div');
    parent.className = 'groupe-parent';
    const header = document.createElement('div');
    header.className = 'groupe-parent-header';
    header.innerHTML = `<button type="button" class="groupe-toggle" aria-label="Afficher les sous-catégories">+</button><label><input type="checkbox" class="groupe-parent-check" data-groupe="${g.key}" /> <strong>${escapeHtml(g.label)}</strong></label>`;
    parent.appendChild(header);
    segmentLabelEls[g.key] = header.querySelector('label');

    const sousWrap = document.createElement('div');
    sousWrap.className = 'sous-list';
    sousWrap.style.display = 'none';
    g.sousCategories.forEach(s=>{
      const label = document.createElement('label');
      label.className = 'sous-option';
      label.innerHTML = `<input type="checkbox" class="sous-check groupe-check" data-groupe="${g.key}" data-sous="${s.key}" /> <span>${escapeHtml(s.label)}</span>`;
      sousWrap.appendChild(label);
    });
    parent.appendChild(sousWrap);
    wrap.appendChild(parent);

    const toggleBtn = header.querySelector('.groupe-toggle');
    toggleBtn.addEventListener('click', ()=>{
      const expanded = sousWrap.style.display !== 'none';
      sousWrap.style.display = expanded ? 'none' : 'block';
      toggleBtn.textContent = expanded ? '+' : '–';
      toggleBtn.classList.toggle('expanded', !expanded);
    });

    const parentCheck = header.querySelector('.groupe-parent-check');
    const sousChecks = Array.from(sousWrap.querySelectorAll('.sous-check'));
    parentCheck.addEventListener('change', ()=>{
      sousChecks.forEach(c => c.checked = parentCheck.checked);
    });
    sousChecks.forEach(c => c.addEventListener('change', ()=>{
      const allChecked = sousChecks.every(x=>x.checked);
      const noneChecked = sousChecks.every(x=>!x.checked);
      parentCheck.checked = allChecked;
      parentCheck.indeterminate = !allChecked && !noneChecked;
    }));
  });
}

function buildDepartementSelect(){
  const sel = el('departement-select');
  sel.innerHTML = '<option value="">— Sélectionner —</option>' +
    DEPARTEMENTS.map(([code,name]) => `<option value="${code}">${code} — ${name}</option>`).join('');
}

function initMap(){
  map = L.map('prospection-map', {zoomControl:true}).setView([46.6, 2.3], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  window.addEventListener('resize', ()=> setTimeout(()=> map.invalidateSize(), 200));
  setTimeout(()=> map.invalidateSize(), 300);
}

function updateModeHint(mode){
  const hint = el('mode-hint');
  if(!hint) return;
  hint.textContent = mode === 'france'
    ? "Recherche nationale : résultats limités aux premiers établissements retournés par cible (non exhaustif sur tout le territoire)."
    : '';
}

function initModeToggle(){
  document.querySelectorAll('input[name="mode"]').forEach(radio=>{
    radio.addEventListener('change', ()=>{
      const mode = document.querySelector('input[name="mode"]:checked').value;
      el('mode-ville-fields').style.display = mode === 'ville' ? 'block' : 'none';
      el('mode-dept-fields').style.display = mode === 'departement' ? 'block' : 'none';
      updateModeHint(mode);
    });
  });
  updateModeHint(document.querySelector('input[name="mode"]:checked').value);
}

function isMobileLayout(){
  return window.matchMedia('(max-width: 768px)').matches;
}

function openPanel(){
  document.getElementById('panel').classList.add('open');
  document.getElementById('panel-backdrop').classList.add('show');
  const btn = document.getElementById('panel-toggle');
  if(btn) btn.textContent = '🗺️ Voir la carte';
}

function closePanel(){
  document.getElementById('panel').classList.remove('open');
  document.getElementById('panel-backdrop').classList.remove('show');
  const btn = document.getElementById('panel-toggle');
  if(btn) btn.textContent = '🔍 Voir les filtres';
}

function togglePanel(){
  const panel = document.getElementById('panel');
  if(panel.classList.contains('open')) closePanel(); else openPanel();
}

function applyUrlParams(){
  const params = new URLSearchParams(window.location.search);
  const ville = params.get('ville');
  if(!ville) return;

  const modeVille = document.querySelector('input[name="mode"][value="ville"]');
  if(modeVille) modeVille.checked = true;
  document.getElementById('mode-ville-fields').style.display = 'block';
  document.getElementById('mode-dept-fields').style.display = 'none';

  el('ville-input').value = ville;

  const rayon = params.get('rayon');
  if(rayon){
    el('radius-input').value = rayon;
    el('radius-value').textContent = rayon + ' km';
  }

  // Ville pré-remplie, mais la sélection des cibles et le lancement de la recherche
  // restent à l'initiative de l'utilisateur.
}

function buildActivitySelect(){
  const select = el('activity-select');
  ACTIVITIES.forEach(act=>{
    const opt = document.createElement('option');
    opt.value = act;
    opt.textContent = ACTIVITY_SHORT[act] || act;
    select.appendChild(opt);
  });
  select.addEventListener('change', applyActivityColors);
}

async function fetchPriorities(){
  try{
    const {data, error} = await sb.from('prospection_priorities').select('*');
    if(error) throw error;
    priorities = {};
    (data||[]).forEach(row=>{
      if(row.priority) priorities[row.activity + '|' + row.segment] = row.priority;
    });
  }catch(e){
    console.error('Erreur chargement priorités', e);
  }
}

function applyActivityColors(){
  const activity = el('activity-select').value;
  Object.entries(segmentLabelEls).forEach(([segKey, labelEl])=>{
    labelEl.classList.remove('prio-1','prio-2','prio-3','prio-0');
    if(!activity) return;
    const p = priorities[activity + '|' + segKey];
    labelEl.classList.add(p ? ('prio-' + p) : 'prio-0');
  });
}

async function boot(){
  sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  buildGroupCheckboxes();
  buildActivitySelect();
  buildDepartementSelect();
  initMap();
  initModeToggle();
  await fetchPriorities();
  el('radius-input').addEventListener('input', ()=>{ el('radius-value').textContent = el('radius-input').value + ' km'; });
  el('run-search').addEventListener('click', runSearch);
  el('export-xlsx').addEventListener('click', exportXlsx);
  const toggleBtn = document.getElementById('panel-toggle');
  if(toggleBtn) toggleBtn.addEventListener('click', togglePanel);
  const backdrop = document.getElementById('panel-backdrop');
  if(backdrop) backdrop.addEventListener('click', closePanel);
  const showAllBtn = document.getElementById('show-all-btn');
  if(showAllBtn) showAllBtn.addEventListener('click', ()=>{
    selectedSiren = null;
    document.querySelectorAll('.result-card.active').forEach(c=>c.classList.remove('active'));
    renderMap();
  });
  document.getElementById('select-all-btn').addEventListener('click', ()=>{
    document.querySelectorAll('.sous-check, .groupe-parent-check').forEach(c=>{ c.checked = true; c.indeterminate = false; });
  });
  document.getElementById('select-none-btn').addEventListener('click', ()=>{
    document.querySelectorAll('.sous-check, .groupe-parent-check').forEach(c=>{ c.checked = false; c.indeterminate = false; });
  });
  if(isMobileLayout()) openPanel(); // rien d'utile sur la carte tant qu'aucune recherche n'a été lancée
  document.getElementById('loading-screen').style.display = 'none';
  applyUrlParams();
}

window.PROSPECTION_APP = {boot};

})();
