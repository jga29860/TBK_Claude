-- ============================================================
-- TBK — Corrige une incohérence dans les droits d'inscription aux
-- postes de bénévoles : la lecture autorisait "benevoles" OU
-- "tournois_admin" OU "tournois_gestion", mais l'inscription
-- n'autorisait que "benevoles" seul — un organisateur sans ce
-- droit explicite ne pouvait donc pas s'inscrire lui-même.
-- ============================================================

drop policy if exists "benevoles_inscriptions_creation" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_creation"
  on public.benevoles_inscriptions for insert
  with check (
    user_id = auth.uid()
    and (
      public.current_user_has_access('benevoles')
      or public.current_user_has_access('tournois_admin')
      or public.current_user_has_access('tournois_gestion')
    )
  );
