# CLAUDE.md — règles du projet (site du club TBK)

Site du club TBK (badminton et tennis de table, Kersaint-Plabennec) : pages statiques HTML/CSS/JS publiées par **GitHub Pages** (branche `main`), avec un backend **Supabase** (base Postgres, authentification, RLS, Edge Functions).

Tout le contenu destiné aux utilisateurs (textes, messages, documentation, descriptions de PR) est **en français**.

## Fichiers intouchables

- **`js/supabase-config.js`** : ne jamais l'écraser, le modifier ni le supprimer. Il contient l'URL et la clé anon du projet Supabase de production.
- **`.github/workflows/keepalive.yml`** : ne jamais l'écraser ni le supprimer. Il empêche la mise en pause du projet Supabase.
- `TBK_Documentation_fonctionnelle.docx`, `__ INFOS ___.txt`, `Prompt creation gestion tournoi.txt` : documents personnels du responsable du site. Ne pas y toucher sans son accord.

## Livraison

- Une évolution = une branche `claude/<sujet>` créée depuis `origin/main` = une pull request. Le responsable relit et fusionne lui-même. Ne jamais pousser directement sur `main`.
- La description de la PR liste : ce qui change, les pages concernées, **les scripts SQL à exécuter dans Supabase (dans l'ordre)**, et les vérifications à faire après fusion. Si aucun script n'est nécessaire, l'écrire explicitement.
- La fusion sur `main` publie automatiquement le site. Les migrations SQL, elles, ne s'exécutent pas automatiquement : le responsable les lance dans l'éditeur SQL de Supabase.

## Conventions de code

- **Version de cache** : chaque livraison qui modifie du CSS ou du JS incrémente le suffixe `?v=AAAAMMJJx` (exemple : `20260928d`) dans **tous** les fichiers `.html`, avec la même valeur partout.
- **Échappement** : toute donnée affichée en HTML passe par `escapeHtml` (défini dans `js/auth.js`).
- **Nouvelle page à accès restreint** : l'ajouter à `PAGE_CATALOG` (`js/admin.js`) pour les droits, à `TOOL_LINKS` (`js/auth.js`) pour le menu, et ses tables à `TABLES` (`js/sauvegarde.js`) pour la sauvegarde.
- **Pages PC** : quand une demande ne vise que le mobile, l'affichage PC doit rester identique.
- Pas d'outil de compilation : JS natif dans le navigateur, client Supabase chargé depuis le CDN jsDelivr avec une version figée.

## Migrations SQL (`supabase/`)

- Additives et **ré-exécutables** sans risque : `create table if not exists`, `add column if not exists`, `create or replace function`, `drop policy if exists` puis `create policy`.
- Activer la RLS sur toute nouvelle table. Les droits passent par `current_user_has_access('<page>')` et `is_admin()` (fonctions `security definer`).
- Terminer par `notify pgrst, 'reload schema';` pour que l'API prenne en compte les changements immédiatement, puis éventuellement par une requête de contrôle.
- Ne jamais supprimer de données existantes sans demande explicite.
- Edge Functions : `supabase/functions/` (HelloAsso).

## Vérifications avant chaque PR

- `node --check` sur chaque fichier JS modifié.
- Validation de la structure HTML des pages modifiées (balises bien fermées).
- Test dans un navigateur (Playwright/Chromium) **sur PC et sur mobile** (390 px de large) : aucune erreur JS dans la console, aucun débordement horizontal, et fonctionnement réel du parcours modifié.
- Non-régression des autres pages.

## Documentation

Chaque évolution met à jour :
- `documentation.html` : documentation fonctionnelle du site, destinée aux utilisateurs ;
- `CHANGELOG.md` : entrée ajoutée **en fin de fichier**, avec les migrations SQL associées.
