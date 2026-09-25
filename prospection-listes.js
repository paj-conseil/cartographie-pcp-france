// Page de gestion des listes de prospection : création/renommage/suppression de listes,
// consultation et retrait des entreprises, gestion des contacts et des actions
// (appel, RDV, email...) par entreprise, vue tableau condensée et recherche de contacts.
(function(){

const PL = window.PROSPECTION_LISTS;
let lists = [];
let currentListId = null;
let currentItems = [];
let itemsViewMode = 'cards'; // 'cards' | 'table'
const openContactsFor = new Set(); // ids d'entreprises dont le panneau contacts est ouvert
const openActionsFor = new Set();  // ids d'entreprises dont le panneau actions est ouvert
const itemContactsCache = new Map(); // item.id -> contacts déjà chargés (pour le formulaire d'action)

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
    itemContactsCache.clear();
    renderItems();
  }catch(e){
    el('pl-items').innerHTML = '<div class="empty-state">Erreur de chargement : ' + escapeHtml(e.message) + '</div>';
  }
}

function renderItems(){
  if(itemsViewMode === 'table'){
    el('pl-items').style.display = 'none';
    el('pl-items-table-wrap').style.display = 'block';
    renderItemsTable();
  } else {
    el('pl-items').style.display = 'flex';
    el('pl-items-table-wrap').style.display = 'none';
    renderItemsCards();
  }
}

function setViewMode(mode){
  itemsViewMode = mode;
  el('pl-view-cards-btn').classList.toggle('active', mode === 'cards');
  el('pl-view-table-btn').classList.toggle('active', mode === 'table');
  renderItems();
}

// --- Vue fiches --------------------------------------------------------

function renderItemsCards(){
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
    row.querySelector('.pl-item-toggle-contacts').addEventListener('click', ()=> toggleContacts(it));
    row.querySelector('.pl-item-toggle-actions').addEventListener('click', ()=> toggleActions(it));
    row.querySelector('.pl-item-search').addEventListener('click', ()=> PL.openContactSearchModal(it));
  });
}

function itemHtml(it){
  const annuaireUrl = `https://annuaire-entreprises.data.gouv.fr/entreprise/${it.siren}`;
  const contactsOpen = openContactsFor.has(it.id);
  const actionsOpen = openActionsFor.has(it.id);
  return `
    <div class="pl-item" data-id="${it.id}">
      <div class="pl-item-main">
        <div class="pl-item-info">
          <a class="pl-item-name" href="${annuaireUrl}" target="_blank" rel="noopener">${escapeHtml(it.nom || '(nom inconnu)')}</a>
          <div class="pl-item-meta">SIREN ${escapeHtml(it.siren)}${it.cibles ? ' · ' + escapeHtml(it.cibles) : ''}</div>
          <div class="pl-item-addr">${escapeHtml([it.adresse, it.code_postal, it.commune].filter(Boolean).join(' '))}</div>
        </div>
        <div class="pl-item-controls">
          <button type="button" class="pl-item-toggle-contacts">${contactsOpen?'▾':'▸'} Contacts (${it.contact_count||0})</button>
          <button type="button" class="pl-item-toggle-actions">${actionsOpen?'▾':'▸'} Actions (${it.action_count||0})</button>
          <button type="button" class="pl-item-search">🔎 Rechercher des contacts</button>
          <button type="button" class="pl-item-remove">Retirer</button>
        </div>
      </div>

      <div class="pl-item-contacts" style="display:${contactsOpen?'block':'none'};">
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

      <div class="pl-item-actionslist" style="display:${actionsOpen?'block':'none'};">
        <div class="pl-actions-list" data-item="${it.id}"><div class="pl-contacts-loading">Chargement...</div></div>
        <div class="pl-action-form">
          <select class="pl-a-type">
            ${PL.ACTION_TYPES.map(t => `<option value="${t.value}">${t.icon} ${escapeHtml(t.label)}</option>`).join('')}
          </select>
          <select class="pl-a-contact"><option value="">— Entreprise (aucun contact) —</option></select>
          <input type="date" class="pl-a-date" />
          <input type="text" class="pl-a-notes" placeholder="Note (ex : rappeler après 14h)" />
          <button type="button" class="pl-action-add">+ Ajouter l'action</button>
        </div>
      </div>
    </div>
  `;
}

// --- Contacts (vue fiche) ------------------------------------------------

async function toggleContacts(it){
  const row = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-contacts`);
  const btn = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-toggle-contacts`);
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
    itemContactsCache.set(it.id, contacts);
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
          const toggleBtn = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-toggle-contacts`);
          if(toggleBtn) toggleBtn.textContent = `▾ Contacts (${it.contact_count})`;
        }catch(e){ showToast('Erreur : ' + e.message); }
      });
    });
    // Le formulaire d'action référence les contacts : on rafraîchit son menu déroulant
    // si le panneau actions est déjà ouvert pour cette entreprise.
    const contactSelect = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-a-contact`);
    if(contactSelect) fillContactSelect(contactSelect, contacts);
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
      row.querySelector('.pl-item-toggle-contacts').textContent = `▾ Contacts (${it.contact_count})`;
    }catch(e){
      showToast('Erreur : ' + e.message);
    }finally{
      btn.disabled = false;
    }
  };
}

// --- Actions (vue fiche) -------------------------------------------------

function fillContactSelect(select, contacts){
  const current = select.value;
  select.innerHTML = '<option value="">— Entreprise (aucun contact) —</option>' +
    contacts.map(c => `<option value="${c.id}">${escapeHtml([c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact sans nom')}</option>`).join('');
  if(current) select.value = current;
}

async function toggleActions(it){
  const row = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-actionslist`);
  const btn = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-toggle-actions`);
  const isOpen = openActionsFor.has(it.id);
  if(isOpen){
    openActionsFor.delete(it.id);
    row.style.display = 'none';
    btn.textContent = `▸ Actions (${it.action_count||0})`;
    return;
  }
  openActionsFor.add(it.id);
  row.style.display = 'block';
  btn.textContent = `▾ Actions (${it.action_count||0})`;

  const contactSelect = row.querySelector('.pl-a-contact');
  const cachedContacts = itemContactsCache.get(it.id);
  if(cachedContacts){
    fillContactSelect(contactSelect, cachedContacts);
  } else {
    try{
      const contacts = await PL.fetchContacts(it.id);
      itemContactsCache.set(it.id, contacts);
      fillContactSelect(contactSelect, contacts);
    }catch(e){ /* le menu reste limité à "Entreprise" */ }
  }

  await loadActions(it);
  wireActionForm(it);
}

async function loadActions(it){
  const listEl = document.querySelector(`.pl-actions-list[data-item="${it.id}"]`);
  try{
    const actions = await PL.fetchActions(it.id);
    const contacts = itemContactsCache.get(it.id) || [];
    listEl.innerHTML = actions.length
      ? actions.map(a => actionRowHtml(a, contacts)).join('')
      : '<div class="pl-no-actions">Aucune action enregistrée.</div>';
    listEl.querySelectorAll('.pl-action-check').forEach(cb=>{
      cb.addEventListener('change', async ()=>{
        const done = cb.checked;
        try{
          await PL.updateAction(cb.dataset.id, {
            status: done ? 'fait' : 'a_faire',
            completed_at: done ? new Date().toISOString() : null
          });
          const rowEl = cb.closest('.pl-action-row');
          if(rowEl) rowEl.classList.toggle('done', done);
        }catch(e){ showToast('Erreur : ' + e.message); cb.checked = !done; }
      });
    });
    listEl.querySelectorAll('.pl-action-del').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if(!confirm('Supprimer cette action ?')) return;
        try{
          await PL.deleteAction(btn.dataset.id);
          it.action_count = Math.max(0, (it.action_count||1) - 1);
          await loadActions(it);
          const toggleBtn = document.querySelector(`.pl-item[data-id="${it.id}"] .pl-item-toggle-actions`);
          if(toggleBtn) toggleBtn.textContent = `▾ Actions (${it.action_count})`;
        }catch(e){ showToast('Erreur : ' + e.message); }
      });
    });
  }catch(e){
    listEl.innerHTML = '<div class="pl-no-actions">Erreur de chargement des actions.</div>';
  }
}

function actionRowHtml(a, contacts){
  const meta = PL.actionTypeMeta(a.type);
  const contact = contacts.find(c => c.id === a.contact_id);
  const contactLabel = contact ? [contact.prenom, contact.nom].filter(Boolean).join(' ') : null;
  const dateLabel = a.due_at ? new Date(a.due_at).toLocaleDateString('fr-FR') : null;
  const subParts = [contactLabel, dateLabel].filter(Boolean);
  return `
    <div class="pl-action-row ${a.status === 'fait' ? 'done' : ''}">
      <div class="pl-action-left">
        <input type="checkbox" class="pl-action-check" data-id="${a.id}" ${a.status === 'fait' ? 'checked' : ''} />
        <div>
          <div class="pl-action-title">${meta.icon} ${escapeHtml(meta.label)}${a.notes ? ' — ' + escapeHtml(a.notes) : ''}</div>
          ${subParts.length ? `<div class="pl-action-sub">${escapeHtml(subParts.join(' · '))}</div>` : ''}
        </div>
      </div>
      <button type="button" class="pl-action-del" data-id="${a.id}">✕</button>
    </div>
  `;
}

function wireActionForm(it){
  const row = document.querySelector(`.pl-item[data-id="${it.id}"]`);
  const btn = row.querySelector('.pl-action-add');
  btn.onclick = async ()=>{
    const type = row.querySelector('.pl-a-type').value;
    const contactId = row.querySelector('.pl-a-contact').value || null;
    const dateVal = row.querySelector('.pl-a-date').value;
    const notes = row.querySelector('.pl-a-notes').value.trim();
    btn.disabled = true;
    try{
      await PL.createAction(it.id, {
        type,
        contact_id: contactId,
        due_at: dateVal ? new Date(dateVal).toISOString() : null,
        notes: notes || null
      });
      it.action_count = (it.action_count||0) + 1;
      row.querySelector('.pl-a-date').value = '';
      row.querySelector('.pl-a-notes').value = '';
      await loadActions(it);
      row.querySelector('.pl-item-toggle-actions').textContent = `▾ Actions (${it.action_count})`;
    }catch(e){
      showToast('Erreur : ' + e.message);
    }finally{
      btn.disabled = false;
    }
  };
}

// --- Vue tableau condensée -----------------------------------------------

function renderItemsTable(){
  const tbody = el('pl-items-tbody');
  if(!currentItems.length){
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Cette liste ne contient aucune entreprise pour le moment.</td></tr>`;
    return;
  }
  tbody.innerHTML = currentItems.map(it => {
    const annuaireUrl = `https://annuaire-entreprises.data.gouv.fr/entreprise/${it.siren}`;
    return `<tr data-id="${it.id}">
      <td><a href="${annuaireUrl}" target="_blank" rel="noopener">${escapeHtml(it.nom || '(nom inconnu)')}</a></td>
      <td>${escapeHtml(it.siren)}</td>
      <td>${escapeHtml(it.cibles || '')}</td>
      <td>${escapeHtml(it.adresse || '')}</td>
      <td>${escapeHtml(it.code_postal || '')}</td>
      <td>${escapeHtml(it.commune || '')}</td>
      <td>${it.contact_count || 0}</td>
      <td>${it.action_count || 0}</td>
      <td class="col-table-actions">
        <button type="button" class="pl-table-addcontact" data-id="${it.id}">+ Contact</button>
        <button type="button" class="pl-table-addaction" data-id="${it.id}">+ Action</button>
        <button type="button" class="pl-table-remove" data-id="${it.id}">Retirer</button>
      </td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.pl-table-remove').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const it = currentItems.find(x => x.id === btn.dataset.id);
      if(it) removeItem(it);
    });
  });
  tbody.querySelectorAll('.pl-table-addcontact').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const it = currentItems.find(x => x.id === btn.dataset.id);
      if(it) openQuickContactModal(it);
    });
  });
  tbody.querySelectorAll('.pl-table-addaction').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const it = currentItems.find(x => x.id === btn.dataset.id);
      if(it) openQuickActionModal(it);
    });
  });
}

// --- Ajout rapide de contact / action depuis la vue tableau --------------

function injectQuickContactModal(){
  if(el('pl-qcontact-overlay')) return;
  const div = document.createElement('div');
  div.id = 'pl-qcontact-overlay';
  div.className = 'pl-modal-overlay';
  div.innerHTML = `
    <div class="pl-modal-box">
      <h2>Ajouter un contact</h2>
      <p class="pl-modal-sub" id="pl-qcontact-sub"></p>
      <label>Prénom</label>
      <input type="text" id="pl-qc-prenom" />
      <label>Nom</label>
      <input type="text" id="pl-qc-nom" />
      <label>Téléphone</label>
      <input type="tel" id="pl-qc-tel" />
      <label>Email</label>
      <input type="email" id="pl-qc-email" />
      <label>Fonction (optionnel)</label>
      <input type="text" id="pl-qc-fonction" />
      <div id="pl-qcontact-msg" class="pl-modal-msg"></div>
      <div class="pl-modal-actions">
        <button type="button" id="pl-qcontact-cancel">Annuler</button>
        <button type="button" id="pl-qcontact-confirm">+ Ajouter</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  el('pl-qcontact-cancel').addEventListener('click', closeQuickContactModal);
  div.addEventListener('click', (e)=>{ if(e.target === div) closeQuickContactModal(); });
}

function closeQuickContactModal(){
  const o = el('pl-qcontact-overlay');
  if(o) o.classList.remove('show');
}

function openQuickContactModal(it){
  injectQuickContactModal();
  ['pl-qc-prenom','pl-qc-nom','pl-qc-tel','pl-qc-email','pl-qc-fonction'].forEach(id => { el(id).value = ''; });
  el('pl-qcontact-sub').textContent = `Pour ${it.nom || it.siren}`;
  el('pl-qcontact-msg').textContent = '';
  const btn = el('pl-qcontact-confirm');
  btn.disabled = false;
  btn.onclick = async ()=>{
    const prenom = el('pl-qc-prenom').value.trim();
    const nom = el('pl-qc-nom').value.trim();
    const telephone = el('pl-qc-tel').value.trim();
    const email = el('pl-qc-email').value.trim();
    const fonction = el('pl-qc-fonction').value.trim();
    if(!prenom && !nom){ el('pl-qcontact-msg').textContent = 'Indiquez au moins un nom ou un prénom'; return; }
    btn.disabled = true;
    try{
      await PL.createContact(it.id, {
        prenom: prenom || null, nom: nom || null, telephone: telephone || null,
        email: email || null, fonction: fonction || null
      });
      it.contact_count = (it.contact_count||0) + 1;
      itemContactsCache.delete(it.id);
      closeQuickContactModal();
      renderItemsTable();
      showToast('Contact ajouté');
    }catch(e){
      el('pl-qcontact-msg').textContent = 'Erreur : ' + e.message;
    }finally{
      btn.disabled = false;
    }
  };
  el('pl-qcontact-overlay').classList.add('show');
}

function injectQuickActionModal(){
  if(el('pl-qaction-overlay')) return;
  const div = document.createElement('div');
  div.id = 'pl-qaction-overlay';
  div.className = 'pl-modal-overlay';
  div.innerHTML = `
    <div class="pl-modal-box">
      <h2>Ajouter une action</h2>
      <p class="pl-modal-sub" id="pl-qaction-sub"></p>
      <label>Type</label>
      <select id="pl-qa-type">
        ${PL.ACTION_TYPES.map(t => `<option value="${t.value}">${t.icon} ${escapeHtml(t.label)}</option>`).join('')}
      </select>
      <label>Contact concerné</label>
      <select id="pl-qa-contact"><option value="">— Entreprise (aucun contact) —</option></select>
      <label>Échéance (optionnel)</label>
      <input type="date" id="pl-qa-date" />
      <label>Note (optionnel)</label>
      <input type="text" id="pl-qa-notes" placeholder="ex : rappeler après 14h" />
      <div id="pl-qaction-msg" class="pl-modal-msg"></div>
      <div class="pl-modal-actions">
        <button type="button" id="pl-qaction-cancel">Annuler</button>
        <button type="button" id="pl-qaction-confirm">+ Ajouter</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  el('pl-qaction-cancel').addEventListener('click', closeQuickActionModal);
  div.addEventListener('click', (e)=>{ if(e.target === div) closeQuickActionModal(); });
}

function closeQuickActionModal(){
  const o = el('pl-qaction-overlay');
  if(o) o.classList.remove('show');
}

async function openQuickActionModal(it){
  injectQuickActionModal();
  el('pl-qaction-sub').textContent = `Pour ${it.nom || it.siren}`;
  el('pl-qaction-msg').textContent = '';
  el('pl-qa-date').value = '';
  el('pl-qa-notes').value = '';
  el('pl-qa-type').value = 'appel';
  const contactSelect = el('pl-qa-contact');
  contactSelect.innerHTML = '<option value="">— Entreprise (aucun contact) —</option>';
  el('pl-qaction-overlay').classList.add('show');
  let contacts = itemContactsCache.get(it.id);
  if(!contacts){
    try{ contacts = await PL.fetchContacts(it.id); itemContactsCache.set(it.id, contacts); }catch(e){ contacts = []; }
  }
  fillContactSelect(contactSelect, contacts);
  const btn = el('pl-qaction-confirm');
  btn.disabled = false;
  btn.onclick = async ()=>{
    const type = el('pl-qa-type').value;
    const contactId = el('pl-qa-contact').value || null;
    const dateVal = el('pl-qa-date').value;
    const notes = el('pl-qa-notes').value.trim();
    btn.disabled = true;
    try{
      await PL.createAction(it.id, {
        type,
        contact_id: contactId,
        due_at: dateVal ? new Date(dateVal).toISOString() : null,
        notes: notes || null
      });
      it.action_count = (it.action_count||0) + 1;
      closeQuickActionModal();
      renderItemsTable();
      showToast('Action ajoutée');
    }catch(e){
      el('pl-qaction-msg').textContent = 'Erreur : ' + e.message;
    }finally{
      btn.disabled = false;
    }
  };
}

// --- Listes ---------------------------------------------------------------

async function removeItem(it){
  if(!confirm(`Retirer « ${it.nom || it.siren} » de cette liste ?`)) return;
  try{
    await PL.deleteItem(it.id);
    currentItems = currentItems.filter(x => x.id !== it.id);
    itemContactsCache.delete(it.id);
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
  el('pl-view-cards-btn').addEventListener('click', ()=> setViewMode('cards'));
  el('pl-view-table-btn').addEventListener('click', ()=> setViewMode('table'));
}

window.PROSPECTION_LISTES_APP = {boot};

})();
