// Menu de navigation principal, injecté dans le bandeau (#site-header) de chaque page.
// Remplace les anciens indicateurs "badge-mode" isolés (un seul lien/étiquette par page)
// par un vrai menu avec les trois espaces du site, et met en évidence la page active.
(function(){

  const NAV_ITEMS = [
    { label: 'Cartographie', href: 'index.html', match: ['index.html', ''] },
    { label: 'Prospection', href: 'prospection.html', match: ['prospection.html', 'prospection-tableau.html'] },
    { label: 'Liste de prospection', href: 'prospection-listes.html', match: ['prospection-listes.html'] }
  ];

  function currentPage(){
    return window.location.pathname.split('/').pop() || 'index.html';
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

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }

  window.SITE_NAV = { buildNav };

})();
