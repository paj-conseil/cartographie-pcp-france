(function(){

const IS_ADMIN = window.APP_MODE === 'admin';

const ICONS = {
  '3D': '<svg viewBox="0 0 1718 1920" fill="currentColor"><g transform="translate(0.000000,1920.000000) scale(0.100000,-0.100000)"><path d="M15742 19173 c-12 -2 -49 -29 -81 -59 l-59 -54 -86 0 c-82 0 -87 1 -96 24 -5 13 -23 34 -41 47 l-32 23 7 -25 c21 -69 41 -66 -534 -72 -1109 -13 -2097 -128 -3049 -356 l-85 -20 -99 25 c-503 127 -787 95 -787 -89 l0 -36 -55 19 c-187 64 -512 99 -748 81 -835 -67 -1072 -464 -631 -1057 92 -124 102 -102 -96 -224 -170 -105 -170 -105 -134 -111 177 -30 -351 -777 -1002 -1420 -233 -230 -199 -207 -405 -259 -487 -122 -907 -303 -1249 -538 -238 -163 -363 -288 -483 -484 -97 -157 -256 -231 -657 -303 -269 -49 -261 -43 -140 -103 134 -66 28 -196 -492 -599 -106 -82 -292 -226 -413 -320 -492 -381 -832 -735 -1227 -1278 -1214 -1667 -1524 -3404 -1102 -6180 l37 -240 -51 -52 c-79 -80 -83 -92 -92 -283 -13 -271 -76 -341 -412 -459 -241 -83 -276 -127 -83 -101 174 23 179 9 39 -108 -637 -536 -952 -890 -1180 -1326 -671 -1286 209 -2230 2211 -2370 877 -62 1916 55 3235 364 2089 489 3657 517 5240 93 882 -235 1596 -578 2405 -1154 105 -75 203 -144 219 -154 l29 -19 -7 39 c-45 245 -448 665 -958 999 -846 554 -1909 916 -3218 1095 -1042 143 -2104 94 -3775 -174 -2660 -427 -3598 -432 -4064 -22 -601 530 -471 1112 360 1617 793 480 2167 825 3174 796 352 -10 387 -17 405 -90 72 -279 156 -306 659 -216 283 52 306 44 399 -134 135 -257 227 -281 1184 -311 878 -27 1152 -65 1437 -196 245 -113 367 -136 616 -114 357 31 415 21 415 -75 0 -90 45 -110 250 -110 160 0 180 13 180 115 0 25 3 45 8 45 4 0 81 -13 172 -29 300 -53 350 -49 350 24 0 20 3 21 130 17 150 -5 162 -3 218 38 l42 30 -57 69 c-32 38 -80 110 -108 160 -27 50 -70 128 -95 174 -61 110 -128 177 -203 200 -42 13 -61 25 -71 45 -83 160 -147 170 -1181 182 -1222 14 -1387 34 -1859 219 -38 15 -25 29 101 117 130 92 174 108 388 150 306 60 368 54 730 -72 456 -158 516 -173 757 -181 191 -7 273 3 405 48 l87 29 55 -21 c48 -18 69 -20 144 -15 86 7 89 6 125 -22 132 -104 327 -142 550 -108 78 12 120 13 177 6 87 -11 118 -3 138 37 8 15 39 44 68 63 69 46 69 42 -22 304 -84 244 -66 225 -255 251 -65 9 -207 34 -314 56 -349 72 -440 88 -619 114 -172 24 -542 64 -791 85 -305 26 -568 93 -652 167 -20 18 -17 29 82 243 210 456 278 684 325 1088 23 195 14 177 260 602 268 464 331 659 248 772 -157 214 -161 263 -13 157 165 -118 179 -89 310 644 141 788 418 1523 738 1957 95 129 96 130 173 130 161 0 289 44 617 211 414 211 532 242 912 243 284 1 290 -3 300 -208 10 -216 34 -251 295 -430 168 -115 169 -116 185 -85 17 32 4 65 -55 140 -159 204 31 379 330 305 187 -47 216 -76 266 -261 70 -260 -7 -478 -248 -708 -252 -239 -240 -227 -218 -244 55 -41 153 9 390 197 275 219 375 276 375 216 0 -65 -17 -98 -160 -303 -46 -66 -54 -108 -24 -130 50 -37 109 18 234 217 148 236 200 304 215 280 4 -7 25 -114 46 -238 41 -237 48 -259 75 -226 225 280 12 837 -525 1375 -134 134 -188 172 -395 281 -222 118 -255 148 -161 148 60 0 145 19 455 100 607 159 736 156 1034 -24 186 -113 258 -140 347 -131 187 19 285 -129 324 -489 33 -307 159 -250 185 84 27 352 29 360 106 349 149 -20 236 -134 350 -461 63 -178 68 -185 108 -138 74 89 69 208 -28 585 -30 121 -36 115 65 55 142 -84 285 -135 296 -104 23 65 -293 352 -569 516 -283 167 -407 212 -1033 373 -1472 378 -2203 625 -2650 895 -100 60 -95 48 -44 112 76 97 159 281 276 618 345 991 508 1275 834 1456 66 36 85 55 174 165 283 351 580 582 1157 904 242 135 277 143 441 98 212 -57 372 17 471 219 88 177 59 238 -131 279 -29 6 -53 14 -53 19 0 8 148 82 190 95 92 27 119 78 101 193 -21 138 -25 130 99 232 60 50 135 119 167 154 l58 62 273 -15 c151 -9 278 -13 284 -10 5 3 -30 9 -79 12 -141 11 -467 49 -475 56 -9 9 27 119 48 142 9 10 53 32 98 49 126 48 137 52 133 56 -1 2 -45 -10 -97 -25 -181 -54 -163 -63 -180 92 l-10 98 64 63 c170 168 198 431 53 499 -51 25 -146 35 -412 47 -302 14 -345 18 -345 34 0 17 54 67 88 82 l27 12 -25 0 c-14 0 -35 -3 -48 -5z"/></g></svg>',
  'Termite': '<svg viewBox="0 0 280 501" fill="currentColor"><g transform="translate(0.000000,501.000000) scale(0.100000,-0.100000)"><path d="M600 4487 c0 -28 74 -166 230 -432 165 -282 190 -334 190 -404 0 -33 5 -72 10 -87 9 -22 5 -43 -16 -106 -124 -374 -76 -781 129 -1089 45 -68 -28 -106 -113 -57 -82 46 -159 77 -234 92 l-59 12 -47 140 c-102 305 -129 347 -248 390 -87 32 -215 40 -246 15 -27 -22 -8 -31 69 -31 77 0 164 -25 205 -58 33 -27 147 -303 164 -397 16 -85 58 -124 201 -183 39 -16 95 -41 125 -55 30 -13 76 -34 102 -46 30 -13 53 -32 63 -51 8 -16 23 -33 32 -38 15 -9 15 -14 1 -58 l-15 -49 -59 -2 c-254 -10 -308 -45 -552 -361 -82 -106 -83 -107 -155 -133 -113 -39 -205 -89 -253 -135 -73 -71 -45 -88 54 -32 137 76 220 117 257 127 59 16 161 119 258 262 36 53 42 57 115 79 42 13 107 38 144 56 166 83 178 84 202 14 15 -45 15 -45 -14 -82 -16 -20 -35 -47 -41 -60 -7 -17 -32 -32 -87 -52 -368 -135 -398 -211 -248 -614 52 -140 58 -122 -94 -284 -107 -114 -112 -129 -27 -75 261 167 309 371 145 614 -37 54 -37 54 25 101 28 22 75 62 103 90 151 148 229 107 155 -82 -192 -490 -165 -931 72 -1168 493 -497 943 444 587 1229 -67 148 32 152 175 7 38 -39 91 -85 117 -103 57 -38 56 -34 19 -80 -196 -248 -143 -469 148 -615 132 -66 119 -41 -49 98 -77 64 -140 119 -140 123 0 3 22 61 50 128 119 293 126 368 43 451 -95 94 -281 204 -345 204 -32 0 -42 9 -67 57 -11 23 -25 44 -31 48 -21 13 3 97 33 117 14 8 84 -17 127 -47 33 -23 119 -56 215 -84 35 -10 49 -24 107 -109 117 -170 174 -222 308 -281 150 -65 251 -103 258 -96 22 22 -57 74 -215 140 l-112 47 -63 96 c-35 53 -96 130 -136 172 -40 41 -79 89 -86 105 -34 77 -125 115 -294 123 -111 5 -112 5 -119 31 -3 14 -13 36 -20 48 -16 24 -14 30 26 80 18 23 49 42 101 62 277 107 287 112 322 149 47 50 61 76 88 157 121 372 147 400 382 420 109 9 129 26 56 46 -240 65 -538 -212 -538 -500 0 -42 -19 -57 -100 -76 -105 -24 -172 -51 -230 -91 -60 -42 -54 -42 -78 5 l-20 38 57 114 c164 329 193 655 85 975 -28 83 -32 107 -24 129 5 14 10 40 10 57 0 17 17 61 37 97 20 36 44 80 53 96 318 571 403 758 285 622 -82 -94 -255 -405 -352 -634 -26 -61 -39 -72 -48 -41 -4 13 -21 37 -37 55 -30 31 -30 33 -29 135 3 169 -37 276 -129 346 -46 36 -64 30 -37 -12 70 -106 79 -388 13 -372 -113 26 -146 28 -217 12 -88 -20 -83 -25 -87 94 -4 106 13 199 48 258 25 42 25 42 -3 42 -99 0 -180 -165 -179 -367 0 -251 -41 -249 -173 12 -200 393 -335 600 -335 512z"/></g></svg>',
  'ILX': '<svg viewBox="0 0 304 322" fill="currentColor"><g transform="translate(0.000000,322.000000) scale(0.100000,-0.100000)"><path d="M1850 2779 c-13 -6 -33 -17 -43 -26 -16 -15 -20 -15 -55 1 -69 34 -152 33 -185 -1 l-28 -30 -57 29 c-118 61 -291 -16 -317 -139 -8 -39 -21 -49 -41 -33 -47 40 -157 5 -184 -59 -10 -26 -14 -27 -83 -27 -151 1 -235 -85 -224 -229 l5 -71 -49 -22 c-94 -44 -123 -81 -117 -156 5 -62 5 -65 -27 -96 -60 -58 -72 -205 -24 -290 l22 -39 -30 -25 c-76 -64 -62 -251 23 -318 l22 -18 -25 -47 c-52 -102 -3 -276 95 -338 29 -18 31 -24 32 -75 1 -141 110 -240 265 -240 l75 0 14 -32 c30 -71 131 -126 210 -115 l42 6 23 -49 c55 -115 271 -153 332 -58 4 6 19 -6 34 -25 66 -88 261 -85 358 4 50 46 47 46 100 12 117 -76 279 -10 355 146 l37 76 39 -6 c117 -19 238 66 273 193 14 51 22 61 59 83 133 78 234 402 165 532 -5 10 -22 45 -38 78 -81 171 -241 177 -388 13 -42 -47 -48 -50 -71 -39 -55 25 -170 -7 -187 -53 -4 -11 -20 -13 -70 -9 -58 5 -71 3 -120 -24 -52 -28 -57 -29 -89 -16 -22 10 -55 13 -101 10 -65 -4 -68 -4 -84 24 -33 55 -106 72 -189 44 -17 -5 -23 -2 -28 19 -10 40 -74 68 -149 65 -76 -3 -106 36 -68 90 28 38 35 97 19 151 -13 40 -12 48 6 80 l19 36 48 -16 c84 -29 119 -77 119 -162 l0 -70 27 7 c84 21 117 210 53 297 -24 33 -22 43 9 33 46 -14 75 -71 74 -146 -1 -73 9 -92 44 -83 42 11 73 183 43 239 -21 40 -5 39 26 -2 19 -25 30 -55 36 -97 12 -91 16 -98 46 -94 84 10 98 194 23 297 -24 32 -25 34 -6 47 30 22 52 16 73 -20 26 -44 79 -64 123 -46 34 14 106 93 89 98 -15 5 -12 68 4 81 32 26 30 70 -3 112 -30 36 -31 42 -22 76 74 266 -144 547 -359 462z"/></g></svg>',
  'Mérule': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M9.3 10.6 Q7.9 9.2 9 8.1 Q10.1 7 11.2 8 Q12.3 6.4 13.8 7.4 Q15.3 8.3 14.7 9.8 Q16.2 10.9 15.1 12.2 Q16.3 13.7 14.7 14.8 Q15.1 16.3 13.1 15.7 Q12.1 17.2 10.5 15.6 Q9 16.6 8.4 15 Q6.9 14.4 7.9 12.8 Q6.7 11.4 9.3 10.6 Z" fill="currentColor" stroke="none"/><line x1="15.28" y1="12.88" x2="20.73" y2="14.34" stroke-width="0.75"/><line x1="14.19" y1="14.6" x2="18.05" y2="19.21" stroke-width="0.77"/><line x1="12.3" y1="15.39" x2="12.75" y2="20.62" stroke-width="0.88"/><line x1="10.3" y1="14.94" x2="6.69" y2="21.19" stroke-width="1.06"/><line x1="9.06" y1="13.7" x2="3.11" y2="17.13" stroke-width="0.8"/><line x1="8.61" y1="11.7" x2="2.3" y2="11.15" stroke-width="0.82"/><line x1="9.21" y1="10.05" x2="4.71" y2="6.9" stroke-width="0.75"/><line x1="10.56" y1="8.92" x2="8.2" y2="3.85" stroke-width="1.12"/><line x1="12.3" y1="8.61" x2="12.91" y2="1.63" stroke-width="1.06"/><line x1="13.95" y1="9.21" x2="17.93" y2="3.53" stroke-width="0.79"/><line x1="15.08" y1="10.56" x2="20.35" y2="8.11" stroke-width="0.98"/><line x1="15.39" y1="12.3" x2="22.14" y2="12.89" stroke-width="1.08"/></svg>',
  'Hottes': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><g transform="rotate(180 12 12)"><path d="M5 5 L19 5 L14.5 13 L9.5 13 Z"/><line x1="10.5" y1="13" x2="10.5" y2="19"/><line x1="13.5" y1="13" x2="13.5" y2="19"/></g></svg>',
  'Humidité': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 C12 2 5 11.2 5 15.2 A7 7 0 0 0 19 15.2 C19 11.2 12 2 12 2 Z"/></svg>',
  'Assainissement': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 6 Q7 10 3 14 Q7 18 4 21"/><path d="M9 3 Q13 8 9 12 Q13 17 10 21"/><path d="M15 5 Q19 9 15 13 Q19 17 16 21"/><circle cx="3" cy="6" r=".6" fill="currentColor" stroke="none"/><circle cx="9" cy="3" r=".6" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r=".6" fill="currentColor" stroke="none"/></svg>',
  'Isolation': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke-width="1.8"/><path d="M6 9 Q9 7 12 9 T18 9"/><path d="M6 13 Q9 11 12 13 T18 13"/><path d="M6 17 Q9 15 12 17 T18 17"/></svg>',
  'Thermique': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="3" height="10" rx="1.5"/><circle cx="10.5" cy="16.7" r="2.9" fill="currentColor" stroke="none"/><line x1="10.5" y1="6" x2="10.5" y2="14" stroke-width="1.4"/><path d="M17.2 6c1.8 1.6 2.6 3.4 1.9 5c-.4 1-1.5 1.4-1.7.3c-.1.9-1.1 1.2-1.7.4c-1-1.2-.5-2.9.6-4.1c.4-.4.7-1 .9-1.6Z" fill="currentColor" stroke="none"/></svg>',
  'Fumigation': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><g fill="currentColor" stroke="none"><circle cx="12" cy="12" r="3.6"/><circle cx="16" cy="8.5" r="3"/><circle cx="19.5" cy="12" r="2.8"/><circle cx="17.5" cy="16" r="3"/><circle cx="13" cy="17" r="2.6"/><circle cx="9.5" cy="15" r="2.4"/><circle cx="9" cy="9" r="2.3"/></g><path d="M8 9.3 L1 7.8" stroke-width="1.5"/><path d="M8.3 12.3 L1 12.3" stroke-width="1.9"/><path d="M8 15.2 L1 16.5" stroke-width="1.5"/></svg>',
  'Portuaire': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.8"/><line x1="12" y1="7.3" x2="12" y2="18.5"/><path d="M6 12c0 3.4 2.5 5.9 6 6.5"/><path d="M18 12c0 3.4-2.5 5.9-6 6.5"/><line x1="8.2" y1="12" x2="15.8" y2="12"/></svg>',
  'Toiture': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 L12 4 L21 11.5"/><path d="M6 11v9h12v-9"/><path d="M14.7 14.3c1 .8 1 2 0 2.8c-1 .8-1 2 0 2.8" stroke-width="1.3"/></svg>'
};

const ACTIVITIES = ['3D','Termite','ILX','Mérule','Hottes','Humidité','Assainissement','Isolation','Thermique','Fumigation','Portuaire','Toiture'];
const ACTIVITY_FULL = {
  '3D':'3D — Dératisation / Désinsectisation / Désinfection',
  'Termite':'Traitement termites',
  'ILX':'Insectes larves xylophages',
  'Mérule':'Traitement mérule',
  'Hottes':'Nettoyage / dégraissage de hottes',
  'Humidité':"Traitement de l'humidité",
  'Assainissement':'Assainissement',
  'Isolation':'Isolation',
  'Thermique':'Traitement thermique',
  'Fumigation':'Fumigation',
  'Portuaire':'Activités portuaires',
  'Toiture':'Nettoyage toitures / façades'
};

const TABLE = 'agences';
let sb = null;
let entities = [];
let map, markersLayer;
let markerRefs = {};
let activeId = null;
const saveTimers = {};
let selectedFilters = [];
let modalEntityId = null;

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove('show'), 2500);
}

function setSaveStatus(text, temporary){
  const el = document.getElementById('save-status');
  if(!el) return;
  el.textContent = text;
  if(temporary){
    clearTimeout(setSaveStatus._t);
    setSaveStatus._t = setTimeout(()=>{ el.textContent = 'enregistré'; }, 1500);
  }
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function rowToEntity(row){
  return {
    id: row.id,
    name: row.name || '',
    address: row.address || '',
    lat: row.lat,
    lng: row.lng,
    color: row.color || '#1b6b3c',
    activities: Array.isArray(row.activities) ? row.activities : []
  };
}

async function fetchEntities(){
  const {data, error} = await sb.from(TABLE).select('*').order('name', {ascending:true});
  if(error){
    showToast('Erreur de chargement : ' + error.message);
    entities = [];
    return;
  }
  entities = (data||[]).map(rowToEntity);
}

async function insertEntity(){
  const {data, error} = await sb.from(TABLE).insert({name:'', address:'', color:'#1b6b3c', activities:[]}).select().single();
  if(error){ showToast('Erreur : ' + error.message); return null; }
  const ent = rowToEntity(data);
  entities.unshift(ent);
  return ent;
}

async function updateEntity(id, patch){
  const {error} = await sb.from(TABLE).update(patch).eq('id', id);
  if(error){ setSaveStatus('échec sauvegarde', true); showToast('Erreur de sauvegarde : ' + error.message); return false; }
  return true;
}

async function deleteEntityRow(id){
  const {error} = await sb.from(TABLE).delete().eq('id', id);
  if(error){ showToast('Erreur de suppression : ' + error.message); return false; }
  return true;
}

function scheduleFieldSave(id, patch, label){
  const key = id + ':' + label;
  clearTimeout(saveTimers[key]);
  setSaveStatus('modification...', false);
  saveTimers[key] = setTimeout(async ()=>{
    setSaveStatus('enregistrement...', false);
    const ok = await updateEntity(id, patch);
    if(ok) setSaveStatus('enregistré', true);
  }, 500);
}

function pinIcon(color){
  return L.divIcon({
    className: '',
    html: `<div class="pcp-pin" style="width:26px;height:26px;background:${color};">
             <div class="pcp-pin-inner"></div>
           </div>`,
    iconSize: [26,26],
    iconAnchor: [13,26],
    popupAnchor: [0,-24]
  });
}

function popupContent(ent){
  const acts = (ent.activities||[]).map(a => `<span title="${escapeHtml(ACTIVITY_FULL[a]||a)}">${ICONS[a]||''}</span>`).join('');
  return `<div class="popup-title">${escapeHtml(ent.name || '(sans nom)')}</div><div>${escapeHtml(ent.address || '')}</div>` +
         (acts ? `<div class="popup-activities">${acts}</div>` : '');
}

function initMap(){
  map = L.map('map', {zoomControl:true}).setView([46.6, 2.2], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function matchesFilters(ent){
  const searchEl = document.getElementById('search-input');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const matchesText = !q || (ent.name||'').toLowerCase().includes(q) || (ent.address||'').toLowerCase().includes(q);
  const matchesActivity = !selectedFilters.length || selectedFilters.some(f => (ent.activities||[]).includes(f));
  return matchesText && matchesActivity;
}

function renderChips(){
  const wrap = document.getElementById('chips');
  wrap.innerHTML = '';
  ACTIVITIES.forEach(act => {
    const count = entities.filter(e => (e.activities||[]).includes(act)).length;
    const chip = document.createElement('div');
    chip.className = 'chip' + (selectedFilters.includes(act) ? ' active' : '');
    chip.title = ACTIVITY_FULL[act] || act;
    chip.innerHTML = `${ICONS[act]||''}<span>${act}</span><span class="chip-count">${count}</span>`;
    chip.addEventListener('click', ()=>{
      const i = selectedFilters.indexOf(act);
      if(i>-1) selectedFilters.splice(i,1); else selectedFilters.push(act);
      renderChips();
      renderAll({fit:true});
    });
    wrap.appendChild(chip);
  });
  const clearBtn = document.getElementById('clear-filters');
  clearBtn.style.visibility = selectedFilters.length ? 'visible' : 'hidden';
}

function renderMarkersFor(visible){
  markersLayer.clearLayers();
  markerRefs = {};
  visible.forEach(ent => {
    if(typeof ent.lat === 'number' && typeof ent.lng === 'number' && !isNaN(ent.lat) && !isNaN(ent.lng)){
      const marker = L.marker([ent.lat, ent.lng], {icon: pinIcon(ent.color || '#1b6b3c')});
      marker.bindPopup(popupContent(ent));
      marker.on('click', ()=> setActive(ent.id, true));
      marker.addTo(markersLayer);
      markerRefs[ent.id] = marker;
    }
  });
}

function fitToVisible(visible){
  const pts = visible.filter(e => typeof e.lat === 'number' && typeof e.lng === 'number').map(e => [e.lat, e.lng]);
  if(pts.length){
    map.fitBounds(pts, {padding:[30,30], maxZoom: 13});
  }
}

function isMobileLayout(){
  return window.matchMedia('(max-width: 768px)').matches;
}

function openPanel(){
  document.getElementById('panel').classList.add('open');
  document.getElementById('panel-backdrop').classList.add('show');
  const btn = document.getElementById('panel-toggle');
  if(btn) btn.textContent = '🗺️ Voir la carte';
}

function closePanel(){
  document.getElementById('panel').classList.remove('open');
  document.getElementById('panel-backdrop').classList.remove('show');
  const btn = document.getElementById('panel-toggle');
  if(btn) btn.textContent = '📋 Voir la liste';
}

function togglePanel(){
  const panel = document.getElementById('panel');
  if(panel.classList.contains('open')) closePanel(); else openPanel();
}

function setActive(id, panMap){
  activeId = id;
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
  if(panMap){
    const m = markerRefs[id];
    if(m){
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 11), {duration:0.5});
      m.openPopup();
    }
    if(isMobileLayout()) closePanel();
  }
}

async function geocode(address){
  if(!address || !address.trim()) return null;
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=' + encodeURIComponent(address);
  const res = await fetch(url, {headers: {'Accept':'application/json'}});
  if(!res.ok) throw new Error('Service de géocodage indisponible');
  const data = await res.json();
  if(!data || !data.length) return null;
  return {lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon)};
}

function openActivityModal(entId){
  modalEntityId = entId;
  const ent = entities.find(e => e.id === entId);
  if(!ent) return;
  document.getElementById('modal-title').textContent = ent.name ? `Activités — ${ent.name}` : 'Activités';
  const opts = document.getElementById('modal-options');
  opts.innerHTML = '';
  ACTIVITIES.forEach(act => {
    const row = document.createElement('label');
    row.className = 'modal-option';
    const checked = (ent.activities||[]).includes(act);
    row.innerHTML = `
      <input type="checkbox" ${checked ? 'checked' : ''} data-act="${act}" />
      <span class="act-badge">${ICONS[act]||''}</span>
      <span class="opt-label">${escapeHtml(ACTIVITY_FULL[act]||act)}</span>
    `;
    const checkbox = row.querySelector('input');
    checkbox.addEventListener('change', async ()=>{
      const e2 = entities.find(x => x.id === entId);
      if(!e2) return;
      e2.activities = e2.activities || [];
      const idx = e2.activities.indexOf(act);
      if(checkbox.checked && idx === -1) e2.activities.push(act);
      if(!checkbox.checked && idx > -1) e2.activities.splice(idx,1);
      setSaveStatus('enregistrement...', false);
      const ok = await updateEntity(entId, {activities: e2.activities});
      if(ok) setSaveStatus('enregistré', true);
      renderChips();
      renderAll({fit:false});
    });
    opts.appendChild(row);
  });
  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal(){
  document.getElementById('modal-overlay').classList.remove('show');
  modalEntityId = null;
}

function renderListFor(visible){
  const list = document.getElementById('list');
  const q = document.getElementById('search-input').value.trim();
  let label = `${entities.length} entité${entities.length>1?'s':''}`;
  if(visible.length !== entities.length) label += ` · ${visible.length} affichée${visible.length>1?'s':''}`;
  document.getElementById('count-text').textContent = label;

  list.innerHTML = '';
  if(!visible.length){
    const div = document.createElement('div');
    div.id = 'empty-state';
    div.textContent = (q || selectedFilters.length) ? 'Aucune entité ne correspond aux critères.' : 'Aucune entité pour le moment.';
    list.appendChild(div);
    return;
  }

  visible.forEach(ent => {
    const missing = !(typeof ent.lat === 'number' && typeof ent.lng === 'number');
    const card = document.createElement('div');
    card.className = 'card' + (missing ? ' missing' : '') + (ent.id === activeId ? ' active' : '');
    card.dataset.id = ent.id;

    const badges = (ent.activities||[]).map(a => `<span class="act-badge" title="${escapeHtml(ACTIVITY_FULL[a]||a)}">${ICONS[a]||''}</span>`).join('');

    if(!IS_ADMIN){
      // Read-only rendering
      card.innerHTML = `
        <div class="card-row1">
          <span class="dot" style="background:${ent.color || '#1b6b3c'};"></span>
          <span class="card-name">${escapeHtml(ent.name || '(sans nom)')}</span>
        </div>
        <div class="activities-row">${badges}</div>
        <div class="card-address">${escapeHtml(ent.address || '')}</div>
      `;
      card.addEventListener('click', ()=> setActive(ent.id, true));
      list.appendChild(card);
      return;
    }

    // Admin (editable) rendering
    card.innerHTML = `
      <div class="card-row1">
        <input type="color" class="swatch" value="${ent.color || '#1b6b3c'}" title="Couleur du repère" />
        <input type="text" class="name-input" value="${escapeHtml(ent.name || '')}" placeholder="Nom de l'entité" />
        <button class="del-btn" title="Supprimer">✕</button>
      </div>
      <div class="activities-row">
        ${badges}
        <button class="edit-act-btn">✎ Activités</button>
      </div>
      <div class="addr-row">
        <textarea class="addr-input" rows="2" placeholder="Adresse postale">${escapeHtml(ent.address || '')}</textarea>
        <button class="locate-btn">📍 Localiser</button>
      </div>
      <div class="status-line"></div>
    `;

    const swatch = card.querySelector('.swatch');
    const nameInput = card.querySelector('.name-input');
    const addrInput = card.querySelector('.addr-input');
    const locateBtn = card.querySelector('.locate-btn');
    const delBtn = card.querySelector('.del-btn');
    const editActBtn = card.querySelector('.edit-act-btn');
    const statusLine = card.querySelector('.status-line');

    if(missing){
      statusLine.textContent = 'Localisation manquante — saisissez une adresse puis "Localiser".';
      statusLine.classList.add('status-warn');
    }

    card.addEventListener('click', (e)=>{
      if(['INPUT','TEXTAREA','BUTTON'].includes(e.target.tagName)) return;
      setActive(ent.id, true);
    });

    swatch.addEventListener('input', ()=>{
      ent.color = swatch.value;
      const m = markerRefs[ent.id];
      if(m) m.setIcon(pinIcon(ent.color));
      scheduleFieldSave(ent.id, {color: ent.color}, 'color');
    });

    nameInput.addEventListener('input', ()=>{
      ent.name = nameInput.value;
      const m = markerRefs[ent.id];
      if(m) m.setPopupContent(popupContent(ent));
      scheduleFieldSave(ent.id, {name: ent.name}, 'name');
    });

    addrInput.addEventListener('input', ()=>{
      ent.address = addrInput.value;
      const m = markerRefs[ent.id];
      if(m) m.setPopupContent(popupContent(ent));
      scheduleFieldSave(ent.id, {address: ent.address}, 'address');
    });

    editActBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openActivityModal(ent.id);
    });

    delBtn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!confirm(`Supprimer "${ent.name || 'cette entité'}" ?`)) return;
      const ok = await deleteEntityRow(ent.id);
      if(ok){
        entities = entities.filter(x => x.id !== ent.id);
        renderChips();
        renderAll({fit:false});
        showToast('Entité supprimée');
      }
    });

    locateBtn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!addrInput.value.trim()){
        statusLine.textContent = 'Saisissez une adresse avant de localiser.';
        statusLine.className = 'status-line status-warn';
        return;
      }
      locateBtn.disabled = true;
      locateBtn.textContent = '⏳ ...';
      statusLine.textContent = 'Recherche en cours...';
      statusLine.className = 'status-line';
      try{
        const coords = await geocode(addrInput.value);
        if(coords){
          ent.lat = coords.lat;
          ent.lng = coords.lng;
          card.classList.remove('missing');
          statusLine.textContent = 'Localisation mise à jour ✓';
          statusLine.className = 'status-line status-ok';
          await updateEntity(ent.id, {lat: ent.lat, lng: ent.lng});
          renderAll({fit:false});
          setActive(ent.id, true);
        } else {
          statusLine.textContent = "Adresse introuvable — vérifiez l'orthographe.";
          statusLine.className = 'status-line status-warn';
        }
      }catch(err){
        statusLine.textContent = 'Erreur réseau lors de la localisation.';
        statusLine.className = 'status-line status-warn';
      }finally{
        locateBtn.disabled = false;
        locateBtn.textContent = '📍 Localiser';
      }
    });

    list.appendChild(card);
  });
}

function renderAll(opts){
  opts = opts || {};
  const visible = entities.filter(matchesFilters);
  renderMarkersFor(visible);
  renderListFor(visible);
  if(opts.fit) fitToVisible(visible);
}

function wireAdminControls(){
  const addBtn = document.getElementById('add-btn');
  if(addBtn){
    addBtn.addEventListener('click', async ()=>{
      const ent = await insertEntity();
      if(!ent) return;
      renderChips();
      renderAll({fit:false});
      const firstCard = document.querySelector('.card');
      if(firstCard){
        firstCard.scrollIntoView({block:'start', behavior:'smooth'});
        const input = firstCard.querySelector('.name-input');
        if(input) input.focus();
      }
    });
  }
  const modalClose = document.getElementById('modal-close');
  if(modalClose) modalClose.addEventListener('click', closeModal);
  const modalOverlay = document.getElementById('modal-overlay');
  if(modalOverlay) modalOverlay.addEventListener('click', (e)=>{ if(e.target.id === 'modal-overlay') closeModal(); });

  const logoutBtn = document.getElementById('logout-btn');
  if(logoutBtn){
    logoutBtn.addEventListener('click', async ()=>{
      await sb.auth.signOut();
      window.location.reload();
    });
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  const clearBtn = document.getElementById('clear-filters');
  if(clearBtn) clearBtn.addEventListener('click', ()=>{
    selectedFilters = [];
    renderChips();
    renderAll({fit:true});
  });
  const searchInput = document.getElementById('search-input');
  if(searchInput) searchInput.addEventListener('input', ()=> renderAll({fit:false}));

  const toggleBtn = document.getElementById('panel-toggle');
  if(toggleBtn) toggleBtn.addEventListener('click', togglePanel);
  const backdrop = document.getElementById('panel-backdrop');
  if(backdrop) backdrop.addEventListener('click', closePanel);
});

async function boot(){
  sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  initMap();
  if(IS_ADMIN) wireAdminControls();
  await fetchEntities();
  renderChips();
  renderAll({fit:true});
  const loadingScreen = document.getElementById('loading-screen');
  if(loadingScreen) loadingScreen.classList.add('hidden');
}

window.PCP_APP = { boot, sb: ()=>sb };
})();
