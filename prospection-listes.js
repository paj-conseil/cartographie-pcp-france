// Page de gestion des listes de prospection : création/renommage/suppression de listes,
// consultation et retrait des entreprises, et gestion des contacts par entreprise.
(function(){

const PL = window.PROSPECTION_LISTS;
let lists = [];
let currentListId = null;
let currentItems = [];
const openContactsFor = new Set(); // ids d'entreprises dont le panneau contacts est ouvert

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

async function loadLists(){
  lists = await PL.fetchLists(true);
  renderListsPanel();
}

function renderListsPanel(){
  const wrap = el('pl-lists');
  if(!lists.length){
    wrap.innerHTML = '<div class="pl-empty-lists">Aucune liste pour le moment.</div>';
    return;
  }
  wrap.innerHTML = lists.map(l => `
    <button type="button" class="pl-list-item ${l.id===currentListId?'active':''}" data-id="${l.id}">
      <span class="pl-list-name">${escapeHtml(l.name)}</span>
      <span class="pl-list-count">${l.count}</span>
    </button>
  `).join('');
  wrap.querySelectorAll('.pl-list-item').forEach(btn=>{
    btn.addEventListener('click', ()=> selectList(btn.dataset.id));
  });
}

async function selectList(id){
  currentListId = id;
  renderListsPanel();
  el('pl-items-empty').style.display = 'none';
  el('pl-items-content').style.display = 'block';
  const list = lists.find(l => l.id === id);
  el('pl-current-list-name').textContent = list ? list.name : '';
  el('pl-items').innerHTML = '<div class="empty-state">Chargement...</div>';
  try{
    currentItems = await PL.fetchItems(id);
    renderItems();
  }catch(e){
    el('pl-items').innerHTML = '<div class="empty-state">Erreur de chargement : ' + escapeHtml(e.message) + '</div>';
  }
}

function renderItems(){
  const wrap = el('pl-items');
  if(!currentItems.length){
    wrap.innerHTML = '<div class="empty-state">Cette liste ne contient aucune entreprise pour le moment. Ajoutez-en depuis la page Prospection ou sa vue tableau.</div>';
    return;
  }
  wrap.innerHTML = currentItems.map(it => itemHtml(it)).join('');
  currentItems.forEach(it=>{
    const row = wrap.querySelector(`.pl-item[data-id="${it.id}"]`);
    if(!row) return;
    row.querySelector('.pl-item-remove').addEventListener('click', ()=> removeItem(it));
    row.querySelector('.pl-item-toggle').addEventListener('click', ()=> toggleContacts(it));
  });
}

function itemHtml(it){
  const annuaireUrl = `https://annuaire-entreprises.data.gouv.fr/entreprise/${it.siren}`;
  const expanded = openContactsFor.has(it.id);
  return `
    <div class="pl-item" data-id="${it.id}">
      <div class="pl-item-main">
        <div class="pl-item-info">
          <a class="pl-item-name" href="${annuaireUrl}" target="_blank" rel="noopener">${escapeHtml(it.nom || '(nom inconnu)')}</a>
          <div class="pl-item-meta">SIREN ${escapeHtml(it.siren)}${it.cibles ? ' · ' + escapeHtml(it.cibles) : ''}</div>
          <div class="pl-item-addr">${escapeHtml([it.adresse, it.code_postal, it.commune].filter(Boolean).join(' '))}</div>
        </div>
        <div class="pl-item-actions">
          <button type="button" class="pl-item-toggle">${expanded?'▾':'▸'} Contacts (${it.contact_count||0})</button>
          <button type="button" class="pl-item-remove">Retirer</button>
        </div>
      </div>
      <div class="pl-item-contacts" style="display:${expanded?'block':'none'};">
        <div class="pl-contacts-list" data-item="${it.id}"><div class="pl-contacts-loading">Chargement...</div></div>
        <div class="pl-contact-form">
          <input type="text" class="pl-c-prenom" placeholder="Prénom" />
          <input type="text" class="pl-c-nom" placeholder="Nom" />
          <input type="text" class="pl-c-tel" placeholder="Téléphone" />
          <input type="email" class="pl-c-email" placeholder="Email" />
          <input type="text" class="pl-c-fonction" placeholder="Fonction (optionnel)" />
          <button type="button" class="pl-contact-add">+ Ajouter le contact</button>
        </div>
      </div>
    </div>
  `;
}

async function toggleContacts(it){
  const row = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-contacts`);
  const btn = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-toggle`);
  const isOpen = openContactsFor.has(it.id);
  if(isOpen){
    openContactsFor.delete(it.id);
    row.style.display = 'none';
    btn.textContent = `▸ Contacts (${it.contact_count||0})`;
    return;
  }
  openContactsFor.add(it.id);
  row.style.display = 'block';
  btn.textContent = `▾ Contacts (${it.contact_count||0})`;
  await loadContacts(it);
  wireContactForm(it);
}

async function loadContacts(it){
  const listEl = document.querySelector(`.pl-contacts-list[data-item="${it.id}"]`);
  try{
    const contacts = await PL.fetchContacts(it.id);
    listEl.innerHTML = contacts.length
      ? contacts.map(c => contactRowHtml(c)).join('')
      : '<div class="pl-no-contacts">Aucun contact enregistré.</div>';
    listEl.querySelectorAll('.pl-contact-del').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(!confirm('Supprimer ce contact ?')) return;
        try{
          await PL.deleteContact(btn.dataset.id);
          it.contact_count = Math.max(0, (it.contact_count||1) - 1);
          await loadContacts(it);
          const toggleBtn = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-toggle`);
          if(toggleBtn) toggleBtn.textContent = `▾ Contacts (${it.contact_count})`;
        }catch(e){ showToast('Erreur : ' + e.message); }
      });
    });
  }catch(e){
    listEl.innerHTML = '<div class="pl-no-contacts">Erreur de chargement des contacts.</div>';
  }
}

function contactRowHtml(c){
  const tel = c.telephone ? `<a href="tel:${escapeHtml(c.telephone)}">${escapeHtml(c.telephone)}</a>` : '—';
  const mail = c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : '—';
  return `
    <div class="pl-contact-row">
      <div class="pl-contact-id">
        <strong>${escapeHtml([c.prenom, c.nom].filter(Boolean).join(' ') || 'Sans nom')}</strong>
        ${c.fonction ? `<span class="pl-contact-fonction">${escapeHtml(c.fonction)}</span>` : ''}
      </div>
      <div class="pl-contact-coords">${tel} · ${mail}</div>
      <button type="button" class="pl-contact-del" data-id="${c.id}">✕</button>
    </div>
  `;
}

function wireContactForm(it){
  const row = document.querySelector(`.pl-item[data-id="${it.id}"]`);
  const btn = row.querySelector('.pl-contact-add');
  btn.onclick = async ()=>{
    const prenom = row.querySelector('.pl-c-prenom').value.trim();
    const nom = row.querySelector('.pl-c-nom').value.trim();
    const telephone = row.querySelector('.pl-c-tel').value.trim();
    const email = row.querySelector('.pl-c-email').value.trim();
    const fonction = row.querySelector('.pl-c-fonction').value.trim();
    if(!prenom && !nom){ showToast('Indiquez au moins un nom ou un prénom'); return; }
    btn.disabled = true;
    try{
      await PL.createContact(it.id, {
        prenom: prenom || null, nom: nom || null, telephone: telephone || null,
        email: email || null, fonction: fonction || null
      });
      it.contact_count = (it.contact_count||0) + 1;
      row.querySelector('.pl-c-prenom').value = '';
      row.querySelector('.pl-c-nom').value = '';
      row.querySelector('.pl-c-tel').value = '';
      row.querySelector('.pl-c-email').value = '';
      row.querySelector('.pl-c-fonction').value = '';
      await loadContacts(it);
      row.querySelector('.pl-item-toggle').textContent = `▾ Contacts (${it.contact_count})`;
    }catch(e){
      showToast('Erreur : ' + e.message);
    }finally{
      btn.disabled = false;
    }
  };
}

async function removeItem(it){
  if(!confirm(`Retirer « ${it.nom || it.siren} » de cette liste ?`)) return;
  try{
    await PL.deleteItem(it.id);
    currentItems = currentItems.filter(x => x.id !== it.id);
    renderItems();
    const list = lists.find(l => l.id === currentListId);
    if(list) list.count = Math.max(0, list.count - 1);
    renderListsPanel();
  }catch(e){ showToast('Erreur : ' + e.message); }
}

async function createNewList(){
  const name = prompt('Nom de la nouvelle liste de prospection :');
  if(!name || !name.trim()) return;
  try{
    const created = await PL.createList(name.trim());
    await loadLists();
    selectList(created.id);
  }catch(e){ showToast('Erreur : ' + e.message); }
}

async function renameCurrentList(){
  const list = lists.find(l => l.id === currentListId);
  if(!list) return;
  const name = prompt('Nouveau nom de la liste :', list.name);
  if(!name || !name.trim() || name.trim() === list.name) return;
  try{
    await PL.renameList(list.id, name.trim());
    await loadLists();
    selectList(list.id);
  }catch(e){ showToast('Erreur : ' + e.message); }
}

async function deleteCurrentList(){
  const list = lists.find(l => l.id === currentListId);
  if(!list) return;
  if(!confirm(`Supprimer définitivement la liste « ${list.name} » et toutes ses entreprises/contacts ?`)) return;
  try{
    await PL.deleteList(list.id);
    currentListId = null;
    el('pl-items-content').style.display = 'none';
    el('pl-items-empty').style.display = 'block';
    await loadLists();
  }catch(e){ showToast('Erreur : ' + e.message); }
}

async function boot(){
  await loadLists();
  el('pl-new-list-btn').addEventListener('click', createNewList);
  el('pl-rename-list-btn').addEventListener('click', renameCurrentList);
  el('pl-delete-list-btn').addEventListener('click', deleteCurrentList);
}

window.PROSPECTION_LISTES_APP = {boot};

})();
