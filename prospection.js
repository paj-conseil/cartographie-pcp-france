(function(){

const CONFIG = window.PROSPECTION_CONFIG;
const API_BASE = 'https://recherche-entreprises.api.gouv.fr';
const PER_PAGE = 25;
const MAX_PAGES_PER_GROUP = 4; // limite raisonnable par catégorie NAF (100 résultats)
const MAX_PAGES_LEGAL = 8; // filet de sécurité plus large pour le secteur public (200 résultats bruts avant filtrage)
const CALL_DELAY_MS = 160; // ~6 appels/s, sous la limite de 7/s de l'API

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

function extractRow(entreprise, groupLabel, point){
  // Choisit l'établissement le plus pertinent : celui qui matche (matching_etablissements) le plus proche du point
  let etabs = (entreprise.matching_etablissements && entreprise.matching_etablissements.length)
    ? entreprise.matching_etablissements
    : [entreprise.siege];
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
  const blocKey = document.querySelector('input[name="bloc"]:checked').value;
  const bloc = CONFIG.blocs[blocKey];
  const checkedGroupKeys = Array.from(document.querySelectorAll('.groupe-check:checked')).map(c=>c.value);
  const groupes = bloc.groupes.filter(g => checkedGroupKeys.includes(g.key));
  if(!groupes.length){ showToast('Sélectionnez au moins une catégorie de cible'); return; }

  const mode = document.querySelector('input[name="mode"]:checked').value;
  let geoParams = null;
  searchPoint = null;

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
  } else {
    const dep = el('departement-select').value;
    if(!dep){ showToast('Sélectionnez un département'); return; }
    geoParams = {type:'departement', departement: dep};
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
        const params = geoParams.type === 'near_point'
          ? {lat: geoParams.lat, long: geoParams.long, radius: geoParams.radius, activite_principale: g.naf.join(',')}
          : {departement: geoParams.departement, activite_principale: g.naf.join(',')};
        const path = geoParams.type === 'near_point' ? '/near_point' : '/search';
        const raw = await fetchAllPages(path, params);
        const filtered = raw.filter(e => matchesNaf(e, g.naf) && !isPersonnePhysique(e));
        resultArrays.push(filtered.map(e => extractRow(e, g.label, searchPoint)));
        await sleep(CALL_DELAY_MS);
      } catch(e){
        console.error('Erreur groupe NAF', g.key, e);
        showToast(`Erreur sur "${g.label}" : ${e.message}`);
      }
    }
    // Requête par catégorie juridique (secteur public)
    if(g.legal && g.legal.length){
      step++;
      setStatus(`Recherche "${g.label}" — secteur public (${step})...`);
      try{
        const params = geoParams.type === 'near_point'
          ? {lat: geoParams.lat, long: geoParams.long, radius: geoParams.radius, nature_juridique: g.legal.join(',')}
          : {departement: geoParams.departement, nature_juridique: g.legal.join(',')};
        const path = geoParams.type === 'near_point' ? '/near_point' : '/search';
        const raw = await fetchAllPages(path, params, MAX_PAGES_LEGAL);
        const filtered = raw.filter(e => matchesLegal(e, g.legal) && !isPersonnePhysique(e));
        resultArrays.push(filtered.map(e => extractRow(e, g.label, searchPoint)));
        if(geoParams.type === 'near_point' && filtered.length < 3 && raw.length >= PER_PAGE * MAX_PAGES_LEGAL){
          showToast(`Peu de résultats "${g.label}" dans ce rayon — essayez le mode Département pour une recherche plus large`);
        }
        await sleep(CALL_DELAY_MS);
      } catch(e){
        console.error('Erreur groupe légal', g.key, e);
        showToast(`Erreur sur "${g.label}" (collectivités) : ${e.message}`);
      }
    }
  }

  currentResults = dedupeAndMerge(resultArrays);
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
  el('export-csv').disabled = currentResults.length === 0;

  const list = el('results-list');
  list.innerHTML = '';
  if(!currentResults.length){
    list.innerHTML = '<div class="empty-state">Aucun résultat. Lancez une recherche pour afficher les cibles.</div>';
  }
  currentResults.forEach(r=>{
    const card = document.createElement('div');
    card.className = 'result-card';
    const distTxt = (r.distance != null) ? `<span class="result-dist">${r.distance.toFixed(1)} km</span>` : '';
    const addrTxt = r.masked
      ? '<span class="addr-masked">Adresse non communiquée (diffusion restreinte)</span>'
      : `${escapeHtml(r.adresse||'')} ${escapeHtml(r.cp||'')} ${escapeHtml(r.commune||'')}`;
    card.innerHTML = `
      <div class="result-top">
        <span class="result-name">${escapeHtml(r.nom)}</span>
        ${distTxt}
      </div>
      <div class="result-tags">${r.groupes.map(g=>`<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
      <div class="result-addr">${addrTxt}</div>
      <div class="result-meta">
        <span>NAF ${escapeHtml(r.naf||'—')}</span>
        ${r.dirigeant ? `<span>${escapeHtml(r.dirigeant)}</span>` : ''}
      </div>
      <a class="result-link" href="https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}" target="_blank" rel="noopener">Fiche annuaire-entreprises →</a>
    `;
    card.addEventListener('click', (ev)=>{
      if(ev.target.tagName === 'A') return;
      if(r.lat && r.lng && map){
        map.flyTo([r.lat, r.lng], 13, {duration:0.4});
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

function renderMap(){
  if(!map) return;
  markersLayer.clearLayers();
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
      }).bindPopup(`<strong>${escapeHtml(r.nom)}</strong><br>${escapeHtml(r.groupes.join(', '))}<br>${escapeHtml(r.adresse||'')} ${escapeHtml(r.cp||'')} ${escapeHtml(r.commune||'')}`);
      markersLayer.addLayer(m);
      pts.push([r.lat, r.lng]);
    }
  });
  if(pts.length){
    map.fitBounds(pts, {padding:[30,30], maxZoom: searchPoint ? 12 : 9});
  }
}

function exportCsv(){
  if(!currentResults.length) return;
  const headers = ['Raison sociale','SIREN','SIRET','Cible(s)','Adresse','Code postal','Commune','NAF','Dirigeant','Distance (km)','Fiche'];
  const lines = [headers.join(';')];
  currentResults.forEach(r=>{
    const row = [
      r.nom, r.siren, r.siret||'', r.groupes.join(' / '), r.adresse||'', r.cp||'', r.commune||'',
      r.naf||'', r.dirigeant||'', r.distance!=null ? r.distance.toFixed(1) : '',
      'https://annuaire-entreprises.data.gouv.fr/entreprise/' + r.siren
    ].map(v => `"${String(v).replace(/"/g,'""')}"`);
    lines.push(row.join(';'));
  });
  const blob = new Blob(['\uFEFF' + lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `prospection-pcp-${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildGroupCheckboxes(blocKey){
  const bloc = CONFIG.blocs[blocKey];
  const wrap = el('groupes-list');
  wrap.innerHTML = '';
  bloc.groupes.forEach(g=>{
    const label = document.createElement('label');
    label.className = 'groupe-option';
    label.innerHTML = `<input type="checkbox" class="groupe-check" value="${g.key}" checked /> <span>${escapeHtml(g.label)}</span>`;
    wrap.appendChild(label);
  });
}

function buildBlocRadios(){
  const wrap = el('bloc-list');
  wrap.innerHTML = '';
  Object.keys(CONFIG.blocs).forEach((key, i)=>{
    const bloc = CONFIG.blocs[key];
    const label = document.createElement('label');
    label.className = 'bloc-option';
    label.innerHTML = `<input type="radio" name="bloc" value="${key}" ${i===0?'checked':''} /> <span><strong>${escapeHtml(bloc.label)}</strong><br><small>${escapeHtml(bloc.sousTitre)}</small></span>`;
    wrap.appendChild(label);
  });
  CONFIG.blocsAVenir.forEach(name=>{
    const div = document.createElement('div');
    div.className = 'bloc-option bloc-disabled';
    div.innerHTML = `<span><strong>${escapeHtml(name)}</strong><br><small>Logique de prescripteurs à définir</small></span>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('input[name="bloc"]').forEach(radio=>{
    radio.addEventListener('change', ()=> buildGroupCheckboxes(radio.value));
  });
  buildGroupCheckboxes(Object.keys(CONFIG.blocs)[0]);
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

function initModeToggle(){
  document.querySelectorAll('input[name="mode"]').forEach(radio=>{
    radio.addEventListener('change', ()=>{
      el('mode-ville-fields').style.display = radio.value === 'ville' && radio.checked ? 'block' : (document.querySelector('input[name="mode"]:checked').value==='ville' ? 'block':'none');
      el('mode-dept-fields').style.display = document.querySelector('input[name="mode"]:checked').value==='departement' ? 'block':'none';
      el('mode-ville-fields').style.display = document.querySelector('input[name="mode"]:checked').value==='ville' ? 'block':'none';
    });
  });
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

function boot(){
  buildBlocRadios();
  buildDepartementSelect();
  initMap();
  initModeToggle();
  el('radius-input').addEventListener('input', ()=>{ el('radius-value').textContent = el('radius-input').value + ' km'; });
  el('run-search').addEventListener('click', runSearch);
  el('export-csv').addEventListener('click', exportCsv);
  const toggleBtn = document.getElementById('panel-toggle');
  if(toggleBtn) toggleBtn.addEventListener('click', togglePanel);
  const backdrop = document.getElementById('panel-backdrop');
  if(backdrop) backdrop.addEventListener('click', closePanel);
  if(isMobileLayout()) openPanel(); // rien d'utile sur la carte tant qu'aucune recherche n'a été lancée
  document.getElementById('loading-screen').style.display = 'none';
}

window.PROSPECTION_APP = {boot};

})();
