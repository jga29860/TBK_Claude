-- ============================================================
-- TBK — Garantit qu'un profil admin peut toujours TOUT lire,
-- indépendamment des autres droits de page cochés, pour que la
-- page Sauvegarde fonctionne de façon fiable et exhaustive.
-- Ces règles s'ajoutent aux règles existantes (elles ne les
-- remplacent pas : une ligne reste visible si UNE SEULE règle
-- l'autorise).
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'roles', 'invitations',
    'annonces_membres', 'parametres_site',
    'inscriptions', 'inscription_champs', 'bareme_cotisations', 'inscriptions_affichage',
    'types_competition', 'tournois', 'tournoi_competitions', 'equipes', 'matchs'
  ]
  loop
    execute format('drop policy if exists "lecture_admin_sauvegarde" on public.%I;', t);
    execute format('create policy "lecture_admin_sauvegarde" on public.%I for select using (public.is_admin());', t);
  end loop;
end $$;
