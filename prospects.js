// Page "Prospects" du module CRM : vue consolidée de toutes les entreprises/contacts
// présents dans une liste de prospection (quelle qu'elle soit) et/ou ayant eu une visite
// de site (rdv_prospects), même si cette visite a été faite hors d'une liste. Permet aussi
// l'ajout manuel d'un prospect rencontré directement sur le terrain (stocké dans une liste
// dédiée "Prospects — ajouts manuels" pour réutiliser telle quelle l'infrastructure des
// listes de prospection, sans changement de schéma).
(function(){

// Les ajouts manuels sont stockés dans une liste dédiée par entité (une liste ne peut
// appartenir qu'à une seule entité) : "Prospects — ajouts manuels (<Entité>)".
const MANUAL_LIST_PREFIX = 'Prospects — ajouts manuels';
let sb = null;
let scopeCtx = null; // {isAdmin, agences, agenceIds}
let rows = []; // entrées consolidées, une par SIREN (ou pseudo-SIREN pour les ajouts manuels)

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

function formatDate(d){
  if(!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

function looksLikeRealSiren(siren){
  return /^\d{9}$/.test(String(siren||''));
}

function genPlaceholderSiren(){
  return 'M' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
}

// --- Chargement et consolidation --------------------------------------------

async function loadRows(){
  scopeCtx = await window.ENTITY_SCOPE.getContext(sb, window.AUTH.user);
  if(!scopeCtx.isAdmin && !scopeCtx.agenceIds.length){ rows = []; return; }

  let itemsQuery = sb.from('prospection_list_items')
    .select('*, prospection_lists' + (scopeCtx.isAdmin ? '' : '!inner') + '(name,agence_id), prospection_contacts(*)')
    .order('added_at', {ascending:false});
  let rdvQuery = sb.from('rdv_prospects').select('siren, nom_entreprise, adresse, commune, date_rdv, commercial, agence_id');
  if(!scopeCtx.isAdmin){
    itemsQuery = itemsQuery.in('prospection_lists.agence_id', scopeCtx.agenceIds);
    rdvQuery = rdvQuery.in('agence_id', scopeCtx.agenceIds);
  }

  const [{data: items, error: e1}, {data: rdvRows, error: e2}] = await Promise.all([itemsQuery, rdvQuery]);
  if(e1) console.error(e1);
  if(e2) console.error(e2);

  const map = new Map();

  (items||[]).forEach(it=>{
    const key = it.siren;
    if(!map.has(key)){
      map.set(key, {
        siren: it.siren, nom: it.nom, adresse: it.adresse, cp: it.code_postal, commune: it.commune,
        listes: [], manual: false, primaryItemId: it.id, contacts: [], visite: null
      });
    }
    const entry = map.get(key);
    const listName = (it.prospection_lists && it.prospection_lists.name) || null;
    if(listName && listName.indexOf(MANUAL_LIST_PREFIX) === 0){
      entry.manual = true;
    } else if(listName && entry.listes.indexOf(listName) === -1){
      entry.listes.push(listName);
    }
    (it.prospection_contacts||[]).forEach(c => entry.contacts.push(Object.assign({}, c, {list_item_id: it.id})));
  });

  (rdvRows||[]).forEach(r=>{
    let entry = map.get(r.siren);
    if(!entry){
      entry = {
        siren: r.siren, nom: r.nom_entreprise, adresse: r.adresse, cp: '', commune: r.commune,
        listes: [], manual: false, primaryItemId: null, contacts: [], visite: null
      };
      map.set(r.siren, entry);
    }
    entry.visite = { date: r.date_rdv, commercial: r.commercial };
  });

  rows = Array.from(map.values()).sort((a,b)=> (a.nom||'').localeCompare(b.nom||'', 'fr'));
}

// --- Rendu -------------------------------------------------------------------

function rdvUrlFor(entry, contact){
  const params = new URLSearchParams({
    list_item_id: (contact ? contact.list_item_id : entry.primaryItemId) || '',
    contact_id: contact ? (contact.id || '') : '',
    siren: looksLikeRealSiren(entry.siren) ? entry.siren : '',
    nom: entry.nom || '',
    adresse: entry.adresse || '',
    cp: entry.cp || '',
    commune: entry.commune || '',
    contact_nom: contact ? [contact.prenom, contact.nom].filter(Boolean).join(' ') : '',
    contact_email: contact ? (contact.email || '') : '',
    contact_tel: contact ? (contact.telephone || '') : ''
  });
  return 'rdv.html?' + params.toString();
}

function devisUrlFor(entry, contact){
  const params = new URLSearchParams({
    list_item_id: (contact ? contact.list_item_id : entry.primaryItemId) || '',
    contact_id: contact ? (contact.id || '') : '',
    nom: entry.nom || '',
    siren: looksLikeRealSiren(entry.siren) ? entry.siren : '',
    adresse: entry.adresse || '',
    cp: entry.cp || '',
    commune: entry.commune || '',
    contact_nom: contact ? [contact.prenom, contact.nom].filter(Boolean).join(' ') : '',
    contact_email: contact ? (contact.email || '') : '',
    contact_tel: contact ? (contact.telephone || '') : ''
  });
  return 'devis.html?' + params.toString();
}

function contactRowHtml(c){
  const tel = c.telephone ? `<a href="tel:${escapeHtml(c.telephone)}">${escapeHtml(c.telephone)}</a>` : '—';
  const mail = c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : '—';
  return `
    <div class="pl-contact-row">
      <div><strong>${escapeHtml([c.prenom, c.nom].filter(Boolean).join(' ') || 'Sans nom')}</strong>
        ${c.fonction ? `<span class="pl-contact-fonction">${escapeHtml(c.fonction)}</span>` : ''}
      </div>
      <div class="pl-contact-coords">${tel} · ${mail}</div>
      <div class="crm-row-actions">
        <a class="icon-link" data-contact-id="${c.id}" href="#" title="Visite de site avec ce contact">📋</a>
        <a class="icon-link" data-contact-id="${c.id}" href="#" title="Faire une proposition de devis">💰</a>
      </div>
    </div>
  `;
}

function matchesFilters(entry, search, visiteFilter){
  if(visiteFilter === 'oui' && !entry.visite) return false;
  if(visiteFilter === 'non' && entry.visite) return false;
  if(!search) return true;
  const q = search.toLowerCase();
  const haystack = [entry.nom, entry.commune, entry.siren]
    .concat(entry.contacts.map(c => [c.prenom, c.nom, c.email, c.telephone].filter(Boolean).join(' ')))
    .filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function render(){
  const search = el('pr-search').value.trim();
  const visiteFilter = el('pr-visite-filter').value;
  const filtered = rows.filter(r => matchesFilters(r, search, visiteFilter));

  el('pr-empty').style.display = filtered.length ? 'none' : 'block';

  el('pr-tbody').innerHTML = filtered.map((entry, idx)=>{
    const listesBadges = entry.listes.map(l => `<span class="crm-badge crm-badge-list">${escapeHtml(l)}</span>`).join('')
      + (entry.manual ? `<span class="crm-badge crm-badge-manual">Ajout manuel</span>` : '')
      || `<span class="crm-badge crm-badge-none">—</span>`;
    const visiteBadge = entry.visite
      ? `<span class="crm-badge crm-badge-visited">Visitée le ${formatDate(entry.visite.date)}</span>`
      : `<span class="crm-badge crm-badge-none">Non visitée</span>`;
    const contactsSummary = entry.contacts.length
      ? `<button type="button" class="crm-contact-toggle" data-idx="${idx}">${entry.contacts.length} contact${entry.contacts.length>1?'s':''} ▾</button>
         <div class="crm-contact-list" id="pr-contacts-${idx}" style="display:none;"></div>`
      : '<span class="crm-badge crm-badge-none">Aucun</span>';
    return `
      <tr data-idx="${idx}">
        <td><strong>${escapeHtml(entry.nom || 'Sans nom')}</strong>${looksLikeRealSiren(entry.siren) ? `<div style="color:#8a938c;font-size:11px;">SIREN ${escapeHtml(entry.siren)}</div>` : ''}</td>
        <td>${escapeHtml(entry.commune || '—')}</td>
        <td>${listesBadges}</td>
        <td>${contactsSummary}</td>
        <td>${visiteBadge}</td>
        <td class="crm-row-actions">
          <a class="icon-link" href="${rdvUrlFor(entry)}" title="Visite de site">📋</a>
          <a class="icon-link" href="${devisUrlFor(entry)}" title="Faire une proposition de devis">💰</a>
        </td>
      </tr>
    `;
  }).join('');

  el('pr-tbody').querySelectorAll('.crm-contact-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = btn.dataset.idx;
      const entry = filtered[idx];
      const wrap = el('pr-contacts-' + idx);
      const opening = wrap.style.display === 'none';
      wrap.style.display = opening ? 'block' : 'none';
      btn.textContent = entry.contacts.length + ' contact' + (entry.contacts.length>1?'s':'') + (opening ? ' ▴' : ' ▾');
      if(opening && !wrap.dataset.rendered){
        wrap.innerHTML = entry.contacts.map(contactRowHtml).join('');
        wrap.querySelectorAll('a[data-contact-id]').forEach(a=>{
          const contact = entry.contacts.find(c => c.id === a.dataset.contactId);
          a.href = a.title.indexOf('Visite') === 0 ? rdvUrlFor(entry, contact) : devisUrlFor(entry, contact);
        });
        wrap.dataset.rendered = '1';
      }
    });
  });
}

// --- Ajout manuel --------------------------------------------------------------

// Une liste ne peut appartenir qu'à une seule entité : les ajouts manuels vivent donc
// dans une liste dédiée par entité, retrouvée (ou créée) par son nom.
async function getOrCreateManualListId(agenceId, agenceName){
  const manualName = MANUAL_LIST_PREFIX + (agenceName ? ' (' + agenceName + ')' : '');
  const lists = await window.PROSPECTION_LISTS.fetchLists(true);
  const found = lists.find(l => l.name === manualName);
  if(found) return found.id;
  const created = await window.PROSPECTION_LISTS.createList(manualName, agenceId);
  return created.id;
}

async function openAddModal(){
  ['pr-add-nom','pr-add-siren','pr-add-adresse','pr-add-cp','pr-add-commune','pr-add-contact-nom','pr-add-contact-email','pr-add-contact-tel'].forEach(id => el(id).value = '');
  el('pr-add-msg').textContent = '';

  // Sélecteur d'entité : affiché seulement quand un choix est réellement nécessaire
  // (plusieurs entités possibles) — sinon l'entité est attribuée automatiquement.
  const wrap = el('pr-add-agence-wrap');
  const select = el('pr-add-agence');
  let options = scopeCtx && !scopeCtx.isAdmin ? scopeCtx.agences : [];
  if(scopeCtx && scopeCtx.isAdmin){
    const { data } = await sb.from('agences').select('id,name').order('name', {ascending:true});
    options = data || [];
  }
  if(options.length > 1 || (scopeCtx && scopeCtx.isAdmin)){
    select.innerHTML = (scopeCtx.isAdmin ? '<option value="">— Aucune (visible des administrateurs uniquement) —</option>' : '<option value="">— Choisir —</option>')
      + options.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    wrap.style.display = '';
    select.style.display = '';
  } else {
    wrap.style.display = 'none';
    select.style.display = 'none';
  }

  el('pr-add-overlay').classList.add('show');
}
function closeAddModal(){ el('pr-add-overlay').classList.remove('show'); }

async function submitAddModal(){
  const nom = el('pr-add-nom').value.trim();
  const msg = el('pr-add-msg');
  msg.textContent = '';
  if(!nom){ msg.textContent = 'Le nom de l\'entreprise est obligatoire.'; return; }

  const sirenInput = el('pr-add-siren').value.trim();
  const siren = sirenInput || genPlaceholderSiren();

  const btn = el('pr-add-confirm');
  btn.disabled = true;
  btn.textContent = 'Ajout en cours...';
  try{
    const chosenAgenceId = el('pr-add-agence').value || null;
    const agenceId = await window.PROSPECTION_LISTS.resolveAgenceForCreation(sb, window.AUTH.user, chosenAgenceId);
    const agenceName = agenceId ? ((scopeCtx.agences.find(a=>a.id===agenceId) || {}).name
      || el('pr-add-agence').selectedOptions[0].textContent) : null;
    const listId = await getOrCreateManualListId(agenceId, agenceName);
    const row = {
      siren, nom,
      adresse: el('pr-add-adresse').value.trim(),
      cp: el('pr-add-cp').value.trim(),
      commune: el('pr-add-commune').value.trim()
    };
    await window.PROSPECTION_LISTS.addItemsToList(listId, [row]);

    const contactNom = el('pr-add-contact-nom').value.trim();
    const contactEmail = el('pr-add-contact-email').value.trim();
    const contactTel = el('pr-add-contact-tel').value.trim();
    if(contactNom || contactEmail || contactTel){
      const { data: itemRow } = await sb.from('prospection_list_items').select('id').eq('list_id', listId).eq('siren', siren).single();
      if(itemRow){
        const parts = contactNom.split(' ');
        await window.PROSPECTION_LISTS.createContact(itemRow.id, {
          prenom: parts.slice(0,-1).join(' ') || contactNom,
          nom: parts.length > 1 ? parts.slice(-1)[0] : '',
          email: contactEmail || null,
          telephone: contactTel || null
        });
      }
    }
    showToast('Prospect ajouté.');
    closeAddModal();
    await loadRows();
    render();
  }catch(e){
    msg.textContent = 'Erreur : ' + e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = 'Ajouter';
  }
}

// --- Init ----------------------------------------------------------------------

async function boot(supabaseClient){
  sb = supabaseClient;
  await loadRows();
  render();

  el('pr-search').addEventListener('input', render);
  el('pr-visite-filter').addEventListener('change', render);
  el('pr-add-btn').addEventListener('click', openAddModal);
  el('pr-add-cancel').addEventListener('click', closeAddModal);
  el('pr-add-overlay').addEventListener('click', (e)=>{ if(e.target === el('pr-add-overlay')) closeAddModal(); });
  el('pr-add-confirm').addEventListener('click', submitAddModal);
}

window.PROSPECTS_APP = { boot };

})();
