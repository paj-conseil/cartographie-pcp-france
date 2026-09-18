(function(){

let sb = null;

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

function formatDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
}

async function fetchProfiles(){
  const {data, error} = await sb.from('profiles').select('*').order('email', {ascending:true});
  if(error){ showToast('Erreur de chargement des comptes : ' + error.message); return []; }
  return data || [];
}

async function fetchRecentPageViews(){
  const sevenDaysAgo = new Date(Date.now() - 7*24*3600*1000).toISOString();
  const {data, error} = await sb.from('page_views')
    .select('user_id, page, viewed_at')
    .gte('viewed_at', sevenDaysAgo)
    .order('viewed_at', {ascending:false})
    .limit(5000);
  if(error){ console.warn('Erreur de chargement des consultations', error.message); return []; }
  return data || [];
}

function buildActivityMap(pageViews){
  const map = {};
  pageViews.forEach(pv=>{
    if(!map[pv.user_id]) map[pv.user_id] = {count:0, lastPage:pv.page, lastAt:pv.viewed_at};
    map[pv.user_id].count++;
  });
  return map;
}

async function updateRole(userId, newRole, selectEl){
  const prevValue = selectEl.dataset.prevValue;
  const {error} = await sb.from('profiles').update({role: newRole}).eq('id', userId);
  if(error){
    showToast('Erreur : ' + error.message);
    selectEl.value = prevValue;
    return;
  }
  selectEl.dataset.prevValue = newRole;
  showToast('Rôle mis à jour');
}

function renderTable(profiles, activity){
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  if(!profiles.length){
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#8a938c; padding:20px;">Aucun compte pour le moment.</td></tr>';
    return;
  }
  profiles.forEach(p=>{
    const act = activity[p.id] || {count:0, lastPage:null, lastAt:null};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.email)}</td>
      <td>
        <select data-user-id="${p.id}" data-prev-value="${p.role}">
          <option value="admin" ${p.role==='admin'?'selected':''}>Administrateur</option>
          <option value="editeur" ${p.role==='editeur'?'selected':''}>Éditeur</option>
          <option value="lecteur" ${p.role==='lecteur'?'selected':''}>Lecteur</option>
        </select>
      </td>
      <td>${formatDate(p.last_login_at)}</td>
      <td>${act.count}</td>
      <td>${act.lastPage ? escapeHtml(act.lastPage) + ' — ' + formatDate(act.lastAt) : '—'}</td>
    `;
    const select = tr.querySelector('select');
    select.addEventListener('change', ()=> updateRole(p.id, select.value, select));
    tbody.appendChild(tr);
  });
}

async function boot(supabaseClient){
  sb = supabaseClient;
  const [profiles, pageViews] = await Promise.all([fetchProfiles(), fetchRecentPageViews()]);
  const activity = buildActivityMap(pageViews);
  renderTable(profiles, activity);
}

window.UTILISATEURS_APP = { boot };
})();
