// Clés de connexion au projet Supabase dédié aux RDV / propositions commerciales.
// Créez un nouveau projet Supabase (distinct de celui de la cartographie et du relevé de
// charpente, ou réutilisez-en un si vous préférez centraliser), puis exécutez le script SQL
// fourni (rdv-supabase-setup.sql) dans l'éditeur SQL de Supabase pour créer la table.
// Remplacez ensuite les deux valeurs ci-dessous par celles de votre projet
// (Project Settings → API → Project URL / anon public key).
//
// Tant que ces valeurs ne sont pas renseignées, l'application fonctionne uniquement en local
// (localStorage) sur l'appareil du commercial — aucune donnée n'est perdue, mais elle n'est
// pas partagée entre commerciaux tant que Supabase n'est pas configuré.

window.RDV_SUPABASE_URL = "https://cbuofynmfweihzpeztcv.supabase.co";
window.RDV_SUPABASE_ANON_KEY = "REMPLACER_PAR_VOTRE_CLE_ANON";
