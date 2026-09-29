(function(){

let sb = null;
let devisList = [];
let agenceNames = {};
let sortState = {key: null, dir: null};

function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 2500);
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatEuro(n){
  return (Number(n)||0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
}

function formatDate(d){
  if(!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

const STATUS_LABELS = {brouillon:'Brouillon', envoye:'Envoyé', accepte:'Accepté', refuse:'Refusé'};

async function fetchDevis(user){
  const ctx = await window.ENTITY_SCOPE.getContext(sb, user);
  let query = sb.from('devis').select('*, agences(name)').order('created_at', {ascending:false});
  query = window.ENTITY_SCOPE.applyScope(query, ctx, 'agence_id');
  if(!query) return []; // utilisateur sans entité affectée

  const {data, error} = await query;
  if(error){ showToast('Erreur de chargement : ' + error.message); return []; }
  return data || [];
}

function matchesFilters(d, search, status){
  if(status && d.status !== status) return false;
  if(!search) return true;
  const q = search.toLowerCase();
  return [d.numero, d.client_nom, d.client_siren, (d.agences && d.agences.name)]
    .filter(Boolean).some(v => v.toLowerCase().includes(q));
}

function sortValue(d, key){
  switch(key){
    case 'numero': return d.numero || '';
    case 'client': return d.client_nom || '';
    case 'agence': return (d.agences && d.agences.name) || '';
    case 'date': return d.date_devis || null;
    case 'montant': return Number(d.montant_ttc) || 0;
    case 'statut': return STATUS_LABELS[d.status] || d.status || '';
    default: return '';
  }
}

function compareRows(a, b, key, dir){
  const va = sortValue(a, key), vb = sortValue(b, key);
  if(key === 'montant'){
    return dir === 'asc' ? va - vb : vb - va;
  }
  const ea = (va == null || va === ''), eb = (vb == null || vb === '');
  if(ea && eb) return 0;
  if(ea) return 1;
  if(eb) return -1;
  const cmp = String(va).localeCompare(String(vb), 'fr', {numeric:true, sensitivity:'base'});
  return dir === 'asc' ? cmp : -cmp;
}

function applySort(list){
  if(!sortState.key) return list;
  return list.slice().sort((a,b)=> compareRows(a, b, sortState.key, sortState.dir));
}

function updateSortIndicators(){
  document.querySelectorAll('.sort-arrow').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.key === sortState.key && btn.dataset.dir === sortState.dir);
  });
}

function wireSortHeaders(){
  document.querySelectorAll('.sort-arrow').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      sortState = {key: btn.dataset.key, dir: btn.dataset.dir};
      render();
    });
  });
}

function render(){
  const search = document.getElementById('dl-search').value.trim();
  const status = document.getElementById('dl-status-filter').value;
  const filtered = applySort(devisList.filter(d => matchesFilters(d, search, status)));
  updateSortIndicators();

  const tbody = document.getElementById('dl-tbody');
  document.getElementById('dl-empty').style.display = filtered.length ? 'none' : 'block';

  tbody.innerHTML = filtered.map(d => `
    <tr data-id="${d.id}">
      <td>${escapeHtml(d.numero || '—')}</td>
      <td>${escapeHtml(d.client_nom || '—')}</td>
      <td>${escapeHtml((d.agences && d.agences.name) || '—')}</td>
      <td>${formatDate(d.date_devis)}</td>
      <td>${formatEuro(d.montant_ttc)}</td>
      <td>
        <select class="dl-status-select" data-id="${d.id}">
          ${Object.entries(STATUS_LABELS).map(([v,l]) => `<option value="${v}" ${d.status===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </td>
      <td><a class="dl-edit-link" href="devis.html?edit=${d.id}">Ouvrir →</a></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.dl-status-select').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const id = sel.dataset.id;
      const prev = devisList.find(d=>d.id===id).status;
      try{
        const {error} = await sb.from('devis').update({status: sel.value, updated_at: new Date().toISOString()}).eq('id', id);
        if(error) throw error;
        devisList.find(d=>d.id===id).status = sel.value;
        showToast('Statut mis à jour');
      }catch(e){
        sel.value = prev;
        showToast('Erreur : ' + e.message);
      }
    });
  });
}

async function boot(supabaseClient, user){
  sb = supabaseClient;
  devisList = await fetchDevis(user);
  render();
  document.getElementById('dl-search').addEventListener('input', render);
  document.getElementById('dl-status-filter').addEventListener('change', render);
  wireSortHeaders();
}

window.DEVIS_LISTE_APP = { boot };
})();
