// Module partagé : détermine les entités (agences) de l'utilisateur connecté, pour que
// les pages du CRM (Prospects, Clients, Rapport de visite, Devis, Liste de prospection)
// ne montrent à chaque utilisateur que les données de ses propres entités. Les
// administrateurs voient tout, sans restriction.
(function(){

let cache = null; // {isAdmin, agences: [{id,name}], agenceIds: [id,...]}

// sb : client Supabase déjà authentifié (auth.sb). user : session.user (auth.user).
// Utilise window.AUTH.role, déjà déterminé par auth-guard.js au moment où cette fonction
// est appelée (après AUTH_GUARD.init()).
async function getContext(sb, user){
  if(cache) return cache;

  const isAdmin = window.AUTH && window.AUTH.role === 'admin';
  let agences = [];
  if(!isAdmin){
    const { data, error } = await sb.from('user_agences').select('agence_id, agences(*)').eq('user_id', user.id);
    if(error) console.error('Erreur de chargement des entités', error);
    agences = (data || []).map(r => r.agences).filter(Boolean);
  }
  cache = { isAdmin, agences, agenceIds: agences.map(a => a.id) };
  return cache;
}

// Applique le filtre par entité à une requête Supabase déjà construite (ex :
// sb.from('devis').select('*')) : ne fait rien pour un administrateur, sinon restreint
// aux entités de l'utilisateur (ou renvoie null si l'utilisateur n'a aucune entité
// affectée, pour éviter de renvoyer les données de tout le monde par erreur).
function applyScope(query, ctx, column){
  if(ctx.isAdmin) return query;
  if(!ctx.agenceIds.length) return null;
  return query.in(column, ctx.agenceIds);
}

window.ENTITY_SCOPE = { getContext, applyScope };

})();
