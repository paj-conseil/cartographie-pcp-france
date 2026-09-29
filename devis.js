(function(){

let sb = null;
let currentUser = null;
let myEntities = [];       // entités affectées à l'utilisateur courant
let selectedEntity = null;
let lines = [];            // {designation, quantite, prix_unitaire_ht}
let sections = [];         // {titre, contenu}
let devisId = null;        // renseigné une fois le devis enregistré (permet de le mettre à jour / générer le PDF)
let devisNumero = null;

const PHOTO_BUCKET = 'devis-photos';

// Client Supabase séparé, vers le projet de la fonction "visite de site" (rdv.html),
// utilisé uniquement pour la recherche en lecture d'un compte-rendu de visite par SIREN
// dans l'onglet Rapport de visite. Reste null tant que rdv-supabase-config.js n'est pas
// configuré (voir isRdvConfigured ci-dessous) — la saisie manuelle reste alors possible.
let rdvSb = null;

// Rapport de visite : section fixe, toujours ajoutée en tout dernier dans le devis
// généré (après la conclusion), distincte des sections réordonnables de l'onglet Textes.
let rapportVisite = {titre:'', texte:'', photo_url:'', photo_align:'droite'};

const DEFAULT_INTRO = `Madame, Monsieur,

Veuillez trouver ci-joint notre proposition commerciale, établie selon les éléments convenus ensemble. Nous restons à votre disposition pour toute information complémentaire.`;

const DEFAULT_CONCLUSION = `Pour toute question relative à cette proposition ou pour échanger sur vos besoins, votre interlocuteur dédié reste à votre disposition.`;

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

// La fiche de prospection fournit une "adresse" qui inclut déjà le code postal et la
// commune en fin de chaîne (format de l'API gouvernementale) ; comme le code postal et
// la commune sont aussi transmis séparément et affichés à part, on les retire ici de
// l'adresse pour éviter qu'ils n'apparaissent deux fois.
function stripTrailingCpCommune(adresse, cp, commune){
  if(!adresse) return adresse || '';
  let result = adresse.trim();
  const esc = s => (s||'').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escCp = esc(cp), escCommune = esc(commune);
  if(escCp && escCommune){
    result = result.replace(new RegExp('[,\\s]*' + escCp + '\\s+' + escCommune + '\\s*$', 'i'), '');
  }
  if(escCommune){
    result = result.replace(new RegExp('[,\\s]*' + escCommune + '\\s*$', 'i'), '');
  }
  if(escCp){
    result = result.replace(new RegExp('[,\\s]*' + escCp + '\\s*$', 'i'), '');
  }
  return result.trim().replace(/,\s*$/, '');
}

function prefillClient(){
  const p = qs();
  const map = {
    'devis-client-nom': p.get('nom'),
    'devis-client-siren': p.get('siren'),
    'devis-client-adresse': stripTrailingCpCommune(p.get('adresse'), p.get('cp'), p.get('commune')),
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

  // Par défaut, l'adresse du site reprend l'adresse de facturation (le plus fréquent) ;
  // reste modifiable si le site d'intervention est différent.
  document.getElementById('devis-site-adresse').value = document.getElementById('devis-client-adresse').value;
  document.getElementById('devis-site-cp').value = document.getElementById('devis-client-cp').value;
  document.getElementById('devis-site-commune').value = document.getElementById('devis-client-commune').value;
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
    client_site_adresse: document.getElementById('devis-site-adresse').value.trim() || null,
    client_site_cp: document.getElementById('devis-site-cp').value.trim() || null,
    client_site_commune: document.getElementById('devis-site-commune').value.trim() || null,
    client_contact_nom: document.getElementById('devis-client-contact-nom').value.trim() || null,
    client_contact_email: document.getElementById('devis-client-contact-email').value.trim() || null,
    client_contact_telephone: document.getElementById('devis-client-contact-tel').value.trim() || null,
    list_item_id: linkedListItemId,
    contact_id: linkedContactId
  };
}

// --- Photos d'illustration (sections + rapport de visite) --------------------

// Redimensionne/compresse une image côté client avant envoi (même principe que la
// fonction "visite de site" pour son plan de site) afin de limiter la taille stockée.
function compressImageFile(file, maxW){
  return new Promise((resolve, reject)=>{
    if(!file || !file.type || !file.type.startsWith('image/')){
      reject(new Error('Le fichier sélectionné n\'est pas une image.')); return;
    }
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error('Impossible de lire ce fichier.'));
    reader.onload = (e)=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('Impossible de charger cette image.'));
      img.onload = ()=>{
        try{
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob=>{
            if(!blob){ reject(new Error('Erreur lors de la compression de l\'image.')); return; }
            resolve(blob);
          }, 'image/jpeg', 0.75);
        }catch(err){ reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadPhoto(file){
  const blob = await compressImageFile(file, 1000);
  const safeUser = currentUser && currentUser.id ? currentUser.id : 'anon';
  const filePath = `${safeUser}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  const {error: upErr} = await sb.storage.from(PHOTO_BUCKET).upload(filePath, blob, {contentType:'image/jpeg'});
  if(upErr) throw upErr;
  const {data} = sb.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// --- Rapport de visite (recherche dans la fonction "visite de site") ---------

function isRdvConfigured(){
  return window.RDV_SUPABASE_URL && !window.RDV_SUPABASE_URL.startsWith('REMPLACER')
    && window.RDV_SUPABASE_ANON_KEY && !window.RDV_SUPABASE_ANON_KEY.startsWith('REMPLACER');
}

function initRdvClient(){
  if(!isRdvConfigured() || !window.supabase) return null;
  try{ return window.supabase.createClient(window.RDV_SUPABASE_URL, window.RDV_SUPABASE_ANON_KEY); }
  catch(e){ console.error('Erreur d\'initialisation du client RDV', e); return null; }
}

// Types de nuisibles français utilisés côté "visite de site" (rdv-config.js) — pas besoin
// de les recopier ici : les points renvoyés par Supabase portent déjà leur libellé "type".
function formatVisiteRecommandations(rdvRow){
  const parts = [];
  if(rdvRow.visite_notes && rdvRow.visite_notes.trim()) parts.push(rdvRow.visite_notes.trim());
  (rdvRow.points || []).forEach((p, i)=>{
    const zone = p.zone && p.zone.trim() ? p.zone.trim() : 'zone non précisée';
    const desc = p.description && p.description.trim() ? p.description.trim() : 'sans observation';
    parts.push(`Point ${i+1} (${p.type || '—'}) — ${zone} : ${desc}`);
  });
  return parts.join('\n\n');
}

async function searchVisiteReport(){
  const siren = document.getElementById('devis-visite-siren').value.trim();
  const resultBox = document.getElementById('devis-visite-lookup-result');
  const btn = document.getElementById('devis-visite-search-btn');
  if(!siren){ showToast('Indiquez un SIREN à rechercher'); return; }
  if(!rdvSb){
    resultBox.className = 'devis-visite-lookup-result error';
    resultBox.innerHTML = 'La recherche automatique n\'est pas disponible : la clé de connexion au projet "visite de site" n\'est pas configurée (rdv-supabase-config.js). Vous pouvez renseigner la section manuellement ci-dessous.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Recherche...';
  resultBox.className = 'devis-visite-lookup-result';
  resultBox.textContent = '';
  try{
    const {data, error} = await rdvSb.from('rdv_prospects').select('*').eq('siren', siren).maybeSingle();
    if(error) throw error;
    if(!data){
      resultBox.className = 'devis-visite-lookup-result empty-state';
      resultBox.textContent = `Aucun compte-rendu de visite trouvé pour le SIREN ${siren}. Vous pouvez renseigner la section manuellement ci-dessous.`;
      return;
    }
    const dateInfo = data.date_rdv ? new Date(data.date_rdv).toLocaleDateString('fr-FR') : 'date inconnue';
    const nbPoints = (data.points || []).length;
    resultBox.className = 'devis-visite-lookup-result found';
    resultBox.innerHTML = `✅ Compte-rendu de visite trouvé pour <strong>${escapeHtml(data.nom_entreprise || siren)}</strong> (${dateInfo}, ${nbPoints} point${nbPoints>1?'s':''} relevé${nbPoints>1?'s':''}).`;
    const insertBtn = document.createElement('button');
    insertBtn.type = 'button';
    insertBtn.textContent = 'Insérer dans le devis';
    insertBtn.addEventListener('click', ()=>{
      document.getElementById('devis-visite-titre').value = document.getElementById('devis-visite-titre').value.trim() || 'Rapport de visite';
      document.getElementById('devis-visite-texte').value = formatVisiteRecommandations(data);
      rapportVisite.titre = document.getElementById('devis-visite-titre').value;
      rapportVisite.texte = document.getElementById('devis-visite-texte').value;
      if(data.plan_image){
        rapportVisite.photo_url = data.plan_image; // recopié tel quel (base64) : figé dans le devis, indépendant d'une modification ultérieure de la visite
        rapportVisite.photo_align = rapportVisite.photo_align || 'droite';
        renderVisitePhotoPreview();
      }
      showToast('Compte-rendu de visite inséré — vous pouvez encore le modifier ci-dessous.');
    });
    resultBox.appendChild(insertBtn);
  }catch(e){
    resultBox.className = 'devis-visite-lookup-result error';
    resultBox.textContent = 'Erreur lors de la recherche : ' + e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = '🔍 Rechercher le compte-rendu de visite';
  }
}

function renderVisitePhotoPreview(){
  const preview = document.getElementById('devis-visite-photo-preview');
  const label = document.getElementById('devis-visite-photo-label');
  const alignWrap = document.getElementById('devis-visite-photo-align-wrap');
  const removeBtn = document.getElementById('devis-visite-photo-remove');
  const alignSelect = document.getElementById('devis-visite-photo-align');
  if(rapportVisite.photo_url){
    preview.src = rapportVisite.photo_url;
    preview.style.display = '';
    label.textContent = '📷 Changer la photo';
    alignWrap.style.display = '';
    removeBtn.style.display = '';
    alignSelect.value = rapportVisite.photo_align === 'gauche' ? 'gauche' : 'droite';
  }else{
    preview.style.display = 'none';
    preview.src = '';
    label.textContent = '📷 Ajouter une photo';
    alignWrap.style.display = 'none';
    removeBtn.style.display = 'none';
  }
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

function updateRemiseSuffix(){
  const type = document.getElementById('devis-remise-type').value;
  document.getElementById('devis-remise-suffix').textContent = type === 'montant' ? '€' : '%';
}

function getConditionsPaiement(){
  const select = document.getElementById('devis-cond-paiement-select');
  if(select.value === 'autre') return document.getElementById('devis-cond-paiement-autre').value.trim();
  return select.value;
}

function updateTotals(){
  const htBrut = lines.reduce((s,l)=> s + (l.quantite||0)*(l.prix_unitaire_ht||0), 0);
  const remiseType = document.getElementById('devis-remise-type').value;
  const remiseValeur = Number(document.getElementById('devis-remise-valeur').value) || 0;
  let remiseMontant = 0;
  if(remiseType === 'pourcentage') remiseMontant = htBrut * remiseValeur / 100;
  else if(remiseType === 'montant') remiseMontant = remiseValeur;
  remiseMontant = Math.max(0, Math.min(remiseMontant, htBrut));

  const ht = htBrut - remiseMontant;
  const tauxTva = Number(document.getElementById('devis-tva-taux').value) || 0;
  const tva = ht * tauxTva / 100;
  const ttc = ht + tva;

  document.getElementById('devis-total-ht-brut').textContent = formatEuro(htBrut);
  document.getElementById('devis-remise-row').style.display = remiseMontant > 0 ? 'flex' : 'none';
  document.getElementById('devis-remise-label').textContent = remiseType === 'pourcentage' ? `Remise (${remiseValeur}%)` : 'Remise';
  document.getElementById('devis-total-remise').textContent = '− ' + formatEuro(remiseMontant);
  document.getElementById('devis-total-ht').textContent = formatEuro(ht);
  document.getElementById('devis-total-tva').textContent = formatEuro(tva);
  document.getElementById('devis-total-ttc').textContent = formatEuro(ttc);
  return {htBrut, remiseType, remiseValeur, remiseMontant, ht, tva, ttc, tauxTva};
}

// --- Sections configurables ---------------------------------------------------

function addSection(section){
  sections.push(section || {type:'custom', titre:'', contenu:'', photo_url:'', photo_align:'droite'});
  renderSections();
}

function ensurePrestationsSection(){
  if(!sections.some(s=>s.type==='prestations')) sections.unshift({type:'prestations', titre:'Prestations'});
}

// Liste unique, réordonnable par glisser-déposer, mêlant les sections créées par
// l'utilisateur et le bloc Prestations (dont seul l'emplacement se règle ici — son
// contenu se modifie dans l'onglet Prestations).
function renderSections(){
  ensurePrestationsSection();
  const wrap = document.getElementById('devis-sections-list');
  wrap.innerHTML = sections.map((s, i) => s.type === 'prestations' ? `
    <div class="devis-section-item devis-section-prestations" data-idx="${i}">
      <span class="devis-section-drag-handle" draggable="true" title="Glisser pour réordonner">⠿⠿</span>
      <div class="devis-section-fields">
        <input type="text" class="devis-section-titre" value="${escapeHtml(s.titre != null ? s.titre : 'Prestations')}" placeholder="Titre de la section (ex : Prestations)" />
        <p class="devis-section-prestations-note">📦 Lignes, totaux et conditions de facturation — modifiables dans l'onglet Prestations. Seul le titre et l'emplacement se règlent ici.</p>
      </div>
    </div>
  ` : `
    <div class="devis-section-item" data-idx="${i}">
      <span class="devis-section-drag-handle" draggable="true" title="Glisser pour réordonner">⠿⠿</span>
      <div class="devis-section-fields">
        <input type="text" class="devis-section-titre" value="${escapeHtml(s.titre)}" placeholder="Titre de la section (ex : Résumé du plan de protection)" />
        <div class="devis-section-photo-row">
          <div class="devis-section-photo-controls">
            <label class="devis-mini-link">📷 ${s.photo_url ? 'Changer la photo' : 'Ajouter une photo'}
              <input type="file" class="devis-section-photo-input" accept="image/*" style="display:none;" />
            </label>
            ${s.photo_url ? `
              <label>Alignement
                <select class="devis-section-photo-align">
                  <option value="droite" ${s.photo_align!=='gauche'?'selected':''}>Droite</option>
                  <option value="gauche" ${s.photo_align==='gauche'?'selected':''}>Gauche</option>
                </select>
              </label>
              <button type="button" class="devis-mini-link devis-section-photo-remove">Retirer la photo</button>
            ` : ''}
          </div>
          ${s.photo_url ? `<img src="${s.photo_url}" class="devis-section-photo-preview" />` : ''}
        </div>
        <textarea class="devis-section-contenu" rows="3" placeholder="Texte de la section — **gras**, *italique*">${escapeHtml(s.contenu)}</textarea>
      </div>
      <button type="button" class="devis-section-del">✕ Supprimer cette section</button>
    </div>
  `).join('');
  wrap.querySelectorAll('.devis-section-item').forEach(item=>{
    const idx = Number(item.dataset.idx);
    const titreInput = item.querySelector('.devis-section-titre');
    const contenuInput = item.querySelector('.devis-section-contenu');
    if(titreInput) titreInput.addEventListener('input', (e)=>{ sections[idx].titre = e.target.value; });
    if(contenuInput) contenuInput.addEventListener('input', (e)=>{ sections[idx].contenu = e.target.value; });
    const delBtn = item.querySelector('.devis-section-del');
    if(delBtn) delBtn.addEventListener('click', ()=>{ sections.splice(idx,1); renderSections(); });

    const photoInput = item.querySelector('.devis-section-photo-input');
    if(photoInput) photoInput.addEventListener('change', async (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      photoInput.disabled = true;
      try{
        const url = await uploadPhoto(file);
        sections[idx].photo_url = url;
        if(!sections[idx].photo_align) sections[idx].photo_align = 'droite';
        renderSections();
        showToast('Photo ajoutée à la section');
      }catch(err){
        showToast('Erreur : ' + err.message);
        photoInput.disabled = false;
      }
    });
    const alignSelect = item.querySelector('.devis-section-photo-align');
    if(alignSelect) alignSelect.addEventListener('change', (e)=>{ sections[idx].photo_align = e.target.value; });
    const photoRemoveBtn = item.querySelector('.devis-section-photo-remove');
    if(photoRemoveBtn) photoRemoveBtn.addEventListener('click', ()=>{
      sections[idx].photo_url = '';
      sections[idx].photo_align = '';
      renderSections();
    });
  });
  wireSectionsDragAndDrop(wrap);
}

// Glisser-déposer des sections (et du bloc Prestations) pour définir leur ordre
// d'apparition dans le devis généré. L'ordre est reconstruit depuis le DOM à la fin
// du déplacement, puis persisté avec le devis (saveDevis).
let draggedSectionEl = null;
function wireSectionsDragAndDrop(wrap){
  wrap.querySelectorAll('.devis-section-drag-handle').forEach(handle=>{
    handle.addEventListener('dragstart', ()=>{
      draggedSectionEl = handle.closest('.devis-section-item');
      draggedSectionEl.classList.add('dragging');
    });
  });
  if(wrap.dataset.dndWired) return;
  wrap.dataset.dndWired = '1';
  wrap.addEventListener('dragover', (e)=>{
    e.preventDefault();
    if(!draggedSectionEl) return;
    const row = e.target.closest('.devis-section-item');
    if(!row || row === draggedSectionEl || row.parentElement !== wrap) return;
    const rect = row.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    wrap.insertBefore(draggedSectionEl, before ? row : row.nextSibling);
  });
  wrap.addEventListener('dragend', ()=>{
    if(!draggedSectionEl) return;
    draggedSectionEl.classList.remove('dragging');
    sections = Array.from(wrap.querySelectorAll('.devis-section-item')).map(el => sections[Number(el.dataset.idx)]);
    draggedSectionEl = null;
    renderSections();
  });
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
      objet: document.getElementById('devis-objet').value.trim() || null,
      conditions: getConditionsPaiement() || null,
      notes: document.getElementById('devis-notes').value.trim() || null,
      texte_intro: document.getElementById('devis-texte-intro').value.trim() || null,
      texte_conclusion: document.getElementById('devis-texte-conclusion').value.trim() || null,
      emetteur_contact_nom: document.getElementById('devis-emetteur-nom').value.trim() || null,
      emetteur_contact_email: document.getElementById('devis-emetteur-email').value.trim() || null,
      emetteur_contact_telephone: document.getElementById('devis-emetteur-tel').value.trim() || null,
      remise_type: totals.remiseType || null,
      remise_valeur: totals.remiseValeur || 0,
      remise_montant: totals.remiseMontant || 0,
      montant_ht: totals.ht,
      montant_tva: totals.tva,
      montant_ttc: totals.ttc,
      rapport_visite_titre: rapportVisite.texte.trim() || rapportVisite.photo_url ? (rapportVisite.titre.trim() || 'Rapport de visite') : null,
      rapport_visite_texte: rapportVisite.texte.trim() || null,
      rapport_visite_photo_url: rapportVisite.photo_url || null,
      rapport_visite_photo_align: rapportVisite.photo_align || 'droite',
      updated_at: new Date().toISOString()
    };

    if(devisId){
      const {error} = await sb.from('devis').update(payload).eq('id', devisId);
      if(error) throw error;
      await sb.from('devis_lignes').delete().eq('devis_id', devisId);
      await sb.from('devis_sections').delete().eq('devis_id', devisId);
    }else{
      devisNumero = nextNumero();
      payload.numero = devisNumero;
      payload.status = 'brouillon';
      const {data, error} = await sb.from('devis').insert(payload).select().single();
      if(error) throw error;
      devisId = data.id;
      document.getElementById('devis-numero-display').value = devisNumero;
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

    const sectionsPayload = sections
      .filter(s => s.type === 'prestations' || (s.titre && s.titre.trim()) || (s.contenu && s.contenu.trim()) || (s.photo_url))
      .map((s, i)=> ({
        devis_id: devisId, ordre: i, type: s.type || 'custom',
        titre: (s.titre||'').trim(),
        contenu: s.type === 'prestations' ? '' : (s.contenu||'').trim(),
        photo_url: s.type === 'custom' ? (s.photo_url || null) : null,
        photo_align: s.type === 'custom' ? (s.photo_align || 'droite') : null
      }));
    if(sectionsPayload.length){
      const {error: errSections} = await sb.from('devis_sections').insert(sectionsPayload);
      if(errSections) throw errSections;
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

// Rendu simple d'un texte avec **gras** et *italique*, avec retour à la ligne automatique.
function parseFormattedParagraphs(text){
  return (text || '').split(/\n+/).map(p=>{
    const tokens = [];
    const re = /\*\*(.+?)\*\*|\*(.+?)\*|([^*]+)/g;
    let m;
    while((m = re.exec(p))){
      if(m[1] !== undefined) tokens.push({text:m[1], bold:true, italic:false});
      else if(m[2] !== undefined) tokens.push({text:m[2], bold:false, italic:true});
      else if(m[3] !== undefined) tokens.push({text:m[3], bold:false, italic:false});
    }
    return tokens;
  });
}

function fontStyleFor(w){
  if(w.bold && w.italic) return 'bolditalic';
  if(w.bold) return 'bold';
  if(w.italic) return 'italic';
  return 'normal';
}

function renderFormattedText(doc, text, x, y, maxWidth, opts){
  opts = opts || {};
  const lineHeight = opts.lineHeight || 4.8;
  const pageBottom = opts.pageBottom || 280;
  const onNewPage = opts.onNewPage || (()=>{ doc.addPage(); return 20; });
  // getLineBox(y) rend {x, maxWidth} pour la ligne dont le haut est à cette hauteur y ;
  // par défaut une largeur constante, mais utilisé par renderTextWithPhoto pour rétrécir
  // le texte tant qu'il croise la hauteur d'une photo d'illustration.
  const getLineBox = opts.getLineBox || (()=>({x, maxWidth}));
  const paragraphs = parseFormattedParagraphs(text);

  paragraphs.forEach((tokens, pi)=>{
    const words = [];
    tokens.forEach(tok=>{
      tok.text.split(/(\s+)/).forEach(part=>{
        if(part !== '') words.push({text:part, bold:tok.bold, italic:tok.italic});
      });
    });
    let lineWords = [], lineWidth = 0;
    const flush = ()=>{
      const box = getLineBox(y);
      let cx = box.x;
      lineWords.forEach(w=>{
        doc.setFont(undefined, fontStyleFor(w));
        doc.text(w.text, cx, y);
        cx += doc.getTextWidth(w.text);
      });
      y += lineHeight;
      if(y > pageBottom){ y = onNewPage(); }
      lineWords = []; lineWidth = 0;
    };
    words.forEach(w=>{
      doc.setFont(undefined, fontStyleFor(w));
      const ww = doc.getTextWidth(w.text);
      const box = getLineBox(y);
      if(/^\s+$/.test(w.text)){
        if(lineWidth + ww > box.maxWidth) flush();
        else { lineWords.push(w); lineWidth += ww; }
        return;
      }
      if(lineWidth + ww > box.maxWidth && lineWords.length) flush();
      lineWords.push(w);
      lineWidth += ww;
    });
    if(lineWords.length) flush();
    if(pi < paragraphs.length - 1) y += lineHeight * 0.5;
  });
  doc.setFont(undefined, 'normal');
  return y;
}

// Texte habillant une photo d'illustration alignée à gauche ou à droite (comme dans un
// traitement de texte) : le texte se rétrécit tant qu'il croise la hauteur de la photo,
// puis reprend toute la largeur en dessous. photoDataUrl est déjà chargé (voir exportPdf).
function renderTextWithPhoto(doc, text, photoDataUrl, align, x0, y, fullWidth, marginX, pageWidth, newPage){
  if(!photoDataUrl){
    return renderFormattedText(doc, text, x0, y, fullWidth, {lineHeight:5, onNewPage:newPage});
  }
  const imgW = 55;
  let imgH = imgW;
  try{
    const props = doc.getImageProperties(photoDataUrl);
    imgH = (props.height / props.width) * imgW;
    const maxH = 70;
    if(imgH > maxH){ imgW *= maxH / imgH; imgH = maxH; }
  }catch(e){ /* image illisible : on continue sans dimensionnement précis */ }

  const imgTop = y;
  const imgBottom = y + imgH;
  const imgX = align === 'gauche' ? marginX : (pageWidth - marginX - imgW);
  try{ doc.addImage(photoDataUrl, imgX, imgTop, imgW, imgH); }catch(e){ /* image illisible : texte seul */ }

  const gap = 6;
  const narrowX = align === 'gauche' ? (marginX + imgW + gap) : marginX;
  const narrowWidth = fullWidth - imgW - gap;

  // Une fois qu'un saut de page survient pendant ce texte, la photo (restée sur la page
  // précédente) ne concerne plus la mise en page : le texte reprend toute la largeur.
  let imageStillActive = true;
  const onNewPageForText = ()=>{ imageStillActive = false; return newPage(); };
  const getLineBox = (yy)=> (imageStillActive && yy < imgBottom)
    ? {x: narrowX, maxWidth: narrowWidth}
    : {x: x0, maxWidth: fullWidth};

  const textEndY = renderFormattedText(doc, text, x0, y, fullWidth, {lineHeight:5, onNewPage:onNewPageForText, getLineBox});
  return imageStillActive ? Math.max(textEndY, imgBottom + 4) : textEndY;
}

// En-tête / papier à lettre (logo à gauche, coordonnées de l'entité à droite),
// redessiné en haut de chaque page du PDF. logoDataUrl est chargé une seule fois
// avant la génération, puis réutilisé sur chaque page (dessin synchrone).
function drawHeaderPdf(doc, marginX, pageWidth, logoDataUrl){
  let y = 18;
  let logoBottom = y;
  if(logoDataUrl){
    try{
      const props = doc.getImageProperties(logoDataUrl);
      const w = 32, h = (props.height/props.width)*32;
      doc.addImage(logoDataUrl, marginX, y, w, h);
      logoBottom = y + h;
    }catch(e){ /* logo illisible : on continue sans */ }
  }

  const rightX = pageWidth - marginX;
  let ry = y + 2;
  doc.setFontSize(12); doc.setTextColor(0,60,40); doc.setFont(undefined, 'bold');
  doc.text(selectedEntity.name || '', rightX, ry, {align:'right'}); ry += 5.5;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9.5); doc.setTextColor(60,60,60);
  const coordLines = [
    selectedEntity.adresse_postale,
    [selectedEntity.telephone, selectedEntity.email_contact].filter(Boolean).join(' · '),
    selectedEntity.site_web
  ].filter(Boolean);
  coordLines.forEach(l => { doc.text(l, rightX, ry, {align:'right'}); ry += 4.6; });

  y = Math.max(logoBottom, ry) + 6;
  doc.setDrawColor(210,215,208); doc.line(marginX, y, pageWidth-marginX, y); y += 10;
  return y;
}

// Pied de page (mentions légales de l'entité émettrice), redessiné en bas de chaque
// page à la toute fin de la génération (une fois le nombre total de pages connu).
function drawFooterPdf(doc, pageWidth){
  const legalParts = [
    selectedEntity.type_societe,
    selectedEntity.rcs ? `RCS ${selectedEntity.rcs}` : null,
    selectedEntity.siret ? `SIRET ${selectedEntity.siret}` : null,
    selectedEntity.ape ? `APE ${selectedEntity.ape}` : null,
    selectedEntity.tva ? `TVA ${selectedEntity.tva}` : null
  ].filter(Boolean);
  if(!legalParts.length) return;
  doc.setFontSize(8); doc.setTextColor(140,140,140);
  doc.text(legalParts.join(' · '), pageWidth/2, 290, {align:'center'});
}

// Bloc "Prestations" (tableau des lignes, totaux, conditions de facturation) du PDF,
// extrait à part pour pouvoir être positionné où l'utilisateur le souhaite parmi ses
// sections configurables (glisser-déposer dans l'onglet Textes).
function renderPrestationsPdf(doc, marginX, pageWidth, y, logoDataUrl){
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
    if(y > 265){ doc.addPage(); y = drawHeaderPdf(doc, marginX, pageWidth, logoDataUrl); }
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
  const totBlock = [];
  if(totals.remiseMontant > 0){
    const remiseLabel = totals.remiseType === 'pourcentage' ? `Remise (${totals.remiseValeur}%)` : 'Remise';
    totBlock.push({label:'Sous-total HT', val:formatEuro(totals.htBrut), bold:false});
    totBlock.push({label:remiseLabel, val:'- ' + formatEuro(totals.remiseMontant), bold:false});
  }
  totBlock.push({label:'Total HT', val:formatEuro(totals.ht), bold:true});
  totBlock.push({label:`TVA (${totals.tauxTva}%)`, val:formatEuro(totals.tva), bold:false});
  totBlock.push({label:'Total TTC', val:formatEuro(totals.ttc), bold:true});
  const totLast = totBlock.length - 1;
  totBlock.forEach(({label, val, bold}, i)=>{
    doc.setFontSize(i===totLast ? 11.5 : 10);
    doc.setTextColor(i===totLast ? 0 : 90, i===totLast ? 60 : 90, i===totLast ? 40 : 90);
    doc.setFont(undefined, bold ? 'bold' : 'normal');
    doc.text(label, pageWidth-marginX-55, y, {align:'left'});
    doc.text(val, pageWidth-marginX, y, {align:'right'});
    doc.setFont(undefined, 'normal');
    y += 6;
  });

  const conditions = getConditionsPaiement();
  if(conditions){
    y += 6;
    doc.setFontSize(9.5); doc.setTextColor(90,90,90);
    const wrapped = doc.splitTextToSize('Conditions : ' + conditions, pageWidth-2*marginX);
    if(y + wrapped.length*4.5 > 285){ doc.addPage(); y = drawHeaderPdf(doc, marginX, pageWidth, logoDataUrl); }
    doc.text(wrapped, marginX, y);
    y += wrapped.length*4.5;
  }
  y += 10;
  return y;
}

async function exportPdf(){
  if(!selectedEntity){ showToast('Sélectionnez une entité émettrice'); return; }
  const clientNom = document.getElementById('devis-client-nom').value.trim();
  if(!clientNom){ showToast('Indiquez le nom du client'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const marginX = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - marginX;

  // Logo chargé une seule fois puis réutilisé pour redessiner l'en-tête sur chaque page.
  const logoDataUrl = selectedEntity.logo_url ? await loadImageAsDataUrl(selectedEntity.logo_url) : null;
  let y = drawHeaderPdf(doc, marginX, pageWidth, logoDataUrl);
  const newPage = ()=>{ doc.addPage(); return drawHeaderPdf(doc, marginX, pageWidth, logoDataUrl); };

  // Photos d'illustration des sections et du rapport de visite, préchargées ici (avant
  // le rendu, qui doit rester synchrone) pour être redessinées de façon fiable page après
  // page. sectionPhotoDataUrls est indexé par photo_url pour éviter de recharger deux fois
  // la même image si elle est réutilisée.
  const sectionPhotoDataUrls = {};
  for(const s of sections){
    if(s.type === 'custom' && s.photo_url && !sectionPhotoDataUrls[s.photo_url]){
      sectionPhotoDataUrls[s.photo_url] = await loadImageAsDataUrl(s.photo_url);
    }
  }
  const visitePhotoDataUrl = rapportVisite.photo_url ? await loadImageAsDataUrl(rapportVisite.photo_url) : null;

  // Titre "DEVIS" en haut à droite ; date / référence / contact en haut à gauche.
  const blockStartY = y;
  doc.setFontSize(16); doc.setTextColor(0,60,40); doc.setFont(undefined, 'bold');
  doc.text('DEVIS', rightX, blockStartY + 6, {align:'right'});

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9.5); doc.setTextColor(90,90,90);
  let leftY = blockStartY + 5;
  const dateLabel = document.getElementById('devis-date').value
    ? new Date(document.getElementById('devis-date').value).toLocaleDateString('fr-FR') : '—';
  doc.text(`Date : ${dateLabel}`, marginX, leftY); leftY += 5;
  doc.text(`Référence : ${devisNumero || '(brouillon)'}`, marginX, leftY); leftY += 5;
  const contactNom = document.getElementById('devis-client-contact-nom').value.trim();
  if(contactNom){
    doc.text(`À l'attention de : ${contactNom}`, marginX, leftY); leftY += 5;
  }
  y = Math.max(blockStartY + 10, leftY) + 5;

  // Client (nom intégré aux adresses, sans le mot "Client") + deux adresses
  doc.setFontSize(11); doc.setTextColor(0,60,40); doc.setFont(undefined, 'bold');
  doc.text(clientNom, marginX, y); y += 6;
  doc.setFont(undefined, 'normal');

  const colHalf = (pageWidth - 2*marginX - 10) / 2;
  const addrColX = [marginX, marginX + colHalf + 10];
  const addrStartY = y;
  let maxAddrY = y;

  const facLines = [
    'Adresse de facturation',
    document.getElementById('devis-client-adresse').value,
    [document.getElementById('devis-client-cp').value, document.getElementById('devis-client-commune').value].filter(Boolean).join(' ')
  ].filter(Boolean);
  const siteAdresse = document.getElementById('devis-site-adresse').value;
  const siteCp = document.getElementById('devis-site-cp').value;
  const siteCommune = document.getElementById('devis-site-commune').value;
  const siteLines = [
    'Adresse du site',
    siteAdresse,
    [siteCp, siteCommune].filter(Boolean).join(' ')
  ].filter(Boolean);

  [facLines, siteLines].forEach((colLines, ci)=>{
    let cy = addrStartY;
    colLines.forEach((l, li)=>{
      doc.setFontSize(li===0 ? 9 : 9.5);
      doc.setTextColor(li===0 ? 130 : 20, li===0 ? 130 : 20, li===0 ? 130 : 20);
      doc.setFont(undefined, li===0 ? 'bold' : 'normal');
      doc.text(l, addrColX[ci], cy);
      cy += li===0 ? 5 : 4.6;
    });
    maxAddrY = Math.max(maxAddrY, cy);
  });
  doc.setFont(undefined, 'normal');
  y = maxAddrY + 10;

  // Objet, juste avant le texte d'introduction
  const objet = document.getElementById('devis-objet').value.trim();
  if(objet){
    doc.setFontSize(10.5); doc.setTextColor(20,20,20); doc.setFont(undefined, 'bold');
    doc.text('Objet : ', marginX, y);
    const objW = doc.getTextWidth('Objet : ');
    doc.setFont(undefined, 'normal');
    const objWrapped = doc.splitTextToSize(objet, pageWidth - 2*marginX - objW);
    doc.text(objWrapped, marginX + objW, y);
    y += Math.max(6, objWrapped.length * 5) + 6;
  }

  // Texte d'introduction
  const intro = document.getElementById('devis-texte-intro').value.trim();
  if(intro){
    doc.setFontSize(10); doc.setTextColor(30,30,30);
    y = renderFormattedText(doc, intro, marginX, y, pageWidth - 2*marginX, {lineHeight:5, onNewPage:newPage});
    y += 6;
  }

  // Bloc Prestations et sections configurables, dans l'ordre défini par l'utilisateur
  // (glisser-déposer dans l'onglet Textes). Filet de sécurité : si le bloc Prestations
  // a disparu de la liste pour une raison quelconque, on le réinsère en premier plutôt
  // que d'omettre les prestations et les totaux du PDF.
  if(!sections.some(s=>s.type==='prestations')) sections.unshift({type:'prestations', titre:'Prestations'});
  sections.forEach(s=>{
    if(y > 265){ y = newPage(); }
    const isPrestations = s.type === 'prestations';
    if(!isPrestations && !(s.titre && s.titre.trim()) && !(s.contenu && s.contenu.trim()) && !s.photo_url) return;

    // Titre + trait épais vert sur toute la largeur : même format pour le bloc
    // Prestations que pour les sections rédigées manuellement.
    const titre = (s.titre || (isPrestations ? 'Prestations' : '')).trim();
    if(titre){
      doc.setFontSize(11.5); doc.setTextColor(0,60,40); doc.setFont(undefined, 'bold');
      doc.text(titre, marginX, y);
      doc.setFont(undefined, 'normal');
      y += 3;
      doc.setDrawColor(27,107,60); doc.setLineWidth(1);
      doc.line(marginX, y, pageWidth - marginX, y);
      doc.setLineWidth(0.2);
      y += 6;
    }

    if(isPrestations){
      y = renderPrestationsPdf(doc, marginX, pageWidth, y, logoDataUrl);
    }else if((s.contenu && s.contenu.trim()) || s.photo_url){
      doc.setFontSize(10); doc.setTextColor(30,30,30);
      const photoDataUrl = s.photo_url ? sectionPhotoDataUrls[s.photo_url] : null;
      y = renderTextWithPhoto(doc, (s.contenu||'').trim(), photoDataUrl, s.photo_align, marginX, y, pageWidth - 2*marginX, marginX, pageWidth, newPage);
    }
    y += 8;
  });

  // Texte de conclusion
  const conclusion = document.getElementById('devis-texte-conclusion').value.trim();
  if(conclusion){
    if(y > 265){ y = newPage(); }
    doc.setFontSize(10); doc.setTextColor(30,30,30);
    y = renderFormattedText(doc, conclusion, marginX, y, pageWidth - 2*marginX, {lineHeight:5, onNewPage:newPage});
    y += 10;
  }

  // Rapport de visite (onglet dédié) : ajouté en tout dernier, dans le même format
  // (titre + trait épais vert) que les autres sections, uniquement si renseigné.
  if((rapportVisite.texte && rapportVisite.texte.trim()) || rapportVisite.photo_url){
    if(y > 265){ y = newPage(); }
    const titreVisite = (rapportVisite.titre || 'Rapport de visite').trim();
    doc.setFontSize(11.5); doc.setTextColor(0,60,40); doc.setFont(undefined, 'bold');
    doc.text(titreVisite, marginX, y);
    doc.setFont(undefined, 'normal');
    y += 3;
    doc.setDrawColor(27,107,60); doc.setLineWidth(1);
    doc.line(marginX, y, pageWidth - marginX, y);
    doc.setLineWidth(0.2);
    y += 6;
    doc.setFontSize(10); doc.setTextColor(30,30,30);
    y = renderTextWithPhoto(doc, (rapportVisite.texte||'').trim(), visitePhotoDataUrl, rapportVisite.photo_align, marginX, y, pageWidth - 2*marginX, marginX, pageWidth, newPage);
    y += 8;
  }

  // Interlocuteur + encart de validation client, côte à côte
  const emetteurNom = document.getElementById('devis-emetteur-nom').value.trim();
  const emetteurEmail = document.getElementById('devis-emetteur-email').value.trim();
  const emetteurTel = document.getElementById('devis-emetteur-tel').value.trim();
  const blockH = 34;
  if(y + blockH > 285){ y = newPage(); }

  const halfW = (pageWidth - 2*marginX - 10) / 2;
  // Bloc interlocuteur (gauche)
  doc.setDrawColor(220,224,218); doc.setLineWidth(0.3);
  doc.rect(marginX, y, halfW, blockH);
  doc.setFontSize(9.5); doc.setTextColor(0,60,40); doc.setFont(undefined, 'bold');
  doc.text('Votre interlocuteur', marginX+4, y+7);
  doc.setFont(undefined, 'normal'); doc.setTextColor(40,40,40); doc.setFontSize(9.5);
  const interLines = [emetteurNom, emetteurEmail, emetteurTel].filter(Boolean);
  interLines.forEach((l,i)=> doc.text(l, marginX+4, y+13+i*4.6));

  // Encart "bon pour accord" (droite)
  const boxX = marginX + halfW + 10;
  doc.rect(boxX, y, halfW, blockH);
  doc.setFontSize(9.5); doc.setTextColor(0,60,40); doc.setFont(undefined, 'bold');
  doc.text('Bon pour accord', boxX+4, y+7);
  doc.setFont(undefined, 'normal'); doc.setTextColor(90,90,90); doc.setFontSize(8.5);
  doc.text('Date, cachet et signature du client :', boxX+4, y+13);
  y += blockH + 10;

  // Pied de page (mentions légales) redessiné sur chaque page, une fois le nombre
  // total de pages connu (dépend du contenu qui a pu se répartir sur plusieurs pages).
  const totalPages = doc.internal.getNumberOfPages();
  for(let p = 1; p <= totalPages; p++){
    doc.setPage(p);
    drawFooterPdf(doc, pageWidth);
  }

  doc.save(`Devis-${(clientNom||'client').replace(/[^a-z0-9]/gi,'_')}${devisNumero ? '-'+devisNumero : ''}.pdf`);
}

async function loadExistingDevis(id){
  const {data: devis, error} = await sb.from('devis').select('*').eq('id', id).single();
  if(error || !devis){ showToast('Devis introuvable'); return false; }
  const {data: lignes} = await sb.from('devis_lignes').select('*').eq('devis_id', id).order('ordre', {ascending:true});
  const {data: devisSections} = await sb.from('devis_sections').select('*').eq('devis_id', id).order('ordre', {ascending:true});

  devisId = devis.id;
  devisNumero = devis.numero;
  linkedListItemId = devis.list_item_id || null;
  linkedContactId = devis.contact_id || null;

  document.getElementById('devis-client-nom').value = devis.client_nom || '';
  document.getElementById('devis-client-siren').value = devis.client_siren || '';
  document.getElementById('devis-client-adresse').value = devis.client_adresse || '';
  document.getElementById('devis-client-cp').value = devis.client_cp || '';
  document.getElementById('devis-client-commune').value = devis.client_commune || '';
  document.getElementById('devis-site-adresse').value = devis.client_site_adresse || '';
  document.getElementById('devis-site-cp').value = devis.client_site_cp || '';
  document.getElementById('devis-site-commune').value = devis.client_site_commune || '';
  document.getElementById('devis-client-contact-nom').value = devis.client_contact_nom || '';
  document.getElementById('devis-client-contact-email').value = devis.client_contact_email || '';
  document.getElementById('devis-client-contact-tel').value = devis.client_contact_telephone || '';

  document.getElementById('devis-date').value = devis.date_devis || new Date().toISOString().slice(0,10);
  document.getElementById('devis-numero-display').value = devis.numero || '';
  document.getElementById('devis-validite').value = devis.validite_jours || 30;
  document.getElementById('devis-tva-taux').value = devis.taux_tva != null ? devis.taux_tva : 20;
  document.getElementById('devis-objet').value = devis.objet || '';

  const condSelect = document.getElementById('devis-cond-paiement-select');
  const condAutreWrap = document.getElementById('devis-cond-paiement-autre-wrap');
  const condAutreInput = document.getElementById('devis-cond-paiement-autre');
  const storedCond = devis.conditions || '';
  const knownCond = Array.from(condSelect.options).some(o => o.value === storedCond);
  if(storedCond && knownCond){
    condSelect.value = storedCond;
    condAutreWrap.style.display = 'none';
    condAutreInput.value = '';
  }else if(storedCond){
    condSelect.value = 'autre';
    condAutreWrap.style.display = '';
    condAutreInput.value = storedCond;
  }else{
    condSelect.value = 'À réception';
    condAutreWrap.style.display = 'none';
    condAutreInput.value = '';
  }

  const remiseType = document.getElementById('devis-remise-type');
  const remiseValeurWrap = document.getElementById('devis-remise-valeur-wrap');
  const remiseValeurInput = document.getElementById('devis-remise-valeur');
  remiseType.value = devis.remise_type || '';
  remiseValeurInput.value = devis.remise_valeur || 0;
  remiseValeurWrap.style.display = remiseType.value ? '' : 'none';
  updateRemiseSuffix();

  document.getElementById('devis-notes').value = devis.notes || '';
  document.getElementById('devis-texte-intro').value = devis.texte_intro || DEFAULT_INTRO;
  document.getElementById('devis-texte-conclusion').value = devis.texte_conclusion || DEFAULT_CONCLUSION;
  document.getElementById('devis-emetteur-nom').value = devis.emetteur_contact_nom || '';
  document.getElementById('devis-emetteur-email').value = devis.emetteur_contact_email || '';
  document.getElementById('devis-emetteur-tel').value = devis.emetteur_contact_telephone || '';

  sections = (devisSections||[]).map(s => s.type === 'prestations'
    ? {type:'prestations', titre: s.titre || 'Prestations'}
    : {type:'custom', titre: s.titre || '', contenu: s.contenu || '', photo_url: s.photo_url || '', photo_align: s.photo_align || 'droite'});
  // Compatibilité : un devis enregistré avant l'ajout de cette fonctionnalité n'a pas
  // de bloc Prestations dans ses sections — on le replace en tête, à sa position d'origine.
  if(!sections.some(s=>s.type==='prestations')) sections.unshift({type:'prestations', titre:'Prestations'});
  renderSections();

  rapportVisite = {
    titre: devis.rapport_visite_titre || '',
    texte: devis.rapport_visite_texte || '',
    photo_url: devis.rapport_visite_photo_url || '',
    photo_align: devis.rapport_visite_photo_align || 'droite'
  };
  document.getElementById('devis-visite-titre').value = rapportVisite.titre;
  document.getElementById('devis-visite-texte').value = rapportVisite.texte;
  document.getElementById('devis-visite-siren').value = devis.client_siren || '';
  renderVisitePhotoPreview();

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
  updateTotals();
  return true;
}

const TAB_ORDER_KEY = 'pcp-devis-tab-order';

function getStoredTabOrder(){
  try{
    const raw = localStorage.getItem(TAB_ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function saveTabOrder(tabsContainer){
  try{
    const order = Array.from(tabsContainer.querySelectorAll('.devis-tab')).map(t=> t.dataset.tab);
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order));
  }catch(e){ /* stockage indisponible : l'ordre par défaut sera utilisé */ }
}

function activateTab(tab){
  const target = tab.dataset.tab;
  document.querySelectorAll('.devis-tab').forEach(t=> t.classList.toggle('active', t === tab));
  document.querySelectorAll('.devis-tab-panel').forEach(panel=>{
    panel.style.display = panel.dataset.panel === target ? '' : 'none';
  });
}

function wireTabs(){
  const tabsContainer = document.querySelector('.devis-tabs');
  if(!tabsContainer) return;

  // Réordonne les onglets selon la préférence enregistrée sur cet appareil
  // (glisser-déposer), les onglets non enregistrés (ex. nouveaux) restant à la fin.
  const storedOrder = getStoredTabOrder();
  if(storedOrder){
    const tabs = Array.from(tabsContainer.querySelectorAll('.devis-tab'));
    const byKey = {};
    tabs.forEach(t=> byKey[t.dataset.tab] = t);
    storedOrder.forEach(key=>{ if(byKey[key]) tabsContainer.appendChild(byKey[key]); });
    tabs.forEach(t=>{ if(!storedOrder.includes(t.dataset.tab)) tabsContainer.appendChild(t); });
  }

  const tabs = Array.from(tabsContainer.querySelectorAll('.devis-tab'));
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=> activateTab(tab));
  });
  // Le premier onglet (selon l'ordre courant) est affiché par défaut.
  if(tabs.length) activateTab(tabs[0]);

  // Glisser-déposer pour réordonner les onglets ; l'ordre est mémorisé sur cet appareil.
  let draggedTab = null;
  tabs.forEach(tab=>{
    tab.addEventListener('dragstart', ()=>{
      draggedTab = tab;
      tab.classList.add('dragging');
    });
    tab.addEventListener('dragend', ()=>{
      tab.classList.remove('dragging');
      tabs.forEach(t=> t.classList.remove('drag-over'));
      draggedTab = null;
      saveTabOrder(tabsContainer);
    });
    tab.addEventListener('dragover', (e)=>{
      e.preventDefault();
      if(!draggedTab || draggedTab === tab) return;
      tabs.forEach(t=> t.classList.remove('drag-over'));
      tab.classList.add('drag-over');
      const rect = tab.getBoundingClientRect();
      const before = (e.clientX - rect.left) < rect.width / 2;
      tabsContainer.insertBefore(draggedTab, before ? tab : tab.nextSibling);
    });
    tab.addEventListener('drop', (e)=> e.preventDefault());
  });
}

async function boot(supabaseClient, user){
  sb = supabaseClient;
  currentUser = user;

  document.getElementById('devis-date').value = new Date().toISOString().slice(0,10);

  myEntities = await loadMyEntities();

  rdvSb = initRdvClient();

  const editId = qs().get('edit');
  if(editId){
    const ok = await loadExistingDevis(editId);
    if(!ok){
      renderEntityPicker(); addLine();
      sections = [{type:'prestations', titre:'Prestations'}]; renderSections();
      document.getElementById('devis-texte-intro').value = DEFAULT_INTRO;
      document.getElementById('devis-texte-conclusion').value = DEFAULT_CONCLUSION;
      rapportVisite = {titre:'', texte:'', photo_url:'', photo_align:'droite'};
      renderVisitePhotoPreview();
    }
  }else{
    renderEntityPicker();
    prefillClient();
    addLine();
    sections = [{type:'prestations', titre:'Prestations'}]; renderSections();
    document.getElementById('devis-texte-intro').value = DEFAULT_INTRO;
    document.getElementById('devis-texte-conclusion').value = DEFAULT_CONCLUSION;
    if(currentUser && currentUser.email) document.getElementById('devis-emetteur-email').value = currentUser.email;
    document.getElementById('devis-visite-siren').value = document.getElementById('devis-client-siren').value;
    rapportVisite = {titre:'', texte:'', photo_url:'', photo_align:'droite'};
    renderVisitePhotoPreview();
  }

  document.getElementById('devis-add-line').addEventListener('click', ()=> addLine());
  document.getElementById('devis-add-section').addEventListener('click', ()=> addSection());
  document.getElementById('devis-site-same-btn').addEventListener('click', ()=>{
    document.getElementById('devis-site-adresse').value = document.getElementById('devis-client-adresse').value;
    document.getElementById('devis-site-cp').value = document.getElementById('devis-client-cp').value;
    document.getElementById('devis-site-commune').value = document.getElementById('devis-client-commune').value;
  });
  document.getElementById('devis-tva-taux').addEventListener('change', updateTotals);
  document.getElementById('devis-remise-type').addEventListener('change', ()=>{
    document.getElementById('devis-remise-valeur-wrap').style.display = document.getElementById('devis-remise-type').value ? '' : 'none';
    updateRemiseSuffix();
    updateTotals();
  });
  document.getElementById('devis-remise-valeur').addEventListener('input', updateTotals);
  document.getElementById('devis-cond-paiement-select').addEventListener('change', ()=>{
    document.getElementById('devis-cond-paiement-autre-wrap').style.display = document.getElementById('devis-cond-paiement-select').value === 'autre' ? '' : 'none';
  });
  document.getElementById('devis-save-btn').addEventListener('click', saveDevis);
  document.getElementById('devis-pdf-btn').addEventListener('click', exportPdf);
  document.getElementById('devis-status-select').addEventListener('change', updateStatus);

  document.getElementById('devis-visite-search-btn').addEventListener('click', searchVisiteReport);
  document.getElementById('devis-visite-titre').addEventListener('input', (e)=>{ rapportVisite.titre = e.target.value; });
  document.getElementById('devis-visite-texte').addEventListener('input', (e)=>{ rapportVisite.texte = e.target.value; });
  document.getElementById('devis-visite-photo-align').addEventListener('change', (e)=>{ rapportVisite.photo_align = e.target.value; });
  document.getElementById('devis-visite-photo-remove').addEventListener('click', ()=>{
    rapportVisite.photo_url = '';
    renderVisitePhotoPreview();
  });
  document.getElementById('devis-visite-photo-input').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const input = e.target;
    input.disabled = true;
    try{
      rapportVisite.photo_url = await uploadPhoto(file);
      if(!rapportVisite.photo_align) rapportVisite.photo_align = 'droite';
      renderVisitePhotoPreview();
      showToast('Photo ajoutée au rapport de visite');
    }catch(err){
      showToast('Erreur : ' + err.message);
    }finally{
      input.disabled = false;
    }
  });

  wireTabs();
}

window.DEVIS_APP = { boot };
})();
