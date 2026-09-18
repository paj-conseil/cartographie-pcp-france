// Garde d'authentification partagée par toutes les pages du site.
// Chaque page protégée doit inclure supabase-config.js + supabase-js + ce fichier,
// puis appeler AUTH_GUARD.init(requiredRole) avant de démarrer sa propre logique.
//   requiredRole: null      -> n'importe quel utilisateur connecté
//                 'admin'   -> réservé aux administrateurs (redirige sinon)
//                 'editeur' -> administrateurs et éditeurs (redirige les lecteurs)
(function(){

window.AUTH = { sb: null, user: null, role: null };

function currentPagePath(){
  return window.location.pathname.split('/').pop() || 'index.html';
}

function redirectToLogin(){
  const here = currentPagePath() + window.location.search;
  window.location.href = 'login.html?redirect=' + encodeURIComponent(here);
}

async function logPageView(sb, userId, email){
  try{
    await sb.from('page_views').insert({
      user_id: userId,
      email: email,
      page: currentPagePath()
    });
  }catch(e){
    console.warn('Suivi de page indisponible', e);
  }
}

function applyRoleVisibility(role){
  // Éléments visibles uniquement aux administrateurs (ex : lien "Administration")
  document.querySelectorAll('[data-role-admin]').forEach(el=>{
    el.style.display = (role === 'admin') ? '' : 'none';
  });
  // Éléments masqués aux lecteurs (ex : bouton export Excel)
  document.querySelectorAll('[data-hide-lecteur]').forEach(el=>{
    el.style.display = (role === 'lecteur') ? 'none' : '';
  });
  document.querySelectorAll('[data-current-user-email]').forEach(el=>{
    el.textContent = (window.AUTH.user && window.AUTH.user.email) || '';
  });
  document.querySelectorAll('[data-current-user-role]').forEach(el=>{
    const labels = {admin:'Administrateur', editeur:'Éditeur', lecteur:'Lecteur'};
    el.textContent = labels[role] || role || '';
  });
}

window.AUTH_GUARD = {
  async init(requiredRole){
    const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    window.AUTH.sb = sb;

    const { data: { session } } = await sb.auth.getSession();
    if(!session){
      redirectToLogin();
      return null;
    }

    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if(error || !profile){
      // Compte authentifié mais sans profil (cas anormal) : on ne laisse pas passer.
      await sb.auth.signOut();
      redirectToLogin();
      return null;
    }

    window.AUTH.user = session.user;
    window.AUTH.role = profile.role;

    const roleRank = {lecteur:1, editeur:2, admin:3};
    if(requiredRole && (roleRank[profile.role] || 0) < (roleRank[requiredRole] || 0)){
      window.location.href = 'index.html';
      return null;
    }

    logPageView(sb, session.user.id, session.user.email);
    applyRoleVisibility(profile.role);

    document.querySelectorAll('[data-logout-btn]').forEach(btn=>{
      btn.addEventListener('click', ()=> window.AUTH_GUARD.logout());
    });

    return { sb, user: session.user, role: profile.role };
  },

  async logout(){
    if(window.AUTH.sb) await window.AUTH.sb.auth.signOut();
    window.location.href = 'login.html';
  }
};

})();
