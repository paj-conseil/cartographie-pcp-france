// Edge Function : admin-users
// À déployer dans Supabase > Edge Functions > "Deploy a new function" > "Via Editor"
// Nom exact de la fonction : admin-users
//
// Permet à un administrateur (et seulement lui) de créer ou supprimer un compte
// utilisateur, sans jamais exposer la clé service_role dans le navigateur :
// cette clé ne vit que côté serveur, ici, fournie automatiquement par Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Client lié à l'appelant : sert uniquement à vérifier qui il est.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Session invalide' }), { status: 401, headers: corsHeaders })
    }

    // Client avec les pleins droits : utilisé seulement après vérification du rôle.
    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: callerProfile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Réservé aux administrateurs' }), { status: 403, headers: corsHeaders })
    }

    const body = await req.json()

    if (body.action === 'create') {
      const { email, password, role } = body
      if (!email || !password || !role) {
        return new Response(JSON.stringify({ error: 'Champs manquants' }), { status: 400, headers: corsHeaders })
      }
      if (password.length < 8) {
        return new Response(JSON.stringify({ error: 'Le mot de passe doit faire au moins 8 caractères' }), { status: 400, headers: corsHeaders })
      }
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders })
      }
      // Le déclencheur SQL a déjà créé le profil (rôle "lecteur" par défaut) ;
      // on applique ici le rôle réellement choisi dans le formulaire.
      await adminClient.from('profiles').update({ role }).eq('id', created.user.id)
      return new Response(JSON.stringify({ ok: true, id: created.user.id }), { status: 200, headers: corsHeaders })
    }

    if (body.action === 'delete') {
      const { userId } = body
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId manquant' }), { status: 400, headers: corsHeaders })
      }
      if (userId === user.id) {
        return new Response(JSON.stringify({ error: 'Impossible de supprimer votre propre compte' }), { status: 400, headers: corsHeaders })
      }
      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId)
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), { status: 400, headers: corsHeaders })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), { status: 400, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
