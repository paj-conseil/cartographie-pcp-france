// Garde commune aux fonctions edge qui ne doivent pas être appelables avec la clé anonyme publique.
// Accepte : le secret de la tâche planifiée (en-tête x-cron-secret) ou un utilisateur connecté de rôle admin.
export async function autorise(req: Request, sql: any): Promise<boolean> {
  const sec = req.headers.get("x-cron-secret");
  if (sec) { const [r] = await sql`select 1 as ok from odoo.parametres where cle = 'cron_secret' and valeur = ${sec}`; if (r) return true; }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const u = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" } });
  if (!u.ok) return false;
  const { id } = await u.json();
  const [p] = await sql`select 1 as ok from public.profiles where id = ${id} and role = 'admin'`;
  return !!p;
}
