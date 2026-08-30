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

## Agenda du club (page `agenda.html`)

Exécutez `supabase/migration_agenda.sql` pour accorder l'accès au profil admin existant.

Affiche l'agenda Google du club en vue mensuelle, avec ajout/modification/suppression d'événements directement depuis le site, via l'API Google Calendar.

- **Réservé au profil administrateur** pour l'instant (nouveau droit de page `agenda`, extensible à d'autres profils comme les autres pages).
- **Calendrier utilisé** : celui de l'adresse email de contact du club, paramétrée dans Admin → Paramètres du site (pas de configuration séparée à maintenir).
- **Connexion Google** : le site tente automatiquement une reconnexion silencieuse (sans fenêtre ni clic) à chaque ouverture de la page, tant que votre session Google est active et que l'autorisation n'a pas expiré. Le bouton "Se connecter à Google Agenda" ne s'affiche que si cette tentative échoue (première utilisation, ou autorisation expirée après 7 jours en mode Test Google — limite imposée par Google pour les applications non validées, pas par le site).
- **Ajout d'événement** : bouton "+" sur n'importe quel jour de la grille.
- **Modifier/supprimer** : cliquez sur un événement existant. Pour un événement qui fait partie d'une série récurrente, deux boutons distincts apparaissent : "Supprimer cette occurrence" (uniquement cette date) et "Supprimer toute la série" (toutes les occurrences, passées et futures).
- Champs disponibles : titre, journée entière ou horaires précis, lieu, description, **périodicité** (aucune, tous les jours, toutes les semaines, toutes les 2 semaines, tous les mois, tous les ans — avec une date de fin facultative). La périodicité ne se règle qu'à la création : pour modifier la récurrence d'une série déjà existante, faites-le directement dans Google Agenda (édition d'une série récurrente = cas particulier volontairement non géré ici, pour rester simple et fiable).

**Prérequis technique (déjà fait pour vous)** : un identifiant client OAuth Google a été configuré dans `js/google-config.js`. Si vous changez un jour de projet Google Cloud, il faudra régénérer cet identifiant et l'y remplacer.

## Email de contact paramétrable

Exécutez `supabase/migration_parametres_site.sql` pour activer cette évolution.

- Nouvelle section **"Paramètres du site"** sur `admin.html`, réservée au profil administrateur : un champ "Email de contact du club", modifiable et enregistré immédiatement.
- Le bouton "S'inscrire au tournoi" de `index.html` utilise désormais cette adresse dynamiquement (récupérée depuis la base à chaque chargement de la page) au lieu d'une adresse codée en dur.
- Cette table `parametres_site` (clé/valeur) peut accueillir d'autres réglages du même type à l'avenir (même modèle que `bareme_cotisations`).

## Notification des demandes d'inscription en attente

Pour les profils dont la clé est exactement `bureau` ou `admin`, un badge rouge **"X demande(s) en attente"** apparaît automatiquement dans le bandeau, sur **toutes les pages du site** dès qu'au moins une inscription saison a le statut "En attente". Cliquer dessus mène directement à `inscriptions.html`. Le badge disparaît de lui-même dès qu'il n'y a plus de demande en attente.

## Gestion des annonces du club depuis le site (Admin + Bureau)

Exécutez `supabase/migration_gestion_annonces.sql` pour activer cette évolution.

Sur `membres.html`, un panneau **"Gérer les annonces"** apparaît désormais pour tout profil ayant le nouveau droit de page **"Annonces du club"** — pré-accordé automatiquement aux profils `admin` et `bureau` s'ils existent déjà, modifiable ensuite comme n'importe quel autre droit depuis Admin → Profils. Permet de publier, modifier et supprimer des annonces directement depuis le site, sans passer par Supabase.

## Documentation fonctionnelle en ligne (page `documentation.html`)

Exécutez `supabase/migration_documentation_droit.sql` pour activer le nouveau droit de page.

Accès désormais **paramétrable par profil** (nouveau droit "Documentation" dans le catalogue des pages, Admin → Profils), pré-accordé au profil admin par défaut. Reprend le contenu du document Word de documentation fonctionnelle, mis en forme dans le style du site, avec sommaire à ancres pour naviguer rapidement dans les 12 sections (vue d'ensemble, comptes/profils, pages publiques, espace membres, inscriptions saison, gestion des tournois en détail, administration, agenda, sauvegarde, jeu de cartes, base de données, glossaire).

**Mise à jour** : cette page est un contenu statique, tenu à jour manuellement à chaque nouvelle fonctionnalité construite — comme le README technique, mais formulé pour un public non-développeur. Pas de mise à jour automatique possible sur un site statique.

## Menu Organisation — indentation visuelle

Les liens du menu "Organisation" sont désormais indentés sous leur libellé de groupe (Club, Tournoi, Administration), avec un petit repère vertical au survol, pour mieux montrer la hiérarchie quand la liste s'allonge.

## Connexion Google Agenda — moins de clics

Le bouton "Se connecter à Google Agenda" ne repasse plus systématiquement par l'écran complet de sélection de compte et de validation des droits : une fois l'autorisation déjà accordée une première fois, un clic suffit généralement pour revenir directement sur l'agenda (l'écran complet ne réapparaît que lors de la toute première connexion, ou après expiration de l'autorisation).

## Contrôle sur la validation des inscriptions saison

Le bouton "Valider" n'est activable que si les 3 conditions sont réunies : cotisation payée, santé différente de "En Attente", et date de certificat renseignée. Sinon, le bouton reste visible mais grisé, avec le motif précis au survol (ex. "Validation impossible : cotisation non payée, santé en attente"). La confirmation avant suppression d'une inscription existait déjà (vérifié, aucune modification nécessaire sur ce point).

## Sauvegarde manuelle des données (page `sauvegarde.html`)

Exécutez `supabase/migration_lecture_admin_sauvegarde.sql` pour garantir un export toujours complet.

Réservée au profil administrateur. Liste toutes les tables du modèle avec leur nombre de lignes actuel, permet d'en sélectionner une ou plusieurs, puis génère et télécharge un fichier `.sql` contenant les instructions `insert` nécessaires pour réinjecter les données sélectionnées.

- **Ordre des tables toujours respecté** (indépendamment de l'ordre de sélection) pour éviter les problèmes de contraintes entre tables liées (ex. profils avant utilisateurs, tournois avant équipes).
- Le fichier généré neutralise temporairement les contraintes pendant la réinjection (`session_replication_role`), en filet de sécurité supplémentaire.
- **Important** : le plan gratuit de Supabase n'inclut aucune sauvegarde automatique native. Cette page comble ce manque via un export à la demande — pensez à l'utiliser régulièrement (par exemple avant/après la période d'inscriptions ou un tournoi), et à conserver les fichiers générés dans un endroit sûr (ils contiennent des données personnelles de membres).
- Pour restaurer : ouvrez Supabase → SQL Editor, collez ou importez le contenu du fichier, exécutez.

## Jeu de cartes (page `jeu-de-cartes.html`) — v2 : tirage plein écran

Exécutez `supabase/migration_jeu_cartes_droit.sql` pour activer le nouveau droit de page.

Accès désormais **paramétrable par profil** (nouveau droit "Jeu de cartes" dans le catalogue des pages, Admin → Profils), pré-accordé au profil admin par défaut. Peut donc être ouvert à d'autres profils (ex. Bureau, Gestion tournoi) sans leur donner accès à toute l'administration.

- **Terrains minimisés** : les rangs utilisés pour les quadruples sont toujours les premiers dans l'ordre (1, 2, 3…), jamais choisis au hasard parmi les 10 — pour 16 joueurs, seuls les terrains 1 à 4 sont mobilisés, jamais un terrain 7 ou 9 par exemple. Seul l'ordre de tirage (qui reçoit quelle carte) reste aléatoire.

- **En-tête compact** : titre + nombre de joueurs + bouton "Créer la session" sur une seule ligne.
- **Cartes numérotées de 1 à 10** — le chiffre correspond directement au numéro de terrain (plus pratique qu'un jeu de cartes classique à 13 rangs). Toujours 4 couleurs par chiffre (♠♥♦♣) pour former les équipes Rouge/Noir dans les quadruples.
- **Tirage séquentiel plein écran** : un gros bouton "Carte" fixé en bas de l'écran révèle, à chaque appui, la carte du joueur suivant en grand, avec une petite animation. Le joueur regarde son terrain et sa couleur, passe le téléphone au suivant.
- **Message contextuel sous la carte** selon le nombre de joueurs partageant ce chiffre : "Rouge contre Noir" pour un quadruple (4), "match en simple" pour un duo (2), "2 matchs à 11 points à organiser" pour un trio (3).
- **Joker** : la personne qui, seule, ne peut pas être casée dans un quadruple (reste = 1) reçoit une carte Joker distincte ("Tu passes ton tour ce round").
- **Plus de tableau récapitulatif** : chaque personne découvre uniquement sa propre carte ; le regroupement se fait naturellement en comparant les chiffres entre joueurs, dans l'esprit d'un vrai tirage au sort en direct.
- Jusqu'à 41 joueurs (10 terrains × 4 + 1 Joker).

## Photo du certificat médical + actions optimisées mobile (inscriptions.html)

Exécutez `supabase/migration_certificat_medical.sql` pour créer le stockage sécurisé.

- **Bouton "📷 Certificat"** sur chaque demande d'inscription : ouvre l'appareil photo du téléphone (ou la galerie sur ordinateur), envoie la photo dans un espace de stockage **privé** dédié, et la lie automatiquement à cette inscription. Une fois envoyée, un bouton "Voir le certificat" apparaît (lien temporaire valable 2 minutes, généré à la demande — le fichier n'est jamais rendu public).
- **Accès conservé indéfiniment** : la photo elle-même n'est jamais supprimée automatiquement ; seul le lien de visualisation expire après 2 minutes (sécurité), un nouveau lien se génère à chaque clic sur "Voir le certificat", à tout moment (admin et bureau peuvent y accéder autant de fois que nécessaire, y compris après plusieurs mois). La date d'envoi s'affiche à côté du bouton, avec un avertissement "⚠️ à renouveler bientôt" quand le certificat approche de sa fin de validité d'1 an.
- **Suppression manuelle** : un bouton "Supprimer le certificat" retire définitivement la photo du stockage et la déchaîne de l'inscription (avec confirmation).
- **Affichage optimisé PC + mobile** : sur grand écran, les boutons d'action s'agencent en ligne compacte (plusieurs par rangée) pour ne pas allonger inutilement le tableau ; sur mobile, ils repassent en pile verticale pleine largeur, plus faciles à toucher.
- **Fiches dépliables sur mobile** : sur petit écran, le tableau des inscriptions devient une liste de fiches compactes (juste le nom visible). Un tap sur un nom déplie la fiche complète — toutes les colonnes affichées verticalement avec leur libellé, suivies des boutons d'action — bien plus lisible qu'un tableau large à faire défiler horizontalement.
- **Accès au stockage réservé** aux mêmes personnes qui ont déjà accès à la page Inscriptions (même droit de page, aucune configuration supplémentaire à faire).
- **Actions en colonne verticale** sur toutes les tailles d'écran (Valider, 📷 Certificat, Voir le certificat, Modifier, Supprimer) au lieu d'une rangée compressée horizontalement — boutons plus grands et plus faciles à toucher sur mobile.

## Connexion — redirection directe vers l'accueil

Une fois identifiants et mot de passe validés avec succès sur membres.html, la page redirige désormais automatiquement vers l'accueil (index.html) au lieu de simplement se recharger sur place.

## Mot de passe oublié — auto-service pour les utilisateurs

Sur membres.html, un lien "Mot de passe oublié ?" sous le formulaire de connexion permet à n'importe quel utilisateur (pas seulement l'admin) de demander lui-même un email de réinitialisation, sans intervention du bureau. Fonctionne uniquement pour les comptes créés avec une vraie adresse email (les comptes par nom d'utilisateur restent à réinitialiser par un administrateur, faute d'adresse email réelle à laquelle envoyer le lien).

## Harmonisation vers le nom d'utilisateur comme identifiant principal

- **Libellés des formulaires** : "Nom d'utilisateur (ou email)" au lieu de "Email ou nom d'utilisateur" sur membres.html (connexion et création de compte), pour refléter l'usage réel du site.
- **Colonne "Identifiant"** (au lieu de "Email") dans le tableau des utilisateurs sur admin.html — reste juste que le compte soit basé sur un email ou un simple nom d'utilisateur.
- **Message d'erreur clair** à l'inscription si l'identifiant existe déjà ("Ce nom d'utilisateur (ou cet email) existe déjà...") au lieu du message technique brut de Supabase. L'unicité elle-même était déjà garantie nativement par Supabase (aucune migration nécessaire) : cette amélioration ne concerne que la clarté du message affiché.
- **"Mon compte" accessible à tout utilisateur connecté** (pas seulement l'admin) : nouvelle section sur membres.html permettant à n'importe qui de changer son propre mot de passe, quel que soit son profil (même un simple visiteur). Auparavant, seul un compte avec accès à l'administration pouvait changer son propre mot de passe.

## Bandeau simplifié une fois connecté + réinitialisation de mot de passe repensée

- **Bandeau une fois connecté** : le lien "Connexion" a disparu (inutile une fois connecté), ne reste que "Se déconnecter". Cliquer sur son propre nom/profil dans le bandeau mène directement à "Mon compte" (membres.html), pour ne rien perdre en accessibilité.
- **Mot de passe oublié** : le formulaire accepte maintenant nom d'utilisateur ou email. Avec une vraie adresse email : lien de réinitialisation envoyé automatiquement, comme avant. Avec un simple nom d'utilisateur (pas d'email associé) : la messagerie de la personne s'ouvre avec un email pré-rempli adressé au contact du club (paramétré dans Admin → Paramètres du site), prêt à envoyer — le bureau reçoit la demande et réinitialise manuellement depuis Supabase.
- **Réinitialisation depuis admin.html pour les comptes techniques** : le message texte a été remplacé par un bouton "Réinitialiser via Supabase →", qui ouvre directement la fiche du bon utilisateur dans Supabase (recherche pré-remplie), en un clic depuis la page Utilisateurs. La modification effective du mot de passe reste une action Supabase (bouton "Reset password" une fois sur place) : aucune clé secrète n'est ni ne sera exposée dans le navigateur pour des raisons de sécurité — voir la documentation (section 2.5) pour le mode opératoire complet.

## Agenda du club — vue liste sur mobile

Sur téléphone, la grille mensuelle (7 colonnes trop étroites pour rester lisible) est remplacée par une **liste verticale** : seuls les jours ayant des événements sont affichés, chacun avec son titre en taille normale, ses horaires, et son lieu si renseigné. La grille classique reste inchangée sur PC, où l'espace disponible la rend parfaitement lisible. Le formulaire d'ajout/modification et le bouton "+" par jour fonctionnent identiquement dans les deux vues.

## Agenda du club — connexion directe au bon compte Google

Correction : la connexion à Google Agenda passait systématiquement par l'écran de sélection de compte (quand plusieurs comptes Google sont connectés dans le même navigateur), même en cliquant sur "Se connecter". Le compte de l'agenda du club étant déjà connu du site (email de contact paramétré), il est maintenant transmis directement à Google via le paramètre "hint" — la connexion se fait droit sur ce compte, sans repasser par l'étape de sélection à chaque fois (tant que ce compte est déjà connecté sur l'appareil).

## Agenda du club — correction du blocage sur mobile

Correction d'un vrai bug : sur mobile, cliquer sur "Se connecter à Google Agenda" ouvrait un nouvel onglet qui restait parfois bloqué sans jamais revenir sur le site (le mécanisme de Google censé refermer automatiquement cet onglet est peu fiable sur les navigateurs mobiles). **Sur mobile uniquement**, la connexion manuelle passe désormais par une redirection de page classique (Google s'affiche sur la même page, puis revient directement sur l'agenda) au lieu d'ouvrir un second onglet. **Sur PC, le comportement reste inchangé** (fenêtre de connexion classique, qui fonctionnait déjà bien). La reconnexion automatique et silencieuse au chargement de la page reste également inchangée, sur les deux.

**Réglage Google Cloud requis** (uniquement pour que la connexion manuelle fonctionne sur mobile) : ajoutez l'URL exacte de la page agenda (ex. `https://jga29860.github.io/TBK_Claude/agenda.html`, sans slash final) dans Google Auth Platform → Clients → votre client OAuth → "URI de redirection autorisés".

## Correction d'un bug d'affichage global (attribut "hidden" ignoré)

Bug identifié sur membres.html : la section Connexion/Créer un compte restait visible même une fois connecté, alors que le code JavaScript la masquait correctement. Cause réelle : certaines classes CSS du site (ex. `.auth-panels{ display:grid; }`) prenaient le pas sur la règle par défaut du navigateur pour l'attribut `hidden`, qui n'a normalement pas priorité sur les styles définis par le site. Une règle globale (`[hidden]{ display:none !important; }`) garantit désormais que `hidden` fonctionne partout sur le site, quelle que soit la classe présente sur l'élément — corrige ce problème sur membres.html et prévient qu'il se reproduise ailleurs.

## Inscriptions saison — optimisation de l'affichage PC

- La 1ère colonne du tableau (déjà "Nom Prénom" combinés) est désormais intitulée "Nom Prénom" au lieu de "Nom".
- La colonne "Prénom" séparée a été retirée (devenue redondante depuis qu'elle apparaît déjà combinée en 1ère colonne).
- La colonne "Whatsapp" ne s'affiche plus par défaut (reste sélectionnable à nouveau depuis Configuration si besoin).
- Nécessite `supabase/migration_retrait_colonnes_inscriptions.sql` pour que le changement s'applique sans repasser par l'écran Configuration.

## Agenda du club — filet de sécurité si la connexion automatique reste bloquée

Correction d'un cas où la reconnexion automatique restait bloquée indéfiniment sur "Connexion automatique en cours…" sans jamais rien afficher d'autre (Google ne répondant parfois jamais, par exemple si les cookies tiers sont bloqués par le navigateur). Un délai de 6 secondes force désormais la réapparition du bouton de connexion manuelle si Google ne répond pas à temps, avec un message explicite.

## Refonte complète des annonces du club — fil d'actualité

Exécutez `supabase/migration_annonces_v2.sql` pour créer les nouvelles tables et le stockage.

Les annonces deviennent un vrai fil d'actualité, dans le style des réseaux sociaux :

- **Auteur et date** sur chaque annonce (et chaque commentaire), avec avatar (initiales).
- **Commentaires en fil de discussion indenté** : tout membre peut réagir à une annonce par un commentaire, et répondre à un commentaire existant (réponses imbriquées, indentation visuelle progressive).
- **Suppression individuelle** : chaque personne peut retirer ses propres annonces/commentaires (le bureau/admin peut aussi tout retirer, pour la modération).
- **Réactions** : 👍 like, 👎 dislike, ❤️ coup de cœur, sur une annonce ou un commentaire — une seule réaction active par personne et par élément (recliquer la retire, cliquer une autre la remplace). Compteur affiché à côté de chaque réaction.
- **Pièces jointes** : image ou fichier joignable à une annonce comme à un commentaire, stockées dans un espace privé réservé aux membres (accès temporaire généré à la demande, jamais d'URL publique).
- **Plier/déplier les commentaires** : chaque annonce affiche un bouton "💬 X commentaires ▼/▲" pour révéler ou masquer le fil, en gardant l'affichage compact par défaut.
- **Tri du plus récent au plus ancien**, en haut de la liste.

L'écran de gestion séparé ("Gérer les annonces") a été fusionné avec l'affichage principal : les personnes autorisées (droit "annonces") voient le formulaire de publication/modification directement au-dessus du fil, sans double affichage.

## Optimisation mobile — Tournois, Inscriptions tournoi, Émargement

- **tournois.html** : le tableau "Tournois existants" devient une liste de fiches sur mobile (Nom + Statut visibles directement) ; un tap sur le nom déplie la fiche pour voir cotisation, terrains, compétitions, date et actions. Comportement identique à celui déjà en place sur inscriptions.html.
- **tournoi-inscriptions.html** : le tableau des équipes (Équipes inscrites + Non assignées) suit le même principe — les deux joueurs d'une équipe apparaissent combinés en identité de ligne, le reste (clubs, tête de poule, poule, actions) se déplie au tap. Beaucoup plus lisible sur petit écran qu'un tableau à 7 colonnes.
- **emargement.html** : les champs et cases à cocher de chaque joueur sont désormais regroupés dans un seul bloc compact (au lieu de 5 colonnes séparées par joueur), avec Présent/Absent/Payée sous forme de grands boutons "pilule" à toucher directement — plus besoin de viser une petite case à cocher. Les deux joueurs d'une équipe s'empilent verticalement sur mobile, ce qui supprime le défilement horizontal. La recherche couvrait déjà les deux joueurs et les deux clubs d'une équipe (vérifié, aucune modification nécessaire sur ce point précis).

## Bénévoles du tournoi (page `tournoi-benevoles.html`)

Exécutez `supabase/migration_benevoles.sql` pour créer les tables et étendre les droits nécessaires.

Nouvelle page dédiée au tournoi actif, avec un nouveau droit de page **"Bénévoles tournoi"** paramétrable comme les autres (Admin → Profils).

- **Postes configurables** : les organisateurs (droits "Tournois - Administration" ou "Tournois - Gestion") peuvent ajouter, modifier, supprimer des postes (nom, horaire facultatif, description facultative, nombre de places nécessaires) — ex. "Mise en place de la salle", "Buvette", "Gérer les arrivées".
- **Inscription libre** : toute personne ayant accès à la page peut s'inscrire ou se désinscrire d'un poste tant qu'il reste des places ; la liste des inscrits est visible par tous. Au moment de s'inscrire, un petit champ de saisie (pré-rempli avec le nom du compte connecté, modifiable) permet d'indiquer le nom et prénom réels à afficher — pratique pour les comptes créés par simple nom d'utilisateur.
- **Fil de discussion identique aux annonces du club** : messages avec auteur et date, réponses indentées en fil de discussion, réactions (👍 like, 👎 dislike, ❤️ coup de cœur) avec compteurs, pièces jointes (image/fichier), suppression par l'auteur ou un organisateur. Réutilise directement le mécanisme de réactions déjà construit pour les annonces (même table, juste un type de cible supplémentaire), pour éviter toute duplication.

## Corrections — Bénévoles et Sauvegarde

Exécutez `supabase/migration_correction_droits_benevoles.sql` et `supabase/migration_lecture_admin_sauvegarde_v2.sql`.

- **Correction d'un bug bloquant l'inscription à un poste de bénévoles** : les droits de lecture et d'inscription n'étaient pas cohérents (un organisateur sans le droit "Bénévoles tournoi" explicitement coché ne pouvait pas s'inscrire lui-même, alors qu'il pouvait voir la page). Alignés désormais sur la même règle.
- **Sauvegarde mise à jour** : la page `sauvegarde.html` couvre maintenant aussi les tables ajoutées depuis sa création (commentaires et réactions des annonces, postes/inscriptions bénévoles, discussion des tournois), avec la garantie de lecture complète pour l'admin étendue à ces nouvelles tables.

## Bénévoles — accès public sans connexion + gestion complète

Exécutez `supabase/migration_benevoles_public_et_gestion.sql`.

- **La page `tournoi-benevoles.html` est désormais accessible sans authentification** — c'est la seule page du site conçue pour être ouverte à des visiteurs sans compte (utile pour recruter des bénévoles au-delà des seuls membres inscrits sur le site). Un lien "Devenir bénévole" a été ajouté sur la page d'accueil, section Tournoi.
- **Inscription et fil de discussion accessibles à tous**, avec ou sans compte : un simple champ "Nom et prénom" (ou "Votre nom" pour un message de discussion) suffit pour un visiteur non connecté.
- **Limite assumée** : les réactions (👍👎❤️) restent réservées aux comptes connectés, une identité stable étant nécessaire pour appliquer la règle "une seule réaction par personne" — un visiteur anonyme voit les réactions existantes mais ne peut pas cliquer dessus.
- **Désinscription** : une personne connectée peut se désinscrire elle-même à tout moment ; une inscription anonyme ne peut être retirée que par un organisateur (aucune identité stable à vérifier côté serveur pour un visiteur sans compte).
- **Gestion complète par les organisateurs** (droits "Tournois - Administration" ou "Tournois - Gestion") sur chaque poste : ajout manuel d'un bénévole (même sans compte, ex. quelqu'un recruté par téléphone), modification du nom affiché d'une inscription existante, suppression de n'importe quelle inscription.
- Sécurité : les pièces jointes du chat tournoi partagent le même espace de stockage privé que les annonces du club, mais avec un accès public strictement limité aux fichiers du tournoi (préfixe technique dédié) — les pièces jointes des annonces du club restent, elles, réservées aux membres.

## Correction — le profil admin doit avoir les droits d'organisateur sur les bénévoles

Exécutez `supabase/migration_admin_organisateur_benevoles.sql`.

Le profil admin (droit "administration") n'avait pas les mêmes capacités que "Tournois - Administration"/"Tournois - Gestion" sur la page Bénévoles (gérer les postes, modifier/supprimer une inscription, ajouter un bénévole manuellement) — ces deux catégories de droits étaient vérifiées séparément par erreur. Corrigé : un admin a maintenant systématiquement les mêmes capacités d'organisateur sur cette page, sans avoir besoin de cocher en plus les droits tournoi spécifiques.

## Correction — accès au tournoi actif depuis la page Bénévoles

Exécutez `supabase/migration_tournois_lecture_publique.sql`.

La table `tournois` était restreinte aux profils ayant des droits tournoi spécifiques (tournois_admin/gestion/émargement), ce qui empêchait la page Bénévoles (accessible sans connexion) de savoir quel tournoi est actif pour un visiteur non connecté ou un membre sans ces droits précis — la page affichait "Aucun tournoi en cours" à tort. La lecture de cette table (nom, statut, nombre de terrains — rien de sensible) est désormais ouverte à tous.

## Correction — droit UPDATE manquant sur les inscriptions bénévoles

Exécutez `supabase/migration_droit_update_inscriptions_benevoles.sql`.

La migration initiale des bénévoles accordait select/insert/delete sur `benevoles_inscriptions`, mais oubliait le droit update — nécessaire pour modifier le nom d'une personne déjà inscrite. La règle de sécurité (RLS) elle-même était correcte, mais sans ce droit de base, Postgres bloquait l'opération avant même de la vérifier ("permission denied", différent d'un refus de règle de sécurité).

## Suivi des connexions (page `suivi-connexions.html`)

Exécutez `supabase/migration_suivi_connexions.sql`.

Réservée au profil administrateur. Journalise automatiquement chaque tentative de connexion (réussie ou échouée) : identifiant utilisé, date/heure, appareil/navigateur, motif en cas d'échec — utile pour repérer une activité suspecte ou vérifier qui utilise le site.

- **KPI en un coup d'œil** : total, réussies, échouées.
- **Recherche par identifiant**, filtres Réussies/Échouées.
- **Purge en un clic** des entrées de plus de 90 jours, pour ne pas conserver ces données indéfiniment.
- **Non collecté volontairement** : l'adresse IP (nécessiterait un service tiers externe, pour un intérêt limité face à la sensibilité de cette donnée sur un site de club).

## Suivi des visites sur les pages sans connexion requise

Exécutez `supabase/migration_suivi_visites_publiques.sql`.

Complète le suivi des connexions : journalise aussi automatiquement les visites sur les pages accessibles sans compte (accueil, demande d'inscription publique, bénévoles, connexion/inscription, réinitialisation de mot de passe, politique de confidentialité). Visible sur la même page `suivi-connexions.html`, avec une répartition par page en un coup d'œil, un journal détaillé (date, provenance, appareil), et une purge en un clic des entrées de plus de 90 jours.

Technique : un petit script autonome (`js/visite-log.js`), indépendant de `auth.js`/`main.js`, ajouté sur ces 6 pages spécifiquement (certaines d'entre elles ne chargent pas ces fichiers).

## Nouveau droit de page : Tournois - Inscriptions

Nouveau droit de page dédié à `tournoi-inscriptions.html` (Admin → Profils), qui reposait jusqu'ici uniquement sur "Tournois - Administration"/"Tournois - Gestion". Permet de déléguer uniquement la gestion des équipes inscrites et des poules à quelqu'un, sans lui donner accès à la création de tournois, la planification ou l'émargement.

## Audit de la procédure de sauvegarde

Vérification complète : les 21 tables du modèle de données sont confirmées toutes couvertes par `sauvegarde.html`, dans un ordre respectant toutes les dépendances entre tables (clés étrangères) — aucune table manquante, aucune correction nécessaire. La documentation (page et Word) a été mise à jour avec le nouveau droit de page.

## Correction — le droit "Tournois - Inscriptions" ne donnait pas accès aux données

Exécutez `supabase/migration_droit_tournois_inscriptions_rls.sql`.

Le nouveau droit de page avait été ajouté côté affichage (menu, accès à la page) mais pas dans les règles de sécurité protégeant les données elles-mêmes (types de compétition, compétitions du tournoi, équipes) — un profil n'ayant que ce droit voyait la page mais aucune donnée. Corrigé : ces 3 tables reconnaissent désormais aussi ce droit.

## Rattachement automatique de l'espace membre à la validation d'une inscription

Exécutez `supabase/migration_espace_membre_auto.sql`.

**Contrainte technique importante** : il est impossible de créer un vrai compte de connexion pour quelqu'un depuis le navigateur (nécessiterait la clé secrète serveur, mise de côté à deux reprises pour la suppression de compte et la réinitialisation de mot de passe) — et ce n'est de toute façon pas souhaitable, la personne doit toujours choisir elle-même son mot de passe. La solution retenue : relier automatiquement l'inscription au compte existant de la personne.

- **Au moment de la validation** : si la personne a déjà un compte sur le site (même email), rattachement immédiat et élévation au profil "membre" (jamais de rétrogradation si elle est déjà bureau/admin).
- **Rattachement différé** : si elle n'a pas encore de compte, le rattachement se fait automatiquement le jour où elle en crée un avec la même adresse email — aucune action supplémentaire nécessaire.
- **Rattrapage** : bouton "Relier automatiquement les comptes existants" sur inscriptions.html, pour traiter en une fois les inscriptions déjà validées avant cette fonctionnalité.
- **Nouvelle section "Mes informations"** sur membres.html, entre "Mon compte" et les annonces : affiche la saison, le statut de l'inscription, la catégorie, la pratique, la cotisation, et la validité du certificat médical de la personne connectée (si une inscription lui est reliée).
- Une personne peut désormais lire sa propre inscription (nouvelle règle de sécurité dédiée), sans accès aux inscriptions des autres.

Documentation mise à jour (page + Word), avec au passage la correction d'un oubli : la section "Espace membres" n'avait jamais été actualisée depuis la refonte du fil d'actualité des annonces (commentaires, réactions, pièces jointes).

## Rattachement manuel d'une inscription à un compte existant

Exécutez `supabase/migration_rattachement_manuel_inscription.sql`.

Mode plus simple que le rattachement automatique par email : sur chaque demande d'inscription (page inscriptions.html), le bureau/admin peut désormais choisir un compte existant dans une liste déroulante et cliquer "Rattacher" — l'inscription est reliée à ce compte, et son profil est élevé à "membre" (jamais de rétrogradation si déjà bureau/admin). Un bouton "Délier" permet d'annuler un rattachement fait par erreur. La section "Mes informations" sur membres.html (déjà en place) fonctionne automatiquement dès qu'un rattachement — manuel ou automatique — est effectué.

## Corrections — colonne manquante + validation trop stricte

Exécutez `supabase/migration_correction_colonne_user_id_manquante.sql`.

- **Colonne `user_id` manquante** : la migration qui la créait avait été mise de côté lors du passage au rattachement manuel, alors qu'elle reste indispensable dans les deux approches — d'où l'erreur "column user_id does not exist" lors du rattachement.
- **Validation d'inscription trop stricte** : le contrôle sur "Cotisation payée" attendait une valeur précise ("Oui"/true), alors que ce champ peut être un choix parmi plusieurs valeurs (ex. mode de paiement), où "Non" signifie non payé et n'importe quelle autre valeur signifie payé. La règle est désormais : payé si la valeur est renseignée et différente de "Non" (peu importe la casse).

## Correction — "Relié à : compte inconnu" au chargement de la page

Bug d'ordre de chargement : la liste des comptes existants se chargeait après le tableau des inscriptions, donc au premier affichage de la page, toute inscription déjà reliée à un compte affichait "compte inconnu" (la correspondance n'avait pas encore les données pour s'afficher correctement). Corrigé en inversant l'ordre de chargement.

## Correction — incohérence "Cotisation payée" entre inscriptions.html et membres.html

- **Cause du bug** : `membres.html` affichait "✅ Payée" dès que le champ était non vide — y compris pour la valeur littérale "Non", qui est une chaîne de texte non vide donc considérée "vraie" par un simple test JavaScript. `inscriptions.html`, elle, appliquait déjà la bonne règle. Résultat : une même fiche pouvait afficher "payée" sur une page et "non payée" sur l'autre.
- **Correction** : la règle ("payé" = renseigné et différent de "Non", peu importe la casse) est désormais centralisée dans `auth.js` (chargé par les deux pages), pour garantir qu'inscriptions.html et membres.html appliquent toujours exactement la même logique.

## Émargement — bandeau du haut compacté sur mobile

Le bandeau du haut de emargement.html (cotisation/présents/réglé + recherche + filtre absents) prenait beaucoup trop de place sur mobile, en restant fixé en haut d'écran en permanence. Condensé en 2 lignes compactes au lieu de 5+ : les 3 indicateurs tiennent maintenant sur une seule ligne (libellés courts), et la recherche + le bouton "Absents" sont côte à côte au lieu d'être empilés. Le bandeau reste "collé" en haut pendant le défilement (pratique pour rechercher un joueur en pleine liste), mais occupe une fraction de l'espace qu'avant, laissant beaucoup plus de place aux données en dessous.

## Émargement — boutons Présent/Absent/Payée sans défilement horizontal sur mobile

Les 3 boutons de bascule par joueur (Présent/Absent/Payée) pouvaient forcer un défilement horizontal sur mobile malgré le passage à la ligne prévu. Corrigé en profondeur : sur mobile, ces 3 boutons deviennent des carrés icône-seule (✓ / ✗ / 💰) de largeur égale, garantis de tenir sur une seule ligne quelle que soit la largeur d'écran — plus de texte à faire tenir, plus de risque de débordement. Le texte complet (Présent/Absent/Payée) reste affiché normalement sur PC. Une sécurité supplémentaire (largeur de tableau figée) empêche aussi le tableau HTML sous-jacent d'imposer une largeur minimale qui forcerait un défilement.

## Audit fonctionnel et technique du site + corrections

Exécutez `supabase/migration_nettoyage_reactions_orphelines.sql`.

Aucune faille de sécurité détectée. Corrections apportées suite à l'audit :

- **Requête sans limite corrigée** : le fil d'actualité des annonces (membres.html) chargeait toutes les annonces depuis la création du club, sans limite — plafonné à 100 désormais.
- **Fonctions dupliquées centralisées** : `formatDate` et `estImage` existaient en double dans membres.js et tournoi-benevoles.js (même risque de divergence que le bug "cotisation payée" précédent) — centralisées dans auth.js.
- **Nettoyage automatique des réactions orphelines** : supprimer une annonce, un commentaire ou un message de tournoi supprime désormais aussi les réactions (👍👎❤️) qui lui étaient liées, via des déclencheurs SQL. Un nettoyage ponctuel retire aussi les réactions déjà orphelines accumulées avant cette migration.
- **Documentation** : date de mise à jour actualisée, nouvelle sous-section sur ce mécanisme de nettoyage.

**Pistes identifiées mais non traitées** (améliorations, pas des bugs) : optimisation mobile de planning.html/poules.html/phase-finale.html/admin.html (non encore revues dans cette conversation) ; purge des journaux de connexion/visites toujours manuelle (l'automatiser nécessiterait la même infrastructure serveur que la fonction Edge déjà évoquée et mise de côté).

## Optimisation mobile globale du site

Suite à l'audit précédent, revue mobile des pages restantes.

- **planning.html** (la page la plus dense du site, 13 colonnes avec saisie de score en direct) : colonnes regroupées en 6 blocs compacts (Match, Équipes, Terrain/Statut, Scores, Horaires, Action), affichés en carte empilée sur mobile — tout reste directement modifiable. Au passage, factorisation d'une grosse duplication de code entre les vues Poule et Phase finale (logique de calcul d'état d'un match).
- **poules.html** : classement et détail des matchs par poule passent au même motif "fiche dépliable au tap" déjà utilisé sur les autres tableaux du site (nom cliquable, reste replié par défaut).
- **phase-finale.html** : déjà correctement pensée pour mobile (affichage en colonnes par tour avec défilement horizontal volontaire — comportement standard pour un tableau à élimination directe, aucune correction nécessaire).
- **admin.html** (Profils et Utilisateurs) : les deux tableaux passent en cartes empilées sur mobile (contenu trop varié — cases à cocher multiples, champs, actions — pour le motif "nom cliquable" ; tout reste visible directement sans avoir à déplier).
- **documentation.html, sauvegarde.html, suivi-connexions.html** : tableaux principalement composés de texte descriptif, qui s'enroule naturellement dans les cellules — laissés tels quels (déjà fonctionnels, filet de sécurité de défilement en place si besoin).

## Planning — correction : chaque match sur une seule ligne en PC

Correction d'une régression introduite par le regroupement de colonnes précédent : le contenu de chaque bloc (équipes, scores, horaires...) s'empilait verticalement même sur grand écran, ce qui allongeait chaque ligne au lieu de la compacter. Désormais : sur PC, tout le contenu d'un match tient sur une seule ligne horizontale compacte (padding réduit), pour afficher le maximum de matchs possible sans défilement. L'empilement vertical reste réservé au mobile, où il reste nécessaire.

## Planning — refonte du tableau des matchs et bandeau du haut compacté

Retour à un tableau à colonnes classiques (dense, une ligne par match sur PC — comme les tableaux historiques du site), après que l'approche par blocs regroupés se soit montrée peu fiable. Sur mobile, la 1ère colonne (identité du match) se déplie au tap pour révéler le reste, motif déjà éprouvé sur inscriptions.html/tournois.html/tournoi-inscriptions.html — appliqué ici aussi à poules.html au passage.

- **Bandeau du haut compacté** : le bouton "Générer / régénérer" (avec le choix de compétition) est désormais sur la même ligne que les 3 filtres (Planning complet / Matchs en cours / Matchs possibles), aligné à droite, au lieu d'une sous-section séparée avec son propre titre et paragraphe.
- **Bandeau toujours visible** : ce bandeau (réglages, terrains, top 5, filtres) reste collé en haut de l'écran pendant le défilement de la liste des matchs, comme sur emargement.html.
- **Un maximum de matchs visibles** : le tableau à colonnes classiques est naturellement dense sur PC — plus besoin d'astuce de mise en page pour ça, c'est le comportement par défaut d'un tableau HTML.

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
