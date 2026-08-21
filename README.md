# Site du club TBK

Site statique (HTML/CSS/JS, aucune installation nécessaire) prêt à héberger gratuitement sur GitHub Pages.

## Structure

```
tbk-site/
├── index.html      → contenu de la page (textes, sections)
├── css/style.css   → couleurs, typographies, mise en page
├── js/main.js      → menu mobile, compte à rebours, formulaire
└── images/         → à remplir avec vos photos/logo si besoin
```

## Personnaliser avant mise en ligne

- **Horaires** : section `#creneaux` dans `index.html`, tableau `<table class="schedule">`.
- **Date du tournoi** : déjà réglée sur le 11 septembre 2026. Pour changer, modifiez `TOURNAMENT_DATE` en haut de `js/main.js` **et** le texte `.tournoi-date` dans `index.html`.
- **Tarifs** : section `#rejoindre`, cartes `.price-card`.
- **Coordonnées** : section `#contact`, remplacez l'email, l'adresse et les liens réseaux sociaux.
- **Couleurs** : tout est centralisé en haut de `css/style.css`, dans `:root { ... }`.
- **Formulaire de contact** : il ne fait rien par défaut (site statique = pas de serveur). Solution la plus simple : créez un compte gratuit sur [Formspree](https://formspree.io), puis remplacez dans `index.html` :
  ```html
  <form class="contact-form" id="contactForm">
  ```
  par :
  ```html
  <form class="contact-form" id="contactForm" action="https://formspree.io/f/VOTRE_ID" method="POST">
  ```
  et supprimez le bloc `contactForm.addEventListener` dans `js/main.js`.

## Mise en ligne sur GitHub Pages

1. **Créer un dépôt** sur github.com → bouton "New repository" → nommez-le par exemple `tbk-site` → cochez "Public" → créez-le sans README (vous en avez déjà un).
2. **Envoyer les fichiers** — deux façons :
   - *Sans ligne de commande* : sur la page du dépôt, cliquez sur "Add file" → "Upload files", glissez-déposez tout le contenu de ce dossier (`index.html`, `css/`, `js/`, `README.md`), puis "Commit changes".
   - *Avec Git* :
     ```bash
     git init
     git add .
     git commit -m "Site TBK"
     git branch -M main
     git remote add origin https://github.com/VOTRE_UTILISATEUR/tbk-site.git
     git push -u origin main
     ```
3. **Activer GitHub Pages** : dans le dépôt, "Settings" → "Pages" (menu de gauche) → sous "Build and deployment", "Source" = "Deploy from a branch" → "Branch" = `main`, dossier `/ (root)` → "Save".
4. **Récupérer l'adresse** : après 1 à 2 minutes, GitHub affiche l'URL du site en haut de cette même page, du type `https://VOTRE_UTILISATEUR.github.io/tbk-site/`.
5. **Nom de domaine personnalisé (optionnel)** : si vous avez un domaine (ex. `tbk-club.fr`), ajoutez-le dans le champ "Custom domain" de cette page Settings → Pages, puis créez chez votre registrar un enregistrement CNAME pointant vers `VOTRE_UTILISATEUR.github.io`.

## Mettre à jour le site plus tard

- Via l'interface web : ouvrez le fichier à modifier sur GitHub, cliquez sur le crayon (crayon "Edit"), modifiez, "Commit changes". Le site se met à jour automatiquement en 1-2 minutes.
- Via Git : modifiez en local, puis `git add . && git commit -m "mise à jour" && git push`.

## Connexion à Supabase (comptes utilisateurs, profils, rôles)

Le site utilise [Supabase](https://supabase.com) (gratuit) pour l'authentification et les données. Trois rôles existent : `visiteur` (par défaut à l'inscription), `membre` (accès au contenu réservé, à activer manuellement) et `admin` (peut changer le rôle des autres utilisateurs).

**Point important à comprendre** : le site reste un site statique. Les fichiers HTML sont toujours techniquement accessibles (comme n'importe quel fichier sur GitHub Pages). La vraie protection ne vient pas du fait de "cacher" une page, mais du fait que les **données** affichées sur ces pages sont filtrées côté Supabase selon le rôle de la personne connectée (règles RLS ci-dessous). Un visiteur non autorisé peut ouvrir `membres.html`, mais ne recevra jamais le contenu réservé.

### 1. Créer le projet Supabase
1. Créez un compte sur [supabase.com](https://supabase.com) et un nouveau projet.
2. Dans **Project Settings → API**, notez l'**URL du projet** et la clé **`anon` `public`**.
3. Ouvrez `js/supabase-config.js` et remplacez les deux valeurs :
   ```js
   const SUPABASE_URL = 'https://VOTRE-PROJET.supabase.co';
   const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON_PUBLIQUE';
   ```
   Cette clé `anon` est faite pour être publique — ce n'est pas un mot de passe.

### 2. Créer les tables et les règles de sécurité
1. Dans Supabase, ouvrez **SQL Editor → New query**.
2. Collez le contenu du fichier `supabase/schema.sql` fourni, puis cliquez **Run**.
   Cela crée :
   - la table `profiles` (un profil par utilisateur, rôle `visiteur` par défaut à l'inscription),
   - les règles RLS qui empêchent un utilisateur de se donner lui-même un rôle plus élevé,
   - une table d'exemple `annonces_membres` visible uniquement des `membre`/`admin`.

### 3. Configurer les URLs autorisées
1. Dans Supabase : **Authentication → URL Configuration**.
2. **Site URL** : `https://jga29860.github.io/tbk-site/`
3. **Redirect URLs** : ajoutez la même URL.

### 4. Créer votre propre compte admin
Il n'existe aucun admin au départ — c'est volontaire, pour la sécurité. Pour créer le premier :
1. Allez sur `membres.html` sur votre site en ligne, créez un compte normalement (vous aurez le rôle `visiteur`).
2. Dans Supabase : **Table Editor → profiles**, trouvez votre ligne (par email), modifiez la colonne `role` en `admin` directement dans l'interface Supabase.
3. Reconnectez-vous sur le site : le lien **Administration** apparaît, vous pouvez désormais changer le rôle des autres utilisateurs depuis `admin.html`.

### 5. Confirmation email (optionnel)
Par défaut, Supabase envoie un email de confirmation à l'inscription. Vous pouvez désactiver cette étape dans **Authentication → Providers → Email → "Confirm email"** si vous préférez que les comptes soient actifs immédiatement (déconseillé si le site est public).

### Pages ajoutées
- `membres.html` — connexion / inscription, puis contenu réservé aux `membre`/`admin`.
- `admin.html` — réservée aux `admin`, liste des utilisateurs et changement de rôle.

### Aller plus loin
Pour réserver d'autres contenus (résultats de tournoi, documents internes…), créez de nouvelles tables sur le même modèle que `annonces_membres` dans Supabase, avec une policy RLS `role in ('membre','admin')`, puis interrogez-les depuis une page comme `membres.js` le fait pour les annonces.

## Tester en local avant publication

Ouvrez simplement `index.html` dans un navigateur, ou lancez un petit serveur local :
```bash
python3 -m http.server 8000
```
puis ouvrez `http://localhost:8000`.
