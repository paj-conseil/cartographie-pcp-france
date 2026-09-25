// Module partagé : listes de prospection (création, ajout d'entreprises dédoublonné
// par SIREN, contacts par entreprise). Utilisé par prospection.html,
// prospection-tableau.html et prospection-listes.html.
(function(){

let sb = null;
let cachedLists = null; // [{id, name, count}]

function el(id){ return document.getElementById(id); }

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function toast(msg){
  const t = el('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.remove('show'), 3000);
}

async function ensureSb(){
  if(!sb) sb = (window.AUTH && window.AUTH.sb) || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return sb;
}

// --- Listes -----------------------------------------------------------

async function fetchLists(force){
  await ensureSb();
  if(cachedLists && !force) return cachedLists;
  const { data, error } = await sb
    .from('prospection_lists')
    .select('id,name,created_at,prospection_list_items(count)')
    .order('created_at', {ascending:false});
  if(error){ console.error(error); return []; }
  cachedLists = (data||[]).map(l => ({
    id: l.id,
    name: l.name,
    count: (l.prospection_list_items && l.prospection_list_items[0] && l.prospection_list_items[0].count) || 0
  }));
  return cachedLists;
}

async function createList(name){
  await ensureSb();
  const { data, error } = await sb.from('prospection_lists').insert({name}).select().single();
  if(error) throw error;
  cachedLists = null;
  return data;
}

async function renameList(id, name){
  await ensureSb();
  const { error } = await sb.from('prospection_lists').update({name, updated_at: new Date().toISOString()}).eq('id', id);
  if(error) throw error;
  cachedLists = null;
}

async function deleteList(id){
  await ensureSb();
  const { error } = await sb.from('prospection_lists').delete().eq('id', id);
  if(error) throw error;
  cachedLists = null;
}

// --- Entreprises d'une liste --------------------------------------------

function rowToItem(r, listId, userId){
  return {
    list_id: listId,
    siren: r.siren,
    siret: r.siret || null,
    nom: r.nom || null,
    adresse: r.adresse || null,
    code_postal: r.cp || r.code_postal || null,
    commune: r.commune || null,
    naf: r.naf || null,
    dirigeant: r.dirigeant || null,
    cibles: (r.groupes && r.groupes.join(' / ')) || r.groupe || r.cibles || null,
    distance_km: (typeof r.distance === 'number') ? r.distance : (r.distance_km != null ? r.distance_km : null),
    data: r,
    added_by: userId || null
  };
}

async function addItemsToList(listId, rows){
  await ensureSb();
  const userId = (window.AUTH && window.AUTH.user && window.AUTH.user.id) || null;
  const items = (rows||[]).filter(r => r && r.siren).map(r => rowToItem(r, listId, userId));
  if(!items.length) return {count:0};
  const { error } = await sb.from('prospection_list_items').upsert(items, {onConflict:'list_id,siren'});
  if(error) throw error;
  cachedLists = null;
  return {count: items.length};
}

async function fetchItems(listId){
  await ensureSb();
  const { data, error } = await sb
    .from('prospection_list_items')
    .select('*, prospection_contacts(count)')
    .eq('list_id', listId)
    .order('added_at', {ascending:false});
  if(error) throw error;
  return (data||[]).map(it => Object.assign({}, it, {
    contact_count: (it.prospection_contacts && it.prospection_contacts[0] && it.prospection_contacts[0].count) || 0
  }));
}

async function deleteItem(itemId){
  await ensureSb();
  const { error } = await sb.from('prospection_list_items').delete().eq('id', itemId);
  if(error) throw error;
}

// --- Contacts --------------------------------------------------------------

async function fetchContacts(itemId){
  await ensureSb();
  const { data, error } = await sb.from('prospection_contacts').select('*').eq('list_item_id', itemId).order('created_at', {ascending:true});
  if(error) throw error;
  return data || [];
}

async function createContact(itemId, contact){
  await ensureSb();
  const userId = (window.AUTH && window.AUTH.user && window.AUTH.user.id) || null;
  const payload = Object.assign({list_item_id: itemId, created_by: userId}, contact);
  const { data, error } = await sb.from('prospection_contacts').insert(payload).select().single();
  if(error) throw error;
  return data;
}

async function updateContact(contactId, contact){
  await ensureSb();
  const { error } = await sb.from('prospection_contacts').update(contact).eq('id', contactId);
  if(error) throw error;
}

async function deleteContact(contactId){
  await ensureSb();
  const { error } = await sb.from('prospection_contacts').delete().eq('id', contactId);
  if(error) throw error;
}

// --- Widget "Ajouter à une liste" --------------------------------------

function injectModal(){
  if(el('pl-addlist-overlay')) return;
  const div = document.createElement('div');
  div.id = 'pl-addlist-overlay';
  div.className = 'pl-modal-overlay';
  div.innerHTML = `
    <div class="pl-modal-box">
      <h2>Ajouter à une liste de prospection</h2>
      <p class="pl-modal-sub" id="pl-addlist-count"></p>
      <label for="pl-addlist-select">Liste existante</label>
      <select id="pl-addlist-select"></select>
      <div class="pl-modal-or">ou</div>
      <label for="pl-addlist-newname">Créer une nouvelle liste</label>
      <input id="pl-addlist-newname" type="text" placeholder="Ex : Prospection Q1 - Île-de-France" />
      <div id="pl-addlist-msg" class="pl-modal-msg"></div>
      <div class="pl-modal-actions">
        <button id="pl-addlist-cancel" type="button">Annuler</button>
        <button id="pl-addlist-confirm" type="button">Ajouter</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  el('pl-addlist-cancel').addEventListener('click', closeAddListModal);
  div.addEventListener('click', (e)=>{ if(e.target === div) closeAddListModal(); });
}

function closeAddListModal(){
  const o = el('pl-addlist-overlay');
  if(o) o.classList.remove('show');
}

async function openAddToListModal(rows, onDone){
  if(!rows || !rows.length){ toast('Sélectionnez au moins une entreprise'); return; }
  injectModal();
  const lists = await fetchLists(true);
  const select = el('pl-addlist-select');
  select.innerHTML = lists.length
    ? lists.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${l.count})</option>`).join('')
    : '<option value="">— Aucune liste existante —</option>';
  el('pl-addlist-count').textContent = rows.length + ' entreprise' + (rows.length>1?'s':'') + ' sélectionnée' + (rows.length>1?'s':'');
  el('pl-addlist-newname').value = '';
  el('pl-addlist-msg').textContent = '';
  el('pl-addlist-overlay').classList.add('show');

  const confirmBtn = el('pl-addlist-confirm');
  confirmBtn.onclick = async ()=>{
    const newName = el('pl-addlist-newname').value.trim();
    const msg = el('pl-addlist-msg');
    msg.textContent = '';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Ajout en cours...';
    try{
      let listId = select.value;
      let listName = lists.find(l => l.id === listId) ? lists.find(l => l.id === listId).name : '';
      if(newName){
        const created = await createList(newName);
        listId = created.id;
        listName = created.name;
      }
      if(!listId){ msg.textContent = 'Choisissez une liste existante ou créez-en une.'; return; }
      const res = await addItemsToList(listId, rows);
      toast(res.count + ' entreprise(s) ajoutée(s) à « ' + listName + ' »');
      closeAddListModal();
      if(onDone) onDone(listId);
    }catch(e){
      msg.textContent = 'Erreur : ' + e.message;
    }finally{
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Ajouter';
    }
  };
}

window.PROSPECTION_LISTS = {
  fetchLists, createList, renameList, deleteList,
  addItemsToList, fetchItems, deleteItem,
  fetchContacts, createContact, updateContact, deleteContact,
  openAddToListModal
};

})();
