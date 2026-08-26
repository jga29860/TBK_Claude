-- ============================================================
-- TBK — Bénévoles : accès public sans connexion + gestion complète
-- des inscriptions par les organisateurs (ajout manuel, modification,
-- suppression, y compris pour des personnes sans compte sur le site).
-- ============================================================

-- 1. user_id devient facultatif : une inscription "manuelle" (créée par
-- un organisateur, ou par un visiteur non connecté) a user_id = null.
alter table public.benevoles_inscriptions alter column user_id drop not null;

-- 2. Postes : lecture ouverte à tous, y compris sans connexion.
grant select on public.benevoles_postes to anon;
drop policy if exists "benevoles_postes_lecture_anon" on public.benevoles_postes;
create policy "benevoles_postes_lecture_anon"
  on public.benevoles_postes for select
  to anon
  using (true);

-- 3. Inscriptions : lecture ouverte à tous ; création ouverte à tous
-- (avec ou sans compte) tant qu'aucun user_id n'est usurpé ; modification/
-- suppression réservées à la personne elle-même (si connectée) ou à un
-- organisateur (dans tous les cas, y compris les entrées anonymes).
grant select, insert on public.benevoles_inscriptions to anon;

drop policy if exists "benevoles_inscriptions_lecture_anon" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_lecture_anon"
  on public.benevoles_inscriptions for select
  to anon
  using (true);

drop policy if exists "benevoles_inscriptions_creation_anon" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_creation_anon"
  on public.benevoles_inscriptions for insert
  to anon
  with check (user_id is null);

drop policy if exists "benevoles_inscriptions_creation" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_creation"
  on public.benevoles_inscriptions for insert
  to authenticated
  with check (
    (user_id = auth.uid())
    or (
      user_id is null
      and (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'))
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
  )
  with check (
    user_id = auth.uid()
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
  );

-- 4. Messages du tournoi (chat) : lecture et écriture ouvertes à tous,
-- avec ou sans compte (created_by = null pour un visiteur anonyme).
grant select, insert on public.tournoi_messages to anon;

drop policy if exists "tournoi_messages_lecture_anon" on public.tournoi_messages;
create policy "tournoi_messages_lecture_anon"
  on public.tournoi_messages for select
  to anon
  using (true);

drop policy if exists "tournoi_messages_creation_anon" on public.tournoi_messages;
create policy "tournoi_messages_creation_anon"
  on public.tournoi_messages for insert
  to anon
  with check (created_by is null);

drop policy if exists "tournoi_messages_creation" on public.tournoi_messages;
create policy "tournoi_messages_creation"
  on public.tournoi_messages for insert
  to authenticated
  with check (created_by = auth.uid());

-- 5. Réactions : réservées aux personnes connectées (nécessite une
-- identité stable pour la règle "une seule réaction par personne").
-- Rien à changer ici : les visiteurs anonymes ne réagissent pas,
-- seulement les membres connectés.

-- 6. Pièces jointes du chat tournoi : lecture/écriture ouvertes aux
-- visiteurs anonymes, mais UNIQUEMENT pour les fichiers du tournoi
-- (préfixe "tournoi-"), afin de ne jamais exposer publiquement les
-- pièces jointes des annonces du club, qui restent réservées aux membres.
drop policy if exists "annonces_fichiers_lecture_anon_tournoi" on storage.objects;
create policy "annonces_fichiers_lecture_anon_tournoi"
  on storage.objects for select
  to anon
  using (bucket_id = 'annonces-fichiers' and name like 'tournoi-%');

drop policy if exists "annonces_fichiers_ecriture_anon_tournoi" on storage.objects;
create policy "annonces_fichiers_ecriture_anon_tournoi"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'annonces-fichiers' and name like 'tournoi-%');
