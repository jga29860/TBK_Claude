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

Pour l'étape 2 (inscriptions par compétition + affectation aux poules), exécutez `supabase/migration_tournois_2.sql`.

Pour l'étape 3 (émargement), exécutez `supabase/migration_tournois_3.sql`.

Pour l'étape 4 (matchs de poule + classement en direct), exécutez `supabase/migration_tournois_4.sql`.

Pour l'étape 5 (planning), exécutez `supabase/migration_tournois_5.sql`.

Pour bloquer automatiquement les inscriptions une fois une compétition complète, exécutez `supabase/migration_tournois_6.sql`.

Pour la tête de poule, exécutez `supabase/migration_tournois_7.sql`.

Pour l'émargement par joueur (avec défaut "absent" à l'inscription), exécutez `supabase/migration_tournois_8.sql`.

Pour limiter le site à un seul tournoi actif à la fois, exécutez `supabase/migration_tournois_9.sql`.

Pour les phases finales (Principale / Consolante), exécutez `supabase/migration_tournois_10.sql`.

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

**À venir dans une prochaine étape** : les phases finales (Principale / Consolante) pourront faire l'objet d'une étape ultérieure si besoin.

## Inscriptions tournoi (page `tournoi-inscriptions.html`) — étape 2

Une fois un tournoi créé, cette page permet de sélectionner un tournoi puis une compétition, et de collecter les inscriptions :
- **Simple** : Nom + Club du joueur.
- **Double** : Nom + Club de chacun des deux joueurs (le champ "format" du type de compétition détermine automatiquement le nombre de joueurs demandés).
- **Affectation aux poules** : menu déroulant par équipe (Poule 1, Poule 2…), modifiable à tout moment. Un bouton "Répartir automatiquement en poules" distribue toutes les équipes de façon équilibrée en un clic (répartition simple, dans l'ordre d'inscription — à ajuster manuellement ensuite si besoin, par exemple pour équilibrer les niveaux).
- Deux compteurs rappellent le nombre d'équipes inscrites et le nombre de places prévues (poules × taille de poule).

## Émargement (page `emargement.html`) — étape 3

Troisième profil : **Tournois - Émargement** (page `tournois_emargement`), pensé pour être utilisé à l'accueil du tournoi le jour J. Les profils Administration et Gestion y ont aussi accès.

- **Bandeau du haut** (reste visible en défilant) : rappel de la cotisation du tournoi, recherche instantanée par nom ou club, compteur de présents / inscrits, montant total réglé — tous les trois recalculés en direct à chaque case cochée.
- **Liste par compétition**, une équipe par ligne : nom et club éditables directement (utile en cas de changement de dernière minute), 3 cases à cocher — Présent, Absent (mutuellement exclusives : cocher l'une décoche l'autre), Cotisation payée.
- Chaque case cochée est enregistrée immédiatement (pas de bouton "Enregistrer" séparé), pensé pour un usage rapide au fil des arrivées.
- Les compteurs comptent les **participants** (2 personnes pour une équipe de double, 1 pour une équipe de simple), alors que les cases à cocher s'appliquent à l'équipe entière (les deux membres d'un double sont marqués présents/payés ensemble).

## Poules & classement (page `poules.html`) — consultation uniquement

Sélectionnez un tournoi, avec des filtres optionnels par compétition et par poule, pour afficher le classement en direct de chaque poule. Cette page est **strictement en lecture** : aucune saisie de score, terrain ou autre n'y est possible (la saisie se fait exclusivement depuis `planning.html`).

- **Classement** : affiché en direct — Classement, Équipe, matchs joués, points (3 pour une victoire, 1 pour une défaite, uniquement si le match est décidé), différence de sets, différence de points. Le numéro de classement affiche au survol la valeur exacte (points×1000 + différence de sets×100 + différence de points) qui détermine l'ordre.
- **Matchs de la poule** : masqués par défaut pour garder l'affichage compact — un bouton "Afficher les matchs" par poule les révèle (scores, terrain, en lecture seule).
- **Filtres** : en plus du tournoi, deux menus déroulants permettent d'afficher une seule compétition et/ou une seule poule à la fois.

## Planning (page `planning.html`)

Sélectionnez un tournoi pour afficher son planning complet, toutes compétitions confondues (les terrains sont partagés entre toutes les compétitions du tournoi).

- **Bandeau du haut**, sur une seule ligne : à gauche les réglages (heure de début, rotation, temps minimum entre 2 matchs, filtre par équipe, durée moyenne, boutons de filtre, génération des matchs de poule par compétition), au centre les terrains, à droite le Top 5 attente. Tout est enregistré automatiquement.
- **Génération des matchs de poule** : choisissez une compétition dans le menu déroulant dédié puis cliquez sur "Générer / régénérer" — crée automatiquement tous les matchs en round-robin à partir des poules définies dans `tournoi-inscriptions.html`. Régénérer remplace les matchs existants (et leurs scores) après confirmation.
- **Terrains** : un bouton par terrain, vert si libre, saumon si occupé. Cliquer sur un terrain filtre la liste des matchs sur ce terrain.
- **Top 5 attente par compétition** : les équipes qui attendent depuis le plus longtemps depuis la fin de leur dernier match, par compétition. Cliquer sur une équipe filtre la liste des matchs sur cette équipe.
- **Matchs regroupés par rotation** (pleine largeur de page) : une rotation contient jusqu'à autant de matchs que de terrains disponibles. L'algorithme garantit qu'**aucune équipe ne joue deux fois dans une même rotation**, et sert en priorité les poules les moins avancées — à nombre de terrains suffisant, chaque poule obtient un match dès la première rotation, puis les rotations suivantes progressent équitablement poule par poule plutôt que de vider une compétition avant de passer à la suivante.
- **Un match n'est "lançable" que si les deux équipes sont libres ET présentes** (présence cochée en émargement — les deux joueurs pour une équipe de double). Le bouton "Lancer" est grisé sinon, avec une info-bulle indiquant la raison.
- **Statut par match** : Non lancé / En cours / Terminé, affiché en colonne. Les lignes des matchs terminés sont grisées (les scores restent modifiables). Les lignes des matchs non jouables pour le moment (équipe absente, équipe déjà en cours de match, aucun terrain libre) sont également grisées, avec le motif au survol.
- Le bouton **"Planning complet"** réinitialise aussi les filtres actifs (terrain, équipe) pour repartir sur une vue complètement dégagée.

**Simplifications assumées** : le lancement se fait via le bouton "Lancer" sur la ligne du match (qui prend automatiquement le terrain libre le plus bas), plutôt que par un clic direct sur le bouton du terrain suivi du choix du match. L'algorithme de rotation est un ordonnancement glouton équitable, pas une optimisation mathématique exacte — il respecte les deux contraintes demandées (pas de doublon d'équipe, équité entre poules) sans garantir un plan globalement optimal au sens strict.

## Blocage automatique des inscriptions complètes

Dès qu'une compétition atteint sa capacité (nombre de poules × taille de poule), les nouvelles inscriptions sont refusées — directement en base de données (une nouvelle tentative d'inscription est bloquée même si deux personnes s'inscrivent en même temps), et la page `tournoi-inscriptions.html` masque le formulaire avec un message "Compétition complète" dès que ce seuil est atteint. Les inscriptions déjà enregistrées restent modifiables (changement de poule, correction de nom/club) : seules les *nouvelles* inscriptions sont bloquées.

## Tête de poule, échange entre poules, affichage encadré

- **Tête de poule** : case à cocher par équipe dans `tournoi-inscriptions.html`. Un garde-fou en base garantit qu'il n'y a jamais plus d'une tête de poule par poule (cocher une équipe décoche automatiquement l'ancienne tête de poule de cette poule).
- **Assignation et échange de poule** : une équipe non encore affectée ne peut pas être assignée à une poule déjà complète (blocage avec message d'erreur, il faut choisir une poule avec de la place). Déplacer une équipe déjà affectée vers une autre poule : direct si la poule cible a de la place, ou échange obligatoire avec une équipe de la poule cible si celle-ci est déjà complète (le nombre d'équipes par poule reste ainsi toujours respecté). Aucune contrainte pour désassigner une équipe (case "—").
- **Affichage encadré par poule** : dans `tournoi-inscriptions.html` et `emargement.html`, les équipes sont regroupées visuellement dans un encadré par poule (avec le compteur d'équipes), plus un encadré "Non assignées" pour les équipes en attente d'affectation.

## Filtre "absents" en émargement

Sur `emargement.html`, à côté de la recherche par nom/club, un bouton "Afficher uniquement les absents" filtre la liste sur les équipes cochées "Absent". Se combine avec la recherche texte ; les poules sans résultat correspondant sont masquées le temps du filtre pour rester lisible.

## Un seul tournoi actif à la fois

Le site ne gère qu'un tournoi "en cours" simultanément — garanti au niveau de la base de données (impossible de créer un deuxième tournoi actif, y compris en cas d'action concurrente).

- **Création** : un nouveau tournoi est automatiquement "en cours". La création est bloquée (avec message clair) tant qu'un tournoi est déjà actif — il faut d'abord le clôturer.
- **Clôture** : bouton "Clore" sur `tournois.html`, disponible pour les profils Administration et Gestion. Un tournoi clôturé n'est plus modifiable comme actif.
- **Réactivation** : bouton "Réactiver" sur un tournoi clôturé, visible uniquement si aucun autre tournoi n'est actuellement en cours.
- **Pages simplifiées** : `tournoi-inscriptions.html`, `emargement.html`, `poules.html` et `planning.html` n'ont plus de sélecteur de tournoi — elles chargent automatiquement le tournoi en cours. Un message clair s'affiche si aucun tournoi n'est actif.

## Synthèse Phase finale (page `phase-finale.html`)

Vue de consultation, complémentaire à `planning.html` : présente la phase finale sous forme de tableau à élimination directe classique, en colonnes par tour (1/8 de finale, 1/4, 1/2 finale, Finale…), par compétition puis par phase (Principale / Consolante).

- **Lecture seule** : aucune saisie de score ni lancement de match — uniquement pour visualiser la progression.
- **Mise à jour automatique** : rechargée toutes les 20 secondes, elle reflète les scores saisis et les vainqueurs propagés depuis `planning.html`, sans avoir besoin de rafraîchir la page.
- **Équipe gagnante en surbrillance verte**, score résumé (ex. "21-15, 21-12") et statut (À venir / En cours / Terminé / En attente d'une équipe) sur chaque carte de match.
- Un tour affiche "À déterminer" pour les équipes pas encore connues (matchs futurs dépendant d'un résultat pas encore joué).

## Phases finales (Principale / Consolante)

**Génération automatique** : dès que tous les matchs de poule d'une compétition sont terminés, sa phase finale (Principale + Consolante) est générée automatiquement — au moment où le dernier score est saisi, ou à l'ouverture de la page si les poules étaient déjà terminées. Il n'y a plus de bouton de génération manuelle ; une génération n'a lieu qu'une seule fois par compétition (elle n'écrase pas une phase finale déjà générée).

- **Qualification** : 1er et 2e de chaque poule → Phase Principale ; 3e et 4e → Phase Consolante. Ce découpage (top 2 / reste) n'est pas paramétrable.
- **Appariement du 1er tour** : un 1er de poule affronte un 2e d'une **autre** poule (jamais celui de sa propre poule) ; même principe pour le 3e vs 4e en Consolante.
- **Élimination directe ensuite** : les tours suivants sont créés à l'avance sous forme de cases vides, reliées entre elles ; dès qu'un score complet (2 sets gagnants) est saisi sur un match, le vainqueur est **automatiquement inséré** dans le match du tour suivant qui lui correspond.
- **Présentation par rotation équitable** : les matchs de phase finale (dont les 2 équipes sont déjà connues) sont regroupés en rotations selon le même principe que les matchs de poule — jusqu'à autant de matchs que de terrains, aucune équipe deux fois dans la même rotation, et répartition équitable entre compétitions et phases (Principale/Consolante) plutôt que de vider un tableau avant de passer au suivant. Une colonne "Compétition" précise, sur chaque ligne, la compétition, la phase (Principale/Consolante) et le tour concernés — nommé selon le nombre d'équipes encore en lice (1/8 de finale pour 16, 1/4 de finale pour 8, 1/2 finale pour 4, Finale pour 2).
- **Matchs de poule repliables** : l'en-tête "Matchs par rotation" propose un bouton "Plier / déplier". Une fois tous les matchs de poule terminés, la section se replie automatiquement par défaut (peut être rouverte manuellement à tout moment).

**Limite assumée** : l'algorithme construit un tableau à élimination directe propre quand le nombre de poules est une puissance de 2 (2, 4, 8, 16…), ce qui couvre le cas type (8 poules → 16 qualifiés en Principale, tableau parfait jusqu'à la finale). Avec un nombre de poules qui n'est pas une puissance de 2, certaines cases du tableau peuvent rester vides faute de gestion automatique des "exemptions" (byes) — à vérifier manuellement dans ce cas de figure.

## Saisie des scores au clavier (Planning)

- **Clic unique** sur une case de score : le contenu existant est automatiquement sélectionné, prêt à être remplacé sans avoir à l'effacer.
- **Tab** pour passer à la case suivante fonctionne normalement, y compris juste après une saisie : le focus est désormais préservé lors du rechargement automatique de la page qui suit chaque score enregistré (recalcul du classement, des vainqueurs, etc.) — auparavant, ce rechargement pouvait faire perdre la case en cours d'édition.

## Bandeau de navigation simplifié

Le bandeau du haut accumulait trop de liens au fil des ajouts (chaque page outil affichait ses propres liens statiques, plus les liens injectés dynamiquement pour chaque profil). Simplification :

- Chaque page outil n'affiche plus qu'un seul lien statique ("Le club", retour à l'accueil).
- Un menu déroulant unique **"Organisation ▾"** apparaît dans le bandeau dès qu'un profil connecté a accès à au moins une page outil, regroupant tout par catégorie : **Club** (Inscriptions saison), **Tournoi** (Tournois, Inscriptions tournoi, Émargement, Poules, Phase finale, Planning), **Administration**. Seules les pages auxquelles le profil a réellement accès apparaissent.
- Sur mobile, le menu s'affiche directement déplié dans la navigation (pas de double clic nécessaire).
- Le lien "Connexion" en double dans certaines pages a été retiré (déjà géré par l'indicateur d'état de connexion), et deux liens morts vers d'anciennes sections supprimées (Créneaux, Contact) ont été corrigés sur `membres.html`.

## Validation des inscriptions saison par le bureau + demande publique

Exécutez `supabase/migration_inscriptions_validation.sql` pour activer cette évolution.

- **Statut de chaque inscription** : "En attente" ou "Validée", affiché en badge sur `inscriptions.html`.
- **Saisie directe par un membre connecté** : automatiquement marquée "Validée" (il vous engage directement), avec votre nom et la date enregistrés.
- **Bouton "Valider"** : réservé au profil dont la clé est exactement `bureau` (à créer depuis `admin.html` → Profils si besoin), ou à un profil ayant accès à l'administration. Valider enregistre qui (nom) et quand (date/heure) — consultable au survol du badge "Validée".
- **Formulaire public** (`inscription-publique.html`) : accessible à n'importe qui, sans connexion. Une personne extérieure y remplit son nom, prénom, catégorie, Bad/Ping, UFOLEP/FSGT et tous les champs personnalisés configurés (hors "Membre Bureau", réservé à un usage interne). La cotisation affichée est une estimation indicative ; le bureau la confirme à la validation. Toute demande soumise ainsi arrive avec le statut "En attente".
- **QR code** sur `index.html` (section "Envie de nous rejoindre ?") pointant vers `inscription-publique.html` — généré via le service gratuit [api.qrserver.com](https://api.qrserver.com), calculé automatiquement à partir de l'URL réelle du site (fonctionne quel que soit le nom de domaine/dépôt).

## Logo du club

Le logo (mascotte) fourni est intégré sur toutes les pages : version recadrée en rond dans l'en-tête (`images/logo-tbk-rond.png`, généré automatiquement à partir de l'image d'origine, fond transparent en dehors du cercle) et en favicon d'onglet. La version complète (`images/logo-tbk.png`) est affichée en plus grand format en haut de la page de demande d'inscription publique.

## Champs masqués sur le formulaire public d'inscription

Sur `inscription-publique.html`, les champs **WhatsApp**, **Cotisation payée**, **Santé** et **Date certificat** ne sont plus proposés — ils seront renseignés par le bureau au moment de la validation de la demande, pas par la personne qui la soumet. Un bandeau d'information rappelle explicitement que la demande sera validée une fois la cotisation réglée et un certificat médical ou un QS Sport fourni.

## Connexion par nom d'utilisateur (sans email)

Sur `membres.html`, les champs "Email" acceptent désormais aussi un simple nom d'utilisateur (ex. "jgael"). Techniquement, Supabase n'authentifie qu'avec un email : un email technique invisible est généré automatiquement (`jgael@tbk-club.interne`), la personne ne le voit jamais et ne saisit que son nom d'utilisateur. Une vraie adresse email reste utilisable normalement, au choix.

**Prérequis indispensable** : dans Supabase → Authentication → Providers → Email, désactivez **"Confirm email"**. Un email technique ne peut jamais recevoir de vraie confirmation ; sans cette désactivation, un compte créé par nom d'utilisateur resterait bloqué indéfiniment.

**Limites à connaître pour un compte "nom d'utilisateur"** :
- Pas de "mot de passe oublié" par email (impossible d'envoyer un email à une adresse qui n'existe pas). Le changement de mot de passe de quelqu'un d'autre passe alors uniquement par Supabase → Authentication → Users → cet utilisateur → "Reset password" (l'action reste réservée au titulaire du projet Supabase, pas à l'admin du site).
- Le tableau des utilisateurs sur `admin.html` affiche "(nom d'utilisateur)" à côté de ces comptes, et masque le bouton de réinitialisation par email pour eux (remplacé par cette indication).
- Le nom affiché partout sur le site (bandeau, validations d'inscription…) reste le nom d'utilisateur choisi — aucune différence visible pour la personne connectée.

## Suppression d'utilisateurs par l'administrateur

Exécutez `supabase/migration_suppression_profils.sql` pour activer cette fonctionnalité.

Sur `admin.html` → Utilisateurs, un bouton **"Supprimer"** apparaît en bout de ligne pour chaque utilisateur (sauf sur votre propre compte, pour éviter de vous verrouiller vous-même hors du site).

**Ce que ça fait réellement** : cela supprime le *profil* (rôle, droits d'accès) de la personne — elle perd immédiatement tout accès au site, comme si son compte n'existait plus pour l'application. **Cela ne supprime pas son compte de connexion Supabase sous-jacent** (ses identifiants email/mot de passe), ce qui nécessiterait une clé secrète jamais exposée dans le code du site. Si vous voulez aussi supprimer complètement ce compte de connexion, faites-le depuis Supabase → Authentication → Users → cet utilisateur → Delete.

## Autres changements de ce tour

- **"Espace membres" renommé en "Connexion"** partout sur le site (page, titre, liens de navigation).
- **Sections retirées de la page d'accueil** : Créneaux, Rejoindre, Contact (et leurs liens de navigation). Le bouton "S'inscrire au tournoi" pointe désormais vers un email plutôt que vers la section Contact supprimée.
- **Boutons rendus plus rectangulaires** : coins moins arrondis sur les boutons principaux et sur les pastilles de navigation (Administration, Inscriptions, etc.), pour un rendu plus net et cohérent.
- **Titres dynamiques** : `tournoi-inscriptions.html`, `emargement.html`, `poules.html` et `planning.html` affichent désormais le nom du tournoi en cours dans leur titre de page.

## Autres ajustements Planning / affichage des résultats

- **Bouton "Lancer" visuellement grisé** quand un match n'est pas lançable (en plus d'être désactivé), pour que l'indisponibilité soit repérable au premier coup d'œil.
- **Équipe gagnante mise en évidence** (fond vert clair) partout où un match terminé est affiché — `planning.html` et `poules.html`.
- **Popup d'avertissement au lancement** : si l'une des deux équipes a terminé son match précédent depuis moins longtemps que le "Temps min. entre 2 matchs" configuré, une confirmation s'affiche avant de lancer, avec le détail de l'équipe concernée et le temps réellement écoulé — l'organisateur peut choisir de lancer quand même.

## Émargement par joueur, filtres poules, matchs par rotation

- **Par défaut à l'inscription** : chaque joueur est enregistré "absent" et "cotisation non payée" — l'émargement consiste ensuite à cocher présent/payé au fur et à mesure des arrivées.
- **Émargement par joueur** : sur `emargement.html`, chaque joueur d'une équipe (les deux en double) a désormais ses propres cases Présent / Absent / Cotisation payée, au lieu d'un seul jeu de cases pour toute l'équipe. Les compteurs du bandeau du haut comptent les joueurs individuellement.
- **Filtres compétition et poule** sur `poules.html` : en plus du tournoi, deux menus déroulants permettent d'afficher une seule compétition et/ou une seule poule à la fois.
- **Matchs regroupés par rotation** sur `planning.html` : une rotation correspond à autant de matchs que de terrains disponibles. Les matchs déjà lancés sont regroupés selon leur ordre réel de lancement, les matchs à venir selon l'estimation proportionnelle déjà en place. Chaque rotation est présentée dans un encadré avec son heure estimée.
- **Un match n'est "lançable" que si les deux équipes sont libres ET présentes** (présence cochée en émargement — les deux joueurs pour une équipe de double). Le bouton "Lancer" est grisé sinon, avec une info-bulle indiquant la raison (équipe déjà en jeu, équipe non présente, ou aucun terrain libre).

## Scripts SQL utilitaires

- `supabase/init_tournoi_dm_dh.sql` : crée un tournoi réel "Tournoi 2026-2027" avec Double Dame (8 poules de 4) et Double Homme (4 poules de 4), sans équipe fictive — prêt à recevoir les vraies inscriptions.
- `supabase/test_tournoi_dm_dh.sql` : à exécuter après le précédent — remplit ce même tournoi avec 48 participants fictifs par défaut, déjà répartis en poules, pratique pour tester émargement/matchs/planning avant d'y insérer les vraies inscriptions. Rejouable sans risque (repart de zéro sur ces 2 compétitions à chaque exécution).

## Tester en local avant publication

Ouvrez simplement `index.html` dans un navigateur, ou lancez un petit serveur local :
```bash
python3 -m http.server 8000
```
puis ouvrez `http://localhost:8000`.
