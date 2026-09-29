// Page "Clients" du module CRM : regroupe tous les devis au statut "Accepté" par client
// (SIREN, ou nom si le SIREN n'est pas renseigné) pour donner une vue par client plutôt
// que par devis individuel.
(function(){

let sb = null;
let clients = []; // {key, nom, adresse, cp, commune, contact_nom, contact_email, contact_tel, devisAcceptes:[...]}
let sortState = {key: null, dir: null};

function el(id){ return document.getElementById(id); }

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatEuro(n){
  return (Number(n)||0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
}

function formatDate(d){
  if(!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

async function loadClients(user){
  const ctx = await window.ENTITY_SCOPE.getContext(sb, user);
  let query = sb.from('devis').select('*').eq('status', 'accepte').order('date_devis', {ascending:false});
  query = window.ENTITY_SCOPE.applyScope(query, ctx, 'agence_id');
  if(!query){ clients = []; return; } // utilisateur sans entité affectée : aucune donnée à montrer

  const { data, error } = await query;
  if(error){ console.error(error); clients = []; return; }

  const map = new Map();
  (data||[]).forEach(d=>{
    const key = d.client_siren || ('nom:' + (d.client_nom || '').toLowerCase());
    if(!map.has(key)){
      map.set(key, {
        key, siren: d.client_siren, nom: d.client_nom,
        adresse: d.client_adresse, cp: d.client_cp, commune: d.client_commune,
        contact_nom: d.client_contact_nom, contact_email: d.client_contact_email, contact_tel: d.client_contact_telephone,
        devisAcceptes: []
      });
    }
    map.get(key).devisAcceptes.push(d);
  });

  clients = Array.from(map.values()).sort((a,b)=> (a.nom||'').localeCompare(b.nom||'', 'fr'));
}

function matchesSearch(c, search){
  if(!search) return true;
  const q = search.toLowerCase();
  return [c.nom, c.commune, c.siren, c.contact_nom, c.contact_email]
    .filter(Boolean).some(v => v.toLowerCase().includes(q));
}

function clientTotal(c){
  return c.devisAcceptes.reduce((sum,d)=> sum + (Number(d.montant_ttc)||0), 0);
}
function clientDernier(c){
  return c.devisAcceptes.reduce((max,d)=> (!max || (d.date_devis||'') > (max.date_devis||'')) ? d : max, null);
}

function sortValue(c, key){
  switch(key){
    case 'nom': return c.nom || '';
    case 'adresse': return [c.adresse, c.cp, c.commune].filter(Boolean).join(' ');
    case 'contact': return c.contact_nom || c.contact_email || c.contact_tel || '';
    case 'count': return c.devisAcceptes.length;
    case 'total': return clientTotal(c);
    case 'dernier': { const d = clientDernier(c); return d ? d.date_devis : null; }
    default: return '';
  }
}

function compareRows(a, b, key, dir){
  const va = sortValue(a, key), vb = sortValue(b, key);
  if(key === 'count' || key === 'total'){
    return dir === 'asc' ? va - vb : vb - va;
  }
  const ea = (va == null || va === ''), eb = (vb == null || vb === '');
  if(ea && eb) return 0;
  if(ea) return 1;
  if(eb) return -1;
  const cmp = String(va).localeCompare(String(vb), 'fr', {numeric:true, sensitivity:'base'});
  return dir === 'asc' ? cmp : -cmp;
}

function applySort(list){
  if(!sortState.key) return list;
  return list.slice().sort((a,b)=> compareRows(a, b, sortState.key, sortState.dir));
}

function updateSortIndicators(){
  document.querySelectorAll('.sort-arrow').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.key === sortState.key && btn.dataset.dir === sortState.dir);
  });
}

function wireSortHeaders(){
  document.querySelectorAll('.sort-arrow').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      sortState = {key: btn.dataset.key, dir: btn.dataset.dir};
      render();
    });
  });
}

function render(){
  const search = el('cl-search').value.trim();
  const filtered = applySort(clients.filter(c => matchesSearch(c, search)));
  updateSortIndicators();

  el('cl-empty').style.display = filtered.length ? 'none' : 'block';

  el('cl-tbody').innerHTML = filtered.map(c=>{
    const total = c.devisAcceptes.reduce((sum,d)=> sum + (Number(d.montant_ttc)||0), 0);
    const dernier = c.devisAcceptes.reduce((max,d)=> (!max || (d.date_devis||'') > (max.date_devis||'')) ? d : max, null);
    const contactParts = [c.contact_nom, c.contact_email, c.contact_tel].filter(Boolean);
    return `
      <tr>
        <td><strong>${escapeHtml(c.nom || 'Sans nom')}</strong>${c.siren ? `<div style="color:#8a938c;font-size:11px;">SIREN ${escapeHtml(c.siren)}</div>` : ''}</td>
        <td>${escapeHtml([c.adresse, c.cp, c.commune].filter(Boolean).join(' ')) || '—'}</td>
        <td>${contactParts.length ? escapeHtml(contactParts.join(' — ')) : '—'}</td>
        <td>${c.devisAcceptes.length}</td>
        <td>${formatEuro(total)}</td>
        <td>${dernier ? formatDate(dernier.date_devis) : '—'}</td>
        <td>${dernier ? `<a class="crm-link" href="devis.html?edit=${dernier.id}">Ouvrir →</a>` : ''}</td>
      </tr>
    `;
  }).join('');
}

async function boot(supabaseClient, user){
  sb = supabaseClient;
  await loadClients(user);
  render();
  el('cl-search').addEventListener('input', render);
  wireSortHeaders();
}

window.CLIENTS_APP = { boot };

})();
