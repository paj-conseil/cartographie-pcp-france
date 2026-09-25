// Vue tableau condensée des résultats de prospection : une ligne par entreprise.
// Reçoit les résultats de prospection.html via sessionStorage (clé pcp_prospection_results).
(function(){

let results = [];
const selected = new Set();

function el(id){ return document.getElementById(id); }

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

function render(){
  const tbody = el('results-tbody');
  const table = el('results-table');
  const empty = el('empty-state-tableau');
  el('count-text').textContent = results.length + ' cible' + (results.length>1?'s':'') + ' — vue tableau';
  el('export-xlsx').disabled = results.length === 0;

  if(!results.length){
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  table.style.display = '';
  empty.style.display = 'none';

  tbody.innerHTML = results.map(r=>{
    const annuaireUrl = `https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`;
    const linkedinCo = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent([r.nom, r.commune].filter(Boolean).join(' '))}`;
    const linkedinDir = r.dirigeant ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(r.dirigeantSearch || r.dirigeant)}&currentCompany=${encodeURIComponent(r.nom)}` : null;
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
      <td>${r.dirigeant ? `<a href="${linkedinDir}" target="_blank" rel="noopener" class="linkedin-inline">${escapeHtml(r.dirigeant)}</a>` : '—'}</td>
      <td>${dist}</td>
      <td class="col-links"><a href="${linkedinCo}" target="_blank" rel="noopener" class="result-link linkedin">LinkedIn</a></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.row-check').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const siren = cb.dataset.siren;
      if(cb.checked) selected.add(siren); else selected.delete(siren);
      updateSelectionBar();
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
  const headers = ['Raison sociale','SIREN','SIRET','Cible(s)','Adresse','Code postal','Commune','NAF','Dirigeant','Distance (km)','Fiche'];
  const rows = results.map(r => [
    r.nom, r.siren, r.siret||'', (r.groupes||[]).join(' / '), r.adresse||'', r.cp||'', r.commune||'',
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

async function boot(){
  loadResults();
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
