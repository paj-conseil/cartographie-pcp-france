// Relais vers l'annuaire public des entreprises (recherche-entreprises.api.gouv.fr).
// La page Gestion commerciale appelle ce relais au lieu de l'annuaire directement :
// la requête part alors des serveurs Supabase et non du poste de l'utilisateur, ce qui
// évite les blocages réseau (pare-feu, limitation temporaire de l'adresse IP du poste).
// Réservé aux utilisateurs connectés (jeton Supabase vérifié par la plateforme).
//
// Appel : POST { "params": { "q": "...", "code_postal": "49000", "per_page": 10 } }
// Réponse : la réponse JSON de l'annuaire, telle quelle.

const API = "https://recherche-entreprises.api.gouv.fr/search";
const ALLOWED = new Set(["q", "code_postal", "departement", "per_page", "page", "etat_administratif"]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { params } = await req.json();
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (ALLOWED.has(k) && v !== null && v !== undefined && String(v).length <= 200) usp.set(k, String(v));
    }
    if (!usp.get("q")) {
      return new Response(JSON.stringify({ results: [] }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(`${API}?${usp.toString()}`, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    clearTimeout(timer);
    const body = await res.text();
    return new Response(body, { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ erreur: String(e && e.message || e) }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
