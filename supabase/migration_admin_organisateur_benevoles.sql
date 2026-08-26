-- ============================================================
-- TBK — Le profil admin (droit "administration") doit avoir les
-- mêmes capacités d'organisateur que "tournois_admin" / "tournois_gestion"
-- sur la gestion des bénévoles, sans avoir besoin de cocher ces droits
-- en plus.
-- ============================================================

drop policy if exists "benevoles_postes_lecture" on public.benevoles_postes;
create policy "benevoles_postes_lecture"
  on public.benevoles_postes for select
  using (
    public.current_user_has_access('benevoles')
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('administration')
  );

drop policy if exists "benevoles_postes_ecriture" on public.benevoles_postes;
create policy "benevoles_postes_ecriture"
  on public.benevoles_postes for all
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('administration')
  )
  with check (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('administration')
  );

drop policy if exists "benevoles_inscriptions_creation" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_creation"
  on public.benevoles_inscriptions for insert
  to authenticated
  with check (
    (user_id = auth.uid())
    or (
      user_id is null
      and (
        public.current_user_has_access('tournois_admin')
        or public.current_user_has_access('tournois_gestion')
        or public.current_user_has_access('administration')
      )
    )
  );

drop policy if exists "benevoles_inscriptions_maj" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_maj"
  on public.benevoles_inscriptions for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('administration')
  )
  with check (
    user_id = auth.uid()
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('administration')
  );

drop policy if exists "benevoles_inscriptions_suppression" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_suppression"
  on public.benevoles_inscriptions for delete
  using (
    user_id = auth.uid()
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('administration')
  );

drop policy if exists "tournoi_messages_suppression" on public.tournoi_messages;
create policy "tournoi_messages_suppression"
  on public.tournoi_messages for delete
  using (
    created_by = auth.uid()
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('administration')
  );
