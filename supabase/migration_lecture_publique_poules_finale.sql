-- ============================================================
-- TBK — Accès public en lecture (sans connexion, ET pour toute
-- personne connectée quel que soit son profil) aux pages Phase
-- Poule et Phase finale, pour permettre leur consultation via QR
-- code sans authentification au site. Aucune écriture autorisée
-- pour les visiteurs anonymes sur ces 4 tables : lecture seule.
-- ============================================================

grant select on public.equipes to anon, authenticated;
grant select on public.matchs to anon, authenticated;
grant select on public.tournoi_competitions to anon, authenticated;
grant select on public.types_competition to anon, authenticated;

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
