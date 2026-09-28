(function(){

let sb = null;
let currentUser = null;
let myEntities = [];       // entités affectées à l'utilisateur courant
let selectedEntity = null;
let lines = [];            // {designation, quantite, prix_unitaire_ht}
let devisId = null;        // renseigné une fois le devis enregistré (permet de le mettre à jour / générer le PDF)
let devisNumero = null;

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

function formatEuro(n){
  return (Number(n)||0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
}

function qs(){ return new URLSearchParams(window.location.search); }

// --- Entité émettrice ------------------------------------------------------

async function loadMyEntities(){
  const {data, error} = await sb.from('user_agences')
    .select('agence_id, agences(*)')
    .eq('user_id', currentUser.id);
  if(error){ showToast('Erreur : ' + error.message); return []; }
  let list = (data||[]).map(r => r.agences).filter(Boolean);
  if(!list.length){
    // Repli : si l'utilisateur n'a aucune entité affectée, on lui propose la liste
    // complète plutôt que de le bloquer (utile tant que les affectations ne sont
    // pas toutes faites depuis Administration → Facturation des entités).
    const {data: all, error: err2} = await sb.from('agences').select('*').order('name', {ascending:true});
    if(!err2) list = all || [];
  }
  return list;
}

function renderEntityPicker(){
  const single = document.getElementById('devis-entity-single');
  const select = document.getElementById('devis-entity-select');
  const empty = document.getElementById('devis-entity-empty');
  single.style.display = 'none';
  select.style.display = 'none';
  empty.style.display = 'none';

  if(!myEntities.length){
    empty.style.display = 'block';
    return;
  }
  if(myEntities.length === 1){
    selectedEntity = myEntities[0];
    single.textContent = selectedEntity.name || '(entité sans nom)';
    single.style.display = 'block';
    return;
  }
  select.innerHTML = '<option value="">— Choisir une entité —</option>' +
    myEntities.map(e => `<option value="${e.id}">${escapeHtml(e.name || '(sans nom)')}</option>`).join('');
  select.style.display = 'block';
  select.addEventListener('change', ()=>{
    selectedEntity = myEntities.find(e => e.id === select.value) || null;
  });
}

// --- Client (pré-remplissage depuis la prospection) ------------------------

function prefillClient(){
  const p = qs();
  const map = {
    'devis-client-nom': p.get('nom'),
    'devis-client-siren': p.get('siren'),
    'devis-client-adresse': p.get('adresse'),
    'devis-client-cp': p.get('cp'),
    'devis-client-commune': p.get('commune'),
    'devis-client-contact-nom': p.get('contact_nom'),
    'devis-client-contact-email': p.get('contact_email'),
    'devis-client-contact-tel': p.get('contact_tel')
  };
  Object.entries(map).forEach(([id, val])=>{
    if(val) document.getElementById(id).value = val;
  });
  linkedListItemId = p.get('list_item_id') || null;
  linkedContactId = p.get('contact_id') || null;
  if(linkedListItemId || linkedContactId){
    const note = document.getElementById('devis-linked-note');
    note.style.display = 'block';
    note.textContent = '🔗 Ce devis est rattaché à une fiche de la liste de prospection' + (p.get('nom') ? ` (${p.get('nom')})` : '') + '.';
  }
  const back = document.getElementById('devis-back-link');
  back.addEventListener('click', (e)=>{
    e.preventDefault();
    if(document.referrer) window.history.back();
    else window.location.href = 'prospection-listes.html';
  });
}

let linkedListItemId = null;
let linkedContactId = null;

function currentClientPatch(){
  return {
    client_nom: document.getElementById('devis-client-nom').value.trim() || null,
    client_siren: document.getElementById('devis-client-siren').value.trim() || null,
    client_adresse: document.getElementById('devis-client-adresse').value.trim() || null,
    client_cp: document.getElementById('devis-client-cp').value.trim() || null,
    client_commune: document.getElementById('devis-client-commune').value.trim() || null,
    client_contact_nom: document.getElementById('devis-client-contact-nom').value.trim() || null,
    client_contact_email: document.getElementById('devis-client-contact-email').value.trim() || null,
    client_contact_telephone: document.getElementById('devis-client-contact-tel').value.trim() || null,
    list_item_id: linkedListItemId,
    contact_id: linkedContactId
  };
}

// --- Lignes de prestations ---------------------------------------------------

function addLine(line){
  lines.push(line || {designation:'', quantite:1, prix_unitaire_ht:0});
  renderLines();
}

function renderLines(){
  const body = document.getElementById('devis-lines-body');
  body.innerHTML = lines.map((l, i) => `
    <tr data-idx="${i}">
      <td><input type="text" class="devis-line-desig" value="${escapeHtml(l.designation)}" placeholder="ex : Contrat dératisation annuel" /></td>
      <td style="width:70px;"><input type="number" class="devis-line-qty" value="${l.quantite}" min="0" step="1" /></td>
      <td style="width:120px;"><input type="number" class="devis-line-price" value="${l.prix_unitaire_ht}" min="0" step="0.01" /></td>
      <td class="devis-line-total">${formatEuro((l.quantite||0) * (l.prix_unitaire_ht||0))}</td>
      <td><button type="button" class="devis-line-del" title="Supprimer cette ligne">✕</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(tr=>{
    const idx = Number(tr.dataset.idx);
    tr.querySelector('.devis-line-desig').addEventListener('input', (e)=>{ lines[idx].designation = e.target.value; });
    tr.querySelector('.devis-line-qty').addEventListener('input', (e)=>{ lines[idx].quantite = Number(e.target.value)||0; updateLineTotal(tr, idx); });
    tr.querySelector('.devis-line-price').addEventListener('input', (e)=>{ lines[idx].prix_unitaire_ht = Number(e.target.value)||0; updateLineTotal(tr, idx); });
    tr.querySelector('.devis-line-del').addEventListener('click', ()=>{ lines.splice(idx,1); renderLines(); });
  });
  updateTotals();
}

function updateLineTotal(tr, idx){
  tr.querySelector('.devis-line-total').textContent = formatEuro((lines[idx].quantite||0) * (lines[idx].prix_unitaire_ht||0));
  updateTotals();
}

function updateTotals(){
  const ht = lines.reduce((s,l)=> s + (l.quantite||0)*(l.prix_unitaire_ht||0), 0);
  const tauxTva = Number(document.getElementById('devis-tva-taux').value) || 0;
  const tva = ht * tauxTva / 100;
  const ttc = ht + tva;
  document.getElementById('devis-total-ht').textContent = formatEuro(ht);
  document.getElementById('devis-total-tva').textContent = formatEuro(tva);
  document.getElementById('devis-total-ttc').textContent = formatEuro(ttc);
  return {ht, tva, ttc, tauxTva};
}

// --- Enregistrement ----------------------------------------------------------

function nextNumero(){
  const now = new Date();
  const y = now.getFullYear();
  const rand = Math.floor(Math.random()*9000+1000);
  return `DEV-${y}-${rand}`;
}

async function saveDevis(){
  if(!selectedEntity){ showToast('Sélectionnez une entité émettrice'); return; }
  const clientNom = document.getElementById('devis-client-nom').value.trim();
  if(!clientNom){ showToast('Indiquez le nom du client'); return; }
  if(!lines.length || lines.every(l=>!l.designation.trim())){ showToast('Ajoutez au moins une prestation'); return; }

  const totals = updateTotals();
  const btn = document.getElementById('devis-save-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';
  document.getElementById('devis-msg').textContent = '';

  try{
    const payload = {
      ...currentClientPatch(),
      agence_id: selectedEntity.id,
      created_by: currentUser.id,
      date_devis: document.getElementById('devis-date').value || new Date().toISOString().slice(0,10),
      validite_jours: Number(document.getElementById('devis-validite').value) || 30,
      taux_tva: totals.tauxTva,
      conditions: document.getElementById('devis-conditions').value.trim() || null,
      notes: document.getElementById('devis-notes').value.trim() || null,
      montant_ht: totals.ht,
      montant_tva: totals.tva,
      montant_ttc: totals.ttc,
      updated_at: new Date().toISOString()
    };

    if(devisId){
      const {error} = await sb.from('devis').update(payload).eq('id', devisId);
      if(error) throw error;
      await sb.from('devis_lignes').delete().eq('devis_id', devisId);
    }else{
      devisNumero = nextNumero();
      payload.numero = devisNumero;
      payload.status = 'brouillon';
      const {data, error} = await sb.from('devis').insert(payload).select().single();
      if(error) throw error;
      devisId = data.id;
      document.getElementById('devis-status-card').style.display = 'block';
      document.getElementById('devis-status-select').value = 'brouillon';
    }

    const lignesPayload = lines.filter(l=>l.designation.trim()).map((l, i)=> ({
      devis_id: devisId, ordre: i, designation: l.designation.trim(),
      quantite: l.quantite||0, prix_unitaire_ht: l.prix_unitaire_ht||0
    }));
    if(lignesPayload.length){
      const {error: errLignes} = await sb.from('devis_lignes').insert(lignesPayload);
      if(errLignes) throw errLignes;
    }

    showToast('Devis enregistré' + (devisNumero ? ` (${devisNumero})` : ''));
  }catch(e){
    document.getElementById('devis-msg').textContent = 'Erreur : ' + e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = '💾 Enregistrer le devis';
  }
}

async function updateStatus(){
  if(!devisId) return;
  const status = document.getElementById('devis-status-select').value;
  try{
    const {error} = await sb.from('devis').update({status, updated_at: new Date().toISOString()}).eq('id', devisId);
    if(error) throw error;
    showToast('Statut mis à jour');
  }catch(e){
    showToast('Erreur : ' + e.message);
  }
}

// --- Génération du PDF ---------------------------------------------------

async function loadImageAsDataUrl(url){
  try{
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }catch(e){ return null; }
}

async function exportPdf(){
  if(!selectedEntity){ showToast('Sélectionnez une entité émettrice'); return; }
  const clientNom = document.getElementById('devis-client-nom').value.trim();
  if(!clientNom){ showToast('Indiquez le nom du client'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const marginX = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  if(selectedEntity.logo_url){
    const dataUrl = await loadImageAsDataUrl(selectedEntity.logo_url);
    if(dataUrl){
      try{
        const props = doc.getImageProperties(dataUrl);
        const w = 28, h = (props.height/props.width)*28;
        doc.addImage(dataUrl, marginX, y, w, h);
      }catch(e){ /* logo illisible : on continue sans */ }
    }
  }

  doc.setFontSize(18); doc.setTextColor(0,60,40);
  doc.text('DEVIS', pageWidth - marginX, y + 6, {align:'right'});
  doc.setFontSize(10); doc.setTextColor(90,90,90);
  doc.text(devisNumero || '(brouillon)', pageWidth - marginX, y + 12, {align:'right'});
  y += 32;

  doc.setFontSize(10); doc.setTextColor(20,20,20);
  const entLines = [
    selectedEntity.name,
    selectedEntity.adresse_postale,
    [selectedEntity.telephone, selectedEntity.email_contact].filter(Boolean).join(' · '),
    selectedEntity.site_web
  ].filter(Boolean);
  entLines.forEach(l => { doc.text(l, marginX, y); y += 5; });
  y += 4;

  doc.setFontSize(11); doc.setTextColor(0,60,40);
  doc.text('Client', marginX, y); y += 5;
  doc.setFontSize(10); doc.setTextColor(20,20,20);
  const clientLines = [
    clientNom,
    document.getElementById('devis-client-adresse').value,
    [document.getElementById('devis-client-cp').value, document.getElementById('devis-client-commune').value].filter(Boolean).join(' '),
    document.getElementById('devis-client-contact-nom').value
  ].filter(Boolean);
  clientLines.forEach(l => { doc.text(l, marginX, y); y += 5; });
  y += 4;

  doc.setFontSize(9.5); doc.setTextColor(90,90,90);
  doc.text(`Date : ${document.getElementById('devis-date').value || '—'}    Validité : ${document.getElementById('devis-validite').value || 30} jours`, marginX, y);
  y += 10;

  // Tableau des lignes
  const colX = [marginX, marginX+95, marginX+120, marginX+150];
  doc.setFontSize(9.5); doc.setTextColor(255,255,255);
  doc.setFillColor(14,69,39);
  doc.rect(marginX, y, pageWidth-2*marginX, 7, 'F');
  doc.text('Désignation', colX[0]+2, y+5);
  doc.text('Qté', colX[1]+2, y+5);
  doc.text('PU HT', colX[2]+2, y+5);
  doc.text('Total HT', colX[3]+2, y+5);
  y += 7;

  doc.setTextColor(20,20,20);
  lines.filter(l=>l.designation.trim()).forEach((l, i)=>{
    if(y > 265){ doc.addPage(); y = 20; }
    const rowH = 7;
    if(i % 2 === 1){ doc.setFillColor(247,248,246); doc.rect(marginX, y, pageWidth-2*marginX, rowH, 'F'); }
    const desig = doc.splitTextToSize(l.designation, 90);
    doc.text(desig, colX[0]+2, y+5);
    doc.text(String(l.quantite), colX[1]+2, y+5);
    doc.text(formatEuro(l.prix_unitaire_ht), colX[2]+2, y+5);
    doc.text(formatEuro((l.quantite||0)*(l.prix_unitaire_ht||0)), colX[3]+2, y+5);
    y += Math.max(rowH, desig.length*5);
  });

  y += 6;
  const totals = updateTotals();
  const totBlock = [
    ['Total HT', formatEuro(totals.ht)],
    [`TVA (${totals.tauxTva}%)`, formatEuro(totals.tva)],
    ['Total TTC', formatEuro(totals.ttc)]
  ];
  totBlock.forEach(([label, val], i)=>{
    doc.setFontSize(i===2 ? 11.5 : 10);
    doc.setTextColor(i===2 ? 0 : 90, i===2 ? 60 : 90, i===2 ? 40 : 90);
    doc.text(label, pageWidth-marginX-55, y, {align:'left'});
    doc.text(val, pageWidth-marginX, y, {align:'right'});
    y += 6;
  });

  const conditions = document.getElementById('devis-conditions').value.trim();
  if(conditions){
    y += 6;
    doc.setFontSize(9.5); doc.setTextColor(90,90,90);
    const wrapped = doc.splitTextToSize('Conditions : ' + conditions, pageWidth-2*marginX);
    if(y + wrapped.length*4.5 > 285){ doc.addPage(); y = 20; }
    doc.text(wrapped, marginX, y);
  }

  // Mentions légales de l'entité émettrice
  const legalParts = [
    selectedEntity.type_societe,
    selectedEntity.rcs ? `RCS ${selectedEntity.rcs}` : null,
    selectedEntity.siret ? `SIRET ${selectedEntity.siret}` : null,
    selectedEntity.ape ? `APE ${selectedEntity.ape}` : null,
    selectedEntity.tva ? `TVA ${selectedEntity.tva}` : null
  ].filter(Boolean);
  if(legalParts.length){
    doc.setFontSize(8); doc.setTextColor(140,140,140);
    doc.text(legalParts.join(' · '), pageWidth/2, 290, {align:'center'});
  }

  doc.save(`Devis-${(clientNom||'client').replace(/[^a-z0-9]/gi,'_')}${devisNumero ? '-'+devisNumero : ''}.pdf`);
}

async function loadExistingDevis(id){
  const {data: devis, error} = await sb.from('devis').select('*').eq('id', id).single();
  if(error || !devis){ showToast('Devis introuvable'); return false; }
  const {data: lignes} = await sb.from('devis_lignes').select('*').eq('devis_id', id).order('ordre', {ascending:true});

  devisId = devis.id;
  devisNumero = devis.numero;
  linkedListItemId = devis.list_item_id || null;
  linkedContactId = devis.contact_id || null;

  document.getElementById('devis-client-nom').value = devis.client_nom || '';
  document.getElementById('devis-client-siren').value = devis.client_siren || '';
  document.getElementById('devis-client-adresse').value = devis.client_adresse || '';
  document.getElementById('devis-client-cp').value = devis.client_cp || '';
  document.getElementById('devis-client-commune').value = devis.client_commune || '';
  document.getElementById('devis-client-contact-nom').value = devis.client_contact_nom || '';
  document.getElementById('devis-client-contact-email').value = devis.client_contact_email || '';
  document.getElementById('devis-client-contact-tel').value = devis.client_contact_telephone || '';

  document.getElementById('devis-date').value = devis.date_devis || new Date().toISOString().slice(0,10);
  document.getElementById('devis-validite').value = devis.validite_jours || 30;
  document.getElementById('devis-tva-taux').value = devis.taux_tva != null ? devis.taux_tva : 20;
  document.getElementById('devis-conditions').value = devis.conditions || '';
  document.getElementById('devis-notes').value = devis.notes || '';

  document.getElementById('devis-status-card').style.display = 'block';
  document.getElementById('devis-status-select').value = devis.status || 'brouillon';

  if(devis.agence_id){
    if(!myEntities.some(e => e.id === devis.agence_id)){
      const {data: ag} = await sb.from('agences').select('*').eq('id', devis.agence_id).single();
      if(ag) myEntities = [ag, ...myEntities];
    }
    selectedEntity = myEntities.find(e => e.id === devis.agence_id) || selectedEntity;
  }
  renderEntityPicker();
  if(devis.agence_id){
    selectedEntity = myEntities.find(e => e.id === devis.agence_id) || selectedEntity;
    const select = document.getElementById('devis-entity-select');
    if(select.style.display !== 'none') select.value = devis.agence_id;
  }

  lines = (lignes||[]).map(l => ({designation: l.designation, quantite: Number(l.quantite), prix_unitaire_ht: Number(l.prix_unitaire_ht)}));
  if(!lines.length) lines = [{designation:'', quantite:1, prix_unitaire_ht:0}];
  renderLines();
  return true;
}

async function boot(supabaseClient, user){
  sb = supabaseClient;
  currentUser = user;

  document.getElementById('devis-date').value = new Date().toISOString().slice(0,10);

  myEntities = await loadMyEntities();

  const editId = qs().get('edit');
  if(editId){
    const ok = await loadExistingDevis(editId);
    if(!ok){ renderEntityPicker(); addLine(); }
  }else{
    renderEntityPicker();
    prefillClient();
    addLine();
  }

  document.getElementById('devis-add-line').addEventListener('click', ()=> addLine());
  document.getElementById('devis-tva-taux').addEventListener('input', updateTotals);
  document.getElementById('devis-save-btn').addEventListener('click', saveDevis);
  document.getElementById('devis-pdf-btn').addEventListener('click', exportPdf);
  document.getElementById('devis-status-select').addEventListener('change', updateStatus);
}

window.DEVIS_APP = { boot };
})();
