// Redimensionnement manuel des colonnes dans les tableaux du module CRM (Prospects,
// Clients, Rapport de visite, Devis) : une poignée apparaît au survol du bord droit
// de chaque en-tête ; la largeur choisie est mémorisée dans le navigateur (par page
// et par colonne) pour être restaurée à la prochaine visite. Générique : ne dépend
// d'aucune page en particulier, s'applique à tout tableau ayant la classe .crm-table.
(function(){
  const STORAGE_PREFIX = 'pcp_crm_col_widths_';

  function storageKeyFor(table){
    // Une clé par page + tableau (id si plusieurs tableaux sur une même page, sinon
    // "main"), pour ne pas mélanger les largeurs choisies d'une page à l'autre.
    const pageKey = (location.pathname.split('/').pop() || 'index').replace('.html', '');
    const tableKey = table.id || 'main';
    return STORAGE_PREFIX + pageKey + '_' + tableKey;
  }

  function loadWidths(table){
    try{ return JSON.parse(localStorage.getItem(storageKeyFor(table))) || {}; }catch(e){ return {}; }
  }
  function saveWidths(table, widths){
    try{ localStorage.setItem(storageKeyFor(table), JSON.stringify(widths)); }catch(e){ /* quota dépassé : tant pis, pas bloquant */ }
  }

  // Identifiant stable d'une colonne : la clé de tri si l'en-tête en a une (déjà
  // unique par tableau), sinon son index (pour la dernière colonne "actions" par ex.).
  function columnKeyFor(th, idx){
    const arrow = th.querySelector('.sort-arrow');
    return arrow ? ('k:' + arrow.dataset.key) : ('i:' + idx);
  }

  function makeResizable(table){
    if(table.dataset.resizableWired) return; // déjà initialisé (un seul passage par tableau)
    const ths = Array.from(table.querySelectorAll(':scope > thead > tr > th'));
    if(!ths.length) return;
    table.dataset.resizableWired = '1';
    const widths = loadWidths(table);

    // Fige la largeur actuelle (calculée automatiquement à partir du contenu réel) de
    // chaque colonne avant de passer en table-layout:fixed, pour ne pas provoquer de
    // saut visuel au premier affichage — sauf si l'utilisateur a déjà choisi une
    // largeur pour cette colonne lors d'une visite précédente.
    ths.forEach((th, idx)=>{
      const key = columnKeyFor(th, idx);
      const saved = widths[key];
      const width = saved || Math.round(th.getBoundingClientRect().width);
      th.style.width = width + 'px';
      th.dataset.colKey = key;
    });
    table.classList.add('crm-resizable-table');

    ths.forEach((th)=>{
      const handle = document.createElement('span');
      handle.className = 'crm-col-resize-handle';
      handle.title = 'Glisser pour redimensionner · double-clic pour réinitialiser';
      th.appendChild(handle);

      let startX = 0, startWidth = 0;

      function onMove(e){
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const newWidth = Math.max(50, startWidth + (clientX - startX));
        th.style.width = newWidth + 'px';
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        document.body.classList.remove('crm-col-resizing');
        const w = loadWidths(table);
        w[th.dataset.colKey] = parseInt(th.style.width, 10);
        saveWidths(table, w);
      }
      function onDown(e){
        e.preventDefault();
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startWidth = th.getBoundingClientRect().width;
        document.body.classList.add('crm-col-resizing');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, {passive:false});
        document.addEventListener('touchend', onUp);
      }
      handle.addEventListener('mousedown', onDown);
      handle.addEventListener('touchstart', onDown, {passive:false});
      handle.addEventListener('dblclick', (e)=>{
        e.stopPropagation();
        const w = loadWidths(table);
        delete w[th.dataset.colKey];
        saveWidths(table, w);
        th.style.width = ''; // redevient automatique (répartit l'espace restant)
      });
      handle.addEventListener('click', (e)=> e.stopPropagation()); // n'active pas le tri au clic sur la poignée
    });
  }

  function init(){
    // .crm-table : Prospects, Clients, Rapport de visite. #dl-table : liste des devis,
    // qui a son propre balisage/CSS (devis-liste.css) mais la même structure de tableau.
    document.querySelectorAll('.crm-table, #dl-table').forEach(table=>{
      // Chaque page remplit son <tbody> de façon asynchrone après le chargement des
      // données ; on attend qu'il ait du contenu avant de figer les largeurs, sinon
      // on capturerait la largeur d'un tableau vide.
      const tbody = table.querySelector('tbody');
      if(!tbody) return;
      if(tbody.children.length){
        makeResizable(table);
        return;
      }
      const observer = new MutationObserver(()=>{
        if(tbody.children.length){
          observer.disconnect();
          makeResizable(table);
        }
      });
      observer.observe(tbody, {childList:true});
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
