-- ============================================================
-- TBK — Corrige l'accès à la table "tournois" pour la page
-- Bénévoles (accessible sans connexion) : il faut pouvoir savoir
-- quel est le tournoi actif sans avoir de droit tournoi spécifique.
-- Aucune donnée sensible dans cette table (nom, statut, nombre de
-- terrains, cotisation...) : ouverture en lecture sans risque.
-- ============================================================

grant select on public.tournois to anon;

drop policy if exists "tournois_lecture_publique" on public.tournois;
create policy "tournois_lecture_publique"
  on public.tournois for select
  using (true);
