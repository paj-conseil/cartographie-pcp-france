// Vue tableau condensée des résultats de prospection : une ligne par entreprise.
// Reçoit les résultats de prospection.html via sessionStorage (clé pcp_prospection_results).
(function(){

let results = [];
const selected = new Set();
let sortState = {key: null, dir: null};

// Icône LinkedIn simplifiée (glyphe "in" générique) pour la colonne Liens.
const LINKEDIN_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>';

// Ordre réel des tranches d'effectif INSEE (voir prospection.js), utilisé pour trier
// la colonne "Effectif" par taille réelle plutôt qu'alphabétiquement sur le libellé.
const EFFECTIF_LABEL_RANK = {
  'Effectif non renseigné': 0, '0 salarié': 1, '1 à 2 salariés': 2, '3 à 5 salariés': 3,
  '6 à 9 salariés': 4, '10 à 19 salariés': 5, '20 à 49 salariés': 6, '50 à 99 salariés': 7,
  '100 à 199 salariés': 8, '200 à 249 salariés': 9, '250 à 499 salariés': 10,
  '500 à 999 salariés': 11, '1 000 à 1 999 salariés': 12, '2 000 à 4 999 salariés': 13,
  '5 000 à 9 999 salariés': 14, '10 000 salariés et plus': 15
};

function el(id){ return document.getElementById(id); }

function formatCA(ca){
  if(ca == null) return '';
  return new Intl.NumberFormat('fr-FR').format(ca) + ' €';
}

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showToast(msg){
  const t = el('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 3000);
}

function loadResults(){
  try{
    const raw = sessionStorage.getItem('pcp_prospection_results');
    results = raw ? JSON.parse(raw) : [];
  }catch(e){
    results = [];
  }
}

function sortValue(r, key){
  switch(key){
    case 'nom': return r.nom || '';
    case 'siren': return r.siren || '';
    case 'cibles': return (r.groupes || (r.groupe ? [r.groupe] : [])).join(' / ');
    case 'adresse': return r.adresse || '';
    case 'cp': return r.cp || '';
    case 'commune': return r.commune || '';
    case 'naf': return r.naf || '';
    case 'effectif': return r.effectif || '';
    case 'ca': return r.ca;
    case 'dirigeant': return r.dirigeant || '';
    case 'distance': return r.distance;
    default: return '';
  }
}

function compareRows(a, b, key, dir){
  let va = sortValue(a, key);
  let vb = sortValue(b, key);
  if(key === 'distance' || key === 'ca'){
    const na = (va == null); const nb = (vb == null);
    if(na && nb) return 0;
    if(na) return 1; // valeurs manquantes toujours en fin, quel que soit le sens
    if(nb) return -1;
    return dir === 'asc' ? va - vb : vb - va;
  }
  if(key === 'effectif'){
    const ra = va ? (EFFECTIF_LABEL_RANK[va] ?? -1) : -1;
    const rb = vb ? (EFFECTIF_LABEL_RANK[vb] ?? -1) : -1;
    if(ra === -1 && rb === -1) return 0;
    if(ra === -1) return 1;
    if(rb === -1) return -1;
    return dir === 'asc' ? ra - rb : rb - ra;
  }
  const ea = !va; const eb = !vb;
  if(ea && eb) return 0;
  if(ea) return 1;
  if(eb) return -1;
  const cmp = String(va).localeCompare(String(vb), 'fr', {numeric:true, sensitivity:'base'});
  return dir === 'asc' ? cmp : -cmp;
}

function applySort(){
  if(!sortState.key) return;
  results.sort((a,b) => compareRows(a, b, sortState.key, sortState.dir));
}

function updateSortIndicators(){
  document.querySelectorAll('.sort-arrow').forEach(btn=>{
    const active = btn.dataset.key === sortState.key && btn.dataset.dir === sortState.dir;
    btn.classList.toggle('active', active);
  });
}

function wireSortHeaders(){
  document.querySelectorAll('.sort-arrow').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      sortState = {key: btn.dataset.key, dir: btn.dataset.dir};
      applySort();
      render();
    });
  });
}

function render(){
  const tbody = el('results-tbody');
  const table = el('results-table');
  const empty = el('empty-state-tableau');
  el('count-text').textContent = results.length + ' cible' + (results.length>1?'s':'') + ' — vue tableau';
  el('export-xlsx').disabled = results.length === 0;
  updateSortIndicators();

  if(!results.length){
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  table.style.display = '';
  empty.style.display = 'none';

  tbody.innerHTML = results.map(r=>{
    const annuaireUrl = `https://www.pappers.fr/entreprise/${r.siren}`;
    // Fiche de l'établissement précis (adresse affichée), distincte du siège social que Pappers
    // affiche par défaut. L'Annuaire des Entreprises propose une page dédiée par SIRET.
    const etabUrl = r.siret ? `https://annuaire-entreprises.data.gouv.fr/etablissement/${r.siret}` : null;
    const linkedinCo = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(r.nom)}`;
    const linkedinDir = r.dirigeant ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(r.dirigeantSearch || r.dirigeant)}` : null;
    const dist = (r.distance != null) ? r.distance.toFixed(1) + ' km' : '—';
    const groupes = (r.groupes || (r.groupe ? [r.groupe] : [])).join(' / ');
    return `<tr data-siren="${r.siren}">
      <td class="col-check"><input type="checkbox" class="row-check" data-siren="${r.siren}" ${selected.has(r.siren) ? 'checked' : ''} /></td>
      <td><a href="${annuaireUrl}" target="_blank" rel="noopener">${escapeHtml(r.nom)}</a></td>
      <td>${escapeHtml(r.siren)}</td>
      <td>${escapeHtml(groupes)}</td>
      <td>${escapeHtml(r.adresse||'')}</td>
      <td>${escapeHtml(r.cp||'')}</td>
      <td>${escapeHtml(r.commune||'')}</td>
      <td>${escapeHtml(r.naf||'')}</td>
      <td>${escapeHtml(r.effectif||'')}</td>
      <td>${r.ca ? escapeHtml(formatCA(r.ca)) + (r.caAnnee ? ' (' + escapeHtml(r.caAnnee) + ')' : '') : '—'}</td>
      <td>${r.dirigeant ? `<a href="${linkedinDir}" target="_blank" rel="noopener" class="linkedin-inline">${escapeHtml(r.dirigeant)}</a>` : '—'}</td>
      <td>${dist}</td>
      <td class="col-links">${etabUrl ? `<a href="${etabUrl}" target="_blank" rel="noopener" class="icon-link" title="Fiche de l'établissement (Annuaire des Entreprises)">📍</a>` : ''}<a href="${linkedinCo}" target="_blank" rel="noopener" class="icon-link icon-linkedin" title="Rechercher les contacts de l'entreprise sur LinkedIn">${LINKEDIN_SVG}</a><button type="button" class="icon-link pl-search-trigger" data-siren="${r.siren}" title="Rechercher des contacts (Google, LinkedIn, Société.com, Pappers, Annuaire)">🔎</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.row-check').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const siren = cb.dataset.siren;
      if(cb.checked) selected.add(siren); else selected.delete(siren);
      updateSelectionBar();
    });
  });
  tbody.querySelectorAll('.pl-search-trigger').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const r = results.find(x => x.siren === btn.dataset.siren);
      if(r) window.PROSPECTION_LISTS.openContactSearchModal(r);
    });
  });
}

function updateSelectionBar(){
  const bar = el('selection-bar');
  const n = selected.size;
  if(n === 0){ bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  el('selection-count').textContent = n + ' entreprise' + (n>1?'s':'') + ' sélectionnée' + (n>1?'s':'');
}

function exportXlsx(){
  if(!results.length) return;
  const headers = ['Raison sociale','SIREN','SIRET','Cible(s)','Adresse','Code postal','Commune','NAF','Effectif','CA','Année CA','Dirigeant','Distance (km)','Fiche entreprise (siège)','Fiche établissement'];
  const rows = results.map(r => [
    r.nom, r.siren, r.siret||'', (r.groupes||[]).join(' / '), r.adresse||'', r.cp||'', r.commune||'',
    r.naf||'', r.effectif||'', r.ca||'', r.caAnnee||'', r.dirigeant||'', r.distance!=null ? Number(r.distance.toFixed(1)) : '',
    'https://www.pappers.fr/entreprise/' + r.siren,
    r.siret ? 'https://annuaire-entreprises.data.gouv.fr/etablissement/' + r.siret : ''
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    {wch:30}, {wch:12}, {wch:16}, {wch:28}, {wch:30}, {wch:10}, {wch:20},
    {wch:8}, {wch:18}, {wch:16}, {wch:10}, {wch:22}, {wch:12}, {wch:45}, {wch:55}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Prospection');
  const dateStr = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `prospection-pcp-${dateStr}.xlsx`);
}

async function boot(){
  loadResults();
  wireSortHeaders();
  render();
  el('export-xlsx').addEventListener('click', exportXlsx);
  el('select-all-btn').addEventListener('click', ()=>{
    results.forEach(r => selected.add(r.siren));
    document.querySelectorAll('.row-check').forEach(c => c.checked = true);
    updateSelectionBar();
  });
  el('select-none-btn').addEventListener('click', ()=>{
    selected.clear();
    document.querySelectorAll('.row-check').forEach(c => c.checked = false);
    updateSelectionBar();
  });
  el('clear-selection-btn').addEventListener('click', ()=>{
    selected.clear();
    document.querySelectorAll('.row-check').forEach(c => c.checked = false);
    updateSelectionBar();
  });
  el('add-to-list-btn').addEventListener('click', ()=>{
    const rows = results.filter(r => selected.has(r.siren));
    window.PROSPECTION_LISTS.openAddToListModal(rows, ()=>{});
  });
  if(!results.length){
    showToast('Aucun résultat reçu depuis la page Prospection');
  }
}

window.PROSPECTION_TABLEAU = {boot};

})();
