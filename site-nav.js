// Menu de navigation principal, injecté dans le bandeau (#site-header) de chaque page.
// Remplace les anciens indicateurs "badge-mode" isolés (un seul lien/étiquette par page)
// par un vrai menu avec les trois espaces du site, et met en évidence la page active.
(function(){

  const NAV_ITEMS = [
    { label: 'Cartographie', href: 'index.html', match: ['index.html', ''] },
    { label: 'Prospection', href: 'prospection.html', match: ['prospection.html', 'prospection-tableau.html'] }
  ];

  // Sous-menu déroulant "CRM" : regroupe les pages de suivi commercial. "Prospects" est la
  // vue consolidée (toutes listes + visites effectuées) ; "Liste de prospection" reste
  // disponible pour la gestion au quotidien des listes elles-mêmes.
  const CRM_ITEMS = [
    { label: 'Prospects', href: 'prospects.html', match: ['prospects.html'] },
    { label: 'Liste de prospection', href: 'prospection-listes.html', match: ['prospection-listes.html'] },
    { label: 'Clients', href: 'clients.html', match: ['clients.html'] },
    { label: 'Rapport de visite', href: 'rapports-visite.html', match: ['rapports-visite.html'] },
    { label: 'Devis', href: 'devis-liste.html', match: ['devis-liste.html', 'devis.html'] }
  ];

  function currentPage(){
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function closeCrmMenu(panel, toggle){
    panel.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', panel._outsideClick);
    window.removeEventListener('resize', panel._reposition);
  }

  function openCrmMenu(panel, toggle){
    panel._reposition();
    panel.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', panel._outsideClick);
    window.addEventListener('resize', panel._reposition);
  }

  function buildCrmDropdown(here){
    const crmActive = CRM_ITEMS.some(item => item.match.indexOf(here) !== -1);

    const wrap = document.createElement('div');
    wrap.className = 'site-nav-dropdown';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'site-nav-link site-nav-dropdown-toggle' + (crmActive ? ' active' : '');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.textContent = 'CRM ▾';

    const panel = document.createElement('div');
    panel.className = 'site-nav-dropdown-panel';
    panel.innerHTML = CRM_ITEMS.map(item=>{
      const active = item.match.indexOf(here) !== -1;
      return `<a href="${item.href}" class="site-nav-dropdown-link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${item.label}</a>`;
    }).join('');

    panel._reposition = ()=>{
      const r = toggle.getBoundingClientRect();
      panel.style.top = (r.bottom + 6) + 'px';
      panel.style.left = r.left + 'px';
    };
    panel._outsideClick = (e)=>{
      if(e.target === toggle || panel.contains(e.target)) return;
      closeCrmMenu(panel, toggle);
    };
    toggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(panel.classList.contains('open')) closeCrmMenu(panel, toggle); else openCrmMenu(panel, toggle);
    });
    panel.addEventListener('click', (e)=>{
      if(e.target.closest('a')) closeCrmMenu(panel, toggle);
    });

    wrap.appendChild(toggle);
    document.body.appendChild(panel);
    return wrap;
  }

  function buildNav(){
    const header = document.getElementById('site-header');
    if(!header || header.querySelector('.site-nav')) return;

    const here = currentPage();
    const nav = document.createElement('nav');
    nav.className = 'site-nav';
    nav.setAttribute('aria-label', 'Navigation principale');
    nav.innerHTML = NAV_ITEMS.map(item=>{
      const active = item.match.indexOf(here) !== -1;
      return `<a href="${item.href}" class="site-nav-link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${item.label}</a>`;
    }).join('');
    nav.appendChild(buildCrmDropdown(here));

    // Ancre l'insertion à l'emplacement de l'ancien indicateur de page (lien ou étiquette
    // "badge-mode"), ou à défaut avant la barre utilisateur, pour rester compatible avec
    // toutes les mises en page du site sans avoir à modifier chaque fichier HTML.
    const anchor = header.querySelector('.badge-mode') || header.querySelector('.header-user-bar');
    if(anchor){
      header.insertBefore(nav, anchor);
    } else {
      header.appendChild(nav);
    }

    header.querySelectorAll('.badge-mode').forEach(el => el.remove());
  }

  // Transforme la barre utilisateur (email, administration, mot de passe, déconnexion)
  // en panneau déroulant déclenché par un bouton ☰, pour éviter que ces informations
  // ne se superposent au menu de navigation sur les écrans étroits ou moyens.
  function wireUserMenu(){
    const header = document.getElementById('site-header');
    if(!header || header.querySelector('.user-menu')) return;
    const bar = header.querySelector('.header-user-bar');
    if(!bar) return;

    const wrap = document.createElement('div');
    wrap.className = 'user-menu';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'user-menu-toggle';
    toggle.setAttribute('aria-label', 'Menu utilisateur');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '☰';
    header.appendChild(wrap);
    wrap.appendChild(toggle);

    function positionPanel(){
      const r = toggle.getBoundingClientRect();
      bar.style.top = (r.bottom + 6) + 'px';
      bar.style.right = (window.innerWidth - r.right) + 'px';
    }
    function closeMenu(){
      bar.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutsideClick);
      window.removeEventListener('resize', positionPanel);
    }
    function openMenu(){
      positionPanel();
      bar.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onOutsideClick);
      window.addEventListener('resize', positionPanel);
    }
    function onOutsideClick(e){
      if(e.target === toggle || bar.contains(e.target)) return;
      closeMenu();
    }
    toggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(bar.classList.contains('open')) closeMenu(); else openMenu();
    });
    // Un clic sur un lien/bouton du panneau (ex : Déconnexion) referme le menu.
    bar.addEventListener('click', (e)=>{
      if(e.target.closest('a, button')) setTimeout(closeMenu, 0);
    });
  }

  function init(){
    buildNav();
    wireUserMenu();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SITE_NAV = { buildNav, wireUserMenu };

})();
