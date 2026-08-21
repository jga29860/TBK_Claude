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
2. **Site URL** : `https://jga29860.github.io/TBK_Claude/`
3. **Redirect URLs** : ajoutez cette même URL, **et** `https://jga29860.github.io/TBK_Claude/reset-password.html` (nécessaire pour que les emails de réinitialisation de mot de passe fonctionnent).

### 4. Créer votre propre compte admin
Il n'existe aucun admin au départ — c'est volontaire, pour la sécurité. Pour créer le premier :
1. Allez sur `membres.html` sur votre site en ligne, créez un compte normalement (vous aurez le rôle `visiteur`).
2. Dans Supabase : **Table Editor → profiles**, trouvez votre ligne (par email), modifiez la colonne `role` en `admin` directement dans l'interface Supabase.
3. Reconnectez-vous sur le site : le lien **Administration** apparaît, vous pouvez désormais changer le rôle des autres utilisateurs depuis `admin.html`.

### 5. Confirmation email (optionnel)
Par défaut, Supabase envoie un email de confirmation à l'inscription. Vous pouvez désactiver cette étape dans **Authentication → Providers → Email → "Confirm email"** si vous préférez que les comptes soient actifs immédiatement (déconseillé si le site est public).

### Gestion des mots de passe
- **Un admin change son propre mot de passe** depuis `admin.html`, section "Mon compte" (fonctionne directement, sans email).
- **Un admin réinitialise le mot de passe d'un autre utilisateur** : bouton "Réinitialiser le mot de passe" sur chaque ligne de la table Utilisateurs. Cela envoie un email à cette personne avec un lien vers `reset-password.html`, où elle choisit elle-même son nouveau mot de passe. Un admin ne peut techniquement pas définir directement le mot de passe de quelqu'un d'autre depuis un site statique — cela nécessiterait d'exposer une clé secrète Supabase dans le code public, ce qui n'est jamais fait.

### Charte graphique
Le site reprend la charte du portail de gestion de tournoi (vert `#00b050` / `#006100`, cartes arrondies, police Arial). Toutes les couleurs sont centralisées en haut de `css/style.css`, dans `:root { ... }` — modifiez-les à un seul endroit pour ajuster l'ensemble du site.

### Pages ajoutées
- `membres.html` — connexion / inscription, puis contenu réservé aux profils ayant accès à la page `espace_membres`.
- `admin.html` — réservée aux profils ayant accès à la page `administration`. Trois sections :
  - **Profils** : créer des profils personnalisés (ex. "Bureau", "Compétiteur") et cocher les pages du site que chacun débloque.
  - **Utilisateurs** : voir tous les comptes et changer le profil de chacun.
  - **Invitations** : le site étant en inscription libre, vous ne pouvez pas créer un compte avec mot de passe à la place de quelqu'un (cela nécessiterait d'exposer une clé secrète Supabase dans le site public, ce qui n'est jamais fait). À la place, vous pré-attribuez un profil à un email : dès que cette personne s'inscrit elle-même, ce profil lui est attribué automatiquement au lieu de "Visiteur".

### Si votre projet Supabase existait déjà avant cette mise à jour
Exécutez en plus `supabase/migration_roles.sql` dans le SQL Editor (une seule fois). Il ajoute les profils configurables et les invitations sans toucher aux comptes déjà créés.

Pour activer la gestion des inscriptions saison, exécutez aussi `supabase/migration_inscriptions.sql` (une seule fois, après les deux précédents), puis `supabase/migration_inscriptions_colonnes.sql`.

Pour activer la gestion des tournois (étape 1 : types de compétition + création de tournoi), exécutez `supabase/migration_tournois_1.sql`.

### Ajouter une nouvelle page protégée
1. Choisissez une clé courte (ex. `resultats_tournoi`), ajoutez-la dans `PAGE_CATALOG` en haut de `js/admin.js` pour qu'elle apparaisse dans les cases à cocher des profils.
2. Sur la nouvelle page/table Supabase concernée, utilisez `current_user_has_access('resultats_tournoi')` dans la policy RLS de lecture (voir `annonces_membres` dans `schema.sql` comme modèle).
3. Côté front, vérifiez `access.pages.includes('resultats_tournoi')` avant d'afficher le contenu (voir `membres.js` comme modèle).

### Aller plus loin
Pour réserver d'autres contenus (résultats de tournoi, documents internes…), créez de nouvelles tables sur le même modèle que `annonces_membres` dans Supabase, avec une policy RLS `current_user_has_access('votre_page')`, puis interrogez-les depuis la page correspondante comme `membres.js` le fait pour les annonces.

## Inscriptions saison (page `inscriptions.html`)

Page réservée aux profils ayant accès à la page `inscriptions` (créez un profil "Bureau" depuis `admin.html` → Profils, et cochez "Inscriptions saison"). Elle permet d'enregistrer les adhérents de la saison 2026/2027 :

- **Champs fixes** (Nom, Prénom, Catégorie, Bad/Ping, UFOLEP/FSGT, Membre Bureau, Cotisation) : nécessaires au calcul automatique de la cotisation, non supprimables.
- **Champs personnalisés** (WhatsApp, Cotisation payée, Santé, Date certificat, Téléphone, Adresse, Email, Date de naissance, Commentaire, préconfigurés par défaut) : entièrement paramétrables depuis la section "Configuration" (visible uniquement par le profil admin) — ajout, suppression, changement de type (texte, nombre, date, oui/non, liste de choix) et de valeur par défaut. Techniquement, ces champs sont stockés de façon flexible (colonne `jsonb`) plutôt que par de vraies colonnes SQL ajoutées à la volée — cela évite de faire exécuter des modifications de schéma de base de données depuis le site, ce qui serait fragile et risqué depuis un navigateur.
- **Cotisation** : calculée automatiquement à partir du barème (Catégorie, Bad+Ping, UFOLEP/FSGT, Membre Bureau) dès que l'un de ces champs change, mais reste modifiable à la main avant enregistrement (bouton "Recalculer" disponible pour revenir au calcul automatique).
- **Barème des cotisations** (section Configuration, admin uniquement) : les 5 montants sont modifiables à tout moment ; ils ne s'appliquent qu'aux futurs calculs, pas rétroactivement aux inscriptions déjà enregistrées.
- **Colonnes affichées dans le tableau des inscrits** (section Configuration, admin uniquement) : cases à cocher pour choisir, parmi les champs fixes et personnalisés, lesquels apparaissent comme colonnes du tableau (la colonne "Nom" est toujours affichée). Ce choix est commun à tous les utilisateurs ayant accès à la page.

## Tournois (page `tournois.html`) — étape 1

Première étape de la gestion des tournois : deux nouveaux profils à créer depuis `admin.html` → Profils :
- **Tournois - Administration** (page `tournois_admin`) : gère le catalogue des types de compétition, crée/modifie/supprime les tournois.
- **Tournois - Gestion** (page `tournois_gestion`) : peut créer/modifier un tournoi (nom, cotisation, terrains, compétitions incluses, poules), mais ne peut pas gérer les types de compétition ni supprimer un tournoi.

Pour chaque tournoi, on choisit les compétitions incluses (Simple Homme, Double Dame…) par case à cocher, avec pour chacune le nombre de poules et le nombre d'équipes/participants par poule.

**À venir dans les prochaines étapes** : inscriptions par compétition et affectation aux poules, page d'émargement (présence + paiement), page matchs avec scores et classement de poule en direct, page planning (terrains, temps d'attente, filtre par équipe).

## Tester en local avant publication

Ouvrez simplement `index.html` dans un navigateur, ou lancez un petit serveur local :
```bash
python3 -m http.server 8000
```
puis ouvrez `http://localhost:8000`.
