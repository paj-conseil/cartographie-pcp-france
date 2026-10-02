// Base clients consolidée (table public.clients) affichée dans la page Gestion commerciale.
// - consultation filtrée par entité (ou toutes entités), recherche, filtres, tri, export CSV
// - modification du segment et du groupe client directement dans le tableau
// - recherche automatique des SIRET via l'API publique recherche-entreprises.api.gouv.fr,
//   lancée depuis le navigateur (pas de clé requise), avec reprise possible à tout moment
// Dépend de clients-referentiel.js (window.CLIENTS_REF).
(function(){

const REF = window.CLIENTS_REF;
const API_BASE = 'https://recherche-entreprises.api.gouv.fr/search';
const PAGE_SIZE = 100;
const API_SPACING_MS = 220;   // ~4,5 appels/s, nettement sous la limite de 7/s de l'annuaire (évite les blocages)
const WORKERS = 2;
const COLUMNS = 'id,entite,source_logiciel,source_code_client,raison_sociale,type_client,adresse,code_postal,ville,email,telephone,solde_actuel,siret,siren,raison_sociale_officielle,enseigne,code_naf,nature_juridique,etat_administratif,siret_statut,siret_score,siret_candidats,siret_recherche_le,group_id,groupe_source,segment_id,segment_source,classification_motif,notes';

const TYPE_LABELS = { professionnel: 'Pro', particulier: 'Particulier', a_determiner: 'À déterminer' };
const STATUT_LABELS = {
  non_applicable: 'Sans objet', a_rechercher: 'À rechercher', trouve: 'Trouvé',
  a_verifier: 'À vérifier', introuvable: 'Introuvable', manuel: 'Saisi'
};

let sb = null, root = null;
let scope = { agenceId: null, label: '' };
let rows = [];
let segments = [];          // [{id, code, label}] depuis la table client_segments
let segById = new Map(), segIdByCode = new Map();
// Groupes clients : table client_groups (id, name), créés à la volée
let groupById = new Map(), groupIdByName = new Map();
function groupName(id){ return id ? (groupById.get(id) || '') : ''; }
function rememberGroup(id, name){ groupById.set(id, name); groupIdByName.set(name.trim().toLowerCase(), id); }
async function loadGroups(){
  groupById = new Map(); groupIdByName = new Map();
  for(let from = 0; ; from += 1000){
    const { data, error } = await sb.from('client_groups').select('id, name').range(from, from + 999);
    if(error) throw error;
    (data || []).forEach(g => rememberGroup(g.id, g.name));
    if(!data || data.length < 1000) break;
  }
}
async function groupIdFor(name){
  const key = name.trim().toLowerCase();
  if(groupIdByName.has(key)) return groupIdByName.get(key);
  let { data, error } = await sb.from('client_groups').insert({ name: name.trim() }).select('id, name').single();
  if(error){ // déjà créé entre-temps (nom unique) : on le relit
    const r = await sb.from('client_groups').select('id, name').ilike('name', name.trim()).limit(1);
    if(r.error || !r.data || !r.data.length) throw (error || r.error);
    data = r.data[0];
  }
  rememberGroup(data.id, data.name);
  return data.id;
}
function segLabel(id){ const s = segById.get(id); return s ? s.label : ''; }
function segIdForLabel(label){ return segIdByCode.get(REF.segmentCode(label)) || null; }
let page = 0;
let sort = { key: 'nom', dir: 1 };
let run = null; // enrichissement en cours : {stop:false, done, total, found}

function el(sel){ return root.querySelector(sel); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg){
  const t = document.getElementById('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(()=> t.classList.remove('show'), 3000);
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function fmtNum(n){ return (Number(n) || 0).toLocaleString('fr-FR'); }

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------
async function loadSegments(){
  const { data, error } = await sb.from('client_segments').select('id, code, label, sort_order').order('sort_order');
  if(error) throw error;
  segments = data || [];
  segById = new Map(segments.map(x => [x.id, x]));
  segIdByCode = new Map(segments.map(x => [x.code, x.id]));
}

async function loadRows(){
  rows = [];
  const step = 1000;
  // pagination par identifiant (et non par décalage) : chaque page reste rapide même à 100 000 clients ;
  // le tri affiché est fait dans le navigateur
  let lastId = null;
  for(;;){
    let q = sb.from('clients').select(COLUMNS).is('fusionne_vers', null).order('id').limit(step);
    if(lastId) q = q.gt('id', lastId);
    if(scope.agenceId) q = q.eq('agence_id', scope.agenceId);
    else if(scope.agenceIds) q = q.in('agence_id', scope.agenceIds.length ? scope.agenceIds : ['00000000-0000-0000-0000-000000000000']);
    let { data, error } = await q;
    if(error && /timeout/i.test(error.message)){ await sleep(1500); ({ data, error } = await q); }
    if(error){
      if(/relation .*clients.* does not exist|Could not find the table/i.test(error.message)){
        throw new Error("La table « clients » n'existe pas encore : exécutez setup-clients.sql dans Supabase.");
      }
      throw error;
    }
    (data || []).forEach(r => { r.nom = r.raison_sociale; r.groupe_client = groupName(r.group_id); });
    rows = rows.concat(data || []);
    if(data && data.length) lastId = data[data.length - 1].id;
    el('[data-cb-loading]').textContent = `Chargement… ${fmtNum(rows.length)} clients`;
    if(!data || data.length < step) break;
  }
}

// ---------------------------------------------------------------------------
// Filtres / tri
// ---------------------------------------------------------------------------
function filters(){
  return {
    q: REF.norm(el('[data-cb-search]').value),
    type: el('[data-cb-type]').value,
    segment: el('[data-cb-segment]').value,
    statut: el('[data-cb-statut]').value,
    entite: REF.norm(el('[data-cf=entite]').value),
    nom: REF.norm(el('[data-cf=nom]').value),
    adresse: REF.norm(el('[data-cf=adresse]').value),
    naf: REF.norm(el('[data-cf=naf]').value).replace(/ /g, ''),
    groupe: REF.norm(el('[data-cf=groupe]').value)
  };
}
function filtered(){
  const f = filters();
  let out = rows.filter(r => {
    if(f.type && r.type_client !== f.type) return false;
    if(f.segment === '__none__' ? r.segment_id : (f.segment && r.segment_id !== f.segment)) return false;
    if(f.statut && r.siret_statut !== f.statut) return false;
    const has = (val, q) => !q || q.split(' ').every(t => REF.norm(val).includes(t));
    if(!has(r.entite, f.entite)) return false;
    if(!has([r.nom, r.raison_sociale_officielle, r.enseigne, r.source_code_client].join(' '), f.nom)) return false;
    if(!has([r.adresse, r.code_postal, r.ville].join(' '), f.adresse)) return false;
    if(f.naf && !REF.norm(r.code_naf).replace(/ /g, '').startsWith(f.naf)) return false;
    if(!has(r.groupe_client, f.groupe)) return false;
    if(f.q){
      const hay = REF.norm([r.nom, r.adresse, r.ville, r.code_postal, r.siret, r.groupe_client, r.raison_sociale_officielle, r.enseigne, r.source_code_client, r.email].join(' '));
      if(!f.q.split(' ').every(t => hay.includes(t))) return false;
    }
    return true;
  });
  const k = sort.key, d = sort.dir;
  out.sort((a, b) => {
    const va = k === 'segment' ? (segLabel(a.segment_id) || null) : a[k];
    const vb = k === 'segment' ? (segLabel(b.segment_id) || null) : b[k];
    if(va == null && vb == null) return 0;
    if(va == null) return 1;
    if(vb == null) return -1;
    if(typeof va === 'number') return (va - vb) * d;
    return String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' }) * d;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
function renderKpis(){
  const c = (fn) => rows.filter(fn).length;
  const kpis = [
    ['Clients', rows.length],
    ['Professionnels', c(r => r.type_client === 'professionnel')],
    ['Particuliers', c(r => r.type_client === 'particulier')],
    ['À déterminer', c(r => r.type_client === 'a_determiner')],
    ['SIRET trouvés', c(r => !!r.siret)],
    ['SIRET à vérifier', c(r => r.siret_statut === 'a_verifier')],
    ['Sans segment', c(r => !r.segment_id)]
  ];
  el('[data-cb-kpis]').innerHTML = kpis.map(([l, v]) => `<div class="cb-kpi"><span>${fmtNum(v)}</span>${esc(l)}</div>`).join('');
  const todo = c(r => r.siret_statut === 'a_rechercher');
  const btn = el('[data-cb-enrich]');
  btn.textContent = run ? 'Recherche en cours…' : `🔎 Rechercher les SIRET (${fmtNum(todo)})`;
  btn.disabled = !!run || !todo;
}

function segmentSelect(r){
  const opts = ['<option value="">— à classer —</option>'].concat(segments.map(s => `<option value="${s.id}"${s.id === r.segment_id ? ' selected' : ''}>${esc(s.label)}</option>`));
  return `<select class="cb-seg" data-id="${r.id}">${opts.join('')}</select>`;
}

function siretCell(r){
  const badge = `<span class="cb-badge cb-st-${r.siret_statut}">${esc(STATUT_LABELS[r.siret_statut] || r.siret_statut)}</span>`;
  const link = r.siret ? `<a href="https://annuaire-entreprises.data.gouv.fr/etablissement/${r.siret}" target="_blank" rel="noopener">${r.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')}</a>` : '';
  const action = `<button class="cb-link-btn" data-fiche="${r.id}" title="Valider, saisir ou rechercher le SIRET">${r.siret_statut === 'a_verifier' ? 'Valider…' : '✎'}</button>`;
  return `${link}${link ? '<br>' : ''}${badge} ${action}`;
}

function render(){
  renderKpis();
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if(page >= pages) page = pages - 1;
  const slice = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showEntite = !scope.agenceId;
  root.querySelectorAll('[data-cb-th-entite]').forEach(x => x.style.display = showEntite ? '' : 'none');
  el('[data-cb-tbody]').innerHTML = slice.map(r => `
    <tr>
      ${showEntite ? `<td>${esc(r.entite)}</td>` : ''}
      <td><a href="#" class="cb-name-link" data-detail="${r.id}" title="Voir le détail de ce client">${esc(r.nom)}</a><div class="cb-sub">${esc([r.source_logiciel, r.source_code_client].filter(Boolean).join(' · '))}${r.raison_sociale_officielle && REF.norm(r.raison_sociale_officielle) !== REF.norm(r.nom) ? ' · ' + esc(r.raison_sociale_officielle) : ''}</div></td>
      <td><span class="cb-type cb-type-${r.type_client}">${esc(TYPE_LABELS[r.type_client] || r.type_client)}</span></td>
      <td>${r.adresse ? esc(r.adresse) + '<br>' : ''}<span class="cb-sub">${esc([r.code_postal, r.ville].filter(Boolean).join(' '))}</span></td>
      <td class="cb-siret">${siretCell(r)}</td>
      <td>${esc(r.code_naf || '')}</td>
      <td><input class="cb-grp" data-id="${r.id}" value="${esc(r.groupe_client || '')}" placeholder="—" /></td>
      <td>${segmentSelect(r)}</td>
    </tr>`).join('') || `<tr><td colspan="8" class="cb-empty">Aucun client ne correspond.</td></tr>`;
  el('[data-cb-count]').textContent = `${fmtNum(list.length)} client(s) — page ${page + 1}/${pages}`;
  el('[data-cb-prev]').disabled = page === 0;
  el('[data-cb-next]').disabled = page >= pages - 1;
  root.querySelectorAll('.cb-sort').forEach(th => {
    const on = th.dataset.key === sort.key;
    th.classList.toggle('active', on);
    th.querySelector('.cb-arrow').textContent = on ? (sort.dir > 0 ? '▲' : '▼') : '↕';
  });
}

// ---------------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------------
async function save(row, patch){
  const dbPatch = Object.assign({}, patch);
  try{
    if('groupe_client' in dbPatch){
      dbPatch.group_id = dbPatch.groupe_client ? await groupIdFor(dbPatch.groupe_client) : null;
      delete dbPatch.groupe_client;
    }
  }catch(e){ toast('Erreur groupe : ' + e.message); return false; }
  const { error } = await sb.from('clients').update(dbPatch).eq('id', row.id);
  if(error){ toast('Erreur : ' + error.message); return false; }
  Object.assign(row, patch, dbPatch.group_id !== undefined ? { group_id: dbPatch.group_id } : {});
  return true;
}

// Construit la mise à jour à partir d'une entreprise retenue (automatiquement ou à la main).
function patchFromMatch(row, m, statut){
  const patch = {
    siret: m.siret, raison_sociale_officielle: m.raison_sociale || m.nom || null, enseigne: m.enseigne || null,
    code_naf: m.naf || null, nature_juridique: m.nature_juridique || null, etat_administratif: m.etat || null,
    siret_statut: statut, siret_score: m.score != null ? m.score : null, siret_candidats: null,
    siret_recherche_le: new Date().toISOString(), type_client: 'professionnel'
  };
  if(row.segment_source !== 'manuel'){
    const seg = REF.segmentForCompany([row.nom, m.nom, m.raison_sociale, m.enseigne].filter(Boolean), m.naf, m.nature_juridique);
    const segId = segIdForLabel(seg);
    if(segId){ patch.segment_id = segId; patch.segment_source = 'naf'; }
    else if(row.segment_id && row.segment_id === segIdByCode.get('b2c')){ patch.segment_id = null; patch.segment_source = null; }
  }
  if(row.groupe_source !== 'manuel'){
    const g = REF.detectGroup([row.nom, m.enseigne, m.raison_sociale, m.nom]);
    if(g){ patch.groupe_client = g; patch.groupe_source = 'mot_cle'; }
    else if(!row.groupe_client || row.groupe_source === 'siren'){
      const gname = m.raison_sociale || m.nom;
      if(gname){ patch.groupe_client = gname; patch.groupe_source = 'siren'; }
    }
  }
  return patch;
}

function patchParticulier(row){
  const patch = { type_client: 'particulier', siret_statut: 'non_applicable', siret_candidats: null, siret_recherche_le: new Date().toISOString() };
  if(row.segment_source !== 'manuel'){ patch.segment_id = segIdByCode.get('b2c') || null; patch.segment_source = 'b2c'; }
  return patch;
}

// ---------------------------------------------------------------------------
// API recherche-entreprises
// ---------------------------------------------------------------------------
let nextSlot = 0;
// Appel de l'annuaire : par le relais Supabase (fonction « annuaire-entreprises »), qui
// passe par les serveurs Supabase et contourne les blocages réseau du poste ; à défaut
// (relais non déployé), appel direct depuis le navigateur.
let relais = 'inconnu';   // 'ok' | 'absent' | 'inconnu'
async function callAnnuaire(params, qs, signal){
  if(relais !== 'absent'){
    try{
      const url = window.SUPABASE_URL + '/functions/v1/annuaire-entreprises';
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch(url, { method: 'POST', signal, headers: {
        'Content-Type': 'application/json', apikey: window.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + ((session && session.access_token) || window.SUPABASE_ANON_KEY) },
        body: JSON.stringify({ params }) });
      if(r.status === 404){ relais = 'absent'; }
      else { relais = 'ok'; return r; }
    }catch(e){ if(e.name === 'AbortError') throw e; if(relais !== 'ok') relais = 'absent'; else throw e; }
  }
  return fetch(API_BASE + '?' + qs, { headers: { Accept: 'application/json' }, signal });
}

const apiCache = new Map();   // même requête = même réponse (ex : 20 restaurants scolaires à la même adresse)
async function apiSearch(params, opts){
  const o = Object.assign({ attempts: 5, timeout: 10000 }, opts || {});
  const qs = new URLSearchParams(params).toString();
  if(apiCache.has(qs)) return apiCache.get(qs);
  for(let attempt = 0; attempt < o.attempts; attempt++){
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + API_SPACING_MS;
    if(wait) await sleep(wait);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeout);
    let res;
    try{ res = await callAnnuaire(params, qs, ctrl.signal); }
    catch(e){ clearTimeout(timer); await sleep(800 * (attempt + 1)); continue; }   // délai dépassé ou coupure réseau : on réessaie
    clearTimeout(timer);
    if(res.status === 429 || res.status >= 500){ await sleep(1200 * (attempt + 1)); continue; }
    if(res.status === 400){ apiCache.set(qs, []); return []; }
    if(!res.ok) throw new Error('API ' + res.status);
    const json = await res.json();
    const out = json.results || [];
    if(apiCache.size > 5000) apiCache.clear();
    apiCache.set(qs, out);
    return out;
  }
  throw new Error("l'annuaire des entreprises ne répond pas, réessayez dans un instant");
}

// Recherche en deux temps dans le code postal du client :
//  1. par l'adresse : retrouve les établissements situés à cette adresse, même si le nom
//     saisi diffère de la raison sociale ; si le rattachement est sûr, on s'arrête là ;
//  2. sinon par le nom, puis par département ou au niveau national en dernier recours.
async function findCandidates(row, opts){
  const q = REF.searchQuery(row.nom);
  const tiers = REF.isTiersAddress(row.adresse);
  const qa = tiers ? null : REF.addressQuery(row.adresse);
  const cp = /^\d{5}$/.test(row.code_postal || '') ? row.code_postal : null;
  const indice = REF.sirenIndice(row);
  let results = [];
  const stop = () => REF.decide(row, REF.scoreCandidates(row, results)).statut === 'trouve';
  // 0. entreprise indiquée par le fichier source : son établissement dans ce code postal
  if(indice && cp && !tiers){
    results = results.concat(await apiSearch({ q: indice, code_postal: cp, per_page: 5 }, opts));
    if(stop()) return REF.scoreCandidates(row, results);
  }
  // 1. adresse d'un gestionnaire (C/O…) : recherche par le nom dans toute la France
  if(tiers){
    if(q) results = results.concat(await apiSearch({ q, per_page: 10 }, opts));
    return REF.scoreCandidates(row, results);
  }
  // 2. par l'adresse, 3. par le nom
  if(cp && qa){
    results = results.concat(await apiSearch({ q: qa, code_postal: cp, per_page: 10 }, opts));
    if(stop()) return REF.scoreCandidates(row, results);
  }
  if(cp){
    if(q) results = results.concat(await apiSearch({ q, code_postal: cp, per_page: 10 }, opts));
    if(!results.length && q) results = await apiSearch({ q, departement: REF.dept(cp), per_page: 10 }, opts);
    if(!results.length && q && row.type_client === 'professionnel') results = await apiSearch({ q, per_page: 10 }, opts);
  } else if(q){
    results = results.concat(await apiSearch({ q, per_page: 10 }, opts));
  }
  return REF.scoreCandidates(row, results);
}

async function enrichOne(row){
  const candidates = await findCandidates(row);
  const d = REF.decide(row, candidates);
  let patch;
  if(d.match) patch = patchFromMatch(row, d.match, 'trouve');
  else if(d.type === 'particulier') patch = patchParticulier(row);
  else patch = {
    siret_statut: d.statut, siret_candidats: d.candidats, siret_score: candidates[0] ? candidates[0].score : null,
    siret_recherche_le: new Date().toISOString()
  };
  if(d.type === 'a_determiner') patch.type_client = 'a_determiner';
  await save(row, patch);
  return patch.siret_statut === 'trouve';
}

async function runEnrichment(){
  const todo = rows.filter(r => r.siret_statut === 'a_rechercher');
  if(!todo.length) return;
  const minutes = Math.ceil(todo.length * 1.6 * API_SPACING_MS / 60000);
  if(!confirm(`Lancer la recherche de SIRET pour ${fmtNum(todo.length)} clients ?\n\nDurée estimée : ~${minutes} min. Gardez cet onglet ouvert ; vous pouvez arrêter et reprendre à tout moment, rien n'est perdu.`)) return;
  run = { stop: false, done: 0, total: todo.length, found: 0, errors: 0 };
  el('[data-cb-progress]').style.display = '';
  renderKpis();
  let i = 0;
  const worker = async () => {
    while(!run.stop && i < todo.length){
      const row = todo[i++];
      try{ if(await enrichOne(row)) run.found++; run.consecutive = 0; }
      catch(e){
        run.errors++; run.consecutive = (run.consecutive || 0) + 1; console.warn('SIRET', row.nom, e);
        if(run.consecutive >= 5){ run.stop = true; run.blocked = true; }
        else await sleep(5000);
      }
      run.done++;
      updateProgress();
      if(run.done % 25 === 0) render();
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  const r = run; run = null;
  el('[data-cb-progress]').style.display = 'none';
  render();
  toast(r.blocked ? `Recherche suspendue : l'annuaire des entreprises ne répond plus (${fmtNum(r.found)} SIRET trouvés avant l'arrêt). Relancez plus tard, rien n'est perdu.`
    : `${r.stop ? 'Recherche arrêtée' : 'Recherche terminée'} : ${fmtNum(r.done)} traités, ${fmtNum(r.found)} SIRET trouvés${r.errors ? `, ${r.errors} erreurs (restés « à rechercher »)` : ''}.`);
}

function updateProgress(){
  const pct = Math.round(100 * run.done / run.total);
  el('[data-cb-bar]').style.width = pct + '%';
  el('[data-cb-progress-text]').textContent = `${fmtNum(run.done)} / ${fmtNum(run.total)} — ${fmtNum(run.found)} SIRET trouvés`;
}

// ---------------------------------------------------------------------------
// Fiche SIRET (validation des candidats, saisie manuelle)
// ---------------------------------------------------------------------------
function candidateSummary(c){ return { siret: c.siret, nom: c.nom, raison_sociale: c.raison_sociale, enseigne: c.enseigne, adresse: c.adresse,
  code_postal: c.code_postal, naf: c.naf, nature_juridique: c.nature_juridique, etat: c.etat, score: c.score }; }

// Recherche d'un SIRET précis dans l'annuaire (renvoie l'établissement, ou null)
async function lookupSiret(siret, row){
  const res = await apiSearch({ q: siret, per_page: 1 }, { attempts: 2, timeout: 5000 });
  const all = REF.scoreCandidates({ nom: row.nom, adresse: row.adresse, code_postal: row.code_postal }, res);
  return all.find(c => c.siret === siret) || null;
}

// ---------------------------------------------------------------------------
// Détail d'un client : identité, coordonnées, facturation par année et par entité.
// Les factures d'autres fiches ayant le même SIRET (même établissement suivi par
// plusieurs entités) sont incluses.
// ---------------------------------------------------------------------------
let agenceNames = null;
async function loadAgenceNames(){
  if(agenceNames) return agenceNames;
  const { data } = await sb.from('agences').select('id, name, business_unit');
  agenceNames = new Map((data || []).map(a => [a.id, a]));
  return agenceNames;
}
const fmtEur = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('fr-FR') + ' €';
function fmtDate(d){ if(!d) return ''; const [y, m, j] = String(d).slice(0, 10).split('-'); return `${j}/${m}/${y}`; }

async function openDetail(row){
  const modal = el('[data-cb-modal]');
  const box = modal.querySelector('[data-cb-modal-body]');
  modal.onclick = null;   // gestionnaire éventuel de la fenêtre SIRET
  box.classList.add('cb-detail');
  box.innerHTML = `<h3>${esc(row.nom)}</h3><p class="cb-sub">Chargement…</p>`;
  modal.style.display = 'flex';
  const close = () => { modal.style.display = 'none'; box.classList.remove('cb-detail'); modal.removeEventListener('click', onClick); };
  const onClick = (e) => { if(e.target === modal || (e.target.dataset && e.target.dataset.cbAct === 'close-detail')) close(); };
  modal.addEventListener('click', onClick);
  try{
    const [ag, cliRes] = await Promise.all([loadAgenceNames(), sb.from('clients').select('*').eq('id', row.id).single()]);
    const c = cliRes.data || row;
    // autres fiches du même établissement (même SIRET), toutes entités
    let fiches = [c];
    if(c.siret){
      const { data } = await sb.from('clients').select('id, entite, agence_id, raison_sociale, source_code_client').eq('siret', c.siret).is('fusionne_vers', null).limit(50);
      if(data && data.length) fiches = [c, ...data.filter(x => x.id !== c.id)];
    }
    const ids = fiches.map(f => f.id);
    let fac = [];
    for(let from = 0; from < 20000; from += 1000){
      const { data, error } = await sb.from('factures')
        .select('id, reference, date_facture, annee, montant_ht, agence_id, client_id, activite, prestation, statut, statut_paiement, compte_ca, intragroupe, adresse_chantier, code_postal_chantier, ville_chantier, nom_chantier')
        .in('client_id', ids).order('date_facture', { ascending: false }).range(from, from + 999);
      if(error) throw error;
      fac = fac.concat(data || []);
      if(!data || data.length < 1000) break;
    }
    fac.sort((a, b) => String(b.date_facture || '').localeCompare(String(a.date_facture || '')));
    const ca = fac.filter(f => f.compte_ca !== false && f.montant_ht != null);
    const exclues = fac.length - ca.length;
    const agName = id => (ag.get(id) || {}).name || 'Sans entité';
    const ents = [...new Set(ca.map(f => agName(f.agence_id)))].sort();
    const years = [...new Set(ca.map(f => f.annee).filter(Boolean))].sort((a, b) => b - a);
    const sum = (arr) => arr.reduce((s, f) => s + Number(f.montant_ht || 0), 0);
    const cell = (y, e) => { const l = ca.filter(f => f.annee === y && agName(f.agence_id) === e); return l.length ? `${fmtEur(sum(l))}<div class="cb-sub">${l.length} fact.</div>` : '<span class="cb-sub">—</span>'; };
    const byYear = years.map(y => `<tr><th>${y}</th>${ents.length > 1 ? ents.map(e => `<td class="num">${cell(y, e)}</td>`).join('') : ''}
      <td class="num"><strong>${fmtEur(sum(ca.filter(f => f.annee === y)))}</strong><div class="cb-sub">${ca.filter(f => f.annee === y).length} fact.</div></td></tr>`).join('');
    const totalRow = `<tr class="cb-detail-total"><th>Total</th>${ents.length > 1 ? ents.map(e => `<td class="num">${fmtEur(sum(ca.filter(f => agName(f.agence_id) === e)))}</td>`).join('') : ''}<td class="num"><strong>${fmtEur(sum(ca))}</strong></td></tr>`;
    const metiers = Object.entries(ca.reduce((m, f) => { const k = f.activite || 'Non précisé'; m[k] = (m[k] || 0) + Number(f.montant_ht || 0); return m; }, {}))
      .sort((a, b) => b[1] - a[1]);
    const chantiers = new Set(fac.map(f => [f.adresse_chantier, f.code_postal_chantier, f.ville_chantier].filter(Boolean).join(' ')).filter(Boolean)).size;
    const line = (label, val) => val ? `<div class="cb-kv"><span>${label}</span><span>${val}</span></div>` : '';
    const autres = fiches.slice(1);
    box.innerHTML = `
      <div class="cb-detail-head">
        <div><h3>${esc(c.raison_sociale)}</h3>
          <p class="cb-sub">${esc(c.entite || '')} · ${esc(TYPE_LABELS[c.type_client] || c.type_client || '')}${c.segment_id ? ' · ' + esc(segLabel(c.segment_id)) : ''}${c.group_id ? ' · groupe ' + esc(groupName(c.group_id)) : ''}</p></div>
        <button class="cb-btn" data-cb-act="close-detail">Fermer</button>
      </div>
      <div class="cb-detail-grid">
        <section><h4>Identité</h4>
          ${line('Raison sociale officielle', esc(c.raison_sociale_officielle))}
          ${line('Nom commercial', esc(c.enseigne))}
          ${line('SIRET', c.siret ? `<a href="https://annuaire-entreprises.data.gouv.fr/etablissement/${esc(c.siret)}" target="_blank" rel="noopener">${esc(c.siret)}</a>` : '<span class="cb-sub">non renseigné</span>')}
          ${line('Code NAF', esc(c.code_naf))}
          ${line('Nature juridique', esc(c.nature_juridique))}
          ${line('État', c.etat_administratif === 'F' ? 'Fermé' : c.etat_administratif === 'A' ? 'Actif' : '')}
          ${line('Code client', esc([c.source_logiciel, c.source_code_client].filter(Boolean).join(' · ')))}
          ${line('Compte', esc(c.source_ref))}
          ${line('Vendeur', esc(c.vendeur))}
        </section>
        <section><h4>Coordonnées</h4>
          ${line('Adresse', esc([c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')))}
          ${line('Pays', c.pays && c.pays !== 'FR' ? esc(c.pays) : '')}
          ${line('Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}
          ${line('Téléphone', c.telephone ? `<a href="tel:${esc(c.telephone)}">${esc(c.telephone)}</a>` : '')}
          ${line('Notes', esc(c.notes).replace(/\n/g, '<br>'))}
          ${autres.length ? line('Même établissement suivi par', autres.map(f => esc(f.entite)).join(', ')) : ''}
        </section>
      </div>
      <h4>Facturation HT par année${ents.length > 1 ? ' et par entité' : ents.length ? ' · ' + esc(ents[0]) : ''}</h4>
      ${ca.length ? `<div class="cb-detail-tablewrap"><table class="cb-detail-table">
        <thead><tr><th>Année</th>${ents.length > 1 ? ents.map(e => `<th class="num">${esc(e)}</th>`).join('') : ''}<th class="num">Total</th></tr></thead>
        <tbody>${byYear}${years.length > 1 ? totalRow : ''}</tbody></table></div>
        <p class="cb-sub">${ca.length} facture(s) retenue(s)${exclues ? `, ${exclues} écartée(s) (annulées, extournées ou intragroupe)` : ''}${chantiers ? ` · ${chantiers} adresse(s) de chantier` : ''}${autres.length ? ' · factures de toutes les fiches de cet établissement' : ''}.</p>
        <h4>Par métier</h4>
        <div class="cb-detail-metiers">${metiers.map(([m, v]) => `<span class="cb-chip">${esc(m)} <strong>${fmtEur(v)}</strong></span>`).join('')}</div>
        <h4>Dernières factures</h4>
        <div class="cb-detail-tablewrap"><table class="cb-detail-table">
          <thead><tr><th>Date</th><th>N°</th><th>Entité</th><th>Prestation</th><th>Chantier</th><th class="num">HT</th><th>Paiement</th></tr></thead>
          <tbody>${fac.slice(0, 15).map(f => `<tr${f.compte_ca === false ? ' class="cb-off"' : ''}><td>${fmtDate(f.date_facture)}</td><td>${esc(f.reference || '')}</td><td>${esc(agName(f.agence_id))}</td>
            <td>${esc(f.prestation || f.activite || '')}</td><td>${esc([f.nom_chantier && f.nom_chantier !== c.raison_sociale ? f.nom_chantier : '', f.ville_chantier].filter(Boolean).join(' · '))}</td>
            <td class="num">${fmtEur(f.montant_ht)}</td><td>${esc(f.statut_paiement || f.statut || '')}</td></tr>`).join('')}</tbody></table></div>
        ${fac.length > 15 ? `<p class="cb-sub">15 dernières sur ${fac.length}.</p>` : ''}`
      : `<p class="cb-sub">${fac.length ? 'Aucune facture retenue dans le chiffre d\'affaires.' : 'Aucune facture importée pour ce client.'}</p>`}`;
  }catch(err){
    box.innerHTML = `<h3>${esc(row.nom)}</h3><p class="cb-modal-status err">Erreur : ${esc(err.message)}</p><button class="cb-btn" data-cb-act="close-detail">Fermer</button>`;
  }
}

function openFiche(row){
  const cands = row.siret_candidats || [];
  const modal = el('[data-cb-modal]');
  modal.querySelector('[data-cb-modal-body]').classList.remove('cb-detail');
  modal.querySelector('[data-cb-modal-body]').innerHTML = `
    <h3>${esc(row.nom)}</h3>
    <p class="cb-sub">${esc([row.adresse, row.code_postal, row.ville].filter(Boolean).join(', '))} · ${esc(row.entite)} ${esc(row.source_code_client)}</p>
    ${row.siret ? `<p>SIRET actuel : <strong>${esc(row.siret)}</strong> — ${esc(row.raison_sociale_officielle || '')} (NAF ${esc(row.code_naf || '?')})</p>` : ''}
    <div class="cb-cands">${cands.length ? cands.map((c, i) => `
      <label class="cb-cand"><input type="radio" name="cb-cand" value="${i}" />
        <span><strong>${esc(c.nom)}</strong>${c.enseigne ? ' — ' + esc(c.enseigne) : ''}<br>
        <span class="cb-sub">${esc(c.adresse || c.code_postal)} · SIRET ${esc(c.siret)} · NAF ${esc(c.naf || '?')}${c.etat === 'F' ? ' · <b>fermé</b>' : ''} · score ${c.score}</span></span>
      </label>`).join('') : '<p class="cb-sub">Aucune proposition enregistrée.</p>'}</div>
    <div class="cb-modal-row">
      <input data-cb-manual placeholder="Saisir un SIRET (14 chiffres)" maxlength="20" inputmode="numeric" />
      <button class="cb-btn" data-cb-act="search">Relancer la recherche</button>
    </div>
    <div class="cb-manual-preview" data-cb-preview></div>
    <div class="cb-modal-actions">
      <button class="cb-btn cb-primary" data-cb-act="ok">Valider</button>
      <button class="cb-btn" data-cb-act="none">Aucune entreprise trouvée</button>
      <button class="cb-btn" data-cb-act="perso">C'est un particulier</button>
      <button class="cb-btn" data-cb-act="close">Fermer</button>
    </div>
    <div class="cb-modal-status" data-cb-mstatus></div>`;
  modal.style.display = 'flex';
  const status = (txt, err) => { const x = modal.querySelector('[data-cb-mstatus]'); x.textContent = txt || ''; x.classList.toggle('err', !!err); };
  const busy = on => modal.querySelectorAll('.cb-modal-box button, .cb-modal-box input').forEach(b => { if(b.dataset.cbAct !== 'close') b.disabled = on; });
  const input = modal.querySelector('[data-cb-manual]');
  const preview = modal.querySelector('[data-cb-preview]');
  let manualMatch = null, manualFor = '', manualFailed = false;

  // Aperçu dès que 14 chiffres sont saisis
  async function previewManual(){
    const v = (input.value || '').replace(/\D/g, '');
    manualMatch = null; manualFor = v; manualFailed = false;
    if(v.length !== 14){ preview.textContent = v.length ? `${v.length} / 14 chiffres` : ''; return; }
    preview.textContent = 'Recherche du SIRET dans l\'annuaire…';
    try{
      const m = await lookupSiret(v, row);
      if(manualFor !== v) return;
      manualMatch = m;
      preview.innerHTML = m ? `✔ <strong>${esc(m.nom)}</strong>${m.enseigne ? ' — ' + esc(m.enseigne) : ''} · ${esc(m.adresse)} · NAF ${esc(m.naf || '?')}${m.etat === 'F' ? ' · <b>établissement fermé</b>' : ''}`
                            : '⚠ SIRET introuvable dans l\'annuaire. Il sera enregistré tel quel si vous validez.';
    }catch(e){
      if(manualFor !== v) return;
      manualFailed = true;
      preview.innerHTML = '⚠ ' + esc(e.message) + '. Cliquez sur <strong>Valider</strong> : le SIRET sera enregistré tel quel (nom officiel et NAF complétés plus tard). ' +
        '';
    }
  }
  let t = null;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(previewManual, 350); });

  modal.onclick = async (e) => {
    const act = e.target.dataset && e.target.dataset.cbAct;
    if(e.target === modal || act === 'close'){ modal.style.display = 'none'; return; }
    if(!act || e.target.disabled) return;
    busy(true);
    try{
      if(act === 'search'){
        status('Recherche en cours dans l\'annuaire des entreprises…');
        const c = await findCandidates(row, { attempts: 3, timeout: 8000 });
        await save(row, { siret_candidats: c.slice(0, 5).map(candidateSummary), siret_recherche_le: new Date().toISOString() });
        openFiche(row);
        if(!c.length) el('[data-cb-mstatus]').textContent = 'Aucun établissement trouvé par le nom ni par l\'adresse.';
        return;
      }
      if(act === 'ok'){
        const manual = (input.value || '').replace(/\D/g, '');
        const picked = modal.querySelector('input[name=cb-cand]:checked');
        let m = null;
        if(manual){
          if(manual.length !== 14){ status('Un SIRET compte 14 chiffres.', true); return; }
          status('Enregistrement…');
          if((manualFor !== manual || !manualMatch) && !(manualFor === manual && manualFailed)){
            try{ manualMatch = await lookupSiret(manual, row); manualFor = manual; }
            catch(err){ manualMatch = null; }   // annuaire indisponible : on enregistre quand même le SIRET saisi
          }
          m = manualMatch || { siret: manual, nom: null, raison_sociale: null, score: null };
        } else if(picked){
          m = cands[+picked.value];
        } else { status('Choisissez une proposition ou saisissez un SIRET.', true); return; }
        status('Enregistrement…');
        if(!(await save(row, patchFromMatch(row, m, 'manuel')))){ status('Enregistrement impossible, voir le message en bas de l\'écran.', true); return; }
        toast(m.nom ? `SIRET enregistré : ${m.nom}` : 'SIRET enregistré (détails non récupérés)');
      }
      if(act === 'none') await save(row, { siret_statut: 'introuvable', siret_candidats: null });
      if(act === 'perso') await save(row, patchParticulier(row));
      modal.style.display = 'none';
      render();
    }catch(err){ status('Erreur : ' + err.message, true); }
    finally{ busy(false); }
  };
}

// ---------------------------------------------------------------------------
// Import d'un fichier préparé (.json) : tableau de clients au format de la table,
// avec segment_code (code de client_segments) et groupe_client (nom du groupe).
// Les clients déjà présents (même entité + logiciel + code client) sont ignorés.
// ---------------------------------------------------------------------------
async function importFile(file){
  let data;
  try{ data = JSON.parse(await file.text()); }
  catch(e){ toast('Fichier illisible : ' + e.message); return; }
  if(data && !Array.isArray(data) && data.table === 'factures') return importFactures(file, data);
  if(!Array.isArray(data) || !data.length){ toast('Fichier vide ou mal formé'); return; }
  const entites = [...new Set(data.map(r => r.entite))];
  if(!confirm(`Importer ${fmtNum(data.length)} clients (${entites.length} entités) depuis « ${file.name} » ?\n\nLes clients déjà importés sont ignorés. Gardez l'onglet ouvert pendant l'import.`)) return;
  const prog = el('[data-cb-progress]'), bar = el('[data-cb-bar]'), txt = el('[data-cb-progress-text]');
  prog.style.display = ''; el('[data-cb-stop]').style.display = 'none';
  try{
    const groupes = [...new Set(data.map(r => r.groupe_client).filter(Boolean))];
    for(let i = 0; i < groupes.length; i++){ txt.textContent = `Groupes clients ${i + 1}/${groupes.length}`; await groupIdFor(groupes[i]); }
    const rowsDb = data.map(r => {
      const o = Object.assign({}, r);
      if(!o.source_fichier) o.source_fichier = file.name;
      if(!o.importe_le) o.importe_le = new Date().toISOString();
      o.segment_id = r.segment_code ? (segIdByCode.get(r.segment_code) || null) : null;
      o.group_id = r.groupe_client ? groupIdByName.get(r.groupe_client.trim().toLowerCase()) || null : null;
      delete o.segment_code; delete o.groupe_client;
      return o;
    });
    const step = 500;
    for(let i = 0; i < rowsDb.length; i += step){
      const batch = rowsDb.slice(i, i + step);
      let { error } = await sb.from('clients').upsert(batch, { onConflict: 'entite,source_logiciel,source_code_client', ignoreDuplicates: true });
      if(error){ await sleep(1500); ({ error } = await sb.from('clients').upsert(batch, { onConflict: 'entite,source_logiciel,source_code_client', ignoreDuplicates: true })); }
      if(error) throw new Error(`lot ${i / step + 1} : ${error.message}`);
      bar.style.width = Math.round(100 * Math.min(i + step, rowsDb.length) / rowsDb.length) + '%';
      txt.textContent = `${fmtNum(Math.min(i + step, rowsDb.length))} / ${fmtNum(rowsDb.length)} clients importés`;
    }
    toast(`Import terminé : ${fmtNum(rowsDb.length)} clients traités.`);
    await show(sb, root, scope);
  }catch(e){
    toast('Import interrompu, ' + e.message + '. Relancez l\'import : les clients déjà importés seront ignorés.');
  }finally{
    prog.style.display = 'none'; el('[data-cb-stop]').style.display = '';
  }
}

// ---------------------------------------------------------------------------
// Import d'un fichier de factures préparé : { table: 'factures', rows: [...] }.
// Une facture déjà importée (même logiciel + identifiant source) est mise à jour.
// Les factures sont ensuite rattachées à leur client, puis les adresses de chantier
// sont géolocalisées.
// ---------------------------------------------------------------------------
async function importFactures(file, data){
  const rows = data.rows || [];
  if(!rows.length){ toast('Fichier vide'); return; }
  if(!confirm(`Importer ${fmtNum(rows.length)} factures depuis « ${file.name} » ?\n\nLes factures déjà importées sont mises à jour. Gardez l'onglet ouvert pendant l'import.`)) return;
  const prog = el('[data-cb-progress]'), bar = el('[data-cb-bar]'), txt = el('[data-cb-progress-text]');
  prog.style.display = ''; el('[data-cb-stop]').style.display = 'none';
  try{
    const step = 1000;
    for(let i = 0; i < rows.length; i += step){
      const batch = rows.slice(i, i + step);
      let { error } = await sb.from('factures').upsert(batch, { onConflict: 'source_logiciel,source_id' });
      if(error){ await sleep(2000); ({ error } = await sb.from('factures').upsert(batch, { onConflict: 'source_logiciel,source_id' })); }
      if(error) throw new Error(`lot ${i / step + 1} : ${error.message}`);
      bar.style.width = Math.round(100 * Math.min(i + step, rows.length) / rows.length) + '%';
      txt.textContent = `${fmtNum(Math.min(i + step, rows.length))} / ${fmtNum(rows.length)} factures importées`;
    }
    txt.textContent = 'Rattachement des factures aux clients…';
    const logiciels = [...new Set(rows.map(r => r.source_logiciel).filter(Boolean))];
    let msg = '';
    for(const l of logiciels){
      // le rattachement se fait normalement à l'insertion (déclencheur) ; cet appel rattrape les
      // factures importées avant leurs clients. Un dépassement de délai n'empêche pas la suite.
      const { data: r, error } = await sb.rpc('factures_rattacher_clients', { p_logiciel: l });
      const x = (r && r[0]) || {};
      msg = error ? 'Rattachement aux clients à terminer (délai dépassé)'
                  : `${fmtNum(x.rattachees || 0)} factures rattachées à un client, ${fmtNum(x.sans_client || 0)} sans client`;
    }
    toast(`Import terminé : ${fmtNum(rows.length)} factures. ${msg}. Géolocalisation des chantiers en cours…`);
    const geo = await geocoderChantiers();
    toast(`Import terminé : ${fmtNum(rows.length)} factures. ${msg}. ${fmtNum(geo)} factures géolocalisées.`);
  }catch(e){
    toast('Import interrompu, ' + e.message + '. Relancez l\'import : les factures déjà importées seront mises à jour.');
  }finally{
    prog.style.display = 'none'; el('[data-cb-stop]').style.display = '';
  }
}

// Géolocalisation des adresses de chantier par la Base Adresse Nationale, via le relais
// Supabase « geocodage » (2 000 adresses distinctes par lot). Relançable : seules les
// adresses pas encore traitées sont envoyées.
async function geocoderChantiers(){
  const prog = el('[data-cb-progress]'), txt = el('[data-cb-progress-text]');
  prog.style.display = '';
  let total = 0, lots = 0;
  for(;;){
    const { data: adr, error } = await sb.rpc('factures_adresses_a_geocoder', { p_limite: 800 });
    if(error) throw new Error('géolocalisation : ' + error.message);
    if(!adr || !adr.length) break;
    txt.textContent = `Géolocalisation des chantiers : lot ${++lots} (${fmtNum(total)} factures géolocalisées)`;
    const { data: { session } } = await sb.auth.getSession();
    const resp = await fetch(window.SUPABASE_URL + '/functions/v1/geocodage', { method: 'POST', headers: {
      'Content-Type': 'application/json', apikey: window.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + ((session && session.access_token) || window.SUPABASE_ANON_KEY) },
      body: JSON.stringify({ adresses: adr }) });
    const res = await resp.json().catch(() => null);
    if(!resp.ok || !res || !Array.isArray(res.resultats)) throw new Error('géolocalisation : ' + ((res && res.erreur) || ('erreur ' + resp.status)));
    let { data: n, error: e3 } = await sb.rpc('factures_enregistrer_geocodage', { p_resultats: res.resultats });
    if(e3){   // délai dépassé : on réessaie en deux moitiés
      const h = Math.ceil(res.resultats.length / 2); n = 0;
      for(const part of [res.resultats.slice(0, h), res.resultats.slice(h)]){
        const r2 = await sb.rpc('factures_enregistrer_geocodage', { p_resultats: part });
        if(r2.error) throw new Error('géolocalisation : ' + r2.error.message);
        n += r2.data || 0;
      }
    }
    total += n || 0;
    if(lots > 400) break;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Suppression des doublons (fonction SQL clients_supprimer_doublons) : simulation,
// confirmation, puis suppression. Les devis, factures... suivent la fiche conservée.
// ---------------------------------------------------------------------------
async function removeDuplicates(){
  const btn = el('[data-cb-dedup]');
  btn.disabled = true;
  try{
    const args = { p_agence_id: scope.agenceId || null, p_simulation: true };
    const sim = await sb.rpc('clients_supprimer_doublons', args);
    if(sim.error){
      toast(/clients_supprimer_doublons/.test(sim.error.message) ? "Fonction absente : exécutez data-lake/07-suppression-doublons.sql dans Supabase." : 'Erreur : ' + sim.error.message);
      return;
    }
    const r = (sim.data || [])[0] || {};
    if(!Number(r.fiches_supprimees)){ toast('Aucun doublon trouvé.'); return; }
    if(!confirm(`${fmtNum(r.fiches_supprimees)} fiches en double trouvées (${fmtNum(r.groupes)} clients concernés, dont ${fmtNum(r.dont_particuliers)} fiches de particuliers) pour ${scope.label}.\n\nPour chaque client, une seule fiche est gardée (celle avec SIRET, puis celle modifiée à la main, puis celle avec le plus de devis et factures). Les devis, factures et contrats des fiches supprimées lui sont rattachés.\n\nSupprimer les doublons ?`)) return;
    const res = await sb.rpc('clients_supprimer_doublons', Object.assign(args, { p_simulation: false }));
    if(res.error){ toast('Erreur : ' + res.error.message); return; }
    toast(`${fmtNum(((res.data || [])[0] || {}).fiches_supprimees)} doublons supprimés.`);
    await show(sb, root, scope);
  }finally{ btn.disabled = false; }
}

// ---------------------------------------------------------------------------
// Export CSV (séparateur ; pour Excel)
// ---------------------------------------------------------------------------
function exportCsv(){
  const cols = ['entite','source_logiciel','source_code_client','nom','type_client','adresse','code_postal','ville','email','telephone','solde_actuel','siret','siren','raison_sociale_officielle','enseigne','code_naf','nature_juridique','etat_administratif','siret_statut','groupe_client','segment','segment_source'];
  const cell = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = [cols.join(';')].concat(filtered().map(r => cols.map(c => cell(c === 'segment' ? segLabel(r.segment_id) : r[c])).join(';'))).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `clients-${(scope.label || 'pcp').replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ---------------------------------------------------------------------------
// Montage
// ---------------------------------------------------------------------------
function template(){
  return `
  <div class="cb-head">
    <div class="doc-category-title">📇 Base clients <span data-cb-scope></span></div>
    <div class="cb-kpis" data-cb-kpis></div>
  </div>
  <div class="cb-toolbar">
    <input data-cb-search type="search" placeholder="Rechercher : nom, ville, CP, SIRET, groupe…" />
    <button class="cb-btn" data-cb-clear title="Effacer la recherche et tous les filtres de colonnes">✕ Filtres</button>
    <button class="cb-btn cb-primary" data-cb-enrich>🔎 Rechercher les SIRET</button>
    <button class="cb-btn" data-cb-export>⬇ Export CSV</button>
    <button class="cb-btn" data-cb-dedup title="Supprimer les fiches en double (même entité, nom, adresse, code postal et ville)">🧹 Doublons</button>
    <button class="cb-btn" data-cb-geo title="Géolocaliser les adresses de chantier des factures (reprend là où la dernière géolocalisation s'est arrêtée)">📍 Géolocaliser chantiers</button>
    <label class="cb-btn" title="Importer un fichier de clients ou de factures préparé (.json)">⬆ Importer<input type="file" accept=".json,application/json" data-cb-import hidden /></label>
  </div>
  <div class="cb-progress" data-cb-progress style="display:none;">
    <div class="cb-bar-wrap"><div class="cb-bar" data-cb-bar></div></div>
    <span data-cb-progress-text></span>
    <button class="cb-btn" data-cb-stop>Arrêter</button>
  </div>
  <div class="cb-loading" data-cb-loading></div>
  <div class="cb-table-wrap">
    <table class="cb-table">
      <thead><tr>
        <th data-cb-th-entite class="cb-sort" data-key="entite">Entité <span class="cb-arrow"></span></th>
        <th class="cb-sort" data-key="nom">Client <span class="cb-arrow"></span></th>
        <th class="cb-sort" data-key="type_client">Type <span class="cb-arrow"></span></th>
        <th class="cb-sort" data-key="code_postal">Adresse <span class="cb-arrow"></span></th>
        <th class="cb-sort" data-key="siret_statut">SIRET <span class="cb-arrow"></span></th>
        <th class="cb-sort" data-key="code_naf">NAF <span class="cb-arrow"></span></th>
        <th class="cb-sort" data-key="groupe_client">Groupe client <span class="cb-arrow"></span></th>
        <th class="cb-sort" data-key="segment">Segment <span class="cb-arrow"></span></th>
      </tr>
      <tr class="cb-filters">
        <th data-cb-th-entite><input data-cf="entite" placeholder="Filtrer…" /></th>
        <th><input data-cf="nom" placeholder="Filtrer…" /></th>
        <th><select data-cb-type><option value="">Tous</option><option value="professionnel">Pro</option><option value="particulier">Particulier</option><option value="a_determiner">À déterminer</option></select></th>
        <th><input data-cf="adresse" placeholder="Rue, CP, ville…" /></th>
        <th><select data-cb-statut><option value="">Tous</option>${Object.entries(STATUT_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></th>
        <th><input data-cf="naf" placeholder="ex : 56" /></th>
        <th><input data-cf="groupe" placeholder="Filtrer…" /></th>
        <th><select data-cb-segment></select></th>
      </tr></thead>
      <tbody data-cb-tbody></tbody>
    </table>
  </div>
  <div class="cb-pager">
    <button class="cb-btn" data-cb-prev>←</button>
    <span data-cb-count></span>
    <button class="cb-btn" data-cb-next>→</button>
  </div>
  <div class="cb-modal" data-cb-modal style="display:none;"><div class="cb-modal-box" data-cb-modal-body></div></div>`;
}

function wire(){
  const rerender = () => { page = 0; render(); };
  el('[data-cb-search]').addEventListener('input', rerender);
  root.querySelectorAll('[data-cf]').forEach(i => i.addEventListener('input', rerender));
  el('[data-cb-clear]').addEventListener('click', () => { clearFilters(); rerender(); });
  ['[data-cb-type]', '[data-cb-segment]', '[data-cb-statut]'].forEach(s => el(s).addEventListener('change', rerender));
  el('[data-cb-prev]').addEventListener('click', () => { page--; render(); });
  el('[data-cb-next]').addEventListener('click', () => { page++; render(); });
  el('[data-cb-export]').addEventListener('click', exportCsv);
  el('[data-cb-dedup]').addEventListener('click', removeDuplicates);
  el('[data-cb-geo]').addEventListener('click', async () => {
    const b = el('[data-cb-geo]'); b.disabled = true;
    try{ const n = await geocoderChantiers(); toast(`Géolocalisation terminée : ${fmtNum(n)} factures géolocalisées.`); }
    catch(e){ toast(e.message + '. Relancez : la géolocalisation reprendra où elle s\'est arrêtée.'); }
    finally{ b.disabled = false; el('[data-cb-progress]').style.display = 'none'; }
  });
  el('[data-cb-import]').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if(f) importFile(f); });
  el('[data-cb-enrich]').addEventListener('click', runEnrichment);
  el('[data-cb-stop]').addEventListener('click', () => { if(run) run.stop = true; });
  root.querySelectorAll('.cb-sort').forEach(th => th.addEventListener('click', () => {
    sort = { key: th.dataset.key, dir: sort.key === th.dataset.key ? -sort.dir : 1 }; render();
  }));
  el('[data-cb-tbody]').addEventListener('change', async (e) => {
    const row = rows.find(r => r.id === e.target.dataset.id);
    if(!row) return;
    if(e.target.classList.contains('cb-seg')){
      const v = e.target.value || null;
      if(await save(row, { segment_id: v, segment_source: v ? 'manuel' : null })) { toast('Segment enregistré'); renderKpis(); }
    }
    if(e.target.classList.contains('cb-grp')){
      const v = e.target.value.trim() || null;
      if(await save(row, { groupe_client: v, groupe_source: v ? 'manuel' : null })) toast('Groupe enregistré');
    }
  });
  el('[data-cb-tbody]').addEventListener('click', (e) => {
    const d = e.target.closest && e.target.closest('[data-detail]');
    if(d){ e.preventDefault(); const row = rows.find(r => r.id === d.dataset.detail); if(row) openDetail(row); return; }
    const id = e.target.dataset && e.target.dataset.fiche;
    if(id){ const row = rows.find(r => r.id === id); if(row) openFiche(row); }
  });
}

function clearFilters(){
  el('[data-cb-search]').value = '';
  root.querySelectorAll('[data-cf]').forEach(i => i.value = '');
  ['[data-cb-type]', '[data-cb-segment]', '[data-cb-statut]'].forEach(s => el(s).value = '');
}
// Filtres transmis par l'adresse de la page (ex : lien depuis Déploiement)
function applyFilters(f){
  clearFilters();
  if(!f) return;
  if(f.segment) el('[data-cb-segment]').value = f.segment;
  if(f.type) el('[data-cb-type]').value = f.type;
  if(f.statut) el('[data-cb-statut]').value = f.statut;
}

function fillSegmentFilter(){
  el('[data-cb-segment]').innerHTML = '<option value="">Tous</option><option value="__none__">— Sans segment —</option>' +
    segments.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
}

let mounted = false;
async function show(supabaseClient, container, newScope){
  sb = supabaseClient;
  if(run){ run.stop = true; await sleep(400); }
  if(!mounted || root !== container){
    root = container;
    root.innerHTML = template();
    wire();
    try{ await loadGroups(); }
    catch(e){ toast('Groupes indisponibles : ' + e.message); }
    try{ await loadSegments(); }
    catch(e){ toast('Segments indisponibles : ' + e.message); }
    fillSegmentFilter();
    mounted = true;
  }
  scope = newScope;
  applyFilters(scope.filters);
  el('[data-cb-scope]').textContent = '— ' + scope.label;
  el('[data-cb-loading]').style.display = '';
  el('[data-cb-loading]').textContent = 'Chargement…';
  try{
    await loadRows();
    el('[data-cb-loading]').style.display = rows.length ? 'none' : '';
    el('[data-cb-loading]').textContent = rows.length ? '' : "Aucun client importé pour le moment.";
  }catch(e){
    rows = [];
    el('[data-cb-loading]').textContent = e.message;
  }
  page = 0;
  render();
}

window.CLIENTS_BASE = { show };

})();
