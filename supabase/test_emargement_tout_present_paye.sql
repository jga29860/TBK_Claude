-- ============================================================
-- TBK — Script de TEST : simule l'émargement de tous les joueurs
-- inscrits au tournoi EN COURS (présents + cotisation payée).
-- Ne touche que les équipes du tournoi actif, quelle que soit
-- la compétition ou la poule.
-- ============================================================

update public.equipes e
set
  joueur1_present = true,
  joueur1_absent = false,
  joueur1_cotisation_payee = true,
  joueur2_present = case when e.joueur2_nom is not null then true else e.joueur2_present end,
  joueur2_absent = case when e.joueur2_nom is not null then false else e.joueur2_absent end,
  joueur2_cotisation_payee = case when e.joueur2_nom is not null then true else e.joueur2_cotisation_payee end
from public.tournoi_competitions tc
join public.tournois t on t.id = tc.tournoi_id
where e.tournoi_competition_id = tc.id
  and t.statut = 'en_cours';

-- Petit résumé pour vérifier immédiatement le résultat
select
  count(*) as nb_equipes_traitees,
  count(*) filter (where joueur1_present) as joueur1_presents,
  count(*) filter (where joueur1_cotisation_payee) as joueur1_payes
from public.equipes e
join public.tournoi_competitions tc on tc.id = e.tournoi_competition_id
join public.tournois t on t.id = tc.tournoi_id
where t.statut = 'en_cours';
