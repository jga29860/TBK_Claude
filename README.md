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

## Tester en local avant publication

Ouvrez simplement `index.html` dans un navigateur, ou lancez un petit serveur local :
```bash
python3 -m http.server 8000
```
puis ouvrez `http://localhost:8000`.
