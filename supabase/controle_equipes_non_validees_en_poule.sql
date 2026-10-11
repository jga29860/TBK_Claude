-- ============================================================
-- TBK — Contrôle (et correction) : demandes non validées placées en poule
--
-- Avant le correctif du lot A, « Répartir automatiquement en poules »
-- plaçait aussi en poule les demandes en attente ou refusées. Ce script :
--   1. LISTE les équipes concernées et les matchs générés pour elles ;
--   2. les RETIRE des poules (étape 2, à exécuter seulement si l'étape 1
--      renvoie des lignes).
-- Si des matchs leur ont été attribués, régénérez ensuite le planning
-- depuis la page Planning (administrateur), ou supprimez ces matchs.
-- Ne modifie aucune équipe validée.
-- ============================================================

-- Étape 1 — vérification (lecture seule)
select t.nom as tournoi, tc.id as competition, e.joueur1_nom, e.joueur2_nom, e.statut, e.poule,
       (select count(*) from public.matchs m where m.equipe1_id = e.id or m.equipe2_id = e.id) as nb_matchs
from public.equipes e
join public.tournoi_competitions tc on tc.id = e.tournoi_competition_id
join public.tournois t on t.id = tc.tournoi_id
where e.poule is not null
  and e.statut in ('en_attente', 'refusee')
order by t.nom, e.poule;

-- Étape 2 — correction (décommentez les 4 lignes ci-dessous pour l'exécuter)
-- update public.equipes
-- set poule = null, tete_de_poule = false
-- where poule is not null
--   and statut in ('en_attente', 'refusee');
