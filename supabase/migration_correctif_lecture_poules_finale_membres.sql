-- ============================================================
-- TBK — Corrige un bug d'accès : les règles publiques sur equipes,
-- matchs, tournoi_competitions et types_competition (voir
-- migration_lecture_publique_poules_finale.sql) ciblaient
-- explicitement "to anon" (visiteur non connecté uniquement).
--
-- Une personne connectée (rôle "authenticated") ne bénéficiait donc
-- PAS de cette ouverture, et retombait sur l'ancienne règle plus
-- restrictive (droit tournois_admin/tournois_gestion requis) —
-- d'où des poules/une phase finale visibles pour un visiteur non
-- connecté, mais vides pour un membre du club sans droit tournoi.
--
-- Contrairement à ces 4 tables, la règle sur "tournois" (voir
-- migration_tournois_lecture_publique.sql) ne précise aucun rôle —
-- elle s'applique donc déjà à tout le monde, anon et authenticated
-- confondus, et n'est pas concernée par ce correctif.
-- ============================================================

grant select on public.equipes to authenticated;
grant select on public.matchs to authenticated;
grant select on public.tournoi_competitions to authenticated;
grant select on public.types_competition to authenticated;

drop policy if exists "equipes_lecture_publique" on public.equipes;
create policy "equipes_lecture_publique"
  on public.equipes for select
  using (true);

drop policy if exists "matchs_lecture_publique" on public.matchs;
create policy "matchs_lecture_publique"
  on public.matchs for select
  using (true);

drop policy if exists "tournoi_competitions_lecture_publique" on public.tournoi_competitions;
create policy "tournoi_competitions_lecture_publique"
  on public.tournoi_competitions for select
  using (true);

drop policy if exists "types_competition_lecture_publique" on public.types_competition;
create policy "types_competition_lecture_publique"
  on public.types_competition for select
  using (true);
