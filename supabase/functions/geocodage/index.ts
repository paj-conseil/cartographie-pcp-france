// Relais de géolocalisation vers la Base Adresse Nationale (géocodage en lot, format CSV).
// La page Gestion commerciale envoie jusqu'à 2 000 adresses de chantier distinctes ;
// le relais renvoie une position pour chacune (null si introuvable).
// Une adresse mal reconnue (score < 0,5) est replacée au centre de sa commune.
// Réservé aux utilisateurs connectés (jeton Supabase vérifié par la plateforme).
//
// Appel : POST { "adresses": [{ "adresse": "...", "code_postal": "17000", "ville": "La Rochelle" }] }
// Réponse : { "resultats": [{ adresse, code_postal, ville, lat, lon, precision, score }] }

// L'ancienne API api-adresse.data.gouv.fr/search/csv/ (repli précédent) a été décommissionnée
// en janvier 2026 ; son trafic est redirigé vers l'API Géoplateforme de l'IGN, qui est donc
// désormais la seule adresse utilisée. La conserver en repli ne faisait qu'ajouter un aller-retour
// mort en cas d'échec du relais principal.
const ENDPOINTS = [
  "https://data.geopf.fr/geocodage/search/csv",
];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Adr = { adresse?: string; code_postal?: string; ville?: string };
type Res = { lat: number | null; lon: number | null; precision: string | null; score: number | null };

function csvCell(v: string) { return '"' + String(v ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ") + '"'; }

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function geocode(lines: { id: number; adresse: string; code_postal: string; ville: string }[]): Promise<Map<number, Res>> {
  const csv = "id,adresse,code_postal,ville\n" +
    lines.map((l) => [String(l.id), csvCell(l.adresse), csvCell(l.code_postal), csvCell(l.ville)].join(",")).join("\n");
  let lastErr = "";
  for (const url of ENDPOINTS) {
    try {
      const fd = new FormData();
      fd.append("data", new Blob([csv], { type: "text/csv" }), "adresses.csv");
      fd.append("columns", "adresse");
      fd.append("columns", "ville");
      fd.append("postcode", "code_postal");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 100000);
      const r = await fetch(url, { method: "POST", body: fd, signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) { lastErr = `${url} : ${r.status}`; continue; }
      const rows = parseCsv(await r.text());
      const head = rows.shift() || [];
      const ix = (n: string) => head.indexOf(n);
      const iId = ix("id"), iLat = ix("latitude"), iLon = ix("longitude"), iType = ix("result_type"), iScore = ix("result_score");
      const out = new Map<number, Res>();
      for (const c of rows) {
        if (c.length < head.length) continue;
        const lat = parseFloat(c[iLat]), lon = parseFloat(c[iLon]), sc = parseFloat(c[iScore]);
        out.set(Number(c[iId]), {
          lat: isFinite(lat) ? lat : null, lon: isFinite(lon) ? lon : null,
          precision: c[iType] || null, score: isFinite(sc) ? Math.round(sc * 100) / 100 : null,
        });
      }
      return out;
    } catch (e) { lastErr = `${url} : ${String((e as Error)?.message || e)}`; }
  }
  throw new Error("géocodeur indisponible (" + lastErr + ")");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const { adresses } = await req.json();
    const list: Adr[] = Array.isArray(adresses) ? adresses.slice(0, 2000) : [];
    if (!list.length) return json({ resultats: [] });
    const lines = list.map((a, id) => ({ id, adresse: a.adresse || "", code_postal: a.code_postal || "", ville: a.ville || "" }));
    const res = await geocode(lines);
    // adresses mal reconnues : position du centre de la commune
    const faibles = lines.filter((l) => l.adresse && !((res.get(l.id)?.score ?? 0) >= 0.5));
    if (faibles.length) {
      const res2 = await geocode(faibles.map((l) => ({ ...l, adresse: "" })));
      for (const l of faibles) {
        const r2 = res2.get(l.id);
        if (r2 && r2.lat !== null && (r2.score ?? 0) >= 0.3) res.set(l.id, { ...r2, precision: "municipality" });
      }
    }
    const resultats = lines.map((l) => {
      const r = res.get(l.id);
      const ok = r && r.lat !== null && (r.score ?? 0) >= 0.3;
      return {
        adresse: list[l.id].adresse ?? "", code_postal: list[l.id].code_postal ?? "", ville: list[l.id].ville ?? "",
        lat: ok ? r!.lat : null, lon: ok ? r!.lon : null, precision: ok ? r!.precision : "introuvable", score: r?.score ?? null,
      };
    });
    return json({ resultats });
  } catch (e) {
    return json({ erreur: String((e as Error)?.message || e) }, 502);
  }
});
