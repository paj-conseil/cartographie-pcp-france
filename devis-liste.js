(function(){

let sb = null;
let devisList = [];
let agenceNames = {};

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

function render(){
  const search = document.getElementById('dl-search').value.trim();
  const status = document.getElementById('dl-status-filter').value;
  const filtered = devisList.filter(d => matchesFilters(d, search, status));

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
}

window.DEVIS_LISTE_APP = { boot };
})();
