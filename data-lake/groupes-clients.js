const REF=require(require('path').join(__dirname,'..','clients-referentiel.js'));
const fs=require('fs');
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const out=rows.map(r=>({g:REF.detectGroup([r.nom]), div:/\b(AADS|SAPA|AVILIA|HYGIENE GLOBAL SERVICES|SERVIGECO|ENVIRONNEMENT SERVICES|PEST CONTROL PARTNERSHIP|HDA BOURGOGNE|SADED|HYGIENE URBAINE)\b/.test(REF.norm?REF.norm(r.nom):r.nom.toUpperCase())}));
fs.writeFileSync(process.argv[3],JSON.stringify(out));
