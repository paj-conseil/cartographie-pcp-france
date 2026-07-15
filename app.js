(function(){

const IS_ADMIN = window.APP_MODE === 'admin';

const ICONS = {
  '3D': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="11" cy="13" rx="6" ry="3.3" fill="currentColor" stroke="none"/><circle cx="17.2" cy="10.8" r="2.6" fill="currentColor" stroke="none"/><circle cx="19" cy="8.8" r="1" fill="currentColor" stroke="none"/><circle cx="16.4" cy="8.6" r="1" fill="currentColor" stroke="none"/><circle cx="18.4" cy="10.3" r=".4" fill="#fff" stroke="none"/><path d="M5 13.4c-2 .3-3.6 2-3.9 4.1"/><path d="M9 16.1 L8.3 18 M12.2 16.3 L11.8 18.2"/></svg>',
  'Termite': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13.5" rx="3.1" ry="6" fill="currentColor" stroke="none"/><circle cx="12" cy="6.3" r="1.7" fill="currentColor" stroke="none"/><path d="M12 4.8 L10.8 2.6 M12 4.8 L13.2 2.6"/><path d="M6.5 9 Q3.2 7.2 2 4.2" stroke-width="1.1" opacity=".55"/><path d="M17.5 9 Q20.8 7.2 22 4.2" stroke-width="1.1" opacity=".55"/><line x1="9.3" y1="11" x2="5.8" y2="10.3"/><line x1="9.3" y1="14.2" x2="5.8" y2="14.8"/><line x1="14.7" y1="11" x2="18.2" y2="10.3"/><line x1="14.7" y1="14.2" x2="18.2" y2="14.8"/></svg>',
  'ILX': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14" rx="4" ry="5.8" fill="currentColor" stroke="none"/><line x1="12" y1="9" x2="12" y2="18.5" stroke="#fff" stroke-width=".9" opacity=".55"/><circle cx="12" cy="7.6" r="1.6" fill="currentColor" stroke="none"/><path d="M11 6.6 Q6.2 3.2 3 6" stroke-width="1.3"/><path d="M13 6.6 Q17.8 3.2 21 6" stroke-width="1.3"/><line x1="8.2" y1="11.3" x2="4.7" y2="9.8"/><line x1="8" y1="14" x2="4.2" y2="14"/><line x1="8.2" y1="16.7" x2="4.7" y2="18.2"/><line x1="15.8" y1="11.3" x2="19.3" y2="9.8"/><line x1="16" y1="14" x2="19.8" y2="14"/><line x1="15.8" y1="16.7" x2="19.3" y2="18.2"/></svg>',
  'Mérule': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 11c0-4.4 3.4-7.4 7.5-7.4s7.5 3 7.5 7.4c0 1-.9 1.4-1.9 1.1c-1-.3-1.9-.2-2.6.3c-.9.6-1.9.6-2.8 0c-.9-.6-1.9-.6-2.8 0c-.9.5-1.9.6-2.9.3c-1 .3-1.9-.1-1.9-1.1z" fill="currentColor" stroke="none"/><line x1="12" y1="12.6" x2="12" y2="19.5" stroke-width="1.8"/><line x1="9.3" y1="19.5" x2="14.7" y2="19.5" stroke-width="1.8"/></svg>',
  'Hottes': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><g transform="rotate(180 12 12)"><path d="M5 5 L19 5 L14.5 13 L9.5 13 Z"/><line x1="10.5" y1="13" x2="10.5" y2="19"/><line x1="13.5" y1="13" x2="13.5" y2="19"/></g></svg>',
  'Humidité': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 C12 2 5 11.2 5 15.2 A7 7 0 0 0 19 15.2 C19 11.2 12 2 12 2 Z"/></svg>',
  'Assainissement': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 6 Q7 10 3 14 Q7 18 4 21"/><path d="M9 3 Q13 8 9 12 Q13 17 10 21"/><path d="M15 5 Q19 9 15 13 Q19 17 16 21"/><circle cx="3" cy="6" r=".6" fill="currentColor" stroke="none"/><circle cx="9" cy="3" r=".6" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r=".6" fill="currentColor" stroke="none"/></svg>',
  'Isolation': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke-width="1.8"/><path d="M6 9 Q9 7 12 9 T18 9"/><path d="M6 13 Q9 11 12 13 T18 13"/><path d="M6 17 Q9 15 12 17 T18 17"/></svg>',
  'Thermique': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="3" height="10" rx="1.5"/><circle cx="10.5" cy="16.7" r="2.9" fill="currentColor" stroke="none"/><line x1="10.5" y1="6" x2="10.5" y2="14" stroke-width="1.4"/><path d="M17.2 6c1.8 1.6 2.6 3.4 1.9 5c-.4 1-1.5 1.4-1.7.3c-.1.9-1.1 1.2-1.7.4c-1-1.2-.5-2.9.6-4.1c.4-.4.7-1 .9-1.6Z" fill="currentColor" stroke="none"/></svg>',
  'Fumigation': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><g fill="currentColor" stroke="none"><circle cx="12" cy="12" r="3.6"/><circle cx="16" cy="8.5" r="3"/><circle cx="19.5" cy="12" r="2.8"/><circle cx="17.5" cy="16" r="3"/><circle cx="13" cy="17" r="2.6"/><circle cx="9.5" cy="15" r="2.4"/><circle cx="9" cy="9" r="2.3"/></g><path d="M8 9.3 L1 7.8" stroke-width="1.5"/><path d="M8.3 12.3 L1 12.3" stroke-width="1.9"/><path d="M8 15.2 L1 16.5" stroke-width="1.5"/></svg>',
  'Portuaire': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.8"/><line x1="12" y1="7.3" x2="12" y2="18.5"/><path d="M6 12c0 3.4 2.5 5.9 6 6.5"/><path d="M18 12c0 3.4-2.5 5.9-6 6.5"/><line x1="8.2" y1="12" x2="15.8" y2="12"/></svg>',
  'Toiture': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 L12 4 L21 11.5"/><path d="M6 11v9h12v-9"/><path d="M14.7 14.3c1 .8 1 2 0 2.8c-1 .8-1 2 0 2.8" stroke-width="1.3"/></svg>'
};

const ACTIVITIES = ['3D','Termite','ILX','Mérule','Hottes','Humidité','Assainissement','Isolation','Thermique','Fumigation','Portuaire','Toiture'];
const ACTIVITY_FULL = {
  '3D':'3D — Dératisation / Désinsectisation / Désinfection',
  'Termite':'Traitement termites',
  'ILX':'Insectes larves xylophages',
  'Mérule':'Traitement mérule',
  'Hottes':'Nettoyage / dégraissage de hottes',
  'Humidité':"Traitement de l'humidité",
  'Assainissement':'Assainissement',
  'Isolation':'Isolation',
  'Thermique':'Traitement thermique',
  'Fumigation':'Fumigation',
  'Portuaire':'Activités portuaires',
  'Toiture':'Nettoyage toitures / façades'
};

const TABLE = 'agences';
let sb = null;
let entities = [];
let map, markersLayer;
let markerRefs = {};
let activeId = null;
const saveTimers = {};
let selectedFilters = [];
let modalEntityId = null;

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 2500);
}

function setSaveStatus(text, temporary){
  const el = document.getElementById('save-status');
  if(!el) return;
  el.textContent = text;
  if(temporary){
    clearTimeout(setSaveStatus._t);
    setSaveStatus._t = setTimeout(()=>{ el.textContent = 'enregistré'; }, 1500);
  }
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function rowToEntity(row){
  return {
    id: row.id,
    name: row.name || '',
    address: row.address || '',
    lat: row.lat,
    lng: row.lng,
    color: row.color || '#1b6b3c',
    activities: Array.isArray(row.activities) ? row.activities : []
  };
}

async function fetchEntities(){
  const {data, error} = await sb.from(TABLE).select('*').order('name', {ascending:true});
  if(error){
    showToast('Erreur de chargement : ' + error.message);
    entities = [];
    return;
  }
  entities = (data||[]).map(rowToEntity);
}

async function insertEntity(){
  const {data, error} = await sb.from(TABLE).insert({name:'', address:'', color:'#1b6b3c', activities:[]}).select().single();
  if(error){ showToast('Erreur : ' + error.message); return null; }
  const ent = rowToEntity(data);
  entities.unshift(ent);
  return ent;
}

async function updateEntity(id, patch){
  const {error} = await sb.from(TABLE).update(patch).eq('id', id);
  if(error){ setSaveStatus('échec sauvegarde', true); showToast('Erreur de sauvegarde : ' + error.message); return false; }
  return true;
}

async function deleteEntityRow(id){
  const {error} = await sb.from(TABLE).delete().eq('id', id);
  if(error){ showToast('Erreur de suppression : ' + error.message); return false; }
  return true;
}

function scheduleFieldSave(id, patch, label){
  const key = id + ':' + label;
  clearTimeout(saveTimers[key]);
  setSaveStatus('modification...', false);
  saveTimers[key] = setTimeout(async ()=>{
    setSaveStatus('enregistrement...', false);
    const ok = await updateEntity(id, patch);
    if(ok) setSaveStatus('enregistré', true);
  }, 500);
}

function pinIcon(color){
  return L.divIcon({
    className: '',
    html: `<div class="pcp-pin" style="width:26px;height:26px;background:${color};">
             <div class="pcp-pin-inner"></div>
           </div>`,
    iconSize: [26,26],
    iconAnchor: [13,26],
    popupAnchor: [0,-24]
  });
}

function popupContent(ent){
  const acts = (ent.activities||[]).map(a => `<span title="${escapeHtml(ACTIVITY_FULL[a]||a)}">${ICONS[a]||''}</span>`).join('');
  return `<div class="popup-title">${escapeHtml(ent.name || '(sans nom)')}</div><div>${escapeHtml(ent.address || '')}</div>` +
         (acts ? `<div class="popup-activities">${acts}</div>` : '');
}

function initMap(){
  map = L.map('map', {zoomControl:true}).setView([46.6, 2.2], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function matchesFilters(ent){
  const searchEl = document.getElementById('search-input');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const matchesText = !q || (ent.name||'').toLowerCase().includes(q) || (ent.address||'').toLowerCase().includes(q);
  const matchesActivity = !selectedFilters.length || selectedFilters.some(f => (ent.activities||[]).includes(f));
  return matchesText && matchesActivity;
}

function renderChips(){
  const wrap = document.getElementById('chips');
  wrap.innerHTML = '';
  ACTIVITIES.forEach(act => {
    const count = entities.filter(e => (e.activities||[]).includes(act)).length;
    const chip = document.createElement('div');
    chip.className = 'chip' + (selectedFilters.includes(act) ? ' active' : '');
    chip.title = ACTIVITY_FULL[act] || act;
    chip.innerHTML = `${ICONS[act]||''}<span>${act}</span><span class="chip-count">${count}</span>`;
    chip.addEventListener('click', ()=>{
      const i = selectedFilters.indexOf(act);
      if(i>-1) selectedFilters.splice(i,1); else selectedFilters.push(act);
      renderChips();
      renderAll({fit:true});
    });
    wrap.appendChild(chip);
  });
  const clearBtn = document.getElementById('clear-filters');
  clearBtn.style.visibility = selectedFilters.length ? 'visible' : 'hidden';
}

function renderMarkersFor(visible){
  markersLayer.clearLayers();
  markerRefs = {};
  visible.forEach(ent => {
    if(typeof ent.lat === 'number' && typeof ent.lng === 'number' && !isNaN(ent.lat) && !isNaN(ent.lng)){
      const marker = L.marker([ent.lat, ent.lng], {icon: pinIcon(ent.color || '#1b6b3c')});
      marker.bindPopup(popupContent(ent));
      marker.on('click', ()=> setActive(ent.id, true));
      marker.addTo(markersLayer);
      markerRefs[ent.id] = marker;
    }
  });
}

function fitToVisible(visible){
  const pts = visible.filter(e => typeof e.lat === 'number' && typeof e.lng === 'number').map(e => [e.lat, e.lng]);
  if(pts.length){
    map.fitBounds(pts, {padding:[30,30], maxZoom: 13});
  }
}

function isMobileLayout(){
  return window.matchMedia('(max-width: 768px)').matches;
}

function openPanel(){
  document.getElementById('panel').classList.add('open');
  document.getElementById('panel-backdrop').classList.add('show');
  const btn = document.getElementById('panel-toggle');
  if(btn) btn.textContent = '🗺️ Voir la carte';
}

function closePanel(){
  document.getElementById('panel').classList.remove('open');
  document.getElementById('panel-backdrop').classList.remove('show');
  const btn = document.getElementById('panel-toggle');
  if(btn) btn.textContent = '📋 Voir la liste';
}

function togglePanel(){
  const panel = document.getElementById('panel');
  if(panel.classList.contains('open')) closePanel(); else openPanel();
}

function setActive(id, panMap){
  activeId = id;
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
  if(panMap){
    const m = markerRefs[id];
    if(m){
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 11), {duration:0.5});
      m.openPopup();
    }
    if(isMobileLayout()) closePanel();
  }
}

async function geocode(address){
  if(!address || !address.trim()) return null;
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=' + encodeURIComponent(address);
  const res = await fetch(url, {headers: {'Accept':'application/json'}});
  if(!res.ok) throw new Error('Service de géocodage indisponible');
  const data = await res.json();
  if(!data || !data.length) return null;
  return {lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon)};
}

function openActivityModal(entId){
  modalEntityId = entId;
  const ent = entities.find(e => e.id === entId);
  if(!ent) return;
  document.getElementById('modal-title').textContent = ent.name ? `Activités — ${ent.name}` : 'Activités';
  const opts = document.getElementById('modal-options');
  opts.innerHTML = '';
  ACTIVITIES.forEach(act => {
    const row = document.createElement('label');
    row.className = 'modal-option';
    const checked = (ent.activities||[]).includes(act);
    row.innerHTML = `
      <input type="checkbox" ${checked ? 'checked' : ''} data-act="${act}" />
      <span class="act-badge">${ICONS[act]||''}</span>
      <span class="opt-label">${escapeHtml(ACTIVITY_FULL[act]||act)}</span>
    `;
    const checkbox = row.querySelector('input');
    checkbox.addEventListener('change', async ()=>{
      const e2 = entities.find(x => x.id === entId);
      if(!e2) return;
      e2.activities = e2.activities || [];
      const idx = e2.activities.indexOf(act);
      if(checkbox.checked && idx === -1) e2.activities.push(act);
      if(!checkbox.checked && idx > -1) e2.activities.splice(idx,1);
      setSaveStatus('enregistrement...', false);
      const ok = await updateEntity(entId, {activities: e2.activities});
      if(ok) setSaveStatus('enregistré', true);
      renderChips();
      renderAll({fit:false});
    });
    opts.appendChild(row);
  });
  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal(){
  document.getElementById('modal-overlay').classList.remove('show');
  modalEntityId = null;
}

function renderListFor(visible){
  const list = document.getElementById('list');
  const q = document.getElementById('search-input').value.trim();
  let label = `${entities.length} entité${entities.length>1?'s':''}`;
  if(visible.length !== entities.length) label += ` · ${visible.length} affichée${visible.length>1?'s':''}`;
  document.getElementById('count-text').textContent = label;

  list.innerHTML = '';
  if(!visible.length){
    const div = document.createElement('div');
    div.id = 'empty-state';
    div.textContent = (q || selectedFilters.length) ? 'Aucune entité ne correspond aux critères.' : 'Aucune entité pour le moment.';
    list.appendChild(div);
    return;
  }

  visible.forEach(ent => {
    const missing = !(typeof ent.lat === 'number' && typeof ent.lng === 'number');
    const card = document.createElement('div');
    card.className = 'card' + (missing ? ' missing' : '') + (ent.id === activeId ? ' active' : '');
    card.dataset.id = ent.id;

    const badges = (ent.activities||[]).map(a => `<span class="act-badge" title="${escapeHtml(ACTIVITY_FULL[a]||a)}">${ICONS[a]||''}</span>`).join('');

    if(!IS_ADMIN){
      // Read-only rendering
      card.innerHTML = `
        <div class="card-row1">
          <span class="dot" style="background:${ent.color || '#1b6b3c'};"></span>
          <span class="card-name">${escapeHtml(ent.name || '(sans nom)')}</span>
        </div>
        <div class="activities-row">${badges}</div>
        <div class="card-address">${escapeHtml(ent.address || '')}</div>
      `;
      card.addEventListener('click', ()=> setActive(ent.id, true));
      list.appendChild(card);
      return;
    }

    // Admin (editable) rendering
    card.innerHTML = `
      <div class="card-row1">
        <input type="color" class="swatch" value="${ent.color || '#1b6b3c'}" title="Couleur du repère" />
        <input type="text" class="name-input" value="${escapeHtml(ent.name || '')}" placeholder="Nom de l'entité" />
        <button class="del-btn" title="Supprimer">✕</button>
      </div>
      <div class="activities-row">
        ${badges}
        <button class="edit-act-btn">✎ Activités</button>
      </div>
      <div class="addr-row">
        <textarea class="addr-input" rows="2" placeholder="Adresse postale">${escapeHtml(ent.address || '')}</textarea>
        <button class="locate-btn">📍 Localiser</button>
      </div>
      <div class="status-line"></div>
    `;

    const swatch = card.querySelector('.swatch');
    const nameInput = card.querySelector('.name-input');
    const addrInput = card.querySelector('.addr-input');
    const locateBtn = card.querySelector('.locate-btn');
    const delBtn = card.querySelector('.del-btn');
    const editActBtn = card.querySelector('.edit-act-btn');
    const statusLine = card.querySelector('.status-line');

    if(missing){
      statusLine.textContent = 'Localisation manquante — saisissez une adresse puis "Localiser".';
      statusLine.classList.add('status-warn');
    }

    card.addEventListener('click', (e)=>{
      if(['INPUT','TEXTAREA','BUTTON'].includes(e.target.tagName)) return;
      setActive(ent.id, true);
    });

    swatch.addEventListener('input', ()=>{
      ent.color = swatch.value;
      const m = markerRefs[ent.id];
      if(m) m.setIcon(pinIcon(ent.color));
      scheduleFieldSave(ent.id, {color: ent.color}, 'color');
    });

    nameInput.addEventListener('input', ()=>{
      ent.name = nameInput.value;
      const m = markerRefs[ent.id];
      if(m) m.setPopupContent(popupContent(ent));
      scheduleFieldSave(ent.id, {name: ent.name}, 'name');
    });

    addrInput.addEventListener('input', ()=>{
      ent.address = addrInput.value;
      const m = markerRefs[ent.id];
      if(m) m.setPopupContent(popupContent(ent));
      scheduleFieldSave(ent.id, {address: ent.address}, 'address');
    });

    editActBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openActivityModal(ent.id);
    });

    delBtn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!confirm(`Supprimer "${ent.name || 'cette entité'}" ?`)) return;
      const ok = await deleteEntityRow(ent.id);
      if(ok){
        entities = entities.filter(x => x.id !== ent.id);
        renderChips();
        renderAll({fit:false});
        showToast('Entité supprimée');
      }
    });

    locateBtn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!addrInput.value.trim()){
        statusLine.textContent = 'Saisissez une adresse avant de localiser.';
        statusLine.className = 'status-line status-warn';
        return;
      }
      locateBtn.disabled = true;
      locateBtn.textContent = '⏳ ...';
      statusLine.textContent = 'Recherche en cours...';
      statusLine.className = 'status-line';
      try{
        const coords = await geocode(addrInput.value);
        if(coords){
          ent.lat = coords.lat;
          ent.lng = coords.lng;
          card.classList.remove('missing');
          statusLine.textContent = 'Localisation mise à jour ✓';
          statusLine.className = 'status-line status-ok';
          await updateEntity(ent.id, {lat: ent.lat, lng: ent.lng});
          renderAll({fit:false});
          setActive(ent.id, true);
        } else {
          statusLine.textContent = "Adresse introuvable — vérifiez l'orthographe.";
          statusLine.className = 'status-line status-warn';
        }
      }catch(err){
        statusLine.textContent = 'Erreur réseau lors de la localisation.';
        statusLine.className = 'status-line status-warn';
      }finally{
        locateBtn.disabled = false;
        locateBtn.textContent = '📍 Localiser';
      }
    });

    list.appendChild(card);
  });
}

function renderAll(opts){
  opts = opts || {};
  const visible = entities.filter(matchesFilters);
  renderMarkersFor(visible);
  renderListFor(visible);
  if(opts.fit) fitToVisible(visible);
}

function wireAdminControls(){
  const addBtn = document.getElementById('add-btn');
  if(addBtn){
    addBtn.addEventListener('click', async ()=>{
      const ent = await insertEntity();
      if(!ent) return;
      renderChips();
      renderAll({fit:false});
      const firstCard = document.querySelector('.card');
      if(firstCard){
        firstCard.scrollIntoView({block:'start', behavior:'smooth'});
        const input = firstCard.querySelector('.name-input');
        if(input) input.focus();
      }
    });
  }
  const modalClose = document.getElementById('modal-close');
  if(modalClose) modalClose.addEventListener('click', closeModal);
  const modalOverlay = document.getElementById('modal-overlay');
  if(modalOverlay) modalOverlay.addEventListener('click', (e)=>{ if(e.target.id === 'modal-overlay') closeModal(); });

  const logoutBtn = document.getElementById('logout-btn');
  if(logoutBtn){
    logoutBtn.addEventListener('click', async ()=>{
      await sb.auth.signOut();
      window.location.reload();
    });
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  const clearBtn = document.getElementById('clear-filters');
  if(clearBtn) clearBtn.addEventListener('click', ()=>{
    selectedFilters = [];
    renderChips();
    renderAll({fit:true});
  });
  const searchInput = document.getElementById('search-input');
  if(searchInput) searchInput.addEventListener('input', ()=> renderAll({fit:false}));

  const toggleBtn = document.getElementById('panel-toggle');
  if(toggleBtn) toggleBtn.addEventListener('click', togglePanel);
  const backdrop = document.getElementById('panel-backdrop');
  if(backdrop) backdrop.addEventListener('click', closePanel);
});

async function boot(){
  sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  initMap();
  if(IS_ADMIN) wireAdminControls();
  await fetchEntities();
  renderChips();
  renderAll({fit:true});
  const loadingScreen = document.getElementById('loading-screen');
  if(loadingScreen) loadingScreen.classList.add('hidden');
}

window.PCP_APP = { boot, sb: ()=>sb };
})();
