(function(){

const LOGO_BUCKET = 'entity-logos';
let sb = null;
let entities = [];
let profiles = [];
let selectedEntity = null;
let assignedUserIds = new Set();

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

async function fetchEntities(){
  const {data, error} = await sb.from('agences').select('*').order('name', {ascending:true});
  if(error){ showToast('Erreur de chargement des entités : ' + error.message); return []; }
  return data || [];
}

async function fetchProfiles(){
  const {data, error} = await sb.from('profiles').select('id, email, role').order('email', {ascending:true});
  if(error){ showToast('Erreur de chargement des utilisateurs : ' + error.message); return []; }
  return data || [];
}

function renderEntityList(filter){
  const wrap = document.getElementById('entity-picker-list');
  const q = (filter || '').trim().toLowerCase();
  const filtered = entities.filter(e => !q || (e.name||'').toLowerCase().includes(q) || (e.address||'').toLowerCase().includes(q));
  wrap.innerHTML = '';
  if(!filtered.length){
    wrap.innerHTML = '<div class="entity-picker-empty">Aucune entité ne correspond.</div>';
    return;
  }
  filtered.forEach(e=>{
    const row = document.createElement('div');
    row.className = 'entity-picker-row' + (selectedEntity && selectedEntity.id === e.id ? ' active' : '');
    row.textContent = e.name || '(sans nom)';
    row.addEventListener('click', ()=> selectEntity(e));
    wrap.appendChild(row);
  });
}

async function selectEntity(entity){
  selectedEntity = entity;
  renderEntityList(document.getElementById('entity-search').value);
  document.getElementById('entity-detail-empty').style.display = 'none';
  document.getElementById('entity-detail-content').style.display = 'block';
  document.getElementById('entity-detail-name').textContent = entity.name || '(sans nom)';
  document.getElementById('entity-detail-address').textContent = entity.address || '';

  document.getElementById('fact-name').value = entity.name || '';
  document.getElementById('fact-adresse').value = entity.adresse_postale || '';
  document.getElementById('fact-telephone').value = entity.telephone || '';
  document.getElementById('fact-email').value = entity.email_contact || '';
  document.getElementById('fact-siteweb').value = entity.site_web || '';
  document.getElementById('fact-type').value = entity.type_societe || '';
  document.getElementById('fact-tva').value = entity.tva || '';
  document.getElementById('fact-rcs').value = entity.rcs || '';
  document.getElementById('fact-siret').value = entity.siret || '';
  document.getElementById('fact-ape').value = entity.ape || '';

  const preview = document.getElementById('fact-logo-preview');
  const empty = document.getElementById('fact-logo-empty');
  if(entity.logo_url){
    preview.src = entity.logo_url;
    preview.classList.add('show');
    empty.classList.add('hide');
  }else{
    preview.classList.remove('show');
    empty.classList.remove('hide');
  }

  await loadAssignedUsers();
}

async function loadAssignedUsers(){
  const {data, error} = await sb.from('user_agences').select('user_id').eq('agence_id', selectedEntity.id);
  assignedUserIds = new Set(error ? [] : (data||[]).map(r=>r.user_id));
  renderUsersList();
}

function renderUsersList(){
  const wrap = document.getElementById('fact-users-list');
  if(!profiles.length){
    wrap.innerHTML = '<div class="fact-users-empty">Aucun compte utilisateur.</div>';
    return;
  }
  wrap.innerHTML = profiles.map(p => `
    <label class="fact-user-row">
      <input type="checkbox" data-user-id="${p.id}" ${assignedUserIds.has(p.id) ? 'checked' : ''} />
      ${escapeHtml(p.email)} <span style="opacity:.6;">(${escapeHtml(p.role||'')})</span>
    </label>
  `).join('');
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', async ()=>{
      const userId = cb.dataset.userId;
      try{
        if(cb.checked){
          const {error} = await sb.from('user_agences').insert({user_id: userId, agence_id: selectedEntity.id});
          if(error) throw error;
          assignedUserIds.add(userId);
        }else{
          const {error} = await sb.from('user_agences').delete().eq('user_id', userId).eq('agence_id', selectedEntity.id);
          if(error) throw error;
          assignedUserIds.delete(userId);
        }
        showToast('Affectation mise à jour');
      }catch(e){
        cb.checked = !cb.checked;
        showToast('Erreur : ' + e.message);
      }
    });
  });
}

async function saveEntity(){
  if(!selectedEntity) return;
  const btn = document.getElementById('fact-save-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';
  const patch = {
    name: document.getElementById('fact-name').value.trim() || selectedEntity.name,
    adresse_postale: document.getElementById('fact-adresse').value.trim() || null,
    telephone: document.getElementById('fact-telephone').value.trim() || null,
    email_contact: document.getElementById('fact-email').value.trim() || null,
    site_web: document.getElementById('fact-siteweb').value.trim() || null,
    type_societe: document.getElementById('fact-type').value.trim() || null,
    tva: document.getElementById('fact-tva').value.trim() || null,
    rcs: document.getElementById('fact-rcs').value.trim() || null,
    siret: document.getElementById('fact-siret').value.trim() || null,
    ape: document.getElementById('fact-ape').value.trim() || null
  };
  try{
    const {error} = await sb.from('agences').update(patch).eq('id', selectedEntity.id);
    if(error) throw error;
    Object.assign(selectedEntity, patch);
    const idx = entities.findIndex(e=>e.id===selectedEntity.id);
    if(idx>-1) entities[idx] = selectedEntity;
    document.getElementById('entity-detail-name').textContent = selectedEntity.name;
    renderEntityList(document.getElementById('entity-search').value);
    showToast('Informations enregistrées');
  }catch(e){
    showToast('Erreur : ' + e.message);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Enregistrer les informations';
  }
}

async function uploadLogo(){
  const input = document.getElementById('fact-logo-input');
  const file = input.files[0];
  if(!file || !selectedEntity) return;
  try{
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${selectedEntity.id}/${Date.now()}_${safeName}`;
    const {error: upErr} = await sb.storage.from(LOGO_BUCKET).upload(filePath, file, {upsert:true});
    if(upErr) throw upErr;
    const {data} = sb.storage.from(LOGO_BUCKET).getPublicUrl(filePath);
    const logoUrl = data.publicUrl;
    const {error} = await sb.from('agences').update({logo_url: logoUrl}).eq('id', selectedEntity.id);
    if(error) throw error;
    selectedEntity.logo_url = logoUrl;
    document.getElementById('fact-logo-preview').src = logoUrl;
    document.getElementById('fact-logo-preview').classList.add('show');
    document.getElementById('fact-logo-empty').classList.add('hide');
    showToast('Logo mis à jour');
  }catch(e){
    showToast('Erreur : ' + e.message);
  }finally{
    input.value = '';
  }
}

async function removeLogo(){
  if(!selectedEntity || !selectedEntity.logo_url) return;
  try{
    const {error} = await sb.from('agences').update({logo_url: null}).eq('id', selectedEntity.id);
    if(error) throw error;
    selectedEntity.logo_url = null;
    document.getElementById('fact-logo-preview').classList.remove('show');
    document.getElementById('fact-logo-empty').classList.remove('hide');
    showToast('Logo retiré');
  }catch(e){
    showToast('Erreur : ' + e.message);
  }
}

async function boot(supabaseClient){
  sb = supabaseClient;
  [entities, profiles] = await Promise.all([fetchEntities(), fetchProfiles()]);
  renderEntityList('');

  document.getElementById('entity-search').addEventListener('input', (e)=> renderEntityList(e.target.value));
  document.getElementById('fact-save-btn').addEventListener('click', saveEntity);
  document.getElementById('fact-logo-input').addEventListener('change', uploadLogo);
  document.getElementById('fact-logo-remove').addEventListener('click', removeLogo);
}

window.ADMIN_FACTURATION = { boot };
})();
