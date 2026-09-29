// Page "Rapports de visite" du module CRM : liste toutes les visites de site enregistrées
// (rdv_prospects) avec accès direct à la fiche RDV correspondante.
(function(){

let sb = null;
let reports = [];

function el(id){ return document.getElementById(id); }

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatDate(d){
  if(!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

async function loadReports(user){
  const ctx = await window.ENTITY_SCOPE.getContext(sb, user);
  let query = sb.from('rdv_prospects').select('*').order('date_rdv', {ascending:false});
  query = window.ENTITY_SCOPE.applyScope(query, ctx, 'agence_id');
  if(!query){ reports = []; return; }

  const { data, error } = await query;
  if(error){ console.error(error); reports = []; return; }
  reports = data || [];
}

function rdvUrlFor(r){
  const params = new URLSearchParams({
    list_item_id: r.list_item_id || '',
    contact_id: r.contact_id || '',
    siren: r.siren || '',
    nom: r.nom_entreprise || '',
    adresse: r.adresse || '',
    commune: r.commune || '',
    contact_nom: r.contact_nom || '',
    contact_email: r.contact_email || '',
    contact_tel: r.contact_tel || ''
  });
  return 'rdv.html?' + params.toString();
}

function matchesSearch(r, search){
  if(!search) return true;
  const q = search.toLowerCase();
  return [r.nom_entreprise, r.commune, r.commercial, r.contact_nom, r.contact_email]
    .filter(Boolean).some(v => v.toLowerCase().includes(q));
}

function render(){
  const search = el('rv-search').value.trim();
  const filtered = reports.filter(r => matchesSearch(r, search));

  el('rv-empty').style.display = filtered.length ? 'none' : 'block';

  el('rv-tbody').innerHTML = filtered.map(r=>{
    const contactParts = [r.contact_nom, r.contact_email, r.contact_tel].filter(Boolean);
    return `
      <tr>
        <td><strong>${escapeHtml(r.nom_entreprise || 'Sans nom')}</strong></td>
        <td>${contactParts.length ? escapeHtml(contactParts.join(' — ')) : '—'}</td>
        <td>${escapeHtml([r.adresse, r.commune].filter(Boolean).join(' ')) || '—'}</td>
        <td>${formatDate(r.date_rdv)}</td>
        <td>${escapeHtml(r.commercial || '—')}</td>
        <td><a class="crm-link" href="${rdvUrlFor(r)}">Voir le rapport →</a></td>
      </tr>
    `;
  }).join('');
}

async function boot(supabaseClient, user){
  sb = supabaseClient;
  await loadReports(user);
  render();
  el('rv-search').addEventListener('input', render);
}

window.RAPPORTS_VISITE_APP = { boot };

})();
