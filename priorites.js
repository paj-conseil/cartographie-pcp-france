(function(){

const TABLE = 'prospection_priorities';

// Colonnes : les 12 activités PCP (mêmes clés que la cartographie)
const ACTIVITIES = ['3D','Termite','ILX','Mérule','Hottes','Humidité','Assainissement','Isolation','Thermique','Fumigation','Portuaire','Toiture'];
const ACTIVITY_SHORT = { 'Toiture':'Façade/Toiture' };

// Lignes : les 13 cibles clients (mêmes clés que prospection-config.js)
const SEGMENTS = [
  { key:'agroalim', label:'Industrie agroalimentaire' },
  { key:'pharma', label:'Industrie pharmaceutique' },
  { key:'sante', label:'Santé' },
  { key:'agriculture', label:'Agriculture' },
  { key:'commerce_alim', label:'Commerce alimentaire' },
  { key:'commerce_non_alim', label:'Commerce non-alimentaire' },
  { key:'chr', label:'Cafés, hôtels, restaurants' },
  { key:'construction', label:'Construction / BTP' },
  { key:'logistique', label:'Logistique' },
  { key:'gestion_bureaux', label:'Gestion immobilière, bureaux' },
  { key:'services_publics', label:'Services publics' },
  { key:'logement_social', label:'Logement social' },
  { key:'infrastructures', label:'Infrastructures' }
];

let sb = null;
let priorities = {}; // `${activity}|${segment}` -> 1|2|3
const saveTimers = {};

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

async function fetchPriorities(){
  const {data, error} = await sb.from(TABLE).select('*');
  if(error){
    showToast('Erreur de chargement : ' + error.message);
    return;
  }
  priorities = {};
  (data||[]).forEach(row=>{
    if(row.priority) priorities[row.activity + '|' + row.segment] = row.priority;
  });
}

async function savePriority(activity, segment, priority){
  setSaveStatus('enregistrement...', false);
  try{
    if(priority){
      const {error} = await sb.from(TABLE)
        .upsert({activity, segment, priority, updated_at: new Date().toISOString()}, {onConflict: 'activity,segment'});
      if(error) throw error;
    } else {
      const {error} = await sb.from(TABLE).delete().eq('activity', activity).eq('segment', segment);
      if(error) throw error;
    }
    setSaveStatus('enregistré', true);
  }catch(e){
    setSaveStatus('échec sauvegarde', true);
    showToast('Erreur de sauvegarde : ' + e.message);
  }
}

function cellClass(priority){
  return priority ? `prio-cell prio-${priority}` : 'prio-cell prio-0';
}

function renderTable(){
  const table = document.getElementById('priorites-table');
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.innerHTML = '<th class="corner-cell">Cible client \\ Activité</th>' +
    ACTIVITIES.map(a => `<th>${escapeHtml(ACTIVITY_SHORT[a]||a)}</th>`).join('');
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  SEGMENTS.forEach(seg=>{
    const tr = document.createElement('tr');
    const rowLabel = document.createElement('th');
    rowLabel.className = 'row-label';
    rowLabel.textContent = seg.label;
    tr.appendChild(rowLabel);

    ACTIVITIES.forEach(act=>{
      const key = act + '|' + seg.key;
      const current = priorities[key] || '';
      const td = document.createElement('td');
      td.className = cellClass(current);
      td.innerHTML = `<select data-activity="${escapeHtml(act)}" data-segment="${escapeHtml(seg.key)}">
        <option value="" ${current===''?'selected':''}>—</option>
        <option value="1" ${current===1?'selected':''}>Priorité 1</option>
        <option value="2" ${current===2?'selected':''}>Priorité 2</option>
        <option value="3" ${current===3?'selected':''}>Priorité 3</option>
      </select>`;
      const select = td.querySelector('select');
      select.addEventListener('change', ()=>{
        const val = select.value ? parseInt(select.value, 10) : null;
        td.className = cellClass(val);
        if(val) priorities[key] = val; else delete priorities[key];
        savePriority(act, seg.key, val);
      });
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

async function boot(supabaseClient){
  sb = supabaseClient;
  await fetchPriorities();
  renderTable();
  document.getElementById('loading-screen').classList.add('hidden');
}

window.PRIORITES_APP = { boot };
})();
