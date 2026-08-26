-- ============================================================
-- TBK — Étend la garantie de lecture complète pour l'admin (page
-- Sauvegarde) aux tables créées depuis la dernière mise à jour de
-- cette garantie : annonces_commentaires, annonces_reactions,
-- benevoles_postes, benevoles_inscriptions, tournoi_messages.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'annonces_commentaires', 'annonces_reactions',
    'benevoles_postes', 'benevoles_inscriptions', 'tournoi_messages'
  ]
  loop
    execute format('drop policy if exists "lecture_admin_sauvegarde" on public.%I;', t);
    execute format('create policy "lecture_admin_sauvegarde" on public.%I for select using (public.is_admin());', t);
  end loop;
end $$;
