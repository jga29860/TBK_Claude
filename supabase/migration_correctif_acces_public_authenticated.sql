-- ============================================================
-- TBK — Correctif systémique : plusieurs règles "ouvertes au public"
-- ciblaient explicitement "to anon" (visiteur non connecté
-- uniquement), au lieu de s'appliquer à tout le monde. Une personne
-- connectée sans droit tournoi/bureau spécifique retombait alors sur
-- l'ancienne règle plus restrictive, et se retrouvait bloquée là où
-- un simple visiteur non connecté, lui, avait accès.
--
-- Même correctif que pour equipes/matchs/tournoi_competitions/
-- types_competition (voir migration_correctif_lecture_poules_finale_membres.sql),
-- étendu à toutes les autres pages publiques du site : bénévoles,
-- messages de tournoi (+ pièces jointes), et les 2 formulaires
-- publics (inscription saison, inscription tournoi).
-- ============================================================

-- 1. Bénévoles — lecture des postes et des inscriptions
grant select on public.benevoles_postes to authenticated;
drop policy if exists "benevoles_postes_lecture_anon" on public.benevoles_postes;
create policy "benevoles_postes_lecture_anon"
  on public.benevoles_postes for select
  using (true);

grant select, insert on public.benevoles_inscriptions to authenticated;
drop policy if exists "benevoles_inscriptions_lecture_anon" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_lecture_anon"
  on public.benevoles_inscriptions for select
  using (true);

-- Pas de changement sur l'insertion : une règle dédiée aux personnes
-- connectées (benevoles_inscriptions_creation) existe déjà, et gère
-- correctement le cas "je m'inscris moi-même" (user_id = auth.uid()) —
-- l'ouvrir davantage ici aurait permis à n'importe quel compte
-- d'insérer une ligne pour n'importe qui, une régression de sécurité.

-- 2. Messages du tournoi (chat) — lecture
grant select on public.tournoi_messages to authenticated;
drop policy if exists "tournoi_messages_lecture_anon" on public.tournoi_messages;
create policy "tournoi_messages_lecture_anon"
  on public.tournoi_messages for select
  using (true);

-- 3. Pièces jointes des messages de tournoi (stockage)
drop policy if exists "annonces_fichiers_lecture_anon_tournoi" on storage.objects;
create policy "annonces_fichiers_lecture_anon_tournoi"
  on storage.objects for select
  using (bucket_id = 'annonces-fichiers' and name like 'tournoi-%');

drop policy if exists "annonces_fichiers_ecriture_anon_tournoi" on storage.objects;
create policy "annonces_fichiers_ecriture_anon_tournoi"
  on storage.objects for insert
  with check (bucket_id = 'annonces-fichiers' and name like 'tournoi-%');

-- 4. Formulaire public d'inscription à la saison : champs
--    personnalisés et barème de cotisation, nécessaires pour afficher
--    le formulaire et calculer le montant, même pour un membre
--    connecté n'ayant pas le droit bureau "inscriptions"
grant select on public.inscription_champs to authenticated;
drop policy if exists "champs_lecture_publique" on public.inscription_champs;
create policy "champs_lecture_publique"
  on public.inscription_champs for select
  using (true);

grant select on public.bareme_cotisations to authenticated;
drop policy if exists "bareme_lecture_publique" on public.bareme_cotisations;
create policy "bareme_lecture_publique"
  on public.bareme_cotisations for select
  using (true);

-- 5. Soumission du formulaire public d'inscription à la saison, pour
--    un membre connecté sans droit bureau (déjà ouvert aux visiteurs
--    non connectés)
grant insert on public.inscriptions to authenticated;
drop policy if exists "inscriptions_soumission_publique" on public.inscriptions;
create policy "inscriptions_soumission_publique"
  on public.inscriptions for insert
  with check (statut = 'en_attente' and valide_par is null and valide_le is null);

-- 6. Soumission du formulaire public d'inscription au tournoi, pour
--    un membre connecté sans droit bureau (déjà ouvert aux visiteurs
--    non connectés)
grant insert on public.equipes to authenticated;
drop policy if exists "equipes_soumission_publique" on public.equipes;
create policy "equipes_soumission_publique"
  on public.equipes for insert
  with check (statut = 'en_attente');
