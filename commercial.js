(function(){

const BUCKET = 'commercial-data';
let sb = null;
let entities = [];
let selectedEntity = null;
let documents = [];
const openBUs = new Set();   // BU dépliées dans le menu de gauche
const closedBUs = new Set();
const ALL = { id: '__all__', name: 'Base clients — toutes entités', address: 'Table clients consolidée PCP France' };

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
  if(!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
}

async function fetchEntities(){
  const {data, error} = await sb.from('agences').select('id, name, address, business_unit').order('name', {ascending:true});
  if(error){ showToast('Erreur de chargement des entités : ' + error.message); return []; }
  return data || [];
}

function renderEntityList(filter){
  const wrap = document.getElementById('entity-picker-list');
  const q = (filter || '').trim().toLowerCase();
  const filtered = entities.filter(e => !q || (e.name||'').toLowerCase().includes(q) || (e.address||'').toLowerCase().includes(q));
  wrap.innerHTML = '';
  // Accès direct à la base clients consolidée, toutes entités confondues
  const all = document.createElement('div');
  all.className = 'entity-picker-row entity-picker-all' + (selectedEntity === ALL ? ' active' : '');
  all.textContent = '📇 Base clients — toutes entités';
  all.addEventListener('click', ()=> selectEntity(ALL));
  wrap.appendChild(all);
  if(!filtered.length){
    wrap.insertAdjacentHTML('beforeend', '<div class="entity-picker-empty">Aucune entité ne correspond.</div>');
    return;
  }
  // Entités regroupées par business unit, chaque BU se déplie avec le bouton +
  const groups = new Map();
  filtered.forEach(e => {
    const bu = (e.business_unit || '').trim() || '';
    if(!groups.has(bu)) groups.set(bu, []);
    groups.get(bu).push(e);
  });
  const order = bu => ({ ES: 1, HGS: 2, SAPA: 3 }[bu] || (bu ? 4 : 9));
  [...groups.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'fr')).forEach(bu => {
    const list = groups.get(bu);
    const hasActive = selectedEntity && (list.some(e => e.id === selectedEntity.id) || (selectedEntity.isBU && selectedEntity.bu === bu));
    const open = !!q || openBUs.has(bu) || (hasActive && !closedBUs.has(bu));
    const head = document.createElement('div');
    head.className = 'bu-row' + (hasActive ? ' bu-has-active' : '');
    head.innerHTML = `<span class="bu-toggle">${open ? '−' : '+'}</span><span class="bu-name">${escapeHtml(bu ? 'BU ' + bu : 'Sans business unit')}</span><span class="bu-count">${list.length}</span>${bu ? `<span class="bu-open" title="Voir la base clients de toute la BU ${escapeHtml(bu)}">📇</span>` : ''}`;
    head.setAttribute('role', 'button');
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    head.addEventListener('click', (ev)=>{
      if(ev.target.classList.contains('bu-open')){ openBUs.add(bu); closedBUs.delete(bu); selectEntity(buEntity(bu)); return; }
      if(open){ openBUs.delete(bu); closedBUs.add(bu); } else { openBUs.add(bu); closedBUs.delete(bu); }
      renderEntityList(document.getElementById('entity-search').value);
    });
    wrap.appendChild(head);
    if(!open) return;
    list.forEach(e=>{
      const row = document.createElement('div');
      row.className = 'entity-picker-row entity-in-bu' + (selectedEntity && selectedEntity.id === e.id ? ' active' : '');
      row.textContent = e.name || '(sans nom)';
      row.addEventListener('click', ()=> selectEntity(e));
      wrap.appendChild(row);
    });
  });
}

// Vue « business unit » : la base clients de toutes les entités d'une BU
function buEntity(bu){
  return { id: '__bu__' + bu, bu, isBU: true, name: 'Base clients — BU ' + bu,
           address: entities.filter(e => (e.business_unit || '') === bu).map(e => e.name.trim()).join(' · ') };
}

async function selectEntity(entity, filters){
  selectedEntity = entity;
  renderEntityList(document.getElementById('entity-search').value);
  document.getElementById('entity-detail-empty').style.display = 'none';
  document.getElementById('entity-detail-content').style.display = 'block';
  document.getElementById('entity-detail-name').textContent = entity.name || '(sans nom)';
  document.getElementById('entity-detail-address').textContent = entity.address || '';
  // Reflète l'entité sélectionnée dans l'URL pour un lien direct depuis la cartographie
  const url = new URL(window.location.href);
  url.searchParams.delete('agence'); url.searchParams.delete('bu'); url.searchParams.delete('segment');
  if(entity.isBU) url.searchParams.set('bu', entity.bu); else url.searchParams.set('agence', entity.id);
  window.history.replaceState({}, '', url);
  const isAll = entity === ALL || entity.isBU;
  document.querySelectorAll('#entity-detail-content .doc-category[data-category], #add-doc-box')
    .forEach(n => { n.style.display = isAll ? 'none' : ''; });
  const scope = entity === ALL ? { agenceId: null, label: 'toutes entités' }
    : entity.isBU ? { agenceId: null, agenceIds: entities.filter(e => (e.business_unit || '') === entity.bu).map(e => e.id), label: 'BU ' + entity.bu }
    : { agenceId: entity.id, label: entity.name || '' };
  scope.filters = filters || null;
  window.CLIENTS_BASE.show(sb, document.getElementById('clients-base-box'), scope);
  if(!isAll) await loadDocuments();
}

async function loadDocuments(){
  if(!selectedEntity) return;
  const {data, error} = await sb.from('entity_documents')
    .select('*')
    .eq('agence_id', selectedEntity.id)
    .order('created_at', {ascending:false});
  if(error){ showToast('Erreur de chargement : ' + error.message); return; }
  documents = data || [];
  renderDocuments();
}

async function fileUrl(doc){
  if(!doc.file_path) return null;
  const {data, error} = await sb.storage.from(BUCKET).createSignedUrl(doc.file_path, 3600);
  if(error) return null;
  return data.signedUrl;
}

function renderDocuments(){
  ['client','facture','devis','autre'].forEach(cat=>{
    const list = document.querySelector(`.doc-list[data-list-for="${cat}"]`);
    const items = documents.filter(d => d.category === cat);
    list.innerHTML = '';
    if(!items.length){
      list.innerHTML = '<div class="doc-empty">Aucune donnée pour le moment.</div>';
      return;
    }
    items.forEach(doc=>{
      const row = document.createElement('div');
      row.className = 'doc-row';
      row.innerHTML = `
        <div class="doc-main">
          <span class="doc-title">${escapeHtml(doc.title)}</span>
          ${doc.file_name ? `<a href="#" class="doc-file-link" data-doc-id="${doc.id}">📎 ${escapeHtml(doc.file_name)}</a>` : ''}
          ${doc.notes ? `<span class="doc-notes">${escapeHtml(doc.notes)}</span>` : ''}
        </div>
        <div class="doc-meta">
          <span>${formatDate(doc.created_at)}</span>
          <button class="doc-delete-btn" data-doc-id="${doc.id}">Supprimer</button>
        </div>
      `;
      const fileLink = row.querySelector('.doc-file-link');
      if(fileLink){
        fileLink.addEventListener('click', async (e)=>{
          e.preventDefault();
          const url = await fileUrl(doc);
          if(url) window.open(url, '_blank');
          else showToast('Fichier introuvable');
        });
      }
      row.querySelector('.doc-delete-btn').addEventListener('click', ()=> deleteDocument(doc));
      list.appendChild(row);
    });
  });
}

async function deleteDocument(doc){
  if(!confirm(`Supprimer "${doc.title}" ?`)) return;
  try{
    if(doc.file_path){
      await sb.storage.from(BUCKET).remove([doc.file_path]);
    }
    const {error} = await sb.from('entity_documents').delete().eq('id', doc.id);
    if(error) throw error;
    showToast('Supprimé');
    await loadDocuments();
  }catch(e){
    showToast('Erreur : ' + e.message);
  }
}

async function addDocument(){
  if(!selectedEntity){ showToast('Sélectionnez une entité'); return; }
  const category = document.getElementById('new-doc-category').value;
  const title = document.getElementById('new-doc-title').value.trim();
  const notes = document.getElementById('new-doc-notes').value.trim();
  const fileInput = document.getElementById('new-doc-file');
  const file = fileInput.files[0];

  if(!title){ showToast('Indiquez un titre'); return; }

  const btn = document.getElementById('add-doc-btn');
  btn.disabled = true;
  btn.textContent = 'Ajout...';

  try{
    let filePath = null, fileName = null;
    if(file){
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      filePath = `${selectedEntity.id}/${category}/${Date.now()}_${safeName}`;
      const {error: uploadErr} = await sb.storage.from(BUCKET).upload(filePath, file);
      if(uploadErr) throw uploadErr;
      fileName = file.name;
    }

    const {data: { user } } = await sb.auth.getUser();
    const {error} = await sb.from('entity_documents').insert({
      agence_id: selectedEntity.id,
      category, title, notes: notes || null,
      file_path: filePath, file_name: fileName,
      uploaded_by: user ? user.id : null
    });
    if(error) throw error;

    document.getElementById('new-doc-title').value = '';
    document.getElementById('new-doc-notes').value = '';
    fileInput.value = '';
    showToast('Ajouté');
    await loadDocuments();
  }catch(e){
    showToast('Erreur : ' + e.message);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Ajouter';
  }
}

async function boot(supabaseClient){
  sb = supabaseClient;
  entities = await fetchEntities();
  renderEntityList('');

  document.getElementById('entity-search').addEventListener('input', (e)=> renderEntityList(e.target.value));
  document.getElementById('add-doc-btn').addEventListener('click', addDocument);

  // Pré-sélection depuis un lien direct (?agence=<id>), par exemple depuis la cartographie
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get('agence'), preBu = params.get('bu');
  const filters = (params.get('segment') || params.get('facture'))
    ? { segment: params.get('segment') || '', facture: params.get('facture') || '' } : null;
  if(preBu){
    await selectEntity(buEntity(preBu), filters);
  } else if(preselect){
    const match = preselect === ALL.id ? ALL : entities.find(e => e.id === preselect);
    if(match) await selectEntity(match, filters);
  }
}

window.COMMERCIAL_APP = { boot };
})();
