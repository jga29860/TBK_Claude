-- ============================================================
-- TBK — Le nouveau droit de page "tournois_inscriptions" avait été
-- ajouté côté affichage (menu, accès à la page), mais pas dans les
-- règles de sécurité qui protègent les données elles-mêmes
-- (équipes, compétitions du tournoi). Un profil n'ayant que ce
-- droit voyait donc la page, mais aucune donnée.
-- ============================================================

drop policy if exists "types_competition_lecture" on public.types_competition;
create policy "types_competition_lecture"
  on public.types_competition for select
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
  );

drop policy if exists "tournoi_competitions_acces" on public.tournoi_competitions;
create policy "tournoi_competitions_acces"
  on public.tournoi_competitions for all
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
  )
  with check (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
  );

drop policy if exists "equipes_acces" on public.equipes;
create policy "equipes_acces"
  on public.equipes for all
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
  )
  with check (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
  );
