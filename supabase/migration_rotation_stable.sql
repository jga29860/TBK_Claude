-- ============================================================
-- TBK — Rend le regroupement en rotations stable dans le temps.
-- Jusqu'ici, "Rotation N" était recalculé à chaque affichage de la
-- page, ce qui pouvait faire "bouger" des matchs d'une rotation à
-- l'autre au fil du tournoi (à chaque match lancé, le calcul
-- d'équité se refaisait sur l'ensemble des matchs restants).
-- Le numéro de rotation est désormais enregistré une bonne fois
-- pour toutes lors de la génération des matchs.
-- ============================================================

alter table public.matchs add column if not exists rotation integer;
