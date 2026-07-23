(function(){

const CFG = window.RDV_CONFIG;
let supabaseClient = null;
let currentPoints = []; // {id, x, y (en % de l'image), type, zone, description}
let planImageData = null; // base64
let prospect = {siren:'', nom:'', adresse:'', cp:'', commune:''};

function el(id){ return document.getElementById(id); }

function showToast(msg){
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 3000);
}

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function uid(){ return 'p' + Math.random().toString(36).slice(2,9); }

// ---------- Lecture du prospect depuis l'URL ----------
function readProspectFromUrl(){
  const params = new URLSearchParams(window.location.search);
  prospect = {
    siren: params.get('siren') || '',
    nom: params.get('nom') || 'Prospect sans nom',
    adresse: params.get('adresse') || '',
    cp: params.get('cp') || '',
    commune: params.get('commune') || '',
    naf: params.get('naf') || '',
    groupe: params.get('groupe') || ''
  };
}

function renderProspectIdentite(){
  el('prospect-identite').innerHTML = `
    <div class="p-nom">${escapeHtml(prospect.nom)}</div>
    <div class="p-addr">${escapeHtml(prospect.adresse)} ${escapeHtml(prospect.cp)} ${escapeHtml(prospect.commune)}</div>
    <div class="p-tags">
      ${prospect.groupe ? `<span class="tag">${escapeHtml(prospect.groupe)}</span>` : ''}
      ${prospect.naf ? `<span class="tag">NAF ${escapeHtml(prospect.naf)}</span>` : ''}
    </div>
  `;
  document.title = `RDV — ${prospect.nom} — PCP France`;
  el('header-sub').textContent = prospect.nom;
}

// ---------- Cases à cocher dynamiques ----------
function buildChecks(containerId, items, namePrefix){
  const wrap = el(containerId);
  wrap.innerHTML = items.map((label,i)=>`
    <label><input type="checkbox" class="${namePrefix}-check" value="${escapeHtml(label)}" /> <span>${escapeHtml(label)}</span></label>
  `).join('');
}

// ---------- Plan interactif ----------
function handlePlanUpload(file){
  if(!file) return;
  if(!file.type || !file.type.startsWith('image/')){
    showToast('Le fichier sélectionné n\'est pas une image.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = ()=> showToast('Impossible de lire ce fichier.');
  reader.onload = (e)=>{
    const img = new Image();
    img.onerror = ()=> showToast('Impossible de charger cette image.');
    img.onload = ()=>{
      try{
        // Redimensionne/compresse côté client pour limiter la taille stockée
        const maxW = 1200;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        planImageData = canvas.toDataURL('image/jpeg', 0.75);
        currentPoints = [];
        const planImg = el('plan-image');
        planImg.onload = ()=>{ el('plan-container').style.display = 'block'; renderPins(); renderPointsList(); };
        planImg.onerror = ()=> showToast('Le plan a été traité mais ne peut pas s\'afficher.');
        planImg.src = planImageData;
      } catch(err){
        console.error('Erreur de traitement de l\'image', err);
        showToast('Erreur lors du traitement de l\'image.');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removePlan(){
  planImageData = null;
  currentPoints = [];
  el('plan-container').style.display = 'none';
  el('plan-upload').value = '';
  el('plan-camera').value = '';
  renderPins();
  renderPointsList();
}

function onPlanClick(ev){
  const wrap = el('plan-wrap');
  const rect = wrap.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 100;
  const y = ((ev.clientY - rect.top) / rect.height) * 100;
  const point = {id: uid(), x, y, type: CFG.typesNuisibles[0], zone: '', description: ''};
  currentPoints.push(point);
  renderPins();
  renderPointsList();
}

function renderPins(){
  const wrap = el('plan-pins');
  wrap.innerHTML = '';
  currentPoints.forEach((p, i)=>{
    const pin = document.createElement('div');
    pin.className = 'plan-pin';
    pin.style.left = p.x + '%';
    pin.style.top = p.y + '%';
    pin.innerHTML = `<div class="plan-pin-dot"><span class="plan-pin-num">${i+1}</span></div>`;
    pin.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      const card = document.querySelector(`.point-card[data-id="${p.id}"]`);
      if(card) card.scrollIntoView({behavior:'smooth', block:'center'});
    });
    wrap.appendChild(pin);
  });
}

function renderPointsList(){
  const wrap = el('points-list');
  wrap.innerHTML = '';
  if(!currentPoints.length){
    wrap.innerHTML = '<p class="rdv-hint">Aucun point ajouté pour le moment.</p>';
    return;
  }
  currentPoints.forEach((p, i)=>{
    const card = document.createElement('div');
    card.className = 'point-card';
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="point-card-head">
        <strong>Point ${i+1}</strong>
        <button type="button" class="point-remove-btn" data-id="${p.id}">Supprimer</button>
      </div>
      <select class="point-type" data-id="${p.id}">
        ${CFG.typesNuisibles.map(t=>`<option value="${escapeHtml(t)}" ${t===p.type?'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <input type="text" class="point-zone" data-id="${p.id}" placeholder="Zone / emplacement (ex : réserve, local poubelles...)" value="${escapeHtml(p.zone)}" />
      <textarea class="point-desc" data-id="${p.id}" placeholder="Observations">${escapeHtml(p.description)}</textarea>
    `;
    wrap.appendChild(card);
  });

  wrap.querySelectorAll('.point-remove-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      currentPoints = currentPoints.filter(p => p.id !== btn.dataset.id);
      renderPins();
      renderPointsList();
    });
  });
  wrap.querySelectorAll('.point-type').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const p = currentPoints.find(x=>x.id===sel.dataset.id);
      if(p) p.type = sel.value;
    });
  });
  wrap.querySelectorAll('.point-zone').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const p = currentPoints.find(x=>x.id===inp.dataset.id);
      if(p) p.zone = inp.value;
    });
  });
  wrap.querySelectorAll('.point-desc').forEach(ta=>{
    ta.addEventListener('input', ()=>{
      const p = currentPoints.find(x=>x.id===ta.dataset.id);
      if(p) p.description = ta.value;
    });
  });
}

// ---------- Types de nuisibles : catégories cliquables + sous-liste ----------
function buildNuisiblesUI(){
  const catWrap = el('nuisibles-categories');
  const detailWrap = el('nuisibles-souscats');
  catWrap.innerHTML = '';
  detailWrap.innerHTML = '';

  const allCats = CFG.nuisiblesCategories.concat([{key:'autre', label:'Autre', items:null}]);
  allCats.forEach(cat=>{
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'rdv-pill';
    pill.dataset.cat = cat.key;
    pill.textContent = cat.label;
    catWrap.appendChild(pill);

    const panel = document.createElement('div');
    panel.className = 'rdv-subpanel';
    panel.dataset.catPanel = cat.key;
    panel.style.display = 'none';
    if(cat.key === 'autre'){
      panel.innerHTML = `<textarea id="nuisibles-autre" placeholder="Précisez le nuisible..."></textarea>`;
    } else {
      panel.innerHTML = cat.items.map(item=>`
        <label><input type="checkbox" class="nuisible-item-check" data-cat="${cat.key}" value="${escapeHtml(item)}" /> <span>${escapeHtml(item)}</span></label>
      `).join('');
    }
    detailWrap.appendChild(panel);

    pill.addEventListener('click', ()=>{
      pill.classList.toggle('active');
      panel.style.display = pill.classList.contains('active') ? 'block' : 'none';
    });
  });
}

function collectNuisibles(){
  const activeCats = Array.from(document.querySelectorAll('#nuisibles-categories .rdv-pill.active')).map(p=>p.dataset.cat);
  const details = {};
  activeCats.forEach(cat=>{
    if(cat === 'autre') return;
    details[cat] = Array.from(document.querySelectorAll(`.nuisible-item-check[data-cat="${cat}"]:checked`)).map(c=>c.value);
  });
  const autreEl = el('nuisibles-autre');
  return {
    categories: activeCats,
    details,
    autre: (activeCats.includes('autre') && autreEl) ? autreEl.value : ''
  };
}

function fillNuisibles(categories, details, autre){
  (categories||[]).forEach(catKey=>{
    const pill = document.querySelector(`#nuisibles-categories .rdv-pill[data-cat="${catKey}"]`);
    const panel = document.querySelector(`[data-cat-panel="${catKey}"]`);
    if(pill) pill.classList.add('active');
    if(panel) panel.style.display = 'block';
  });
  Object.keys(details||{}).forEach(catKey=>{
    (details[catKey]||[]).forEach(item=>{
      const cb = document.querySelector(`.nuisible-item-check[data-cat="${catKey}"][value="${CSS.escape(item)}"]`);
      if(cb) cb.checked = true;
    });
  });
  if(autre && el('nuisibles-autre')) el('nuisibles-autre').value = autre;
}

function formatNuisiblesForDisplay(categories, details, autre){
  const parts = (categories||[]).filter(c=>c!=='autre').map(catKey=>{
    const cat = CFG.nuisiblesCategories.find(c=>c.key===catKey);
    const items = (details && details[catKey]) || [];
    return `${cat ? cat.label : catKey}${items.length ? ' (' + items.join(', ') + ')' : ''}`;
  });
  if(autre) parts.push(`Autre : ${autre}`);
  return parts.join(' ; ');
}

// ---------- Collecte / remplissage du formulaire ----------
function collectFormData(){
  const checkedValues = (cls)=> Array.from(document.querySelectorAll('.' + cls + ':checked')).map(c=>c.value);
  const nuisibles = collectNuisibles();
  return {
    siren: prospect.siren,
    nom_entreprise: prospect.nom,
    adresse: prospect.adresse,
    commune: prospect.commune,
    date_rdv: el('rdv-date').value || null,
    commercial: el('rdv-commercial').value || '',
    problematiques: checkedValues('problematiques'),
    problematiques_autre: el('problematiques-autre').value || '',
    consequences: checkedValues('consequences'),
    consequences_autre: el('consequences-autre').value || '',
    sensibilite: el('sensibilite-site').value || '',
    a_prestataire: document.querySelector('input[name="a-prestataire"]:checked').value === 'oui',
    prestataire_nom: el('prestataire-nom').value || '',
    prestataire_echeance: el('prestataire-echeance').value || null,
    prestataire_frequence: el('prestataire-frequence').value || '',
    prestataire_satisfaction: el('prestataire-satisfaction').value || '',
    besoin_notes: el('besoin-notes').value || '',
    types_nuisibles: nuisibles.categories,
    nuisibles_details: nuisibles.details,
    nuisibles_autre: nuisibles.autre,
    visite_notes: el('visite-notes').value || '',
    plan_image: planImageData,
    points: currentPoints,
    statut: 'brouillon'
  };
}

function fillFormData(data){
  if(!data) return;
  el('rdv-date').value = data.date_rdv || '';
  el('rdv-commercial').value = data.commercial || '';
  (data.problematiques||[]).forEach(v=>{
    const cb = document.querySelector(`.problematiques-check[value="${CSS.escape(v)}"]`);
    if(cb) cb.checked = true;
  });
  el('problematiques-autre').value = data.problematiques_autre || '';
  (data.consequences||[]).forEach(v=>{
    const cb = document.querySelector(`.consequences-check[value="${CSS.escape(v)}"]`);
    if(cb) cb.checked = true;
  });
  el('consequences-autre').value = data.consequences_autre || '';
  el('sensibilite-site').value = data.sensibilite || '';
  const presRadio = document.querySelector(`input[name="a-prestataire"][value="${data.a_prestataire ? 'oui':'non'}"]`);
  if(presRadio){ presRadio.checked = true; presRadio.dispatchEvent(new Event('change')); }
  el('prestataire-nom').value = data.prestataire_nom || '';
  el('prestataire-echeance').value = data.prestataire_echeance || '';
  el('prestataire-frequence').value = data.prestataire_frequence || '';
  el('prestataire-satisfaction').value = data.prestataire_satisfaction || '';
  el('besoin-notes').value = data.besoin_notes || '';
  fillNuisibles(data.types_nuisibles, data.nuisibles_details, data.nuisibles_autre);
  el('visite-notes').value = data.visite_notes || '';
  planImageData = data.plan_image || null;
  currentPoints = data.points || [];
  if(planImageData){
    el('plan-image').src = planImageData;
    el('plan-container').style.display = 'block';
  }
  renderPins();
  renderPointsList();
}

// ---------- Stockage : localStorage + Supabase (best-effort) ----------
function localKey(){ return 'pcp_rdv_' + prospect.siren; }

function loadLocal(){
  try{
    const raw = localStorage.getItem(localKey());
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}

function saveLocal(data){
  try{ localStorage.setItem(localKey(), JSON.stringify(data)); } catch(e){ console.error(e); }
}

function isSupabaseConfigured(){
  return window.RDV_SUPABASE_URL && !window.RDV_SUPABASE_URL.startsWith('REMPLACER')
    && window.RDV_SUPABASE_ANON_KEY && !window.RDV_SUPABASE_ANON_KEY.startsWith('REMPLACER');
}

function initSupabase(){
  if(!isSupabaseConfigured() || !window.supabase) return null;
  try{
    return window.supabase.createClient(window.RDV_SUPABASE_URL, window.RDV_SUPABASE_ANON_KEY);
  } catch(e){ console.error('Supabase init error', e); return null; }
}

async function loadFromSupabase(){
  if(!supabaseClient) return null;
  try{
    const { data, error } = await supabaseClient.from('rdv_prospects').select('*').eq('siren', prospect.siren).maybeSingle();
    if(error) throw error;
    return data;
  } catch(e){
    console.error('Erreur de chargement Supabase', e);
    return null;
  }
}

async function saveToSupabase(data){
  if(!supabaseClient) return false;
  try{
    const { error } = await supabaseClient.from('rdv_prospects').upsert(data, {onConflict:'siren'});
    if(error) throw error;
    return true;
  } catch(e){
    console.error('Erreur de sauvegarde Supabase', e);
    return false;
  }
}

async function handleSave(){
  const data = collectFormData();
  saveLocal(data);
  let syncMsg = 'Enregistré sur cet appareil.';
  if(supabaseClient){
    el('save-status').textContent = 'Synchronisation...';
    const ok = await saveToSupabase(data);
    syncMsg = ok ? 'Enregistré et synchronisé avec l\'équipe.' : 'Enregistré localement (synchronisation impossible).';
  } else if(!isSupabaseConfigured()){
    syncMsg += ' (Supabase non configuré — non partagé avec l\'équipe)';
  }
  el('save-status').textContent = syncMsg;
  showToast(syncMsg);
}

async function loadExisting(){
  let data = null;
  if(supabaseClient){
    data = await loadFromSupabase();
  }
  if(!data){
    data = loadLocal();
  }
  if(data){
    fillFormData(data);
    showToast('RDV précédent chargé pour ce prospect.');
  }
}

// ---------- Export PDF ----------
function exportPdf(){
  if(!window.jspdf){ showToast('Le module PDF n\'a pas pu se charger.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const data = collectFormData();
  let y = 18;
  const marginX = 15;
  const pageWidth = 210;
  const maxW = pageWidth - marginX*2;

  doc.setFontSize(16); doc.setTextColor(0,60,40);
  doc.text('Fiche RDV — Proposition PCP', marginX, y); y += 8;
  doc.setFontSize(11); doc.setTextColor(20,20,20);
  doc.text(prospect.nom, marginX, y); y += 6;
  doc.setFontSize(9); doc.setTextColor(90,90,90);
  doc.text(`${prospect.adresse} ${prospect.cp} ${prospect.commune}`, marginX, y); y += 5;
  doc.text(`Date RDV : ${data.date_rdv || '—'}   Commercial : ${data.commercial || '—'}`, marginX, y); y += 9;

  function section(title){
    doc.setFontSize(12); doc.setTextColor(0,60,40);
    doc.text(title, marginX, y); y += 2;
    doc.setDrawColor(180,200,190); doc.line(marginX, y, pageWidth-marginX, y); y += 6;
    doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  }
  function line(label, value){
    if(!value) return;
    const text = `${label} : ${value}`;
    const wrapped = doc.splitTextToSize(text, maxW);
    if(y + wrapped.length*4.2 > 285){ doc.addPage(); y = 18; }
    doc.text(wrapped, marginX, y);
    y += wrapped.length*4.2 + 2;
  }

  section('Découverte du besoin');
  line('Problématiques', data.problematiques.join(', ') + (data.problematiques_autre ? ' ; ' + data.problematiques_autre : ''));
  line('Conséquences opérationnelles', data.consequences.join(', ') + (data.consequences_autre ? ' ; ' + data.consequences_autre : ''));
  line('Sensibilité du site', data.sensibilite);
  line('Prestataire actuel', data.a_prestataire ? `${data.prestataire_nom || '—'} (échéance : ${data.prestataire_echeance || '—'}, fréquence : ${data.prestataire_frequence || '—'}, satisfaction : ${data.prestataire_satisfaction || '—'})` : 'Aucun');
  line('Notes', data.besoin_notes);

  y += 4;
  section('État des lieux du site');
  line('Types de nuisibles', formatNuisiblesForDisplay(data.types_nuisibles, data.nuisibles_details, data.nuisibles_autre));
  line('Notes de visite', data.visite_notes);

  if(planImageData){
    if(y + 90 > 285){ doc.addPage(); y = 18; }
    try{
      const imgProps = doc.getImageProperties(planImageData);
      const w = maxW;
      const h = (imgProps.height / imgProps.width) * w;
      doc.addImage(planImageData, 'JPEG', marginX, y, w, Math.min(h, 100));
      const drawnH = Math.min(h, 100);
      // Superpose les numéros de points sur l'image dans le PDF
      currentPoints.forEach((p,i)=>{
        const px = marginX + (p.x/100) * w;
        const py = y + (p.y/100) * drawnH;
        doc.setFillColor(178,59,59);
        doc.circle(px, py, 3, 'F');
        doc.setFontSize(7); doc.setTextColor(255,255,255);
        doc.text(String(i+1), px, py+1, {align:'center'});
      });
      y += drawnH + 6;
    } catch(e){ console.error('Erreur insertion plan PDF', e); }
  }

  doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  currentPoints.forEach((p,i)=>{
    if(y > 280){ doc.addPage(); y = 18; }
    line(`Point ${i+1} (${p.type})`, `${p.zone || 'zone non précisée'} — ${p.description || 'sans observation'}`);
  });

  doc.save(`RDV-${prospect.nom.replace(/[^a-z0-9]/gi,'_')}.pdf`);
}

// ---------- Init ----------
function boot(){
  readProspectFromUrl();
  renderProspectIdentite();
  buildChecks('problematiques-checks', CFG.problematiques, 'problematiques');
  buildChecks('consequences-checks', CFG.consequences, 'consequences');
  buildNuisiblesUI();

  document.querySelectorAll('input[name="a-prestataire"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      el('prestataire-details').style.display = document.querySelector('input[name="a-prestataire"]:checked').value === 'oui' ? 'block' : 'none';
    });
  });

  el('plan-upload').addEventListener('change', (e)=> handlePlanUpload(e.target.files[0]));
  el('plan-camera').addEventListener('change', (e)=> handlePlanUpload(e.target.files[0]));
  el('remove-plan-btn').addEventListener('click', removePlan);
  el('plan-image').addEventListener('click', onPlanClick);

  el('save-btn').addEventListener('click', handleSave);
  el('export-pdf-btn').addEventListener('click', exportPdf);

  renderPointsList();

  supabaseClient = initSupabase();
  loadExisting();

  if(!el('rdv-date').value){
    el('rdv-date').value = new Date().toISOString().slice(0,10);
  }
}

window.RDV_APP = {boot};

})();
