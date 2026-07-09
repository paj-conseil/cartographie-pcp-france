(function(){

const IS_ADMIN = window.APP_MODE === 'admin';

const ICONS = {
  '3D': '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="8" r="2.6"/><circle cx="17" cy="8" r="2.6"/><circle cx="12" cy="16.5" r="2.6"/></svg>',
  'Termite': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="13.5" rx="4" ry="5.5"/><path d="M9 8 L6.5 5 M15 8 L17.5 5"/><path d="M8 11 L4 10 M8 14 L4 15 M8 17 L4.5 18.5"/><path d="M16 11 L20 10 M16 14 L20 15 M16 17 L19.5 18.5"/></svg>',
  'ILX': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 17 Q7 10 10 17 T16 17 T21 13"/><circle cx="4" cy="17" r="1.4" fill="currentColor" stroke="none"/></svg>',
  'Mérule': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10 Q12 2 20 10 Q12 12.5 4 10 Z"/><line x1="12" y1="10.5" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/></svg>',
  'Hottes': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 5 L19 5 L14.5 13 L9.5 13 Z"/><line x1="10.5" y1="13" x2="10.5" y2="19"/><line x1="13.5" y1="13" x2="13.5" y2="19"/></svg>',
  'Humidité': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 C12 2 5 11.2 5 15.2 A7 7 0 0 0 19 15.2 C19 11.2 12 2 12 2 Z"/></svg>',
  'Assainissement': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2 L20 5 V11 C20 17 16 20.5 12 22 C8 20.5 4 17 4 11 V5 Z"/><path d="M8.5 12 L11 14.5 L16 9"/></svg>',
  'Isolation': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke-width="1.8"/><path d="M6 9 Q9 7 12 9 T18 9"/><path d="M6 13 Q9 11 12 13 T18 13"/><path d="M6 17 Q9 15 12 17 T18 17"/></svg>'
};

const ACTIVITIES = ['3D','Termite','ILX','Mérule','Hottes','Humidité','Assainissement','Isolation'];
const ACTIVITY_FULL = {
  '3D':'3D — Dératisation / Désinsectisation / Désinfection',
  'Termite':'Traitement termites',
  'ILX':'Insectes larves xylophages',
  'Mérule':'Traitement mérule',
  'Hottes':'Nettoyage / dégraissage de hottes',
  'Humidité':"Traitement de l'humidité",
  'Assainissement':'Assainissement',
  'Isolation':'Isolation'
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

function setActive(id, panMap){
  activeId = id;
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
  if(panMap){
    const m = markerRefs[id];
    if(m){
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 11), {duration:0.5});
      m.openPopup();
    }
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
