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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#8a938c; padding:20px;">Aucun compte pour le moment.</td></tr>';
    return;
  }
  profiles.forEach(p=>{
    const act = activity[p.id] || {count:0, lastPage:null, lastAt:null};
    const isSelf = window.AUTH && window.AUTH.user && window.AUTH.user.id === p.id;
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
      <td>
        <button class="reset-pwd-btn" data-user-id="${p.id}" data-user-email="${escapeHtml(p.email)}">Réinitialiser</button>
        ${isSelf ? '' : `<button class="delete-user-btn" data-user-id="${p.id}" data-user-email="${escapeHtml(p.email)}">Supprimer</button>`}
      </td>
    `;
    const select = tr.querySelector('select');
    select.addEventListener('change', ()=> updateRole(p.id, select.value, select));
    const delBtn = tr.querySelector('.delete-user-btn');
    if(delBtn) delBtn.addEventListener('click', ()=> deleteUser(delBtn.dataset.userId, delBtn.dataset.userEmail));
    const resetBtn = tr.querySelector('.reset-pwd-btn');
    if(resetBtn) resetBtn.addEventListener('click', ()=> resetPassword(resetBtn.dataset.userId, resetBtn.dataset.userEmail));
    tbody.appendChild(tr);
  });
}

async function callAdminUsersFunction(payload){
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': window.SUPABASE_ANON_KEY
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(()=> ({}));
  if(!res.ok){
    throw new Error(json.error || `Erreur (${res.status})`);
  }
  return json;
}

async function createUser(){
  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value;
  if(!email || !password){
    showToast('Renseignez un e-mail et un mot de passe');
    return;
  }
  const btn = document.getElementById('add-user-btn');
  btn.disabled = true;
  btn.textContent = 'Création...';
  try{
    await callAdminUsersFunction({action:'create', email, password, role});
    showToast('Compte créé');
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-password').value = '';
    document.getElementById('new-user-role').value = 'lecteur';
    await refresh();
  }catch(e){
    showToast('Erreur : ' + e.message);
  }finally{
    btn.disabled = false;
    btn.textContent = '+ Créer le compte';
  }
}

async function deleteUser(userId, email){
  if(!confirm(`Supprimer définitivement le compte de ${email} ?`)) return;
  try{
    await callAdminUsersFunction({action:'delete', userId});
    showToast('Compte supprimé');
    await refresh();
  }catch(e){
    showToast('Erreur : ' + e.message);
  }
}

async function resetPassword(userId, email){
  const newPassword = prompt(`Nouveau mot de passe pour ${email} (8 caractères minimum) :`);
  if(!newPassword) return;
  if(newPassword.length < 8){
    showToast('Le mot de passe doit faire au moins 8 caractères');
    return;
  }
  try{
    await callAdminUsersFunction({action:'reset_password', userId, password: newPassword});
    showToast('Mot de passe réinitialisé');
  }catch(e){
    showToast('Erreur : ' + e.message);
  }
}

let _profiles = [], _activity = {};
async function refresh(){
  const [profiles, pageViews] = await Promise.all([fetchProfiles(), fetchRecentPageViews()]);
  _profiles = profiles;
  _activity = buildActivityMap(pageViews);
  renderTable(_profiles, _activity);
}

async function boot(supabaseClient){
  sb = supabaseClient;
  document.getElementById('add-user-btn').addEventListener('click', createUser);
  await refresh();
}

window.UTILISATEURS_APP = { boot };
})();
