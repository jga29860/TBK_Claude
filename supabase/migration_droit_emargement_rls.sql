-- ============================================================
-- TBK — Le droit "tournois_emargement" donnait accès à la page
-- emargement.html côté affichage, mais les règles de sécurité qui
-- protègent les données (compétitions du tournoi, équipes) ne le
-- reconnaissaient pas. Un profil n'ayant que ce droit pouvait donc
-- voir la page, mais ni charger les compétitions, ni enregistrer la
-- présence/le paiement d'une équipe (rejeté silencieusement par la
-- base de données).
-- ============================================================

drop policy if exists "types_competition_lecture" on public.types_competition;
create policy "types_competition_lecture"
  on public.types_competition for select
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
    or public.current_user_has_access('tournois_emargement')
  );

drop policy if exists "tournoi_competitions_acces" on public.tournoi_competitions;
create policy "tournoi_competitions_acces"
  on public.tournoi_competitions for all
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
    or public.current_user_has_access('tournois_emargement')
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
    or public.current_user_has_access('tournois_emargement')
  )
  with check (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
    or public.current_user_has_access('tournois_emargement')
  );
