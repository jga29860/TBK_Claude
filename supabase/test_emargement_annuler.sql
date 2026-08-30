-- ============================================================
-- TBK — Annule le test d'émargement : remet "présent" et
-- "cotisation payée" à leur état par défaut (absent, non payé)
-- pour tous les joueurs inscrits au tournoi EN COURS.
-- ============================================================

update public.equipes e
set
  joueur1_present = false,
  joueur1_absent = true,
  joueur1_cotisation_payee = false,
  joueur2_present = case when e.joueur2_nom is not null then false else e.joueur2_present end,
  joueur2_absent = case when e.joueur2_nom is not null then true else e.joueur2_absent end,
  joueur2_cotisation_payee = case when e.joueur2_nom is not null then false else e.joueur2_cotisation_payee end
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
