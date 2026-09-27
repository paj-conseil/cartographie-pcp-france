/*
 * NOUVELLE ACTION À AJOUTER À LA FONCTION SERVEUR EXISTANTE "admin-users"
 * ------------------------------------------------------------------------
 * Dans le tableau de bord Supabase → Edge Functions → admin-users → Éditer le code,
 * repérez l'endroit où les actions existantes sont distinguées (probablement une
 * série de "if (action === 'create') {...}", "if (action === 'delete') {...}",
 * "if (action === 'reset_password') {...}"), et collez le bloc ci-dessous À CÔTÉ
 * de ces blocs (juste avant le "return" final qui gère une action inconnue).
 *
 * Adaptez uniquement 2 choses au code déjà en place dans votre fonction :
 *   - "admin"       : le nom de la variable qui contient le client Supabase
 *                      créé avec la clé de service (service role) — c'est ce
 *                      même client qui sert déjà pour createUser/deleteUser.
 *   - "callerId"    : l'identifiant (uuid) de l'administrateur qui appelle la
 *                      fonction — normalement déjà extrait plus haut dans le
 *                      code pour vérifier qu'il a bien le rôle admin.
 *   - "callerEmail" : l'e-mail de cet administrateur (si vous l'avez sous la
 *                      main : sinon remplacez par null, ce n'est pas bloquant).
 *   - "json(...)"   : la fonction qui renvoie une réponse JSON dans votre code
 *                      actuel (create/delete/reset_password renvoient bien
 *                      une réponse JSON avec un statut HTTP ; utilisez la
 *                      même fonction/formulation). S'il n'en existe pas,
 *                      remplacez chaque "return json(corps, statut)" par :
 *                        return new Response(JSON.stringify(corps), {
 *                          status: statut,
 *                          headers: { "Content-Type": "application/json" }
 *                        });
 *
 * Si vous préférez, envoyez-moi le code actuel de la fonction et je vous
 * renverrai le fichier complet, déjà à jour, prêt à coller intégralement.
 *
 * Ce bloc :
 *   1. Génère un lien de connexion ("magic link") pour l'utilisateur ciblé,
 *      avec la clé de service — jamais exposée au navigateur.
 *   2. Renvoie au navigateur seulement le "hashed_token" de ce lien (jamais
 *      la clé de service elle-même), que le site utilise pour ouvrir une
 *      vraie session au nom de cet utilisateur (sb.auth.verifyOtp).
 *   3. Trace l'usage dans la table admin_impersonation_log (voir le script
 *      SQL setup-admin-impersonation-log.sql) — best-effort, n'empêche pas
 *      l'impersonation de fonctionner si l'insertion échoue.
 */

if (action === "impersonate") {
  const { userId } = body as { userId: string };
  if (!userId) {
    return json({ error: "userId requis" }, 400);
  }

  const { data: targetData, error: targetErr } = await admin.auth.admin.getUserById(userId);
  if (targetErr || !targetData?.user) {
    return json({ error: "Utilisateur introuvable" }, 404);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetData.user.email!,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return json({ error: linkErr?.message || "Impossible de générer le lien de connexion" }, 500);
  }

  // Trace l'usage de cette fonction sensible (best-effort).
  admin
    .from("admin_impersonation_log")
    .insert({
      admin_id: callerId,
      admin_email: callerEmail ?? null,
      target_id: userId,
      target_email: targetData.user.email,
    })
    .then(
      () => {},
      () => {}
    );

  return json({ token_hash: linkData.properties.hashed_token, email: targetData.user.email });
}
