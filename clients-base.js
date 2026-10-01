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
const API_SPACING_MS = 160;   // ~6 appels/s, sous la limite de 7/s de l'API
const WORKERS = 2;
const COLUMNS = 'id,entite,source_logiciel,source_code_client,nom,type_client,adresse,code_postal,ville,email,telephone,solde_actuel,siret,siren,raison_sociale_officielle,enseigne,code_naf,nature_juridique,etat_administratif,siret_statut,siret_score,siret_candidats,siret_recherche_le,groupe_client,groupe_source,segment,segment_source,classification_motif,notes';

const TYPE_LABELS = { professionnel: 'Pro', particulier: 'Particulier', a_determiner: 'À déterminer' };
const STATUT_LABELS = {
  non_applicable: 'Sans objet', a_rechercher: 'À rechercher', trouve: 'Trouvé',
  a_verifier: 'À vérifier', introuvable: 'Introuvable', manuel: 'Saisi'
};

let sb = null, root = null;
let scope = { agenceId: null, label: '' };
let rows = [];
let segments = REF.SEGMENTS.slice();
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
  const { data, error } = await sb.from('client_segments').select('nom, ordre').order('ordre');
  if(!error && data && data.length) segments = data.map(s => s.nom);
}

async function loadRows(){
  rows = [];
  const step = 1000;
  for(let from = 0; ; from += step){
    let q = sb.from('clients').select(COLUMNS).order('nom').range(from, from + step - 1);
    if(scope.agenceId) q = q.eq('agence_id', scope.agenceId);
    const { data, error } = await q;
    if(error){
      if(/relation .*clients.* does not exist|Could not find the table/i.test(error.message)){
        throw new Error("La table « clients » n'existe pas encore : exécutez setup-clients.sql dans Supabase.");
      }
      throw error;
    }
    rows = rows.concat(data || []);
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
    statut: el('[data-cb-statut]').value
  };
}
function filtered(){
  const f = filters();
  let out = rows.filter(r => {
    if(f.type && r.type_client !== f.type) return false;
    if(f.segment === '__none__' ? r.segment : (f.segment && r.segment !== f.segment)) return false;
    if(f.statut && r.siret_statut !== f.statut) return false;
    if(f.q){
      const hay = REF.norm([r.nom, r.ville, r.code_postal, r.siret, r.groupe_client, r.raison_sociale_officielle, r.enseigne, r.source_code_client, r.email].join(' '));
      if(!f.q.split(' ').every(t => hay.includes(t))) return false;
    }
    return true;
  });
  const k = sort.key, d = sort.dir;
  out.sort((a, b) => {
    const va = a[k], vb = b[k];
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
    ['Sans segment', c(r => !r.segment)]
  ];
  el('[data-cb-kpis]').innerHTML = kpis.map(([l, v]) => `<div class="cb-kpi"><span>${fmtNum(v)}</span>${esc(l)}</div>`).join('');
  const todo = c(r => r.siret_statut === 'a_rechercher');
  const btn = el('[data-cb-enrich]');
  btn.textContent = run ? 'Recherche en cours…' : `🔎 Rechercher les SIRET (${fmtNum(todo)})`;
  btn.disabled = !!run || !todo;
}

function segmentSelect(r){
  const opts = ['<option value="">— à classer —</option>'].concat(segments.map(s => `<option${s === r.segment ? ' selected' : ''}>${esc(s)}</option>`));
  if(r.segment && !segments.includes(r.segment)) opts.push(`<option selected>${esc(r.segment)}</option>`);
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
  el('[data-cb-th-entite]').style.display = showEntite ? '' : 'none';
  el('[data-cb-tbody]').innerHTML = slice.map(r => `
    <tr>
      ${showEntite ? `<td>${esc(r.entite)}</td>` : ''}
      <td><strong>${esc(r.nom)}</strong><div class="cb-sub">${esc(r.source_logiciel)} · ${esc(r.source_code_client)}${r.raison_sociale_officielle && REF.norm(r.raison_sociale_officielle) !== REF.norm(r.nom) ? ' · ' + esc(r.raison_sociale_officielle) : ''}</div></td>
      <td><span class="cb-type cb-type-${r.type_client}">${esc(TYPE_LABELS[r.type_client] || r.type_client)}</span></td>
      <td>${esc([r.code_postal, r.ville].filter(Boolean).join(' '))}</td>
      <td class="cb-siret">${siretCell(r)}</td>
      <td>${esc(r.code_naf || '')}</td>
      <td><input class="cb-grp" data-id="${r.id}" value="${esc(r.groupe_client || '')}" placeholder="—" /></td>
      <td>${segmentSelect(r)}</td>
    </tr>`).join('') || `<tr><td colspan="8" class="cb-empty">Aucun client ne correspond.</td></tr>`;
  el('[data-cb-count]').textContent = `${fmtNum(list.length)} client(s) — page ${page + 1}/${pages}`;
  el('[data-cb-prev]').disabled = page === 0;
  el('[data-cb-next]').disabled = page >= pages - 1;
  root.querySelectorAll('.cb-sort').forEach(th => th.classList.toggle('active', th.dataset.key === sort.key));
}

// ---------------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------------
async function save(row, patch){
  const { error } = await sb.from('clients').update(patch).eq('id', row.id);
  if(error){ toast('Erreur : ' + error.message); return false; }
  Object.assign(row, patch);
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
    if(seg){ patch.segment = seg; patch.segment_source = 'naf'; }
    else if(row.segment === 'B2C Particuliers'){ patch.segment = null; patch.segment_source = null; }
  }
  if(row.groupe_source !== 'manuel'){
    const g = REF.detectGroup([row.nom, m.enseigne, m.raison_sociale, m.nom]);
    if(g){ patch.groupe_client = g; patch.groupe_source = 'mot_cle'; }
    else if(!row.groupe_client || row.groupe_source === 'siren'){
      patch.groupe_client = m.raison_sociale || m.nom || row.nom; patch.groupe_source = 'siren';
    }
  }
  return patch;
}

function patchParticulier(row){
  const patch = { type_client: 'particulier', siret_statut: 'non_applicable', siret_candidats: null, siret_recherche_le: new Date().toISOString() };
  if(row.segment_source !== 'manuel'){ patch.segment = 'B2C Particuliers'; patch.segment_source = 'b2c'; }
  return patch;
}

// ---------------------------------------------------------------------------
// API recherche-entreprises
// ---------------------------------------------------------------------------
let nextSlot = 0;
async function apiSearch(params){
  for(let attempt = 0; attempt < 6; attempt++){
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + API_SPACING_MS;
    if(wait) await sleep(wait);
    const res = await fetch(API_BASE + '?' + new URLSearchParams(params).toString(), { headers: { Accept: 'application/json' } });
    if(res.status === 429 || res.status >= 500){ await sleep(1500 * (attempt + 1)); continue; }
    if(res.status === 400) return []; // requête refusée (nom trop court ou caractères non gérés)
    if(!res.ok) throw new Error('API ' + res.status);
    const json = await res.json();
    return json.results || [];
  }
  throw new Error('API indisponible (limite de débit)');
}

async function findCandidates(row){
  const q = REF.searchQuery(row.nom);
  if(!q) return [];
  const cp = /^\d{5}$/.test(row.code_postal || '') ? row.code_postal : null;
  let results = [];
  if(cp){
    results = await apiSearch({ q, code_postal: cp, per_page: 10 });
    if(!results.length) results = await apiSearch({ q, departement: REF.dept(cp), per_page: 10 });
    if(!results.length && row.type_client === 'professionnel') results = await apiSearch({ q, per_page: 10 });
  } else {
    results = await apiSearch({ q, per_page: 10 });
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
  const minutes = Math.ceil(todo.length * 1.4 * API_SPACING_MS / 60000);
  if(!confirm(`Lancer la recherche de SIRET pour ${fmtNum(todo.length)} clients ?\n\nDurée estimée : ~${minutes} min. Gardez cet onglet ouvert ; vous pouvez arrêter et reprendre à tout moment, rien n'est perdu.`)) return;
  run = { stop: false, done: 0, total: todo.length, found: 0, errors: 0 };
  el('[data-cb-progress]').style.display = '';
  renderKpis();
  let i = 0;
  const worker = async () => {
    while(!run.stop && i < todo.length){
      const row = todo[i++];
      try{ if(await enrichOne(row)) run.found++; }
      catch(e){ run.errors++; console.warn('SIRET', row.nom, e); if(/indisponible/.test(e.message)) await sleep(10000); }
      run.done++;
      updateProgress();
      if(run.done % 25 === 0) render();
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  const r = run; run = null;
  el('[data-cb-progress]').style.display = 'none';
  render();
  toast(`${r.stop ? 'Recherche arrêtée' : 'Recherche terminée'} : ${fmtNum(r.done)} traités, ${fmtNum(r.found)} SIRET trouvés${r.errors ? `, ${r.errors} erreurs (restés « à rechercher »)` : ''}.`);
}

function updateProgress(){
  const pct = Math.round(100 * run.done / run.total);
  el('[data-cb-bar]').style.width = pct + '%';
  el('[data-cb-progress-text]').textContent = `${fmtNum(run.done)} / ${fmtNum(run.total)} — ${fmtNum(run.found)} SIRET trouvés`;
}

// ---------------------------------------------------------------------------
// Fiche SIRET (validation des candidats, saisie manuelle)
// ---------------------------------------------------------------------------
function openFiche(row){
  const cands = row.siret_candidats || [];
  const modal = el('[data-cb-modal]');
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
      <input data-cb-manual placeholder="Saisir un SIRET (14 chiffres)" maxlength="17" />
      <button class="cb-btn" data-cb-act="search">Relancer la recherche</button>
    </div>
    <div class="cb-modal-actions">
      <button class="cb-btn cb-primary" data-cb-act="ok">Valider</button>
      <button class="cb-btn" data-cb-act="none">Aucune entreprise trouvée</button>
      <button class="cb-btn" data-cb-act="perso">C'est un particulier</button>
      <button class="cb-btn" data-cb-act="close">Fermer</button>
    </div>`;
  modal.style.display = 'flex';
  modal.onclick = async (e) => {
    const act = e.target.dataset && e.target.dataset.cbAct;
    if(e.target === modal || act === 'close'){ modal.style.display = 'none'; return; }
    if(!act) return;
    e.target.disabled = true;
    try{
      if(act === 'search'){
        const c = await findCandidates(row);
        await save(row, { siret_candidats: c.slice(0, 5).map(x => ({ siret: x.siret, nom: x.nom, raison_sociale: x.raison_sociale, enseigne: x.enseigne, adresse: x.adresse, code_postal: x.code_postal, naf: x.naf, nature_juridique: x.nature_juridique, etat: x.etat, score: x.score })), siret_recherche_le: new Date().toISOString() });
        openFiche(row); return;
      }
      if(act === 'ok'){
        const manual = (modal.querySelector('[data-cb-manual]').value || '').replace(/\D/g, '');
        const picked = modal.querySelector('input[name=cb-cand]:checked');
        let m = null;
        if(manual){
          if(manual.length !== 14){ toast('Un SIRET compte 14 chiffres'); e.target.disabled = false; return; }
          const res = await apiSearch({ q: manual, per_page: 1 });
          const all = REF.scoreCandidates({ nom: row.nom, code_postal: row.code_postal }, res);
          m = all.find(c => c.siret === manual) || { siret: manual, nom: row.nom, score: null };
        } else if(picked){
          m = cands[+picked.value];
        } else { toast('Choisissez une proposition ou saisissez un SIRET'); e.target.disabled = false; return; }
        await save(row, patchFromMatch(row, m, 'manuel'));
      }
      if(act === 'none') await save(row, { siret_statut: 'introuvable', siret_candidats: null });
      if(act === 'perso') await save(row, patchParticulier(row));
      modal.style.display = 'none';
      render();
    }catch(err){ toast('Erreur : ' + err.message); e.target.disabled = false; }
  };
}

// ---------------------------------------------------------------------------
// Export CSV (séparateur ; pour Excel)
// ---------------------------------------------------------------------------
function exportCsv(){
  const cols = ['entite','source_logiciel','source_code_client','nom','type_client','adresse','code_postal','ville','email','telephone','solde_actuel','siret','siren','raison_sociale_officielle','enseigne','code_naf','nature_juridique','etat_administratif','siret_statut','groupe_client','segment','segment_source'];
  const cell = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = [cols.join(';')].concat(filtered().map(r => cols.map(c => cell(r[c])).join(';'))).join('\r\n');
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
    <select data-cb-type><option value="">Tous types</option><option value="professionnel">Professionnels</option><option value="particulier">Particuliers</option><option value="a_determiner">À déterminer</option></select>
    <select data-cb-segment></select>
    <select data-cb-statut><option value="">Tous statuts SIRET</option>${Object.entries(STATUT_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <button class="cb-btn cb-primary" data-cb-enrich>🔎 Rechercher les SIRET</button>
    <button class="cb-btn" data-cb-export>⬇ Export CSV</button>
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
        <th data-cb-th-entite class="cb-sort" data-key="entite">Entité</th>
        <th class="cb-sort" data-key="nom">Client</th>
        <th class="cb-sort" data-key="type_client">Type</th>
        <th class="cb-sort" data-key="code_postal">CP / Ville</th>
        <th class="cb-sort" data-key="siret_statut">SIRET</th>
        <th class="cb-sort" data-key="code_naf">NAF</th>
        <th class="cb-sort" data-key="groupe_client">Groupe client</th>
        <th class="cb-sort" data-key="segment">Segment</th>
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
  ['[data-cb-type]', '[data-cb-segment]', '[data-cb-statut]'].forEach(s => el(s).addEventListener('change', rerender));
  el('[data-cb-prev]').addEventListener('click', () => { page--; render(); });
  el('[data-cb-next]').addEventListener('click', () => { page++; render(); });
  el('[data-cb-export]').addEventListener('click', exportCsv);
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
      if(await save(row, { segment: v, segment_source: v ? 'manuel' : null })) { toast('Segment enregistré'); renderKpis(); }
    }
    if(e.target.classList.contains('cb-grp')){
      const v = e.target.value.trim() || null;
      if(await save(row, { groupe_client: v, groupe_source: v ? 'manuel' : null })) toast('Groupe enregistré');
    }
  });
  el('[data-cb-tbody]').addEventListener('click', (e) => {
    const id = e.target.dataset && e.target.dataset.fiche;
    if(id){ const row = rows.find(r => r.id === id); if(row) openFiche(row); }
  });
}

function fillSegmentFilter(){
  el('[data-cb-segment]').innerHTML = '<option value="">Tous segments</option><option value="__none__">— Sans segment —</option>' +
    segments.map(s => `<option>${esc(s)}</option>`).join('');
}

let mounted = false;
async function show(supabaseClient, container, newScope){
  sb = supabaseClient;
  if(run){ run.stop = true; await sleep(400); }
  if(!mounted || root !== container){
    root = container;
    root.innerHTML = template();
    wire();
    await loadSegments();
    fillSegmentFilter();
    mounted = true;
  }
  scope = newScope;
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
