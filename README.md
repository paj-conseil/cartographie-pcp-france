# Carte des implantations PCP France — mise en ligne

Ce dossier contient tout ce qu'il faut pour publier la carte sur internet :
- une **page publique** (`index.html`) en consultation uniquement
- une **page d'administration** (`admin.html`) protégée par mot de passe, où vous seule pouvez modifier les entités
- les deux pages partagent les mêmes données, stockées dans une base **Supabase**

Temps estimé : 15-20 minutes, en une seule fois.

---

## Étape 1 — Créer le projet Supabase

1. Allez sur https://supabase.com et connectez-vous (ou créez un compte gratuit).
2. Cliquez sur **New project**.
3. Donnez-lui un nom, par exemple `pcp-carte-agences`.
4. Choisissez une région proche (ex : *Frankfurt (eu-central-1)* ou *Paris* si disponible).
5. Définissez un mot de passe de base de données (notez-le de côté, vous n'en aurez pas besoin au quotidien mais gardez-le en sécurité).
6. Cliquez sur **Create new project** et attendez ~1 minute que le projet soit prêt.

## Étape 2 — Créer la table et charger les données

1. Dans le menu de gauche du tableau de bord Supabase, ouvrez **SQL Editor**.
2. Cliquez sur **New query**.
3. Ouvrez le fichier `setup.sql` (fourni dans ce dossier), copiez tout son contenu, collez-le dans l'éditeur.
4. Cliquez sur **Run**. Cela va :
   - créer la table `agences`
   - activer les règles de sécurité (lecture publique / écriture réservée à l'admin)
   - insérer les 39 entités du fichier Excel d'origine
5. Vérifiez dans **Table Editor > agences** que les 39 lignes sont bien présentes.

## Étape 3 — Récupérer les clés d'accès

1. Dans le tableau de bord Supabase, allez dans **Project Settings** (icône engrenage) **> API**.
2. Notez deux valeurs :
   - **Project URL** (ressemble à `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key (une longue chaîne de caractères)

   ⚠️ Cette clé "anon public" n'est **pas un secret** — elle est prévue pour être visible dans le code d'un site public. C'est la sécurité définie à l'étape 2 (RLS) qui empêche les visiteurs de modifier les données, pas la clé elle-même. Ne confondez pas avec la clé `service_role`, celle-là ne doit jamais être exposée — vous n'en avez pas besoin ici.

3. Ouvrez le fichier `supabase-config.js` et remplacez les deux valeurs par les vôtres :
   ```js
   window.SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

## Étape 4 — Créer votre compte administrateur

1. Toujours dans Supabase, allez dans **Authentication > Users**.
2. Cliquez sur **Add user > Create new user**.
3. Saisissez votre e-mail et un mot de passe, puis cochez **Auto Confirm User** (pour ne pas avoir besoin de vérifier l'e-mail).
4. Validez. C'est ce compte qui vous servira à vous connecter sur `admin.html`.
5. **Important — empêcher d'autres personnes de créer un compte admin** : allez dans **Authentication > Providers > Email**, et désactivez l'option **Allow new users to sign up**. Ainsi, seul le compte que vous venez de créer manuellement pourra se connecter.

## Étape 5 — Publier sur GitHub Pages

Comme pour votre application de relevé de charpente :

1. Créez un nouveau dépôt GitHub, par exemple `pcp-carte-agences` (public ou privé — GitHub Pages fonctionne avec les deux sur un compte payant ; sur un compte gratuit, le dépôt doit être public pour que Pages soit disponible).
2. Ajoutez-y les fichiers de ce dossier :
   - `index.html`
   - `admin.html`
   - `app.js`
   - `style.css`
   - `supabase-config.js` (avec vos vraies valeurs, pas les placeholders)
3. Poussez (commit + push) sur la branche `main`.
4. Dans le dépôt GitHub, allez dans **Settings > Pages**.
5. Sous **Source**, choisissez la branche `main` et le dossier `/ (root)`, puis **Save**.
6. Après une minute ou deux, votre site est en ligne à l'adresse :
   `https://VOTRE-NOM-UTILISATEUR.github.io/pcp-carte-agences/`

## Résultat

- **Page publique (consultation)** : `https://.../pcp-carte-agences/` → carte + liste en lecture seule, recherche et filtres par activité, mais aucun bouton de modification.
- **Page d'administration** : `https://.../pcp-carte-agences/admin.html` → demande votre e-mail/mot de passe, puis donne accès à l'édition complète (nom, adresse, couleur, activités, ajout/suppression). Toute modification est enregistrée immédiatement dans Supabase et apparaît aussitôt sur la page publique (après rafraîchissement).

## Notes

- Vous pouvez partager le lien de la page publique aussi largement que vous le souhaitez ; personne ne pourra modifier les données sans le mot de passe admin.
- Si un jour vous voulez donner l'accès admin à quelqu'un d'autre (par ex. Pierre), créez-lui simplement un second utilisateur dans **Authentication > Users** — pas besoin de repartager votre propre mot de passe.
- Le plan gratuit de Supabase et de GitHub Pages suffit largement pour ce volume de données (quelques dizaines d'entités).
