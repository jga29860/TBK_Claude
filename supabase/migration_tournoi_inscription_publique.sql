-- ============================================================
-- TBK — Inscription publique au tournoi (nouvelle page, ouverte à
-- tous sans connexion) : les joueurs se déclarent eux-mêmes par
-- équipe (2 joueurs pour une compétition double, 1 seul en simple),
-- avec nom, prénom, club, niveau et affiliation fédérale. La demande
-- reste "en attente" jusqu'à validation, refus, ou remise en attente
-- par un profil Tournois - Administration.
-- ============================================================

-- 1. Date du tournoi, à côté du nombre de terrains
alter table public.tournois
  add column if not exists date_tournoi date;

-- 2. Nouvelles colonnes sur les équipes : statut de la demande +
--    niveau/affiliation fédérale par joueur (en plus des colonnes
--    déjà existantes joueur1_nom/club, joueur2_nom/club)
alter table public.equipes
  add column if not exists statut text not null default 'validee'
    check (statut in ('en_attente', 'validee', 'refusee')),
  add column if not exists joueur1_niveau text
    check (joueur1_niveau is null or joueur1_niveau in ('Débutant', 'Intermédiaire', 'Confirmé')),
  add column if not exists joueur1_fede boolean,
  add column if not exists joueur2_niveau text
    check (joueur2_niveau is null or joueur2_niveau in ('Débutant', 'Intermédiaire', 'Confirmé')),
  add column if not exists joueur2_fede boolean;

-- Les équipes déjà existantes (toutes saisies par le bureau jusqu'ici)
-- sont considérées validées d'office — seules les nouvelles demandes
-- soumises via le formulaire public démarrent "en attente" (valeur
-- par défaut ci-dessus, explicitement forcée à l'insertion publique).

-- 3. Un visiteur non connecté doit pouvoir soumettre une demande
--    d'inscription au tournoi (statut "en_attente" uniquement, jamais
--    déjà validée ou refusée)
grant select, insert on public.equipes to anon;

drop policy if exists "equipes_soumission_publique" on public.equipes;
create policy "equipes_soumission_publique"
  on public.equipes for insert
  with check (statut = 'en_attente');

-- 4. Le formulaire public doit pouvoir lire les compétitions du
--    tournoi actif pour proposer un choix (déjà ouvert en lecture
--    publique par une migration précédente : tournoi_competitions,
--    types_competition, tournois — rien à modifier ici).
