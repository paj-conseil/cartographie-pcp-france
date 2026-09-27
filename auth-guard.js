// Garde d'authentification partagée par toutes les pages du site.
// Chaque page protégée doit inclure supabase-config.js + supabase-js + ce fichier,
// puis appeler AUTH_GUARD.init(requiredRole) avant de démarrer sa propre logique.
//   requiredRole: null      -> n'importe quel utilisateur connecté
//                 'admin'   -> réservé aux administrateurs (redirige sinon)
//                 'editeur' -> administrateurs et éditeurs (redirige les lecteurs)
(function(){

window.AUTH = { sb: null, user: null, role: null };

const IMPERSONATION_KEY = 'pcp_impersonation_admin';

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

function injectPasswordModal(){
  if(document.getElementById('pwd-modal-overlay')) return;
  const div = document.createElement('div');
  div.id = 'pwd-modal-overlay';
  div.className = 'pwd-modal-overlay';
  div.innerHTML = `
    <div class="pwd-modal-box">
      <h2>Changer le mot de passe</h2>
      <label for="pwd-new1">Nouveau mot de passe</label>
      <input id="pwd-new1" type="password" autocomplete="new-password" />
      <label for="pwd-new2">Confirmer le mot de passe</label>
      <input id="pwd-new2" type="password" autocomplete="new-password" />
      <div id="pwd-modal-msg" class="pwd-modal-msg"></div>
      <div class="pwd-modal-actions">
        <button id="pwd-modal-cancel" type="button">Annuler</button>
        <button id="pwd-modal-submit" type="button">Enregistrer</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  document.getElementById('pwd-modal-cancel').addEventListener('click', closePasswordModal);
  div.addEventListener('click', (e)=>{ if(e.target === div) closePasswordModal(); });
  document.getElementById('pwd-modal-submit').addEventListener('click', submitPasswordChange);
  document.getElementById('pwd-new2').addEventListener('keydown', (e)=>{ if(e.key === 'Enter') submitPasswordChange(); });
}

function openPasswordModal(){
  injectPasswordModal();
  document.getElementById('pwd-new1').value = '';
  document.getElementById('pwd-new2').value = '';
  const msg = document.getElementById('pwd-modal-msg');
  msg.textContent = '';
  msg.classList.remove('pwd-modal-msg-ok');
  document.getElementById('pwd-modal-overlay').classList.add('show');
  document.getElementById('pwd-new1').focus();
}

function closePasswordModal(){
  const el = document.getElementById('pwd-modal-overlay');
  if(el) el.classList.remove('show');
}

async function submitPasswordChange(){
  const p1 = document.getElementById('pwd-new1').value;
  const p2 = document.getElementById('pwd-new2').value;
  const msg = document.getElementById('pwd-modal-msg');
  msg.classList.remove('pwd-modal-msg-ok');
  msg.textContent = '';

  if(!p1 || p1.length < 8){
    msg.textContent = 'Le mot de passe doit faire au moins 8 caractères.';
    return;
  }
  if(p1 !== p2){
    msg.textContent = 'Les deux mots de passe ne correspondent pas.';
    return;
  }

  const btn = document.getElementById('pwd-modal-submit');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';
  try{
    const { error } = await window.AUTH.sb.auth.updateUser({ password: p1 });
    if(error) throw error;
    msg.textContent = 'Mot de passe mis à jour.';
    msg.classList.add('pwd-modal-msg-ok');
    setTimeout(closePasswordModal, 1200);
  }catch(e){
    msg.textContent = 'Erreur : ' + e.message;
  }finally{
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}

function injectImpersonationBanner(targetEmail, adminEmail){
  if(document.getElementById('impersonation-banner')) return;
  const div = document.createElement('div');
  div.id = 'impersonation-banner';
  div.className = 'impersonation-banner';
  div.innerHTML = `
    <span>🕵️ Vous naviguez en tant que <strong>${targetEmail}</strong> — connecté normalement en tant que ${adminEmail}</span>
    <button type="button" id="impersonation-restore-btn">↩ Revenir à mon compte admin</button>
  `;
  document.body.insertBefore(div, document.body.firstChild);
  document.body.classList.add('has-impersonation-banner');
  document.getElementById('impersonation-restore-btn').addEventListener('click', ()=> window.AUTH_GUARD.restoreAdmin());
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

    // Si un administrateur navigue actuellement "en tant que" cet utilisateur,
    // affiche un bandeau permanent permettant de revenir facilement à son propre compte.
    try{
      const raw = sessionStorage.getItem(IMPERSONATION_KEY);
      if(raw){
        const backup = JSON.parse(raw);
        injectImpersonationBanner(session.user.email, backup.admin_email);
      }
    }catch(e){ console.warn('Bandeau "connecté en tant que" indisponible', e); }

    document.querySelectorAll('[data-logout-btn]').forEach(btn=>{
      btn.addEventListener('click', ()=> window.AUTH_GUARD.logout());
      const pwdBtn = document.createElement('button');
      pwdBtn.type = 'button';
      pwdBtn.textContent = '🔑 Mot de passe';
      pwdBtn.className = btn.className;
      pwdBtn.setAttribute('data-change-password-btn', '');
      pwdBtn.addEventListener('click', openPasswordModal);
      btn.parentNode.insertBefore(pwdBtn, btn);
    });

    return { sb, user: session.user, role: profile.role };
  },

  async logout(){
    if(window.AUTH.sb) await window.AUTH.sb.auth.signOut();
    window.location.href = 'login.html';
  },

  // Réservé aux administrateurs (le bouton n'est proposé qu'à eux) : bascule le
  // navigateur sur la session réelle de l'utilisateur ciblé, via un lien de
  // connexion généré côté serveur (fonction "admin-users", action "impersonate").
  // La session admin actuelle est mise de côté pour permettre restoreAdmin().
  async startImpersonation(targetUserId){
    const sb = window.AUTH.sb;
    const { data: { session } } = await sb.auth.getSession();
    if(!session) throw new Error('Session administrateur introuvable');

    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': window.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ action: 'impersonate', userId: targetUserId })
    });
    const json = await res.json().catch(()=> ({}));
    if(!res.ok){ throw new Error(json.error || `Erreur (${res.status})`); }

    sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      admin_email: session.user.email
    }));

    const { error: otpError } = await sb.auth.verifyOtp({ token_hash: json.token_hash, type: 'magiclink' });
    if(otpError){
      sessionStorage.removeItem(IMPERSONATION_KEY);
      throw otpError;
    }
    window.location.href = 'index.html';
  },

  // Restaure la session administrateur mise de côté par startImpersonation().
  async restoreAdmin(){
    const raw = sessionStorage.getItem(IMPERSONATION_KEY);
    if(!raw) return;
    sessionStorage.removeItem(IMPERSONATION_KEY);
    let backup;
    try{ backup = JSON.parse(raw); }catch(e){ return; }
    const sb = window.AUTH.sb || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    await sb.auth.setSession({ access_token: backup.access_token, refresh_token: backup.refresh_token });
    window.location.href = 'admin-utilisateurs.html';
  }
};

})();
